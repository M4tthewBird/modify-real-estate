// The office floors in 3D, traced from the client's floor plans. All numbers are the plan image's
// pixels at 1400 px wide, so they share their transform with the rooms in data.js.
//
// walls: [x1, y1, x2, y2], with gaps left where the plan draws a door
// windows: the same, along the outer wall
// furniture: { t: desk | chair | armchair | oval | plant | cabinet | counter | wc | sink, x, y, w, h, a }, a desk may be wood: true
// kitchen: [x1, y1, x2, y2], where tables are wooden and chairs white, as the client's 3D plans show them
// stairs: [x1, y1, x2, y2], the stair in the stair wing: flights run along x, side by side along y

export const PLANS3D = {
    3: {
        walls: [
            // outer walls, broken at the windows
            [148, 85, 218, 85], [272, 85, 487, 85], [541, 85, 646, 85], [700, 85, 791, 85], [845, 85, 975, 85], [1030, 85, 1165, 85],
            [148, 85, 137, 360], [132, 420, 125, 690],
            [125, 690, 205, 690], [260, 690, 422, 690], [478, 690, 622, 690], [678, 690, 820, 690], [875, 690, 950, 690],
            [1165, 85, 1165, 345], [1155, 345, 1155, 735], [1040, 735, 1313, 735],
            [1313, 735, 1313, 825], [1313, 865, 1313, 925], [945, 925, 1313, 925], [950, 700, 950, 820], [950, 880, 950, 925],
            // rooms along the top
            [350, 85, 350, 340], [550, 85, 550, 337], [710, 85, 710, 337], [960, 85, 960, 258], [960, 298, 960, 340],
            [350, 337, 462, 337], [498, 337, 612, 337], [650, 337, 862, 337], [898, 337, 965, 337],
            [1050, 85, 1050, 200], [965, 258, 975, 258], [1010, 258, 1045, 258],
            // the meeting room's corner
            [290, 348, 290, 490], [137, 490, 290, 490], [397, 340, 397, 392], [397, 428, 397, 455],
            // rooms along the bottom
            [332, 455, 466, 455], [500, 455, 620, 455], [655, 455, 783, 455], [820, 455, 955, 455], [290, 455, 300, 455],
            [355, 455, 355, 690], [550, 455, 550, 690], [710, 455, 710, 690], [880, 455, 880, 690], [955, 455, 955, 530], [950, 565, 950, 700],
            // the core: kitchen, toilets
            [1045, 262, 1155, 262], [1043, 262, 1043, 290], [1043, 345, 1155, 345], [1043, 345, 1043, 360], [1043, 388, 1043, 508], [1043, 538, 1043, 558], [1043, 583, 1043, 700],
            [1043, 445, 1145, 445], [1043, 548, 1145, 548], [1043, 610, 1145, 610], [1095, 610, 1095, 690], [1040, 700, 1155, 700],
            [950, 703, 965, 703], [1030, 703, 1043, 703],
        ],
        windows: [
            [218, 85, 272, 85], [487, 85, 541, 85], [646, 85, 700, 85], [791, 85, 845, 85], [975, 85, 1030, 85],
            [137, 360, 132, 420], [205, 690, 260, 690], [422, 690, 478, 690], [622, 690, 678, 690], [820, 690, 875, 690],
            [1313, 825, 1313, 865], [950, 820, 950, 880],
        ],
        furniture: [
            { t: 'oval', x: 215, y: 395, w: 55, h: 145 },
            { t: 'chair', x: 175, y: 368, a: 90 }, { t: 'chair', x: 175, y: 420, a: 90 }, { t: 'chair', x: 256, y: 368, a: -90 }, { t: 'chair', x: 256, y: 420, a: -90 }, { t: 'chair', x: 215, y: 315, a: 0 }, { t: 'chair', x: 215, y: 473, a: 180 },
            { t: 'desk', x: 300, y: 145, w: 95, h: 105, wood: true }, { t: 'armchair', x: 262, y: 235, a: 0 }, { t: 'armchair', x: 310, y: 235, a: 0 },
            { t: 'desk', x: 387, y: 165, w: 62, h: 70 }, { t: 'chair', x: 387, y: 118, a: 180 }, { t: 'chair', x: 387, y: 212, a: 0 },
            { t: 'desk', x: 517, y: 165, w: 62, h: 70 }, { t: 'chair', x: 517, y: 118, a: 180 }, { t: 'chair', x: 517, y: 212, a: 0 },
            { t: 'desk', x: 632, y: 165, w: 70, h: 60 }, { t: 'chair', x: 582, y: 165, a: 90 }, { t: 'chair', x: 682, y: 165, a: -90 }, { t: 'plant', x: 585, y: 110 },
            { t: 'desk', x: 1025, y: 142, w: 42, h: 42 }, { t: 'chair', x: 1025, y: 178, a: 0 },
            { t: 'desk', x: 1104, y: 112, w: 44, h: 40 }, { t: 'chair', x: 1072, y: 112, a: 90 }, { t: 'chair', x: 1136, y: 112, a: -90 },
            { t: 'desk', x: 1138, y: 222, w: 40, h: 42 }, { t: 'chair', x: 1138, y: 192, a: 180 },
            { t: 'desk', x: 572, y: 618, w: 35, h: 62 }, { t: 'chair', x: 602, y: 618, a: -90 },
            { t: 'desk', x: 690, y: 618, w: 35, h: 62 }, { t: 'chair', x: 660, y: 618, a: 90 },
            { t: 'cabinet', x: 702, y: 500, w: 12, h: 75 },
            { t: 'desk', x: 735, y: 510, w: 35, h: 62 }, { t: 'chair', x: 768, y: 510, a: -90 },
            { t: 'desk', x: 780, y: 620, w: 70, h: 62 }, { t: 'chair', x: 730, y: 620, a: 90 }, { t: 'chair', x: 830, y: 620, a: -90 },
            { t: 'cabinet', x: 864, y: 535, w: 18, h: 155 }, { t: 'plant', x: 850, y: 655 },
            { t: 'wc', x: 1128, y: 415 }, { t: 'sink', x: 1128, y: 375 }, { t: 'wc', x: 1128, y: 478 }, { t: 'sink', x: 1128, y: 520 }, { t: 'sink', x: 1128, y: 590 }, { t: 'wc', x: 1068, y: 680 }, { t: 'wc', x: 1118, y: 680 },
            { t: 'counter', x: 1100, y: 310, w: 100, h: 32 },
        ],
        kitchen: [960, 85, 1165, 262],
        stairs: [1110, 745, 1300, 915],
    },
    4: {
        walls: [
            [155, 82, 245, 82], [300, 82, 505, 82], [560, 82, 652, 82], [707, 82, 800, 82], [855, 82, 985, 82], [1040, 82, 1160, 82],
            [155, 82, 145, 358], [141, 412, 130, 695],
            [130, 695, 215, 695], [270, 695, 432, 695], [488, 695, 628, 695], [683, 695, 816, 695], [872, 695, 950, 695],
            [1160, 82, 1160, 335], [1135, 335, 1160, 335], [1135, 335, 1135, 680], [1060, 680, 1135, 680], [1040, 735, 1305, 735], [1040, 700, 1040, 735], [1060, 680, 1040, 700],
            [1305, 735, 1305, 825], [1305, 865, 1305, 920], [950, 920, 1305, 920], [950, 700, 950, 815], [950, 860, 950, 920],
            [365, 85, 365, 342], [570, 85, 570, 342], [758, 85, 758, 342], [962, 85, 962, 342], [965, 285, 1000, 285],
            [965, 212, 1020, 212], [1053, 212, 1053, 240],
            [345, 342, 478, 342], [515, 342, 622, 342], [658, 342, 875, 342], [912, 342, 965, 342],
            [303, 340, 303, 445], [147, 445, 305, 445],
            [347, 445, 490, 445], [525, 445, 630, 445], [665, 445, 793, 445], [828, 445, 955, 445],
            [360, 445, 360, 695], [560, 445, 560, 695], [725, 445, 725, 695], [885, 445, 885, 695], [950, 445, 950, 530], [950, 568, 950, 702],
            [1053, 265, 1155, 265], [1053, 265, 1053, 300], [1053, 330, 1053, 395], [1053, 430, 1053, 465], [1053, 493, 1053, 533], [1053, 565, 1053, 620], [1053, 648, 1053, 680],
            [1053, 385, 1135, 385], [1053, 455, 1135, 455], [1053, 525, 1135, 525], [1053, 600, 1135, 600],
            [950, 705, 968, 705], [1025, 705, 1040, 705],
        ],
        windows: [
            [245, 82, 300, 82], [505, 82, 560, 82], [652, 82, 707, 82], [800, 82, 855, 82], [985, 82, 1040, 82],
            [145, 358, 141, 412], [215, 695, 270, 695], [432, 695, 488, 695], [628, 695, 683, 695], [816, 695, 872, 695],
            [1305, 825, 1305, 865], [950, 815, 950, 860],
        ],
        furniture: [
            { t: 'desk', x: 268, y: 150, w: 75, h: 85 }, { t: 'chair', x: 218, y: 150, a: 90 }, { t: 'chair', x: 320, y: 150, a: -90 },
            { t: 'oval', x: 232, y: 348, w: 64, h: 130 }, { t: 'chair', x: 192, y: 322, a: 90 }, { t: 'chair', x: 192, y: 372, a: 90 }, { t: 'chair', x: 272, y: 322, a: -90 }, { t: 'chair', x: 272, y: 372, a: -90 }, { t: 'chair', x: 232, y: 272, a: 0 }, { t: 'chair', x: 232, y: 425, a: 180 },
            { t: 'cabinet', x: 354, y: 250, w: 14, h: 105 },
            { t: 'desk', x: 547, y: 178, w: 40, h: 175 }, { t: 'chair', x: 515, y: 130, a: 90 }, { t: 'chair', x: 515, y: 222, a: 90 }, { t: 'plant', x: 415, y: 125 },
            { t: 'desk', x: 987, y: 128, w: 44, h: 44 }, { t: 'chair', x: 987, y: 100, a: 180 },
            { t: 'desk', x: 1110, y: 112, w: 44, h: 42 }, { t: 'chair', x: 1082, y: 112, a: 90 },
            { t: 'desk', x: 1035, y: 187, w: 38, h: 38 }, { t: 'chair', x: 1005, y: 187, a: 90 },
            { t: 'desk', x: 1130, y: 205, w: 44, h: 44 }, { t: 'chair', x: 1130, y: 175, a: 180 },
            { t: 'desk', x: 640, y: 622, w: 78, h: 88 }, { t: 'chair', x: 588, y: 622, a: 90 }, { t: 'chair', x: 692, y: 622, a: -90 }, { t: 'cabinet', x: 708, y: 510, w: 20, h: 75 }, { t: 'plant', x: 590, y: 472 },
            { t: 'desk', x: 803, y: 623, w: 88, h: 38 }, { t: 'chair', x: 803, y: 660, a: 0 }, { t: 'armchair', x: 860, y: 482, a: -90 }, { t: 'armchair', x: 860, y: 540, a: -90 }, { t: 'cabinet', x: 875, y: 630, w: 12, h: 68 },
            { t: 'counter', x: 1140, y: 300, w: 26, h: 64 },
            { t: 'wc', x: 1118, y: 435 }, { t: 'sink', x: 1118, y: 405 }, { t: 'wc', x: 1118, y: 508 }, { t: 'sink', x: 1118, y: 475 }, { t: 'wc', x: 1118, y: 580 }, { t: 'sink', x: 1118, y: 545 }, { t: 'wc', x: 1118, y: 620 }, { t: 'sink', x: 1118, y: 655 },
            { t: 'plant', x: 1100, y: 865 },
        ],
        kitchen: [962, 85, 1160, 285],
        stairs: [1110, 745, 1295, 912],
    },
};

