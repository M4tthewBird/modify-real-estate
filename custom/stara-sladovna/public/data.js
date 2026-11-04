// Everything the page says about the complex lives here, so it can be replaced by the broker's list.
//
// VERIFIED, from the client's listings: address, contact, floor 2 (area, rooms, prices), the floor
// plans and their dimensions, the gym, hall and parking as parts of the complex.
// FROM A PUBLIC LISTING, worth confirming: the restaurant's address and garden capacity.
// SAMPLE, until the broker's list arrives: room numbers, each room's "status", and the areas, which
// are width x depth read off the floor plans.
//
// Room shapes are polygons in the plan image's pixels at 1400 px wide (viewBox 0 5 1400 990).
// A room with `tour` opens our 3D viewer. Add one as soon as its scan exists:
// tour: { id: 'scene_id_in_the_viewer', title: 'Kancelář 3.04', poster: '/path/to/photo.webp' }

const PHOTOS = '/assets/cdn.prod.website-files.com/66e880572ce68d47a0efdf09';

const rect = (x1, y1, x2, y2) => [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];

export const SAMPLE_DATA = true;

// files next to this script, so a second page elsewhere (the gym in 3D) can use this one's
const here = (path) => new URL(path, import.meta.url).href;

export const floorPage = (level) => here(`patro.html?np=${level}`);

export const VIEWER_URL = 'https://viewer.scanity.cz/?id=';

export const CONTACT = {
    name: 'Michal Kolář',
    phone: '+420 605 749 517',
    email: 'michal.kolar@modifygroup.cz',
    profile: '/makler/michal-kolar',
};

export const GYM = {
    title: 'Privátní gym',
    text: 'Soukromý gym pro jednotlivce v přízemí budovy s kancelářemi, celkem 87,6 m².',
    tour: { id: 'ikka_gym', title: 'Privátní gym', poster: here('gym/04-gym.webp') },
    // Our scan as gaussian splats, already turned to the floor plan's metres (floor at 0, y up): see README.
    // `at` is where the middle of the gym plan sits on the client's office plan in pixels, `turn` turns it there.
    // Where the gym really is on the ground floor is still to be confirmed, these two numbers move it.
    splat: { full: here('gym/gym.sog'), lite: here('gym/gym-lite.sog'), at: [520, 388], turn: 90 },
    // Room names and areas from our floor plan; photo is what opens when the room is picked.
    rooms: [
        { name: 'Gym', area: '44,5 m²', photo: '04-gym' },
        { name: 'Kardio', area: '15,4 m²', photo: '02-kardio' },
        { name: 'Lobby', area: '11,0 m²', photo: '07-lobby' },
        { name: 'Dětský koutek', area: '7,2 m²', photo: '01-detsky-koutek' },
        { name: 'Koupelna', area: '5,3 m²', photo: '08-koupelna' },
        { name: 'Chodba', area: '4,2 m²', photo: '06-chodba' },
    ],
};

export const ZONES = {
    kancelare: {
        title: 'Kanceláře',
        hint: 'Vybrat patro',
    },
    gym: {
        title: GYM.title,
        hint: '3D prohlídka',
    },
    restaurace: {
        title: 'Pivovarská restaurace',
        short: 'Restaurace',
        hint: 'S letní zahrádkou',
        text: 'Pivovarská Starobrno s letní zahrádkou až pro 300 hostů, přímo pod okny kanceláří. Adresa Mendlovo náměstí 158/20.',
        photo: `${PHOTOS}/699db5d9c2c61c4813137cbc_IMG_5583-1024x683.webp`,
        link: { href: 'http://www.pivovarska-starobrno.cz/', label: 'Web restaurace' },
    },
    sal: {
        title: 'Barokní sál',
        short: 'Sál',
        hint: 'Pro vaše akce',
        text: 'Sál se štukovou výzdobou a lustry. Po individuální domluvě ho lze využít pro konference i taneční akce.',
        photo: `${PHOTOS}/699db54cd9500114c3d6046c_DSC_8069-HDR.webp`,
    },
    parkoviste: {
        title: 'Parkování',
        hint: 'Stání v areálu',
        text: 'Vyhrazené parkovací stání ve vnitrobloku lze pronajmout po individuální domluvě.',
    },
    doprava: {
        title: 'Doprava',
        hint: 'Zastávky a cesta pěšky',
        text: 'Přímo před areálem je dopravní uzel Mendlovo náměstí se zastávkami autobusů, trolejbusů a tramvají.',
    },
};

