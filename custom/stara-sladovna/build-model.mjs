// Cuts the Stará Sladovna complex and its surroundings out of Brno's open 3D building model
// and writes public/model.bin + public/model.json. Run: node build-model.mjs
// Sources in data-src/: Brno LOD2 model, grid cell 120 (CC BY); OpenStreetMap footprints, streets, stops and greenery (ODbL).
import earcut from 'earcut';
import proj4 from 'proj4';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, 'data-src', 'brno-3d-grid-120');
const OUT = join(HERE, 'public');

const SJTSK = '+proj=krovak +lat_0=49.5 +lon_0=24.8333333333333 +alpha=30.2881397527778 +k=0.9999 +x_0=0 +y_0=0 +ellps=bessel +towgs84=570.8,85.7,462.8,4.998,1.587,5.261,3.56 +units=m +no_defs';
const ORIGIN_X = -599741.855;
const ORIGIN_Z = 1161065.315;
const CENTER = [428, 8]; // middle of the complex, in the source file's metres
const CONTEXT_RADIUS = 240;
const GROUND_RADIUS = 300;
const GROUND_STEP = 4;
const MAP_RADIUS = 300;
const EDGE_TOLERANCE = 1; // walls stand on the footprint's edge, and the two sources differ slightly
const WALL_SKIRT = 12; // walls reach this far below the smoothed ground, so none can end in mid-air
const FLATTEN_FEATHER = 7;

const OSM_KANCELARE = 33197041;
const OSM_SCHODISTE = 33265893;
const OSM_HLAVNI = 33197037;
const FLOORS = 4;

// The user's top-down screenshot of the parking court, placed by the hall's north wall, whose two
// ends are known in both: image (500, 55) is the source's (426.6, 12), image (615, 585) its (381, 25).
const courtImage = (() => {
    const [ax, ay, bx, by] = [500, 55, 615, 585];
    const [sx, sz, tx, tz] = [426.6, 12, 381, 25];
    const scale = Math.hypot(tx - sx, tz - sz) / Math.hypot(bx - ax, by - ay);
    const angle = Math.atan2(tz - sz, tx - sx) - Math.atan2(by - ay, bx - ax);
    const c = Math.cos(angle) * scale;
    const s = Math.sin(angle) * scale;
    return (x, y) => [sx + c * (x - ax) - s * (y - ay), sz + s * (x - ax) + c * (y - ay)];
})();
const PARKOVISTE = [[60, 205], [495, 540], [610, 585], [500, 55], [395, 100], [390, 150], [290, 190], [275, 125], [72, 165]].map(([x, y]) => courtImage(x, y));

/** A row of marked bays: from, to along the row's front edge, how many, and which way they point. */
const bayRow = ([x1, y1], [x2, y2], count, [dx, dy]) => {
    const bays = [];
    for (let i = 0; i < count; i++) {
        const a = [x1 + ((x2 - x1) * i) / count, y1 + ((y2 - y1) * i) / count];
        const b = [x1 + ((x2 - x1) * (i + 1)) / count, y1 + ((y2 - y1) * (i + 1)) / count];
        bays.push([a, b, [b[0] + dx, b[1] + dy], [a[0] + dx, a[1] + dy]].map(([x, y]) => courtImage(x, y)));
    }
    return bays;
};
const PARKING_BAYS = [
    // the screenshot's bays nearest the offices, moved clear of the model's walls and eaves, where cars would stand inside them
    ...bayRow([156.5, 251.5], [470, 510], 11, [36, -46]), // along the fence
    ...bayRow([505, 238], [572, 455], 5, [-58, 16]), // along the hall
    ...bayRow([304, 214], [396, 194], 3, [12, 54]), // in front of the staircase
    ...bayRow([440, 118], [500, 104], 2, [12, 56]), // in the far corner
    ...bayRow([239, 182], [281, 176], 1, [8, 52]), // beside the offices
];

// Parts of the L-shaped main building that look different, read off the roof plan and the user's photos.
const HALL = [[381, 25], [426.6, 12], [435.8, 41], [397.2, 52.6], [384.4, 38]];
const CORNER = [[436, 41.6], [455.6, 43], [460.8, 58.6], [442, 61.6]];
const CHIMNEY = { x: 446.1, z: 39.05, radius: 2.6 };
const TOWER_RADIUS = 9.5;

// The terrace in the crook of the L, as outlined by the user.
const TERASA = [[404, 51.5], [409, 61.5], [418, 64.7], [433, 62.3], [441.4, 60.6], [435.9, 41]];
const TERRACE_RISE = 1.3; // the terrace stands this far above the street, behind a cream retaining wall
// The cream wall with its terracotta cap: along the parking court, and from the corner building along the street.
const PERIMETER = [[courtImage(40, 190), courtImage(495, 540)], [[460.8, 58.7], [501, 51.5]]];

// Big trees standing around the complex on the user's aerial views, where the map lists none.
const AERIAL_TREES = [[446, -8, 8], [454, 2, 7], [438, -18, 7], [466, 10, 8], [430, -28, 7], [462, -6, 6], [474, 22, 7], [470, 36, 6]];

