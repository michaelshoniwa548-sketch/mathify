const fs = require('fs');
const path = require('path');

const MEMORY_FILE_PATH = path.join(__dirname, '..', 'memory.json');

/**
 * Load all durable memories from memory.json disk file.
 * Returns empty array if file does not exist or is invalid.
 */
function loadMemories() {
    try {
        if (!fs.existsSync(MEMORY_FILE_PATH)) {
            return [];
        }
        const data = fs.readFileSync(MEMORY_FILE_PATH, 'utf8');
        return JSON.parse(data || '[]');
    } catch (err) {
        console.warn('⚠️ [Memory Warning]: Failed to read memory.json, returning empty list.', err.message);
        return [];
    }
}

/**
 * Persist memory array back to memory.json file.
 */
function saveMemories(memories) {
    try {
        fs.writeFileSync(MEMORY_FILE_PATH, JSON.stringify(memories, null, 2), 'utf8');
    } catch (err) {
        console.error('❌ [Memory Error]: Failed to save memory.json.', err.message);
    }
}

/**
 * Add a new durable fact to memory store.
 * @param {string} fact - Single clear statement (e.g. "User prefers morning review sessions")
 * @param {string} [category="general"] - Optional category label
 */
function rememberFact(fact, category = 'general') {
    if (!fact || !fact.trim()) throw new Error('Fact content cannot be empty.');

    const memories = loadMemories();
    const newMemory = {
        id: `mem_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        category: category.toLowerCase(),
        fact: fact.trim(),
        createdAt: new Date().toISOString()
    };

    memories.push(newMemory);
    saveMemories(memories);

    // Notify Mind Map Observers if observer broadcaster exists
    try {
        const { broadcastObserverEvent } = require('../server');
        if (typeof broadcastObserverEvent === 'function') {
            broadcastObserverEvent({ type: 'memory_written', memoryId: newMemory.id });
        }
    } catch(e) {}

    return `Saved memory [#${newMemory.id}]: "${newMemory.fact}"`;
}

/**
 * Forget/delete a memory fact by ID or matching fact content.
 */
function forgetFact(idOrQuery) {
    const memories = loadMemories();
    const initialCount = memories.length;

    const filtered = memories.filter(m => 
        m.id !== idOrQuery && 
        !m.fact.toLowerCase().includes(idOrQuery.toLowerCase())
    );

    if (filtered.length === initialCount) {
        return `No memory matching "${idOrQuery}" was found to delete.`;
    }

    saveMemories(filtered);
    return `Successfully deleted memory matching "${idOrQuery}".`;
}

/**
 * Format stored facts into a clean string for system prompt context injection.
 * Treats memory purely as factual background knowledge.
 */
function getMemoryPromptContext() {
    const memories = loadMemories();
    if (memories.length === 0) {
        return 'No stored long-term memories.';
    }

    const lines = memories.map(m => `- [${m.category}] ${m.fact}`);
    return `Long-Term Memories & User Facts (Background Knowledge Only):\n${lines.join('\n')}`;
}

module.exports = {
    loadMemories,
    rememberFact,
    forgetFact,
    getMemoryPromptContext,
    MEMORY_FILE_PATH
};
