import * as THREE from 'three';
import { hashString } from './regions.js';

// -------------------------------------------------------------
// Node Reverse-Fresnel Shader Material (Glow Sphere)
// -------------------------------------------------------------

const NodeVertexShader = `
    attribute float aPhase;
    attribute float aFreshness;
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    varying float vFreshness;
    uniform float uTime;

    void main() {
        vNormal = normalize(normalMatrix * normal);
        
        // Breathing scale: frequency and offset derived from node phase
        float breathFreq = 3.5 + 2.5 * fract(aPhase * 0.7);
        float breathScale = 1.0 + (0.06 * (0.45 + 0.75 * aFreshness)) * sin(uTime * breathFreq + aPhase * 6.2831);

        vec3 transformed = position * breathScale;
        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(transformed, 1.0);
        vViewPosition = -mvPosition.xyz;
        vFreshness = aFreshness;
        gl_Position = projectionMatrix * mvPosition;
    }
`;

const NodeFragmentShader = `
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    varying float vFreshness;
    uniform vec3 uColor;
    uniform float uOpacity;

    void main() {
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(vViewPosition);
        float facing = max(dot(normal, viewDir), 0.0);

        float core = pow(facing, 2.5);
        float rim = pow(1.0 - facing, 2.0);

        // Core burns white-hot; rim bleeds into node color
        vec3 coreColor = mix(uColor, vec3(1.0), core * 0.85);
        vec3 finalColor = coreColor + uColor * (rim * 1.4);
        finalColor *= (0.45 + 0.75 * vFreshness); // Freshness brightness multiplier

        float alpha = (core * 0.95 + rim * 0.6) * uOpacity;
        gl_FragColor = vec4(finalColor, alpha);
    }
`;

// -------------------------------------------------------------
// Billboard Quad Soft Aura Shader Material
// -------------------------------------------------------------

const AuraVertexShader = `
    attribute float aPhase;
    attribute float aFreshness;
    varying vec2 vUv;
    varying float vFreshness;

    void main() {
        vUv = uv;
        vFreshness = aFreshness;

        // Position quad at instance origin in view space
        vec4 instanceCenter = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float quadScale = 3.5;
        vec2 pos = (position.xy - vec2(0.5)) * quadScale;
        vec4 mvPosition = instanceCenter + vec4(pos, 0.0, 0.0);
        gl_Position = projectionMatrix * mvPosition;
    }
`;

const AuraFragmentShader = `
    varying vec2 vUv;
    varying float vFreshness;
    uniform vec3 uColor;
    uniform float uOpacity;

    void main() {
        float dist = length(vUv - vec2(0.5)) * 2.0;
        float falloff = pow(max(1.0 - dist, 0.0), 2.2);
        vec3 color = uColor * (0.5 + 0.5 * vFreshness);
        gl_FragColor = vec4(color, falloff * 0.35 * uOpacity);
    }
`;

/**
 * Generate Radial Gradient Canvas Texture for Core Coronas
 */
function createRadialCoronaTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
    gradient.addColorStop(0.2, 'rgba(45, 212, 168, 0.8)');
    gradient.addColorStop(0.5, 'rgba(45, 212, 168, 0.3)');
    gradient.addColorStop(1, 'rgba(45, 212, 168, 0.0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 256);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

// -------------------------------------------------------------
// Nodes Renderer Class
// -------------------------------------------------------------

export class NodesManager {
    constructor(scene, sharedTimeUniform) {
        this.scene = scene;
        this.uTime = sharedTimeUniform;
        this.regionGroups = new Map();
        this.instancedMeshes = new Map();
        this.nodeMetadata = new Map();
    }

    buildNodes(nodes, positions) {
        // Group nodes by region
        const regionMap = new Map();
        nodes.forEach(node => {
            if (!regionMap.has(node.region)) regionMap.set(node.region, []);
            regionMap.get(node.region).push(node);
        });

        const sphereGeo = new THREE.SphereGeometry(1, 24, 16);
        const quadGeo = new THREE.PlaneGeometry(1, 1);

        regionMap.forEach((regionNodes, regionId) => {
            const group = new THREE.Group();
            group.name = `region_${regionId}`;

            // Exclude Core Star and Sub-Agents from InstancedMesh (they get custom meshes)
            const instancedNodes = regionNodes.filter(n => n.type !== 'core' && n.type !== 'agent');

            if (instancedNodes.length > 0) {
                const count = instancedNodes.length;
                const regionColor = new THREE.Color(instancedNodes[0].color || '#ffffff');

                // Custom Shader Material
                const material = new THREE.ShaderMaterial({
                    vertexShader: NodeVertexShader,
                    fragmentShader: NodeFragmentShader,
                    uniforms: {
                        uTime: this.uTime,
                        uColor: { value: regionColor },
                        uOpacity: { value: 1.0 }
                    },
                    transparent: true,
                    depthWrite: false,
                    blending: THREE.AdditiveBlending
                });

                const instancedMesh = new THREE.InstancedMesh(sphereGeo, material, count);
                instancedMesh.userData.nodeIds = instancedNodes.map(n => n.id);

                // Per-instance custom attributes: aPhase and aFreshness
                const aPhase = new Float32Array(count);
                const aFreshness = new Float32Array(count);

                const dummy = new THREE.Object3D();

                instancedNodes.forEach((node, idx) => {
                    const pos = positions.get(node.id) || new THREE.Vector3();
                    dummy.position.copy(pos);
                    dummy.scale.setScalar(node.size * 0.45);
                    dummy.updateMatrix();

                    instancedMesh.setMatrixAt(idx, dummy.matrix);

                    const phase = hashString(node.id);
                    aPhase[idx] = phase;
                    aFreshness[idx] = node.freshness || 0.5;

                    this.nodeMetadata.set(node.id, {
                        node,
                        regionGroup: group,
                        instancedMesh,
                        instanceId: idx,
                        position: pos.clone()
                    });
                });

                instancedMesh.instanceMatrix.needsUpdate = true;
                instancedMesh.geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(aPhase, 1));
                instancedMesh.geometry.setAttribute('aFreshness', new THREE.InstancedBufferAttribute(aFreshness, 1));

                group.add(instancedMesh);
                this.instancedMeshes.set(regionId, instancedMesh);

                // Soft Billboard Aura Quads (Sharing instanceMatrix buffers)
                const auraMat = new THREE.ShaderMaterial({
                    vertexShader: AuraVertexShader,
                    fragmentShader: AuraFragmentShader,
                    uniforms: {
                        uColor: { value: regionColor },
                        uOpacity: { value: 0.8 }
                    },
                    transparent: true,
                    depthWrite: false,
                    blending: THREE.AdditiveBlending,
                    side: THREE.DoubleSide
                });

                const auraMesh = new THREE.Mesh(quadGeo, auraMat);
                auraMesh.frustumCulled = false;
                group.add(auraMesh);
            }

            this.scene.add(group);
            this.regionGroups.set(regionId, group);
        });

        // Build Central Agent Core Star
        this.buildCoreStar(positions.get('core:trillion'));

        // Build Sub-Agents
        const agentNodes = nodes.filter(n => n.type === 'agent');
        agentNodes.forEach(an => this.buildAgentNode(an, positions.get(an.id)));
    }

    buildCoreStar(pos = new THREE.Vector3()) {
        const coreGroup = new THREE.Group();
        coreGroup.position.copy(pos);
        coreGroup.name = 'core_star_group';

        const tealColor = new THREE.Color('#2DD4A8');

        // 1. Nucleus Inner Glowing Sphere
        const nucleusMat = new THREE.MeshBasicMaterial({
            color: new THREE.Color('#FFFFFF'),
            transparent: true,
            opacity: 0.95
        });
        const nucleusMesh = new THREE.Mesh(new THREE.SphereGeometry(1.2, 32, 32), nucleusMat);
        coreGroup.add(nucleusMesh);

        // 2. Outer Glow Shell
        const glowMat = new THREE.ShaderMaterial({
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
                uniform vec3 uColor;
                void main() {
                    float facing = max(dot(vNormal, normalize(vViewPosition)), 0.0);
                    float rim = pow(1.0 - facing, 2.2);
                    gl_FragColor = vec4(uColor, rim * 0.9);
                }
            `,
            uniforms: { uColor: { value: tealColor } },
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        const glowMesh = new THREE.Mesh(new THREE.SphereGeometry(2.0, 32, 32), glowMat);
        coreGroup.add(glowMesh);

        // 3. Counter-Rotating Corona Billboards
        const coronaTex = createRadialCoronaTexture();
        const coronaMat1 = new THREE.SpriteMaterial({ map: coronaTex, transparent: true, blending: THREE.AdditiveBlending, opacity: 0.7 });
        const coronaSprite1 = new THREE.Sprite(coronaMat1);
        coronaSprite1.scale.set(7.0, 7.0, 1.0);
        coreGroup.add(coronaSprite1);

        const coronaMat2 = new THREE.SpriteMaterial({ map: coronaTex, transparent: true, blending: THREE.AdditiveBlending, opacity: 0.4 });
        const coronaSprite2 = new THREE.Sprite(coronaMat2);
        coronaSprite2.scale.set(11.0, 11.0, 1.0);
        coreGroup.add(coronaSprite2);

        // 4. Prompt Torus Rings (Spinning on Y Axis)
        const ringGeo1 = new THREE.TorusGeometry(3.6, 0.05, 16, 64);
        const ringMat1 = new THREE.MeshBasicMaterial({ color: tealColor, transparent: true, opacity: 0.65 });
        const ring1 = new THREE.Mesh(ringGeo1, ringMat1);
        ring1.rotation.x = Math.PI / 3;
        coreGroup.add(ring1);

        const ringGeo2 = new THREE.TorusGeometry(5.2, 0.04, 16, 64);
        const ringMat2 = new THREE.MeshBasicMaterial({ color: new THREE.Color('#67E8F9'), transparent: true, opacity: 0.45 });
        const ring2 = new THREE.Mesh(ringGeo2, ringMat2);
        ring2.rotation.x = -Math.PI / 4;
        coreGroup.add(ring2);

        this.scene.add(coreGroup);

        this.coreStar = {
            group: coreGroup,
            ring1,
            ring2,
            nucleusMesh
        };

        this.nodeMetadata.set('core:trillion', {
            node: { id: 'core:trillion', label: 'Trillion AI Core', region: 'core', type: 'core' },
            position: pos.clone()
        });
    }

    buildAgentNode(node, pos = new THREE.Vector3()) {
        const agentGroup = new THREE.Group();
        agentGroup.position.copy(pos);

        const agentColor = new THREE.Color(node.color || '#E88FB3');

        // Agent Glow Sphere
        const mat = new THREE.MeshBasicMaterial({
            color: agentColor,
            transparent: true,
            opacity: 0.85
        });
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(node.size * 0.6, 24, 24), mat);
        agentGroup.add(mesh);

        const coreGroup = this.regionGroups.get('agents') || this.scene;
        coreGroup.add(agentGroup);

        this.nodeMetadata.set(node.id, {
            node,
            position: pos.clone(),
            mesh
        });
    }

    update(timeSec) {
        // Spin Core Prompt Torus Rings about Y axis
        if (this.coreStar) {
            this.coreStar.ring1.rotation.y = timeSec * 0.4;
            this.coreStar.ring2.rotation.y = -timeSec * 0.25;
            this.coreStar.nucleusMesh.scale.setScalar(1.0 + 0.05 * Math.sin(timeSec * 3.0));
        }
    }
}