// Surface kinds the page's shader knows. Keep in step with public/app.js.
const KIND = { plain: 0, hall: 1, regular: 2, office: 3, brick: 4, court: 5, sal: 6, dormer: 7, metal: 10, tile: 11, slate: 12, officeTile: 13 };
const FACADE = {
    [KIND.hall]: { bay: 3.7, floor: 4.2 },
    [KIND.regular]: { bay: 3.1, floor: 3.7 },
    [KIND.office]: { bay: 3.3, floor: 3.32 },
    [KIND.court]: { bay: 3.5, floor: 3.6 },
    [KIND.sal]: { bay: 4.4, floor: 6 },
};
const MIN_FACADE_LENGTH = 3;
const MIN_FACADE_HEIGHT = 3;

// Who walks from where: the stop nearest the complex, and the offices' door beside their staircase (assumed).
const BUS_STOP = [16.59306, 49.19044];
const TRAM_STOP = [16.59413, 49.19018];
const WALK_TARGET = courtImage(340, 215);
const WALK_SPEED = 1.3; // m/s
const PLATFORM_REACH = 40;

const ROAD_WIDTH = { secondary: 11, tertiary: 9, residential: 7, unclassified: 6.5, living_street: 5.5, pedestrian: 4.5, service: 3.6 };
const LABELLED_STREETS = ['Křížová', 'Pivovarská', 'Hlinky', 'Úvoz', 'Výstavní'];

const read = (file) => {
    const v = [];
    const faces = [];
    for (const line of readFileSync(join(SRC, file), 'utf8').split('\n')) {
        if (line.startsWith('v ')) {
            const [, x, y, z] = line.trim().split(/\s+/);
            v.push([+x, +y, +z]);
        } else if (line.startsWith('f ')) {
            faces.push(line.trim().split(/\s+/).slice(1).map((s) => parseInt(s, 10) - 1));
        }
    }
    return faces.flatMap((f) => f.slice(1, -1).map((_, i) => [v[f[0]], v[f[i + 1]], v[f[i + 2]]]));
};

const local = (lon, lat) => {
    const [x, y] = proj4('WGS84', SJTSK, [lon, lat]);
    return [x - ORIGIN_X, -y - ORIGIN_Z];
};
const footprints = Object.fromEntries(JSON.parse(readFileSync(join(HERE, 'data-src', 'osm-footprints.json'), 'utf8')).elements.map((e) => [e.id, e.geometry.map((g) => local(g.lon, g.lat))]));

const inside = (x, z, poly) => {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, zi] = poly[i];
        const [xj, zj] = poly[j];
        if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
    }
    return hit;
};
const edgeDistance = (x, z, poly) => {
    let best = Infinity;
    for (let i = 0; i < poly.length - 1; i++) {
        const [ax, az] = poly[i];
        const [bx, bz] = poly[i + 1];
        const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2 || 1)));
        best = Math.min(best, Math.hypot(x - ax - t * (bx - ax), z - az - t * (bz - az)));
    }
    return best;
};
const closed = (poly) => [...poly, poly[0]];
const within = (x, z, poly) => inside(x, z, poly) || edgeDistance(x, z, poly) < EDGE_TOLERANCE;
const centre = (tri) => [(tri[0][0] + tri[1][0] + tri[2][0]) / 3, (tri[0][2] + tri[1][2] + tri[2][2]) / 3];

const walls = read('Svisle_steny_120.obj');
const roofs = [...read('Sikme_strechy_120.obj'), ...read('Vodorovne_strechy_120.obj')];
const terrain = read('Terrain_120.obj');

/* ---------- ground: one smooth surface instead of the source's coarse triangles ---------- */

const rawGround = (x, z) => {
    for (const [a, b, c] of terrain) {
        const d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
        if (!d) continue;
        const u = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / d;
        const v = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / d;
        if (u >= 0 && v >= 0 && u + v <= 1) return u * a[1] + v * b[1] + (1 - u - v) * c[1];
    }
    return null;
};
const medianGround = (poly) => {
    const xs = poly.map((p) => p[0]);
    const zs = poly.map((p) => p[1]);
    const samples = [];
    for (let x = Math.min(...xs); x < Math.max(...xs); x += 3) {
        for (let z = Math.min(...zs); z < Math.max(...zs); z += 3) {
            if (inside(x, z, poly)) {
                const y = rawGround(x, z);
                if (y !== null) samples.push(y);
            }
        }
    }
    return samples.sort((a, b) => a - b)[Math.floor(samples.length / 2)];
};
const parkingLevel = medianGround(PARKOVISTE);
const terraceLevel = medianGround(TERASA);

