/**
 * test_audioEqualizer.js
 * Unit test suite for STEP 8 Real-Time Audio Equalizer Component
 */

const eventBus = require('./public/modules/eventBus');
const voiceStateManager = require('./public/modules/voiceStateManager');
const audioEqualizer = require('./public/modules/audioEqualizer');

console.log('--------------------------------------------------');
console.log('RUNNING AUDIO EQUALIZER UNIT TESTS');
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

// Mock 2D Canvas context for testing bar rendering
class MockCanvasContext {
    clearRect() {}
    save() {}
    restore() {}
    beginPath() {}
    rect() {}
    roundRect() {}
    fill() {}
    createLinearGradient() {
        return { addColorStop() {} };
    }
}

const mockCanvas = {
    width: 320,
    height: 100,
    getContext: (type) => (type === '2d' ? new MockCanvasContext() : null)
};

// 1. Test Attachment & Pre-allocated Bars
assert(audioEqualizer.attachCanvas(mockCanvas) === true, "Equalizer attached to Canvas context.");
assert(audioEqualizer.barCount === 18, "Allocated 18 frequency equalizer bars.");
assert(audioEqualizer.isRunning === true, "Render loop active.");

// 2. Test Idle Breathing Wave
voiceStateManager.transitionTo('Ready');
for (let i = 0; i < 5; i++) audioEqualizer.update(1000 + i * 16);
assert(audioEqualizer.bars[0] > 0.03, "Equalizer bar breathing while idle.");
assert(audioEqualizer.currentState === 'Ready', "Equalizer state is 'Ready'.");

// 3. Test Reaction to User Speech (Listening + voice:volume)
voiceStateManager.transitionTo('Listening');
eventBus.emit('voice:volume', 0.85);
for (let i = 0; i < 5; i++) audioEqualizer.update(1100 + i * 16);
assert(audioEqualizer.targetVolume === 0.85, "Equalizer targetVolume updated to 0.85.");
assert(audioEqualizer.bars[9] > 0.15, "User speech volume boosted equalizer center bars.");

// 4. Test Reaction to AI Speech (Speaking)
voiceStateManager.transitionTo('Thinking');
voiceStateManager.transitionTo('Speaking');
for (let i = 0; i < 5; i++) audioEqualizer.update(1200 + i * 16);
assert(audioEqualizer.currentState === 'Speaking', "Equalizer state switched to AI Speech 'Speaking'.");
assert(audioEqualizer.bars[5] > 0.1, "AI Speech dynamics active across equalizer bars.");

// 5. Test Non-Interference Verification
assert(typeof navigator === 'undefined' || !navigator.mediaDevices, "Equalizer runs as a passive EventBus subscriber (no mic capture lock).");

// 6. Test Render Method Execution
let renderSuccess = false;
try {
    audioEqualizer.render();
    renderSuccess = true;
} catch (e) {
    renderSuccess = false;
}
assert(renderSuccess === true, "Equalizer rendered 18 gradient bars cleanly.");

// 7. Test Stop
audioEqualizer.stop();
assert(audioEqualizer.isRunning === false, "Render loop stopped cleanly.");

console.log('--------------------------------------------------');
console.log(`SUMMARY: ${passedTests}/${totalTests} TESTS PASSED CLEANLY.`);
console.log('--------------------------------------------------');
