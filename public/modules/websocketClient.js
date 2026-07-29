/**
 * public/modules/websocketClient.js
 * Modular Audio Recording & Realtime WebSocket Integration Client
 *
 * Emits & Receives standard Event Bus events:
 *  - connection:connected / connection:lost
 *  - voice:listening / voice:volume / voice:stopped
 *  - ai:thinking / ai:speaking / ai:finished
 *  - error
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define(['./eventBus', './voiceStateManager'], factory);
    } else if (typeof module === 'object' && module.exports) {
        const eventBus = require('./eventBus');
        const voiceStateManager = require('./voiceStateManager');
        module.exports = factory(eventBus, voiceStateManager);
    } else {
        root.websocketClient = factory(root.eventBus, root.voiceStateManager);
    }
}(typeof self !== 'undefined' ? self : this, function (eventBus, voiceStateManager) {

    class WebSocketClient {
        constructor(bus = eventBus, stateMgr = voiceStateManager) {
            this.bus = bus;
            this.stateMgr = stateMgr;

            this.ws = null;
            this.mediaRecorder = null;
            this.audioStream = null;
            this.audioCtx = null;
            this.analyser = null;

            this.audioChunks = [];
            this.playQueue = [];
            this.currentAudio = null;

            this.isPlaying = false;
            this.callActive = false;

            this.vadFrame = null;
            this.silenceTimer = null;
            this.maxTimer = null;

            // Filter out distant room noise & speed up turn transitions
            this.SILENCE_THRESHOLD = 44;
            this.SILENCE_MS        = 450;

            // Automatically re-open microphone when turn transition returns state to 'Listening'
            if (this.bus) {
                this.bus.on('state:changed', (record) => {
                    if (record.currentState === 'Listening' && this.callActive && !this.isPlaying) {
                        setTimeout(() => this.openMic(), 100);
                    }
                });
            }
        }

        /**
         * Initialize WebSocket connection to /ws/voice
         */
        connect() {
            if (typeof window === 'undefined') return;

            const proto = location.protocol === 'https:' ? 'wss' : 'ws';
            const wsUrl = `${proto}://${location.host}/ws/live`;

            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                if (this.bus) this.bus.emit('connection:connected', { wsUrl });
            };

            this.ws.onmessage = ({ data }) => {
                let msg;
                try { msg = JSON.parse(data); } catch { return; }

                if (msg.type === 'transcript') {
                    if (this.bus) this.bus.emit('text:transcript', { text: msg.text });
                    if (msg.text) {
                        // Sync user's spoken voice prompt directly to Tutor Chat view
                        if (typeof window.addChatMessage === 'function') {
                            window.addChatMessage(msg.text, true);
                        }
                        if (typeof window.prepareAiChatBubble === 'function') {
                            window.prepareAiChatBubble();
                        }
                    } else {
                        this.openMic(); // empty speech -> open mic again
                    }
                }

                if (msg.type === 'text_chunk') {
                    if (this.bus) this.bus.emit('text:token', { token: msg.text });
                    // Stream AI response text live into Tutor Chat history view
                    if (typeof window.appendAiChatToken === 'function') {
                        window.appendAiChatToken(msg.text);
                    }
                }

                if (msg.type === 'audio_chunk' && msg.url) {
                    this.enqueueAudioPayload(msg.url);
                }

                if (msg.type === 'done') {
                    if (this.bus) this.bus.emit('assistant.finished');
                    if (typeof window.finalizeAiChatBubble === 'function') {
                        window.finalizeAiChatBubble();
                    }
                }

                if (msg.type === 'error') {
                    if (this.bus) this.bus.emit('assistant.error', { message: msg.message });
                    if (typeof window.finalizeAiChatBubble === 'function') {
                        window.finalizeAiChatBubble();
                    }
                    this.openMic();
                }
            };

            this.ws.onclose = () => {
                if (this.bus) this.bus.emit('connection.disconnected');
                if (this.callActive) setTimeout(() => this.connect(), 2000);
            };

            this.ws.onerror = (err) => {
                if (this.bus) this.bus.emit('assistant.error', { message: 'WebSocket connection error' });
            };
        }

        /**
         * Start Voice Assistant Call
         */
        async startCall() {
            if (this.callActive) return;
            this.callActive = true;
            this.connect();
            setTimeout(() => this.openMic(), 500);
        }

        /**
         * End Voice Assistant Call
         */
        endCall() {
            this.callActive = false;

            if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
                try { this.mediaRecorder.stop(); } catch {}
            }
            if (this.audioStream) {
                this.audioStream.getTracks().forEach(t => t.stop());
                this.audioStream = null;
            }
            if (this.audioCtx && this.audioCtx.state !== 'closed') {
                this.audioCtx.close();
                this.audioCtx = null;
            }
            if (this.ws) {
                try { this.ws.close(); } catch {}
                this.ws = null;
            }

            this.stopPlayback();
            if (this.bus) this.bus.emit('voice:stopped');
            if (this.stateMgr) this.stateMgr.reset();
        }

        /**
         * Open microphone with Voice Activity Detection (VAD)
         */
        async openMic() {
            if (!this.callActive || this.isPlaying) return;

            try {
                if (!this.audioStream) {
                    this.audioStream = await navigator.mediaDevices.getUserMedia({
                        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }
                    });
                }

                if (!this.audioCtx) {
                    this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                    const src = this.audioCtx.createMediaStreamSource(this.audioStream);
                    const filter = this.audioCtx.createBiquadFilter();
                    filter.type = 'highpass';
                    filter.frequency.value = 85;
                    this.analyser = this.audioCtx.createAnalyser();
                    this.analyser.fftSize = 2048;
                    src.connect(filter);
                    filter.connect(this.analyser);
                }

                this.audioChunks = [];
                this.hasSpeechDetected = false;
                const opts = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                    ? { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 128000 }
                    : { audioBitsPerSecond: 128000 };

                this.mediaRecorder = new MediaRecorder(this.audioStream, opts);
                this.mediaRecorder.ondataavailable = (e) => {
                    if (e.data.size > 0) this.audioChunks.push(e.data);
                };

                this.mediaRecorder.onstop = () => {
                    if (this.vadFrame) cancelAnimationFrame(this.vadFrame);
                    clearTimeout(this.silenceTimer);
                    clearTimeout(this.maxTimer);

                    if (!this.hasSpeechDetected || this.audioChunks.length === 0) {
                        this.openMic();
                        return;
                    }

                    if (this.bus) this.bus.emit('ai:thinking');

                    const blob = new Blob(this.audioChunks, { type: this.mediaRecorder.mimeType || 'audio/webm' });
                    const reader = new FileReader();
                    reader.onload = () => {
                        const b64 = reader.result.split(',')[1];
                        if (b64 && this.ws && this.ws.readyState === WebSocket.OPEN) {
                            this.ws.send(JSON.stringify({ type: 'audio', audioBase64: b64, mimeType: this.mediaRecorder.mimeType }));
                        } else {
                            this.openMic();
                        }
                    };
                    reader.readAsDataURL(blob);
                };

                this.mediaRecorder.start(100);
                if (this.bus) this.bus.emit('voice:listening');

                // VAD energy loop
                const freqData = new Uint8Array(this.analyser.frequencyBinCount);
                let speaking = false;

                const vadLoop = () => {
                    if (!this.mediaRecorder || this.mediaRecorder.state !== 'recording') return;
                    this.vadFrame = requestAnimationFrame(vadLoop);

                    this.analyser.getByteFrequencyData(freqData);
                    let sum = 0;
                    for (let i = 10; i < 120; i++) sum += freqData[i];
                    const rms = sum / 110;

                    // Emit volume for Liquid Blob & Equalizer
                    const normalizedVolume = Math.min(1.0, rms / 120);
                    if (this.bus) this.bus.emit('voice:volume', normalizedVolume);

                    if (rms > this.SILENCE_THRESHOLD) {
                        speaking = true;
                        this.hasSpeechDetected = true;
                        if (this.silenceTimer) { clearTimeout(this.silenceTimer); this.silenceTimer = null; }
                    } else if (speaking && !this.silenceTimer) {
                        this.silenceTimer = setTimeout(() => {
                            if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
                                this.mediaRecorder.stop();
                            }
                        }, this.SILENCE_MS);
                    }
                };

                vadLoop();

                this.maxTimer = setTimeout(() => {
                    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
                        this.mediaRecorder.stop();
                    }
                }, 15000);

            } catch (err) {
                if (this.bus) this.bus.emit('error', { message: 'Microphone permission error' });
            }
        }

        /**
         * Audio Queue Playback
         */
        enqueueAudioPayload(url) {
            if (!url) return;
            this.playQueue.push(url);
            if (!this.isPlaying) this.processAudioQueue();
        }

        async processAudioQueue() {
            if (this.playQueue.length === 0 || !this.callActive) {
                this.isPlaying = false;
                this.stopInterruptionListener();
                if (this.bus) this.bus.emit('ai:finished');
                return;
            }

            this.isPlaying = true;
            if (this.bus) this.bus.emit('ai:speaking');
            this.startInterruptionListener();

            const url = this.playQueue.shift();
            await new Promise((resolve) => {
                this.currentAudio = new Audio(url);
                this.currentAudio.onended = resolve;
                this.currentAudio.onerror = resolve;
                this.currentAudio.play().catch(resolve);
            });

            this.currentAudio = null;
            this.processAudioQueue();
        }

        /**
         * Real-time Background Mic Monitor during AI Speech (Auto Barge-in)
         */
        async startInterruptionListener() {
            if (this.interruptionFrame || !this.callActive) return;

            try {
                if (!this.audioStream) {
                    this.audioStream = await navigator.mediaDevices.getUserMedia({
                        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }
                    });
                }
                if (!this.audioCtx) {
                    this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                    const src = this.audioCtx.createMediaStreamSource(this.audioStream);
                    this.analyser = this.audioCtx.createAnalyser();
                    this.analyser.fftSize = 2048;
                    src.connect(this.analyser);
                }

                const freqData = new Uint8Array(this.analyser.frequencyBinCount);
                let highSpeechFrames = 0;

                const checkInterruption = () => {
                    if (!this.isPlaying || !this.callActive) {
                        this.stopInterruptionListener();
                        return;
                    }
                    this.interruptionFrame = requestAnimationFrame(checkInterruption);

                    this.analyser.getByteFrequencyData(freqData);
                    let sum = 0;
                    for (let i = 10; i < 120; i++) sum += freqData[i];
                    const rms = sum / 110;

                    // If student speaks while AI is talking (RMS > SILENCE_THRESHOLD + 6)
                    if (rms > (this.SILENCE_THRESHOLD + 6)) {
                        highSpeechFrames++;
                        if (highSpeechFrames >= 5) { // ~100ms of continuous student speech
                            this.stopInterruptionListener();
                            this.bargeIn();
                        }
                    } else {
                        highSpeechFrames = Math.max(0, highSpeechFrames - 1);
                    }
                };

                checkInterruption();
            } catch (err) {
                // Ignore background mic errors during playback
            }
        }

        stopInterruptionListener() {
            if (this.interruptionFrame) {
                cancelAnimationFrame(this.interruptionFrame);
                this.interruptionFrame = null;
            }
        }

        stopPlayback() {
            this.stopInterruptionListener();
            this.playQueue = [];
            if (this.currentAudio) {
                try { this.currentAudio.pause(); } catch {}
                this.currentAudio = null;
            }
            this.isPlaying = false;
        }

        /**
         * Voice Interruption (Barge-in): AI stops talking immediately and listens
         */
        bargeIn() {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                try { this.ws.send(JSON.stringify({ type: 'interrupt' })); } catch {}
            }
            if (this.isPlaying || this.currentAudio) {
                this.stopPlayback();
                if (this.stateMgr) this.stateMgr.interrupt();
                setTimeout(() => this.openMic(), 150);
            }
        }
    }

    const instance = new WebSocketClient(eventBus, voiceStateManager);
    instance.WebSocketClient = WebSocketClient;

    return instance;
}));
