import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { CONTACT, FLOORS, GYM, SAMPLE_DATA, VIEWER_URL, ZONES, floorPage } from './data.js';
import { gymPlanSvg } from './gymplan.js';
import { paintFacade } from './facades.js';
import { OUTER_WALLS, PLANS3D } from './floorplans.js';

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...children) => {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...children);
    return node;
};
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isNarrow = () => window.matchMedia('(max-width: 1000px)').matches;

const ICONS = {
    back: 'M19 12H5M11 6l-6 6 6 6',
    up: 'M12 19V5M6 11l6-6 6 6',
    down: 'M12 5v14M6 13l6 6 6-6',
    plan: 'M3 4h18v16H3zM3 12h9M12 4v8M16 12v8',
    expand: 'M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7',
    minus: 'M6 12h12',
};
const icon = (name, size = 16) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', ICONS[name]);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.6');
    path.setAttribute('stroke-linecap', 'square');
    path.setAttribute('stroke-linejoin', 'miter');
    svg.append(path);
    return svg;
};

const COLORS = {
    sky: 0x0b4b59,
    contextWall: 0x1d6474,
    contextRoof: 0x2a7384,
    plain: 0xffffff,
    dim: 0x7fa3ab,
    parkingHover: 0xa47f50,
    tree: 0x2f7464,
    trunk: 0x3c3a33,
    route: 0xf0c88e,
    bulb: 0xffd9a0,
    stone: 0xc9bea6,
    stoneHover: 0xe9cfa0,
    wallCream: 0xe6dcc0,
    cap: 0xb4654a,
    rail: 0x18282c,
    wood: 0xa8794c,
    parasol: 0x2c6b52,
    parasolLight: 0xece4cf,
    plate: 0xe9e3d6,
    free: 0xd2c394, // champagne gold, from the brand palette
    taken: 0x0b4b59,
    gymWall: 0x0b4b59,
};
const THEMES = {
    morning: {
        sky: ['#a9d3e3', '#e6e3d4', '#fbdcb6'],
        fog: 0xfbe2c5,
        fogNear: 320,
        fogFar: 680,
        contextWall: 0xf8f1e6,
        contextRoof: 0xf1e2cf,
        hemi: [0xfffaf2, 0xe0d4c4, 1.95],
        sun: [0xffe3c4, 2.05, [150, 110, 190]],
        glow: 0.02,
        sprites: 0.25,
        band: 0.25,
        tree: [1.7, 1.75, 0.95],
        route: 0xb07a35,
        bulbs: 0xfff3dc,
        dim: 0xe2d8ca,
        map: { ground: '#f3e4cf', green: '#d9e0b4', roadEdge: '#e4d3ba', road: '#fbf4e8', path: '#f8eedd', tram: '#b5a892', platform: '#efd5a2', parking: '#dcd0bf' },
    },
    dusk: {
        sky: ['#062a34', '#0b4b59', '#14606f'],
        fog: 0x0b4b59,
        fogNear: 280,
        fogFar: 500,
        contextWall: 0x1d6474,
        contextRoof: 0x2a7384,
        hemi: [0xe2eef1, 0x50777f, 1.55],
        sun: [0xfff0dc, 2.3, [-150, 130, 170]],
        glow: 1,
        sprites: 1,
        band: 0.9,
        tree: [1, 1, 1],
        route: 0xf0c88e,
        bulbs: 0xffd9a0,
        dim: 0x7fa3ab,
        map: { ground: '#0e5262', green: '#14594f', roadEdge: '#0a4351', road: '#2f7586', path: '#1b6273', tram: '#94bcbd', platform: '#6fa3a3', parking: '#1f6878' },
    },
};
const THEME_KEY = 'stara-sladovna-theme';
const savedTheme = () => {
    try {
        return localStorage.getItem(THEME_KEY);
    } catch {
        return null;
    }
};
let themeName = THEMES[savedTheme()] ? savedTheme() : 'morning';
document.body.dataset.theme = themeName;
const themed = { glows: [] }; // what a change of the light has to touch

/* ---------- state ---------- */

const LIFT = 60; // far enough that the storeys above leave the view, and then they are hidden
const WALL_HEIGHT = 1.5; // inside the opened floor: cut low, so the rooms stay readable
const SILL = 0.8;
const OPEN_FLOOR_MAX_POLAR = 1.05; // an opened floor reads from above; lower, its walls hide the rooms
const MAX_POLAR = 1.42;
const OPEN_MS = 1500;
const CLOSE_MS = 700; // the building grows back from the cut, it does not fall from the sky
const FLOOR_SWITCH_MS = 950; // one storey away or back
const SWITCH_LIFT = 16; // how far the storey above flies off
const ROOF_CLEAR = 12; // above the eave, so the sweep that closes a floor passes the whole roof
const PLAN_OUTLINE_PX = [[148, 85], [1165, 85], [1165, 735], [1313, 735], [1313, 925], [945, 925], [945, 690], [125, 690]];

let manifest = null;
let groundHeights = null;
let camera, renderer, scene, controls;
let mode = 'overview'; // overview | floors | floor | gym | restaurace | sal | parkoviste | doprava
let hovered = null;
let flight = null;
let needsRender = true;
let walker = null;
let activeLevel = 4;
let openLevel = null;
let pickedRoom = null;
let gymPhoto = 0;
let gymData = null;
const zoneMeshes = {};
const hoverables = [];
const pickable = [];
const pins = [];
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const shared = { uLevel: { value: 4 }, uLevelOn: { value: 0 }, uFloorBase: { value: 0 }, uFloorHeight: { value: 3 }, uGlow: { value: 1 }, off: { value: 0 } };
const levelTarget = { level: 4, on: 0 };
const lowPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e4);
const highPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e4);
const reveal = { level: null, cut: 0, high: [], plate: null, ceiling: null };

const floorAt = (level) => FLOORS.find((f) => f.level === level);

/* ---------- side panel ---------- */

const panel = $('panel');

/* ---------- where am I: one trail at the top of the model, with a plain way back ---------- */

const crumbsNode = $('crumbs');
const trail = () => {
    const items = [{ label: 'Celý areál', go: () => goTo('overview') }];
    if (mode === 'floors' || mode === 'floor' || mode === 'gym') items.push({ label: 'Kanceláře', go: () => goTo('floors') });
    if (mode === 'floor') items.push({ label: floorAt(openLevel).label, go: () => pickRoom(null) });
    if (mode === 'floor' && pickedRoom) items.push({ label: `Kancelář ${pickedRoom.id}` });
    else if (mode === 'gym') items.push({ label: `1. NP, ${GYM.title}` });
    else if (mode !== 'floors' && mode !== 'floor' && ZONES[mode]) items.push({ label: ZONES[mode].title });
    return items;
};
const goUp = () => {
    const steps = trail();
    if (steps.length > 1) steps[steps.length - 2].go();
};
const renderCrumbs = () => {
    const steps = trail();
    crumbsNode.hidden = steps.length < 2;
    if (steps.length < 2) {
        crumbsNode.replaceChildren();
        return;
    }
    const back = el('button', { type: 'button', className: 'crumb-back' }, icon('back'), 'Zpět');
    back.setAttribute('aria-label', `Zpět: ${steps[steps.length - 2].label}`);
    back.addEventListener('click', goUp);
    const list = el('ol', { className: 'crumb-trail' });
    steps.forEach((step, i) => {
        const last = i === steps.length - 1;
        const node = last ? el('span', { textContent: step.label }) : el('button', { type: 'button', textContent: step.label });
        if (last) node.setAttribute('aria-current', 'page');
        else node.addEventListener('click', step.go);
        list.append(el('li', {}, node));
    });
    crumbsNode.replaceChildren(back, list);
};

/* ---------- the browser's own back button walks the same trail ---------- */

const navHash = () => {
    if (mode === 'floors') return '#patra';
    if (mode === 'floor') return `#patro-${openLevel}${pickedRoom ? `-${pickedRoom.id}` : ''}`;
    if (mode === 'gym') return '#gym';
    return ZONES[mode] ? `#${mode}` : '';
};
const remember = () => {
    const hash = navHash();
    if (hash === location.hash || (!hash && !location.hash)) return;
    history.pushState(null, '', hash || location.pathname + location.search);
};
/** Opens the view a hash names; other hashes (#kontakt, #areal) are the page's own anchors and change nothing. */
const route = (hash) => {
    const floor = /^#patro-([1-4])(?:-(.+))?$/.exec(hash);
    if (!hash || hash === '#') {
        if (mode !== 'overview') goTo('overview', false);
    } else if (hash === '#patra') {
        if (mode !== 'floors') goTo('floors', false);
    } else if (hash === '#gym') {
        if (mode !== 'gym') openFloor(1, false);
    } else if (floor) {
        const level = +floor[1];
        if (mode !== 'floor' || openLevel !== level) openFloor(level, false);
        const room = floor[2] ? floorAt(level).rooms.find((r) => r.id === floor[2]) : null;
        if ((room ?? null) !== pickedRoom) pickRoom(room ?? null, false);
    } else if (ZONES[hash.slice(1)] && hash !== '#kancelare') {
        if (mode !== hash.slice(1)) goTo(hash.slice(1), false);
    }
};
window.addEventListener('popstate', () => route(location.hash));

const renderOverviewPanel = () => {
    const list = el('ul', { className: 'zone-list' });
    for (const [key, zone] of Object.entries(ZONES)) {
        const b = el('button', { type: 'button' }, el('strong', { textContent: zone.title }), el('span', { textContent: zone.hint }));
        b.addEventListener('click', () => goTo(key === 'kancelare' ? 'floors' : key));
        b.addEventListener('pointerenter', () => setHover(key));
        b.addEventListener('pointerleave', () => setHover(null));
        list.append(el('li', {}, b));
    }
    panel.replaceChildren(el('h1', { textContent: 'Stará Sladovna' }), el('p', { textContent: 'Kanceláře v historickém areálu na Mendlově náměstí. Vyberte, co vás zajímá.' }), list);
};

const UNAVAILABLE = 'Není dostupné';

const floorSummary = (floor) => {
    if (floor.unavailable) return UNAVAILABLE;
    if (floor.gym) return GYM.title;
    if (floor.area) return `Celé patro ${floor.area}`;
    const free = floor.rooms.filter((r) => r.status === 'volno').length;
    const word = free === 1 ? 'volná kancelář' : free < 5 ? 'volné kanceláře' : 'volných kanceláří';
    return `${free} ${word}${SAMPLE_DATA ? ' (ukázka)' : ''}`;
};

let dialNode = null;
const updateDial = () => {
    if (!dialNode) return;
    for (const row of dialNode.querySelectorAll('.floor-row')) row.classList.toggle('is-active', +row.dataset.level === activeLevel);
};

const setActiveLevel = (level) => {
    if (level === activeLevel || level < 1 || level > 4) return;
    activeLevel = level;
    levelTarget.level = level;
    updateDial();
    for (const pin of pins) if (pin.kind === 'floor') pin.node.classList.toggle('is-active', pin.level === level);
    needsRender = true;
};

const openFloor = (level, push = true) => {
    // an unavailable floor only lights up, so its row says why it does not open
    if (floorAt(level).unavailable) {
        setActiveLevel(level);
        return;
    }
    activeLevel = level;
    levelTarget.level = level;
    goTo(floorAt(level).gym ? 'gym' : 'floor', push);
};

const floorComment = (floor) => {
    if (floor.unavailable) return '';
    if (floor.gym) return 'Přízemí, 3D prohlídka';
    if (floor.area) return '9 kanceláří, celé i po částech';
    return 'Klikněte a podívejte se na půdorys';
};

const renderFloorsPanel = () => {
    const rows = el('ul', { className: 'floor-rows' });
    for (const floor of FLOORS) {
        const b = el('button', { type: 'button', className: `floor-row${floor.unavailable ? ' is-unavailable' : ''}` },
            el('strong', { className: 'floor-row-number', textContent: String(floor.level) }),
            el('span', { className: 'floor-row-text' }, el('b', { textContent: floorSummary(floor) }), el('small', { textContent: floorComment(floor) })));
        b.dataset.level = floor.level;
        b.setAttribute('aria-label', `${floor.label}: ${floorSummary(floor)}`);
        if (floor.unavailable) b.setAttribute('aria-disabled', 'true');
        b.addEventListener('pointerenter', () => setActiveLevel(floor.level));
        b.addEventListener('focus', () => setActiveLevel(floor.level));
        b.addEventListener('click', () => openFloor(floor.level));
        rows.append(el('li', {}, b));
    }
    dialNode = el('div', {}, el('h1', { textContent: 'Vyberte patro' }), rows);
    panel.replaceChildren(dialNode);
    updateDial();
};

const inquiryForm = (subject) => {
    const form = el('form', { className: 'form', noValidate: true });
    const field = (label, name, type = 'text', required = true) => {
        const input = el('input', { type, name, required, autocomplete: { name: 'name', email: 'email', phone: 'tel' }[name] ?? 'off' });
        return el('label', {}, `${label}${required ? ' *' : ''}`, input);
    };
    const message = el('textarea', { name: 'message', value: subject ? `Mám zájem o: ${subject}` : '' });
    const status = el('p', { className: 'form-note' });
    status.setAttribute('role', 'status');
    form.append(
        el('div', { className: 'form-two' }, field('Jméno', 'name'), field('Telefon', 'phone', 'tel')),
        field('E-mail', 'email', 'email'),
        el('label', {}, 'Zpráva', message),
        el('button', { type: 'submit', className: 'btn', textContent: 'Odeslat poptávku' }),
        status
    );
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        const missing = [...form.querySelectorAll('[required]')].find((i) => !i.value.trim() || !i.checkValidity());
        if (missing) {
            status.className = 'form-error';
            status.textContent = 'Vyplňte prosím jméno, telefon a platný e-mail.';
            missing.focus();
            return;
        }
        status.className = 'form-note';
        status.textContent = 'Toto je zatím prototyp, poptávka se neodeslala. Napište prosím přímo makléři.';
    });
    return form;
};

