import * as THREE from 'three';
import { fetchNodeDetail } from './data.js';

let scene, camera, controls, mindSkeleton, nodePositions, nodesManager, edgesManager;
let raycaster, mouse;
let hoveredNodeId = null;
let edgeHighlightMesh = null;
let isFlying = false;
let flyTargetPos = null;
let flyTargetLook = null;

export function initInspector(ctx) {
    scene = ctx.scene;
    camera = ctx.camera;
    controls = ctx.controls;
    mindSkeleton = ctx.mindSkeleton;
    nodePositions = ctx.nodePositions;
    nodesManager = ctx.nodesManager;
    edgesManager = ctx.edgesManager;

    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    // Event Listeners
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('click', onClick);
    window.addEventListener('keydown', onKeyDown);

    // Build Legend Region Toggle Chips
    buildLegendPanel();

    // Setup Search Input
    setupSearchInput();

    // Setup Inspector Close Button
    const closeBtn = document.getElementById('inspector-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeInspector);
    }

    // Deep Linking: Read #node=<id> from hash
    checkHashDeepLink();
}

// -------------------------------------------------------------
// Raycasting & Hover Tooltip
// -------------------------------------------------------------

function onPointerMove(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    const tooltip = document.getElementById('mind-tooltip');
    if (!tooltip) return;

    raycaster.setFromCamera(mouse, camera);

    // Raycast targets: InstancedMeshes and custom node meshes
    const raycastTargets = [];
    nodesManager.instancedMeshes.forEach(mesh => {
        if (mesh.parent && isVisibleParentChain(mesh)) {
            raycastTargets.push(mesh);
        }
    });

    // Add Core Star and Subagent meshes
    nodesManager.nodeMetadata.forEach(meta => {
        if (meta.mesh && isVisibleParentChain(meta.mesh)) {
            raycastTargets.push(meta.mesh);
        }
    });

    const intersects = raycaster.intersectObjects(raycastTargets, false);

    if (intersects.length > 0) {
        const hit = intersects[0];
        let nodeId = null;

        if (hit.object.isInstancedMesh && hit.object.userData.nodeIds) {
            nodeId = hit.object.userData.nodeIds[hit.instanceId];
        } else {
            // Find node ID by matching mesh reference
            for (const [id, meta] of nodesManager.nodeMetadata.entries()) {
                if (meta.mesh === hit.object) {
                    nodeId = id;
                    break;
                }
            }
        }

        if (nodeId && nodeId !== hoveredNodeId) {
            hoveredNodeId = nodeId;
            const meta = nodesManager.nodeMetadata.get(nodeId);
            const nodeData = meta ? meta.node : mindSkeleton.nodes.find(n => n.id === nodeId);

            if (nodeData) {
                showTooltip(event.clientX, event.clientY, nodeData);
                highlightNodeEdges(nodeId);
            }
        } else if (nodeId) {
            moveTooltip(event.clientX, event.clientY);
        }
    } else {
        if (hoveredNodeId) {
            hoveredNodeId = null;
            hideTooltip();
            clearEdgeHighlight();
        }
    }
}

function isVisibleParentChain(obj) {
    let curr = obj;
    while (curr) {
        if (!curr.visible) return false;
        curr = curr.parent;
    }
    return true;
}

function showTooltip(x, y, nodeData) {
    const tooltip = document.getElementById('mind-tooltip');
    if (!tooltip) return;

    tooltip.innerHTML = `
        <div class="tooltip-region">${nodeData.region || 'Region'}</div>
        <div class="tooltip-label">${escapeHtml(nodeData.label)}</div>
        <div class="tooltip-extra">Type: ${escapeHtml(nodeData.type)}</div>
    `;

    tooltip.classList.remove('hidden');
    moveTooltip(x, y);
}

function moveTooltip(x, y) {
    const tooltip = document.getElementById('mind-tooltip');
    if (!tooltip) return;
    tooltip.style.left = `${x + 14}px`;
    tooltip.style.top = `${y + 14}px`;
}

function hideTooltip() {
    const tooltip = document.getElementById('mind-tooltip');
    if (tooltip) tooltip.classList.add('hidden');
}

