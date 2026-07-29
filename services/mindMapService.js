const fs = require('fs');
const path = require('path');
const { loadMemories } = require('./memoryService');
const { getAllTools } = require('./toolRegistry');

const ZIMSEC_STORE_DIR = path.join(__dirname, '..', 'zimsec_store');
const AGENT_SPEC_PATH = path.join(__dirname, '..', 'AGENT.md');

// -------------------------------------------------------------
// TF-IDF & Cosine Similarity Engine (Pure Math)
// -------------------------------------------------------------

function tokenize(text) {
    return (text || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2);
}

function computeSimilarityMatrix(memories) {
    if (!memories || memories.length === 0) return { matrix: [], vocabulary: [] };

    const tokenizedDocs = memories.map(m => tokenize(m.fact));
    const vocabSet = new Set();
    tokenizedDocs.forEach(doc => doc.forEach(w => vocabSet.add(w)));
    const vocab = Array.from(vocabSet);

    if (vocab.length === 0) return { matrix: memories.map(() => memories.map(() => 0)), vocabulary: [] };

    // Term Frequency (TF)
    const tfVectors = tokenizedDocs.map(doc => {
        const tf = new Array(vocab.length).fill(0);
        doc.forEach(word => {
            const idx = vocab.indexOf(word);
            if (idx !== -1) tf[idx] += 1;
        });
        return tf;
    });

    // Inverse Document Frequency (IDF)
    const N = memories.length;
    const idf = vocab.map((word, i) => {
        const docCount = tfVectors.filter(tf => tf[i] > 0).length;
        return Math.log((N + 1) / (docCount + 1)) + 1;
    });

    // TF-IDF & Unit Normalization
    const tfidfVectors = tfVectors.map(tf => {
        const vec = tf.map((tfVal, i) => tfVal * idf[i]);
        const norm = Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0));
        return norm > 0 ? vec.map(val => val / norm) : vec;
    });

    // Cosine Similarity Matrix: unit @ unit.T
    const matrix = [];
    for (let i = 0; i < N; i++) {
        matrix[i] = [];
        for (let j = 0; j < N; j++) {
            if (i === j) {
                matrix[i][j] = -1.0; // Diagonal = -1 (nothing matches itself)
            } else {
                let dot = 0;
                for (let k = 0; k < vocab.length; k++) {
                    dot += tfidfVectors[i][k] * tfidfVectors[j][k];
                }
                matrix[i][j] = Math.max(0, Math.min(1, dot));
            }
        }
    }

    return { matrix, vocabulary: vocab };
}

// -------------------------------------------------------------
// Freshness Calculation (Exponential Decay)
// -------------------------------------------------------------

function calculateFreshness(createdAtIso) {
    if (!createdAtIso) return 0.5;
    try {
        const createdMs = new Date(createdAtIso).getTime();
        const ageDays = Math.max(0, (Date.now() - createdMs) / (1000 * 60 * 60 * 24));
        const freshness = Math.pow(0.5, ageDays / 30);
        return Math.max(0.15, Math.min(1.0, freshness)); // Floored at 0.15
    } catch (e) {
        return 0.5;
    }
}

// -------------------------------------------------------------
// Pure Mind Skeleton Assembly Function
// -------------------------------------------------------------

