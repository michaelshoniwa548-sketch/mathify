import * as THREE from 'three';

// Fixed Region Anchors in 3D Space
export const ANCHORS = {
    core: new THREE.Vector3(0, 0, 0),
    memory: new THREE.Vector3(-14, 3, -6),
    working: new THREE.Vector3(12, -2, 6),
    agents: new THREE.Vector3(-11, 10, 8),
    knowledge: new THREE.Vector3(12, 11, -8),
    rim: new THREE.Vector3(0, -13, -2)
};

// Deterministic FNV-1a Hash for repeatable seeding
export function hashString(str) {
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return (hash >>> 0) / 4294967295;
}

/**
 * Precalculate positions for all nodes based on their region layout algorithms.
 * Returns a Map of nodeId -> THREE.Vector3 position.
 */
export function computeNodePositions(nodes, edges) {
    const positions = new Map();

    // Group nodes by region
    const memoryNodes = nodes.filter(n => n.region === 'memory');
    const workingNodes = nodes.filter(n => n.region === 'working');
    const agentNodes = nodes.filter(n => n.region === 'agents');
    const knowNodes = nodes.filter(n => n.region === 'knowledge');
    const rimNodes = nodes.filter(n => n.region === 'rim');

    // 1. Core Node
    positions.set('core:trillion', ANCHORS.core.clone());

    // 2. Memory Region — Precomputed 150-iteration Force-Directed Web
    if (memoryNodes.length > 0) {
        const memPos = [];
        const memVel = [];
        const memAnchor = ANCHORS.memory;

        // Seed initial positions deterministically around memory anchor
        memoryNodes.forEach((node, idx) => {
            const h1 = hashString(node.id + '_x');
            const h2 = hashString(node.id + '_y');
            const h3 = hashString(node.id + '_z');
            const p = new THREE.Vector3(
                memAnchor.x + (h1 - 0.5) * 12,
                memAnchor.y + (h2 - 0.5) * 12,
                memAnchor.z + (h3 - 0.5) * 12
            );
            memPos.push(p);
            memVel.push(new THREE.Vector3());
        });

        // Similarity Edges lookup map
        const simEdges = edges.filter(e => e.kind === 'similarity');

        // Run 150 iterations of force-directed physics
        const ITERATIONS = 150;
        const DAMPING = 0.82;
        const REPULSION = 12.0;
        const GRAVITY = 0.05;

        for (let iter = 0; iter < ITERATIONS; iter++) {
            // Repulsion between memory nodes
            for (let i = 0; i < memoryNodes.length; i++) {
                for (let j = i + 1; j < memoryNodes.length; j++) {
                    const diff = memPos[i].clone().sub(memPos[j]);
                    let dist = diff.length();
                    if (dist < 0.1) dist = 0.1;

                    const forceMag = REPULSION / (dist * dist);
                    const force = diff.normalize().multiplyScalar(forceMag);
                    memVel[i].add(force);
                    memVel[j].sub(force);
                }
            }

            // Spring Attraction along similarity edges
            simEdges.forEach(e => {
                const i = memoryNodes.findIndex(n => n.id === e.source);
                const j = memoryNodes.findIndex(n => n.id === e.target);
                if (i !== -1 && j !== -1) {
                    const diff = memPos[j].clone().sub(memPos[i]);
                    const dist = diff.length();
                    const targetDist = 2.5;
                    const springMag = (dist - targetDist) * (e.weight || 0.5) * 0.15;
                    const force = diff.normalize().multiplyScalar(springMag);
                    memVel[i].add(force);
                    memVel[j].sub(force);
                }
            });

            // Gravity toward memory anchor & velocity update
            for (let i = 0; i < memoryNodes.length; i++) {
                const grav = memAnchor.clone().sub(memPos[i]).multiplyScalar(GRAVITY);
                memVel[i].add(grav);
                memVel[i].multiplyScalar(DAMPING);
                memPos[i].add(memVel[i]);
            }
        }

        memoryNodes.forEach((node, idx) => {
            positions.set(node.id, memPos[idx]);
        });
    }

    // 3. Working Memory Region — Small Ring around anchor
    const wAnchor = ANCHORS.working;
    workingNodes.forEach((node, idx) => {
        const angle = (idx / Math.max(1, workingNodes.length)) * Math.PI * 2;
        const radius = 3.5;
        const pos = new THREE.Vector3(
            wAnchor.x + Math.cos(angle) * radius,
            wAnchor.y + Math.sin(idx) * 0.8,
            wAnchor.z + Math.sin(angle) * radius
        );
        positions.set(node.id, pos);
    });

    // 4. Sub-Agents Region — Vertical Arc
    const aAnchor = ANCHORS.agents;
    agentNodes.forEach((node, idx) => {
        const t = (idx - (agentNodes.length - 1) / 2) * 2.8;
        const pos = new THREE.Vector3(
            aAnchor.x + Math.sin(idx * 0.5) * 1.5,
            aAnchor.y + t,
            aAnchor.z + Math.cos(idx * 0.5) * 1.5
        );
        positions.set(node.id, pos);
    });

    // 5. System Knowledge Region — Flat Grid
    const kAnchor = ANCHORS.knowledge;
    const cols = Math.ceil(Math.sqrt(knowNodes.length));
    knowNodes.forEach((node, idx) => {
        const r = Math.floor(idx / cols);
        const c = idx % cols;
        const spacing = 3.0;
        const pos = new THREE.Vector3(
            kAnchor.x + (c - (cols - 1) / 2) * spacing,
            kAnchor.y,
            kAnchor.z + (r - Math.floor(knowNodes.length / cols) / 2) * spacing
        );
        positions.set(node.id, pos);
    });

    // 6. Capability Rim Region — Golden-Angle Spherical Distribution Ball
    const rAnchor = ANCHORS.rim;
    const phi = (1 + Math.sqrt(5)) / 2; // Golden ratio
    rimNodes.forEach((node, idx) => {
        const i = idx + 0.5;
        const y = 1 - (i / rimNodes.length) * 2;
        const radius = Math.sqrt(1 - y * y) * 5.0;
        const theta = (2 * Math.PI * i) / phi;

        const pos = new THREE.Vector3(
            rAnchor.x + Math.cos(theta) * radius,
            rAnchor.y + y * 5.0,
            rAnchor.z + Math.sin(theta) * radius
        );
        positions.set(node.id, pos);
    });

    return positions;
}
