// Turns our scan of the private gym (a SOG from Scanity Studio) into public/gym/gym.sog and gym-lite.sog:
// turned to the gym floor plan's metres (public/gym/plan.json: u right, v down, floor at 0, y up),
// with everything outside the gym's outline cut away (noise behind the walls, the mirrors' reflections).
// It also writes public/gym/shell.json: the colours of the solid walls and floors the page draws behind the scan.
// Run: node build-gym.mjs <scan.sog> [--shell-only]   Needs npx and @playcanvas/splat-transform 3.10 (fetched by npx).
// --shell-only rewrites shell.json and leaves the two .sog files as they are.
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

// npx is a .cmd on Windows, so it runs through the shell there, and a path with a space needs its quotes
const win = process.platform === 'win32';
const run = (...args) => execFileSync('npx', ['-y', TOOL, '-q', '-w', ...args].map((a) => (win && /s/.test(a) ? `"${a}"` : a)), { stdio: 'inherit', shell: win });

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
// in a doorway of an outer wall there is no wall to keep, only what lay outside the door
const outerDoors = (plan.openings ?? []).filter((o) => o.wall <= OUTER_LAST_ID).map((o) => {
    const w = plan.walls.find((x) => x.id === o.wall);
    const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) || 1;
    return { a: w.a, d: [(w.b[0] - w.a[0]) / L, (w.b[1] - w.a[1]) / L], from: o.offset - o.width / 2 - 0.05, to: o.offset + o.width / 2 + 0.05 };
});
const inDoorway = (x, y) => outerDoors.some((o) => {
    const along = (x - o.a[0]) * o.d[0] + (y - o.a[1]) * o.d[1];
    return along > o.from && along < o.to;
});
const out = Buffer.alloc(count * stride);
let kept = 0;
for (let i = 0; i < count; i++) {
    const x = f[i * props];
    const y = f[i * props + 1];
    const z = f[i * props + 2];
    if (y < BOTTOM || y > TOP || !(inside(x, z) || (near(x, z) && !inDoorway(x, z)))) continue;
    body.copy(out, kept++ * stride, i * stride, (i + 1) * stride);
}
writeFileSync(clipped, Buffer.concat([Buffer.from(head.replace(/element vertex \d+/, `element vertex ${kept}`)), out.subarray(0, kept * stride)]));
console.log(`kept ${kept} of ${count} splats`);

/* ---------- the solid shell behind the scan: a colour for each side of each wall, and for each room's floor ---------- */
// Seen from above the scan is see-through at its edges; flat walls and floors in the scan's own colours fill in behind it.
// Written to public/gym/shell.json, which the page builds the walls and floors from.

const WALL_THICK = { outer: 0.26, inner: 0.12 }; // as public/gymplan.js draws them
const CELL = 0.05; // the room map's grid, metres
const SH_C0 = 0.28209479177387814;
const names = head.split('\n').filter((l) => l.startsWith('property')).map((l) => l.split(' ')[2]);
const col = (name) => names.indexOf(name);
const [cOpacity, cR, cG, cB] = ['opacity', 'f_dc_0', 'f_dc_1', 'f_dc_2'].map(col);
const kf = new Float32Array(out.buffer, out.byteOffset, kept * props);
// a splat's own colour (its view-independent part) and how solid it is
const rgbOf = (i) => [cR, cG, cB].map((c) => Math.min(1, Math.max(0, 0.5 + SH_C0 * kf[i * props + c])));
const solid = (i) => 1 / (1 + Math.exp(-kf[i * props + cOpacity])) > 0.5;
const median = (list) => {
    if (!list.length) return null;
    const m = [0, 1, 2].map((k) => list.map((c) => c[k]).sort((p, q) => p - q)[Math.floor(list.length / 2)]);
    return `#${m.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`;
};

