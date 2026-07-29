/**
 * test_floatingParticles.js
 * Unit test suite for STEP 7 Floating Particle System & Auto-Throttling Engine
 */

const eventBus = require('./public/modules/eventBus');
const voiceStateManager = require('./public/modules/voiceStateManager');
const floatingParticles = require('./public/modules/floatingParticles');

console.log('--------------------------------------------------');
console.log('RUNNING FLOATING PARTICLES UNIT TESTS');
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

// Mock 2D Canvas context for testing particle rendering
class MockCanvasContext {
    clearRect() {}
    save() {}
    restore() {}
    beginPath() {}
    arc() {}
    fill() {}
}

const mockCanvas = {
    width: 320,
    height: 320,
    getContext: (type) => (type === '2d' ? new MockCanvasContext() : null)
};

// 1. Test Attachment & Pre-allocated Pool
assert(floatingParticles.attachCanvas(mockCanvas) === true, "Attached to Canvas context.");
assert(floatingParticles.particles.length === 60, "Pre-allocated 60 particle objects in pool.");
assert(floatingParticles.currentParticleCount === 60, "Initial active particle count is 60.");

// 2. Test Reaction to Microphone Volume
eventBus.emit('voice:volume', 0.9);
floatingParticles.update(1000);
assert(floatingParticles.targetVolume === 0.9, "Microphone volume event (0.9) updated targetVolume.");

// 3. Test Reaction to AI Speech State (Speaking)
voiceStateManager.transitionTo('Ready');
voiceStateManager.transitionTo('Listening');
voiceStateManager.transitionTo('Thinking');
voiceStateManager.transitionTo('Speaking');
floatingParticles.update(1050);
assert(floatingParticles.currentState === 'Speaking', "Particles reacted to AI Speech state 'Speaking'.");

// 4. Test Reaction to Thinking State (Thinking - spiraling vortex)
voiceStateManager.transitionTo('Listening');
voiceStateManager.transitionTo('Thinking');
for (let i = 0; i < 25; i++) floatingParticles.update(1100 + i * 16);
assert(floatingParticles.currentState === 'Thinking', "Particles reacted to Thinking state 'Thinking'.");
assert(floatingParticles.particles[0].distance < 90, "Thinking state pulled particles inward toward vortex center.");

// 5. Test Automatic Device Auto-Scaling / FPS Throttling
// Simulate slow device rendering (delta = 35ms → ~28 FPS) over 65 frames
floatingParticles.fpsHistory = [];
let simulatedTime = 1000;
for (let i = 0; i < 65; i++) {
    simulatedTime += 35; // 35ms delta per frame (~28 FPS)
    floatingParticles._checkPerformance(simulatedTime);
}

assert(floatingParticles.isLowPerformanceMode === true, "Auto-detected slow device FPS (< 45 FPS).");
assert(floatingParticles.currentParticleCount === 25, "Automatically reduced particle count to 25 to maintain 60 FPS.");

// 6. Test Rendering Execution
let renderSuccess = false;
try {
    floatingParticles.render();
    renderSuccess = true;
} catch (e) {
    renderSuccess = false;
}
assert(renderSuccess === true, "Render loop executed particle arc & fill steps cleanly.");

// 7. Test Stop
floatingParticles.stop();
assert(floatingParticles.isRunning === false, "Render loop stopped cleanly.");

console.log('--------------------------------------------------');
console.log(`SUMMARY: ${passedTests}/${totalTests} TESTS PASSED CLEANLY.`);
console.log('--------------------------------------------------');