const stepFloor = (delta) => {
    let next = openLevel + delta;
    while (floorAt(next)?.unavailable) next += delta;
    if (next < 1 || next > 4) return;
    openFloor(next);
};

const renderFloorPanel = () => {
    const floor = floorAt(openLevel);
    const up = el('button', { type: 'button', ariaLabel: 'O patro výš', disabled: openLevel === 4 }, icon('up'));
    const down = el('button', { type: 'button', ariaLabel: 'O patro níž' }, icon('down'));
    up.addEventListener('click', () => stepFloor(1));
    down.addEventListener('click', () => stepFloor(-1));
    const head = [el('div', { className: 'floor-step' }, el('h1', { textContent: floor.label }), up, down)];

    if (pickedRoom) {
        const room = pickedRoom;
        const free = room.status === 'volno';
        const facts = el('dl', { className: 'room-facts' },
            el('dt', { textContent: 'Plocha' }), el('dd', { textContent: `přibližně ${String(room.area).replace('.', ',')} m²` }),
            el('dt', { textContent: 'Cena' }), el('dd', { textContent: 'na vyžádání' }),
            el('dt', { textContent: 'Stav' }), el('dd', { textContent: free ? 'Volno' : 'Obsazeno' }));
        const children = [el('h1', { textContent: `Kancelář ${room.id}` }), facts];
        if (SAMPLE_DATA) children.push(el('p', { className: 'sample', textContent: 'Ukázková data, nahradí je seznam od makléře.' }));
        if (room.tour) {
            const enter = el('button', { type: 'button', className: 'btn', textContent: 'Podívat se dovnitř ve 3D' });
            enter.addEventListener('click', () => openTour(room.tour));
            children.push(el('div', { className: 'panel-actions' }, enter));
        }
        children.push(el('div', { className: 'panel-actions' }, inquiryForm(free ? `kancelář ${room.id}, ${floor.label}` : `podobná kancelář jako ${room.id}, ${floor.label}`)));
        panel.replaceChildren(...children);
        return;
    }
    if (!floor.rooms.length) {
        panel.replaceChildren(...head, el('p', { textContent: floor.note }), el('p', { className: 'sample', textContent: 'Půdorys tohoto patra doplníme.' }), el('div', { className: 'panel-actions' }, el('a', { className: 'text-link', href: floorPage(openLevel), textContent: 'Informace o patře' })), el('div', { className: 'panel-actions' }, inquiryForm(floor.label)));
        return;
    }
    const list = el('ul', { className: 'room-list' });
    for (const room of floor.rooms) {
        const b = el('button', { type: 'button', className: room.status === 'volno' ? '' : 'is-taken' }, el('span', { textContent: `Kancelář ${room.id}` }), el('span', { textContent: `≈ ${String(room.area).replace('.', ',')} m² · ${room.status === 'volno' ? 'volno' : 'obsazeno'}` }));
        b.dataset.room = room.id;
        b.addEventListener('click', () => pickRoom(room));
        b.addEventListener('pointerenter', () => setHover(`room-${room.id}`));
        b.addEventListener('pointerleave', () => setHover(null));
        list.append(el('li', {}, b));
    }
    const legend = el('div', { className: 'legend' }, el('span', {}, el('i', { className: 'dot dot-free' }), 'Volno'), el('span', {}, el('i', { className: 'dot dot-taken' }), 'Obsazeno'));
    const children = [...head, legend];
    if (SAMPLE_DATA) children.push(el('p', { className: 'sample', textContent: 'Ukázková data, nahradí je seznam od makléře.' }));
    children.push(list, el('div', { className: 'panel-actions' }, el('a', { className: 'text-link', href: floorPage(openLevel), textContent: 'Půdorys patra ve velkém formátu' })));
    panel.replaceChildren(...children);
};

const gymPhotoUrl = (room) => `gym/${room.photo}.webp`;
const setGymPhoto = (index) => {
    gymPhoto = index;
    const room = GYM.rooms[index];
    const image = panel.querySelector('.panel-photo');
    if (!image) return;
    image.src = gymPhotoUrl(room);
    image.alt = room.name;
    panel.querySelector('.photo-caption').replaceChildren(el('span', { textContent: room.name }), el('span', { textContent: room.area }));
    for (const b of panel.querySelectorAll('.thumbs button')) b.classList.toggle('is-active', +b.dataset.index === index);
    for (const label of document.querySelectorAll('.gym-room')) label.classList.toggle('is-active', +label.dataset.index === index);
};

const removeGymSheet = () => document.querySelector('.gym-sheet')?.remove();

const SVG_NS = 'http://www.w3.org/2000/svg';
let planCard = null;
/** The model sits in the free space: right of the panel, and left of the floor plan when one is open beside it. */
const frameView = () => {
    if (!camera) return;
    const stage = $('stage');
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    let shift = 0;
    if (!isNarrow()) {
        const origin = stage.getBoundingClientRect().left;
        const left = panel.getBoundingClientRect().right - origin;
        const card = planCard && !planCard.classList.contains('is-collapsed') ? planCard.getBoundingClientRect().left - origin : width;
        shift = -((left + card) / 2 - width / 2);
    }
    camera.setViewOffset(width, height, shift, 0, width, height);
    camera.updateProjectionMatrix();
    needsRender = true;
};

const removePlanCard = () => {
    planCard?.remove();
    planCard = null;
    frameView();
};
/** The client's own floor plan of the opened floor: its rooms answer to the same hover and click as the model's. */
const showPlanCard = (floor) => {
    if (planCard?.dataset.level === String(floor.level)) return;
    removePlanCard();
    if (!floor.plan) return;
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 5 1400 990');
    svg.setAttribute('role', 'group');
    svg.setAttribute('aria-label', `Půdorys, ${floor.label}`);
    const image = document.createElementNS(SVG_NS, 'image');
    for (const [k, v] of Object.entries({ href: floor.plan, x: 0, y: 5, width: 1400, height: 990 })) image.setAttribute(k, v);
    svg.append(image);
    for (const room of floor.rooms) {
        const shape = document.createElementNS(SVG_NS, 'polygon');
        shape.setAttribute('points', room.shape.map((p) => p.join(',')).join(' '));
        shape.setAttribute('class', `plan-room is-${room.status}`);
        shape.setAttribute('tabindex', '0');
        shape.setAttribute('role', 'button');
        shape.setAttribute('aria-label', `Kancelář ${room.id}, ${room.status}`);
        shape.dataset.room = room.id;
        shape.addEventListener('click', () => pickRoom(room));
        shape.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                pickRoom(room);
            }
        });
        shape.addEventListener('pointerenter', () => setHover(`room-${room.id}`));
        shape.addEventListener('pointerleave', () => setHover(null));
        svg.append(shape);
    }
    for (const room of floor.rooms) {
        const cx = room.shape.reduce((sum, p) => sum + p[0], 0) / room.shape.length;
        const cy = room.shape.reduce((sum, p) => sum + p[1], 0) / room.shape.length;
        const label = document.createElementNS(SVG_NS, 'text');
        label.setAttribute('x', cx);
        label.setAttribute('y', cy);
        label.setAttribute('class', `plan-label is-${room.status}`);
        label.dataset.room = room.id;
        label.textContent = room.id;
        svg.append(label);
    }
    const toggle = el('button', { type: 'button', className: 'plan-card-icon' }, icon('minus'));
    toggle.setAttribute('aria-label', 'Skrýt půdorys');
    toggle.addEventListener('click', () => {
        const hidden = planCard.classList.toggle('is-collapsed');
        toggle.replaceChildren(icon(hidden ? 'plan' : 'minus'));
        toggle.setAttribute('aria-label', hidden ? 'Ukázat půdorys' : 'Skrýt půdorys');
        frameView();
    });
    const large = el('a', { className: 'plan-card-icon', href: floorPage(floor.level) }, icon('expand'));
    large.setAttribute('aria-label', 'Půdorys ve velkém formátu');
    large.title = 'Velký formát';
    const free = floor.rooms.filter((r) => r.status === 'volno').length;
    planCard = el('section', { className: 'plan-card' },
        el('header', { className: 'plan-card-head' },
            el('div', {}, el('p', { textContent: 'Půdorys' }), el('h2', { textContent: floor.label })),
            el('span', { className: 'plan-card-count', textContent: `${free} volné` }),
            large, toggle),
        el('div', { className: 'plan-card-body' }, svg),
        el('footer', { className: 'plan-card-foot' },
            el('span', { className: 'plan-key' }, el('i', { className: 'key-free' }), 'Volno'),
            el('span', { className: 'plan-key' }, el('i', { className: 'key-taken' }), 'Obsazeno'),
            el('span', { className: 'plan-card-status', role: 'status' })));
    planCard.setAttribute('aria-label', `Půdorys, ${floor.label}`);
    planCard.dataset.level = floor.level;
    // a wide screen has room beside the model; a narrow one shows the plan between the model and the panel
    if (isNarrow()) $('stage').after(planCard);
    else $('stage').append(planCard);
    frameView();
};

const renderGymPanel = () => {
    const thumbs = el('div', { className: 'thumbs' });
    GYM.rooms.forEach((room, i) => {
        const b = el('button', { type: 'button', ariaLabel: room.name }, el('img', { src: `gym/thumb-${room.photo}.webp`, alt: '', loading: 'lazy' }));
        b.dataset.index = i;
        b.addEventListener('click', () => setGymPhoto(i));
        thumbs.append(b);
    });
    const enter = el('button', { type: 'button', className: 'btn', textContent: 'Vstoupit do 3D prohlídky' });
    enter.addEventListener('click', () => openTour(GYM.tour));
    const children = [
        el('h1', { textContent: GYM.title }),
        el('p', { textContent: GYM.text }),
        el('img', { className: 'panel-photo', alt: '' }),
        el('p', { className: 'photo-caption' }),
        thumbs,
        el('div', { className: 'panel-actions' }, enter, el('a', { className: 'text-link', href: floorPage(1), textContent: 'Půdorys' })),
    ];
    panel.replaceChildren(...children);
    removeGymSheet();
    if (gymData) {
        const sheet = el('div', { className: 'gym-sheet' }, gymPlanSvg(gymData, GYM.rooms, setGymPhoto));
        // a wide screen has room for the plan beside the panel; a narrow one keeps it in the panel's flow
        if (isNarrow()) panel.insertBefore(sheet, panel.querySelector('.panel-actions'));
        else $('stage').append(sheet);
    }
    setGymPhoto(gymPhoto);
};

const renderZonePanel = (key) => {
    const zone = ZONES[key];
    const children = [];
    if (zone.photo) children.push(el('img', { className: 'panel-photo', src: zone.photo, alt: zone.title, loading: 'lazy' }));
    children.push(el('h1', { textContent: zone.title }), el('p', { textContent: zone.text }));
    if (key === 'doprava' && manifest) children.push(el('p', { textContent: `Od nejbližší zastávky je to ke vchodu přibližně ${manifest.walk.metres} m, asi ${manifest.walk.minutes} minuty pěšky.` }));
    const actions = el('div', { className: 'panel-actions' }, el('a', { className: 'btn', href: '#kontakt', textContent: 'Zeptat se makléře' }));
    if (zone.link) actions.append(el('a', { className: 'text-link', href: zone.link.href, textContent: zone.link.label, target: '_blank', rel: 'noopener' }));
    children.push(actions);
    panel.replaceChildren(...children);
};

/* ---------- 3D: helpers ---------- */

const floorHeight = () => (manifest.floors.eave - manifest.floors.base) / manifest.floors.count;
const floorBase = (level) => manifest.floors.base + (level - 1) * floorHeight();

const groundY = (x, z) => {
    const { grid, size } = manifest.ground;
    const step = size / (grid - 1);
    const fx = Math.max(0, Math.min(grid - 1.001, (x + size / 2) / step));
    const fz = Math.max(0, Math.min(grid - 1.001, (z + size / 2) / step));
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const u = fx - i;
    const v = fz - j;
    const h = (a, b) => groundHeights[b * grid + a];
    return (h(i, j) * (1 - u) + h(i + 1, j) * u) * (1 - v) + (h(i, j + 1) * (1 - u) + h(i + 1, j + 1) * u) * v;
};

/** The projective map that lays the floor plans' four outer corners exactly on the model's walls. */
const planHomography = () => {
    const rows = [];
    for (const [px, py, x, z] of manifest.plan.quad) {
        rows.push([px, py, 1, 0, 0, 0, -px * x, -py * x, x]);
        rows.push([0, 0, 0, px, py, 1, -px * z, -py * z, z]);
    }
    for (let i = 0; i < 8; i++) {
        let pivot = i;
        for (let r = i + 1; r < 8; r++) if (Math.abs(rows[r][i]) > Math.abs(rows[pivot][i])) pivot = r;
        [rows[i], rows[pivot]] = [rows[pivot], rows[i]];
        for (let r = 0; r < 8; r++) {
            if (r === i) continue;
            const k = rows[r][i] / rows[i][i];
            for (let c = i; c < 9; c++) rows[r][c] -= k * rows[i][c];
        }
    }
    return rows.map((row, i) => row[8] / row[i]);
};
let homography = null;
/** Floor-plan pixels to the model's ground coordinates. */
const pxToFlat = ([px, py]) => {
    homography ??= planHomography();
    const [h0, h1, h2, h3, h4, h5, h6, h7] = homography;
    const w = h6 * px + h7 * py + 1;
    return [(h0 * px + h1 * py + h2) / w, (h3 * px + h4 * py + h5) / w];
};
const PLAN_MIDDLE = [650, 390];
const STEP_PX = 100;
const planCentre = () => pxToFlat(PLAN_MIDDLE);
const unit = (v) => {
    const l = Math.hypot(v[0], v[1]);
    return [v[0] / l, v[1] / l];
};
const planDelta = (dx, dy) => {
    const a = pxToFlat(PLAN_MIDDLE);
    const b = pxToFlat([PLAN_MIDDLE[0] + dx, PLAN_MIDDLE[1] + dy]);
    return [b[0] - a[0], b[1] - a[1]];
};
const planRight = () => unit(planDelta(STEP_PX, 0));
const planDown = () => unit(planDelta(0, STEP_PX));

