/**
 * public/modules/dynamicBackground.js
 * Dynamic Background Visualizer Component
 *
 * Smoothly morphs background ambient gradients and glows based on Assistant State.
 * Subscribes to Event Bus events only. Zero AI logic control.
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define(['./eventBus'], factory);
    } else if (typeof module === 'object' && module.exports) {
        const eventBus = require('./eventBus');
        module.exports = factory(eventBus);
    } else {
        root.dynamicBackground = factory(root.eventBus);
    }
}(typeof self !== 'undefined' ? self : this, function (eventBus) {

    const THEMES = Object.freeze({
        Ready: { bg: 'radial-gradient(circle at 50% 50%, rgba(99, 102, 241, 0.15) 0%, rgba(15, 17, 32, 0.95) 75%)' },
        Listening: { bg: 'radial-gradient(circle at 50% 50%, rgba(16, 185, 129, 0.22) 0%, rgba(15, 17, 32, 0.95) 75%)' },
        Thinking: { bg: 'radial-gradient(circle at 50% 50%, rgba(139, 92, 246, 0.25) 0%, rgba(15, 17, 32, 0.95) 75%)' },
        Reasoning: { bg: 'radial-gradient(circle at 50% 50%, rgba(236, 72, 153, 0.25) 0%, rgba(15, 17, 32, 0.95) 75%)' },
        Speaking: { bg: 'radial-gradient(circle at 50% 50%, rgba(6, 182, 212, 0.25) 0%, rgba(15, 17, 32, 0.95) 75%)' },
        Finished: { bg: 'radial-gradient(circle at 50% 50%, rgba(99, 102, 241, 0.15) 0%, rgba(15, 17, 32, 0.95) 75%)' },
        Interrupted: { bg: 'radial-gradient(circle at 50% 50%, rgba(249, 115, 22, 0.25) 0%, rgba(15, 17, 32, 0.95) 75%)' },
        Error: { bg: 'radial-gradient(circle at 50% 50%, rgba(239, 68, 68, 0.25) 0%, rgba(15, 17, 32, 0.95) 75%)' }
    });

    class DynamicBackground {
        constructor(bus = eventBus) {
            this.bus = bus;
            this.targetElement = null;
            this.currentState = 'Ready';

            this._setupEventSubscriptions();
        }

        attachElement(element) {
            if (!element) return;
            this.targetElement = element;
            this.applyTheme(this.currentState);
        }

        _setupEventSubscriptions() {
            if (this.bus) {
                this.bus.on('state:changed', (record) => {
                    this.currentState = record.currentState || 'Ready';
                    this.applyTheme(this.currentState);
                });
            }
        }

        applyTheme(state) {
            if (!this.targetElement || typeof document === 'undefined') return;
            const theme = THEMES[state] || THEMES.Ready;
            this.targetElement.style.background = theme.bg;
            this.targetElement.style.transition = 'background 0.8s ease-in-out';
        }
    }

    const defaultInstance = new DynamicBackground(eventBus);
    defaultInstance.DynamicBackground = DynamicBackground;
    return defaultInstance;
}));
