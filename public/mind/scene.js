import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

import { fetchMindSkeleton, setupObserverSocket } from './data.js';
import { computeNodePositions } from './regions.js';
import { NodesManager } from './nodes.js';
import { EdgesManager } from './edges.js';

// Global shared time uniform object for all shaders
const sharedTimeUniform = { value: 0 };

let scene, camera, renderer, composer, bloomPass, controls;
let nodesManager, edgesManager;
let mindSkeleton = null;
let nodePositions = null;

// FPS Governor State
const frameTimes = [];
let lowFpsSeconds = 0;
let degradationStage = 0; // 0 = full, 1 = no bloom, 2 = static fallback

export function initScene() {
    const container = document.getElementById('mind-container');
    const canvas = document.getElementById('mind-canvas');

    // 1. Scene & Fog
    scene = new THREE.Scene();
    scene.background = new THREE.Color('#05070B');
    scene.fog = new THREE.FogExp2('#05070B', 0.012);

    // 2. Camera
    camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 18, 38);

    // 3. WebGL Renderer
    renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        powerPreference: 'high-performance'
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    // 4. OrbitControls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.6;
    controls.minDistance = 5;
    controls.maxDistance = 120;

    // 5. Post-processing Bloom Chain
    composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        1.15, // Strength
        0.6,  // Radius
        0.72  // Threshold
    );
    composer.addPass(bloomPass);

    // 6. Build Starfield
    buildStarfield();

    // 7. Build Membrane
    buildMembrane();

    // 8. Nodes & Edges Managers
    nodesManager = new NodesManager(scene, sharedTimeUniform);
    edgesManager = new EdgesManager(scene, sharedTimeUniform);

    // Resize Listener
    window.addEventListener('resize', onWindowResize);

    // Load Data & Assemble Mind Map
    loadMindData();
}

// -------------------------------------------------------------
// Starfield (~600 twinkling stars)
// -------------------------------------------------------------

function buildStarfield() {
    const COUNT = 600;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(COUNT * 3);
    const phase = new Float32Array(COUNT);
    const size = new Float32Array(COUNT);

    for (let i = 0; i < COUNT; i++) {
        const radius = 80 + Math.random() * 80;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);

        pos[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
        pos[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
        pos[i * 3 + 2] = radius * Math.cos(phi);

        phase[i] = Math.random() * Math.PI * 2;
        size[i] = 1.5 + Math.random() * 2.5;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));

    const mat = new THREE.ShaderMaterial({
        vertexShader: `
            attribute float aPhase;
            attribute float aSize;
            varying float vPhase;
            uniform float uTime;
            void main() {
                vPhase = aPhase;
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                gl_PointSize = aSize * (160.0 / -mvPosition.z);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            varying float vPhase;
            uniform float uTime;
            void main() {
                float dist = length(gl_PointCoord - vec2(0.5));
                if (dist > 0.5) discard;
                float falloff = pow(max(1.0 - dist * 2.0, 0.0), 2.0);
                float sparkle = 0.4 + 0.6 * sin(uTime * 2.5 + vPhase);
                gl_FragColor = vec4(vec3(0.9, 0.95, 1.0) * sparkle, falloff * sparkle);
            }
        `,
        uniforms: { uTime: sharedTimeUniform },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });

    const starPoints = new THREE.Points(geo, mat);
    scene.add(starPoints);
}

// -------------------------------------------------------------
// Boundary Membrane Sphere (Fresnel Rim Shader)
// -------------------------------------------------------------

function buildMembrane() {
    const geo = new THREE.SphereGeometry(26, 48, 48);
    const mat = new THREE.ShaderMaterial({
        vertexShader: `
            varying vec3 vNormal;
            varying vec3 vViewPosition;
            void main() {
                vNormal = normalize(normalMatrix * normal);
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                vViewPosition = -mvPosition.xyz;
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            varying vec3 vNormal;
            varying vec3 vViewPosition;
            void main() {
                vec3 normal = normalize(vNormal);
                vec3 viewDir = normalize(vViewPosition);
                // abs() avoids solid disk artifact on BackSide sphere
                float rim = pow(1.0 - abs(dot(normal, viewDir)), 3.0);
                vec3 color = vec3(0.18, 0.83, 0.66); // Teal tint
                gl_FragColor = vec4(color, rim * 0.08);
            }
        `,
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });

    const membrane = new THREE.Mesh(geo, mat);
    scene.add(membrane);
}

// -------------------------------------------------------------
// Load Mind Data & Assemble Scene
// -------------------------------------------------------------

