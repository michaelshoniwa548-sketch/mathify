/**
 * test_energyRing.js
 * Unit test suite for STEP 6 Energy Ring CSS Transform Animation Controller
 */

const eventBus = require('./public/modules/eventBus');
const voiceStateManager = require('./public/modules/voiceStateManager');
const energyRing = require('./public/modules/energyRing');

console.log('--------------------------------------------------');
console.log('RUNNING ENERGY RING UNIT TESTS');
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

// Mock DOM Element for testing classList operations
class MockElement {
    constructor() {
        this.classes = new Set();
    }
    get classList() {
        return {
            add: (c) => this.classes.add(c),
            remove: (...cs) => cs.forEach(c => this.classes.delete(c)),
            contains: (c) => this.classes.has(c)
        };
    }
}

const mockRingElement = new MockElement();
assert(energyRing.attachElement(mockRingElement) === true, "Energy Ring successfully attached to mock DOM element.");

// 1. Test All Required 7 States Mappings
const stateTests = [
    { state: 'Ready', expectedClass: 'state-ready' },
    { state: 'Listening', expectedClass: 'state-listening' },
    { state: 'Thinking', expectedClass: 'state-thinking' },
    { state: 'Speaking', expectedClass: 'state-speaking' },
    { state: 'Interrupted', expectedClass: 'state-interrupted' },
    { state: 'Disconnected', expectedClass: 'state-disconnected' },
    { state: 'Error', expectedClass: 'state-error' }
];

stateTests.forEach(item => {
    voiceStateManager.transitionTo(item.state);
    assert(mockRingElement.classList.contains(item.expectedClass), `State '${item.state}' applies CSS class '${item.expectedClass}'.`);
});

// 2. Verify Single Class Active Guarantee
let activeClassCount = 0;
mockRingElement.classes.forEach(c => { if (c.startsWith('state-')) activeClassCount++; });
assert(activeClassCount === 1, "Only one state CSS class active on element simultaneously.");

console.log('--------------------------------------------------');
console.log(`SUMMARY: ${passedTests}/${totalTests} TESTS PASSED CLEANLY.`);
console.log('--------------------------------------------------');
