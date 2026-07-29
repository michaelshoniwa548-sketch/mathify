/**
 * test_liquidBlob.js
 * Unit test suite for STEP 5 Liquid Blob animation renderer
 */

const eventBus = require('./public/modules/eventBus');
const voiceStateManager = require('./public/modules/voiceStateManager');
const liquidBlob = require('./public/modules/liquidBlob');

console.log('--------------------------------------------------');
console.log('RUNNING LIQUID BLOB ANIMATION UNIT TESTS');
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

// Mock Canvas for testing 2D rendering without browser DOM
class MockCanvasContext {
    clearRect() {}
    save() {}
    restore() {}
    beginPath() {}
    moveTo() {}
    quadraticCurveTo() {}
    closePath() {}
    fill() {}
    stroke() {}
    createRadialGradient() {
        return { addColorStop() {} };
    }
}

const mockCanvas = {
    width: 320,
    height: 320,
    getContext: (type) => (type === '2d' ? new MockCanvasContext() : null)
};

// 1. Test Canvas Attachment
assert(liquidBlob.attachCanvas(mockCanvas) === true, "Liquid Blob successfully attached to Canvas context.");
assert(liquidBlob.isRunning === true, "Render loop is active.");

// 2. Test Reaction to Microphone Volume Events (voice:volume)
const initialRadius = liquidBlob.currentRadius;
eventBus.emit('voice:volume', 0.8);
assert(liquidBlob.targetVolume === 0.8, "targetVolume updated to 0.8 on 'voice:volume' event.");
assert(liquidBlob.targetRadius > initialRadius, "targetRadius expanded dynamically for volume input.");

// 3. Test Physics Update Step (60 FPS iteration simulation)
liquidBlob.update(1000);
assert(liquidBlob.volume > 0, "Volume smoothed during physics update step.");
assert(liquidBlob.points.length === 10, "10 node control points updated offset calculations.");

// 4. Test Reaction to Voice State Changes (state:changed)
voiceStateManager.transitionTo('Ready');
voiceStateManager.transitionTo('Listening');
assert(liquidBlob.currentState === 'Listening', "Liquid Blob updated state to 'Listening'.");

voiceStateManager.transitionTo('Thinking');
assert(liquidBlob.currentState === 'Thinking', "Liquid Blob updated state to 'Thinking'.");

voiceStateManager.transitionTo('Speaking');
assert(liquidBlob.currentState === 'Speaking', "Liquid Blob updated state to 'Speaking'.");

// 5. Test Render Method Output Execution
let renderSuccess = false;
try {
    liquidBlob.render();
    renderSuccess = true;
} catch (e) {
    renderSuccess = false;
}
assert(renderSuccess === true, "Render loop executed bezier curve & radial gradient fill cleanly.");

// 6. Test Stop Logic
liquidBlob.stop();
assert(liquidBlob.isRunning === false, "Render loop stopped cleanly.");

console.log('--------------------------------------------------');
console.log(`SUMMARY: ${passedTests}/${totalTests} TESTS PASSED CLEANLY.`);
console.log('--------------------------------------------------');