export const FLOORS = [
    { level: 4, label: '4. NP', plan: `${PHOTOS}/69a05439a6957639d0bca44f_4NP_2D.webp`, plan3d: `${PHOTOS}/69a05439cc07f9b3dc222a8b_4NP_3D.webp`, rooms: [
        { id: '4.01', area: 30, status: 'obsazeno', shape: [[158, 90], [362, 90], [362, 338], [300, 338], [300, 440], [148, 440]] },
        { id: '4.02', area: 21, status: 'obsazeno', shape: rect(368, 90, 568, 338) },
        { id: '4.03', area: 19.5, status: 'volno', shape: rect(575, 90, 755, 338) },
        { id: '4.04', area: 21, status: 'volno', shape: rect(762, 90, 958, 338) },
        { id: '4.05', area: 12, status: 'obsazeno', shape: [[965, 90], [1152, 90], [1152, 258], [1060, 258], [1060, 210], [965, 210]] },
        { id: '4.06', area: 22, status: 'volno', shape: [[146, 450], [358, 450], [358, 688], [138, 688]] },
        { id: '4.07', area: 20, status: 'volno', shape: rect(365, 450, 556, 688) },
        { id: '4.08', area: 16.5, status: 'obsazeno', shape: rect(563, 450, 721, 688) },
        { id: '4.09', area: 15.5, status: 'obsazeno', shape: rect(728, 450, 882, 688) },
    ] },
    { level: 3, label: '3. NP', plan: `${PHOTOS}/69a05438af53b88a78dce2e0_3NP_2D.webp`, plan3d: `${PHOTOS}/69a054398d5e9bb17856104e_3NP_3D.webp`, rooms: [
        { id: '3.01', area: 31, status: 'obsazeno', shape: [[152, 90], [348, 90], [348, 342], [290, 348], [290, 488], [140, 488]] },
        { id: '3.02', area: 19.5, status: 'obsazeno', shape: rect(355, 90, 548, 335) },
        { id: '3.03', area: 15.5, status: 'obsazeno', shape: rect(555, 90, 708, 335) },
        { id: '3.04', area: 25.5, status: 'volno', shape: rect(715, 90, 957, 335) },
        { id: '3.05', area: 12, status: 'obsazeno', shape: rect(965, 90, 1160, 255) },
        { id: '3.06', area: 17.5, status: 'volno', shape: [[138, 494], [352, 494], [352, 685], [130, 685]] },
        { id: '3.07', area: 18, status: 'volno', shape: rect(360, 458, 548, 685) },
        { id: '3.08', area: 14, status: 'obsazeno', shape: rect(555, 458, 708, 685) },
        { id: '3.09', area: 15.5, status: 'obsazeno', shape: rect(715, 458, 875, 685) },
    ] },
    // not offered for now: the page only says it is unavailable. Remove `unavailable` to show the floor again.
    { level: 2, label: '2. NP', unavailable: true, area: '247 m²', note: 'Celé patro 247 m², možné pronajmout i po jednotlivých kancelářích. 9 kanceláří, z toho 2 zasedací místnosti, kuchyňka, WC a sklad. Nájem 280 Kč/m²/měsíc a zálohy 120 Kč/m²/měsíc, obojí bez DPH. Bez výtahu.', rooms: [] },
    { level: 1, label: '1. NP', gym: true, rooms: [] },
];
