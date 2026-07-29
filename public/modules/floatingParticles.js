/**
 * public/modules/floatingParticles.js
 * High-Performance Floating Particle System with Automatic FPS Adaptivity
 *
 * Requirements:
 *  - Reacts to microphone volume (voice:volume event)
 *  - Reacts to AI speech (Speaking state)
 *  - Reacts to thinking state (Thinking state — spiraling vortex)
 *  - Maintained 60 FPS using requestAnimationFrame
 *  - Auto-throttling: automatically reduces particle count on slower devices
 *  - Decoupled — connects strictly through Event Bus
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define(['./eventBus', './voiceStateManager'], factory);
    } else if (typeof module === 'object' && module.exports) {
        const eventBus = require('./eventBus');
        const voiceStateManager = require('./voiceStateManager');
        module.exports = factory(eventBus, voiceStateManager);
    } else {
        root.floatingParticles = factory(root.eventBus, root.voiceStateManager);
    }
}(typeof self !== 'undefined' ? self : this, function (eventBus, voiceStateManager) {

    class FloatingParticles {
        constructor(bus = eventBus, stateMgr = voiceStateManager) {
            this.bus = bus;
            this.stateMgr = stateMgr;

            this.canvas = null;
            this.ctx = null;
            this.animFrameId = null;
            this.isRunning = false;

            // Adaptive Device Performance Tuning
            this.maxParticles = 60;        // Desktop default
            this.minParticles = 25;        // Low-end device fallback
            this.currentParticleCount = 60;
            this.particles = [];

            // Performance Monitoring
            this.lastFrameTime = 0;
            this.frameCount = 0;
            this.fpsHistory = [];
            this.isLowPerformanceMode = false;

            // Dynamics & Audio Interaction
            this.volume = 0;
            this.targetVolume = 0;
            this.currentState = 'Idle';

            this._initParticlePool();
            this._setupEventSubscriptions();
        }

        /**
         * Pre-allocate particle pool to avoid garbage collection pauses
         */
        _initParticlePool() {
            this.particles = [];
            for (let i = 0; i < this.maxParticles; i++) {
                this.particles.push(this._createParticle());
            }
        }

        _createParticle() {
            const angle = Math.random() * Math.PI * 2;
            const distance = 50 + Math.random() * 110;
            return {
                angle,
                distance,
                baseDistance: distance,
                speed: (0.005 + Math.random() * 0.012) * (Math.random() < 0.5 ? 1 : -1),
                radius: 1.5 + Math.random() * 2.5,
                alpha: 0.2 + Math.random() * 0.7,
                pulseSpeed: 0.02 + Math.random() * 0.03,
                hue: 200 + Math.random() * 80
            };
        }

        /**
         * Subscribe to Event Bus for volume & state changes
         */
        _setupEventSubscriptions() {
            if (!this.bus) return;

            // Microphone volume reaction
            this.bus.on('voice:volume', (vol) => {
                const v = typeof vol === 'number' ? vol : (vol ? vol.volume || 0 : 0);
                this.onVolumeUpdate(v);
            });

            // Voice State reactions
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
            const rect = this.canvas.getBoundingClientRect ? this.canvas.getBoundingClientRect() : { width: 320, height: 320 };
            
            const w = rect.width || 320;
            const h = rect.height || 320;

            if (this.canvas.width !== w * dpr || this.canvas.height !== h * dpr) {
                this.canvas.width = w * dpr;
                this.canvas.height = h * dpr;
            }
        }

        /**
         * React to microphone volume (0.0 to 1.0)
         */
        onVolumeUpdate(vol) {
            this.targetVolume = Math.max(0, Math.min(1, vol));
        }

        /**
         * React to Voice Assistant State
         */
        onStateChanged(state) {
            this.currentState = state;
        }

        /**
         * Start 60 FPS animation loop with adaptive device performance tracking
         */
        start() {
            this.isRunning = true;
            this.lastFrameTime = typeof performance !== 'undefined' ? performance.now() : Date.now();

            const renderLoop = (timestamp) => {
                if (!this.isRunning) return;

                this._checkPerformance(timestamp);
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
         * Automatically throttle particle count on low-end devices
         */
        _checkPerformance(timestamp) {
            if (!timestamp) return;

            const delta = timestamp - (this.lastFrameTime || timestamp);
            this.lastFrameTime = timestamp;

            if (delta > 0) {
                const currentFps = 1000 / delta;
                this.fpsHistory.push(currentFps);

                if (this.fpsHistory.length > 60) {
                    this.fpsHistory.shift();

                    // Calculate average FPS over last 60 frames
                    const avgFps = this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length;

                    // If device drops below 45 FPS, auto-reduce particle count to preserve smooth 60 FPS
                    if (avgFps < 45 && !this.isLowPerformanceMode) {
                        this.isLowPerformanceMode = true;
                        this.currentParticleCount = this.minParticles;
                        console.warn(`[FloatingParticles] Low performance detected (${avgFps.toFixed(1)} FPS). Auto-reduced particles to ${this.minParticles}.`);
                    } else if (avgFps > 55 && this.isLowPerformanceMode) {
                        this.isLowPerformanceMode = false;
                        this.currentParticleCount = this.maxParticles;
                    }
                }
            }
        }

        /**
         * Stop animation loop
         */
        stop() {
            this.isRunning = false;
            if (this.animFrameId && typeof cancelAnimationFrame === 'function') {
                cancelAnimationFrame(this.animFrameId);
                this.animFrameId = null;
            }
        }

        /**
         * Update particle dynamics per frame
         */
        update(timestamp) {
            // Smooth volume interpolation
            this.volume += (this.targetVolume - this.volume) * 0.15;

            const isSpeaking = this.currentState === 'Speaking';
            const isThinking = this.currentState === 'Thinking';
            const isListening = this.currentState === 'Listening';

            for (let i = 0; i < this.currentParticleCount; i++) {
                const p = this.particles[i];

                // 1. Thinking State Reaction: Particles swirl inward in a spiraling vortex
                if (isThinking) {
                    p.angle += p.speed * 3.5;
                    p.distance += (45 - p.distance) * 0.05; // Pull inward to center
                    p.hue = 30 + (i * 5) % 40;             // Golden/orange glow
                }
                // 2. AI Speech Reaction: Orbital acceleration & vibrant lime/pink pulse
                else if (isSpeaking) {
                    p.angle += p.speed * (2.0 + this.volume * 2);
                    p.distance += (p.baseDistance + Math.sin(timestamp * 0.005 + i) * 20 - p.distance) * 0.1;
                    p.hue = 130 + (i * 8) % 180;           // Vibrant green/cyan/pink
                }
                // 3. Microphone Volume Reaction: Radial expansion & velocity boost
                else if (isListening) {
                    p.angle += p.speed * (1.0 + this.volume * 3);
                    p.distance += (p.baseDistance + (this.volume * 50) - p.distance) * 0.15;
                    p.hue = 180 + (i * 4) % 60;            // Bright cyan/blue
                }
                // 4. Idle / Ready State: Ambient floating
                else {
                    p.angle += p.speed;
                    p.distance += (p.baseDistance - p.distance) * 0.05;
                    p.hue = 200 + (i * 3) % 60;
                }

                // Smooth opacity pulsing
                p.alpha = 0.3 + Math.sin(timestamp * p.pulseSpeed + i) * 0.3;
            }
        }

        /**
         * Render floating particles on canvas
         */
        render() {
            if (!this.ctx || !this.canvas) return;

            const W = this.canvas.width;
            const H = this.canvas.height;
            const cx = W / 2;
            const cy = H / 2;

            // Clear transparent overlay for particles
            // (Canvas context shared or rendered cleanly over orb)
            for (let i = 0; i < this.currentParticleCount; i++) {
                const p = this.particles[i];

                const x = cx + Math.cos(p.angle) * p.distance;
                const y = cy + Math.sin(p.angle) * p.distance;

                this.ctx.save();
                this.ctx.beginPath();
                this.ctx.arc(x, y, p.radius * (1 + this.volume * 0.5), 0, Math.PI * 2);

                this.ctx.fillStyle = `hsla(${p.hue}, 100%, 70%, ${p.alpha})`;
                this.ctx.shadowColor = `hsla(${p.hue}, 100%, 60%, 0.8)`;
                this.ctx.shadowBlur = 10;

                this.ctx.fill();
                this.ctx.restore();
            }
        }
    }

    const instance = new FloatingParticles(eventBus, voiceStateManager);
    instance.FloatingParticles = FloatingParticles;

    return instance;
}));