// rooms: the plan rasterised with every wall closed (doors too), then filled from each room's label
const us = plan.walls.flatMap((w) => [w.a[0], w.b[0]]);
const vs = plan.walls.flatMap((w) => [w.a[1], w.b[1]]);
const u0 = Math.min(...us) - 0.3;
const v0 = Math.min(...vs) - 0.3;
const cols = Math.ceil((Math.max(...us) + 0.3 - u0) / CELL);
const rows = Math.ceil((Math.max(...vs) + 0.3 - v0) / CELL);
const OUTSIDE = 255;
const grid = new Uint8Array(cols * rows).fill(OUTSIDE);
const segDist = (x, y, a, b) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
};
const WALL = 254;
for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = u0 + (c + 0.5) * CELL;
    const y = v0 + (r + 0.5) * CELL;
    if (!inside(x, y)) continue;
    grid[r * cols + c] = plan.walls.some((w) => segDist(x, y, w.a, w.b) < Math.max(CELL, (w.id <= OUTER_LAST_ID ? WALL_THICK.outer : WALL_THICK.inner) / 2)) ? WALL : 253;
}
const rooms = plan.names.map((n) => ({ name: n.name, u: n.u, v: n.v }));
rooms.forEach((room, index) => {
    const start = Math.floor((room.v - v0) / CELL) * cols + Math.floor((room.u - u0) / CELL);
    const todo = [start];
    while (todo.length) {
        const i = todo.pop();
        if (grid[i] !== 253) continue;
        grid[i] = index;
        const c = i % cols;
        if (c > 0) todo.push(i - 1);
        if (c < cols - 1) todo.push(i + 1);
        if (i >= cols) todo.push(i - cols);
        if (i < cols * (rows - 1)) todo.push(i + cols);
    }
});
// walls and any nook no label reached belong to the nearest room, so the floor runs under them without a gap
for (let pass = 0; pass < 40; pass++) {
    let open = 0;
    const next = grid.slice();
    for (let i = 0; i < grid.length; i++) {
        if (grid[i] < 250 || grid[i] === OUTSIDE) continue;
        const c = i % cols;
        const around = [c > 0 ? grid[i - 1] : OUTSIDE, c < cols - 1 ? grid[i + 1] : OUTSIDE, grid[i - cols] ?? OUTSIDE, grid[i + cols] ?? OUTSIDE].find((g) => g < 250);
        if (around !== undefined) next[i] = around;
        else open++;
    }
    grid.set(next);
    if (!open) break;
}

