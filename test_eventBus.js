/**
 * test_eventBus.js
 * Comprehensive unit test suite for STEP 2 Event Bus architecture
 */

const eventBus = require('./public/modules/eventBus');

console.log('--------------------------------------------------');
console.log('RUNNING EVENT BUS UNIT TESTS');
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

// 1. Verify Event Constants
const requiredEvents = [
    'assistant.ready',
    'assistant.listening',
    'assistant.processing',
    'assistant.reasoning',
    'assistant.speaking',
    'assistant.finished',
    'assistant.interrupted',
    'assistant.error',
    'microphone.volume',
    'connection.connected',
    'connection.reconnecting',
    'connection.disconnected',
    'voice:listening',
    'voice:volume',
    'voice:stopped',
    'ai:thinking',
    'ai:speaking',
    'ai:finished',
    'connection:connected',
    'connection:lost',
    'error'
];

requiredEvents.forEach(evt => {
    assert(Object.values(eventBus.EVENTS).includes(evt), `Event constant for '${evt}' exists.`);
});

// 2. Test Subscribe & Emit
let receivedPayload = null;
const unsubVoiceListening = eventBus.on('voice:listening', (payload) => {
    receivedPayload = payload;
});

eventBus.emit('voice:listening', { micActive: true, sampleRate: 44100 });
assert(receivedPayload && receivedPayload.micActive === true, "Emitted 'voice:listening' received by subscriber.");

// 3. Test Volume Stream Event
let volumeLevel = 0;
eventBus.on('voice:volume', (vol) => { volumeLevel = vol; });
eventBus.emit('voice:volume', 0.85);
assert(volumeLevel === 0.85, "Emitted 'voice:volume' (0.85) received correctly.");

// 4. Test State History
assert(eventBus.getLastState('voice:volume') === 0.85, "getLastState('voice:volume') returns cached 0.85.");

// 5. Test Unsubscribe
unsubVoiceListening();
receivedPayload = null;
eventBus.emit('voice:listening', { micActive: false });
assert(receivedPayload === null, "Unsubscribed listener did not receive emission after off().");

// 6. Test Wildcard Listener
let wildcardCaptured = [];
eventBus.on('*', (item) => {
    wildcardCaptured.push(item.event);
});

eventBus.emit('ai:thinking', { prompt: 'solve 2x=4' });
eventBus.emit('ai:speaking', { audioUrl: 'data:audio/mp3;base64,...' });
eventBus.emit('ai:finished');
eventBus.emit('connection:connected');
eventBus.emit('connection:lost');
eventBus.emit('error', { message: 'Network timeout' });

assert(wildcardCaptured.includes('ai:thinking'), "Wildcard listener captured 'ai:thinking'");
assert(wildcardCaptured.includes('ai:speaking'), "Wildcard listener captured 'ai:speaking'");
assert(wildcardCaptured.includes('ai:finished'), "Wildcard listener captured 'ai:finished'");
assert(wildcardCaptured.includes('connection:connected'), "Wildcard listener captured 'connection:connected'");
assert(wildcardCaptured.includes('connection:lost'), "Wildcard listener captured 'connection:lost'");
assert(wildcardCaptured.includes('error'), "Wildcard listener captured 'error'");

// 7. Test Once Subscriber
let onceCount = 0;
eventBus.once('voice:stopped', () => { onceCount++; });
eventBus.emit('voice:stopped');
eventBus.emit('voice:stopped');
assert(onceCount === 1, "once() subscriber executed exactly once.");

console.log('--------------------------------------------------');
console.log(`SUMMARY: ${passedTests}/${totalTests} TESTS PASSED CLEANLY.`);
console.log('--------------------------------------------------');