function escapeHtml(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// -------------------------------------------------------------
// Hover Edge Highlight (Bright Overlay Lines)
// -------------------------------------------------------------

function highlightNodeEdges(nodeId) {
    clearEdgeHighlight();

    // Dim base line opacity
    edgesManager.kindGroups.forEach(group => {
        if (group.material) group.material.opacity = 0.04;
    });

    // Find all edges connected to nodeId
    const connectedEdges = mindSkeleton.edges.filter(e => e.source === nodeId || e.target === nodeId);
    if (connectedEdges.length === 0) return;

    const overlayPoints = [];
    connectedEdges.forEach(e => {
        const curve = edgesManager.curveRegistry.get(`${e.source}|${e.target}`);
        if (curve) {
            const pts = curve.getPoints(24);
            for (let i = 0; i < pts.length - 1; i++) {
                overlayPoints.push(pts[i], pts[i + 1]);
            }
        }
    });

    const geo = new THREE.BufferGeometry().setFromPoints(overlayPoints);
    const mat = new THREE.LineBasicMaterial({
        color: new THREE.Color('#2DD4A8'),
        linewidth: 2,
        transparent: true,
        opacity: 0.95
    });

    edgeHighlightMesh = new THREE.LineSegments(geo, mat);
    scene.add(edgeHighlightMesh);
}

function clearEdgeHighlight() {
    if (edgeHighlightMesh) {
        scene.remove(edgeHighlightMesh);
        edgeHighlightMesh.geometry.dispose();
        edgeHighlightMesh.material.dispose();
        edgeHighlightMesh = null;
    }

    // Restore base edge opacities
    const kindOpacities = {
        similarity: 0.16,
        recall: 0.28,
        flow: 0.22,
        dispatch: 0.25,
        knowledge_flow: 0.20,
        capability: 0.14
    };

    edgesManager.kindGroups.forEach((group, kind) => {
        if (group.material) {
            group.material.opacity = kindOpacities[kind] || 0.18;
        }
    });
}

// -------------------------------------------------------------
// Click Camera Fly-To & Inspector Open
// -------------------------------------------------------------

let pointerDownPos = { x: 0, y: 0 };

window.addEventListener('pointerdown', (e) => {
    pointerDownPos = { x: e.clientX, y: e.clientY };
});

function onClick(event) {
    const dist = Math.hypot(event.clientX - pointerDownPos.x, event.clientY - pointerDownPos.y);
    if (dist > 6) return; // Ignore drag operations

    if (hoveredNodeId) {
        focusNode(hoveredNodeId);
        openInspector(hoveredNodeId);
    }
}

export function focusNode(nodeId) {
    const pos = nodePositions.get(nodeId);
    if (!pos) return;

    // Update URL hash for deep linking
    window.history.replaceState(null, '', `#node=${nodeId}`);

    controls.autoRotate = false;

    const offsetDir = camera.position.clone().sub(controls.target).normalize();
    const targetCamPos = pos.clone().add(offsetDir.multiplyScalar(12));

    flyCameraTo(targetCamPos, pos);
}

function flyCameraTo(camPos, lookTarget) {
    isFlying = true;
    flyTargetPos = camPos.clone();
    flyTargetLook = lookTarget.clone();

    function step() {
        if (!isFlying) return;

        camera.position.lerp(flyTargetPos, 0.08);
        controls.target.lerp(flyTargetLook, 0.08);

        if (camera.position.distanceTo(flyTargetPos) < 0.2) {
            camera.position.copy(flyTargetPos);
            controls.target.copy(flyTargetLook);
            isFlying = false;
        } else {
            requestAnimationFrame(step);
        }
    }

    step();
}

// -------------------------------------------------------------
// Slide-in Node Inspector Panel
// -------------------------------------------------------------

async function openInspector(nodeId) {
    const panel = document.getElementById('mind-inspector');
    const container = document.getElementById('inspector-content');
    if (!panel || !container) return;

    panel.classList.remove('hidden');
    container.innerHTML = '<p class="placeholder-text">Loading node details...</p>';

    const detail = await fetchNodeDetail(nodeId);

    if (!detail) {
        container.innerHTML = `<h3 class="inspector-title">${escapeHtml(nodeId)}</h3><p class="placeholder-text">No additional details available for this node.</p>`;
        return;
    }

    // Build DOM safely using textContent (No raw innerHTML for user strings)
    container.innerHTML = '';

    const titleEl = document.createElement('h3');
    titleEl.className = 'inspector-title';
    titleEl.textContent = detail.title || detail.id;
    container.appendChild(titleEl);

    const badgeEl = document.createElement('span');
    badgeEl.className = 'badge';
    badgeEl.style.backgroundColor = '#A78BFA';
    badgeEl.style.color = '#0F172A';
    badgeEl.textContent = detail.type.toUpperCase();
    container.appendChild(badgeEl);

    const bodyEl = document.createElement('div');
    bodyEl.className = 'inspector-body';
    bodyEl.textContent = detail.body || detail.description || detail.details || detail.preview || 'No details provided.';
    container.appendChild(bodyEl);

    // Nearest Neighbors Section (for memories)
    if (detail.neighbors && detail.neighbors.length > 0) {
        const neighborSec = document.createElement('div');
        neighborSec.className = 'neighbor-section';

        const nHeader = document.createElement('h4');
        nHeader.textContent = 'Semantically Similar Memories';
        neighborSec.appendChild(nHeader);

        detail.neighbors.forEach(n => {
            const link = document.createElement('div');
            link.className = 'neighbor-link';

            const labelSpan = document.createElement('span');
            labelSpan.textContent = n.label.length > 32 ? `${n.label.slice(0, 32)}...` : n.label;

            const scoreSpan = document.createElement('span');
            scoreSpan.className = 'neighbor-score';
            scoreSpan.textContent = `${(n.score * 100).toFixed(0)}%`;

            link.appendChild(labelSpan);
            link.appendChild(scoreSpan);

            link.addEventListener('click', () => {
                focusNode(n.id);
                openInspector(n.id);
            });

            neighborSec.appendChild(link);
        });

        container.appendChild(neighborSec);
    }
}

function closeInspector() {
    const panel = document.getElementById('mind-inspector');
    if (panel) panel.classList.add('hidden');
}

// -------------------------------------------------------------
// Search Bar Implementation
// -------------------------------------------------------------

function setupSearchInput() {
    const input = document.getElementById('mind-search');
    if (!input) return;

    input.addEventListener('keydown', (e) => {
        e.stopPropagation(); // Stop key events from triggering camera shortcuts

        if (e.key === 'Enter') {
            const query = input.value.trim().toLowerCase();
            if (!query) return;

            const matches = mindSkeleton.nodes.map(node => {
                const label = (node.label || '').toLowerCase();
                const id = (node.id || '').toLowerCase();

                let score = 0;
                if (label.startsWith(query) || id.startsWith(query)) score = 100;
                else if (label.includes(query) || id.includes(query)) score = 50;

                return { node, score };
            }).filter(m => m.score > 0).sort((a, b) => b.score - a.score);

            if (matches.length > 0) {
                const topMatch = matches[0].node;
                focusNode(topMatch.id);
                openInspector(topMatch.id);
            }
        }
    });
}

// -------------------------------------------------------------
// Legend Region Toggle Chips
// -------------------------------------------------------------

function buildLegendPanel() {
    const legend = document.getElementById('legend-panel');
    if (!legend || !mindSkeleton) return;

    legend.innerHTML = '';

    mindSkeleton.regions.forEach(region => {
        const chip = document.createElement('div');
        chip.className = 'legend-chip';

        const dot = document.createElement('span');
        dot.className = 'chip-dot';
        dot.style.backgroundColor = region.color;

        const label = document.createElement('span');
        label.textContent = region.label;

        chip.appendChild(dot);
        chip.appendChild(label);

        chip.addEventListener('click', () => {
            const group = nodesManager.regionGroups.get(region.id);
            if (group) {
                group.visible = !group.visible;
                if (group.visible) chip.classList.remove('disabled');
                else chip.classList.add('disabled');
            }
        });

        legend.appendChild(chip);
    });
}

function onKeyDown(e) {
    if (e.key === 'Escape') {
        closeInspector();
        controls.autoRotate = true;
        flyCameraTo(new THREE.Vector3(0, 18, 38), new THREE.Vector3(0, 0, 0));
    }
}

function checkHashDeepLink() {
    const hash = window.location.hash;
    if (hash.startsWith('#node=')) {
        const nodeId = hash.replace('#node=', '');
        setTimeout(() => {
            focusNode(nodeId);
            openInspector(nodeId);
        }, 500);
    }
}