const VIEWS = {
    overview: { pos: [-96, 104, 176], target: [10, 6, 24] },
    doprava: { pos: [-40, 190, 262], target: [46, 0, 66] },
    restaurace: { pos: [-10, 26, 108], target: [-2, 4, 40] },
    sal: { pos: [60, 30, 104], target: [20, 10, 44] },
    parkoviste: { pos: [-92, 52, -44], target: [-24, 0, -6] },
};
const viewOf = (name) => {
    if (VIEWS[name]) return VIEWS[name];
    const [cx, cz] = planCentre();
    const [dx, dz] = planDown();
    const [rx, rz] = planRight();
    if (name === 'floors' || name === 'gym') return { pos: [cx + dx * 62 + rx * 26, 17, cz + dz * 62 + rz * 26], target: [cx, 8.5, cz] };
    // an open floor: from the side of the plan's bottom edge, so the plan reads upright, below the lifted roof
    const y = floorBase(openLevel ?? activeLevel);
    return { pos: [cx + dx * 36, y + 43, cz + dz * 36], target: [cx, y + 3, cz] };
};

const NARROW_DISTANCE = 0.9;
const fitted = (view) => {
    const stage = $('stage');
    if (stage.clientWidth / stage.clientHeight >= 0.9) return view;
    return { pos: view.pos.map((n, i) => view.target[i] + (n - view.target[i]) * NARROW_DISTANCE), target: view.target };
};

const flyTo = (view, ms = 1400) => {
    const to = { pos: new THREE.Vector3(...view.pos), target: new THREE.Vector3(...view.target) };
    if (reducedMotion) {
        camera.position.copy(to.pos);
        controls.target.copy(to.target);
        controls.update();
        needsRender = true;
        return;
    }
    flight = { start: performance.now(), ms, from: { pos: camera.position.clone(), target: controls.target.clone() }, to };
};

const material = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0, side: THREE.DoubleSide, ...extra });

// Painted from the user's street photos, in the client's colours. Kinds match KIND in build-model.mjs.
// Drawn in the shader, so windows stay sharp close up and nothing large has to download.
const SURFACE_GLSL = /* glsl */ `
varying vec4 vFacade;
uniform float uLevel;
uniform float uLevelOn;
uniform float uHover;
uniform float uGlow;
float gGlow = 0.0;
vec3 srgb(float r, float g, float b) { return pow(vec3(r, g, b) / 255.0, vec3(2.2)); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float boxOf(vec2 p, vec2 c, vec2 h, vec2 aa) {
    vec2 d = abs(p - c) - h;
    return (1.0 - smoothstep(0.0, aa.x, d.x)) * (1.0 - smoothstep(0.0, aa.y, d.y));
}
float lines(float x, float width, float aa) {
    float d = abs(fract(x) - 0.5);
    return smoothstep(0.5 - width - aa, 0.5 - width + aa, d);
}
const vec3 PANE = vec3(0.022, 0.05, 0.07);
vec3 paneWindow(vec3 c, vec2 cell, vec2 centre, vec2 glass, vec3 frame, vec2 aa, float lit) {
    c = mix(c, frame, boxOf(cell, centre, glass + vec2(0.022, 0.022), aa));
    float g = boxOf(cell, centre, glass, aa);
    float bars = max(boxOf(cell, centre, vec2(0.009, glass.y), aa), boxOf(cell, centre, vec2(glass.x, 0.008), aa));
    c = mix(c, PANE, g);
    c = mix(c, frame, bars);
    gGlow = max(gGlow, g * (1.0 - bars) * lit);
    return c;
}
vec3 surfaceColor(vec4 f) {
    float kind = floor(f.z + 0.5);
    vec3 plaster = srgb(244.0, 239.0, 226.0);
    if (kind < 0.5) return plaster;
    vec2 uv = f.xy;
    vec2 fw = max(fwidth(uv), vec2(1e-4));
    vec2 aa = fw * 1.5;
    float far = smoothstep(0.18, 0.5, max(fw.x, fw.y));

    if (kind > 9.5) {
        vec3 roof; vec3 seam; float amount;
        if (kind < 10.5) {
            roof = srgb(170.0, 186.0, 193.0); seam = srgb(140.0, 158.0, 166.0);
            amount = lines(uv.x / 1.1, 0.03, fw.x / 1.1);
        } else if (kind < 11.5) {
            roof = srgb(176.0, 96.0, 68.0); seam = srgb(150.0, 80.0, 58.0);
            amount = lines(uv.y / 0.5, 0.06, fw.y / 0.5);
        } else if (kind < 12.5) {
            roof = srgb(92.0, 100.0, 108.0); seam = srgb(74.0, 82.0, 90.0);
            amount = lines(uv.y / 0.45, 0.06, fw.y / 0.45);
        } else {
            roof = srgb(146.0, 92.0, 78.0); seam = srgb(122.0, 76.0, 66.0);
            amount = lines(uv.y / 0.5, 0.06, fw.y / 0.5);
        }
        return mix(mix(roof, seam, amount), roof, far);
    }
    if (kind > 3.5 && kind < 4.5) {
        vec3 brick = srgb(156.0, 82.0, 58.0);
        return mix(mix(brick, srgb(128.0, 68.0, 50.0), lines(uv.y, 0.1, fw.y)), brick, far);
    }

    vec2 cell = fract(uv);
    vec2 id = floor(uv);
    float row = id.y;
    float rows = f.w;
    bool inside = row >= 0.0 && row < rows;
    bool ground = row >= rows - 1.0;
    float rnd = hash(id + kind);
    float lit = rnd > 0.58 ? 0.55 + rnd * 0.5 : 0.0;
    vec3 trim = srgb(250.0, 247.0, 238.0);
    vec3 wood = srgb(96.0, 62.0, 36.0);
    vec3 col;

    if (kind < 1.5) {
        // the hall's street side: rusticated ground floor with big arches, small hooded windows above
        col = plaster;
        if (inside && ground) {
            col = srgb(236.0, 229.0, 208.0);
            col = mix(col, srgb(202.0, 192.0, 168.0), lines(cell.y * 6.0, 0.05, aa.y * 6.0));
            if (cell.y > 0.82) col = mix(col, srgb(226.0, 208.0, 160.0), 0.8); // the cream plinth
            float dq = length((cell - vec2(0.5, 0.42)) * vec2(1.05, 1.0));
            float edge = max(fw.x, fw.y) * 1.2;
            float arch = 1.0 - smoothstep(0.27 - edge, 0.27 + edge, dq);
            float body = boxOf(cell, vec2(0.5, 0.63), vec2(0.257, 0.21), aa);
            float g = max(arch, body);
            col = mix(col, PANE, g);
            // the glazing bars melt away with distance, where they would only shimmer
            float bars = max(lines(cell.x * 4.0, 0.05, aa.x * 4.0), lines(cell.y * 5.0, 0.05, aa.y * 5.0)) * (1.0 - smoothstep(0.012, 0.035, max(fw.x, fw.y)));
            col = mix(col, srgb(26.0, 32.0, 34.0), g * bars * 0.8);
            gGlow = max(gGlow, g * (1.0 - bars * 0.8) * 0.8);
        } else if (inside) {
            col = mix(col, trim, boxOf(cell, vec2(0.5, 0.26), vec2(0.21, 0.016), aa));
            col = mix(col, trim, boxOf(cell, vec2(0.5, 0.78), vec2(0.19, 0.02), aa));
            col = paneWindow(col, cell, vec2(0.5, 0.52), vec2(0.13, 0.2), wood, aa, lit);
        }
        // the cornices
        if (inside && row == rows - 2.0 && cell.y > 0.955) col = trim;
        if (row == 0.0 && cell.y < 0.05) col = trim;
    } else if (kind < 2.5) {
        col = srgb(240.0, 232.0, 212.0);
        if (inside) col = paneWindow(col, cell, vec2(0.5, 0.5), vec2(0.16, 0.25), wood, aa, lit);
    } else if (kind < 3.5) {
        // the office building: warm render, and a floor that lights up as a whole
        float lvl = rows - row;
        float band = (inside ? 1.0 : 0.0) * (1.0 - smoothstep(0.3, 0.7, abs(lvl - uLevel))) * uLevelOn;
        col = srgb(192.0, 174.0, 146.0);
        col = mix(col, col * 0.62, uLevelOn * (1.0 - band));
        col = mix(col, srgb(232.0, 200.0, 150.0), band * 0.75);
        if (inside) {
            float on = mix(lit * (1.0 - uLevelOn * 0.9), 1.05, band);
            col = paneWindow(col, cell, vec2(0.5, 0.5), vec2(0.14, 0.24), trim, aa, on);
            float hair = band * max(1.0 - smoothstep(0.0, aa.y * 1.2, cell.y), smoothstep(1.0 - aa.y * 1.2, 1.0, cell.y));
            gGlow = max(gGlow, hair * 1.4);
        }
    } else if (kind < 5.5) {
        // the hall's courtyard side: plain render and small windows
        col = srgb(214.0, 202.0, 174.0);
        if (inside) col = paneWindow(col, cell, vec2(0.5, 0.5), vec2(0.1, 0.13), wood, aa, lit);
    } else if (kind > 6.5) {
        // the tower's small gable: the tower's own render, so it does not stand out as a box, one window on its front
        col = srgb(240.0, 232.0, 212.0);
        if (rows > 0.5) {
            // one small window in the middle of the gable, as on the aerial photo
            vec2 box = vec2(0.1, 0.13);
            col = mix(col, srgb(214.0, 200.0, 168.0), boxOf(uv, vec2(0.5, 0.6), box + vec2(0.025, 0.02), fw * 1.5));
            col = mix(col, PANE, boxOf(uv, vec2(0.5, 0.6), box, fw * 1.5));
        }
    } else {
        // the ornate corner building: rusticated base, tall wooden windows
        col = srgb(244.0, 237.0, 218.0);
        if (inside && ground) col = mix(col, srgb(208.0, 198.0, 172.0), lines(cell.y * 6.0, 0.05, aa.y * 6.0));
        if (inside) {
            col = paneWindow(col, cell, vec2(0.5, 0.52), ground ? vec2(0.16, 0.3) : vec2(0.2, 0.36), wood, aa, 0.5 + rnd * 0.5);
            col = mix(col, trim, boxOf(cell, vec2(0.5, ground ? 0.17 : 0.11), vec2(0.27, 0.014), aa));
        }
        if (row == 0.0 && cell.y < 0.06) col = trim;
    }
    return mix(col, mix(col, plaster, 0.25), far);
}
`;

const painted = () => {
    const m = material(COLORS.plain);
    m.userData.uHover = { value: 0 };
    m.onBeforeCompile = (shader) => {
        shader.uniforms.uLevel = shared.uLevel;
        shader.uniforms.uLevelOn = shared.uLevelOn;
        shader.uniforms.uHover = m.userData.uHover;
        shader.uniforms.uGlow = shared.uGlow;
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nattribute vec4 facade;\nvarying vec4 vFacade;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFacade = facade;');
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>\n${SURFACE_GLSL}`)
            .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= surfaceColor(vFacade);\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.72, 0.42), uHover * 0.28);')
            .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += gGlow * uGlow * vec3(1.0, 0.62, 0.27);');
    };
    return m;
};

/** A wall drawn from the photos: its canvases, its windows lit at dusk, and on the offices the storey in focus. */
const facadeMaterial = (wall, isOffice) => {
    const texture = (canvas, srgb) => {
        const t = new THREE.CanvasTexture(canvas);
        if (srgb) t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = renderer.capabilities.getMaxAnisotropy();
        t.wrapS = THREE.ClampToEdgeWrapping;
        t.wrapT = THREE.ClampToEdgeWrapping;
        return t;
    };
    const m = material(COLORS.plain, { map: texture(wall.colour, true), emissiveMap: texture(wall.glow, false), emissive: 0xffffff });
    m.userData.uHover = { value: 0 };
    m.onBeforeCompile = (shader) => {
        shader.uniforms.uLevel = shared.uLevel;
        shader.uniforms.uLevelOn = isOffice ? shared.uLevelOn : shared.off;
        shader.uniforms.uFloorBase = shared.uFloorBase;
        shader.uniforms.uFloorHeight = shared.uFloorHeight;
        shader.uniforms.uHover = m.userData.uHover;
        shader.uniforms.uGlow = shared.uGlow;
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nvarying float vLocalY;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocalY = position.y;');
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>
varying float vLocalY;
uniform float uLevel, uLevelOn, uFloorBase, uFloorHeight, uHover, uGlow;
float storeyBand() {
    float at = (vLocalY - uFloorBase) / uFloorHeight;
    float lvl = floor(at) + 1.0;
    return (lvl >= 1.0 && lvl <= 4.0 ? 1.0 : 0.0) * (1.0 - smoothstep(0.3, 0.7, abs(lvl - uLevel))) * uLevelOn;
}`)
            .replace('#include <color_fragment>', `#include <color_fragment>
float band = storeyBand();
diffuseColor.rgb *= mix(1.0, 0.62, uLevelOn * (1.0 - band));
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.6, 0.32), band * 0.42);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.72, 0.42), uHover * 0.28);`)
            .replace('#include <emissivemap_fragment>', `vec4 windowMask = texture2D(emissiveMap, vEmissiveMapUv);
float atStorey = fract((vLocalY - uFloorBase) / uFloorHeight);
float edge = fwidth(vLocalY) / uFloorHeight * 1.4;
float hairline = band * max(1.0 - smoothstep(0.0, edge, atStorey), smoothstep(1.0 - edge, 1.0, atStorey));
totalEmissiveRadiance = (mix(windowMask.r * uGlow * (1.0 - uLevelOn * 0.9), windowMask.g * 1.05, band) + hairline * 1.3) * vec3(1.0, 0.62, 0.27);`);
    };
    return m;
};

