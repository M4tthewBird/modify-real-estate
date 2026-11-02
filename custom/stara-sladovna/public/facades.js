// The building's walls, drawn one by one from the street photos of each side, in metres from the
// wall's lower left corner. Each wall yields two canvases: its colours, and a mask for the windows
// (red: how brightly this window is lit at dusk; green: where the glass is).
//
// A wall's windows come from the photos; on the office building, from the floor plans.

const SCALE = 28; // pixels per metre

const C = {
    plaster: '#f2ecdf',
    shade: '#d9d1bf',
    trim: '#fbf8f0',
    plinth: '#e4d8b2',
    ochre: '#c49a45',
    wood: '#6f4727',
    steel: '#23292b',
    pane: '#10222a',
    court: '#e0d6c0',
    office: '#c9b79c',
    officeShade: '#b5a288',
    gate: '#47705f',
};

class Wall {
    constructor(L, H) {
        this.L = L;
        this.H = H;
        const make = () => Object.assign(document.createElement('canvas'), { width: Math.ceil(L * SCALE), height: Math.ceil(H * SCALE) });
        this.colour = make();
        this.glow = make();
        this.c = this.colour.getContext('2d');
        this.g = this.glow.getContext('2d');
        this.g.fillStyle = '#000';
        this.g.fillRect(0, 0, this.glow.width, this.glow.height);
        this.seed = 7;
        this.parts = []; // what stands out of the wall, built as geometry on the page
    }

    /** A block standing `d` metres out of the wall. */
    box(x0, y0, x1, y1, d, colour) { this.parts.push({ type: 'box', x0, y0, x1, y1, d, colour }); }

    random() {
        this.seed = (this.seed * 16807) % 2147483647;
        return this.seed / 2147483647;
    }

    x(m) { return m * SCALE; }
    y(m) { return this.colour.height - m * SCALE; }

    rect(x0, y0, x1, y1, colour, ctx = this.c) {
        ctx.fillStyle = colour;
        ctx.fillRect(this.x(x0), this.y(y1), (x1 - x0) * SCALE, (y1 - y0) * SCALE);
    }

    fill(colour) { this.rect(0, 0, this.L, this.H, colour); }

    /** Horizontal courses of rusticated stone. */
    courses(x0, y0, x1, y1, step = 0.58, colour = C.shade) {
        for (let y = y0 + step; y < y1; y += step) this.rect(x0, y, x1, y + 0.05, colour);
    }

    /** A flat vertical band with stone courses, as at the building's corners. */
    pilaster(x, w, y0, y1) {
        this.rect(x - w / 2, y0, x + w / 2, y1, C.trim);
        this.courses(x - w / 2, y0, x + w / 2, y1, 0.62);
        this.rect(x + w / 2, y0, x + w / 2 + 0.07, y1, C.shade);
        this.box(x - w / 2, y0, x + w / 2, y1, 0.1, C.trim);
    }

    cornice(y, h = 0.34) {
        this.rect(0, y, this.L, y + h, C.trim);
        this.rect(0, y - 0.09, this.L, y, C.shade);
        this.box(0, y, this.L, y + h, 0.26, C.trim);
    }

    glass(path, x0, y0, x1, y1, bars, lit) {
        const ctx = this.c;
        const g = this.g;
        ctx.fillStyle = C.pane;
        g.fillStyle = `rgb(${Math.round(lit * 255)},255,0)`;
        for (const context of [ctx, g]) {
            context.save();
            path(context);
            context.clip();
            context.fillRect(this.x(x0), this.y(y1), (x1 - x0) * SCALE, (y1 - y0) * SCALE);
            context.restore();
        }
        // glazing bars on top, in both canvases, so they stay dark on a lit window
        for (const [context, colour] of [[ctx, bars.colour], [g, '#000']]) {
            context.save();
            path(context);
            context.clip();
            context.fillStyle = colour;
            for (let i = 1; i < bars.columns; i++) context.fillRect(this.x(x0 + ((x1 - x0) * i) / bars.columns) - 1, this.y(y1), 2, (y1 - y0) * SCALE);
            for (let i = 1; i < bars.rows; i++) context.fillRect(this.x(x0), this.y(y0 + ((y1 - y0) * i) / bars.rows) - 1, (x1 - x0) * SCALE, 2);
            context.restore();
        }
    }

