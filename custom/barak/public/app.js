import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SparkRenderer, SplatMesh, dyno } from './vendor/spark.module.min.js';

// Parts of the house as boxes in scene units, after the splat is turned upright (front of the house faces -z).
// The splat has no labels of its own, so these were measured from top, side and front renders of the splat data;
// the invisible boxes built from them are also what the mouse hits.
const PARTS = [
    { name: 'Přízemí', min: [-0.13, -0.02, -0.12], max: [0.28, 0.05, 0.27] },
    { name: 'Modré auto', min: [0.185, -0.025, -0.165], max: [0.26, 0.035, -0.01] },
    { name: 'Střecha', min: [-0.13, 0.145, -0.12], max: [0.28, 0.29, 0.27] },
];
const HOUSE = new THREE.Vector3(0.07, 0.1, 0.07);
const TINT = new THREE.Color('#e3c595');

const canvas = document.getElementById('scene');
const stage = canvas.parentElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color('#083a45');
const camera = new THREE.PerspectiveCamera(50, 1, 0.005, 100);
camera.position.set(0.55, 0.45, -0.7);
const controls = new OrbitControls(camera, canvas);
controls.target.copy(HOUSE);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 0.15;
controls.maxDistance = 4;

scene.add(new SparkRenderer({ renderer }));

// Highlight runs on the GPU per splat: the picked box is tinted, everything else dimmed,
// and splats right above the box fade out so a covered part (ground floor, car under the balcony) shows.
const uMin = dyno.dynoVec3(new THREE.Vector3());
const uMax = dyno.dynoVec3(new THREE.Vector3());
const uOn = dyno.dynoFloat(0);
const highlight = dyno.dynoBlock({ gsplat: dyno.Gsplat }, { gsplat: dyno.Gsplat }, ({ gsplat }) => {
    const d = new dyno.Dyno({
        inTypes: { gsplat: dyno.Gsplat, lo: 'vec3', hi: 'vec3', on: 'float' },
        outTypes: { gsplat: dyno.Gsplat },
        statements: ({ inputs, outputs }) => dyno.unindentLines(`
            ${outputs.gsplat} = ${inputs.gsplat};
            vec3 p = ${inputs.gsplat}.center;
            vec3 lo = ${inputs.lo};
            vec3 hi = ${inputs.hi};
            float column = step(lo.x, p.x) * step(p.x, hi.x) * step(lo.z, p.z) * step(p.z, hi.z);
            float inside = column * step(lo.y, p.y) * step(p.y, hi.y);
            float above = column * step(hi.y, p.y);
            vec3 c = ${inputs.gsplat}.rgba.rgb;
            vec3 lit = mix(c, vec3(${TINT.r}, ${TINT.g}, ${TINT.b}), 0.35);
            ${outputs.gsplat}.rgba.rgb = mix(c, mix(c * 0.4, lit, inside), ${inputs.on});
            ${outputs.gsplat}.rgba.a *= 1.0 - 0.92 * above * ${inputs.on};
        `),
    });
    return { gsplat: d.apply({ gsplat, lo: uMin, hi: uMax, on: uOn }).gsplat };
});

const splat = new SplatMesh({ url: 'barak.sog', worldModifier: highlight });
// the capture is stored upside down, as most splat files are
splat.quaternion.set(1, 0, 0, 0);
scene.add(splat);
splat.initialized.then(() => document.getElementById('loading').remove());

// invisible stand-ins for picking: a splat cannot be raycast like a mesh
const proxyMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
const proxies = PARTS.map((part, i) => {
    const box = new THREE.Box3(new THREE.Vector3(...part.min), new THREE.Vector3(...part.max));
    const size = box.getSize(new THREE.Vector3());
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), proxyMat);
    box.getCenter(mesh.position);
    mesh.userData = { part: i, volume: size.x * size.y * size.z };
    scene.add(mesh);
    return mesh;
});

const buttons = [{ name: 'Celý dům' }, ...PARTS].map((part, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = part.name;
    b.addEventListener('click', () => select(i - 1));
    document.getElementById('floors').append(b);
    return b;
});

let picked = -1;
const anim = { from: 0, to: 0, start: 0, target: new THREE.Vector3(), targetFrom: new THREE.Vector3() };
function select(i) {
    picked = i;
    buttons.forEach((b, k) => b.setAttribute('aria-pressed', String(k === i + 1)));
    if (i >= 0) {
        uMin.value.fromArray(PARTS[i].min);
        uMax.value.fromArray(PARTS[i].max);
    }
    anim.from = uOn.value;
    anim.to = i >= 0 ? 1 : 0;
    anim.start = performance.now();
    anim.targetFrom.copy(controls.target);
    if (i >= 0) proxies[i].getWorldPosition(anim.target);
    else anim.target.copy(HOUSE);
}
select(-1);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
// boxes overlap (the car sits inside the ground floor), so the smallest box under the pointer wins
function partAt(e) {
    const r = canvas.getBoundingClientRect();
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(proxies).map((h) => h.object.userData);
    hits.sort((a, b) => a.volume - b.volume);
    return hits.length ? hits[0].part : -1;
}
let down = null;
canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointermove', (e) => stage.classList.toggle('is-hovering', partAt(e) >= 0));
canvas.addEventListener('click', (e) => {
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
    const i = partAt(e);
    select(i === picked ? -1 : i);
});

function resize() {
    const { clientWidth: w, clientHeight: h } = canvas;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const offset = new THREE.Vector3();
renderer.setAnimationLoop((now) => {
    const t = Math.min(1, (now - anim.start) / 600);
    if (t < 1 || uOn.value !== anim.to) {
        const k = 1 - (1 - t) ** 3;
        uOn.value = anim.from + (anim.to - anim.from) * k;
        splat.updateVersion();
        // glide to the picked part, keeping the viewing angle and distance
        offset.subVectors(camera.position, controls.target);
        controls.target.lerpVectors(anim.targetFrom, anim.target, k);
        camera.position.addVectors(controls.target, offset);
    }
    controls.update();
    renderer.render(scene, camera);
});
