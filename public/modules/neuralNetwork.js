/**
 * public/modules/neuralNetwork.js
 * Premium Neural Network Synapse Visualizer Component
 *
 * Reacts purely to Event Bus state emissions (Thinking, Reasoning, Searching).
 * Zero AI logic control.
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define(['./eventBus'], factory);
    } else if (typeof module === 'object' && module.exports) {
        const eventBus = require('./eventBus');
        module.exports = factory(eventBus);
    } else {
        root.neuralNetwork = factory(root.eventBus);
    }
}(typeof self !== 'undefined' ? self : this, function (eventBus) {

    class NeuralNetwork {
        constructor(bus = eventBus, options = {}) {
            this.bus = bus;
            this.canvas = null;
            this.ctx = null;
            this.nodeCount = options.nodeCount || 20;
            this.nodes = [];
            this.currentState = 'Ready';
            this.pulses = [];
            this.animFrame = null;

            this._setupEventSubscriptions();
        }

        attachCanvas(canvasElement) {
            if (!canvasElement) return;
            this.canvas = canvasElement;
            this.ctx = canvasElement.getContext('2d');
            this._initNodes();
            this.start();
        }

        _initNodes() {
            if (!this.canvas) return;
            const w = this.canvas.width || 320;
            const h = this.canvas.height || 320;
            this.nodes = [];
            for (let i = 0; i < this.nodeCount; i++) {
                this.nodes.push({
                    x: Math.random() * w,
                    y: Math.random() * h,
                    vx: (Math.random() - 0.5) * 0.6,
                    vy: (Math.random() - 0.5) * 0.6,
                    radius: 2 + Math.random() * 2,
                    activity: Math.random()
                });
            }
        }

        _setupEventSubscriptions() {
            if (this.bus) {
                this.bus.on('state:changed', (record) => {
                    this.currentState = record.currentState || 'Ready';
                });
                this.bus.on('voice:volume', (vol) => {
                    if (this.currentState === 'Speaking' || this.currentState === 'Listening') {
                        this._triggerPulse(vol);
                    }
                });
            }
        }

        _triggerPulse(intensity = 0.5) {
            if (this.nodes.length < 2) return;
            const from = Math.floor(Math.random() * this.nodes.length);
            let to = Math.floor(Math.random() * this.nodes.length);
            if (from === to) to = (from + 1) % this.nodes.length;
            this.pulses.push({
                from,
                to,
                progress: 0,
                speed: 0.04 + intensity * 0.05
            });
        }

        update() {
            if (!this.canvas) return;
            const w = this.canvas.width;
            const h = this.canvas.height;

            const isBrainActive = this.currentState === 'Thinking' || this.currentState === 'Reasoning' || this.currentState === 'Searching Knowledge';
            const speedFactor = isBrainActive ? 1.8 : 0.6;

            for (let i = 0; i < this.nodes.length; i++) {
                const n = this.nodes[i];
                n.x += n.vx * speedFactor;
                n.y += n.vy * speedFactor;

                if (n.x < 0 || n.x > w) n.vx *= -1;
                if (n.y < 0 || n.y > h) n.vy *= -1;

                if (isBrainActive && Math.random() < 0.05) {
                    this._triggerPulse(0.8);
                }
            }

            // Update pulses
            for (let i = this.pulses.length - 1; i >= 0; i--) {
                const p = this.pulses[i];
                p.progress += p.speed;
                if (p.progress >= 1) {
                    this.pulses.splice(i, 1);
                }
            }
        }

        render() {
            if (!this.ctx || !this.canvas) return;
            const ctx = this.ctx;
            const w = this.canvas.width;
            const h = this.canvas.height;

            ctx.clearRect(0, 0, w, h);

            const isBrainActive = this.currentState === 'Thinking' || this.currentState === 'Reasoning';
            const linkColor = isBrainActive ? 'rgba(139, 92, 246, 0.35)' : 'rgba(99, 102, 241, 0.15)';
            const nodeColor = isBrainActive ? 'rgba(236, 72, 153, 0.8)' : 'rgba(99, 102, 241, 0.6)';

            // Draw synapse links
            for (let i = 0; i < this.nodes.length; i++) {
                for (let j = i + 1; j < this.nodes.length; j++) {
                    const dx = this.nodes[i].x - this.nodes[j].x;
                    const dy = this.nodes[i].y - this.nodes[j].y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < 90) {
                        ctx.beginPath();
                        ctx.moveTo(this.nodes[i].x, this.nodes[i].y);
                        ctx.lineTo(this.nodes[j].x, this.nodes[j].y);
                        ctx.strokeStyle = linkColor;
                        ctx.lineWidth = 1 - dist / 90;
                        ctx.stroke();
                    }
                }
            }

            // Draw pulses
            this.pulses.forEach(p => {
                const n1 = this.nodes[p.from];
                const n2 = this.nodes[p.to];
                if (n1 && n2) {
                    const px = n1.x + (n2.x - n1.x) * p.progress;
                    const py = n1.y + (n2.y - n1.y) * p.progress;
                    ctx.beginPath();
                    ctx.arc(px, py, 3, 0, Math.PI * 2);
                    ctx.fillStyle = '#f43f5e';
                    ctx.shadowBlur = 10;
                    ctx.shadowColor = '#f43f5e';
                    ctx.fill();
                    ctx.shadowBlur = 0;
                }
            });

            // Draw nodes
            for (let i = 0; i < this.nodes.length; i++) {
                const n = this.nodes[i];
                ctx.beginPath();
                ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
                ctx.fillStyle = nodeColor;
                ctx.fill();
            }
        }

        start() {
            const loop = () => {
                this.update();
                this.render();
                this.animFrame = requestAnimationFrame(loop);
            };
            loop();
        }

        stop() {
            if (this.animFrame) cancelAnimationFrame(this.animFrame);
        }
    }

    const defaultInstance = new NeuralNetwork(eventBus);
    defaultInstance.NeuralNetwork = NeuralNetwork;
    return defaultInstance;
}));
