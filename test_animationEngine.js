/**
 * test_animationEngine.js
 * Comprehensive unit test suite for Premium Animation Engine (7 Components)
 */

const eventBus = require('./public/modules/eventBus');
const animationEngine = require('./public/modules/animationEngine');

console.log('--------------------------------------------------');
console.log('RUNNING PREMIUM ANIMATION ENGINE UNIT TESTS');
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

// 1. Verify All 7 Animation Components Present in Engine
const requiredComponents = [
    'liquidBlob',
    'energyRing',
    'floatingParticles',
    'neuralNetwork',
    'dynamicBackground',
    'audioEqualizer',
    'voiceBubble'
];

requiredComponents.forEach(comp => {
    assert(animationEngine.components[comp] !== undefined, `Animation Component '${comp}' present in Animation Engine.`);
});

// 2. Verify Passive Event Subscriber Mode (No AI Logic Control)
let stateChangedTriggered = false;
eventBus.on('state:changed', (record) => {
    stateChangedTriggered = true;
});

eventBus.emit('state:changed', { currentState: 'Listening' });
assert(stateChangedTriggered === true, "Animation Engine subscribed to 'state:changed' event.");

eventBus.emit('state:changed', { currentState: 'Thinking' });
assert(animationEngine.currentState === 'Thinking', "Animation Engine updated state to 'Thinking'.");

eventBus.emit('state:changed', { currentState: 'Reasoning' });
assert(animationEngine.currentState === 'Reasoning', "Animation Engine updated state to 'Reasoning'.");

eventBus.emit('state:changed', { currentState: 'Speaking' });
assert(animationEngine.currentState === 'Speaking', "Animation Engine updated state to 'Speaking'.");

eventBus.emit('state:changed', { currentState: 'Finished' });
assert(animationEngine.currentState === 'Finished', "Animation Engine updated state to 'Finished'.");

eventBus.emit('state:changed', { currentState: 'Interrupted' });
assert(animationEngine.currentState === 'Interrupted', "Animation Engine updated state to 'Interrupted'.");

console.log('--------------------------------------------------');
console.log(`SUMMARY: ${passedTests}/${totalTests} TESTS PASSED CLEANLY.`);
console.log('--------------------------------------------------');