async function loadMindData() {
    const statsBar = document.getElementById('stats-bar');

    try {
        mindSkeleton = await fetchMindSkeleton();

        if (statsBar) {
            statsBar.textContent = `${mindSkeleton.nodes.length} Nodes · ${mindSkeleton.edges.length} Edges · ${mindSkeleton.stats.memory_shown}/${mindSkeleton.stats.memory_total} Memories`;
        }

        // Compute 3D Positions for all nodes
        nodePositions = computeNodePositions(mindSkeleton.nodes, mindSkeleton.edges);

        // Build 3D Nodes & Edges
        nodesManager.buildNodes(mindSkeleton.nodes, nodePositions);
        edgesManager.buildEdges(mindSkeleton.edges, nodePositions);

        // Dynamically Import Interaction & Inspector Module
        const { initInspector } = await import('./inspector.js');
        initInspector({
            scene,
            camera,
            controls,
            mindSkeleton,
            nodePositions,
            nodesManager,
            edgesManager
        });

        // Start Observer Socket
        setupObserverSocket(handleLiveEvent);

        // Start Animation Loop
        requestAnimationFrame(animate);

    } catch (err) {
        console.error('Failed to initialize Mind Map:', err);
        if (statsBar) {
            statsBar.textContent = '❌ Failed to load mind — is the server up?';
            statsBar.style.color = '#FF6B6B';
        }
    }
}

async function refreshMindTopology() {
    try {
        const newSkeleton = await fetchMindSkeleton();
        if (!newSkeleton) return;

        mindSkeleton = newSkeleton;
        const statsBar = document.getElementById('stats-bar');
        if (statsBar) {
            statsBar.textContent = `${mindSkeleton.nodes.length} Nodes · ${mindSkeleton.edges.length} Edges · ${mindSkeleton.stats.memory_shown}/${mindSkeleton.stats.memory_total} Memories`;
        }

        // Recompute 3D positions & update edges dynamically
        nodePositions = computeNodePositions(mindSkeleton.nodes, mindSkeleton.edges);
        edgesManager.buildEdges(mindSkeleton.edges, nodePositions);

    } catch (e) {
        console.warn('[MindMap Refresh Error]:', e.message);
    }
}

// -------------------------------------------------------------
// Live Event Reaction Dispatcher
// -------------------------------------------------------------

function handleLiveEvent(evt) {
    if (!evt || !evt.type) return;

    if (evt.type === 'turn_started') {
        // Teal pulse from working thread into central core star
        edgesManager.firePulse('thread:thread_recent_1', 'core:trillion', '#2DD4A8', 1.6, 3.5);
        if (nodesManager && nodesManager.coreStar) {
            nodesManager.coreStar.nucleusMesh.scale.setScalar(1.5);
        }

    } else if (evt.type === 'memory_recalled') {
        // Violet pulse from memory to core
        const srcId = `mem:${evt.memoryId}`;
        edgesManager.firePulse(srcId, 'core:trillion', '#A78BFA', 1.4, 3.0);

    } else if (evt.type === 'memory_written') {
        // Cyan pulse and live topology refresh without page reload!
        edgesManager.firePulse('core:trillion', 'thread:thread_recent_1', '#67E8F9', 1.4, 3.2);
        refreshMindTopology();

    } else if (evt.type === 'agent_dispatched') {
        // Rose pulse from core to agent
        const tgtId = `agent:${evt.agentSlug || 'research'}`;
        edgesManager.firePulse('core:trillion', tgtId, '#E88FB3', 1.5, 3.5);

    } else if (evt.type === 'tool_executed') {
        // Slate pulse from core to tool node
        const tgtId = `tool:${evt.toolName}`;
        edgesManager.firePulse('core:trillion', tgtId, '#8B93A1', 1.5, 3.2);

    } else if (evt.type === 'turn_completed') {
        // Core Star Nucleus Swell
        if (nodesManager && nodesManager.coreStar) {
            nodesManager.coreStar.nucleusMesh.scale.setScalar(1.8);
        }
    }
}

// -------------------------------------------------------------
// Window Resize Handler
// -------------------------------------------------------------

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
}

// -------------------------------------------------------------
// Main Render & Animation Frame Loop with FPS Governor
// -------------------------------------------------------------

let lastTime = performance.now();

function animate(currentTime) {
    requestAnimationFrame(animate);

    if (document.hidden) return; // Skip rendering when tab is hidden

    const deltaSec = Math.min((currentTime - lastTime) / 1000, 0.1);
    lastTime = currentTime;

    // Update shared time
    sharedTimeUniform.value += deltaSec;

    // FPS Governor (60-frame rolling window)
    frameTimes.push(deltaSec);
    if (frameTimes.length > 60) frameTimes.shift();

    const avgDelta = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
    const currentFps = 1 / avgDelta;

    if (currentFps < 30) {
        lowFpsSeconds += deltaSec;
        if (lowFpsSeconds >= 3.0 && degradationStage < 2) {
            degradationStage++;
            lowFpsSeconds = 0;
            if (degradationStage === 1) {
                console.info('[FPS Governor]: Disabling bloom pass to target 60fps');
                bloomPass.enabled = false;
            } else if (degradationStage === 2) {
                console.info('[FPS Governor]: Freezing shimmer/flow shaders to target 60fps');
            }
        }
    } else {
        lowFpsSeconds = Math.max(0, lowFpsSeconds - deltaSec);
    }

    // Update Scene Components
    controls.update();
    nodesManager.update(sharedTimeUniform.value);
    edgesManager.update(deltaSec);

    // Render Scene
    if (degradationStage === 0) {
        composer.render();
    } else {
        renderer.render(scene, camera);
    }
}

// Initialize on Load
window.addEventListener('DOMContentLoaded', initScene);
