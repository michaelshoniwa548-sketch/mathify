/**
 * public/modules/audioEqualizer.js
 * Multi-State Real-Time Audio Equalizer Component
 *
 * Requirements:
 *  - Reacts to user speech (voice:volume event, 0.0 to 1.0)
 *  - Reacts to AI speech (Speaking state)
 *  - Breathes in gentle sine waves while idle (Idle / Ready state)
 *  - Does NOT interfere with microphone capture (passive Event Bus consumer)
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define(['./eventBus', './voiceStateManager'], factory);
    } else if (typeof module === 'object' && module.exports) {
        const eventBus = require('./eventBus');
        const voiceStateManager = require('./voiceStateManager');
        module.exports = factory(eventBus, voiceStateManager);
    } else {
        root.audioEqualizer = factory(root.eventBus, root.voiceStateManager);
    }
}(typeof self !== 'undefined' ? self : this, function (eventBus, voiceStateManager) {

    class AudioEqualizer {
        constructor(bus = eventBus, stateMgr = voiceStateManager) {
            this.bus = bus;
            this.stateMgr = stateMgr;

            this.canvas = null;
            this.ctx = null;
            this.animFrameId = null;
            this.isRunning = false;

            this.barCount = 18;          // Number of equalizer frequency bars
            this.bars = new Float32Array(this.barCount).fill(0);
            this.targetBars = new Float32Array(this.barCount).fill(0);

            this.volume = 0;             // User mic volume
            this.targetVolume = 0;
            this.currentState = 'Idle';
            this.time = 0;

            this._setupEventSubscriptions();
        }

        /**
         * Passive Event Bus listener — strictly zero interference with mic capture
         */
        _setupEventSubscriptions() {
            if (!this.bus) return;

            // User speech volume input
            this.bus.on('voice:volume', (vol) => {
                const v = typeof vol === 'number' ? vol : (vol ? vol.volume || 0 : 0);
                this.onVolumeUpdate(v);
            });

            // Voice state changes
            this.bus.on('state:changed', (record) => {
                this.onStateChanged(record.currentState);
            });
        }

        /**
         * Attach to an HTML5 Canvas element
         */
        attachCanvas(canvasElement) {
            if (!canvasElement || typeof canvasElement.getContext !== 'function') {
                return false;
            }

            this.canvas = canvasElement;
            this.ctx = this.canvas.getContext('2d');
            this.resize();

            if (!this.isRunning) {
                this.start();
            }
            return true;
        }

        /**
         * Handle High-DPI canvas resizing
         */
        resize() {
            if (!this.canvas) return;
            const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
            const rect = this.canvas.getBoundingClientRect ? this.canvas.getBoundingClientRect() : { width: 320, height: 100 };
            
            const w = rect.width || 320;
            const h = rect.height || 100;

            if (this.canvas.width !== w * dpr || this.canvas.height !== h * dpr) {
                this.canvas.width = w * dpr;
                this.canvas.height = h * dpr;
            }
        }

        /**
         * Passive volume update from microphone stream
         */
        onVolumeUpdate(vol) {
            this.targetVolume = Math.max(0, Math.min(1, vol));
        }

        /**
         * React to Voice Assistant state changes
         */
        onStateChanged(state) {
            this.currentState = state;
        }

        /**
         * Start 60 FPS animation loop
         */
        start() {
            this.isRunning = true;
            const renderLoop = (timestamp) => {
                if (!this.isRunning) return;
                this.update(timestamp);
                this.render();
                if (typeof requestAnimationFrame === 'function') {
                    this.animFrameId = requestAnimationFrame(renderLoop);
                }
            };

            if (typeof requestAnimationFrame === 'function') {
                this.animFrameId = requestAnimationFrame(renderLoop);
            }
        }

        /**
         * Stop render loop
         */
        stop() {
            this.isRunning = false;
            if (this.animFrameId && typeof cancelAnimationFrame === 'function') {
                cancelAnimationFrame(this.animFrameId);
                this.animFrameId = null;
            }
        }

        /**
         * Equalizer physics updates per frame across states
         */
        update(timestamp) {
            this.time = timestamp ? timestamp * 0.003 : Date.now() * 0.003;

            // Smooth volume decay/growth
            this.volume += (this.targetVolume - this.volume) * 0.2;

            const isListening = this.currentState === 'Listening';
            const isSpeaking = this.currentState === 'Speaking';
            const isThinking = this.currentState === 'Thinking';

            for (let i = 0; i < this.barCount; i++) {
                let target = 0;

                // 1. User Speech Reaction: Bars jump to live mic volume energy
                if (isListening) {
                    const centerFactor = 1 - Math.abs(i - this.barCount / 2) / (this.barCount / 2);
                    const noise = Math.sin(this.time * 8 + i * 1.2) * 0.2 + 0.8;
                    target = this.volume * centerFactor * noise * 0.9 + 0.08;
                }
                // 2. AI Speech Reaction: Dynamic speech frequency bounce
                else if (isSpeaking) {
                    const wave1 = Math.sin(this.time * 6 + i * 0.5) * 0.5 + 0.5;
                    const wave2 = Math.cos(this.time * 10 + i * 0.8) * 0.4;
                    target = Math.max(0.12, (wave1 + wave2) * 0.85);
                }
                // 3. Thinking State: Rapid scanning wave
                else if (isThinking) {
                    const scan = Math.sin(this.time * 12 - i * 0.4) * 0.5 + 0.5;
                    target = Math.pow(scan, 3) * 0.7 + 0.08;
                }
                // 4. Idle / Ready State: Breathing ambient sine wave
                else {
                    const breath = Math.sin(this.time * 2.2 + i * 0.35) * 0.5 + 0.5;
                    target = 0.08 + breath * 0.14; // Gentle ambient breathing
                }

                this.targetBars[i] = Math.max(0.05, Math.min(1.0, target));

                // Smooth exponential interpolation per bar
                this.bars[i] += (this.targetBars[i] - this.bars[i]) * 0.25;
            }
        }

        /**
         * Render equalizer bars on canvas
         */
        render() {
            if (!this.ctx || !this.canvas) return;

            const W = this.canvas.width;
            const H = this.canvas.height;
            this.ctx.clearRect(0, 0, W, H);

            const padding = 6;
            const totalPadding = padding * (this.barCount + 1);
            const barWidth = (W - totalPadding) / this.barCount;

            for (let i = 0; i < this.barCount; i++) {
                const barHeight = this.bars[i] * (H * 0.85);
                const x = padding + i * (barWidth + padding);
                const y = H - barHeight;

                this.ctx.save();

                // Dynamic gradient fill per state
                let grad = this.ctx.createLinearGradient(0, H, 0, y);
                if (this.currentState === 'Speaking') {
                    grad.addColorStop(0, '#00ff88');
                    grad.addColorStop(1, '#00c8ff');
                } else if (this.currentState === 'Listening') {
                    grad.addColorStop(0, '#00c8ff');
                    grad.addColorStop(1, '#00ffee');
                } else if (this.currentState === 'Thinking') {
                    grad.addColorStop(0, '#ffaa00');
                    grad.addColorStop(1, '#ff0055');
                } else {
                    grad.addColorStop(0, 'rgba(140, 60, 255, 0.4)');
                    grad.addColorStop(1, 'rgba(0, 200, 255, 0.6)');
                }

                this.ctx.fillStyle = grad;
                this.ctx.shadowColor = this.currentState === 'Speaking' ? 'rgba(0, 255, 136, 0.6)' : 'rgba(0, 200, 255, 0.4)';
                this.ctx.shadowBlur = 8;

                // Render rounded equalizer bar
                const radius = Math.min(barWidth / 2, 4);
                this.ctx.beginPath();
                if (this.ctx.roundRect) {
                    this.ctx.roundRect(x, y, barWidth, barHeight, [radius, radius, 0, 0]);
                } else {
                    this.ctx.rect(x, y, barWidth, barHeight);
                }
                this.ctx.fill();

                this.ctx.restore();
            }
        }
    }

    const instance = new AudioEqualizer(eventBus, voiceStateManager);
    instance.AudioEqualizer = AudioEqualizer;

    return instance;
}));