const reliefMaterial = (isOffice) => {
    const m = material(COLORS.plain, { vertexColors: true });
    m.userData.uHover = { value: 0 };
    m.onBeforeCompile = (shader) => {
        shader.uniforms.uLevel = shared.uLevel;
        shader.uniforms.uLevelOn = isOffice ? shared.uLevelOn : shared.off;
        shader.uniforms.uFloorBase = shared.uFloorBase;
        shader.uniforms.uFloorHeight = shared.uFloorHeight;
        shader.uniforms.uHover = m.userData.uHover;
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nvarying float vLocalY;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocalY = position.y;');
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>
varying float vLocalY;
uniform float uLevel, uLevelOn, uFloorBase, uFloorHeight, uHover;`)
            .replace('#include <color_fragment>', `#include <color_fragment>
float lvl = floor((vLocalY - uFloorBase) / uFloorHeight) + 1.0;
float band = (lvl >= 1.0 && lvl <= 4.0 ? 1.0 : 0.0) * (1.0 - smoothstep(0.3, 0.7, abs(lvl - uLevel))) * uLevelOn;
diffuseColor.rgb *= mix(1.0, 0.62, uLevelOn * (1.0 - band));
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.72, 0.42), uHover * 0.28);`);
    };
    return m;
};

/** Everything a wall's painter said stands out of the wall, merged into one mesh along the wall's path. */
const reliefGeometry = (wall, spec) => {
    const positions = [];
    const normals = [];
    const colours = [];
    const up = new THREE.Vector3(0, 1, 0);
    const matrix = new THREE.Matrix4();
    const place = (segment, u, y, out) => {
        const t = new THREE.Vector3(segment.b[0] - segment.a[0], 0, segment.b[1] - segment.a[1]).normalize();
        const n = new THREE.Vector3(t.z, 0, -t.x).multiplyScalar(spec.outward);
        const side = new THREE.Vector3().crossVectors(up, n);
        const along = u - segment.start;
        matrix.makeBasis(side, up, n);
        matrix.setPosition(segment.a[0] + t.x * along + n.x * out, spec.y0 + y, segment.a[1] + t.z * along + n.z * out);
        return matrix;
    };
    const segmentAt = (u) => spec.segments.find((s) => u >= s.start && u <= s.start + s.L) ?? spec.segments[spec.segments.length - 1];
    const add = (geometry, m, hex) => {
        const flat = geometry.index ? geometry.toNonIndexed() : geometry;
        flat.applyMatrix4(m);
        positions.push(...flat.attributes.position.array);
        normals.push(...flat.attributes.normal.array);
        const c = new THREE.Color(hex);
        for (let i = 0; i < flat.attributes.position.count; i++) colours.push(c.r, c.g, c.b);
    };
    // nothing may stand out where the wall itself stops
    const SLACK = 0.35;
    const CHUNK = 1;
    const fits = (u, y) => y <= (spec.profile[Math.max(0, Math.min(spec.profile.length - 1, Math.round(u / spec.profileStep)))] ?? 0) + SLACK;
    for (const part of wall.parts) {
        if (part.type === 'box') {
            for (const segment of spec.segments) {
                const u0 = Math.max(part.x0, segment.start);
                const u1 = Math.min(part.x1, segment.start + segment.L);
                if (u1 - u0 < 0.01) continue;
                const pieces = Math.max(1, Math.round((u1 - u0) / CHUNK));
                const width = (u1 - u0) / pieces;
                for (let i = 0; i < pieces; i++) {
                    const mid = u0 + width * (i + 0.5);
                    if (!fits(mid, part.y1)) continue;
                    add(new THREE.BoxGeometry(width, part.y1 - part.y0, part.d), place(segment, mid, (part.y0 + part.y1) / 2, part.d / 2), part.colour);
                }
            }
        } else if (part.type === 'arc' || part.type === 'ring') {
            if (!part.d && !fits(part.cx, part.cy + part.r)) continue;
            const sweep = part.type === 'arc' ? Math.PI : Math.PI * 2;
            add(new THREE.TorusGeometry(part.r, part.tube, 6, 22, sweep), place(segmentAt(part.cx), part.cx, part.cy, part.d ?? 0.06), part.colour);
        } else {
            const shape = new THREE.Shape(part.points.map(([x, y]) => new THREE.Vector2(x, y)));
            add(new THREE.ExtrudeGeometry(shape, { depth: part.d, bevelEnabled: false }), place(segmentAt(part.cx), part.cx, part.y, 0), part.colour);
        }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
    return geometry;
};

const facadeGeometry = (buffer, spec) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(buffer.slice(spec.offset, spec.offset + spec.count), 3));
    const uvStart = manifest.uvStart + spec.uv;
    geometry.setAttribute('uv', new THREE.BufferAttribute(buffer.slice(uvStart, uvStart + (spec.count / 3) * 2), 2));
    geometry.computeVertexNormals();
    return geometry;
};

const makeGeometry = (buffer, part) => {
    const { offset, count, attribute } = manifest.parts[part];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(buffer.slice(offset, offset + count), 3));
    geometry.computeVertexNormals();
    if (attribute !== undefined) {
        const start = manifest.attributeStart + attribute;
        geometry.setAttribute('facade', new THREE.BufferAttribute(buffer.slice(start, start + (count / 3) * 4), 4));
    }
    return geometry;
};

const addMesh = (buffer, part, color) => {
    const hasSurface = manifest.parts[part].attribute !== undefined;
    const mesh = new THREE.Mesh(makeGeometry(buffer, part), hasSurface ? painted() : material(color));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
};

/* ---------- ground ---------- */

const paintMap = (size) => {
    const MAP_COLORS = THEMES[themeName].map;
    const canvas = el('canvas', { width: size, height: size });
    const c = canvas.getContext('2d');
    const half = manifest.ground.size / 2;
    const scale = size / manifest.ground.size;
    const tx = (x) => (x + half) * scale;
    const trace = (line, close = false) => {
        c.beginPath();
        line.forEach(([x, z], i) => (i ? c.lineTo(tx(x), tx(z)) : c.moveTo(tx(x), tx(z))));
        if (close) c.closePath();
    };
    const stroke = (line, width, color) => {
        c.strokeStyle = color;
        c.lineWidth = width * scale;
        trace(line);
        c.stroke();
    };
    const fill = (poly, color) => {
        c.fillStyle = color;
        trace(poly, true);
        c.fill();
    };
    const { map } = manifest;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.fillStyle = MAP_COLORS.ground;
    c.fillRect(0, 0, size, size);
    map.green.forEach((poly) => fill(poly, MAP_COLORS.green));
    map.paths.forEach((line) => stroke(line, 1.8, MAP_COLORS.path));
    map.roads.forEach(({ width, line }) => stroke(line, width + 1.2, MAP_COLORS.roadEdge));
    map.roads.forEach(({ width, line }) => stroke(line, width, MAP_COLORS.road));
    map.tram.forEach((line) => stroke(line, 0.6, MAP_COLORS.tram));
    map.platforms.forEach((line) => stroke(line, 3, MAP_COLORS.platform));
    fill(map.parking, MAP_COLORS.parking);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return texture;
};

const addGround = () => {
    const { grid, size } = manifest.ground;
    const half = size / 2;
    const step = size / (grid - 1);
    const positions = new Float32Array(grid * grid * 3);
    const uvs = new Float32Array(grid * grid * 2);
    for (let j = 0; j < grid; j++) {
        for (let i = 0; i < grid; i++) {
            const k = j * grid + i;
            positions.set([i * step - half, groundHeights[k], j * step - half], k * 3);
            uvs.set([i / (grid - 1), 1 - j / (grid - 1)], k * 2);
        }
    }
    const index = [];
    for (let j = 0; j < grid - 1; j++) {
        for (let i = 0; i < grid - 1; i++) {
            const a = j * grid + i;
            index.push(a, a + grid, a + 1, a + 1, a + grid, a + grid + 1);
        }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(index);
    geometry.computeVertexNormals();
    const mapSize = Math.min(renderer.capabilities.maxTextureSize, isNarrow() ? 2048 : 4096);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: paintMap(mapSize), roughness: 1, metalness: 0 }));
    mesh.receiveShadow = true;
    scene.add(mesh);
    themed.ground = mesh;
    themed.mapSize = mapSize;
};

/** A see-through patch of ground that lights up on hover, plus what the pointer can hit. */
const addOverlay = (zone, poly, y, pickHeight) => {
    const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
    const flat = new THREE.ShapeGeometry(shape);
    flat.rotateX(-Math.PI / 2);
    const overlay = new THREE.Mesh(flat, new THREE.MeshBasicMaterial({ color: COLORS.parkingHover, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    overlay.position.y = y + 0.08;
    overlay.renderOrder = 1;
    scene.add(overlay);
    zoneMeshes[zone] = { overlay };
    const volume = new THREE.ExtrudeGeometry(shape, { depth: pickHeight, bevelEnabled: false });
    volume.rotateX(-Math.PI / 2);
    const hit = new THREE.Mesh(volume, new THREE.MeshBasicMaterial());
    hit.position.y = y;
    hit.visible = false; // the raycaster still finds it
    hit.userData.zone = zone;
    pickable.push(hit);
};

/* ---------- small things that make the place feel lived in ---------- */

const boxes = (color, items, mat = material(color)) => {
    // items: [x, y, z, sizeX, sizeY, sizeZ, angle]
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, items.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    items.forEach(([x, y, z, sx, sy, sz, a = 0], i) => {
        m.compose(new THREE.Vector3(x, y, z), q.setFromAxisAngle(up, a), new THREE.Vector3(sx, sy, sz));
        mesh.setMatrixAt(i, m);
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
};

const glowTexture = (() => {
    let texture = null;
    return () => {
        if (texture) return texture;
        const canvas = el('canvas', { width: 128, height: 128 });
        const c = canvas.getContext('2d');
        const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
        g.addColorStop(0, 'rgba(255,214,150,1)');
        g.addColorStop(0.25, 'rgba(255,190,120,.42)');
        g.addColorStop(1, 'rgba(255,170,90,0)');
        c.fillStyle = g;
        c.fillRect(0, 0, 128, 128);
        texture = new THREE.CanvasTexture(canvas);
        return texture;
    };
})();
const addGlow = (x, y, z, size, opacity = 0.7) => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity }));
    sprite.position.set(x, y, z);
    sprite.scale.set(size, size, 1);
    sprite.userData.opacity = opacity;
    themed.glows.push(sprite);
    scene.add(sprite);
};

const addTrees = () => {
    const { trees } = manifest.map;
    const crown = new THREE.IcosahedronGeometry(1, 1);
    const p = crown.attributes.position;
    for (let i = 0; i < p.count; i++) {
        const k = 1 + Math.sin(p.getX(i) * 7.3 + p.getY(i) * 5.1 + p.getZ(i) * 9.7) * 0.11;
        p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
    }
    crown.computeVertexNormals();
    const mesh = new THREE.InstancedMesh(crown, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true }), trees.length * 2);
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.26, 1, 6), material(COLORS.trunk), trees.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const color = new THREE.Color();
    trees.forEach(([x, y, z, r], i) => {
        const size = r * 0.62;
        const seed = (Math.abs(x * 13.7 + z * 7.1) % 1);
        q.setFromAxisAngle(up, seed * 6.28);
        m.compose(new THREE.Vector3(x, y + size * 1.55, z), q, new THREE.Vector3(size, size * 1.08, size));
        mesh.setMatrixAt(i * 2, m);
        m.compose(new THREE.Vector3(x + size * 0.4, y + size * 2.25, z - size * 0.25), q, new THREE.Vector3(size * 0.62, size * 0.62, size * 0.62));
        mesh.setMatrixAt(i * 2 + 1, m);
        color.setHex(COLORS.tree).offsetHSL((seed - 0.5) * 0.03, 0, (seed - 0.5) * 0.06);
        mesh.setColorAt(i * 2, color);
        color.offsetHSL(0, 0, 0.04);
        mesh.setColorAt(i * 2 + 1, color);
        m.makeScale(1 + r * 0.04, size * 1.1, 1 + r * 0.04);
        m.setPosition(x, y + size * 0.5, z);
        trunks.setMatrixAt(i, m);
    });
    themed.trees = mesh;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    trunks.castShadow = true;
    scene.add(mesh, trunks);
};

const addPerimeter = () => {
    const walls = [];
    const caps = [];
    const piers = [];
    const pierCaps = [];
    const HEIGHT = 2.5;
    const PIER_EVERY = 11;
    for (const line of manifest.map.walls) {
        const [a, b] = line;
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const angle = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
        const count = Math.ceil(length / 3);
        for (let i = 0; i < count; i++) {
            const t = (i + 0.5) / count;
            const x = a[0] + (b[0] - a[0]) * t;
            const z = a[1] + (b[1] - a[1]) * t;
            const y = groundY(x, z);
            walls.push([x, y + HEIGHT / 2 - 1, z, length / count + 0.02, HEIGHT + 2, 0.45, angle]);
            caps.push([x, y + HEIGHT + 1.09 - 1, z, length / count + 0.02, 0.18, 0.75, angle]);
        }
        for (let s = PIER_EVERY / 2; s < length; s += PIER_EVERY) {
            const x = a[0] + ((b[0] - a[0]) * s) / length;
            const z = a[1] + ((b[1] - a[1]) * s) / length;
            const y = groundY(x, z);
            piers.push([x, y + 1, z, 1.2, 3.4, 1, angle]);
            pierCaps.push([x, y + 2.9, z, 1.5, 0.3, 1.3, angle]);
        }
    }
    boxes(COLORS.wallCream, walls);
    boxes(COLORS.cap, caps);
    boxes(COLORS.wallCream, piers);
    boxes(COLORS.cap, pierCaps);
};

const carShape = () => {
    const s = new THREE.Shape();
    s.moveTo(-2.2, 0.3);
    s.lineTo(2.2, 0.3);
    s.quadraticCurveTo(2.32, 0.62, 2.1, 0.8);
    s.lineTo(1.0, 0.92);
    s.lineTo(-1.8, 0.96);
    s.quadraticCurveTo(-2.3, 0.86, -2.2, 0.3);
    return s;
};
const cabinShape = () => {
    const s = new THREE.Shape();
    s.moveTo(1.02, 0.9);
    s.lineTo(0.2, 1.42);
    s.lineTo(-1.25, 1.44);
    s.lineTo(-1.82, 0.94);
    return s;
};
const addCars = () => {
    // the bays' lines are geometry rather than paint, so they stay crisp close up
    const y = manifest.levels.parking + 0.05;
    const lines = [];
    for (const bay of manifest.map.bays) {
        bay.slice(0, 3).forEach((p, i) => {
            const q = bay[i + 1];
            lines.push([(p[0] + q[0]) / 2, y, (p[1] + q[1]) / 2, Math.hypot(q[0] - p[0], q[1] - p[1]) + 0.1, 0.02, 0.1, Math.atan2(-(q[1] - p[1]), q[0] - p[0])]);
        });
    }
    boxes(0xe8e0cd, lines).castShadow = false;
    const body = new THREE.ExtrudeGeometry(carShape(), { depth: 1.7, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2, curveSegments: 6 });
    body.translate(0, 0, -0.85);
    const cabin = new THREE.ExtrudeGeometry(cabinShape(), { depth: 1.46, bevelEnabled: false });
    cabin.translate(0, 0, -0.73);
    const wheel = new THREE.CylinderGeometry(0.33, 0.33, 0.24, 14);
    wheel.rotateX(Math.PI / 2);
    const lights = new THREE.SphereGeometry(0.09, 8, 6);
    const colors = [0xcfd4d6, 0x1b2a33, 0xe8e6df, 0x31566a, 0x8c9498, 0x20242a, 0x7a3b32];
    const glass = material(0x10242c, { roughness: 0.25 });
    const tyre = material(0x101416);
    const lamp = new THREE.MeshBasicMaterial({ color: 0xffe2b0 });
    const taken = [0, 2, 3, 5, 7, 8, 10, 11, 13, 15, 16, 18, 20, 21];
    taken.forEach((index, i) => {
        const bay = manifest.map.bays[index];
        if (!bay) return;
        const [a, b, c, d] = bay;
        const edge1 = [b[0] - a[0], b[1] - a[1]];
        const edge2 = [c[0] - b[0], c[1] - b[1]];
        const long = Math.hypot(...edge1) > Math.hypot(...edge2) ? edge1 : edge2;
        const x = (a[0] + b[0] + c[0] + d[0]) / 4;
        const z = (a[1] + b[1] + c[1] + d[1]) / 4;
        const car = new THREE.Group();
        const paint = new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.42, metalness: 0.25 });
        const add = (geometry, mat, px = 0, py = 0, pz = 0) => {
            const mesh = new THREE.Mesh(geometry, mat);
            mesh.position.set(px, py, pz);
            mesh.castShadow = true;
            car.add(mesh);
        };
        add(body, paint);
        add(cabin, glass);
        for (const [wx, wz] of [[1.35, 0.8], [1.35, -0.8], [-1.35, 0.8], [-1.35, -0.8]]) add(wheel, tyre, wx, 0.33, wz);
        add(lights, lamp, 2.2, 0.68, 0.6);
        add(lights, lamp, 2.2, 0.68, -0.6);
        car.position.set(x, manifest.levels.parking + 0.04, z);
        car.rotation.y = Math.atan2(-long[1], long[0]) + (i % 3 === 0 ? Math.PI : 0);
        scene.add(car);
    });
};

const insidePoly = (x, z, poly) => {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, zi] = poly[i];
        const [xj, zj] = poly[j];
        if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
    }
    return hit;
};

/** The beer garden from the street photos: raised behind a cream wall with a black railing, parasols, flower boxes, lights. */
const addTerrace = () => {
    const poly = manifest.map.terrace;
    const top = manifest.levels.terrace;
    const { from, to } = manifest.terrace;
    const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
    const slabGeometry = new THREE.ExtrudeGeometry(shape, { depth: 6, bevelEnabled: false });
    slabGeometry.rotateX(-Math.PI / 2);
    const slab = new THREE.Mesh(slabGeometry, [material(COLORS.stone), material(COLORS.wallCream)]);
    slab.position.y = top - 6;
    slab.castShadow = true;
    slab.receiveShadow = true;
    scene.add(slab);
    slab.userData.zone = 'restaurace';
    pickable.push(slab);
    zoneMeshes.restaurace = { slab };

    const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const ax = (to[0] - from[0]) / length;
    const az = (to[1] - from[1]) / length;
    const nx = -az;
    const nz = ax;
    const place = (s, d) => [from[0] + ax * s + nx * d, from[1] + az * s + nz * d];
    const angle = Math.atan2(-az, ax);
    const [kioskX, kioskZ] = place(25.5, 7);

    // the railing along the street edges
    const rails = [];
    const posts = [];
    const planters = [];
    const blooms = [];
    for (let i = 0; i < 4; i++) {
        const a = poly[i];
        const b = poly[i + 1];
        const edge = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const edgeAngle = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
        const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        rails.push([mid[0], top + 1.05, mid[1], edge, 0.06, 0.06, edgeAngle], [mid[0], top + 0.2, mid[1], edge, 0.05, 0.05, edgeAngle]);
        const inward = [-(b[1] - a[1]) / edge, (b[0] - a[0]) / edge];
        for (let s = 0; s < edge; s += 1.6) {
            const x = a[0] + ((b[0] - a[0]) * s) / edge;
            const z = a[1] + ((b[1] - a[1]) * s) / edge;
            posts.push([x, top + 0.52, z, 0.05, 1.06, 0.05, edgeAngle]);
        }
        for (let s = 2.6; s < edge - 1; s += 4.6) {
            const sign = insidePoly((a[0] + b[0]) / 2 + inward[0], (a[1] + b[1]) / 2 + inward[1], poly) ? 1 : -1;
            const x = a[0] + ((b[0] - a[0]) * s) / edge + inward[0] * sign * 0.8;
            const z = a[1] + ((b[1] - a[1]) * s) / edge + inward[1] * sign * 0.8;
            planters.push([x, top + 0.32, z, 1.5, 0.64, 0.6, edgeAngle]);
            blooms.push([x, z]);
        }
    }
    boxes(COLORS.rail, rails);
    boxes(COLORS.rail, posts);
    boxes(COLORS.rail, planters);
    const flower = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.46, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true }), blooms.length * 2);
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    blooms.forEach(([x, z], i) => {
        m.makeScale(1.3, 0.8, 0.9);
        m.setPosition(x, top + 0.86, z);
        flower.setMatrixAt(i * 2, m);
        flower.setColorAt(i * 2, c.setHex(0x3f7a55));
        m.makeScale(0.8, 0.5, 0.7);
        m.setPosition(x + 0.15, top + 1.15, z);
        flower.setMatrixAt(i * 2 + 1, m);
        flower.setColorAt(i * 2 + 1, c.setHex(i % 2 ? 0xd9708a : 0xd8483f));
    });
    flower.castShadow = true;
    scene.add(flower);

    // tables, benches and open parasols
    const wood = [];
    const parasols = [];
    for (let d = 3.4; d < 20; d += 4.4) {
        for (let s = 1; s < 37; s += 3.7) {
            const [x, z] = place(s, d);
            if (!insidePoly(x, z, poly) || !insidePoly(x + nx * 1.6, z + nz * 1.6, poly) || Math.hypot(x - kioskX, z - kioskZ) < 6.2) continue;
            wood.push([x, top + 0.76, z, 2.1, 0.07, 0.72, angle]);
            for (const off of [-0.72, 0.72]) wood.push([x + nx * off, top + 0.45, z + nz * off, 2.1, 0.06, 0.28, angle]);
            for (const off of [-0.8, 0.8]) wood.push([x + ax * off, top + 0.38, z + az * off, 0.08, 0.76, 1.5, angle]);
            parasols.push([x + ax * 1.85, z + az * 1.85]);
        }
    }
    boxes(COLORS.wood, wood);
    const spots = parasols.filter((_, i) => i % 2 === 0);
    const canopy = new THREE.ConeGeometry(2.1, 0.95, 8);
    const canopyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true, side: THREE.DoubleSide });
    const parasolMesh = new THREE.InstancedMesh(canopy, canopyMat, spots.length);
    const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.035, 0.035, 2.5, 6), material(0xd8cfb8), spots.length);
    const valance = new THREE.InstancedMesh(new THREE.CylinderGeometry(2.1, 2.1, 0.22, 8, 1, true), material(COLORS.parasolLight), spots.length);
    const glowSpots = [];
    spots.forEach(([x, z], i) => {
        m.makeTranslation(x, top + 2.75, z);
        parasolMesh.setMatrixAt(i, m);
        parasolMesh.setColorAt(i, c.setHex(i % 3 === 2 ? COLORS.parasolLight : COLORS.parasol));
        m.makeTranslation(x, top + 1.25, z);
        pole.setMatrixAt(i, m);
        m.makeTranslation(x, top + 2.2, z);
        valance.setMatrixAt(i, m);
        glowSpots.push([x, z]);
    });
    parasolMesh.castShadow = true;
    valance.castShadow = true;
    scene.add(parasolMesh, pole, valance);
    glowSpots.forEach(([x, z], i) => {
        if (i % 2 === 0) addGlow(x, top + 1.7, z, 7, 0.5);
    });

    // small trees along the hall, as on the photos
    const crownG = new THREE.IcosahedronGeometry(1, 1);
    const crowns = [];
    for (let s = 2; s < 24; s += 5) crowns.push(place(s, 1.7));
    const crownMesh = new THREE.InstancedMesh(crownG, new THREE.MeshStandardMaterial({ color: 0x4e8a5e, roughness: 1, flatShading: true }), crowns.length);
    const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.09, 2.6, 6), material(COLORS.trunk), crowns.length);
    crowns.forEach(([x, z], i) => {
        m.makeScale(1.05, 1.25, 1.05);
        m.setPosition(x, top + 3.5, z);
        crownMesh.setMatrixAt(i, m);
        m.makeTranslation(x, top + 1.3, z);
        stems.setMatrixAt(i, m);
    });
    crownMesh.castShadow = true;
    scene.add(crownMesh, stems);

    // the round kiosk with its copper hood
    const part = (geometry, color, h, extra) => {
        const mesh = new THREE.Mesh(geometry, material(color, extra));
        mesh.position.set(kioskX, top + h, kioskZ);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
        return mesh;
    };
    part(new THREE.CylinderGeometry(3, 3, 2.6, 48), 0x25363a, 1.3);
    themed.band = part(new THREE.CylinderGeometry(2.92, 2.92, 1.1, 48, 1, true), 0xffc98a, 1.65, { emissive: 0xffa24d, emissiveIntensity: 0.9 });
    part(new THREE.CylinderGeometry(3.6, 3.6, 0.2, 48), 0x2c6b52, 2.8);
    part(new THREE.CylinderGeometry(0.46, 3, 1.9, 48), 0xbd8452, 3.85, { metalness: 0.35, roughness: 0.5 });
    part(new THREE.CylinderGeometry(0.34, 0.46, 2.4, 24), 0xbd8452, 6, { metalness: 0.35, roughness: 0.5 });
    addGlow(kioskX, top + 1.6, kioskZ, 13, 0.55);

    // strings of bulbs across the garden
    const bulbs = [];
    const lines = [[place(2, 1.2), place(10, 11)], [place(10, 1), place(17, 13)], [place(18, 0.8), place(14, 15)], [place(5, 7), place(17, 15)]];
    for (const [a, b] of lines) {
        const dist = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const count = Math.round(dist / 0.9);
        for (let i = 0; i <= count; i++) {
            const t = i / count;
            bulbs.push([a[0] + (b[0] - a[0]) * t, top + 4.2 - Math.sin(t * Math.PI) * 0.9, a[1] + (b[1] - a[1]) * t]);
        }
    }
    const bulbMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: COLORS.bulb }), bulbs.length);
    bulbs.forEach(([x, y, z], i) => {
        m.makeTranslation(x, y, z);
        bulbMesh.setMatrixAt(i, m);
    });
    scene.add(bulbMesh);
    themed.bulbs = bulbMesh;
};

const ROUTE_WIDTH = 0.5; // half of it
const ROUTE_LIFT = 1.05; // the route's points float for the walker; the dashes lie this much lower
const addRoute = () => {
    const { route } = manifest;
    const positions = [];
    for (let i = 0; i < route.length - 1; i++) {
        if (i % 3 === 2) continue; // two steps of dash, one of gap
        const [ax, ay, az] = route[i];
        const [bx, by, bz] = route[i + 1];
        const length = Math.hypot(bx - ax, bz - az) || 1;
        const nx = (-(bz - az) / length) * ROUTE_WIDTH;
        const nz = ((bx - ax) / length) * ROUTE_WIDTH;
        const y1 = ay - ROUTE_LIFT;
        const y2 = by - ROUTE_LIFT;
        positions.push(ax + nx, y1, az + nz, ax - nx, y1, az - nz, bx - nx, y2, bz - nz, ax + nx, y1, az + nz, bx - nx, y2, bz - nz, bx + nx, y2, bz + nz);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: COLORS.route, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    mesh.renderOrder = 1;
    scene.add(mesh);
    themed.route = mesh;
    walker = new THREE.Mesh(new THREE.SphereGeometry(1.2, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    walker.visible = false;
    scene.add(walker);
};

const WALK_MS = 10000;
const stepWalker = (now) => {
    const { route } = manifest;
    const t = ((now % WALK_MS) / WALK_MS) * (route.length - 1);
    const i = Math.floor(t);
    const a = route[i];
    const b = route[Math.min(i + 1, route.length - 1)];
    walker.position.set(a[0] + (b[0] - a[0]) * (t - i), a[1] + (b[1] - a[1]) * (t - i), a[2] + (b[2] - a[2]) * (t - i));
};

/* ---------- opening a floor: the storeys above lift off its floor, and the rooms rise in their place ---------- */

const flatAt = (px) => pxToFlat(px);
const metresPerPixel = (dx, dy) => Math.hypot(...planDelta(dx, dy)) / STEP_PX;

const planGeometry = (polyPx, y) => {
    const contour = polyPx.map(([x, z]) => new THREE.Vector2(x, z));
    const faces = THREE.ShapeUtils.triangulateShape(contour, []);
    const positions = [];
    for (const face of faces) {
        for (const k of face) {
            const [x, z] = flatAt(polyPx[k]);
            positions.push(x, y, z);
        }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    const count = positions.length / 3;
    const uvs = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
        uvs[i * 2] = positions[i * 3] / 2.2;
        uvs[i * 2 + 1] = positions[i * 3 + 2] / 2.2;
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    return geometry;
};

const woodTexture = (() => {
    let texture = null;
    return () => {
        if (texture) return texture;
        const canvas = el('canvas', { width: 512, height: 512 });
        const c = canvas.getContext('2d');
        const PLANK = 512 / 8;
        for (let row = 0; row < 8; row++) {
            for (let x = (row % 2) * -128; x < 512; x += 256) {
                const shade = 176 + ((row * 37 + x * 3) % 30);
                c.fillStyle = `rgb(${shade},${shade - 42},${shade - 92})`;
                c.fillRect(x, row * PLANK, 256, PLANK);
                c.strokeStyle = 'rgba(70,40,20,.28)';
                c.lineWidth = 1.5;
                c.strokeRect(x, row * PLANK, 256, PLANK);
            }
        }
        texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        return texture;
    };
})();

const instanced = (geometry, mat, items, parent) => {
    const mesh = new THREE.InstancedMesh(geometry, mat, items.length);
    items.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
};

const UP = new THREE.Vector3(0, 1, 0);
const planAngle = () => {
    const [rx, rz] = planRight();
    return Math.atan2(-rz, rx);
};
/** A box lying on the plan: px centre and size in plan pixels, height and lift in metres. */
const boxMatrix = (x, y, w, h, height, lift = 0, angle = 0) => {
    const [fx, fz] = flatAt([x, y]);
    return new THREE.Matrix4().compose(new THREE.Vector3(fx, lift + height / 2, fz), new THREE.Quaternion().setFromAxisAngle(UP, planAngle() + angle), new THREE.Vector3(w * metresPerPixel(STEP_PX, 0), height, h * metresPerPixel(0, STEP_PX)));
};
const segmentMatrix = ([x1, y1, x2, y2], thickness, height, lift = 0) => {
    const [ax, az] = flatAt([x1, y1]);
    const [bx, bz] = flatAt([x2, y2]);
    return new THREE.Matrix4().compose(new THREE.Vector3((ax + bx) / 2, lift + height / 2, (az + bz) / 2), new THREE.Quaternion().setFromAxisAngle(UP, Math.atan2(-(bz - az), bx - ax)), new THREE.Vector3(Math.hypot(bx - ax, bz - az) + thickness, height, thickness));
};

const clearRoomPins = () => {
    for (let i = pins.length - 1; i >= 0; i--) {
        if (pins[i].kind === 'room') {
            pins[i].node.remove();
            pins.splice(i, 1);
        }
    }
};

const roomPin = (key, label, position, onClick, free) => {
    const node = el('button', { type: 'button', className: `pin pin-room${free ? ' is-free' : ''}`, textContent: label });
    node.addEventListener('click', onClick);
    node.addEventListener('pointerenter', () => setHover(key));
    node.addEventListener('pointerleave', () => setHover(null));
    $('pins').append(node);
    pins.push({ key, kind: 'room', node, position: new THREE.Vector3(...position), visible: true });
};

const buildFurniture = (group, plan) => {
    const by = (type) => plan.furniture.filter((f) => f.t === type);
    const top = material(0xf3efe6);
    const dark = material(0x22343a);
    const fabric = material(0x0f5564);
    const ceramic = material(0xf7f7f4);
    const leaf = new THREE.MeshStandardMaterial({ color: 0x3f7d55, roughness: 1, flatShading: true });
    const desks = by('desk');
    if (desks.length) {
        instanced(new THREE.BoxGeometry(1, 1, 1), top, desks.map((d) => boxMatrix(d.x, d.y, d.w, d.h, 0.05, 0.72)), group);
        instanced(new THREE.BoxGeometry(1, 1, 1), dark, desks.flatMap((d) => [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]].map(([ox, oy]) => boxMatrix(d.x + d.w * ox, d.y + d.h * oy, 3, 3, 0.72))), group);
    }
    const chairs = by('chair');
    if (chairs.length) {
        instanced(new THREE.BoxGeometry(1, 1, 1), fabric, chairs.map((c) => boxMatrix(c.x, c.y, 22, 22, 0.08, 0.42)), group);
        instanced(new THREE.BoxGeometry(1, 1, 1), dark, chairs.map((c) => boxMatrix(c.x, c.y, 4, 4, 0.42)), group);
        instanced(new THREE.BoxGeometry(1, 1, 1), fabric, chairs.map((c) => {
            const rad = (c.a * Math.PI) / 180;
            return boxMatrix(c.x + Math.sin(rad) * 10, c.y + Math.cos(rad) * 10, Math.abs(Math.cos(rad)) * 22 + 4, Math.abs(Math.sin(rad)) * 22 + 4, 0.42, 0.5);
        }), group);
    }
    const ovals = by('oval');
    if (ovals.length) {
        instanced(new THREE.CylinderGeometry(0.5, 0.5, 1, 40), top, ovals.map((o) => {
            const [fx, fz] = flatAt([o.x, o.y]);
            return new THREE.Matrix4().compose(new THREE.Vector3(fx, 0.75, fz), new THREE.Quaternion().setFromAxisAngle(UP, planAngle()), new THREE.Vector3(o.w * metresPerPixel(STEP_PX, 0), 0.05, o.h * metresPerPixel(0, STEP_PX)));
        }), group);
        instanced(new THREE.BoxGeometry(1, 1, 1), dark, ovals.map((o) => boxMatrix(o.x, o.y, 8, 40, 0.72)), group);
    }
    const cabinets = by('cabinet');
    if (cabinets.length) instanced(new THREE.BoxGeometry(1, 1, 1), material(0xddd5c4), cabinets.map((c) => boxMatrix(c.x, c.y, c.w, c.h, 1.5)), group);
    const plants = by('plant');
    if (plants.length) {
        instanced(new THREE.CylinderGeometry(0.2, 0.15, 0.36, 14), material(0xb9694a), plants.map((p) => boxMatrixAt(p, 0.18)), group);
        instanced(new THREE.IcosahedronGeometry(0.42, 1), leaf, plants.map((p) => boxMatrixAt(p, 0.78)), group);
    }
    const wcs = by('wc');
    if (wcs.length) instanced(new THREE.BoxGeometry(1, 1, 1), ceramic, wcs.map((w) => boxMatrix(w.x, w.y, 18, 28, 0.42)), group);
    const sinks = by('sink');
    if (sinks.length) instanced(new THREE.BoxGeometry(1, 1, 1), ceramic, sinks.map((s) => boxMatrix(s.x, s.y, 16, 24, 0.12, 0.78)), group);
};
const boxMatrixAt = (p, y) => {
    const [fx, fz] = flatAt([p.x, p.y]);
    return new THREE.Matrix4().makeTranslation(fx, y, fz);
};

/** One floor's rooms in 3D. The walls and furniture sit in `inner`, which grows out of the floor. */
const buildPlate = (floor) => {
    const y = floorBase(floor.level);
    const group = new THREE.Group();
    group.position.y = y;
    const inner = new THREE.Group();
    group.add(inner);
    const plate = new THREE.Mesh(planGeometry(PLAN_OUTLINE_PX, 0.06), material(0xc7c2b6));
    plate.receiveShadow = true;
    group.add(plate);
    const plan = PLANS3D[floor.level];
    const wallMat = material(0xf6f2e9);
    const walls = plan ? plan.walls : OUTER_WALLS;
    const THICK = 0.2;
    instanced(new THREE.BoxGeometry(1, 1, 1), wallMat, walls.map((w) => segmentMatrix(w, THICK, WALL_HEIGHT)), inner);
    if (plan) {
        instanced(new THREE.BoxGeometry(1, 1, 1), wallMat, plan.windows.map((w) => segmentMatrix(w, THICK, SILL)), inner);
        instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xbfe0e6, transparent: true, opacity: 0.4, roughness: 0.2 }), plan.windows.map((w) => segmentMatrix(w, 0.05, WALL_HEIGHT - SILL, SILL)), inner).castShadow = false;
        buildFurniture(inner, plan);
    }
    const wood = material(0xffffff, { map: woodTexture() });
    for (const room of floor.rooms) {
        const free = room.status === 'volno';
        const floorMesh = new THREE.Mesh(planGeometry(room.shape, 0.09), wood);
        floorMesh.receiveShadow = true;
        group.add(floorMesh);
        const tint = new THREE.Mesh(planGeometry(room.shape, 0.11), new THREE.MeshBasicMaterial({ color: free ? COLORS.free : COLORS.taken, transparent: true, opacity: free ? 0.3 : 0.34, side: THREE.DoubleSide, depthWrite: false }));
        tint.renderOrder = 3;
        tint.userData = { room, key: `room-${room.id}`, base: free ? 0.3 : 0.34 };
        group.add(tint);
    }
    // every material may fade, so all are transparent from the start; at full opacity they draw as before
    group.traverse((node) => {
        if (!node.material) return;
        node.material = node.material.clone();
        node.material.transparent = true;
        node.material.userData.base = node.material.opacity;
    });
    group.userData.inner = inner;
    inner.scale.y = 0.001;
    scene.add(group);
    return group;
};

const fadePlate = (group, amount) => {
    group.traverse((node) => {
        if (!node.material) return;
        node.material.opacity = node.material.userData.base * amount;
    });
    group.visible = amount > 0.01;
};

const dropPlate = (group) => {
    scene.remove(group);
    group.traverse((node) => node.material?.dispose());
};

const buildRoomPins = (floor) => {
    clearRoomPins();
    const y = floorBase(floor.level);
    for (const room of floor.rooms) {
        const cx = room.shape.reduce((s, p) => s + p[0], 0) / room.shape.length;
        const cy = room.shape.reduce((s, p) => s + p[1], 0) / room.shape.length;
        const [x, z] = pxToFlat([cx, cy]);
        roomPin(`room-${room.id}`, room.id, [x, y + 1.3, z], () => pickRoom(room), room.status === 'volno');
    }
    updatePinSet();
};

/* small timeline: each animation runs once with an eased 0..1, and finishing early jumps to its end */
const smooth = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const animations = new Set();
const animate = (ms, step, done) => {
    animations.add({ start: performance.now(), ms: reducedMotion ? 1 : ms, step, done });
};
const runAnimations = (now) => {
    for (const anim of [...animations]) {
        const p = Math.min(1, (now - anim.start) / anim.ms);
        anim.step(smooth(p));
        if (p === 1) {
            animations.delete(anim);
            anim.done?.();
        }
    }
    if (animations.size) needsRender = true;
};
const finishAnimations = () => {
    for (let guard = 0; animations.size && guard < 8; guard++) {
        for (const anim of [...animations]) {
            animations.delete(anim);
            anim.step(1);
            anim.done?.();
        }
    }
};

const setCut = (y) => {
    lowPlane.constant = y;
    needsRender = true;
};

/** From the closed building: everything above the floor lifts off and leaves, the rooms grow in its place. */
const openFresh = (level) => {
    const cut = floorBase(level) + 0.04;
    reveal.level = level;
    reveal.cut = cut;
    setCut(cut);
    reveal.high.forEach((mesh) => {
        mesh.visible = true;
        mesh.position.y = 0;
    });
    highPlane.constant = -cut;
    if (!reveal.ceiling) {
        reveal.ceiling = new THREE.Mesh(planGeometry(PLAN_OUTLINE_PX, 0), material(0xdcd6c9));
        reveal.ceiling.castShadow = true;
        scene.add(reveal.ceiling);
    }
    reveal.ceiling.visible = true;
    const group = buildPlate(floorAt(level));
    reveal.plate = group;
    buildRoomPins(floorAt(level));
    applyColors();
    animate(OPEN_MS, (e) => {
        const lift = LIFT * e;
        highPlane.constant = -(cut + lift);
        reveal.high.forEach((mesh) => { mesh.position.y = lift; });
        reveal.ceiling.position.y = cut + lift - 0.03;
        group.userData.inner.scale.y = Math.max(0.001, e);
    }, () => {
        // out of sight now: hidden, so nothing hangs over the opened floor
        reveal.high.forEach((mesh) => { mesh.visible = false; });
        reveal.ceiling.visible = false;
    });
};

/** One floor to another: only the storey between them goes or comes back; the roof stays away. */
const switchFloor = (level) => {
    const from = reveal.level;
    const fromCut = reveal.cut;
    const toCut = floorBase(level) + 0.04;
    const outgoing = reveal.plate;
    const incoming = buildPlate(floorAt(level));
    reveal.level = level;
    reveal.cut = toCut;
    reveal.plate = incoming;
    buildRoomPins(floorAt(level));
    applyColors();
    if (level < from) {
        // going down: the floor we were on flies up and fades, and its storey's shell is cut away beneath it
        animate(FLOOR_SWITCH_MS, (e) => {
            setCut(fromCut + (toCut - fromCut) * e);
            outgoing.position.y = floorBase(from) + SWITCH_LIFT * e;
            fadePlate(outgoing, 1 - e);
            incoming.userData.inner.scale.y = Math.max(0.001, e);
        }, () => dropPlate(outgoing));
    } else {
        // going up: the shell grows back under the floor above, which settles in from where it flew
        incoming.userData.inner.scale.y = 1;
        animate(FLOOR_SWITCH_MS, (e) => {
            setCut(fromCut + (toCut - fromCut) * e);
            outgoing.userData.inner.scale.y = Math.max(0.001, 1 - e);
            fadePlate(outgoing, 1 - e);
            incoming.position.y = floorBase(level) + SWITCH_LIFT * (1 - e);
            fadePlate(incoming, e);
        }, () => dropPlate(outgoing));
    }
};

const openReveal = (level) => {
    finishAnimations();
    if (reveal.plate && reveal.level !== level) switchFloor(level);
    else if (!reveal.plate) openFresh(level);
};

/** Back to the whole building: it grows up again from the cut, the roof last. */
const closeReveal = () => {
    finishAnimations();
    clearRoomPins();
    const group = reveal.plate;
    if (!group) return;
    const from = reveal.cut;
    const top = manifest.floors.eave + ROOF_CLEAR;
    reveal.high.forEach((mesh) => {
        mesh.visible = false;
        mesh.position.y = 0;
    });
    animate(CLOSE_MS, (e) => {
        setCut(from + (top - from) * e);
        group.userData.inner.scale.y = Math.max(0.001, 1 - e);
        fadePlate(group, 1 - e);
    }, () => {
        setCut(1e4);
        dropPlate(group);
        if (reveal.plate === group) reveal.plate = null;
        reveal.level = null;
    });
};

const pickRoom = (room, push = true) => {
    pickedRoom = room;
    renderFloorPanel();
    applyColors();
    renderCrumbs();
    if (push) remember();
    if (isNarrow() && room) panel.scrollIntoView({ block: 'start' });
};

/* ---------- pins ---------- */

const pinAt = (key, label, position, onClick, kind = 'zone') => {
    const node = el('button', { type: 'button', className: `pin${kind === 'transit' ? ' pin-transit' : ''}`, textContent: label });
    node.addEventListener('click', onClick);
    node.addEventListener('pointerenter', () => setHover(key));
    node.addEventListener('pointerleave', () => setHover(null));
    node.addEventListener('focus', () => setHover(key));
    node.addEventListener('blur', () => setHover(null));
    $('pins').append(node);
    return { key, kind, node, position: new THREE.Vector3(...position) };
};

const buildFloorPins = () => {
    const height = floorHeight();
    // on the wall the floors view faces, clear of the staircase
    const [x, z] = pxToFlat([300, 712]);
    for (const floor of FLOORS) {
        const pin = pinAt(`floor-${floor.level}`, String(floor.level), [x, floorBase(floor.level) + height * 0.5, z], () => openFloor(floor.level), 'floor');
        pin.level = floor.level;
        pin.node.classList.add('pin-storey');
        pin.node.setAttribute('aria-label', floor.label);
        pin.node.addEventListener('pointerenter', () => setActiveLevel(floor.level));
        pins.push(pin);
    }
};

const buildPins = () => {
    buildFloorPins();
    const { anchors } = manifest;
    for (const [key, zone] of Object.entries(ZONES)) {
        const a = anchors[key];
        if (!a) continue;
        const label = isNarrow() && zone.short ? zone.short : zone.title;
        pins.push(pinAt(key, label, [a[0], a[1] + 2, a[2]], () => goTo(key === 'kancelare' ? 'floors' : key)));
    }
    pins.push(pinAt('doprava', isNarrow() ? 'Autobusy' : 'Autobusy a trolejbusy', anchors.bus, () => goTo('doprava'), 'transit'));
    const tram = pinAt('doprava', 'Tramvaje', anchors.tram, () => goTo('doprava'), 'transit');
    tram.transportOnly = true;
    pins.push(tram);
    for (const street of manifest.streets) {
        const node = el('span', { className: 'street-label', textContent: street.name });
        $('pins').append(node);
        pins.push({ key: null, kind: 'street', node, position: new THREE.Vector3(...street.at) });
    }
    updatePinSet();
};

const updatePinSet = () => {
    for (const pin of pins) {
        if (pin.kind === 'room') pin.visible = mode === 'floor';
        else if (pin.kind === 'floor') pin.visible = mode === 'floors';
        else if (mode === 'overview') pin.visible = !pin.transportOnly && !(pin.kind === 'street' && isNarrow());
        else pin.visible = mode === 'doprava' && (pin.kind === 'transit' || pin.kind === 'street');
    }
    if (walker) walker.visible = mode === 'doprava' && !reducedMotion;
    needsRender = true;
};

const STREET_LABEL_DISTANCE = 130;
const projected = new THREE.Vector3();
const placePins = () => {
    const { clientWidth: w, clientHeight: h } = renderer.domElement;
    // the panel lies over the model's left side on a wide screen, and a pin must not sit in its text
    const clearOf = isNarrow() ? 0 : panel.getBoundingClientRect().right + 8;
    for (const pin of pins) {
        // street names have no way of hiding behind a building, so they leave when the view comes close
        if (!pin.visible || (pin.kind === 'street' && camera.position.distanceTo(controls.target) < STREET_LABEL_DISTANCE)) {
            pin.node.style.display = 'none';
            continue;
        }
        projected.copy(pin.position).project(camera);
        const x = (projected.x * 0.5 + 0.5) * w;
        const y = (-projected.y * 0.5 + 0.5) * h;
        pin.node.style.display = x < clearOf ? 'none' : '';
        pin.node.style.transform = pin.kind === 'room' || pin.kind === 'floor' ? `translate(calc(${x.toFixed(1)}px - 50%), calc(${y.toFixed(1)}px - 50%))` : `translate(calc(${x.toFixed(1)}px - 50%), calc(${y.toFixed(1)}px - 100%))`;
    }
};

/* ---------- moving between views ---------- */

const applyColors = () => {
    const opened = mode === 'floors' || mode === 'floor' || mode === 'gym';
    const focused = mode !== 'overview' && mode !== 'doprava';
    for (const [key, parts] of Object.entries(zoneMeshes)) {
        const lit = hovered === key || mode === key;
        if (parts.overlay) {
            parts.overlay.material.opacity = lit ? 0.5 : 0;
            continue;
        }
        if (parts.slab) {
            parts.slab.material[0].color.setHex(lit ? COLORS.stoneHover : COLORS.stone);
            continue;
        }
        const isOffice = key === 'kancelare';
        // the hall houses the restaurant, so it answers to the restaurant's name
        const hallLit = key === 'hall' && (hovered === 'restaurace' || mode === 'restaurace');
        for (const mesh of parts.meshes) {
            mesh.material.userData.uHover.target = (lit && !opened && mode !== key) || (hallLit && mode !== 'restaurace') ? 1 : 0;
            mesh.material.color.setHex(focused && !lit && !hallLit && !(isOffice && opened) ? COLORS.dim : COLORS.plain);
        }
    }
    levelTarget.on = mode === 'floors' || mode === 'gym' ? 1 : 0;
    if (mode === 'gym') levelTarget.level = 1;
    else if (mode === 'floors') levelTarget.level = activeLevel;
    for (const mesh of reveal.plate?.children ?? []) {
        if (!mesh.userData.room) continue;
        const on = hovered === mesh.userData.key || pickedRoom === mesh.userData.room;
        mesh.material.opacity = on ? 0.68 : mesh.userData.base;
    }
    for (const pin of pins) {
        if (pin.kind === 'floor') pin.node.classList.toggle('is-active', pin.level === activeLevel);
        else if (pin.kind === 'room') pin.node.classList.toggle('is-active', hovered === pin.key || pin.key === `room-${pickedRoom?.id}`);
        else pin.node.classList.toggle('is-active', hovered === pin.key);
    }
    for (const b of panel.querySelectorAll('.room-list button')) b.classList.toggle('is-active', hovered === `room-${b.dataset.room}`);
    for (const shape of planCard?.querySelectorAll('[data-room]') ?? []) {
        shape.classList.toggle('is-hover', hovered === `room-${shape.dataset.room}`);
        shape.classList.toggle('is-picked', pickedRoom?.id === shape.dataset.room);
    }
    const status = planCard?.querySelector('.plan-card-status');
    if (status) {
        const room = floorAt(+planCard.dataset.level).rooms.find((r) => hovered === `room-${r.id}`) ?? pickedRoom;
        status.textContent = room ? `${room.id} · ≈ ${String(room.area).replace('.', ',')} m² · ${room.status}` : 'Vyberte kancelář';
    }
    needsRender = true;
};

const setHover = (key) => {
    if (hovered === key) return;
    hovered = key;
    document.body.classList.toggle('is-hovering', !!key);
    if (scene) applyColors();
    if (!key) $('tip').hidden = true;
};

const goTo = (next, push = true) => {
    const wasOpen = mode === 'floor';
    const opens = next === 'floor';
    mode = next;
    pickedRoom = null;
    dialNode = null;
    setHover(null);
    removeGymSheet();
    if (!opens) removePlanCard();
    if (opens) openLevel = activeLevel;
    if (controls) controls.maxPolarAngle = opens ? OPEN_FLOOR_MAX_POLAR : MAX_POLAR;
    if (scene) {
        if (opens) openReveal(activeLevel);
        else if (wasOpen) closeReveal();
    }
    if (next === 'overview') renderOverviewPanel();
    else if (next === 'floors') renderFloorsPanel();
    else if (next === 'floor') {
        renderFloorPanel();
        showPlanCard(floorAt(openLevel));
    }
    else if (next === 'gym') renderGymPanel();
    else renderZonePanel(next);
    if (scene) {
        applyColors();
        updatePinSet();
        flyTo(fitted(viewOf(next)), wasOpen && !opens ? 1000 : 1500);
    }
    renderCrumbs();
    if (push) remember();
    if (isNarrow() && next !== 'overview') $('stage').scrollIntoView({ block: 'start' });
};

const pick = (event) => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    if (mode === 'floor') {
        const rooms = (reveal.plate?.children ?? []).filter((m) => m.userData.room);
        const hit = raycaster.intersectObjects(rooms)[0];
        return hit ? hit.object.userData.key : null;
    }
    if (mode === 'floors') {
        const hit = raycaster.intersectObjects(zoneMeshes.kancelare.meshes)[0];
        if (!hit) return null;
        const level = Math.floor((hit.point.y - manifest.floors.base) / floorHeight()) + 1;
        return level >= 1 && level <= 4 ? `floor-${level}` : null;
    }
    if (mode !== 'overview') return null;
    const hit = raycaster.intersectObjects(pickable)[0];
    return hit ? hit.object.userData.zone : null;
};

const showTip = (key, event) => {
    const tip = $('tip');
    const zone = ZONES[key];
    let title = zone?.title;
    let text = zone?.hint;
    if (key?.startsWith('room-')) {
        const room = floorAt(openLevel).rooms.find((r) => `room-${r.id}` === key);
        title = `Kancelář ${room.id}`;
        text = `≈ ${String(room.area).replace('.', ',')} m² · ${room.status}`;
    }
    if (!title) {
        tip.hidden = true;
        return;
    }
    tip.replaceChildren(el('strong', { textContent: title }), el('span', { textContent: text }));
    tip.hidden = false;
    const rect = $('stage').getBoundingClientRect();
    tip.style.transform = `translate(${event.clientX - rect.left + 16}px, ${event.clientY - rect.top + 14}px)`;
};

/* ---------- the light: a golden morning or a blue dusk ---------- */

const skyTexture = (stops) => {
    const canvas = el('canvas', { width: 4, height: 512 });
    const c = canvas.getContext('2d');
    const g = c.createLinearGradient(0, 0, 0, 512);
    stops.forEach((stop, i) => g.addColorStop(i / (stops.length - 1), stop));
    c.fillStyle = g;
    c.fillRect(0, 0, 4, 512);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
};

const applyTheme = () => {
    const t = THEMES[themeName];
    scene.background?.dispose?.();
    scene.background = skyTexture(t.sky);
    scene.fog.color.setHex(t.fog);
    scene.fog.near = t.fogNear;
    scene.fog.far = t.fogFar;
    themed.hemi.color.setHex(t.hemi[0]);
    themed.hemi.groundColor.setHex(t.hemi[1]);
    themed.hemi.intensity = t.hemi[2];
    themed.sun.color.setHex(t.sun[0]);
    themed.sun.intensity = t.sun[1];
    themed.sun.position.set(...t.sun[2]);
    themed.contextWall.material.color.setHex(t.contextWall);
    themed.contextRoof.material.color.setHex(t.contextRoof);
    themed.trees.material.color.setRGB(...t.tree);
    themed.route.material.color.setHex(t.route);
    themed.bulbs.material.color.setHex(t.bulbs);
    themed.band.material.emissiveIntensity = t.band;
    for (const sprite of themed.glows) sprite.material.opacity = sprite.userData.opacity * t.sprites;
    shared.uGlow.value = t.glow;
    COLORS.dim = t.dim;
    const old = themed.ground.material.map;
    themed.ground.material.map = paintMap(themed.mapSize);
    old.dispose();
    themed.ground.material.needsUpdate = true;
    applyColors();
};

const SWITCH_MS = 320;
const setTheme = (name) => {
    if (name === themeName) return;
    themeName = name;
    document.body.dataset.theme = name;
    try {
        localStorage.setItem(THEME_KEY, name);
    } catch {
        // the choice just won't be remembered
    }
    for (const b of document.querySelectorAll('[data-theme-set]')) b.setAttribute('aria-pressed', String(b.dataset.themeSet === name));
    if (!scene) return;
    const canvas = $('scene');
    canvas.classList.add('is-switching');
    setTimeout(() => {
        applyTheme();
        canvas.classList.remove('is-switching');
    }, reducedMotion ? 0 : SWITCH_MS);
};
for (const b of document.querySelectorAll('[data-theme-set]')) {
    b.setAttribute('aria-pressed', String(b.dataset.themeSet === themeName));
    b.addEventListener('click', () => setTheme(b.dataset.themeSet));
}

/* ---------- start ---------- */

const initScene = async () => {
    const canvas = $('scene');
    const [json, bin, gym] = await Promise.all([fetch('model.json').then((r) => r.json()), fetch('model.bin').then((r) => r.arrayBuffer()), fetch('gym/plan.json').then((r) => r.json()).catch(() => null)]);
    manifest = json;
    gymData = gym;
    const buffer = new Float32Array(bin);
    const { start, grid } = manifest.ground;
    groundHeights = buffer.subarray(start, start + grid * grid);

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.localClippingEnabled = true;

    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(COLORS.sky, 280, 500);

    camera = new THREE.PerspectiveCamera(32, 1, 1, 1200);
    const start3 = fitted(viewOf('overview'));
    const swoop = start3.pos.map((n, i) => start3.target[i] + (n - start3.target[i]) * 1.5);
    camera.position.set(...(reducedMotion ? start3.pos : swoop));

    controls = new OrbitControls(camera, canvas);
    controls.target.set(...start3.target);
    controls.enableDamping = !reducedMotion;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.enableZoom = true;
    controls.zoomToCursor = true;
    controls.zoomSpeed = 0.9;
    controls.minDistance = 22;
    controls.maxDistance = 430;
    controls.minPolarAngle = 0.2;
    controls.maxPolarAngle = MAX_POLAR;
    controls.addEventListener('change', () => { needsRender = true; });
    controls.addEventListener('start', () => { flight = null; });

    // the last warm light of the day from the south-west, under a petrol sky
    themed.hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 1);
    scene.add(themed.hemi);
    const sun = new THREE.DirectionalLight(0xfff0dc, 2.3);
    themed.sun = sun;
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    Object.assign(sun.shadow.camera, { left: -220, right: 220, top: 220, bottom: -220, far: 620 });
    // no normalBias: the source's faces wind both ways, and it would push half of them into their own shadow
    sun.shadow.bias = -0.0035;
    sun.shadow.radius = 5;
    scene.add(sun);

    addGround();
    themed.contextWall = addMesh(buffer, 'okoli_steny', COLORS.contextWall);
    themed.contextRoof = addMesh(buffer, 'okoli_strechy', COLORS.contextRoof);
    shared.uFloorBase.value = manifest.floors.base;
    shared.uFloorHeight.value = floorHeight();
    // walls drawn from the photos where there is a photo, and the procedural surfaces on what remains
    const zoneParts = { hall: [addMesh(buffer, 'hlavni_steny'), addMesh(buffer, 'hlavni_strechy')], sal: [addMesh(buffer, 'sal_steny'), addMesh(buffer, 'sal_strechy')], kancelare: [addMesh(buffer, 'kancelare_steny'), addMesh(buffer, 'kancelare_strechy')] };
    await document.fonts.load('600 40px "Work Sans"').catch(() => {}); // the banner's lettering
    for (const [name, spec] of Object.entries(manifest.facades)) {
        const wall = paintFacade(name, spec);
        const mesh = new THREE.Mesh(facadeGeometry(buffer, spec), facadeMaterial(wall, spec.zone === 'kancelare'));
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.wall = wall;
        scene.add(mesh);
        zoneParts[spec.zone].push(mesh);
        if (wall.parts.length) {
            const relief = new THREE.Mesh(reliefGeometry(wall, spec), reliefMaterial(spec.zone === 'kancelare'));
            relief.castShadow = true;
            relief.receiveShadow = true;
            relief.userData.relief = true;
            scene.add(relief);
            zoneParts[spec.zone].push(relief);
        }
    }
    for (const [zone, meshes] of Object.entries(zoneParts)) zoneMeshes[zone] = { meshes };

    // the same building twice: the part below the cut, and the part above it that lifts off
    const clipped = (mesh, plane) => {
        mesh.material.clippingPlanes = [plane];
        mesh.material.clipShadows = true;
    };
    reveal.high = zoneMeshes.kancelare.meshes.map((source) => {
        const lifted = () => {
            if (source.userData.relief) return reliefMaterial(true);
            return source.userData.wall ? facadeMaterial(source.userData.wall, true) : painted();
        };
        const mesh = new THREE.Mesh(source.geometry, lifted());
        clipped(mesh, highPlane);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.visible = false;
        scene.add(mesh);
        return mesh;
    });
    zoneMeshes.kancelare.meshes.forEach((mesh) => clipped(mesh, lowPlane));
    for (const [zone, pickZone] of [['kancelare', 'kancelare'], ['sal', 'sal'], ['hall', 'restaurace']]) {
        for (const mesh of zoneMeshes[zone].meshes) {
            mesh.userData.zone = pickZone;
            pickable.push(mesh);
            hoverables.push(mesh.material.userData.uHover);
        }
    }

    // the gym is reachable straight from the overview: an invisible volume of the ground floor
    const gymShape = new THREE.Shape(PLAN_OUTLINE_PX.map((p) => {
        const [x, z] = pxToFlat(p);
        return new THREE.Vector2(x, -z);
    }));
    const gymVolume = new THREE.ExtrudeGeometry(gymShape, { depth: floorHeight(), bevelEnabled: false });
    gymVolume.rotateX(-Math.PI / 2);
    const gymHit = new THREE.Mesh(gymVolume, new THREE.MeshBasicMaterial());
    gymHit.position.y = floorBase(1) + 0.3;
    gymHit.visible = false;
    gymHit.userData.zone = 'gym';
    pickable.unshift(gymHit);

    addOverlay('parkoviste', manifest.map.parking, manifest.levels.parking, 0.3);
    addTerrace();
    addPerimeter();
    addCars();
    addTrees();
    addRoute();
    buildPins();
    applyTheme();

    const resize = () => {
        const stage = $('stage');
        const width = stage.clientWidth;
        const height = stage.clientHeight;
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.fov = width / height < 0.9 ? 48 : 32;
        frameView();
        camera.updateProjectionMatrix();
        needsRender = true;
    };
    window.addEventListener('resize', resize);
    resize();

    let down = null;
    canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
    canvas.addEventListener('pointermove', (e) => {
        if (e.pointerType !== 'mouse' || e.buttons) return;
        const key = pick(e);
        if (key?.startsWith('floor-')) {
            setActiveLevel(+key.slice(6));
            document.body.classList.add('is-hovering');
            return;
        }
        if (mode === 'gym') return;
        if (mode === 'floors') document.body.classList.remove('is-hovering');
        setHover(key);
        if (key) showTip(key, e);
    });
    canvas.addEventListener('pointerleave', () => setHover(null));
    canvas.addEventListener('click', (e) => {
        if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
        const key = pick(e);
        if (!key) return;
        if (key.startsWith('floor-')) {
            const level = +key.slice(6);
            if (e.pointerType === 'mouse' || level === activeLevel) openFloor(level);
            else setActiveLevel(level);
        } else if (key.startsWith('room-')) pickRoom(floorAt(openLevel).rooms.find((r) => `room-${r.id}` === key));
        else goTo(key === 'kancelare' ? 'floors' : key);
    });
    window.addEventListener('keydown', (e) => {
        if (tourDialog.open || e.target.closest?.('input, textarea')) return;
        if (e.key === 'Escape') {
            if (mode === 'floor' && pickedRoom) pickRoom(null);
            else if (mode === 'floor' || mode === 'gym') goTo('floors');
            else if (mode !== 'overview') goTo('overview');
        } else if (mode === 'floors' && e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveLevel(activeLevel + 1);
        } else if (mode === 'floors' && e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveLevel(activeLevel - 1);
        } else if (mode === 'floors' && e.key === 'Enter' && e.target === document.body) openFloor(activeLevel);
    });

    const ease = smooth;
    let last = performance.now();
    const frame = (now) => {
        requestAnimationFrame(frame);
        const dt = Math.min(64, now - last);
        last = now;
        if (flight) {
            const t = Math.min(1, (now - flight.start) / flight.ms);
            camera.position.lerpVectors(flight.from.pos, flight.to.pos, ease(t));
            controls.target.lerpVectors(flight.from.target, flight.to.target, ease(t));
            needsRender = true;
            if (t === 1) flight = null;
        }
        controls.update();
        runAnimations(now);
        const k = reducedMotion ? 1 : 1 - Math.exp(-dt / 130);
        for (const [uniform, target] of [[shared.uLevel, levelTarget.level], [shared.uLevelOn, levelTarget.on]]) {
            if (Math.abs(uniform.value - target) > 0.002) {
                uniform.value += (target - uniform.value) * k;
                needsRender = true;
            } else uniform.value = target;
        }
        for (const uniform of hoverables) {
            const target = uniform.target ?? 0;
            if (Math.abs(uniform.value - target) > 0.004) {
                uniform.value += (target - uniform.value) * k;
                needsRender = true;
            } else uniform.value = target;
        }
        if (walker.visible) {
            stepWalker(now);
            needsRender = true;
        }
        if (!needsRender || document.hidden) return;
        needsRender = false;
        renderer.render(scene, camera);
        placePins();
    };
    requestAnimationFrame(frame);
    canvas.classList.add('is-ready');
    if (!reducedMotion) flight = { start: performance.now(), ms: 2600, from: { pos: camera.position.clone(), target: controls.target.clone() }, to: { pos: new THREE.Vector3(...start3.pos), target: new THREE.Vector3(...start3.target) } };
    setTimeout(() => $('pins').classList.add('is-ready'), reducedMotion ? 0 : 1100);
    // coming back from a floor's page, to that floor
    // a shared link or a floor's page leads straight to its view
    if (location.hash) setTimeout(() => route(location.hash), reducedMotion ? 0 : 400);
    window.__sladovna = { setTheme, camera, controls, renderer, scene, setHover, goTo, openFloor, setActiveLevel, pins, reveal };
};

/* ---------- 3D tour ---------- */

const tourDialog = $('tour');
const COVER_AFTER_LOAD_MS = 500;

const openTour = (tour) => {
    setHover(null);
    // the viewer starts loading at once
    const frame = el('iframe', { title: `3D prohlídka: ${tour.title}`, allow: 'fullscreen; xr-spatial-tracking; gyroscope; accelerometer' });
    frame.src = `${VIEWER_URL}${encodeURIComponent(tour.id)}`;
    $('tourFrame').replaceChildren(frame);
    $('tourPoster').src = tour.poster ?? '';
    $('tourTitle').textContent = tour.title;
    $('tourNote').textContent = 'Vstupujeme dovnitř';
    $('tourCover').classList.remove('is-done');
    frame.addEventListener('load', () => {
        setTimeout(() => $('tourCover').classList.add('is-done'), COVER_AFTER_LOAD_MS);
    });
    tourDialog.showModal();
};

$('tourClose').addEventListener('click', () => tourDialog.close());
tourDialog.addEventListener('close', () => {
    $('tourFrame').replaceChildren(); // stops the download and the viewer's rendering
});

/* ---------- page ---------- */

const initPage = () => {
    const gallery = $('gallery');
    fetch('model.json').then((r) => r.json()).then(({ photos }) => {
        const offices = photos.filter((src) => /DSC_/.test(src)).slice(0, 9);
        // the second photo, with a furnished desk, makes the better large picture
        offices.splice(0, 2, offices[1], offices[0]);
        gallery.append(...offices.map((src, i) => el('img', { src, alt: `Stará Sladovna, fotografie ${i + 1}`, loading: 'lazy' })));
    });
    $('contactName').textContent = CONTACT.name;
    $('contactLinks').append(
        el('a', { href: `tel:${CONTACT.phone.replace(/\s/g, '')}`, textContent: CONTACT.phone }),
        el('a', { href: `mailto:${CONTACT.email}`, textContent: CONTACT.email }),
        el('a', { href: CONTACT.profile, textContent: 'Profil makléře' })
    );
    $('planLinks').append(...[...FLOORS].reverse().map((floor) => el('li', {}, el('a', { href: floorPage(floor.level) }, el('strong', { textContent: floor.label }), el('span', { textContent: floor.unavailable ? UNAVAILABLE : floor.gym ? GYM.title : floor.area ? `Celé patro ${floor.area}` : 'Kanceláře' })))));
    $('mainForm').replaceWith(Object.assign(inquiryForm(''), { id: 'mainForm' }));
};

initPage();
renderOverviewPanel();
initScene().catch((err) => {
    console.error(err);
    $('stageError').hidden = false;
    $('hint').hidden = true;
    for (const id of ['scene', 'pins']) $(id).style.display = 'none';
});