const GRID = Math.round((GROUND_RADIUS * 2) / GROUND_STEP) + 1;
const gridX = (i) => CENTER[0] - GROUND_RADIUS + i * GROUND_STEP;
const gridZ = (j) => CENTER[1] - GROUND_RADIUS + j * GROUND_STEP;
let heights = new Float64Array(GRID * GRID).fill(NaN);
for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) heights[j * GRID + i] = rawGround(gridX(i), gridZ(j)) ?? NaN;
// the source's cell ends at its border: carry the nearest known height outwards
for (let pass = 0; pass < GRID; pass++) {
    let missing = 0;
    const next = heights.slice();
    for (let j = 0; j < GRID; j++) {
        for (let i = 0; i < GRID; i++) {
            if (!Number.isNaN(heights[j * GRID + i])) continue;
            let sum = 0;
            let n = 0;
            for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const v = heights[(j + dj) * GRID + i + di];
                if (i + di >= 0 && i + di < GRID && j + dj >= 0 && j + dj < GRID && !Number.isNaN(v)) {
                    sum += v;
                    n++;
                }
            }
            if (n) next[j * GRID + i] = sum / n;
            else missing++;
        }
    }
    heights = next;
    if (!missing) break;
}
for (let pass = 0; pass < 5; pass++) {
    const next = heights.slice();
    for (let j = 1; j < GRID - 1; j++) {
        for (let i = 1; i < GRID - 1; i++) {
            const k = j * GRID + i;
            next[k] = (heights[k] * 4 + heights[k - 1] + heights[k + 1] + heights[k - GRID] + heights[k + GRID]) / 8;
        }
    }
    heights = next;
}
// the parking court and the terrace are level, with a soft edge into the slope around them
// the office building stands on the court's level too, or the slope would rise through its ground floor
const officeRing = footprints[OSM_KANCELARE].slice(0, -1);
const officeMiddle = officeRing.reduce((m, p) => [m[0] + p[0] / officeRing.length, m[1] + p[1] / officeRing.length], [0, 0]);
// a little wider than the walls: the ground is a 4 m grid, so an exact outline would still poke in between its points
const officeSite = officeRing.map((p) => [officeMiddle[0] + (p[0] - officeMiddle[0]) * 1.4, officeMiddle[1] + (p[1] - officeMiddle[1]) * 1.4]);
for (const [poly, level] of [[PARKOVISTE, parkingLevel], [TERASA, terraceLevel], [officeSite, parkingLevel]]) {
    const ring = closed(poly);
    for (let j = 0; j < GRID; j++) {
        for (let i = 0; i < GRID; i++) {
            const x = gridX(i);
            const z = gridZ(j);
            const d = inside(x, z, poly) ? 0 : edgeDistance(x, z, ring);
            if (d >= FLATTEN_FEATHER) continue;
            const t = d / FLATTEN_FEATHER;
            const keep = t * t * (3 - 2 * t);
            heights[j * GRID + i] = level * (1 - keep) + heights[j * GRID + i] * keep;
        }
    }
}
const groundAt = (x, z) => {
    const fx = Math.max(0, Math.min(GRID - 1.001, (x - gridX(0)) / GROUND_STEP));
    const fz = Math.max(0, Math.min(GRID - 1.001, (z - gridZ(0)) / GROUND_STEP));
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const u = fx - i;
    const v = fz - j;
    const h = (a, b) => heights[b * GRID + a];
    return (h(i, j) * (1 - u) + h(i + 1, j) * u) * (1 - v) + (h(i, j + 1) * (1 - u) + h(i + 1, j + 1) * u) * v;
};
const baseY = groundAt(...CENTER);
const shift = (x, y, z) => [+(x - CENTER[0]).toFixed(2), +(y - baseY).toFixed(2), +(z - CENTER[1]).toFixed(2)];
const flat = (x, z) => [+(x - CENTER[0]).toFixed(1), +(z - CENTER[1]).toFixed(1)];

/* ---------- buildings ---------- */

const kancelare = [footprints[OSM_KANCELARE], footprints[OSM_SCHODISTE]];
// The small gable on the tower's roof, from the city model: its front runs a-b, its eaves and apex.
const DORMER = { a: [438.8, 39.3], b: [440.0, 43.3], foot: -27.2, apex: -22.3, reach: 0.4 };
const PROFILE_STEP = 0.5;
const GARDEN_EDGE = 2;
const COMPLEX_MARGIN = 3.5; // the map's outline and the model differ, and whatever falls between them is still this building
const OSM_PRISTAVBA = 33265891; // the annex behind the offices, part of the complex
const nearComplex = (x, z) => [footprints[OSM_HLAVNI], footprints[OSM_PRISTAVBA]].some((p) => inside(x, z, p) || edgeDistance(x, z, p) < COMPLEX_MARGIN);
const partOf = (x, z) => {
    if (kancelare.some((p) => within(x, z, p))) return 'kancelare';
    if (inside(x, z, TERASA) && edgeDistance(x, z, closed(TERASA)) > GARDEN_EDGE) return null; // the garden is modelled by hand
    if (nearComplex(x, z)) return within(x, z, closed(CORNER)) && !(Math.hypot(x - CHIMNEY.x, z - CHIMNEY.z) < TOWER_RADIUS) ? 'sal' : 'hlavni';
    return Math.hypot(x - CENTER[0], z - CENTER[1]) < CONTEXT_RADIUS ? 'okoli' : null;
};

/**
 * Where a wall stands. A wall is two triangles, and the centre of either lies off the wall's line
 * towards its heavier end, enough to miss the footprint; the middle of its longest run does not.
 */
const footMiddle = (tri) => {
    let best = [tri[0], tri[1]];
    let bestD = -1;
    for (const [a, b] of [[tri[0], tri[1]], [tri[1], tri[2]], [tri[0], tri[2]]]) {
        const d = Math.hypot(a[0] - b[0], a[2] - b[2]);
        if (d > bestD) {
            bestD = d;
            best = [a, b];
        }
    }
    return [(best[0][0] + best[1][0]) / 2, (best[0][2] + best[1][2]) / 2];
};