// The client's plans draw the stair wing differently from the building's walls seen outside (the walls of
// Brno's model, in plan pixels): the plans start its east half 45 px lower and end it lower and less far east.
// Its pixels are moved onto the building's wing, so the stair and the wing's walls stand inside the wing.
// The building's wing: west wall at x 923, east wall at 1320, its top along the offices' edge (690, the east
// half 692), its bottom slanting from 888 at the west wall to 898 at the east one.
// The plans: west wall 950, top 700 (735 east of the core at 1165), east and bottom as each plan draws them.
export const WING = { core: 1165, west: 923, east: 1320, top: 690, eastTop: 692, bottomWest: 888, bottomEast: 898 };
export const wingBottom = (x) => WING.bottomWest + ((x - WING.west) * (WING.bottomEast - WING.bottomWest)) / (WING.east - WING.west);
const PLAN_WING = { west: 950, top: 700, eastTop: 735 };
const fitWing = (plan, east, bottom) => {
    const fit = (x, y) => {
        if (y < PLAN_WING.top || x < 940) return [x, y];
        const fx0 = x <= WING.core ? WING.west + ((x - PLAN_WING.west) * (WING.core - WING.west)) / (WING.core - PLAN_WING.west) : WING.core + ((x - WING.core) * (WING.east - WING.core)) / (east - WING.core);
        const fx = Math.min(WING.east, Math.max(WING.west, fx0));
        // between the offices' edge and the plan's top of the wing's east half, all is the wing's top wall
        const fy = y <= PLAN_WING.eastTop ? WING.top + ((y - PLAN_WING.top) * (WING.eastTop - WING.top)) / (PLAN_WING.eastTop - PLAN_WING.top) : WING.eastTop + ((y - PLAN_WING.eastTop) * (wingBottom(fx) - WING.eastTop)) / (bottom - PLAN_WING.eastTop);
        return [fx, fy];
    };
    // a wall that comes out of the offices into the wing keeps its line and only ends at the wing's top
    const segment = ([x1, y1, x2, y2]) => {
        if (Math.min(y1, y2) >= PLAN_WING.top - 1) return [...fit(x1, y1), ...fit(x2, y2)];
        // the offices' outer wall along their edge ends at the wing's west wall, not in the wing's doorway
        if (Math.max(y1, y2) < PLAN_WING.top && Math.abs(y1 - y2) < 1 && Math.max(x1, x2) === PLAN_WING.west) return [Math.min(x1, x2), y1, WING.west, y2];
        const end = (x, y) => [x, y < PLAN_WING.top ? y : fit(x, y)[1]];
        return [...end(x1, y1), ...end(x2, y2)];
    };
    plan.walls = plan.walls.map(segment);
    plan.windows = plan.windows.map(segment);
    plan.stairs = segment(plan.stairs);
    for (const f of plan.furniture) [f.x, f.y] = fit(f.x, f.y);
};
fitWing(PLANS3D[3], 1313, 925);
fitWing(PLANS3D[4], 1305, 920);

// Floor 2 has no plan yet: only its outer walls are certain, and they are the same on every storey.
export const OUTER_WALLS = PLANS3D[3].walls.slice(0, 19);
