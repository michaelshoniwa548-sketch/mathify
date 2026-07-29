/**
 * public/modules/conversationalTransitions.js
 * Conversational Turn Lifecycle & Animated Transition Orchestrator
 *
 * Sequence Flow:
 *   Ready → Listening → Thinking → Speaking → Listening Again → Ready
 *
 * Requirements:
 *  - Every state transition is animated with smooth motion & visual easing curves
 *  - Automatically handles seamless transition from Speaking → Listening Again when AI speech completes
 *  - Does NOT change any backend logic (100% frontend event-driven architecture)
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define(['./eventBus', './voiceStateManager'], factory);
    } else if (typeof module === 'object' && module.exports) {
        const eventBus = require('./eventBus');
        const voiceStateManager = require('./voiceStateManager');
        module.exports = factory(eventBus, voiceStateManager);
    } else {
        root.conversationalTransitions = factory(root.eventBus, root.voiceStateManager);
    }
}(typeof self !== 'undefined' ? self : this, function (eventBus, voiceStateManager) {

    // Defined Turn Loop Sequence for conversational flow validation
    const CYCLE_SEQUENCE = Object.freeze([
        'Ready',
        'Listening',
        'Thinking',
        'Speaking',
        'Listening', // Listening Again
        'Ready'
    ]);

    class ConversationalTransitions {
        constructor(bus = eventBus, stateMgr = voiceStateManager) {
            this.bus = bus;
            this.stateMgr = stateMgr;

            this.transitionDuration = 400; // ms easing duration
            this.isTransitioning = false;
            this.currentTurnIndex = 0;
            this.targetContainer = null;

            this._initDOM();
            this._setupEventSubscriptions();
        }

        /**
         * Locate visual container element safely
         */
        _initDOM() {
            if (typeof document !== 'undefined') {
                this.targetContainer = document.getElementById('assistant-view') || document.querySelector('.assistant-container');
            }
        }

        /**
         * Subscribe to Event Bus for conversational lifecycle orchestration
         */
        _setupEventSubscriptions() {
            if (!this.bus) return;

            // Intercept & animate state transitions
            this.bus.on('state:changed', (record) => {
                this.onStateTransition(record.previousState, record.currentState, record.payload);
            });

            // Automated transition: When AI finishes speaking → Listening Again
            this.bus.on('ai:finished', (payload) => {
                this.handleSpeechCompleted(payload);
            });
        }

        /**
         * Animate visual container during state transitions
         */
        onStateTransition(prevState, nextState, payload) {
            this._initDOM();
            this.isTransitioning = true;

            // Track sequence turn index
            if (nextState === 'Ready') this.currentTurnIndex = 0;
            else if (nextState === 'Listening' && (prevState === 'Ready' || prevState === 'Idle')) this.currentTurnIndex = 1;
            else if (nextState === 'Thinking') this.currentTurnIndex = 2;
            else if (nextState === 'Speaking') this.currentTurnIndex = 3;
            else if (nextState === 'Listening' && (prevState === 'Speaking' || prevState === 'Finished')) this.currentTurnIndex = 4;

            // Apply CSS transition animation classes
            if (this.targetContainer) {
                this.targetContainer.classList.add('state-animating');
                this.targetContainer.setAttribute('data-state', nextState.toLowerCase());

                setTimeout(() => {
                    if (this.targetContainer) {
                        this.targetContainer.classList.remove('state-animating');
                    }
                    this.isTransitioning = false;
                }, this.transitionDuration);
            } else {
                this.isTransitioning = false;
            }

            // Emit transition animation event for optional subscribers
            if (this.bus) {
                this.bus.emit('transition:animated', {
                    from: prevState,
                    to: nextState,
                    turnIndex: this.currentTurnIndex,
                    duration: this.transitionDuration
                });
            }
        }

        /**
         * Automated transition: AI Speaking → Listening Again
         */
        handleSpeechCompleted(payload) {
            if (this.stateMgr && (this.stateMgr.is('Speaking') || this.stateMgr.is('Finished'))) {
                // Smoothly transition back to 'Listening' (Listening Again turn step)
                setTimeout(() => {
                    if (this.stateMgr && !this.stateMgr.is('Disconnected') && !this.stateMgr.is('Error')) {
                        this.stateMgr.transitionTo('Listening', { reason: 'Listening Again turn step', ...payload });
                    }
                }, 250);
            }
        }

        /**
         * Execute a complete manual turn loop step
         * Sequence: Ready → Listening → Thinking → Speaking → Listening → Ready
         */
        advanceTurnSequence() {
            if (!this.stateMgr) return false;

            const nextIndex = (this.currentTurnIndex + 1) % CYCLE_SEQUENCE.length;
            const nextState = CYCLE_SEQUENCE[nextIndex];

            return this.stateMgr.transitionTo(nextState, { turnSequenceStep: nextIndex });
        }

        /**
         * Get turn sequence status info
         */
        getTurnInfo() {
            return {
                currentTurnState: CYCLE_SEQUENCE[this.currentTurnIndex] || 'Ready',
                turnIndex: this.currentTurnIndex,
                isListeningAgain: this.currentTurnIndex === 4,
                isTransitioning: this.isTransitioning
            };
        }
    }

    const instance = new ConversationalTransitions(eventBus, voiceStateManager);
    instance.ConversationalTransitions = ConversationalTransitions;
    instance.CYCLE_SEQUENCE = CYCLE_SEQUENCE;

    return instance;
}));
