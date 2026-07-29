/**
 * test_voiceStateManager.js
 * Comprehensive unit test suite for STEP 3 Voice State Manager
 */

const eventBus = require('./public/modules/eventBus');
const voiceStateManager = require('./public/modules/voiceStateManager');

console.log('--------------------------------------------------');
console.log('RUNNING VOICE STATE MANAGER UNIT TESTS');
console.log('--------------------------------------------------');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
    totalTests++;
    if (condition) {
        passedTests++;
        console.log(`✅ [PASS] ${message}`);
    } else {
        console.error(`❌ [FAIL] ${message}`);
        process.exit(1);
    }
}

// 1. Verify All 9 Required States Exist in Enum
const requiredStates = [
    'Idle',
    'Ready',
    'Listening',
    'Thinking',
    'Speaking',
    'Finished',
    'Interrupted',
    'Disconnected',
    'Error'
];

requiredStates.forEach(state => {
    assert(Object.values(voiceStateManager.STATES).includes(state), `State enum '${state}' exists.`);
});

// 2. Test Initial State (Idle)
assert(voiceStateManager.getState() === 'Idle', "Initial state is 'Idle'.");
assert(voiceStateManager.is('Idle'), "is('Idle') returns true.");

// 3. Test Direct State Transitions Across All 9 States
assert(voiceStateManager.transitionTo('Ready'), "Transition Idle → Ready succeeded.");
assert(voiceStateManager.is('Ready'), "State is 'Ready'.");

assert(voiceStateManager.transitionTo('Listening'), "Transition Ready → Listening succeeded.");
assert(voiceStateManager.is('Listening'), "State is 'Listening'.");
assert(voiceStateManager.getAwarenessMessage() === "I'm listening.", "AI Awareness message is \"I'm listening.\".");

assert(voiceStateManager.transitionTo('Thinking'), "Transition Listening → Thinking succeeded.");
assert(voiceStateManager.is('Thinking'), "State is 'Thinking'.");
assert(voiceStateManager.getAwarenessMessage() === "I'm thinking.", "AI Awareness message is \"I'm thinking.\".");

assert(voiceStateManager.transitionTo('Searching'), "Transition Thinking → Searching succeeded.");
assert(voiceStateManager.getAwarenessMessage() === "I'm searching my knowledge.", "AI Awareness message is \"I'm searching my knowledge.\".");

assert(voiceStateManager.transitionTo('Speaking'), "Transition Searching → Speaking succeeded.");
assert(voiceStateManager.is('Speaking'), "State is 'Speaking'.");
assert(voiceStateManager.getAwarenessMessage() === "I'm speaking.", "AI Awareness message is \"I'm speaking.\".");

assert(voiceStateManager.transitionTo('Interrupted'), "Transition Speaking → Interrupted succeeded.");
assert(voiceStateManager.is('Interrupted'), "State is 'Interrupted'.");

assert(voiceStateManager.transitionTo('Listening'), "Transition Interrupted → Listening succeeded.");
assert(voiceStateManager.is('Listening'), "State is 'Listening'.");

assert(voiceStateManager.transitionTo('Thinking'), "Transition Listening → Thinking succeeded.");
assert(voiceStateManager.transitionTo('Speaking'), "Transition Thinking → Speaking succeeded.");
assert(voiceStateManager.transitionTo('Finished'), "Transition Speaking → Finished succeeded.");
assert(voiceStateManager.is('Finished'), "State is 'Finished'.");

assert(voiceStateManager.transitionTo('Disconnected'), "Transition Finished → Disconnected succeeded.");
assert(voiceStateManager.is('Disconnected'), "State is 'Disconnected'.");

assert(voiceStateManager.transitionTo('Error'), "Transition Disconnected → Error succeeded.");
assert(voiceStateManager.is('Error'), "State is 'Error'.");

assert(voiceStateManager.transitionTo('Idle'), "Transition Error → Idle succeeded.");
assert(voiceStateManager.is('Idle'), "State is 'Idle'.");

// 4. Test Event Bus Integration & Automated State Switching
let lastStateChangedEvent = null;
eventBus.on('state:changed', (record) => {
    lastStateChangedEvent = record;
});

eventBus.emit('connection:connected', { wsUrl: 'ws://localhost:3002/ws/voice' });
assert(voiceStateManager.is('Ready'), "Event 'connection:connected' switched state to 'Ready'.");
assert(lastStateChangedEvent.currentState === 'Ready', "Event Bus emitted 'state:changed' with currentState 'Ready'.");

eventBus.emit('voice:listening', { audioStreamActive: true });
assert(voiceStateManager.is('Listening'), "Event 'voice:listening' switched state to 'Listening'.");

eventBus.emit('ai:thinking', { prompt: 'solve quadratic' });
assert(voiceStateManager.is('Thinking'), "Event 'ai:thinking' switched state to 'Thinking'.");

eventBus.emit('ai:speaking', { audioUrl: 'chunk1.mp3' });
assert(voiceStateManager.is('Speaking'), "Event 'ai:speaking' switched state to 'Speaking'.");

eventBus.emit('ai:finished');
assert(voiceStateManager.is('Finished'), "Event 'ai:finished' switched state to 'Finished'.");

eventBus.emit('connection:lost');
assert(voiceStateManager.is('Disconnected'), "Event 'connection:lost' switched state to 'Disconnected'.");

eventBus.emit('error', { code: 500, message: 'API failure' });
assert(voiceStateManager.is('Error'), "Event 'error' switched state to 'Error'.");

// 5. Test State History Log
const history = voiceStateManager.stateHistory;
assert(history.length > 5, "State history recorded transitions.");
assert(history[history.length - 1].currentState === 'Error', "Last recorded state in history is 'Error'.");

console.log('--------------------------------------------------');
console.log(`SUMMARY: ${passedTests}/${totalTests} TESTS PASSED CLEANLY.`);
console.log('--------------------------------------------------');
