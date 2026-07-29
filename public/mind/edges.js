import * as THREE from 'three';
import { hashString } from './regions.js';

// -------------------------------------------------------------
// Similarity Edge Shimmer Shader
// -------------------------------------------------------------

const ShimmerVertexShader = `
    attribute float aPhase;
    varying float vPhase;
    void main() {
        vPhase = aPhase;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
    }
`;

const ShimmerFragmentShader = `
    varying float vPhase;
    uniform vec3 uColor;
    uniform float uBaseOpacity;
    uniform float uTime;
    uniform float uShimmer; // 1.0 = animated, 0.0 = static for governor

    void main() {
        float alpha = uBaseOpacity;
        if (uShimmer > 0.5) {
            alpha *= (0.6 + 0.4 * sin(uTime * 1.6 + vPhase * 6.2831));
        }
        gl_FragColor = vec4(uColor, alpha);
    }
`;

// -------------------------------------------------------------
// Energy Trunk Flow Comet Shader
// -------------------------------------------------------------

const FlowVertexShader = `
    attribute float aT;
    attribute float aPhase;
    attribute float aWeight;
    varying float vT;
    varying float vPhase;
    varying float vWeight;

    void main() {
        vT = aT;
        vPhase = aPhase;
        vWeight = aWeight;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
    }
`;

const FlowFragmentShader = `
    varying float vT;
    varying float vPhase;
    varying float vWeight;
    uniform vec3 uColor;
    uniform float uBaseOpacity;
    uniform float uTime;
    uniform float uSpeed; // Sign sets direction (+ = outward, - = inward)
    uniform float uFlow;

    void main() {
        float alpha = uBaseOpacity;
        vec3 finalColor = uColor;

        if (uFlow > 0.5) {
            float head = fract(uTime * uSpeed + vPhase);
            float d = fract(head - vT);
            float cometTail = exp(-d * 9.0);

            finalColor = mix(uColor, vec3(1.0), cometTail * 0.85);
            alpha += cometTail * 0.65;
        }

        alpha *= vWeight;
        gl_FragColor = vec4(finalColor, alpha);
    }
`;

/**
 * Generate Quadratic Bezier Curve between two points, arcing outwards
 */

export function createBezierCurve(start, end, bendFactor = 0.12) {
    const mid = start.clone().add(end).multiplyScalar(0.5);
    const chord = end.clone().sub(start);
    const outward = mid.clone().normalize();

    let perp = chord.clone().cross(outward).normalize();
    if (perp.lengthSq() < 0.001) {
        perp = new THREE.Vector3(0, 1, 0);
    }

    const control = mid.clone().add(perp.multiplyScalar(chord.length() * bendFactor));
    return new THREE.QuadraticBezierCurve3(start, control, end);
}

// -------------------------------------------------------------
// Edges Manager Class
// -------------------------------------------------------------

export class EdgesManager {
    constructor(scene, sharedTimeUniform) {
        this.scene = scene;
        this.uTime = sharedTimeUniform;
        this.kindGroups = new Map();
        this.curveRegistry = new Map(); // "src|tgt" -> curve
        this.pulsePool = [];
    }

