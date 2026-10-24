import * as THREE from 'three';
import { layoutTextFlow } from './observatory-text-flow';

// The audio player belongs to the page shell. This module only owns its backdrop.
const PHASES = { tree: [1, 0, 0], cube: [0, 1, 0], music: [0, 0, 1] };
const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function seededRandom(seed) {
    return () => {
        seed |= 0;
        seed = seed + 0x6d2b79f5 | 0;
        let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
        value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
        return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
}

function makeTree(count, random) {
    const points = [];
    const branches = [];
    const leaves = [];
    const up = new THREE.Vector3(0, 1, 0);
    const add = (x, y, z, size, kind) => points.push([x, y, z, size, kind]);

    function branch(start, end, radius, bend, density = 1, level = 0) {
        const difference = end.clone().sub(start);
        const side = new THREE.Vector3(bend, 0.12, -bend * 0.24);
        const c1 = start.clone().addScaledVector(difference, 0.38).add(side);
        const c2 = start.clone().addScaledVector(difference, 0.75).add(new THREE.Vector3(-bend * 0.15, 0.22, bend * 0.22));
        const curve = new THREE.CubicBezierCurve3(start, c1, c2, end);
        if (level < 2) branches.push({ curve, radius });
        const samples = Math.max(35, Math.round(difference.length() * (level ? 380 : 1100) * density));
        for (let i = 0; i < samples; i++) {
            const t = random();
            const center = curve.getPoint(t);
            const tangent = curve.getTangent(t);
            const axis = Math.abs(tangent.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : up;
            const normal = new THREE.Vector3().crossVectors(tangent, axis).normalize();
            const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();
            // Strands on the bark retain the trunk's structure even at small sizes.
            const angle = random() * TAU + t * 9;
            const r = radius * (1 - t * 0.81) * (0.6 + random() * 0.52);
            center.addScaledVector(normal, Math.cos(angle) * r).addScaledVector(binormal, Math.sin(angle) * r);
            add(center.x, center.y, center.z, 0.78 + random() * 0.9, 0);
        }
        return curve;
    }

    branch(new THREE.Vector3(-0.08, -2.48, 0), new THREE.Vector3(0.16, 0.35, 0.04), 0.44, -0.15, 2.4);
    branch(new THREE.Vector3(0.06, -1.2, 0.04), new THREE.Vector3(-0.48, 1.65, -0.05), 0.25, 0.14, 1.05);
    branch(new THREE.Vector3(0.1, -0.5, 0.08), new THREE.Vector3(0.35, 3.35, -0.12), 0.19, -0.2, 0.9);

    // Broad, asymmetric crown: explicit scaffold limbs avoid a conical or spherical tree.
    const scaffolds = [
        [-4.05, 1.63, 0.22, -0.85], [-3.2, 2.75, -0.4, -0.32],
        [-2.25, 3.9, 0.17, 0.05], [-1.18, 4.45, -0.32, 0.25],
        [0.2, 4.8, 0.04, 0.62], [1.6, 4.25, 0.2, 0.26],
        [2.75, 3.35, -0.28, -0.18], [4.05, 2.1, 0.1, -0.7],
        [-2.35, 2.6, 1.12, -0.25], [2.4, 2.9, 1.18, 0.05],
        [-1.6, 3.35, -1.35, 0.18], [1.3, 3.65, -1.1, 0.38],
    ];
    for (const [x, y, z, baseY] of scaffolds) {
        const start = new THREE.Vector3(0.02 + random() * 0.12, baseY, random() * 0.12);
        const end = new THREE.Vector3(x, y, z);
        const limb = branch(start, end, 0.14 + random() * 0.07, Math.sign(x) * 0.18, 0.64);
        for (let j = 0; j < 7; j++) {
            const t = 0.34 + j * 0.092;
            const twigStart = limb.getPoint(t);
            const fan = (j % 2 ? 1 : -1);
            const twigEnd = twigStart.clone().add(new THREE.Vector3(
                Math.sign(x || 1) * (0.35 + random() * 0.65) + fan * 0.35,
                0.3 + random() * 0.65,
                fan * (0.32 + random() * 0.75)
            ));
            twigEnd.y = Math.min(twigEnd.y, 4.95 + random() * 0.1);
            branch(twigStart, twigEnd, 0.04 * (1.1 - t * 0.5), fan * 0.12, 0.55, 1);
            for (let k = 0; k < 3; k++) {
                const leafEnd = twigEnd.clone().add(new THREE.Vector3(
                    (random() - 0.5) * 0.9,
                    (random() - 0.22) * 0.55,
                    (random() - 0.5) * 0.8
                ));
                branch(twigEnd, leafEnd, 0.012, 0.03, 0.65, 2);
                leaves.push({ center: leafEnd, radius: 0.27 + random() * 0.29 });
            }
        }
        leaves.push({ center: end, radius: 0.55 });
    }
    // A few exposed roots make the tree meet the orbital floor instead of hovering.
    for (let i = 0; i < 13; i++) {
        const angle = i / 13 * TAU;
        branch(new THREE.Vector3(-0.07, -2.18, 0), new THREE.Vector3(Math.cos(angle) * (0.8 + random() * 0.5), -2.5, Math.sin(angle) * 0.6), 0.07, 0.03, 0.35, 1);
    }

    // Overlapping foliage masses bridge the scaffold limbs into an old spreading canopy.
    // Their drooping outer contour is deliberately wider than it is tall.
    for (let i = 0; i < 180; i++) {
        const x = (random() - 0.5) * 8.55;
        const crownTop = 4.9 - 0.108 * x * x;
        const crownBottom = 2.66 - 0.062 * x * x;
        leaves.push({
            center: new THREE.Vector3(x, crownBottom + random() * (crownTop - crownBottom), (random() - 0.5) * 2.5),
            radius: 0.27 + random() * 0.44,
        });
    }
    for (let i = 0; i < 135; i++) {
        const x = (random() + random() + random() - 1.5) * 1.8;
        leaves.push({
            center: new THREE.Vector3(x, 2.03 + random() * 2.35, (random() - 0.5) * 2.1),
            radius: 0.38 + random() * 0.35,
        });
    }

    const wooden = points.length;
    const leafCount = Math.max(count - wooden, Math.round(count * 0.95));
    for (let i = 0; i < leafCount; i++) {
        const cluster = leaves[Math.floor(random() * leaves.length)];
        const theta = random() * TAU;
        const height = random() * 2 - 1;
        const radius = Math.cbrt(random()) * cluster.radius;
        const width = Math.sqrt(1 - height * height);
        const fleck = random() > 0.965 ? 1.6 : 1;
        add(
            cluster.center.x + Math.cos(theta) * width * radius * 1.25,
            cluster.center.y + height * radius * 0.62,
            cluster.center.z + Math.sin(theta) * width * radius,
            (0.48 + random() * 1.08) * fleck,
            1
        );
    }
    // Sampling keeps the same silhouette on modest devices without changing the seed.
    const sampled = [];
    for (let i = 0; i < count; i++) sampled.push(points[Math.min(points.length - 1, Math.floor(i * points.length / count))]);
    return { points: sampled, branches };
}

const vertexShader = `
attribute vec3 aCube;
attribute vec3 aMusic;
attribute float aSize;
attribute float aSeed;
attribute float aLeaf;
uniform vec3 uWeights;
uniform float uTime;
uniform float uTravel;
uniform float uPixelRatio;
uniform float uCubeAngle;
varying float vSeed;
varying float vLight;
void main() {
    vec3 tree = position;
    float sway = max(0., tree.y + 1.9) / 7.;
    tree.x += sin(uTime * .25 + tree.y * .63 + tree.z) * .043 * sway;
    tree.z += cos(uTime * .21 + tree.x * .6) * .036 * sway;
    vec3 cube = aCube;
    float c = cos(uCubeAngle), s = sin(uCubeAngle);
    cube.xz = mat2(c, -s, s, c) * cube.xz;
    cube.xy = mat2(.995, -.1, .1, .995) * cube.xy;
    cube.y += 1.05;
    vec3 p = tree * uWeights.x + cube * uWeights.y + aMusic * uWeights.z;
    float ribbon = aSeed * 19. + p.y * .8 + uTime * .18;
    p += uTravel * vec3(sin(ribbon) * .85, cos(ribbon * .8) * .34, cos(ribbon) * .95);
    vec4 view = modelViewMatrix * vec4(p, 1.);
    gl_Position = projectionMatrix * view;
    gl_PointSize = clamp(aSize * 2.35 * uPixelRatio * (17. / max(5., -view.z)), 1.25, 6.2 * uPixelRatio);
    vSeed = aSeed;
    vLight = (.84 + .16 * sin(uTime * .55 + aSeed * 63.)) * mix(1., .85, aLeaf);
    vLight *= dot(uWeights, vec3(1., .48, .24));
}
`;

const fragmentShader = `
precision mediump float;
varying float vSeed;
varying float vLight;
uniform float uOpacity;
void main() {
    float radius = length(gl_PointCoord - .5) * 2.;
    if (radius > 1.) discard;
    float core = pow(1. - radius, 1.25);
    vec3 blue = mix(vec3(.06, .19, 1.), vec3(.13, .45, 1.), step(.38, vSeed));
    blue = mix(blue, vec3(.66, .42, 1.), step(.92, vSeed));
    blue = mix(blue, vec3(.73, .9, 1.), step(.986, vSeed));
    gl_FragColor = vec4(blue * (1.35 + core), (.38 + core * .62) * vLight * uOpacity);
}
`;

/**
 * Full-viewport decorative scene. Phase changes are driven by the page controller.
 * onReady({ supported: false, error }) lets the page show its static fallback.
 */
export function createObservatoryScene(canvas, { onReady, onPhase, reducedMotion = false, textSpeed = 1.2 } = {}) {
    let renderer;
    try {
        renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'high-performance' });
    } catch (error) {
        onReady?.({ supported: false, error });
        return { setPhase() {}, pause() {}, resize() {}, destroy() {}, setText() {}, setMusicBounds() {} };
    }
    renderer.setClearColor(0x02040b, 0);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(39, 1, 0.1, 90);
    const isSmall = Math.min(window.innerWidth, window.innerHeight) < 680;
    const count = isSmall ? 28000 : 82000;
    const random = seededRandom(417203);
    const tree = makeTree(count, random);
    const positions = new Float32Array(count * 3);
    const cubes = new Float32Array(count * 3);
    const music = new Float32Array(count * 3);
    const frameSamples = new Float32Array(count * 4);
    const sizes = new Float32Array(count);
    const seeds = new Float32Array(count);
    const kinds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
        const p = tree.points[i];
        // Lift the root bed into the visible gap above the foreground article deck.
        const treeY = p[1] < -0.8 ? -1.56 + (p[1] + 2.48) * (0.76 / 1.68) : p[1];
        positions.set([p[0] * 1.08, treeY, p[2]], i * 3);
        sizes[i] = p[3];
        kinds[i] = p[4];
        seeds[i] = random();
        const half = 2.26;
        let x = (random() * 2 - 1) * half;
        let y = (random() * 2 - 1) * half;
        let z = (random() * 2 - 1) * half;
        const face = Math.floor(random() * 3);
        const edge = random() < 0.27;
        const fixed = random() < 0.5 ? -half : half;
        if (face === 0) { x = fixed; if (edge) y = random() < 0.5 ? -half : half; }
        if (face === 1) { y = fixed; if (edge) z = random() < 0.5 ? -half : half; }
        if (face === 2) { z = fixed; if (edge) x = random() < 0.5 ? -half : half; }
        cubes.set([x, y, z], i * 3);
        // Dust gathers around a wide, shallow frame, leaving the DOM player readable.
        const side = Math.floor(random() * 4);
        const spread = (random() - 0.5) * (random() < 0.8 ? 0.12 : 0.65);
        const frameX = 4.55;
        const frameY = 1.93;
        const mx = side < 2 ? (random() * 2 - 1) * frameX : (side === 2 ? -frameX : frameX) + spread;
        const my = side < 2 ? (side === 0 ? -frameY : frameY) + spread : (random() * 2 - 1) * frameY;
        music.set([mx, my + 1.05, -0.4 + (random() - 0.5) * 0.24], i * 3);
        frameSamples.set([side, random(), random() < 0.8 ? 1.2 + random() * 2.5 : random() * 13, -0.4 + (random() - 0.5) * 0.24], i * 4);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aCube', new THREE.BufferAttribute(cubes, 3));
    geometry.setAttribute('aMusic', new THREE.BufferAttribute(music, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    geometry.setAttribute('aLeaf', new THREE.BufferAttribute(kinds, 1));
    const uniforms = {
        uWeights: { value: new THREE.Vector3(1, 0, 0) },
        uTime: { value: 0 }, uTravel: { value: 0 }, uPixelRatio: { value: 1 },
        uCubeAngle: { value: -0.44 }, uOpacity: { value: 0.92 },
    };
    const material = new THREE.ShaderMaterial({
        uniforms, vertexShader, fragmentShader, transparent: true,
        depthWrite: true, blending: THREE.AdditiveBlending,
    });
    const cloud = new THREE.Points(geometry, material);
    cloud.frustumCulled = false;
    cloud.renderOrder = 1;
    scene.add(cloud);

    // Invisible solid limbs write depth before transparent calligraphy is drawn.
    const occluders = new THREE.Group();
    const occlusionMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true });
    for (const { curve, radius } of tree.branches) {
        const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, radius * 0.64, 4, false), occlusionMaterial);
        mesh.renderOrder = -1;
        occluders.add(mesh);
    }
    occluders.scale.x = 1.08;
    scene.add(occluders);

    const stars = new THREE.BufferGeometry();
    const starPoints = [];
    const starColors = [];
    for (let i = 0; i < (isSmall ? 720 : 1600); i++) {
        starPoints.push((random() - 0.5) * 49, (random() - 0.5) * 30 + 1, -7 - random() * 27);
        const bright = 0.24 + random() * 0.62;
        starColors.push(bright * 0.43, bright * 0.57, bright);
    }
    stars.setAttribute('position', new THREE.Float32BufferAttribute(starPoints, 3));
    stars.setAttribute('color', new THREE.Float32BufferAttribute(starColors, 3));
    const starMaterial = new THREE.PointsMaterial({ size: 0.025, transparent: true, opacity: 0.78, vertexColors: true, depthWrite: false, blending: THREE.AdditiveBlending });
    scene.add(new THREE.Points(stars, starMaterial));

    const floor = new THREE.Group();
    floor.position.y = 0.92;
    const lightBed = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
        fragmentShader: `varying vec2 vUv;
          void main(){
            vec2 p=(vUv-.5)*20.; float r=length(p);
            float inner=exp(-pow((r-.65)/.12,2.))*.7;
            float middle=exp(-pow((r-2.71)/.10,2.))*.62;
            float outer=exp(-pow((r-4.77)/.09,2.))*.38;
            float core=exp(-r*r/1.8)*.74;
            float haze=exp(-r*r/28.)*.045;
            float noise=fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);
            float alpha=(inner+middle+outer+core+haze)*(.72+noise*.28);
            gl_FragColor=vec4(.035,.20,.95,alpha);
          }`
    }));
    lightBed.rotation.x = -Math.PI / 2;
    lightBed.position.y = -2.49;
    floor.add(lightBed);
    const floorMaterials = [];
    for (let r = 0; r < 9; r++) {
        const radius = 0.65 + r * 1.03;
        const ring = [];
        for (let k = 0; k < 240; k++) {
            const angle = k / 240 * TAU;
            ring.push(Math.cos(angle) * radius, -2.48 - r * 0.008, Math.sin(angle) * radius * 0.9);
        }
        const ringGeometry = new THREE.BufferGeometry();
        ringGeometry.setAttribute('position', new THREE.Float32BufferAttribute(ring, 3));
        const ringMaterial = new THREE.LineBasicMaterial({ color: r % 2 ? 0x1649dd : 0x3c83ff, transparent: true, opacity: r % 2 ? 0.2 : 0.61, depthWrite: false, blending: THREE.AdditiveBlending });
        floorMaterials.push(ringMaterial);
        floor.add(new THREE.LineLoop(ringGeometry, ringMaterial));
    }
    const dustPoints = [];
    for (let i = 0; i < (isSmall ? 1500 : 4200); i++) {
        const radius = 0.5 + random() * 9.4;
        const angle = random() * TAU;
        dustPoints.push(Math.cos(angle) * radius, -2.48 + (random() - 0.5) * 0.045, Math.sin(angle) * radius * 0.9);
    }
    const dustGeometry = new THREE.BufferGeometry();
    dustGeometry.setAttribute('position', new THREE.Float32BufferAttribute(dustPoints, 3));
    const dustMaterial = new THREE.PointsMaterial({ color: 0x337dff, size: 0.015, transparent: true, opacity: 0.65, depthWrite: false, blending: THREE.AdditiveBlending });
    floor.add(new THREE.Points(dustGeometry, dustMaterial));
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = glowCanvas.height = 32;
    const glowContext = glowCanvas.getContext('2d');
    const gradient = glowContext.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.2, 'rgba(255,255,255,.8)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    glowContext.fillStyle = gradient;
    glowContext.fillRect(0, 0, 32, 32);
    const groundGlowTexture = new THREE.CanvasTexture(glowCanvas);
    const glowPoints = [];
    for (let i = 0; i < (isSmall ? 3400 : 10500); i++) {
        const rootGlow = i < (isSmall ? 1200 : 3500);
        const radius = rootGlow ? Math.pow(random(), 1.4) * 1.55 : 0.65 + Math.floor(random() * 4) * 2.06 + (random() - 0.5) * 0.1;
        const angle = random() * TAU;
        glowPoints.push(Math.cos(angle) * radius, -2.47 + (rootGlow ? random() * 0.12 : random() * 0.035), Math.sin(angle) * radius * 0.9);
    }
    const glowGeometry = new THREE.BufferGeometry();
    glowGeometry.setAttribute('position', new THREE.Float32BufferAttribute(glowPoints, 3));
    const glowMaterial = new THREE.PointsMaterial({ color: 0x276eff, map: groundGlowTexture, size: 0.085, transparent: true, opacity: 0.88, depthWrite: false, blending: THREE.AdditiveBlending });
    floor.add(new THREE.Points(glowGeometry, glowMaterial));
    scene.add(floor);

    const textGroup = new THREE.Group();
    textGroup.renderOrder = 2;
    scene.add(textGroup);
    const textTextures = new Map();
    // Sparse phrases share one continuous clock across the tree and cube.
    const textRate = clamp(Number(textSpeed) || 1.2, 0.5, 2);
    const textLanes = [
        { y: 0.15, wave: 0.64, tilt: 0, bend: 0, depth: 0, scale: isSmall ? 0.72 : 0.6375, opacity: 0.88, speed: 0.009, spacing: 0.64, shift: 0 },
        { y: 2.2, wave: 0.48, tilt: -0.6, bend: 1.1, depth: 1, scale: isSmall ? 0.49 : 0.44, opacity: 0.46, speed: 0.0075, spacing: 0.57, shift: 0.5 },
        { y: 3.85, wave: 0.62, tilt: 0, bend: 2.3, depth: 1.7, scale: 0.31, opacity: 0.23, speed: 0.006, spacing: 0.48, shift: 0.15 },
    ];
    let textSprites = [];
    let currentText = '南风知我意';
    let destroyed = false;
    let initialized = false;
    function glyphTexture(character) {
        if (textTextures.has(character)) return textTextures.get(character);
        const glyph = document.createElement('canvas');
        glyph.width = 128;
        glyph.height = 128;
        const context = glyph.getContext('2d');
        context.font = '88px FoliaHand, KaiTi, STKaiti, serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillStyle = '#b5ceff';
        context.fillText(character, 64, 67);
        const texture = new THREE.CanvasTexture(glyph);
        texture.minFilter = THREE.LinearFilter;
        textTextures.set(character, texture);
        return texture;
    }
    function setText(text) {
        if (destroyed) return;
        currentText = typeof text === 'string' && text.trim() ? text.trim() : '南风知我意';
        for (const item of textSprites) { textGroup.remove(item.sprite); item.sprite.material.dispose(); }
        textSprites = [];
        for (const lane of textLanes) {
            const layout = layoutTextFlow(currentText, lane.spacing);
            for (const { character, offset } of layout.glyphs) {
                const spriteMaterial = new THREE.SpriteMaterial({ map: glyphTexture(character), transparent: true, depthTest: true, depthWrite: false, opacity: 0 });
                const sprite = new THREE.Sprite(spriteMaterial);
                sprite.renderOrder = 2;
                textGroup.add(sprite);
                textSprites.push({ sprite, lane, offset: offset + layout.length * lane.shift + 2, length: layout.length });
            }
        }
        if (initialized) drawScene();
    }
    setText(currentText);
    document.fonts?.ready.then(() => {
        if (destroyed) return;
        for (const texture of textTextures.values()) texture.dispose();
        textTextures.clear();
        setText(currentText);
    });

    let phase = 'tree';
    let previous = new THREE.Vector3(1, 0, 0);
    let destination = new THREE.Vector3(1, 0, 0);
    let transitionElapsed = 0;
    let transitionDuration = 0;
    let transitionActive = false;
    let explicitlyPaused = false;
    let frame = 0;
    let lastTime = 0;
    let elapsed = 0;
    let ready = false;
    let frameWidth = 0;
    let frameHeight = 0;
    let musicBounds = null;
    const pointer = new THREE.Vector2();
    const cameraOffset = new THREE.Vector2();

    function resize() {
        if (destroyed) return;
        const rect = canvas.getBoundingClientRect();
        frameWidth = Math.max(1, rect.width || window.innerWidth);
        frameHeight = Math.max(1, rect.height || window.innerHeight);
        const aspect = frameWidth / frameHeight;
        camera.aspect = aspect;
        // Keep a generous tree height on phones, while compressing its broad crown.
        camera.fov = aspect < 1 ? 50 : 39;
        const widthScale = aspect < 1 ? clamp(aspect * 1.3, 0.5, 1) : 1;
        cloud.scale.x = widthScale;
        occluders.scale.x = widthScale * 1.08;
        textGroup.scale.x = aspect < 1 ? 0.76 : 1;
        camera.position.set(0, 3.2, 16.4);
        camera.lookAt(0, 0.95, 0);
        camera.updateProjectionMatrix();
        const dpr = Math.min(window.devicePixelRatio || 1, isSmall ? 1.35 : 1.6);
        renderer.setPixelRatio(dpr);
        renderer.setSize(frameWidth, frameHeight, false);
        uniforms.uPixelRatio.value = dpr;
        if (musicBounds) updateMusicTargets();
        if (initialized && (reducedMotion || explicitlyPaused)) drawScene();
    }

    function updateMusicTargets() {
        if (!musicBounds || !frameWidth || !frameHeight) return;
        camera.updateMatrixWorld(true);
        cloud.updateMatrixWorld(true);
        const inverseCloud = new THREE.Matrix4().copy(cloud.matrixWorld).invert();
        const point = new THREE.Vector3();
        const { left, top, width, height } = musicBounds;
        for (let i = 0; i < count; i++) {
            const index = i * 4;
            const side = frameSamples[index];
            const along = frameSamples[index + 1];
            const halo = frameSamples[index + 2];
            const depth = frameSamples[index + 3];
            // Dust spreads outward from the real panel, keeping the content area clear.
            const x = side < 2 ? left + along * width : side === 2 ? left - halo : left + width + halo;
            const y = side < 2 ? side === 0 ? top - halo : top + height + halo : top + along * height;
            point.set(x / frameWidth * 2 - 1, 1 - y / frameHeight * 2, 0.5).unproject(camera);
            point.sub(camera.position);
            point.multiplyScalar((depth - camera.position.z) / point.z).add(camera.position);
            point.applyMatrix4(inverseCloud);
            music.set([point.x, point.y, point.z], i * 3);
        }
        geometry.attributes.aMusic.needsUpdate = true;
    }

    function setMusicBounds(bounds) {
        if (destroyed || !bounds) return;
        const { left, top, width, height } = bounds;
        if (![left, top, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return;
        musicBounds = { left, top, width, height };
        updateMusicTargets();
        if (initialized) drawScene();
    }

    function setPhase(next, immediate = false) {
        if (destroyed || !PHASES[next]) return;
        previous.copy(uniforms.uWeights.value);
        destination.fromArray(PHASES[next]);
        phase = next;
        transitionElapsed = 0;
        transitionDuration = immediate || reducedMotion ? 0 : next === 'cube' ? 2400 : next === 'music' ? 2000 : 2300;
        transitionActive = transitionDuration > 0;
        if (!transitionActive) { uniforms.uWeights.value.copy(destination); uniforms.uTravel.value = 0; }
        onPhase?.(next);
        // A still scene must reflect explicit state changes even when its loop is paused.
        if (!transitionActive || explicitlyPaused) drawScene();
        if (!frame && !explicitlyPaused && !document.hidden) frame = requestAnimationFrame(renderFrame);
    }

    function updateText() {
        const sculptureWeight = uniforms.uWeights.value.x + uniforms.uWeights.value.y;
        const motion = reducedMotion ? 0 : elapsed;
        for (const item of textSprites) {
            const lane = item.lane;
            const distance = (item.offset + motion * lane.speed * 19.5 * textRate) % item.length;
            item.sprite.visible = distance < 19.5 && sculptureWeight > 0.001;
            if (!item.sprite.visible) continue;
            const progress = distance / 19.5;
            const x = (progress - 0.5) * 19.5;
            const wave = Math.sin(progress * TAU + lane.bend);
            // The text path never resets or fades during tree/cube morphs.
            const depth = -0.65 - 3.2 * Math.pow(Math.sin(progress * Math.PI), 2) - lane.depth;
            const y = lane.y + wave * lane.wave + (progress - 0.5) * lane.tilt;
            item.sprite.position.set(x, y, depth);
            item.sprite.scale.set(lane.scale, lane.scale, 1);
            item.sprite.material.rotation = Math.cos(progress * TAU + lane.bend) * 0.15;
            const endFade = Math.min(progress * 9, (1 - progress) * 9, 1);
            const centerFade = 1 - 0.73 * Math.exp(-x * x / 5.5);
            item.sprite.material.opacity = sculptureWeight * lane.opacity * endFade * centerFade;
        }
    }

    function drawScene() {
        if (destroyed) return;
        uniforms.uTime.value = reducedMotion ? 0 : elapsed;
        uniforms.uCubeAngle.value = -0.44 + (reducedMotion ? 0 : Math.sin(elapsed * 0.13) * 0.17);
        occluders.visible = uniforms.uWeights.value.x > 0.95;
        floor.rotation.y = reducedMotion ? 0 : elapsed * 0.009;
        if (!reducedMotion && camera.aspect > 1) {
            cameraOffset.lerp(pointer, 0.025);
            camera.position.x = cameraOffset.x * 0.22;
            camera.position.y = 3.2 + cameraOffset.y * 0.11;
            camera.lookAt(0, 0.95, 0);
        }
        updateText();
        renderer.render(scene, camera);
        if (!ready) { ready = true; onReady?.({ supported: true }); }
    }

    function renderFrame(now) {
        frame = 0;
        if (destroyed || explicitlyPaused || document.hidden) { lastTime = 0; return; }
        const dt = lastTime ? Math.min((now - lastTime) / 1000, 0.06) : 0;
        lastTime = now;
        elapsed += dt;
        if (transitionActive) {
            // Only rendered, active time advances a morph; hidden tabs and readers freeze it.
            transitionElapsed += dt * 1000;
            const t = clamp(transitionElapsed / transitionDuration, 0, 1);
            const eased = t * t * t * (t * (t * 6 - 15) + 10);
            uniforms.uWeights.value.copy(previous).lerp(destination, eased);
            uniforms.uTravel.value = Math.sin(t * Math.PI) * 0.7;
            if (t === 1) { transitionActive = false; uniforms.uTravel.value = 0; }
        }
        drawScene();
        if ((!reducedMotion || transitionActive) && !frame && !explicitlyPaused && !document.hidden && !destroyed) frame = requestAnimationFrame(renderFrame);
    }

    function pause(paused) {
        if (destroyed) return;
        explicitlyPaused = Boolean(paused);
        lastTime = 0;
        if (paused) {
            if (frame) cancelAnimationFrame(frame);
            frame = 0;
            // Boot can pause before the first animation frame in reduced-motion mode.
            if (!ready) drawScene();
        }
        else if (!paused && !frame && !destroyed && !document.hidden) frame = requestAnimationFrame(renderFrame);
    }
    function onVisibility() {
        if (document.hidden) { if (frame) cancelAnimationFrame(frame); frame = 0; lastTime = 0; }
        else if (!explicitlyPaused && !destroyed) { if (!frame) frame = requestAnimationFrame(renderFrame); }
    }
    function onPointer(event) {
        pointer.set(event.clientX / Math.max(1, frameWidth) * 2 - 1, -(event.clientY / Math.max(1, frameHeight) * 2 - 1));
    }
    function onContextLost(event) {
        event.preventDefault();
        pause(true);
        onReady?.({ supported: false, error: new Error('The decorative WebGL context was lost.') });
    }
    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
    resizeObserver?.observe(canvas);
    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('pointermove', onPointer, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    canvas.addEventListener('webglcontextlost', onContextLost);
    resize();
    initialized = true;
    frame = requestAnimationFrame(renderFrame);

    function destroy() {
        if (destroyed) return;
        destroyed = true;
        if (frame) cancelAnimationFrame(frame);
        resizeObserver?.disconnect();
        window.removeEventListener('resize', resize);
        window.removeEventListener('pointermove', onPointer);
        document.removeEventListener('visibilitychange', onVisibility);
        canvas.removeEventListener('webglcontextlost', onContextLost);
        const materials = new Set();
        scene.traverse(object => {
            object.geometry?.dispose();
            if (object.material) {
                for (const item of Array.isArray(object.material) ? object.material : [object.material]) materials.add(item);
            }
        });
        for (const item of materials) item.dispose();
        for (const texture of textTextures.values()) texture.dispose();
        groundGlowTexture.dispose();
        renderer.dispose();
    }
    return { setPhase, pause, resize, destroy, setText, setMusicBounds };
}
