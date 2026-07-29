/**
 * public/modules/eventBus.js
 * High-Performance Pub/Sub Event Bus Architecture
 *
 * Facilitates decoupled communication between:
 *  - Voice Engine (mic, VAD, volume energy)
 *  - AI Engine (Gemini streaming, token dispatcher)
 *  - Animation System (sound wave canvas, orb visualizer)
 *  - UI (status indicators, transcript displays)
 *
 * Predefined Event Spectrum:
 *  - voice:listening    → Microphone active and recording
 *  - voice:volume       → Real-time audio energy RMS (0.0 to 1.0)
 *  - voice:stopped      → Microphone closed
 *  - ai:thinking        → STT / Gemini response generation in progress
 *  - ai:speaking        → Audio TTS playback active
 *  - ai:finished        → AI response and TTS playback completed
 *  - connection:connected → Realtime WebSocket established
 *  - connection:lost     → Realtime WebSocket disconnected
 *  - error              → Exception or error condition
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.eventBus = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    const EVENTS = Object.freeze({
        // Standard Dot-Notation Events
        ASSISTANT_READY: 'assistant.ready',
        ASSISTANT_LISTENING: 'assistant.listening',
        ASSISTANT_PROCESSING: 'assistant.processing',
        ASSISTANT_REASONING: 'assistant.reasoning',
        ASSISTANT_SPEAKING: 'assistant.speaking',
        ASSISTANT_FINISHED: 'assistant.finished',
        ASSISTANT_INTERRUPTED: 'assistant.interrupted',
        ASSISTANT_ERROR: 'assistant.error',
        MICROPHONE_VOLUME: 'microphone.volume',
        CONNECTION_CONNECTED_DOT: 'connection.connected',
        CONNECTION_RECONNECTING: 'connection.reconnecting',
        CONNECTION_DISCONNECTED: 'connection.disconnected',

        // Legacy / Internal Spectrum Aliases
        VOICE_LISTENING: 'voice:listening',
        VOICE_VOLUME: 'voice:volume',
        VOICE_STOPPED: 'voice:stopped',
        AI_THINKING: 'ai:thinking',
        AI_SPEAKING: 'ai:speaking',
        AI_FINISHED: 'ai:finished',
        CONNECTION_CONNECTED: 'connection:connected',
        CONNECTION_LOST: 'connection:lost',
        ERROR: 'error'
    });

    const ALIAS_MAP = Object.freeze({
        'voice:listening': 'assistant.listening',
        'assistant.listening': 'voice:listening',
        'voice:volume': 'microphone.volume',
        'microphone.volume': 'voice:volume',
        'ai:thinking': 'assistant.processing',
        'assistant.processing': 'ai:thinking',
        'ai:speaking': 'assistant.speaking',
        'assistant.speaking': 'ai:speaking',
        'ai:finished': 'assistant.finished',
        'assistant.finished': 'ai:finished',
        'connection:connected': 'connection.connected',
        'connection.connected': 'connection:connected',
        'connection:lost': 'connection.disconnected',
        'connection.disconnected': 'connection:lost',
        'error': 'assistant.error',
        'assistant.error': 'error'
    });

    class EventBus {
        constructor(options = {}) {
            this.listeners = new Map();
            this.lastState = new Map();
            this.debug = options.debug || false;
            this.EVENTS = EVENTS;
        }

        /**
         * Subscribe to an event
         * @param {string} event Event name (e.g. 'voice:listening' or '*' for all events)
         * @param {Function} callback Handler function
         * @returns {Function} Unsubscribe function
         */
        on(event, callback) {
            if (typeof callback !== 'function') {
                throw new TypeError('[EventBus] Callback must be a function');
            }
            if (!this.listeners.has(event)) {
                this.listeners.set(event, []);
            }
            this.listeners.get(event).push(callback);

            // Return automatic unsubscribe callback
            return () => this.off(event, callback);
        }

        /**
         * Subscribe to an event for a single invocation only
         */
        once(event, callback) {
            const onceWrapper = (data) => {
                this.off(event, onceWrapper);
                callback(data);
            };
            return this.on(event, onceWrapper);
        }

        /**
         * Unsubscribe a callback from an event
         */
        off(event, callback) {
            if (!this.listeners.has(event)) return;
            const handlers = this.listeners.get(event).filter(cb => cb !== callback);
            if (handlers.length > 0) {
                this.listeners.set(event, handlers);
            } else {
                this.listeners.delete(event);
            }
        }

        /**
         * Publish an event with a payload
         * @param {string} event Event name
         * @param {*} data Payload
         */
        emit(event, data = null, isAlias = false) {
            this.lastState.set(event, data);

            if (this.debug) {
                console.log(`[EventBus] ${event}`, data);
            }

            // Direct event subscribers
            if (this.listeners.has(event)) {
                const callbacks = [...this.listeners.get(event)];
                for (let i = 0; i < callbacks.length; i++) {
                    try {
                        callbacks[i](data, event);
                    } catch (err) {
                        console.error(`[EventBus] Error in handler for '${event}':`, err);
                    }
                }
            }

            // Dual dispatch to registered alias event
            if (!isAlias && ALIAS_MAP[event]) {
                const aliasEvt = ALIAS_MAP[event];
                this.emit(aliasEvt, data, true);
            }

            // Wildcard '*' subscribers
            if (!isAlias && this.listeners.has('*')) {
                const wildcardCallbacks = [...this.listeners.get('*')];
                for (let i = 0; i < wildcardCallbacks.length; i++) {
                    try {
                        wildcardCallbacks[i]({ event, data });
                    } catch (err) {
                        console.error(`[EventBus] Error in wildcard handler:`, err);
                    }
                }
            }
        }

        /**
         * Retrieve the most recent payload emitted for a specific event
         */
        getLastState(event) {
            return this.lastState.get(event);
        }

        /**
         * Clear all listeners and state history
         */
        clear() {
            this.listeners.clear();
            this.lastState.clear();
        }
    }

    // Export singleton instance + class reference
    const instance = new EventBus();
    instance.EventBus = EventBus;
    instance.EVENTS = EVENTS;

    return instance;
}));