// floors: the solid splats low in each room, [height, colour]; each room's floor is where most of them lie
// (the rubber floor of the main hall is some 20 cm above the others)
const floorCols = rooms.map(() => []);
const FLOOR_BAND = [-0.35, 0.45];
// walls: per side, the splats on that face, between knee and head height, away from the ends and the doors
const sideCols = plan.walls.map(() => [[], []]);
const gapsOf = (wall) => (plan.openings ?? []).filter((o) => o.wall === wall.id).map((o) => [o.offset - o.width / 2 - 0.1, o.offset + o.width / 2 + 0.1]);
const wallGeo = plan.walls.map((w) => {
    const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) || 1;
    return { L, d: [(w.b[0] - w.a[0]) / L, (w.b[1] - w.a[1]) / L], half: (w.id <= OUTER_LAST_ID ? WALL_THICK.outer : WALL_THICK.inner) / 2, gaps: gapsOf(w) };
});
for (let i = 0; i < kept; i++) {
    if (!solid(i)) continue;
    const x = kf[i * props];
    const h = kf[i * props + 1];
    const y = kf[i * props + 2];
    if (h > FLOOR_BAND[0] && h < FLOOR_BAND[1]) {
        const cell = grid[Math.floor((y - v0) / CELL) * cols + Math.floor((x - u0) / CELL)];
        if (cell < 250) floorCols[cell].push([h, rgbOf(i)]);
    }
    if (h < 0.3 || h > 2.2) continue;
    plan.walls.forEach((w, k) => {
        const g = wallGeo[k];
        const px = x - w.a[0];
        const py = y - w.a[1];
        const along = px * g.d[0] + py * g.d[1];
        if (along < 0.15 || along > g.L - 0.15 || g.gaps.some(([s, e]) => along > s && along < e)) return;
        // the left of a -> b is side 0
        const across = -px * g.d[1] + py * g.d[0];
        const off = Math.abs(across) - g.half;
        if (off < -0.06 || off > 0.15) return;
        sideCols[k][across > 0 ? 0 : 1].push(rgbOf(i));
    });
}
// an outer wall has the scan on its inner side only; what lies outside it is haze
const innerSide = (w, g) => {
    const mid = [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2];
    return inside(mid[0] - g.d[1] * 0.4, mid[1] + g.d[0] * 0.4) ? 0 : 1;
};
const floorOf = (list) => {
    const bins = new Map();
    for (const [h] of list) { const b = Math.round(h / 0.02); bins.set(b, (bins.get(b) ?? 0) + 1); }
    const level = [...bins].sort((p, q) => q[1] - p[1])[0][0] * 0.02;
    const on = list.filter(([h]) => Math.abs(h - level) < 0.04).map(([, c]) => c);
    return { level: +level.toFixed(2), floor: median(on), samples: on.length };
};
const MIN_SAMPLES = 60;
// which room a side faces: the cell a little way out from the wall's middle
const roomOf = (w, g, side) => {
    const s = side === 0 ? 1 : -1;
    const x = (w.a[0] + w.b[0]) / 2 - g.d[1] * s * (g.half + 0.2);
    const y = (w.a[1] + w.b[1]) / 2 + g.d[0] * s * (g.half + 0.2);
    const cell = grid[Math.floor((y - v0) / CELL) * cols + Math.floor((x - u0) / CELL)];
    return cell < 250 && inside(x, y) ? cell : -1;
};
const wallSides = plan.walls.map((w, k) => sideCols[k].map((list, side) => {
    const faces = roomOf(w, wallGeo[k], side);
    if (faces < 0 || (w.id <= OUTER_LAST_ID && side !== innerSide(w, wallGeo[k]))) return null;
    return { room: faces, colour: list.length >= MIN_SAMPLES ? median(list) : null, list };
}));
// a side with too few splats of its own takes the colour of the rest of its room's walls
const roomWalls = rooms.map((_, r) => median(wallSides.flat().filter((s) => s?.room === r && s.colour).flatMap((s) => s.list)));
wallSides.forEach((sides, k) => { wallSides[k] = sides.map((s) => (s ? s.colour ?? roomWalls[s.room] : null)); });
const shell = {
    cell: CELL,
    origin: [u0, v0],
    cols,
    rows,
    // the room of each cell, run-length coded row by row: "<room><count>," with "." for outside the gym
    grid: (() => {
        let s = '';
        for (let i = 0; i < grid.length;) {
            let n = 1;
            while (i + n < grid.length && grid[i + n] === grid[i]) n++;
            s += `${grid[i] < 250 ? grid[i] : '.'}${n},`;
            i += n;
        }
        return s;
    })(),
    // level: the room's scanned floor height, so the solid floor goes just under it
    rooms: rooms.map((r, k) => ({ name: r.name, ...floorOf(floorCols[k]) })),
    walls: plan.walls.map((w, k) => ({ id: w.id, thickness: wallGeo[k].half * 2, sides: wallSides[k] })),
};
writeFileSync(join(OUT, 'shell.json'), JSON.stringify(shell));
console.log('rooms', shell.rooms.map((r) => `${r.name} ${r.floor} at ${r.level} m (${r.samples})`).join(', '));
console.log('walls with both sides', shell.walls.filter((w) => w.sides[0] && w.sides[1]).length, 'one side', shell.walls.filter((w) => !w.sides[0] !== !w.sides[1]).length, 'none', shell.walls.filter((w) => !w.sides[0] && !w.sides[1]).length);
if (process.argv.includes('--shell-only')) {
    rmSync(work, { recursive: true, force: true });
    process.exit(0);
}

run(clipped, join(OUT, 'gym.sog'));
run(clipped, '-H', '1', '--decimate', String(LITE_SPLATS), lite);
run(lite, join(OUT, 'gym-lite.sog'));
rmSync(work, { recursive: true, force: true });
