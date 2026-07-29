/**
 * public/modules/voiceBubble.js
 * Premium Voice Bubble Component
 *
 * Glassmorphism voice energy bubble that swells and reacts during Listening & Speaking states.
 * Subscribes to Event Bus events only. Zero AI logic control.
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define(['./eventBus'], factory);
    } else if (typeof module === 'object' && module.exports) {
        const eventBus = require('./eventBus');
        module.exports = factory(eventBus);
    } else {
        root.voiceBubble = factory(root.eventBus);
    }
}(typeof self !== 'undefined' ? self : this, function (eventBus) {

    class VoiceBubble {
        constructor(bus = eventBus) {
            this.bus = bus;
            this.element = null;
            this.volume = 0;
            this.currentState = 'Ready';

            this._setupEventSubscriptions();
        }

        attachElement(element) {
            if (!element) return;
            this.element = element;
            this.render();
        }

        _setupEventSubscriptions() {
            if (this.bus) {
                this.bus.on('state:changed', (record) => {
                    this.currentState = record.currentState || 'Ready';
                    this.render();
                });
                this.bus.on('voice:volume', (vol) => {
                    this.volume = vol;
                    this.render();
                });
            }
        }

        render() {
            if (!this.element || typeof document === 'undefined') return;

            const scale = 1 + this.volume * 0.25;
            const glowColor = this.currentState === 'Speaking' ? 'rgba(6, 186, 212, 0.6)'
                : this.currentState === 'Listening' ? 'rgba(16, 185, 129, 0.6)'
                : 'rgba(99, 102, 241, 0.3)';

            this.element.style.transform = `translate(-50%, -50%) scale(${scale})`;
            this.element.style.boxShadow = `0 0 25px ${glowColor}`;
            this.element.style.transition = 'transform 0.15s ease-out, box-shadow 0.2s ease-out';
        }
    }

    const defaultInstance = new VoiceBubble(eventBus);
    defaultInstance.VoiceBubble = VoiceBubble;
    return defaultInstance;
}));
