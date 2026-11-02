// Our floor plan of the private gym, from the Scanity Studio project, drawn the way the client's office
// plans are: a grey floor, heavy outer walls, lighter partitions, door swings, and rooms that answer to a click.
const SVG = 'http://www.w3.org/2000/svg';
const PAD = 0.8;
const OUTER_LAST_ID = 32; // walls 1 to 32 run round the outside, in order; the rest are partitions

const node = (tag, attrs) => {
    const n = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
};

export const gymPlanSvg = (data, rooms, onPick) => {
    const svg = document.createElementNS(SVG, 'svg');
    const points = data.walls.flatMap((w) => [w.a, w.b]);
    const us = points.map((p) => p[0]);
    const vs = points.map((p) => p[1]);
    svg.setAttribute('viewBox', `${Math.min(...us) - PAD} ${Math.min(...vs) - PAD} ${Math.max(...us) - Math.min(...us) + PAD * 2} ${Math.max(...vs) - Math.min(...vs) + PAD * 2}`);
    svg.setAttribute('role', 'group');
    svg.setAttribute('aria-label', 'Půdorys privátního gymu');
    const outline = data.walls.filter((w) => w.id <= OUTER_LAST_ID).map((w) => w.a.join(',')).join(' ');
    svg.append(node('polygon', { points: outline, class: 'gym-floor' }));
    for (const wall of data.walls) {
        const length = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]) || 1;
        const gaps = (data.openings ?? []).filter((o) => o.wall === wall.id).map((o) => [o.offset - o.width / 2, o.offset + o.width / 2]).sort((p, q) => p[0] - q[0]);
        let from = 0;
        const runs = [];
        for (const [g0, g1] of gaps) {
            if (g0 > from) runs.push([from, g0]);
            from = Math.max(from, g1);
        }
        if (from < length) runs.push([from, length]);
        for (const [s0, s1] of runs) {
            const line = document.createElementNS(SVG, 'line');
            const at = (s) => [wall.a[0] + ((wall.b[0] - wall.a[0]) * s) / length, wall.a[1] + ((wall.b[1] - wall.a[1]) * s) / length];
            const [x1, y1] = at(s0);
            const [x2, y2] = at(s1);
            line.setAttribute('x1', x1);
            line.setAttribute('y1', y1);
            line.setAttribute('x2', x2);
            line.setAttribute('y2', y2);
            line.setAttribute('class', wall.id <= OUTER_LAST_ID ? 'gym-wall gym-wall-outer' : 'gym-wall');
            svg.append(line);
        }
        // a door that closes: its leaf standing open and the arc it sweeps
        for (const o of (data.openings ?? []).filter((d) => d.wall === wall.id && !d.passage)) {
            const [dx, dy] = [(wall.b[0] - wall.a[0]) / length, (wall.b[1] - wall.a[1]) / length];
            const hinge = o.hinge === 'a' ? o.offset - o.width / 2 : o.offset + o.width / 2;
            const sign = o.hinge === 'a' ? 1 : -1;
            const [hx, hy] = [wall.a[0] + dx * hinge, wall.a[1] + dy * hinge];
            const [nx, ny] = [-dy * (o.side ?? 1), dx * (o.side ?? 1)];
            const [ex, ey] = [hx + dx * sign * o.width, hy + dy * sign * o.width];
            const [lx, ly] = [hx + nx * o.width, hy + ny * o.width];
            svg.append(node('line', { x1: hx, y1: hy, x2: lx, y2: ly, class: 'gym-door' }));
            svg.append(node('path', { d: `M ${lx} ${ly} A ${o.width} ${o.width} 0 0 ${(o.side ?? 1) * sign > 0 ? 0 : 1} ${ex} ${ey}`, class: 'gym-door gym-swing' }));
        }
    }
    rooms.forEach((room, index) => {
        const spot = data.names.find((n) => n.name === room.name);
        if (!spot) return;
        const g = document.createElementNS(SVG, 'g');
        g.setAttribute('class', 'gym-room');
        g.dataset.index = index;
        if (onPick) {
            g.setAttribute('tabindex', '0');
            g.setAttribute('role', 'button');
            g.setAttribute('aria-label', `${room.name}, ${room.area}`);
            g.addEventListener('click', () => onPick(index));
            g.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onPick(index);
                }
            });
        }
        for (const [text, dy, cls] of [[room.name, -0.06, 'gym-name'], [room.area, 0.34, 'gym-area']]) {
            const t = document.createElementNS(SVG, 'text');
            t.setAttribute('x', spot.u);
            t.setAttribute('y', spot.v + dy);
            t.setAttribute('class', cls);
            t.textContent = text;
            g.append(t);
        }
        svg.append(g);
    });
    return svg;
};
