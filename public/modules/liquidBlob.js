/**
 * public/modules/liquidBlob.js
 * GPU-Accelerated Organic Liquid Blob Renderer
 *
 * Requirements:
 *  - Reacts to microphone volume (voice:volume event, 0.0 to 1.0)
 *  - Reacts to AI voice playback (ai:speaking / state:changed events)
 *  - Smooth 60 FPS utilizing requestAnimationFrame
 *  - Hardware accelerated 2D canvas path morphing
 *  - 100% decoupled — connects strictly through Event Bus
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define(['./eventBus', './voiceStateManager'], factory);
    } else if (typeof module === 'object' && module.exports) {
        const eventBus = require('./eventBus');
        const voiceStateManager = require('./voiceStateManager');
        module.exports = factory(eventBus, voiceStateManager);
    } else {
        root.liquidBlob = factory(root.eventBus, root.voiceStateManager);
    }
}(typeof self !== 'undefined' ? self : this, function (eventBus, voiceStateManager) {

    class LiquidBlob {
        constructor(bus = eventBus, stateMgr = voiceStateManager) {
            this.bus = bus;
            this.stateMgr = stateMgr;

            this.canvas = null;
            this.ctx = null;
            this.animFrameId = null;
            this.isRunning = false;

            // Geometry configuration
            this.numPoints = 10;           // Control nodes around circle
            this.baseRadius = 75;          // Base radius in px
            this.currentRadius = 75;
            this.targetRadius = 75;

            this.volume = 0;              // 0.0 to 1.0 (from mic or AI voice)
            this.targetVolume = 0;
            this.turbulence = 0.05;       // Wave distortion amplitude
            this.targetTurbulence = 0.05;
            this.phase = 0;               // Time evolution phase

            this.currentState = 'Idle';

            // Point offsets array
            this.points = [];
            for (let i = 0; i < this.numPoints; i++) {
                this.points.push({
                    angle: (i / this.numPoints) * Math.PI * 2,
                    offset: 0,
                    speed: 0.8 + Math.random() * 0.6,
                    phaseShift: Math.random() * Math.PI * 2
                });
            }

            this._setupEventSubscriptions();
        }

        /**
         * Subscribe to Event Bus for volume & state events
         */
        _setupEventSubscriptions() {
            if (!this.bus) return;

            // Microphone volume stream
            this.bus.on('voice:volume', (vol) => {
                this.onVolumeUpdate(typeof vol === 'number' ? vol : (vol ? vol.volume || 0 : 0));
            });

            // State changes
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
         * Handle canvas resolution for High-DPI displays
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
         * Update blob dynamics on volume input (0.0 to 1.0)
         */
        onVolumeUpdate(vol) {
            const clamped = Math.max(0, Math.min(1, vol));
            this.targetVolume = clamped;
            this.targetRadius = this.baseRadius + (clamped * 35);
            this.targetTurbulence = 0.05 + (clamped * 0.35);
        }

        /**
         * React to Voice State changes
         */
        onStateChanged(state) {
            this.currentState = state;

            switch (state) {
                case 'Listening':
                    this.targetRadius = this.baseRadius + 10;
                    this.targetTurbulence = 0.12;
                    break;
                case 'Thinking':
                    this.targetRadius = this.baseRadius + 5;
                    this.targetTurbulence = 0.25; // High turbulence spin
                    break;
                case 'Speaking':
                    this.targetRadius = this.baseRadius + 20;
                    this.targetTurbulence = 0.28;
                    break;
                case 'Idle':
                case 'Ready':
                case 'Finished':
                    this.targetRadius = this.baseRadius;
                    this.targetTurbulence = 0.04;
                    this.targetVolume = 0;
                    break;
                case 'Disconnected':
                case 'Error':
                    this.targetRadius = this.baseRadius - 10;
                    this.targetTurbulence = 0.02;
                    this.targetVolume = 0;
                    break;
            }
        }

        /**
         * Start 60 FPS render loop
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
         * Physics & geometry state updates per frame
         */
        update(timestamp) {
            // Exponential smoothing for 60 FPS fluid motion
            this.volume += (this.targetVolume - this.volume) * 0.15;
            this.currentRadius += (this.targetRadius - this.currentRadius) * 0.12;
            this.turbulence += (this.targetTurbulence - this.turbulence) * 0.1;

            const time = timestamp ? timestamp * 0.002 : Date.now() * 0.002;
            this.phase = time;

            // Calculate organic node displacements
            for (let i = 0; i < this.numPoints; i++) {
                const pt = this.points[i];
                const wave1 = Math.sin(time * pt.speed + pt.phaseShift);
                const wave2 = Math.cos(time * 1.5 * pt.speed + pt.angle * 2);
                pt.offset = (wave1 + wave2 * 0.5) * (this.currentRadius * this.turbulence);
            }
        }

        /**
         * Render organic liquid blob path on canvas
         */
        render() {
            if (!this.ctx || !this.canvas) return;

            const W = this.canvas.width;
            const H = this.canvas.height;
            const cx = W / 2;
            const cy = H / 2;

            this.ctx.clearRect(0, 0, W, H);

            // Compute coordinates of point nodes
            const coords = [];
            for (let i = 0; i < this.numPoints; i++) {
                const pt = this.points[i];
                const r = this.currentRadius + pt.offset;
                coords.push({
                    x: cx + Math.cos(pt.angle) * r,
                    y: cy + Math.sin(pt.angle) * r
                });
            }

            // Draw smooth bezier curve through nodes
            this.ctx.save();
            this.ctx.beginPath();

            const p0 = coords[coords.length - 1];
            const p1 = coords[0];
            const midStart = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
            this.ctx.moveTo(midStart.x, midStart.y);

            for (let i = 0; i < coords.length; i++) {
                const curr = coords[i];
                const next = coords[(i + 1) % coords.length];
                const mid = { x: (curr.x + next.x) / 2, y: (curr.y + next.y) / 2 };
                this.ctx.quadraticCurveTo(curr.x, curr.y, mid.x, mid.y);
            }

            this.ctx.closePath();

            // Dynamic State Gradient
            let grad = this.ctx.createRadialGradient(cx, cy, 10, cx, cy, this.currentRadius * 1.4);
            if (this.currentState === 'Speaking') {
                grad.addColorStop(0, '#00ff88');
                grad.addColorStop(0.6, '#00ccff');
                grad.addColorStop(1, '#ff00ff');
            } else if (this.currentState === 'Listening') {
                grad.addColorStop(0, '#00ffff');
                grad.addColorStop(0.6, '#0077ff');
                grad.addColorStop(1, '#00ff88');
            } else if (this.currentState === 'Thinking') {
                grad.addColorStop(0, '#ffaa00');
                grad.addColorStop(0.6, '#ff0055');
                grad.addColorStop(1, '#9900ff');
            } else {
                grad.addColorStop(0, '#bf5fff');
                grad.addColorStop(0.6, '#5500ff');
                grad.addColorStop(1, '#00c8ff');
            }

            this.ctx.fillStyle = grad;
            this.ctx.fill();

            // Glow aura
            this.ctx.shadowColor = this.currentState === 'Speaking' ? 'rgba(0, 255, 136, 0.7)' : 'rgba(0, 200, 255, 0.6)';
            this.ctx.shadowBlur = 30 + this.volume * 40;
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();

            this.ctx.restore();
        }
    }

    const instance = new LiquidBlob(eventBus, voiceStateManager);
    instance.LiquidBlob = LiquidBlob;

    return instance;
}));