    /** A window centred at (cx, cy); `arch` rounds its top, `hood` and `sill` add the mouldings from the photos. */
    win(cx, cy, w, h, { frame = C.wood, arch = false, columns = 2, rows = 2, hood = false, sill = false, lit } = {}) {
        const x0 = cx - w / 2;
        const x1 = cx + w / 2;
        const y0 = cy - h / 2;
        const y1 = cy + h / 2;
        const shine = lit ?? (this.random() > 0.55 ? 0.55 + this.random() * 0.45 : 0);
        const shape = (grow) => (context) => {
            context.beginPath();
            const left = this.x(x0 - grow);
            const right = this.x(x1 + grow);
            const bottom = this.y(y0 - grow);
            if (arch) {
                const r = (w / 2 + grow) * SCALE;
                const spring = this.y(y1 - w / 2);
                context.moveTo(left, bottom);
                context.lineTo(left, spring);
                context.arc((left + right) / 2, spring, r, Math.PI, 0);
                context.lineTo(right, bottom);
            } else {
                context.rect(left, this.y(y1 + grow), right - left, bottom - this.y(y1 + grow));
            }
            context.closePath();
        };
        if (hood) {
            this.rect(x0 - 0.3, y1 + 0.22, x1 + 0.3, y1 + 0.38, C.trim);
            this.rect(x0 - 0.3, y1 + 0.17, x1 + 0.3, y1 + 0.22, C.shade);
            this.box(x0 - 0.3, y1 + 0.22, x1 + 0.3, y1 + 0.38, 0.24, C.trim);
        }
        if (sill) {
            this.rect(x0 - 0.22, y0 - 0.22, x1 + 0.22, y0 - 0.08, C.trim);
            this.rect(x0 - 0.22, y0 - 0.28, x1 + 0.22, y0 - 0.22, C.shade);
            this.box(x0 - 0.22, y0 - 0.22, x1 + 0.22, y0 - 0.08, 0.2, C.trim);
        }
        this.c.fillStyle = frame;
        shape(0.07)(this.c);
        this.c.fill();
        this.glass(shape(0), x0, y0, x1, y1, { columns, rows, colour: frame }, shine);
        // a frame standing proud of the glass, so a window has depth when the view comes close
        const T = 0.07;
        const D = 0.08;
        this.box(x0 - T, y0 - T, x1 + T, y0, D, frame);
        if (arch) {
            const spring = y1 - w / 2;
            this.box(x0 - T, y0, x0, spring, D, frame);
            this.box(x1, y0, x1 + T, spring, D, frame);
            this.parts.push({ type: 'arc', cx, cy: spring, r: w / 2 + T / 2, tube: T / 2 + 0.01, colour: frame });
        } else {
            this.box(x0 - T, y1, x1 + T, y1 + T, D, frame);
            this.box(x0 - T, y0, x0, y1, D, frame);
            this.box(x1, y0, x1 + T, y1, D, frame);
        }
    }

    /** A filled-in arch: only its outline shows, as on the hall's west end. */
    blindArch(cx, y0, w, h, colour = C.trim) {
        const ctx = this.c;
        const spring = this.y(y0 + h - w / 2);
        ctx.fillStyle = colour;
        ctx.strokeStyle = C.shade;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(this.x(cx - w / 2), this.y(y0));
        ctx.lineTo(this.x(cx - w / 2), spring);
        ctx.arc(this.x(cx), spring, (w / 2) * SCALE, Math.PI, 0);
        ctx.lineTo(this.x(cx + w / 2), this.y(y0));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        this.box(cx - w / 2 - 0.06, y0, cx - w / 2 + 0.06, y0 + h - w / 2, 0.09, colour);
        this.box(cx + w / 2 - 0.06, y0, cx + w / 2 + 0.06, y0 + h - w / 2, 0.09, colour);
        this.parts.push({ type: 'arc', cx, cy: y0 + h - w / 2, r: w / 2, tube: 0.07, colour });
    }

