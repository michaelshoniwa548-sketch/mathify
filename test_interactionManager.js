/**
 * test_interactionManager.js
 * Unit test suite for STEP 4 Status Board & Feature Flag architecture
 */

const eventBus = require('./public/modules/eventBus');
const voiceStateManager = require('./public/modules/voiceStateManager');
const interactionManager = require('./public/modules/interactionManager');

console.log('--------------------------------------------------');
console.log('RUNNING STATUS BOARD & INTERACTION MANAGER UNIT TESTS');
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

// 1. Verify Feature Flags
assert(interactionManager.featureFlags.SHOW_LIVE_TRANSCRIPT === false, "Feature flag SHOW_LIVE_TRANSCRIPT is false by default.");
assert(interactionManager.featureFlags.ENABLE_STATUS_BOARD === true, "Feature flag ENABLE_STATUS_BOARD is true by default.");

// 2. Verify Required Visual AI States Mapping
const requiredStates = [
    { state: 'Ready', label: 'Ready' },
    { state: 'Listening', label: 'Listening' },
    { state: 'Thinking', label: 'Thinking' },
    { state: 'Reasoning', label: 'Reasoning' },
    { state: 'Searching_Knowledge', label: 'Searching Knowledge' },
    { state: 'Generating', label: 'Generating' },
    { state: 'Speaking', label: 'Speaking' },
    { state: 'Interrupted', label: 'Interrupted' },
    { state: 'Offline', label: 'Offline' },
    { state: 'Error', label: 'Error' }
];

requiredStates.forEach(item => {
    const mapped = interactionManager.VISUAL_AI_STATES[item.state]?.label;
    assert(mapped === item.label, `State '${item.state}' maps to Visual AI State label '${item.label}'.`);
});

// 3. Test Visual AI Board Rendering Triggers via EventBus & Voice State Manager
let mockStatusText = '';
interactionManager.statusElement = { set textContent(val) { mockStatusText = val; } };

voiceStateManager.transitionTo('Ready');
assert(mockStatusText === 'Ready', "State 'Ready' updated status element to 'Ready'.");

voiceStateManager.transitionTo('Listening');
assert(mockStatusText === 'Listening', "State 'Listening' updated status element to 'Listening'.");

voiceStateManager.transitionTo('Thinking');
assert(mockStatusText === 'Thinking', "State 'Thinking' updated status element to 'Thinking'.");

voiceStateManager.transitionTo('Speaking');
assert(mockStatusText === 'Speaking', "State 'Speaking' updated status element to 'Speaking'.");

voiceStateManager.transitionTo('Disconnected');
assert(mockStatusText === 'Offline', "State 'Disconnected' updated status element to 'Offline'.");

voiceStateManager.transitionTo('Error');
assert(mockStatusText === 'Error', "State 'Error' updated status element to 'Error'.");

// 4. Test Preserved Transcript Behavior (Gated by Feature Flag)
interactionManager.addTranscriptMessage('user', 'Hello Mathify');
assert(interactionManager.transcriptHistory.length === 1, "Transcript message preserved in history array.");

// 5. Test Reversibility (Toggling Feature Flag ON)
interactionManager.setFeatureFlags({ SHOW_LIVE_TRANSCRIPT: true });
assert(interactionManager.featureFlags.SHOW_LIVE_TRANSCRIPT === true, "SHOW_LIVE_TRANSCRIPT toggled to true.");

interactionManager.addTranscriptMessage('ai', 'Welcome back!');
assert(interactionManager.transcriptHistory.length === 2, "Transcript active with feature flag enabled.");

// Restore default flag
interactionManager.setFeatureFlags({ SHOW_LIVE_TRANSCRIPT: false });
assert(interactionManager.featureFlags.SHOW_LIVE_TRANSCRIPT === false, "SHOW_LIVE_TRANSCRIPT restored to false.");

console.log('--------------------------------------------------');
console.log(`SUMMARY: ${passedTests}/${totalTests} TESTS PASSED CLEANLY.`);
console.log('--------------------------------------------------');
