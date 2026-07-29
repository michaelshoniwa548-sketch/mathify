/**
 * public/modules/voiceStateManager.js
 * Professional Finite State Machine for AI Voice Assistant Lifecycle
 *
 * States Spectrum:
 *  - Idle        : Voice system uninitialized / call terminated
 *  - Ready       : System connected & standing by for voice interaction
 *  - Listening   : Microphone open, actively recording student speech / VAD active
 *  - Thinking    : STT / Gemini response generation in progress
 *  - Speaking    : Assistant actively streaming and playing TTS audio
 *  - Finished    : Response playback completed, preparing next interaction
 *  - Interrupted : Student interrupted current audio playback (barge-in)
 *  - Disconnected: Connection to backend server / WebSocket lost
 *  - Error       : System exception or failure encountered
 *
 * Interacts seamlessly with public/modules/eventBus.js
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define(['./eventBus'], factory);
    } else if (typeof module === 'object' && module.exports) {
        const eventBus = require('./eventBus');
        module.exports = factory(eventBus);
    } else {
        root.voiceStateManager = factory(root.eventBus);
    }
}(typeof self !== 'undefined' ? self : this, function (eventBus) {

    const STATES = Object.freeze({
        IDLE: 'Idle',
        READY: 'Ready',
        LISTENING: 'Listening',
        THINKING: 'Thinking',
        REASONING: 'Reasoning',
        SEARCHING: 'Searching',
        SPEAKING: 'Speaking',
        FINISHED: 'Finished',
        INTERRUPTED: 'Interrupted',
        RECONNECTING: 'Reconnecting',
        DISCONNECTED: 'Disconnected',
        ERROR: 'Error'
    });

    // Internal AI Self-Awareness State Messages
    const AWARENESS_MESSAGES = Object.freeze({
        [STATES.IDLE]: "I'm waiting.",
        [STATES.READY]: "I'm ready.",
        [STATES.LISTENING]: "I'm listening.",
        [STATES.THINKING]: "I'm thinking.",
        [STATES.REASONING]: "I'm reasoning.",
        [STATES.SEARCHING]: "I'm searching my knowledge.",
        [STATES.SPEAKING]: "I'm speaking.",
        [STATES.FINISHED]: "I'm waiting.",
        [STATES.INTERRUPTED]: "I was interrupted.",
        [STATES.RECONNECTING]: "I'm reconnecting.",
        [STATES.DISCONNECTED]: "I'm offline.",
        [STATES.ERROR]: "I encountered an error."
    });

    // Valid state transition map ensuring state machine integrity
    const TRANSITIONS = Object.freeze({
        [STATES.IDLE]: [STATES.READY, STATES.LISTENING, STATES.THINKING, STATES.REASONING, STATES.SEARCHING, STATES.RECONNECTING, STATES.DISCONNECTED, STATES.ERROR],
        [STATES.READY]: [STATES.LISTENING, STATES.THINKING, STATES.REASONING, STATES.SEARCHING, STATES.IDLE, STATES.RECONNECTING, STATES.DISCONNECTED, STATES.ERROR],
        [STATES.LISTENING]: [STATES.THINKING, STATES.REASONING, STATES.SEARCHING, STATES.READY, STATES.IDLE, STATES.RECONNECTING, STATES.DISCONNECTED, STATES.ERROR],
        [STATES.THINKING]: [STATES.SPEAKING, STATES.REASONING, STATES.SEARCHING, STATES.FINISHED, STATES.LISTENING, STATES.READY, STATES.IDLE, STATES.RECONNECTING, STATES.DISCONNECTED, STATES.ERROR],
        [STATES.REASONING]: [STATES.SPEAKING, STATES.THINKING, STATES.SEARCHING, STATES.FINISHED, STATES.LISTENING, STATES.READY, STATES.IDLE, STATES.RECONNECTING, STATES.DISCONNECTED, STATES.ERROR],
        [STATES.SEARCHING]: [STATES.SPEAKING, STATES.THINKING, STATES.REASONING, STATES.FINISHED, STATES.LISTENING, STATES.READY, STATES.IDLE, STATES.RECONNECTING, STATES.DISCONNECTED, STATES.ERROR],
        [STATES.SPEAKING]: [STATES.FINISHED, STATES.INTERRUPTED, STATES.LISTENING, STATES.READY, STATES.IDLE, STATES.RECONNECTING, STATES.DISCONNECTED, STATES.ERROR],
        [STATES.FINISHED]: [STATES.READY, STATES.LISTENING, STATES.IDLE, STATES.RECONNECTING, STATES.DISCONNECTED, STATES.ERROR],
        [STATES.INTERRUPTED]: [STATES.LISTENING, STATES.SPEAKING, STATES.THINKING, STATES.READY, STATES.IDLE, STATES.RECONNECTING, STATES.DISCONNECTED, STATES.ERROR],
        [STATES.RECONNECTING]: [STATES.READY, STATES.LISTENING, STATES.THINKING, STATES.DISCONNECTED, STATES.ERROR],
        [STATES.DISCONNECTED]: [STATES.READY, STATES.RECONNECTING, STATES.LISTENING, STATES.THINKING, STATES.IDLE, STATES.ERROR],
        [STATES.ERROR]: [STATES.READY, STATES.LISTENING, STATES.THINKING, STATES.IDLE, STATES.RECONNECTING, STATES.DISCONNECTED]
    });

    class VoiceStateManager {
        constructor(bus = eventBus, options = {}) {
            this.bus = bus;
            this.currentState = STATES.IDLE;
            this.stateHistory = [];
            this.historyLimit = options.historyLimit || 50;
            this.strictTransitions = options.strictTransitions !== false;
            this.STATES = STATES;
            this.AWARENESS_MESSAGES = AWARENESS_MESSAGES;

            this._setupEventSubscriptions();
        }

        /**
         * Subscribe to Event Bus events to automate state transitions
         */
        _setupEventSubscriptions() {
            if (!this.bus) return;

            // Connection events
            this.bus.on('connection:connected', (payload) => {
                this.transitionTo(STATES.READY, payload);
            });

            this.bus.on('connection:lost', (payload) => {
                this.transitionTo(STATES.DISCONNECTED, payload);
            });

            // Voice engine events
            this.bus.on('voice:listening', (payload) => {
                this.transitionTo(STATES.LISTENING, payload);
            });

            this.bus.on('voice:stopped', (payload) => {
                // If not currently thinking or speaking, transition back to ready
                if (this.currentState === STATES.LISTENING) {
                    this.transitionTo(STATES.READY, payload);
                }
            });

            // AI engine events
            this.bus.on('ai:thinking', (payload) => {
                this.transitionTo(STATES.THINKING, payload);
            });

            this.bus.on('ai:speaking', (payload) => {
                this.transitionTo(STATES.SPEAKING, payload);
            });

            this.bus.on('ai:finished', (payload) => {
                this.transitionTo(STATES.FINISHED, payload);
            });

            // Error events
            this.bus.on('error', (payload) => {
                this.transitionTo(STATES.ERROR, payload);
            });
        }

        /**
         * Check if a transition to nextState is valid from currentState
         */
        canTransitionTo(nextState) {
            if (!Object.values(STATES).includes(nextState)) {
                return false;
            }
            const allowedNextStates = TRANSITIONS[this.currentState] || [];
            return allowedNextStates.includes(nextState);
        }

        /**
         * Transition to a new state safely with validation and event emission
         * @param {string} nextState Target state from STATES enum
         * @param {*} payload Associated event data
         * @returns {boolean} True if state transition succeeded
         */
        transitionTo(nextState, payload = null) {
            if (!Object.values(STATES).includes(nextState)) {
                console.error(`[VoiceStateManager] Invalid state: '${nextState}'`);
                return false;
            }

            if (this.currentState === nextState) {
                // Duplicate state transition — ignored silently
                return true;
            }

            if (this.strictTransitions && !this.canTransitionTo(nextState)) {
                console.warn(`[VoiceStateManager] Illegal state transition blocked: ${this.currentState} → ${nextState}`);
                return false;
            }

            const previousState = this.currentState;
            this.currentState = nextState;

            const awarenessMessage = AWARENESS_MESSAGES[nextState] || "I'm ready.";
            const transitionRecord = {
                previousState,
                currentState: nextState,
                awarenessMessage,
                payload,
                timestamp: Date.now()
            };

            // Maintain bounded state history
            this.stateHistory.push(transitionRecord);
            if (this.stateHistory.length > this.historyLimit) {
                this.stateHistory.shift();
            }

            // Broadcast state change to Event Bus
            if (this.bus) {
                this.bus.emit('state:changed', transitionRecord);
            }

            return true;
        }

        /**
         * Get the assistant's internal self-awareness message
         */
        getAwarenessMessage() {
            return AWARENESS_MESSAGES[this.currentState] || "I'm ready.";
        }

        /**
         * Get current state & self-awareness snapshot
         */
        getStateAwareness() {
            return {
                state: this.currentState,
                awarenessMessage: this.getAwarenessMessage()
            };
        }

        /**
         * Trigger barge-in state transition when student interrupts playback
         */
        interrupt(payload = null) {
            return this.transitionTo(STATES.INTERRUPTED, payload);
        }

        /**
         * Reset state machine back to Idle
         */
        reset() {
            const prev = this.currentState;
            this.currentState = STATES.IDLE;
            this.stateHistory = [];
            if (this.bus && prev !== STATES.IDLE) {
                this.bus.emit('state:changed', {
                    previousState: prev,
                    currentState: STATES.IDLE,
                    payload: { reset: true },
                    timestamp: Date.now()
                });
            }
        }

        /**
         * Get current active state string
         */
        getState() {
            return this.currentState;
        }

        /**
         * Helper check: voiceStateManager.is('Listening')
         */
        is(state) {
            return this.currentState === state;
        }
    }

    const defaultInstance = new VoiceStateManager(eventBus);
    defaultInstance.VoiceStateManager = VoiceStateManager;
    defaultInstance.STATES = STATES;

    return defaultInstance;
}));
