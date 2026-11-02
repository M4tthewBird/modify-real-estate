import { FLOORS, GYM, SAMPLE_DATA, floorPage } from './data.js';
import { gymPlanSvg } from './gymplan.js';

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...children) => {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...children);
    return node;
};

const level = +new URLSearchParams(location.search).get('np') || 3;
const floor = FLOORS.find((f) => f.level === level) ?? FLOORS[0];
const areaText = (area) => `≈ ${String(area).replace('.', ',')} m²`;

document.title = `${floor.label} | Stará Sladovna | MODIFY real estate`;
$('backLink').href = `./#patro-${floor.level}`;
for (const f of [...FLOORS].reverse()) {
    const link = el('a', { href: floorPage(f.level), textContent: f.label });
    if (f === floor) link.setAttribute('aria-current', 'page');
    $('floorTabs').append(link);
}

const facts = [];
if (floor.unavailable) {
    $('floorTitle').textContent = floor.label;
    $('floorLead').textContent = 'Toto patro není dostupné.';
} else if (floor.gym) {
    $('floorTitle').textContent = `${floor.label}: ${GYM.title}`;
    $('floorLead').textContent = GYM.text;
    facts.push(['Plocha', '87,6 m²'], ['Místností', String(GYM.rooms.length)]);
} else if (floor.rooms.length) {
    const free = floor.rooms.filter((r) => r.status === 'volno').length;
    const total = floor.rooms.reduce((sum, r) => sum + r.area, 0);
    $('floorTitle').textContent = floor.label;
    $('floorLead').textContent = 'Samostatné a nepropojené kanceláře, na patře společná kuchyňka a sociální zařízení.';
    facts.push(['Kanceláří', String(floor.rooms.length)], ['Volných', `${free}${SAMPLE_DATA ? ' (ukázka)' : ''}`], ['Plocha kanceláří', `≈ ${Math.round(total)} m²`], ['Cena', 'na vyžádání']);
} else {
    $('floorTitle').textContent = floor.label;
    $('floorLead').textContent = floor.note;
    facts.push(['Plocha', floor.area]);
}
for (const [term, value] of facts) $('floorFacts').append(el('div', {}, el('dt', { textContent: term }), el('dd', { textContent: value })));

/* ---------- the plan: what to show, small and large ---------- */

const planOpen = $('planOpen');
const large = $('planLarge');
let source = null; // () => a new node of the current view

const show = () => $('planFrame').replaceChildren(source());

const views = [];
if (floor.plan) views.push(['Půdorys', () => el('img', { src: floor.plan, alt: `Půdorys, ${floor.label}` })]);
if (floor.plan3d) views.push(['3D půdorys', () => el('img', { src: floor.plan3d, alt: `3D půdorys, ${floor.label}` })]);

if (views.length) {
    source = views[0][1];
    show();
    if (views.length > 1) {
        $('viewSwitch').hidden = false;
        views.forEach(([label, make], i) => {
            const b = el('button', { type: 'button', textContent: label });
            b.setAttribute('aria-pressed', String(i === 0));
            b.addEventListener('click', () => {
                source = make;
                show();
                for (const other of $('viewSwitch').children) other.setAttribute('aria-pressed', String(other === b));
            });
            $('viewSwitch').append(b);
        });
    }
} else if (floor.gym) {
    const data = await fetch('gym/plan.json').then((r) => r.json());
    source = () => el('span', { className: 'gym-sheet' }, gymPlanSvg(data, GYM.rooms));
    show();
} else {
    planOpen.hidden = true;
    $('floorMissing')?.remove();
    if (!floor.unavailable) planOpen.after(el('p', { className: 'sample-note', textContent: 'Půdorys tohoto patra doplníme.' }));
}

planOpen.addEventListener('click', () => {
    if (!source) return;
    const node = source();
    node.classList.add('plan-large-item');
    $('planLargeScroll').replaceChildren(node);
    large.showModal();
    // an image can go larger than the window, and a click toggles between fit and full size
    if (node.tagName === 'IMG') node.addEventListener('click', () => node.classList.toggle('is-zoomed'));
});
$('planLargeClose').addEventListener('click', () => large.close());
large.addEventListener('click', (e) => {
    if (e.target === large || e.target === $('planLargeScroll')) large.close();
});

/* ---------- rooms ---------- */

if (floor.rooms.length) {
    $('sampleNote').hidden = !SAMPLE_DATA;
    $('roomTable').hidden = false;
    const body = $('roomTable').querySelector('tbody');
    for (const room of floor.rooms) {
        body.append(el('tr', { className: room.status === 'volno' ? 'is-free' : '' },
            el('td', { textContent: room.id }),
            el('td', { textContent: areaText(room.area) }),
            el('td', { textContent: room.status === 'volno' ? 'Volno' : 'Obsazeno' })));
    }
}