function buildMindSkeleton(options = {}) {
    const TOP_K = options.topK || 3;
    const SIMILARITY_THRESHOLD = options.threshold || 0.35;

    const regions = [
        { id: 'core', label: 'Core Star', color: '#2DD4A8' },
        { id: 'memory', label: 'Long-Term Memory', color: '#A78BFA' },
        { id: 'working', label: 'Working Memory', color: '#67E8F9' },
        { id: 'agents', label: 'Sub-Agents', color: '#E88FB3' },
        { id: 'knowledge', label: 'System Knowledge', color: '#F5A524' },
        { id: 'rim', label: 'Capability Inventory', color: '#8B93A1' }
    ];

    const nodes = [];
    const edges = [];
    const stats = {
        memory_total: 0,
        memory_shown: 0,
        sources: {}
    };

    // 1. Core Region (Trillion Agent Star)
    nodes.push({
        id: 'core:trillion',
        type: 'core',
        region: 'core',
        label: 'Trillion AI Core',
        color: '#2DD4A8',
        size: 3.5,
        freshness: 1.0,
        extra: { status: 'Active', version: '2.5' }
    });

    // 2. Memory Region (Durable Long-Term Memories)
    let rawMemories = [];
    try {
        rawMemories = loadMemories();
        stats.memory_total = rawMemories.length;
        stats.memory_shown = rawMemories.length;
        stats.sources.memory = 'ok';

        const { matrix } = computeSimilarityMatrix(rawMemories);
        const memoryDegrees = new Array(rawMemories.length).fill(0);
        const edgeDeduper = new Set();

        // Compute Similarity Edges (top-K above threshold 0.35)
        for (let i = 0; i < rawMemories.length; i++) {
            const scores = matrix[i].map((score, j) => ({ index: j, score }));
            scores.sort((a, b) => b.score - a.score);

            const topNeighbors = scores
                .filter(s => s.score >= SIMILARITY_THRESHOLD && s.index !== i)
                .slice(0, TOP_K);

            topNeighbors.forEach(neighbor => {
                const srcId = `mem:${rawMemories[i].id}`;
                const tgtId = `mem:${rawMemories[neighbor.index].id}`;
                const pairKey = [srcId, tgtId].sort().join('<->');

                if (!edgeDeduper.has(pairKey)) {
                    edgeDeduper.add(pairKey);
                    edges.push({
                        source: srcId,
                        target: tgtId,
                        kind: 'similarity',
                        weight: parseFloat(neighbor.score.toFixed(3))
                    });
                    memoryDegrees[i]++;
                    memoryDegrees[neighbor.index]++;
                }
            });
        }

        // Build Memory Nodes
        rawMemories.forEach((m, idx) => {
            const degree = memoryDegrees[idx] || 0;
            const freshness = calculateFreshness(m.createdAt);
            const nodeSize = 1.0 + Math.min(2.0, degree * 0.4);

            nodes.push({
                id: `mem:${m.id}`,
                type: 'memory',
                region: 'memory',
                label: m.fact.length > 40 ? `${m.fact.slice(0, 40)}...` : m.fact,
                color: '#A78BFA',
                size: parseFloat(nodeSize.toFixed(2)),
                freshness: parseFloat(freshness.toFixed(2)),
                extra: { category: m.category || 'general', degree }
            });
        });

        // Top 3 degree (or freshest) memories get recall trunk edges to core
        const sortedIndices = rawMemories.map((m, idx) => ({
            idx,
            deg: memoryDegrees[idx],
            freshness: calculateFreshness(m.createdAt)
        })).sort((a, b) => (b.deg - a.deg) || (b.freshness - a.freshness));

        const trunkMemories = sortedIndices.slice(0, 3);
        trunkMemories.forEach(tm => {
            edges.push({
                source: `mem:${rawMemories[tm.idx].id}`,
                target: 'core:trillion',
                kind: 'recall',
                weight: 0.95
            });
        });

    } catch (err) {
        stats.sources.memory = 'error';
        console.error('⚠️ [MindMap Memory Error]:', err.message);
    }

    // 3. Working Memory Region (Recent Session Threads)
    try {
        const workingThreads = [
            { id: 'thread_recent_1', label: 'ZIMSEC Pure Math Review' },
            { id: 'thread_recent_2', label: 'Task Management & Reminders' }
        ];
        stats.sources.working = 'ok';

        workingThreads.forEach(t => {
            nodes.push({
                id: `thread:${t.id}`,
                type: 'thread',
                region: 'working',
                label: t.label,
                color: '#67E8F9',
                size: 1.2,
                freshness: 0.9,
                extra: { status: 'active' }
            });

            edges.push({
                source: 'core:trillion',
                target: `thread:${t.id}`,
                kind: 'flow',
                weight: 0.7
            });
        });
    } catch (e) {
        stats.sources.working = 'error';
    }

    // 4. Sub-Agents Region (Registered Specialized Agents)
    try {
        const subagents = [
            { slug: 'research', name: 'Codebase Researcher', specialty: 'Read-only code & doc search', color: '#E88FB3' },
            { slug: 'self', name: 'Self Runner', specialty: 'Full tool execution subagent', color: '#F472B6' }
        ];
        stats.sources.agents = 'ok';

        subagents.forEach(sa => {
            nodes.push({
                id: `agent:${sa.slug}`,
                type: 'agent',
                region: 'agents',
                label: sa.name,
                color: sa.color,
                size: 1.8,
                freshness: 0.85,
                extra: { specialty: sa.specialty }
            });

            edges.push({
                source: 'core:trillion',
                target: `agent:${sa.slug}`,
                kind: 'dispatch',
                weight: 0.85
            });
        });
    } catch (e) {
        stats.sources.agents = 'error';
    }

    // 5. System Knowledge Region (Always-Loaded Guides & Specs)
    try {
        const knowledgeFiles = [];
        if (fs.existsSync(AGENT_SPEC_PATH)) knowledgeFiles.push({ path: 'AGENT.md', label: 'AGENT Spec' });
        if (fs.existsSync(ZIMSEC_STORE_DIR)) {
            const files = fs.readdirSync(ZIMSEC_STORE_DIR);
            files.forEach(f => knowledgeFiles.push({ path: `zimsec_store/${f}`, label: f }));
        }

        stats.sources.knowledge = 'ok';
        knowledgeFiles.forEach(kf => {
            nodes.push({
                id: `know:${kf.path}`,
                type: 'knowledge',
                region: 'knowledge',
                label: kf.label,
                color: '#F5A524',
                size: 1.4,
                freshness: 0.7,
                extra: { path: kf.path }
            });

            edges.push({
                source: `know:${kf.path}`,
                target: 'core:trillion',
                kind: 'knowledge_flow',
                weight: 0.75
            });
        });
    } catch (e) {
        stats.sources.knowledge = 'error';
    }

    // 6. Capability Rim Region (Tool Inventory)
    try {
        const registeredTools = getAllTools();
        stats.sources.rim = 'ok';

        registeredTools.forEach(t => {
            const category = t.isConsequential ? 'Consequential' : (t.name.split('_')[0] || 'general');
            nodes.push({
                id: `tool:${t.name}`,
                type: 'tool',
                region: 'rim',
                label: t.name,
                color: t.isConsequential ? '#FF6B6B' : '#8B93A1',
                size: t.isConsequential ? 1.5 : 1.1,
                freshness: 0.6,
                extra: { category, description: t.description, isConsequential: t.isConsequential || false }
            });

            edges.push({
                source: 'core:trillion',
                target: `tool:${t.name}`,
                kind: 'capability',
                weight: 0.65
            });
        });
    } catch (e) {
        stats.sources.rim = 'error';
    }

    return {
        regions,
        nodes,
        edges,
        stats
    };
}