    oculus(cx, cy, r, { open = false } = {}) {
        const ctx = this.c;
        ctx.fillStyle = C.trim;
        ctx.beginPath();
        ctx.arc(this.x(cx), this.y(cy), (r + 0.1) * SCALE, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = open ? C.pane : C.shade;
        ctx.beginPath();
        ctx.arc(this.x(cx), this.y(cy), r * SCALE, 0, Math.PI * 2);
        ctx.fill();
        this.parts.push({ type: 'ring', cx, cy, r: r + 0.04, tube: 0.07, colour: C.trim });
    }

    /** A flat shape standing out of the wall: points around (cx, y) in metres. */
    prism(cx, y, points, d, colour) { this.parts.push({ type: 'prism', cx, y, points, d, colour }); }

    /** Vertical lettering on a banner, as on the hall's street side. */
    banner(x0, y0, x1, y1, background, colour, text) {
        this.rect(x0, y0, x1, y1, background);
        const ctx = this.c;
        ctx.save();
        ctx.translate(this.x((x0 + x1) / 2), this.y((y0 + y1) / 2));
        ctx.rotate(-Math.PI / 2);
        ctx.fillStyle = colour;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // as large as the banner's width allows, then shrunk until the whole lettering fits its length
        const room = (y1 - y0) * SCALE * 0.92;
        let size = (x1 - x0) * SCALE * 0.42;
        ctx.font = `600 ${size}px "Work Sans", sans-serif`;
        const width = ctx.measureText(text).width;
        if (width > room) {
            size *= room / width;
            ctx.font = `600 ${size}px "Work Sans", sans-serif`;
        }
        ctx.fillText(text, 0, 0);
        ctx.restore();
    }
}

const hallUpperWindow = { columns: 2, rows: 3, hood: true, sill: true };

const PAINTERS = {
    // Street side, photos 1 and 2: stone ground floor with big steel arches, three rows of small windows
    hallSouth(w, { L, H }) {
        w.fill(C.plaster);
        const ground = H * 0.34;
        w.rect(0, 0, L, ground, '#efe8d8');
        w.courses(0, 1.2, L, ground);
        w.rect(0, 0, L, 1.2, C.plinth);
        w.pilaster(0.55, 1.1, ground, H);
        w.pilaster(6.1, 1.0, ground, H);
        w.rect(6.7, 0, 6.82, H, C.ochre);
        const arches = [3.3];
        for (let x = 9.8; x < L - 2; x += 4.25) arches.push(x);
        const archTop = ground - 0.55;
        for (const x of arches) w.win(x, (1.5 + archTop) / 2, x === 3.3 ? 3.2 : 2.7, archTop - 1.5, { frame: C.trim, arch: true, columns: 5, rows: 6, lit: 0.85 });
        w.cornice(ground);
        const rowY = [0.2, 0.5, 0.79].map((f) => ground + (H - ground) * f);
        const columns = [3.3];
        for (let x = 9.2; x < L - 1.2; x += 2.95) columns.push(x);
        for (const y of rowY) {
            for (const x of columns) {
                // the banners hang over these windows
                if (x > L * 0.565 && x < L * 0.77) continue;
                w.win(x, y, x === 3.3 ? 1.5 : 1.05, x === 3.3 ? 1.75 : 1.4, hallUpperWindow);
            }
        }
        const bannerY = ground + 0.5;
        w.banner(L * 0.585, bannerY, L * 0.655, H - 1.3, '#f8f6f0', '#1c1c1c', 'PIVOVARSKÁ STAROBRNO');
        w.banner(L * 0.665, bannerY, L * 0.75, H - 1.3, '#e7b08a', '#7c2a18', 'NAŠE HORKOST');
        w.cornice(H - 0.6, 0.46);
        w.rect(0, H - 0.14, L, H, C.ochre);
    },
    // West end, photos 8 and 9: two brown windows, the green gate, three filled-in arches
    hallWest(w, { L, H }) {
        w.fill(C.plaster);
        const ground = H * 0.37;
        w.rect(0, 0, L, ground, '#eee7d6');
        w.courses(0, 1.2, L, ground);
        w.rect(0, 0, L, 1.1, C.plinth);
        for (const f of [0.07, 0.15]) w.win(L * f, 2.5, 1.2, 2.2, { columns: 3, rows: 1 });
        w.rect(L * 0.22, 0, L * 0.45, 4.4, C.gate);
        for (const f of [1 / 4, 2 / 4, 3 / 4]) w.rect(L * (0.22 + 0.23 * f) - 0.03, 0, L * (0.22 + 0.23 * f) + 0.03, 4.4, '#335548');
        w.rect(L * 0.22, 2.3, L * 0.45, 2.36, '#335548');
        for (const f of [0.6, 0.73, 0.87]) w.blindArch(L * f, 0.6, 2.0, 3.8);
        w.cornice(ground);
        w.pilaster(0.6, 1.1, ground, H);
        w.pilaster(L * 0.52, 1.0, ground, H);
        w.pilaster(L - 0.6, 1.1, ground, H);
        const rows = [0.17, 0.48, 0.78].map((f) => ground + (H - ground) * f);
        for (const y of rows) for (const f of [0.31, 0.41]) w.win(L * f, y, 1.05, 1.4, { columns: 2, rows: 3, sill: true });
        for (const y of rows.slice(1)) for (const f of [0.62, 0.74, 0.87]) w.win(L * f, y, 1.05, 1.4, { columns: 2, rows: 3, sill: true });
        // the third row, as on photo 9: two round openings around a low arched one
        w.oculus(L * 0.62, rows[0], 0.42);
        w.win(L * 0.74, rows[0], 2.1, 1.25, { frame: C.steel, arch: true, columns: 4, rows: 2, lit: 0 });
        w.oculus(L * 0.87, rows[0], 0.42);
        w.cornice(H - 0.6, 0.46);
    },
    hallNorthWest(w, { L, H }) {
        w.fill(C.plaster);
        const ground = H * 0.37;
        w.courses(0, 0.9, L, ground);
        w.rect(0, 0, L, 0.9, C.plinth);
        for (const f of [0.35, 0.68]) w.win(L * f, 2.6, 1.2, 2.3, { columns: 3, rows: 1 });
        w.cornice(ground);
        w.pilaster(L - 0.6, 1.1, ground, H);
        for (const f of [0.17, 0.48, 0.78]) for (const x of [0.35, 0.68]) w.win(L * x, ground + (H - ground) * f, 1.05, 1.4, hallUpperWindow);
        w.cornice(H - 0.6, 0.46);
    },
    // Courtyard side, photos 6, 7 and 12: plain render, four rows of small windows, canopies, the fire escape
    hallNorth(w, { L, H }) {
        w.fill(C.court);
        w.rect(0, 0, L, 0.7, C.shade);
        for (const f of [0.28, 0.48, 0.68, 0.87]) for (let x = 5.5; x < L - 1.5; x += 3.5) w.win(x, H * f, 0.95, 0.95, { columns: 2, rows: 2 });
        for (let x = 7; x < L - 1.5; x += 7) w.win(x, 2.2, 1.1, 2.2, { columns: 2, rows: 3, lit: 0.3 });
        w.rect(L * 0.46, 3.0, L * 0.6, 3.3, '#3d3a35');
        w.rect(L * 0.72, 3.0, L * 0.82, 3.3, '#3d3a35');
        // the fire escape at the west end
        for (const y of [H * 0.36, H * 0.56, H * 0.76]) w.rect(1.2, y, 4, y + 0.1, C.steel);
        for (const x of [1.2, 4]) w.rect(x, H * 0.3, x + 0.08, H * 0.82, C.steel);
        w.rect(2.2, H * 0.06, 3.1, H * 0.2, C.pane);
        w.cornice(H - 0.5, 0.36);
    },
    hallEast(w, { L, H }) {
        w.fill(C.court);
        for (const f of [0.3, 0.5, 0.7, 0.87]) for (let x = 2.5; x < L - 1; x += 3.6) w.win(x, H * f, 0.95, 1.05, { columns: 2, rows: 2 });
        w.cornice(H - 0.5, 0.36);
    },
    // Front to the square, photo 3: five tall windows in the stone base, a window under a pediment, the big window under its arch
    salSouth(w, { L, H }) {
        w.fill(C.plaster);
        const base = 6;
        w.rect(0, 0, L, base, '#eee8d9');
        w.courses(0, 0.7, L, base, 0.6);
        for (const f of [0.14, 0.3, 0.47, 0.64, 0.81]) w.win(L * f, 3.25, 1.45, 3.4, { columns: 2, rows: 3, sill: true, hood: true, lit: 0.75 });
        w.cornice(base, 0.42);
        const inset = (x0, x1) => {
            w.rect(x0, base + 0.8, x1, 12.4, '#f7f2e6');
            w.c.strokeStyle = C.shade;
            w.c.lineWidth = 2;
            w.c.strokeRect(w.x(x0), w.y(12.4), (x1 - x0) * SCALE, (12.4 - base - 0.8) * SCALE);
        };
        const LEFT = L * 0.235;
        const RIGHT = L * 0.65;
        inset(L * 0.09, L * 0.385);
        inset(L * 0.47, L * 0.83);
        // left window and its pediment
        w.win(LEFT, 9.1, 2.9, 3.3, { columns: 3, rows: 3, lit: 0.9 });
        const c = w.c;
        c.fillStyle = C.trim;
        c.strokeStyle = C.shade;
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(w.x(LEFT - 1.9), w.y(11.1));
        c.lineTo(w.x(LEFT), w.y(12.3));
        c.lineTo(w.x(LEFT + 1.9), w.y(11.1));
        c.closePath();
        c.fill();
        c.stroke();
        w.prism(LEFT, 11.1, [[-1.9, 0], [0, 1.2], [1.9, 0]], 0.22, C.trim);
        // right window, wide, with its arch above
        w.win(RIGHT, 9.4, 5.0, 4.0, { columns: 5, rows: 3, lit: 0.9 });
        c.lineWidth = 3;
        c.beginPath();
        c.arc(w.x(RIGHT), w.y(10.8), 2.6 * SCALE, Math.PI, 0);
        c.stroke();
        w.parts.push({ type: 'arc', cx: RIGHT, cy: 10.8, r: 2.6, tube: 0.1, colour: C.trim });
        // the columns and their ornamented heads
        for (const f of [0.045, 0.43, 0.87, 0.965]) {
            w.pilaster(L * f, 0.8, base + 0.4, 12.6);
            w.rect(L * f - 0.5, 12.2, L * f + 0.5, 12.9, C.trim);
            w.oculus(L * f, 11.7, 0.22);
        }
        w.cornice(13.0, 0.5);
        // the curved gable over the big window, as on photo 3
        const GABLE = [[-3.2, 0], [-3.2, 0.5], [-2.5, 0.75], [-1.9, 1.5], [-1.3, 2.3], [-0.6, 2.85], [0, 3], [0.6, 2.85], [1.3, 2.3], [1.9, 1.5], [2.5, 0.75], [3.2, 0.5], [3.2, 0]];
        w.prism(RIGHT, 13.4, GABLE, 0.45, C.plaster);
        w.parts.push({ type: 'ring', cx: RIGHT, cy: 14.8, r: 0.8, tube: 0.1, colour: C.trim, d: 0.48 });
    },
    // The long side, photos 4 and 5: a blank stone base, three tall windows above
    salEast(w, { L, H }) {
        w.fill(C.plaster);
        w.rect(0, 0, L, 5.4, '#e3ddcf');
        w.courses(0, 0.4, L, 5.4, 0.62);
        w.rect(L * 0.3, 2.9, L * 0.34, 3.2, C.steel);
        w.cornice(5.4, 0.42);
        for (const f of [0.34, 0.6, 0.86]) w.win(L * f, 9.0, 1.45, 4.3, { columns: 2, rows: 4, lit: 0.7 });
        w.cornice(H - 0.6, 0.5);
    },
    // Towards the garden, photos 1 and 2: glazed ground floor, two rows of brown windows, one round-headed
    salWest(w, { L, H }) {
        w.fill(C.plaster);
        w.rect(0, 0, L, 5.2, '#efe9da');
        for (let x = L * 0.4; x < L - 1; x += 3.1) w.win(x, 2.6, 2.3, 3.0, { frame: C.steel, columns: 3, rows: 2, lit: 0.95 });
        w.cornice(5.2, 0.4);
        for (const f of [0.42, 0.6, 0.76]) {
            w.win(L * f, 7.5, 1.45, 2.3, { columns: 2, rows: 2, sill: true });
            w.win(L * f, 10.9, 1.45, 2.0, { columns: 2, rows: 2, sill: true });
        }
        w.win(L * 0.92, 8.7, 1.4, 2.4, { frame: C.steel, arch: true, columns: 2, rows: 2 });
        // the taller part beside the tower
        for (const y of [7.5, 10.9, 14.2]) for (const f of [0.08, 0.2, 0.31]) if (y + 1 < H) w.win(L * f, y, 1.1, 1.6, { columns: 2, rows: 2, sill: true });
        w.rect(L * 0.36, 0, L * 0.372, H, C.ochre);
    },
    /* The office building: its windows sit where the floor plans draw them, one row per storey. */
    officeWest(w, { L, H, eave, floors }) {
        w.fill(C.office);
        const fh = eave / floors;
        for (let f = 0; f < floors; f++) for (const px of [233, 450, 650, 848]) w.win(((px - 122) / 1048) * L, (f + 0.55) * fh, 1.15, 1.5, { frame: C.trim, arch: true });
        w.rect(((960 - 122) / 1048) * L, 0, ((960 - 122) / 1048) * L + 0.07, eave, C.officeShade);
        w.rect(0, eave - 0.3, L, eave, C.officeShade);
        w.rect(0, H - 0.1, L, H, C.officeShade);
    },
    officeEast(w, { L, eave, floors }) {
        w.fill(C.office);
        const fh = eave / floors;
        for (let f = 0; f < floors; f++) for (const px of [245, 513, 673, 818, 1000]) w.win(((px - 145) / 1025) * L, (f + 0.55) * fh, 1.15, 1.5, { frame: C.trim, arch: true });
        w.rect(0, eave - 0.3, L, eave, C.officeShade);
    },
    // Towards Pivovarská, photo 6: the middle windows are real, those beside them filled in, a round window in the gable
    officeNorth(w, { L, H, eave, floors }) {
        w.fill(C.office);
        const fh = eave / floors;
        for (let f = 0; f < floors; f++) {
            w.win(L / 2, (f + 0.55) * fh, 1.15, 1.5, { frame: C.trim, arch: true });
            for (const x of [0.2, 0.8]) w.blindArch(L * x, (f + 0.55) * fh - 0.7, 1.1, 1.4, C.officeShade);
        }
        w.oculus(L / 2, (eave + H) / 2, 0.42, { open: true });
    },
    officeSouth(w, { L, eave }) {
        w.fill(C.office);
        w.rect(0, eave - 0.3, L, eave, C.officeShade);
    },
    // The staircase: one window per landing, from the floor plans
    officeStairs(w, { L, eave, floors }) {
        w.fill(C.office);
        const fh = eave / floors;
        for (let f = 0; f < floors; f++) w.win(L / 2, (f + 0.55) * fh, 1.05, 1.5, { frame: C.trim, arch: true });
    },
};

export const paintFacade = (name, spec) => {
    const wall = new Wall(spec.L, spec.H);
    PAINTERS[spec.painter ?? name](wall, spec);
    return wall;
};
