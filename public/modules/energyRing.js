/**
 * public/modules/energyRing.js
 * Energy Ring Controller — CSS Transform-Driven Visual State Component
 *
 * Requirements:
 *  - Supports visual state transitions for: Ready, Listening, Thinking, Speaking, Interrupted, Disconnected, Error
 *  - Driven purely by CSS transform keyframes & class state toggling
 *  - Zero layout shift (strictly transform: translate/scale/rotate)
 *  - Connects strictly through the Event Bus
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define(['./eventBus', './voiceStateManager'], factory);
    } else if (typeof module === 'object' && module.exports) {
        const eventBus = require('./eventBus');
        const voiceStateManager = require('./voiceStateManager');
        module.exports = factory(eventBus, voiceStateManager);
    } else {
        root.energyRing = factory(root.eventBus, root.voiceStateManager);
    }
}(typeof self !== 'undefined' ? self : this, function (eventBus, voiceStateManager) {

    const STATE_CLASS_MAP = Object.freeze({
        Idle: 'state-ready',
        Ready: 'state-ready',
        Listening: 'state-listening',
        Thinking: 'state-thinking',
        Speaking: 'state-speaking',
        Finished: 'state-ready',
        Interrupted: 'state-interrupted',
        Disconnected: 'state-disconnected',
        Error: 'state-error'
    });

    class EnergyRing {
        constructor(bus = eventBus, stateMgr = voiceStateManager) {
            this.bus = bus;
            this.stateMgr = stateMgr;
            this.ringElement = null;
            this.currentClass = 'state-ready';

            this._initDOM();
            this._setupEventSubscriptions();
        }

        /**
         * Locate or cache target Energy Ring element safely
         */
        _initDOM() {
            if (typeof document !== 'undefined') {
                this.ringElement = document.getElementById('assistant-energy-ring') || document.querySelector('.energy-ring');
            }
        }

        /**
         * Subscribe to state change events broadcast on Event Bus
         */
        _setupEventSubscriptions() {
            if (this.bus) {
                this.bus.on('state:changed', (record) => {
                    this.onStateChanged(record.currentState);
                });
            }
        }

        /**
         * Attach to an Energy Ring DOM element
         */
        attachElement(element) {
            if (!element) return false;
            this.ringElement = element;
            if (this.stateMgr) {
                this.onStateChanged(this.stateMgr.getState());
            }
            return true;
        }

        /**
         * Apply state CSS class to Energy Ring element
         */
        onStateChanged(state) {
            this._initDOM();
            const targetClass = STATE_CLASS_MAP[state] || 'state-ready';
            this.currentClass = targetClass;

            if (this.ringElement) {
                // Remove all previous state classes
                this.ringElement.classList.remove(
                    'state-ready',
                    'state-listening',
                    'state-thinking',
                    'state-speaking',
                    'state-interrupted',
                    'state-disconnected',
                    'state-error'
                );

                // Apply new state class triggering pure CSS transform animation
                this.ringElement.classList.add(targetClass);
            }
        }
    }

    const instance = new EnergyRing(eventBus, voiceStateManager);
    instance.EnergyRing = EnergyRing;
    instance.STATE_CLASS_MAP = STATE_CLASS_MAP;

    return instance;
}));