/**
 * A plain strip below a wall's foot, so the smoothed ground meets every wall. It is added beside the
 * wall rather than stretching it, because a stretched triangle would overlap its neighbour.
 */
const skirtOf = (tri) => {
    const low = Math.min(tri[0][1], tri[1][1], tri[2][1]);
    const feet = tri.filter((p) => p[1] < low + 0.05 && p[1] < groundAt(p[0], p[2]) + 4);
    if (feet.length !== 2) return [];
    const [a, b] = feet;
    const a2 = [a[0], a[1] - WALL_SKIRT, a[2]];
    const b2 = [b[0], b[1] - WALL_SKIRT, b[2]];
    return [[a, b, b2], [a, b2, a2]].map((t) => Object.assign(t, { skirt: true }));
};

const parts = { okoli_steny: [], okoli_strechy: [], hlavni_steny: [], hlavni_strechy: [], sal_steny: [], sal_strechy: [], kancelare_steny: [], kancelare_strechy: [] };

/* ---------- facades drawn wall by wall on the page: each lists the source model's flat walls it covers ---------- */

const FACADES = [
    { name: 'hallSouth', zone: 'hall', base: 'street', segments: [[[397, 53.1], [435.8, 41.8]]] },
    { name: 'hallWest', zone: 'hall', base: 'street', segments: [[[384, 38.3], [388.9, 43.8]], [[388.9, 43.8], [397, 53.1]]] },
    { name: 'hallNorthWest', zone: 'hall', base: 'street', segments: [[[381.2, 25], [384, 38.3]]] },
    { name: 'hallNorth', zone: 'hall', base: 'parking', segments: [[[381.2, 25], [421.3, 13.3]]] },
    { name: 'hallEast', zone: 'hall', base: 'street', segments: [[[434.2, -5], [441.2, 27]]] },
    { name: 'salSouth', zone: 'sal', base: 'street', segments: [[[442, 61.3], [450.6, 60.1]], [[450.6, 60.1], [458, 59]], [[458, 59], [461, 58.6]]] },
    { name: 'salEast', zone: 'sal', base: 'street', segments: [[[456.1, 43.3], [461, 58.6]]] },
    { name: 'salWest', zone: 'sal', base: 'street', segments: [[[435.8, 41.8], [442, 61.3]]] },
    { name: 'officeWest', zone: 'kancelare', base: 'parking', segments: [[[410.6, -20.1], [416.2, -4.1]], [[416.7, -4.3], [418.3, 0.4]]] },
    { name: 'officeEast', zone: 'kancelare', base: 'parking', segments: [[[424.6, -24.5], [431.7, -4.2]]] },
    { name: 'officeNorth', zone: 'kancelare', base: 'parking', segments: [[[410.6, -20.1], [417.7, -22.5]], [[417.7, -22.5], [424.6, -24.5]]] },
    { name: 'officeSouth', zone: 'kancelare', base: 'parking', segments: [[[418.3, 0.4], [421.2, -0.6]], [[421.2, -0.6], [431.7, -4.2]]] },
    { name: 'stairsWest', painter: 'officeStairs', zone: 'kancelare', base: 'parking', segments: [[[412.2, -2.7], [414.8, 4.9]]] },
    { name: 'stairsSouth', painter: 'officeStairs', zone: 'kancelare', base: 'parking', segments: [[[414.8, 4.9], [419.3, 3.3]]] },
    { name: 'stairsNorth', painter: 'officeSouth', zone: 'kancelare', base: 'parking', segments: [[[416.2, -4.1], [412.2, -2.7]]] },
];
const FACADE_REACH = 1.3;
const facadeOf = (tri) => {
    const [x, z] = footMiddle(tri);
    const low = tri.reduce((best, p) => (p[1] < best[1] ? p : best));
    const far = tri.reduce((best, p) => (Math.hypot(p[0] - low[0], p[2] - low[2]) > Math.hypot(best[0] - low[0], best[2] - low[2]) ? p : best));
    const dir = [far[0] - low[0], far[2] - low[2]];
    const length = Math.hypot(...dir);
    for (const facade of FACADES) {
        let start = 0;
        for (const [a, b] of facade.segments) {
            const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
            const parallel = length < 0.1 || Math.abs((dir[0] * (b[0] - a[0]) + dir[1] * (b[1] - a[1])) / (length * L)) > 0.97;
            if (parallel && edgeDistance(x, z, [a, b]) < FACADE_REACH) return { facade, a, b, L, start };
            start += L;
        }
    }
    return null;
};
for (const facade of FACADES) {
    facade.tris = [];
    facade.L = facade.segments.reduce((sum, [a, b]) => sum + Math.hypot(b[0] - a[0], b[1] - a[1]), 0);
}
for (const tri of walls) {
    const part = partOf(...footMiddle(tri));
    if (!part) continue;
    const hit = part === 'okoli' ? null : facadeOf(tri);
    if (hit) {
        const uv = tri.map((p) => [hit.start + ((p[0] - hit.a[0]) * (hit.b[0] - hit.a[0]) + (p[2] - hit.a[1]) * (hit.b[1] - hit.a[1])) / hit.L, p[1]]);
        hit.facade.tris.push({ tri, uv });
        for (const skirt of skirtOf(tri)) hit.facade.tris.push({ tri: skirt, uv: skirt.map((p) => [hit.start + ((p[0] - hit.a[0]) * (hit.b[0] - hit.a[0]) + (p[2] - hit.a[1]) * (hit.b[1] - hit.a[1])) / hit.L, p[1]]) });
    } else parts[`${part}_steny`].push(tri, ...skirtOf(tri));
}
for (const tri of roofs) {
    const part = partOf(...centre(tri));
    if (part) parts[`${part}_strechy`].push(tri);
}

