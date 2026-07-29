/**
 * public/modules/interactionManager.js
 * Interactive AI Board Reusable Component
 *
 * Visual AI States:
 *  - Ready | Listening | Thinking | Reasoning | Searching Knowledge | Generating | Speaking | Interrupted | Offline | Error
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define(['./eventBus', './voiceStateManager'], factory);
    } else if (typeof module === 'object' && module.exports) {
        const eventBus = require('./eventBus');
        const voiceStateManager = require('./voiceStateManager');
        module.exports = factory(eventBus, voiceStateManager);
    } else {
        root.interactionManager = factory(root.eventBus, root.voiceStateManager);
    }
}(typeof self !== 'undefined' ? self : this, function (eventBus, voiceStateManager) {

    // Feature Flags for modular dynamic configuration
    const FEATURE_FLAGS = {
        SHOW_LIVE_TRANSCRIPT: false, // Default false: hides raw transcripts unless debug mode enabled
        ENABLE_STATUS_BOARD: true,   // Renders Interactive AI Board
        DEBUG_MODE: false            // Toggle debug mode for raw transcript logging
    };

    // 10 Visual AI State Definitions & Micro-animation Badges
    const VISUAL_AI_STATES = Object.freeze({
        Ready: { label: 'Ready', icon: '✨', description: 'Mathify AI Assistant is online & ready', color: '#6366f1' },
        Listening: { label: 'Listening', icon: '🎙️', description: 'Listening to student input...', color: '#10b981' },
        Thinking: { label: 'Thinking', icon: '🧠', description: 'Analyzing mathematical query...', color: '#8b5cf6' },
        Reasoning: { label: 'Reasoning', icon: '⚙️', description: 'Deriving step-by-step ZIMSEC solution...', color: '#ec4899' },
        Searching_Knowledge: { label: 'Searching Knowledge', icon: '📚', description: 'Retrieving ZIMSEC syllabus & past papers...', color: '#3b82f6' },
        Generating: { label: 'Generating', icon: '⚡', description: 'Formulating mathematical response...', color: '#f59e0b' },
        Speaking: { label: 'Speaking', icon: '🔊', description: 'Mathify is speaking...', color: '#06b6d4' },
        Interrupted: { label: 'Interrupted', icon: '✋', description: 'Interrupted by student', color: '#f97316' },
        Offline: { label: 'Offline', icon: '🔌', description: 'Disconnected from live server', color: '#64748b' },
        Error: { label: 'Error', icon: '⚠️', description: 'System exception occurred', color: '#ef4444' }
    });

    // Event & State Mapping Matrix
    const STATE_MAP = Object.freeze({
        'Idle': 'Ready',
        'Ready': 'Ready',
        'assistant.ready': 'Ready',
        'Listening': 'Listening',
        'assistant.listening': 'Listening',
        'voice:listening': 'Listening',
        'Thinking': 'Thinking',
        'assistant.processing': 'Thinking',
        'ai:thinking': 'Thinking',
        'Reasoning': 'Reasoning',
        'assistant.reasoning': 'Reasoning',
        'Searching': 'Searching Knowledge',
        'assistant.searching': 'Searching Knowledge',
        'Generating': 'Generating',
        'assistant.generating': 'Generating',
        'Speaking': 'Speaking',
        'assistant.speaking': 'Speaking',
        'ai:speaking': 'Speaking',
        'Finished': 'Ready',
        'assistant.finished': 'Ready',
        'ai:finished': 'Ready',
        'Interrupted': 'Interrupted',
        'assistant.interrupted': 'Interrupted',
        'Disconnected': 'Offline',
        'connection.disconnected': 'Offline',
        'connection:lost': 'Offline',
        'Error': 'Error',
        'assistant.error': 'Error',
        'error': 'Error'
    });

    class InteractionManager {
        constructor(bus = eventBus, stateMgr = voiceStateManager) {
            this.bus = bus;
            this.stateMgr = stateMgr;
            this.featureFlags = { ...FEATURE_FLAGS };
            this.currentState = 'Ready';
            this.transcriptHistory = [];
            this.debugMode = false;

            this.statusElement = null;
            this.boardElement = null;

            this._initDOM();
            this._setupEventSubscriptions();
        }

        _initDOM() {
            if (typeof document !== 'undefined') {
                this.statusElement = document.getElementById('assistant-status');
                this.boardElement = document.getElementById('interactive-ai-board') || document.getElementById('assistant-status-board') || document.getElementById('assistant-transcript');
            }
        }

        _setupEventSubscriptions() {
            if (this.bus) {
                // Subscribe to state machine emissions carrying AI Awareness Layer payloads
                this.bus.on('state:changed', (record) => {
                    this.setVisualState(record.currentState, record.payload, record.awarenessMessage);
                });

                // Subscribe to standard dot-notation event spectrum
                const dotEvents = [
                    'assistant.ready', 'assistant.listening', 'assistant.processing',
                    'assistant.reasoning', 'assistant.searching', 'assistant.generating',
                    'assistant.speaking', 'assistant.finished', 'assistant.interrupted',
                    'assistant.error', 'connection.disconnected', 'connection.reconnecting', 'connection.connected'
                ];

                dotEvents.forEach(evt => {
                    this.bus.on(evt, (payload) => {
                        const targetState = STATE_MAP[evt] || 'Ready';
                        const awarenessMsg = (payload && payload.awarenessMessage) || (this.stateMgr ? this.stateMgr.getAwarenessMessage() : null);
                        this.setVisualState(targetState, payload, awarenessMsg);
                    });
                });
            }
        }

        /**
         * Set current Visual AI State with smooth animated transition
         */
        setVisualState(stateKey, payload = null, awarenessMessage = null) {
            this._initDOM();
            const normalizedKey = STATE_MAP[stateKey] || stateKey;
            const stateDef = VISUAL_AI_STATES[normalizedKey] || VISUAL_AI_STATES.Ready;
            this.currentState = normalizedKey;

            const dynamicAwareness = awarenessMessage || (this.stateMgr ? this.stateMgr.getAwarenessMessage() : stateDef.description);

            // 1. Update legacy text label element if present
            if (this.statusElement) {
                this.statusElement.textContent = stateDef.label;
            }

            // 2. Render Interactive AI Board Card
            if (this.boardElement && this.featureFlags.ENABLE_STATUS_BOARD) {
                this.renderBoardCard(stateDef, normalizedKey, dynamicAwareness);
            }
        }

        /**
         * Render Interactive AI Board HTML driven purely by event payloads
         */
        renderBoardCard(stateDef, stateKey, awarenessMessage) {
            if (!this.boardElement) return;

            const stateClass = `ai-state-${stateKey.toLowerCase().replace(/\s+/g, '-')}`;
            const descriptionText = awarenessMessage || stateDef.description;
            
            // Build visual board markup dynamically
            this.boardElement.innerHTML = `
                <div class="interactive-board-card ${stateClass}">
                    <div class="ai-state-header">
                        <span class="ai-state-icon">${stateDef.icon}</span>
                        <div class="ai-state-badge" style="--badge-color: ${stateDef.color}">
                            <span class="pulse-dot"></span>
                            <span class="badge-text">${stateDef.label}</span>
                        </div>
                    </div>
                    <div class="ai-state-description">${descriptionText}</div>
                    ${this.debugMode || this.featureFlags.SHOW_LIVE_TRANSCRIPT ? `<div class="debug-transcript-log" id="debug-transcript-log"></div>` : ''}
                </div>
            `;
        }

        /**
         * Toggle debug mode for transcript viewing
         */
        setDebugMode(enabled) {
            this.debugMode = Boolean(enabled);
            this.featureFlags.SHOW_LIVE_TRANSCRIPT = this.debugMode;
            this.setVisualState(this.currentState);
        }

        addTranscriptMessage(role, text) {
            this.transcriptHistory.push({ role, text, timestamp: Date.now() });
            if ((this.debugMode || this.featureFlags.SHOW_LIVE_TRANSCRIPT) && typeof document !== 'undefined') {
                this._initDOM();
                const log = document.getElementById('debug-transcript-log');
                if (log) {
                    const msg = document.createElement('div');
                    msg.className = `debug-msg ${role}`;
                    msg.textContent = `${role === 'user' ? 'Student' : 'Mathify'}: ${text}`;
                    log.appendChild(msg);
                }
            }
        }

        clearTranscript() {
            this.transcriptHistory = [];
            if (typeof document !== 'undefined') {
                const log = document.getElementById('debug-transcript-log');
                if (log) log.innerHTML = '';
            }
        }

        setFeatureFlags(flags = {}) {
            this.featureFlags = { ...this.featureFlags, ...flags };
            this.setVisualState(this.currentState);
        }
    }

    const defaultInstance = new InteractionManager(eventBus, voiceStateManager);
    defaultInstance.InteractionManager = InteractionManager;
    defaultInstance.FEATURE_FLAGS = FEATURE_FLAGS;
    defaultInstance.VISUAL_AI_STATES = VISUAL_AI_STATES;
    defaultInstance.STATUS_BOARD_LABELS = VISUAL_AI_STATES;

    return defaultInstance;
}));
