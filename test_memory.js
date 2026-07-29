const memoryStore = require('./services/memoryStore');
const toolRegistry = require('./services/toolRegistry');

async function testMemory() {
    console.log('--- 1. Testing loadMemory ---');
    const initialFacts = memoryStore.loadMemory();
    console.log(`Loaded ${initialFacts.length} fact(s):`, initialFacts);
    if (!initialFacts || initialFacts.length === 0) throw new Error('Failed to load initial memory');

    console.log('\n--- 2. Testing record_memory_fact tool ---');
    const recRes = await toolRegistry.executeTool('record_memory_fact', {
        fact: 'User prefers short and concise answers without unnecessary fluff.'
    });
    console.log('Record Result:', recRes);
    if (!recRes.success) throw new Error('record_memory_fact failed');

    console.log('\n--- 3. Testing memory file persistence ---');
    const updatedFacts = memoryStore.loadMemory();
    console.log(`Now loaded ${updatedFacts.length} fact(s):`, updatedFacts);
    const hasRecorded = updatedFacts.some(f => f.fact.includes('concise answers'));
    if (!hasRecorded) throw new Error('Recorded fact not persisted in memory.json!');

    console.log('\n--- 4. Testing forget_memory_fact tool ---');
    const forgetRes = await toolRegistry.executeTool('forget_memory_fact', {
        target: 'concise answers'
    });
    console.log('Forget Result:', forgetRes);
    if (!forgetRes.success) throw new Error('forget_memory_fact failed');

    console.log('\n--- 5. Verify cleanup ---');
    const finalFacts = memoryStore.loadMemory();
    const stillHasRecorded = finalFacts.some(f => f.fact.includes('concise answers'));
    if (stillHasRecorded) throw new Error('Fact was not removed after forgetFact!');

    console.log('\n✅ All Memory Store tests passed successfully!');
}

testMemory().catch(err => {
    console.error('❌ Memory Test failed:', err);
    process.exit(1);
});