/* ---------- surfaces ---------- */

const chimneyDistance = (x, z) => Math.hypot(x - CHIMNEY.x, z - CHIMNEY.z);
const roofYs = parts.kancelare_strechy.filter((t) => inside(...centre(t), footprints[OSM_KANCELARE])).flat().map((p) => p[1]);
const eaveY = Math.min(...roofYs); // the staircase has its own, lower roof, so only the main block sets the eave
const peakY = Math.max(...roofYs);
const officeFloor = (eaveY - parkingLevel) / FLOORS;

const nearLine = (x, z, a, b) => edgeDistance(x, z, [a, b]) < 1.6;
const wallKind = (part, tri) => {
    const [x, z] = footMiddle(tri);
    if (part === 'kancelare') return KIND.office;
    if (part === 'sal') return KIND.sal;
    if (chimneyDistance(x, z) < CHIMNEY.radius) return KIND.brick;
    if (chimneyDistance(x, z) < TOWER_RADIUS + 2 && Math.min(tri[0][1], tri[1][1], tri[2][1]) > DORMER_FOOT) return KIND.dormer;
    return within(x, z, closed(HALL)) ? KIND.court : KIND.regular;
};
// From the user's aerial view of the tower: slate only on the tall pyramid, a sheet-metal hip below it
// towards the garden, terracotta beside the tower and on the corner building.
const TOWER_EAVE = -26.6;
const DORMER_FOOT = -30.5;
const METAL_BELOW_TOWER = [[435.5, 40.5], [444, 39.5], [445.5, 50.5], [438.5, 52]];
const TILE_BESIDE_TOWER = [[430, 25], [444, 20], [449.5, 30], [437, 37.5]];
const roofKind = (part, tri) => {
    const [x, z] = centre(tri);
    if (part === 'kancelare') return KIND.officeTile;
    const top = Math.max(tri[0][1], tri[1][1], tri[2][1]);
    if (chimneyDistance(x, z) < TOWER_RADIUS && top > TOWER_EAVE) return KIND.slate;
    if (inside(x, z, METAL_BELOW_TOWER)) return KIND.metal;
    if (part === 'sal') return KIND.tile;
    return inside(x, z, TILE_BESIDE_TOWER) ? KIND.tile : KIND.metal;
};

/** Windows need whole bays and storeys, so each flat wall is measured as a whole first. */
const wallAttributes = (part, tris) => {
    const planes = new Map();
    const meta = tris.map((tri) => {
        if (tri.skirt) return null;
        const [a, b, c] = tri;
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
        const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        let nx = uy * vz - uz * vy;
        let nz = ux * vy - uy * vx;
        const length = Math.hypot(nx, nz) || 1;
        nx /= length;
        nz /= length;
        if (nx < 0 || (nx === 0 && nz < 0)) {
            nx = -nx;
            nz = -nz;
        }
        const kind = wallKind(part, tri);
        const key = `${kind}:${Math.round((Math.atan2(nz, nx) * 180) / Math.PI / 3)}:${Math.round((a[0] * nx + a[2] * nz) / 0.6)}`;
        const tx = -nz;
        const tz = nx;
        if (!planes.has(key)) planes.set(key, { min: Infinity, max: -Infinity, top: -Infinity, low: Infinity, groundMax: -Infinity });
        const plane = planes.get(key);
        for (const p of tri) {
            const s = p[0] * tx + p[2] * tz;
            plane.min = Math.min(plane.min, s);
            plane.max = Math.max(plane.max, s);
            if (p[1] > plane.top) plane.topAt = s;
            plane.top = Math.max(plane.top, p[1]);
            plane.low = Math.min(plane.low, p[1]);
            plane.groundMax = Math.max(plane.groundMax, groundAt(p[0], p[2]));
        }
        return { key, tx, tz, kind };
    });
    return tris.flatMap((tri, i) => {
        if (!meta[i]) return tri.flatMap(() => [0, 0, KIND.plain, 0]);
        const { key, tx, tz, kind } = meta[i];
        const plane = planes.get(key);
        const length = plane.max - plane.min;
        if (kind === KIND.brick) return tri.flatMap((p) => [(p[0] * tx + p[2] * tz) / 0.5, p[1] / 0.25, KIND.brick, 0]);
        if (kind === KIND.dormer) {
            // only the gable's front carries its window; the walls that share its plane stay plain
            const { a, b, foot, apex, reach } = DORMER;
            const span = Math.hypot(b[0] - a[0], b[1] - a[1]);
            const along = (p) => ((p[0] - a[0]) * (b[0] - a[0]) + (p[2] - a[1]) * (b[1] - a[1])) / (span * span);
            const front = tri.every((p) => edgeDistance(p[0], p[2], [a, b]) < reach && p[1] >= foot - 0.1);
            return tri.flatMap((p) => [along(p), (apex - p[1]) / (apex - foot), KIND.dormer, front ? 1 : 0]);
        }
        const floor = kind === KIND.office ? officeFloor : FACADE[kind].floor;
        const { bay } = FACADE[kind];
        if (length < MIN_FACADE_LENGTH || plane.top - plane.groundMax < MIN_FACADE_HEIGHT) return tri.flatMap(() => [0, 0, KIND.plain, 0]);
        const bays = Math.max(1, Math.round(length / bay));
        // the offices count their storeys from the eave, so a gable's peak cannot shift them off the floors
        const top = kind === KIND.office ? eaveY : plane.top;
        const rows = kind === KIND.office ? FLOORS : Math.max(1, Math.round((top - plane.groundMax) / floor));
        return tri.flatMap((p) => [((p[0] * tx + p[2] * tz - plane.min) / length) * bays, (top - p[1]) / floor, kind, rows]);
    });
};