    buildEdges(edges, nodePositions) {
        const SEGMENTS = 24;

        // Group edges by kind
        const kindMap = new Map();
        edges.forEach(e => {
            if (!kindMap.has(e.kind)) kindMap.set(e.kind, []);
            kindMap.get(e.kind).push(e);
        });

        const kindColors = {
            similarity: '#A78BFA',
            recall: '#A78BFA',
            flow: '#67E8F9',
            dispatch: '#E88FB3',
            knowledge_flow: '#F5A524',
            capability: '#8B93A1'
        };

        const kindOpacities = {
            similarity: 0.16,
            recall: 0.28,
            flow: 0.22,
            dispatch: 0.25,
            knowledge_flow: 0.20,
            capability: 0.14
        };

        kindMap.forEach((kindEdges, kind) => {
            const positionsList = [];
            const aTList = [];
            const aPhaseList = [];
            const aWeightList = [];

            kindEdges.forEach(e => {
                const start = nodePositions.get(e.source);
                const end = nodePositions.get(e.target);
                if (!start || !end) return;

                const curve = createBezierCurve(start, end);
                const curveKey = `${e.source}|${e.target}`;
                this.curveRegistry.set(curveKey, curve);
                this.curveRegistry.set(`${e.target}|${e.source}`, curve);

                const points = curve.getPoints(SEGMENTS);
                const phase = hashString(curveKey);

                for (let i = 0; i < points.length - 1; i++) {
                    const p1 = points[i];
                    const p2 = points[i + 1];

                    positionsList.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);

                    const t1 = i / SEGMENTS;
                    const t2 = (i + 1) / SEGMENTS;
                    aTList.push(t1, t2);

                    aPhaseList.push(phase, phase);
                    aWeightList.push(e.weight || 0.5, e.weight || 0.5);
                }
            });

            if (positionsList.length === 0) return;

            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(positionsList, 3));
            geometry.setAttribute('aT', new THREE.Float32BufferAttribute(aTList, 1));
            geometry.setAttribute('aPhase', new THREE.Float32BufferAttribute(aPhaseList, 1));
            geometry.setAttribute('aWeight', new THREE.Float32BufferAttribute(aWeightList, 1));

            const color = new THREE.Color(kindColors[kind] || '#ffffff');
            const opacity = kindOpacities[kind] || 0.18;

            let material;

            if (kind === 'similarity') {
                material = new THREE.ShaderMaterial({
                    vertexShader: ShimmerVertexShader,
                    fragmentShader: ShimmerFragmentShader,
                    uniforms: {
                        uTime: this.uTime,
                        uColor: { value: color },
                        uBaseOpacity: { value: opacity },
                        uShimmer: { value: 1.0 }
                    },
                    transparent: true,
                    depthWrite: false,
                    blending: THREE.AdditiveBlending
                });
            } else {
                // Flow comets on pathways
                const speed = (kind === 'recall' || kind === 'knowledge_flow') ? -0.4 : 0.4;
                material = new THREE.ShaderMaterial({
                    vertexShader: FlowVertexShader,
                    fragmentShader: FlowFragmentShader,
                    uniforms: {
                        uTime: this.uTime,
                        uColor: { value: color },
                        uBaseOpacity: { value: opacity },
                        uSpeed: { value: speed },
                        uFlow: { value: 1.0 }
                    },
                    transparent: true,
                    depthWrite: false,
                    blending: THREE.AdditiveBlending
                });
            }

            // Object.defineProperty shim so hover opacity setters work
            Object.defineProperty(material, 'opacity', {
                get: () => material.uniforms.uBaseOpacity.value,
                set: (val) => { material.uniforms.uBaseOpacity.value = val; }
            });

            const lineSegments = new THREE.LineSegments(geometry, material);
            this.scene.add(lineSegments);
            this.kindGroups.set(kind, lineSegments);
        });

        // Initialize Pulse Pool (~64 Sprites)
        this.initPulsePool();
    }

    initPulsePool() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
        gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.8)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0.0)');

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 64, 64);

        const pulseTex = new THREE.CanvasTexture(canvas);

        for (let i = 0; i < 64; i++) {
            const mat = new THREE.SpriteMaterial({
                map: pulseTex,
                transparent: true,
                blending: THREE.AdditiveBlending,
                opacity: 0
            });
            const sprite = new THREE.Sprite(mat);
            sprite.visible = false;
            this.scene.add(sprite);

            this.pulsePool.push({
                sprite,
                mat,
                active: false,
                curve: null,
                progress: 0,
                speed: 1.0,
                maxScale: 2.0,
                color: new THREE.Color()
            });
        }
    }

    firePulse(fromId, toId, colorHex = '#2DD4A8', speed = 1.0, maxScale = 2.5) {
        const curveKey = `${fromId}|${toId}`;
        const curve = this.curveRegistry.get(curveKey);
        if (!curve) return; // Drop pulse silently if endpoints invalid

        const pulse = this.pulsePool.find(p => !p.active);
        if (!pulse) return;

        pulse.active = true;
        pulse.curve = curve;
        pulse.progress = 0;
        pulse.speed = speed;
        pulse.maxScale = maxScale;
        pulse.color.set(colorHex);
        pulse.mat.color.copy(pulse.color);
        pulse.sprite.visible = true;
    }

    update(deltaSec) {
        // Update live active pulses along curves
        this.pulsePool.forEach(p => {
            if (!p.active || !p.curve) return;

            p.progress += deltaSec * p.speed * 0.8;
            if (p.progress >= 1.0) {
                p.active = false;
                p.sprite.visible = false;
                return;
            }

            const point = p.curve.getPoint(p.progress);
            p.sprite.position.copy(point);

            const arcAlpha = Math.sin(p.progress * Math.PI);
            p.mat.opacity = arcAlpha * 0.95;
            p.sprite.scale.setScalar(p.maxScale * (0.8 + 0.5 * arcAlpha));
        });
    }
}
