// Turns our scan of the private gym (a SOG from Scanity Studio) into public/gym/gym.sog and gym-lite.sog:
// turned to the gym floor plan's metres (public/gym/plan.json: u right, v down, floor at 0, y up),
// with everything outside the gym's outline cut away (noise behind the walls, the mirrors' reflections).
// Run: node build-gym.mjs <scan.sog>   Needs npx and @playcanvas/splat-transform 3.10 (fetched by npx).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'public', 'gym');
const TOOL = '@playcanvas/splat-transform@3.10.0';

// Scan to plan, found once by fitting the plan's walls onto the scan's wall points (mean error about 3 cm).
// The scan is z up; its main floor is at z = -0.18. Each step is a splat-transform action, in order.
const TO_PLAN = [
    ['-t', '0.29106,0.41512,0.18'], // the fitted plan middle to the origin, the floor to 0
    ['-r', '0,0,-29.95'], // the plan's walls along the axes
    ['-t', '-0.47313,-0.21668,0'], // back to the plan's own origin
    ['-r', '90,0,0'], // z up to y up, so v (down on the plan) becomes +z
];
const OUTER_LAST_ID = 32; // as in public/gymplan.js
const MARGIN = 0.3; // kept outside the outline, so the walls keep their full thickness
const BOTTOM = -0.4;
const TOP = 3.45; // just above the highest ceiling
const LITE_SPLATS = 750000; // for phones, with first-order colour only

const run = (...args) => execFileSync('npx', ['-y', TOOL, '-q', '-w', ...args], { stdio: 'inherit', shell: process.platform === 'win32' });

const src = process.argv[2];
if (!src) throw new Error('usage: node build-gym.mjs <scan.sog>');
const work = mkdtempSync(join(tmpdir(), 'gym-'));
const turned = join(work, 'turned.ply');
const clipped = join(work, 'clipped.ply');
const lite = join(work, 'lite.ply');

run(src, ...TO_PLAN.flat(), turned);

// the cut: a plain PLY of floats, so the splats inside the outline are copied over as they are
const buf = readFileSync(turned);
const end = buf.indexOf('end_header\n') + 11;
const head = buf.subarray(0, end).toString();
const count = +head.match(/element vertex (\d+)/)[1];
const props = head.split('\n').filter((l) => l.startsWith('property')).length;
if (!/property float x\nproperty float y\nproperty float z\n/.test(head) || /property (?!float)/.test(head)) throw new Error('unexpected PLY layout');
const stride = props * 4;
const body = Buffer.from(buf.subarray(end));
const f = new Float32Array(body.buffer, body.byteOffset, count * props);
const plan = JSON.parse(readFileSync(join(OUT, 'plan.json')));
const poly = plan.walls.filter((w) => w.id <= OUTER_LAST_ID).map((w) => w.a);
const inside = (x, y) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i];
        const [xj, yj] = poly[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
};
const near = (x, y) => poly.some((b, i) => {
    const a = poly[(i + poly.length - 1) % poly.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy) < MARGIN;
});
const out = Buffer.alloc(count * stride);
let kept = 0;
for (let i = 0; i < count; i++) {
    const x = f[i * props];
    const y = f[i * props + 1];
    const z = f[i * props + 2];
    if (y < BOTTOM || y > TOP || !(inside(x, z) || near(x, z))) continue;
    body.copy(out, kept++ * stride, i * stride, (i + 1) * stride);
}
writeFileSync(clipped, Buffer.concat([Buffer.from(head.replace(/element vertex \d+/, `element vertex ${kept}`)), out.subarray(0, kept * stride)]));
console.log(`kept ${kept} of ${count} splats`);

run(clipped, join(OUT, 'gym.sog'));
run(clipped, '-H', '1', '--decimate', String(LITE_SPLATS), lite);
run(lite, join(OUT, 'gym-lite.sog'));
rmSync(work, { recursive: true, force: true });