const ROOF_AXIS = (() => {
    const [x, z] = [435.8 - 397, 41.8 - 53.1];
    const l = Math.hypot(x, z);
    return [x / l, z / l];
})();
const ROOF_AXES = [ROOF_AXIS, [-ROOF_AXIS[0], -ROOF_AXIS[1]], [-ROOF_AXIS[1], ROOF_AXIS[0]], [ROOF_AXIS[1], -ROOF_AXIS[0]]];

/** Sheet seams and tile courses run down the slope, so the pattern follows each roof face. */
const roofAttributes = (part, tris) =>
    tris.flatMap((tri) => {
        const [a, b, c] = tri;
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
        const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        const nx = uy * vz - uz * vy;
        const ny = uz * vx - ux * vz;
        const nz = ux * vy - uy * vx;
        const horizontal = Math.hypot(nx, nz);
        const raw = horizontal > 1e-3 * Math.abs(ny) ? [nx / horizontal, nz / horizontal] : [1, 0];
        const slope = ROOF_AXES.reduce((best, axis) => (axis[0] * raw[0] + axis[1] * raw[1] > best[0] * raw[0] + best[1] * raw[1] ? axis : best));
        const stretch = Math.hypot(nx, ny, nz) / Math.max(Math.abs(ny), 1e-3);
        const kind = roofKind(part, tri);
        return tri.flatMap((p) => [p[0] * -slope[1] + p[2] * slope[0], (p[0] * slope[0] + p[2] * slope[1]) * Math.min(stretch, 4), kind, 0]);
    });

/* ---------- map layers, painted onto the ground on the page ---------- */

const streets = JSON.parse(readFileSync(join(HERE, 'data-src', 'osm-streets.json'), 'utf8')).elements;
const greenFile = join(HERE, 'data-src', 'osm-green.json');
const greenery = existsSync(greenFile) ? JSON.parse(readFileSync(greenFile, 'utf8')).elements : [];
const inMap = ([x, z]) => Math.abs(x - CENTER[0]) < MAP_RADIUS && Math.abs(z - CENTER[1]) < MAP_RADIUS;

const map = { roads: [], paths: [], tram: [], platforms: [], green: [], trees: [] };
const labelCandidates = {};
const busStop = local(...BUS_STOP);
const tramStop = local(...TRAM_STOP);
for (const e of streets) {
    if (e.type !== 'way' || !e.geometry) continue;
    const tags = e.tags ?? {};
    if (tags.tunnel === 'yes' || tags.layer === '-1') continue;
    const points = e.geometry.map((g) => local(g.lon, g.lat));
    if (!points.some(inMap)) continue;
    const line = points.map(([x, z]) => flat(x, z));
    if (tags.railway === 'tram' || tags.railway === 'light_rail') map.tram.push(line);
    else if (tags.public_transport === 'platform' || tags.highway === 'platform') {
        // only the two stops the page names; the square's other platforms would read as more buildings
        if (points.some(([x, z]) => [busStop, tramStop].some(([sx, sz]) => Math.hypot(x - sx, z - sz) < PLATFORM_REACH))) map.platforms.push(line);
    } else if (['footway', 'path', 'steps'].includes(tags.highway)) map.paths.push(line);
    else if (ROAD_WIDTH[tags.highway]) {
        map.roads.push({ width: ROAD_WIDTH[tags.highway], line });
        if (tags.name && LABELLED_STREETS.includes(tags.name)) {
            const near = points.filter(([x, z]) => Math.hypot(x - CENTER[0], z - CENTER[1]) < 210);
            if (near.length) {
                const middle = near[Math.floor(near.length / 2)];
                const distance = Math.hypot(middle[0] - CENTER[0], middle[1] - CENTER[1]);
                if (!labelCandidates[tags.name] || distance < labelCandidates[tags.name].distance) labelCandidates[tags.name] = { middle, distance };
            }
        }
    }
}
const buildingFootprints = [...kancelare, footprints[OSM_HLAVNI]];
const treeAt = (x, z, radius) => map.trees.push([...shift(x, groundAt(x, z), z), radius]);
for (const e of greenery) {
    if (e.type === 'node') {
        const [x, z] = local(e.lon, e.lat);
        if (inMap([x, z]) && !buildingFootprints.some((p) => inside(x, z, p))) treeAt(x, z, 4 + (e.id % 3));
    } else if (e.tags?.natural === 'tree_row') {
        for (const g of e.geometry) {
            const [x, z] = local(g.lon, g.lat);
            if (inMap([x, z])) treeAt(x, z, 4);
        }
    } else if (e.geometry) {
        const poly = e.geometry.map((g) => local(g.lon, g.lat));
        if (poly.some(inMap)) map.green.push(poly.map(([x, z]) => flat(x, z)));
    }
}
for (const [x, z, r] of AERIAL_TREES) treeAt(x, z, r);
map.parking = PARKOVISTE.map(([x, z]) => flat(x, z));
map.bays = PARKING_BAYS.map((bay) => bay.map(([x, z]) => flat(x, z)));
map.terrace = TERASA.map(([x, z]) => flat(x, z));