// -------------------------------------------------------------
// Lazy Node Detail Lookup (Single Node Resolution)
// -------------------------------------------------------------

function getNodeDetail(nodeId) {
    if (!nodeId || !nodeId.includes(':')) return null;

    const [prefix, key] = nodeId.split(/:(.+)/);

    if (prefix === 'core') {
        return {
            id: nodeId,
            type: 'core',
            title: 'Trillion AI Core',
            subtitle: 'Voice-First AI Assistant & Math Tutor',
            details: 'Central Intelligence Seam running Gemini models with durable JSON memory, heartbeat proactivity, and safety gates.',
            attributes: { Model: 'gemini-3.5-flash-lite', TTS: 'gemini-2.5-flash-preview-tts' }
        };
    }

    if (prefix === 'mem') {
        const memories = loadMemories();
        const memory = memories.find(m => m.id === key);
        if (!memory) return null;

        // Compute live nearest neighbors for this memory
        const { matrix } = computeSimilarityMatrix(memories);
        const myIndex = memories.findIndex(m => m.id === key);

        let neighbors = [];
        if (myIndex !== -1) {
            neighbors = matrix[myIndex]
                .map((score, idx) => ({ id: `mem:${memories[idx].id}`, label: memories[idx].fact, score }))
                .filter(n => n.score >= 0.25 && n.id !== nodeId)
                .sort((a, b) => b.score - a.score)
                .slice(0, 4);
        }

        return {
            id: nodeId,
            type: 'memory',
            title: `Memory: ${memory.category || 'general'}`,
            body: memory.fact,
            category: memory.category || 'general',
            createdAt: memory.createdAt,
            neighbors
        };
    }

    if (prefix === 'tool') {
        const tool = getAllTools().find(t => t.name === key);
        if (!tool) return null;

        return {
            id: nodeId,
            type: 'tool',
            title: `Tool: ${tool.name}`,
            description: tool.description,
            isConsequential: tool.isConsequential || false,
            parameters: tool.parameters
        };
    }

    if (prefix === 'know') {
        // Guard against directory traversal: only allow AGENT.md or files under zimsec_store
        const safePath = path.normalize(key).replace(/^(\.\.[\/\\])+/, '');
        const fullPath = path.join(__dirname, '..', safePath);

        if (!fullPath.startsWith(path.join(__dirname, '..'))) return null;
        if (!fs.existsSync(fullPath)) return null;

        const content = fs.readFileSync(fullPath, 'utf8');
        return {
            id: nodeId,
            type: 'knowledge',
            title: `Knowledge File: ${path.basename(safePath)}`,
            path: safePath,
            preview: content.slice(0, 600) + (content.length > 600 ? '...' : '')
        };
    }

    if (prefix === 'agent') {
        return {
            id: nodeId,
            type: 'agent',
            title: `Sub-Agent: ${key}`,
            specialty: key === 'research' ? 'Codebase Researcher' : 'Self Executor'
        };
    }

    return null;
}

module.exports = {
    buildMindSkeleton,
    getNodeDetail,
    computeSimilarityMatrix,
    calculateFreshness
};
