/**
 * test_conversationalTransitions.js
 * Unit test suite for STEP 9 Conversational Transitions Orchestrator
 */

const eventBus = require('./public/modules/eventBus');
const voiceStateManager = require('./public/modules/voiceStateManager');
const conversationalTransitions = require('./public/modules/conversationalTransitions');

console.log('--------------------------------------------------');
console.log('RUNNING CONVERSATIONAL TRANSITIONS UNIT TESTS');
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

// 1. Verify Turn Loop Sequence Definition
const expectedSequence = ['Ready', 'Listening', 'Thinking', 'Speaking', 'Listening', 'Ready'];
assert(
    JSON.stringify(conversationalTransitions.CYCLE_SEQUENCE) === JSON.stringify(expectedSequence),
    "Turn loop sequence defined: Ready → Listening → Thinking → Speaking → Listening Again → Ready."
);

// 2. Track Transition Animated Events
let lastTransitionEvent = null;
eventBus.on('transition:animated', (record) => {
    lastTransitionEvent = record;
});

// 3. Test Step 1: Ready → Listening
voiceStateManager.transitionTo('Ready');
voiceStateManager.transitionTo('Listening');
assert(lastTransitionEvent.from === 'Ready' && lastTransitionEvent.to === 'Listening', "Transition 1: Animated Ready → Listening.");
assert(lastTransitionEvent.turnIndex === 1, "Turn index updated to 1 (Listening).");

// 4. Test Step 2: Listening → Thinking
voiceStateManager.transitionTo('Thinking');
assert(lastTransitionEvent.from === 'Listening' && lastTransitionEvent.to === 'Thinking', "Transition 2: Animated Listening → Thinking.");
assert(lastTransitionEvent.turnIndex === 2, "Turn index updated to 2 (Thinking).");

// 5. Test Step 3: Thinking → Speaking
voiceStateManager.transitionTo('Speaking');
assert(lastTransitionEvent.from === 'Thinking' && lastTransitionEvent.to === 'Speaking', "Transition 3: Animated Thinking → Speaking.");
assert(lastTransitionEvent.turnIndex === 3, "Turn index updated to 3 (Speaking).");

// 6. Test Step 4: Speaking → Listening Again (Automated on ai:finished)
eventBus.emit('ai:finished');
// Fast-forward timeout delay
setTimeout(() => {
    assert(voiceStateManager.is('Listening'), "Transition 4: Automated transition Speaking → Listening Again.");
    const turnInfo = conversationalTransitions.getTurnInfo();
    assert(turnInfo.isListeningAgain === true, "Turn info correctly identifies 'Listening Again' step (turnIndex 4).");

    // 7. Test Step 5: Listening Again → Ready
    voiceStateManager.transitionTo('Ready');
    assert(voiceStateManager.is('Ready'), "Transition 5: Animated Listening Again → Ready.");
    assert(conversationalTransitions.getTurnInfo().turnIndex === 0, "Turn sequence reset back to 0 (Ready).");

    console.log('--------------------------------------------------');
    console.log(`SUMMARY: ${passedTests}/${totalTests} TESTS PASSED CLEANLY.`);
    console.log('--------------------------------------------------');
}, 350);