/* ---------- walking route, the way the user drew it: along the street, round the hall's corner, into the court ---------- */

const walkPoints = [busStop, [436.6, 79], [436, 75.5], [435.5, 70], [434.4, 66], [420.1, 68.4], [416.9, 68.3], [410.6, 67.3], [405.6, 64.7], [401.7, 61.8], [395.9, 56.3], [383.3, 42.8], [377.5, 37], [375.5, 29], [378, 22.5], [384, 20.5], WALK_TARGET];
const walkLength = walkPoints.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - walkPoints[i][0], p[1] - walkPoints[i][1]), 0);
map.route = walkPoints.map(([x, z]) => flat(x, z));
map.walls = PERIMETER.map((line) => line.map(([x, z]) => flat(x, z)));

/* ---------- output ---------- */

const manifest = { parts: {} };
const numbers = [];
const attributes = [];
for (const [name, tris] of Object.entries(parts)) {
    manifest.parts[name] = { offset: numbers.length, count: tris.length * 9 };
    for (const tri of tris) for (const [x, y, z] of tri) numbers.push(...shift(x, y, z));
    const [owner, kind] = name.split('_');
    if (owner !== 'okoli') {
        manifest.parts[name].attribute = attributes.length;
        attributes.push(...(kind === 'steny' ? wallAttributes(owner, tris) : roofAttributes(owner, tris)));
    }
}

const roofAnchor = (part) => {
    const pts = parts[part].flat();
    const n = pts.length;
    return shift(pts.reduce((s, p) => s + p[0], 0) / n, Math.max(...pts.map((p) => p[1])), pts.reduce((s, p) => s + p[2], 0) / n);
};
const flatPoly = (poly) => poly.slice(0, -1).map(([x, z]) => flat(x, z));
const middleOf = (poly) => poly.reduce((s, p) => [s[0] + p[0] / poly.length, s[1] + p[1] / poly.length], [0, 0]);
const parkingMiddle = courtImage(330, 345);
const terraceMiddle = middleOf(TERASA);
const terraceTop = terraceLevel + TERRACE_RISE;
const streetLevel = terraceLevel;
const uvNumbers = [];
manifest.facades = {};
for (const facade of FACADES) {
    if (!facade.tris.length) {
        console.log('facade without walls:', facade.name);
        continue;
    }
    const y0 = facade.base === 'parking' ? parkingLevel : streetLevel;
    const top = Math.max(...facade.tris.flatMap(({ tri }) => tri.map((p) => p[1])));
    const H = top - y0;
    // which way a wall's relief stands out: away from its own building
    const own = facade.zone === 'kancelare' ? kancelare : [footprints[OSM_HLAVNI]];
    const longest = facade.segments.reduce((best, s) => (Math.hypot(s[1][0] - s[0][0], s[1][1] - s[0][1]) > Math.hypot(best[1][0] - best[0][0], best[1][1] - best[0][1]) ? s : best));
    const [[ax, az], [bx, bz]] = longest;
    const span = Math.hypot(bx - ax, bz - az);
    const normal = [(bz - az) / span, -(bx - ax) / span];
    const mid = [(ax + bx) / 2, (az + bz) / 2];
    const outward = own.some((p) => inside(mid[0] + normal[0] * 2, mid[1] + normal[1] * 2, p)) ? -1 : 1;
    // how high the wall really is along its length: stepped walls have no wall to carry a window everywhere
    const profile = new Array(Math.ceil(facade.L / PROFILE_STEP) + 1).fill(0);
    for (const { uv } of facade.tris) {
        for (let i = 0; i < 3; i++) {
            const [u1, y1] = uv[i];
            const [u2, y2] = uv[(i + 1) % 3];
            const from = Math.max(0, Math.ceil(Math.min(u1, u2) / PROFILE_STEP));
            const to = Math.min(profile.length - 1, Math.floor(Math.max(u1, u2) / PROFILE_STEP));
            for (let k = from; k <= to; k++) {
                const t = u1 === u2 ? 1 : (k * PROFILE_STEP - u1) / (u2 - u1);
                profile[k] = Math.max(profile[k], y1 + (y2 - y1) * t - y0);
            }
        }
    }
    let along = 0;
    const scenePath = facade.segments.map(([a, b]) => {
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const row = { a: [+(a[0] - CENTER[0]).toFixed(2), +(a[1] - CENTER[1]).toFixed(2)], b: [+(b[0] - CENTER[0]).toFixed(2), +(b[1] - CENTER[1]).toFixed(2)], L: +L.toFixed(2), start: +along.toFixed(2) };
        along += L;
        return row;
    });
    manifest.facades[facade.name] = { zone: facade.zone, painter: facade.painter, L: +facade.L.toFixed(2), H: +H.toFixed(2), offset: numbers.length, count: facade.tris.length * 9, uv: uvNumbers.length, eave: +(eaveY - y0).toFixed(2), floors: FLOORS, y0: +(y0 - baseY).toFixed(2), segments: scenePath, outward, profile: profile.map((y) => +y.toFixed(1)), profileStep: PROFILE_STEP };
    for (const { tri, uv } of facade.tris) {
        tri.forEach(([x, y, z], i) => {
            numbers.push(...shift(x, y, z));
            uvNumbers.push(+(uv[i][0] / facade.L).toFixed(4), +((uv[i][1] - y0) / H).toFixed(4));
        });
    }
}
manifest.ground = { size: GROUND_RADIUS * 2, grid: GRID };
manifest.floors = {
    count: FLOORS,
    base: +(parkingLevel - baseY).toFixed(2),
    eave: +(eaveY - baseY).toFixed(2),
    polygons: kancelare.map(flatPoly),
};
manifest.levels = { parking: +(parkingLevel - baseY).toFixed(2), terrace: +(terraceTop - baseY).toFixed(2), street: +(terraceLevel - baseY).toFixed(2) };
// The floor plans' outer corners on the model's own walls (the map's outline differs by up to half a metre).
manifest.plan = { quad: [[148, 85, 424.6, -24.5], [1165, 85, 431.7, -4.2], [1165, 690, 418.3, 0.4], [125, 690, 410.6, -20.1]].map(([px, py, x, z]) => [px, py, +(x - CENTER[0]).toFixed(2), +(z - CENTER[1]).toFixed(2)]) };
manifest.anchors = {
    kancelare: roofAnchor('kancelare_strechy'),
    gym: shift(413.4, parkingLevel + 3.6, -10),
    restaurace: shift(terraceMiddle[0], terraceTop + 6, terraceMiddle[1]),
    sal: roofAnchor('sal_strechy'),
    parkoviste: shift(parkingMiddle[0], parkingLevel + 1.5, parkingMiddle[1]),
    bus: shift(busStop[0], groundAt(...busStop) + 3, busStop[1]),
    tram: shift(tramStop[0], groundAt(...tramStop) + 3, tramStop[1]),
};
manifest.terrace = { from: flat(404, 51.5), to: flat(435.9, 41) };
manifest.streets = Object.entries(labelCandidates).map(([name, { middle }]) => ({ name, at: shift(middle[0], groundAt(...middle) + 1, middle[1]) }));
// the square's name sits on the platforms, where the bus pin does not cover it
manifest.streets.push({ name: 'Mendlovo náměstí', at: shift(busStop[0] + 34, groundAt(busStop[0] + 34, busStop[1] + 30) + 1, busStop[1] + 30) });
manifest.route = walkPoints.flatMap((p, i) => {
    if (i === walkPoints.length - 1) return [];
    const q = walkPoints[i + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 2));
    return Array.from({ length: steps }, (_, k) => {
        const x = p[0] + ((q[0] - p[0]) * k) / steps;
        const z = p[1] + ((q[1] - p[1]) * k) / steps;
        return shift(x, groundAt(x, z) + 1.2, z);
    });
});
manifest.walk = { metres: Math.round(walkLength), minutes: Math.max(1, Math.round(walkLength / WALK_SPEED / 60)) };
manifest.map = map;

const siteRoot = join(HERE, '..', '..', 'site');
const listing = readFileSync(join(siteRoot, 'nemovitost', 'stara-sladovna-kancelare', 'index.html'), 'utf8');
manifest.photos = [...new Set([...listing.matchAll(/<a[^>]*w-lightbox[\s\S]*?<img[^>]*src="([^"]+)"/g)].map((m) => m[1]))];
manifest.attributeStart = numbers.length;
manifest.uvStart = numbers.length + attributes.length;
manifest.ground.start = manifest.uvStart + uvNumbers.length;

const groundHeights = Array.from(heights, (y) => +(y - baseY).toFixed(2));
writeFileSync(join(OUT, 'model.bin'), Buffer.from(new Float32Array([...numbers, ...attributes, ...uvNumbers, ...groundHeights]).buffer));
writeFileSync(join(OUT, 'model.json'), JSON.stringify(manifest));

console.log(Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, v.length])));
console.log(`levels: parking ${(parkingLevel - baseY).toFixed(1)}, terrace ${(terraceLevel - baseY).toFixed(1)}; offices eave ${(eaveY - baseY).toFixed(1)}, peak ${(peakY - baseY).toFixed(1)}, ${officeFloor.toFixed(2)} m per floor`);
console.log(`walk: ${manifest.walk.metres} m, ${manifest.walk.minutes} min; trees ${map.trees.length}, green areas ${map.green.length}, bays ${map.bays.length}`);
console.log('terrace', manifest.terrace, 'anchors', JSON.stringify(manifest.anchors));
console.log(`model.bin ${((numbers.length + attributes.length + groundHeights.length) * 4 / 1e6).toFixed(2)} MB, model.json ${(JSON.stringify(manifest).length / 1e3).toFixed(0)} kB, ${manifest.photos.length} photos`);
