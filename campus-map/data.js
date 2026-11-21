/* =====================================================================
   data.js  -  THE ONLY FILE YOU CHANGE FOR YOUR REAL CAMPUS

   Everything here is measured on your 2D campus plan (the picture), in
   PIXELS: x counts to the right and y counts downward from the top-left
   corner of the picture (it is 1012 x 769 pixels).

   HOW TO ADD A ROOM
   1. Open the page, open "Testing tools" and tick "Coordinate helper".
   2. Tap the spot on the map. A bubble shows  x: 348, y: 289.
   3. Add a line to NODES below:  D112: { name: "Room D112", x: 348, y: 289, floor: 1 }
   4. Connect it to the hallway next to it in EDGES.

   Order of the script files in index.html:
   plan-image.js -> data.js -> plan.js -> graph.js -> map3d.js -> app.js

   1. Map settings        4. Walkable connections
   2. The plan picture    5. Buildings (shown as stacked floors in 3D)
   3. Places (rooms...)
   ===================================================================== */


/* ===== 1. MAP SETTINGS ===== */

// Free map style. No account or key needed.
const BASEMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

// OFFLINE MODE. true = the map is just your plan on a plain paper color, so it needs no
// internet for the map itself (the app can then open with no signal after the first visit).
// false = load the street map too (needs internet). Use false only while lining up the plan.
const OFFLINE_FIRST = true;

// The plain map used in offline mode: one background color, nothing to download.
const OFFLINE_STYLE = {
  version: 8,
  sources: {},
  layers: [{ id: "paper", type: "background", paint: { "background-color": "#f6f5f1" } }]
};

// Show the street map (roads, names, shops) behind your plan?
// false = only your plan picture. You can still switch the street map on
// inside the page (Testing tools > Line up the plan > Show street map).
const SHOW_STREET_MAP = false;

// Color behind the plan when the street map is hidden (the plan's own paper color).
const MAP_BACKGROUND = "#f6f5f1";
const MAP_BACKGROUND_DARK = "#1a1412";   // the same, for dark mode

// When the street map IS shown, still hide its buildings so only YOUR campus buildings show.
const HIDE_BASEMAP_BUILDINGS = true;

// How the camera looks when the page opens.
const MAP_START = {
  zoom: 17.4,
  pitch: 55,       // tilt in degrees (0 = flat, 60 = 3D view)
  bearing: 0       // rotation in degrees (0 = north is up)
};

// If the user is farther than this (meters) from every point, warn them.
const FAR_FROM_CAMPUS_METERS = 300;

// The campus limit and the Main Gate zone (used by zone.js for the "where am I" card).
// Distances are real meters. Measured from the middle of the plan picture.
const CAMPUS_LIMIT_METERS = null;    // inside this many meters = "on campus". null = automatic (the plan picture's size + 15 m)
const GATE_NODE_ID = "GATE";         // which place in NODES is the Main Gate
const GATE_APPROACH_METERS = 150;    // closer than this to the gate = "approaching" (the pulsing circle starts)
const GATE_ARRIVE_METERS = 25;       // closer than this = "at the Main Gate"


// Directions start from this place until the phone finds where you are.
// It must be one of the keys in NODES (section 3 below).
const DEFAULT_START = "GATE";


/* ===== 2. THE PLAN PICTURE ===== */

// Your plan lies flat on the real map. These numbers decide WHERE.
// Don't guess them: open "Testing tools > Line up the plan" in the page,
// use the sliders until the plan sits right (the National Road on the plan
// should cover the real road), then copy the numbers it shows into here.
const PLAN = {
  image: PLAN_IMAGE,        // the picture itself (plan-image.js). On a web host you can write "plan.png" instead.
  width: 1012,               // picture size in pixels
  height: 769,
  lat: 10.739873,           // where the CENTER of the picture sits on the real map
  lng: 121.949245,        // (set so the Main Gate lands on its real spot: Plus Code PXQ2+X3C)
  metersPerPixel: 0.25,      // size: one pixel of the picture = this many meters (about 250 m wide). A guess: fix it with the Testing tools
  rotation: -120,           // turn the picture clockwise by this many degrees (the road on the real map runs NNW to SSE)
  opacity: 1                // 1 = solid, lower = see the street map through it
};


/* ===== 3. PLACES (change this part) ===== */

// Every place. The key (like "D112") is what the user types.
// x, y = position on the plan picture (see "HOW TO ADD A ROOM" above).
// floor: 1 = ground floor, 2 = second floor, 3 = third floor.
//
// NOTE: only the D Building (the one north of the triangle garden) has sample rooms,
// on all 3 floors, so you can try the app. Replace them with your final rooms.
const NODES = {
  // Outside: the road, the walkways and the triangle garden
  GATE:          { name: "Main Gate",             x: 335, y: 738, floor: 1 },
  BOTTOM_WALK:   { name: "Bottom Walkway",        x: 335, y: 670, floor: 1 },
  SOUTH_WALK:    { name: "South Walkway",         x: 373, y: 670, floor: 1 },
  SOUTH_EAST:    { name: "South-East Walkway",    x: 463, y: 670, floor: 1 },
  EAST_WALK:     { name: "East Walkway",          x: 463, y: 490, floor: 1 },
  GARDEN_EAST:   { name: "Garden East Corner",    x: 430, y: 497, floor: 1 },
  GARDEN_NORTH:  { name: "Garden North",          x: 360, y: 497, floor: 1 },
  GARDEN:        { name: "Triangle Garden",       x: 360, y: 552, floor: 1 },
  GARDEN_SOUTH:  { name: "Garden South",          x: 373, y: 627, floor: 1 },

  // D Building, floor 1
  D_ENTRANCE:    { name: "D Building Entrance",   x: 372, y: 466, floor: 1 },
  D_HALL_1F:     { name: "D Hallway (1F)",        x: 372, y: 430, floor: 1 },
  D101:          { name: "Room D101",             x: 330, y: 430, floor: 1 },
  D112:          { name: "Room D112",             x: 415, y: 430, floor: 1 },
  D_STAIRS_1F:   { name: "D Stairs (1F)",         x: 430, y: 412, floor: 1 },

  // D Building, floor 2
  D_STAIRS_2F:   { name: "D Stairs (2F)",         x: 430, y: 412, floor: 2 },
  D_HALL_2F:     { name: "D Hallway (2F)",        x: 372, y: 430, floor: 2 },
  D201:          { name: "Room D201",             x: 330, y: 430, floor: 2 },
  D210:          { name: "Room D210",             x: 415, y: 430, floor: 2 },

  // D Building, floor 3
  D_STAIRS_3F:   { name: "D Stairs (3F)",         x: 430, y: 412, floor: 3 },
  D_HALL_3F:     { name: "D Hallway (3F)",        x: 372, y: 430, floor: 3 },
  D301:          { name: "Room D301",             x: 330, y: 430, floor: 3 },
  D310:          { name: "Room D310",             x: 415, y: 430, floor: 3 }
};


/* ===== 4. WALKABLE CONNECTIONS ===== */

// Each pair works in BOTH directions.
const EDGES = [
  ["GATE", "BOTTOM_WALK"],
  ["BOTTOM_WALK", "SOUTH_WALK"],
  ["SOUTH_WALK", "SOUTH_EAST"],       // the long way round (listed first, so DFS takes it)
  ["SOUTH_WALK", "GARDEN_SOUTH"],     // the short way through the garden
  ["SOUTH_EAST", "EAST_WALK"],
  ["EAST_WALK", "GARDEN_EAST"],
  ["GARDEN_EAST", "GARDEN_NORTH"],
  ["GARDEN_NORTH", "GARDEN"],
  ["GARDEN", "GARDEN_SOUTH"],
  ["GARDEN_NORTH", "D_ENTRANCE"],

  // D Building
  ["D_ENTRANCE", "D_HALL_1F"],
  ["D_HALL_1F", "D101"],
  ["D_HALL_1F", "D112"],
  ["D_HALL_1F", "D_STAIRS_1F"],
  ["D_STAIRS_1F", "D_STAIRS_2F"],
  ["D_STAIRS_2F", "D_HALL_2F"],
  ["D_HALL_2F", "D201"],
  ["D_HALL_2F", "D210"],
  ["D_STAIRS_2F", "D_STAIRS_3F"],
  ["D_STAIRS_3F", "D_HALL_3F"],
  ["D_HALL_3F", "D301"],
  ["D_HALL_3F", "D310"]
];


/* ===== 5. BUILDINGS (stacked floors in 3D) ===== */

// Floors every building gets, unless it has its own  floors: 2  line.
const DEFAULT_FLOORS = 3;
const FLOOR_HEIGHT_METERS = 3.5;

// footprint = the building's corners on the plan picture, in pixels.
// holes     = optional empty yards inside (like the courtyard of Building 8).
// These outlines were traced automatically from the new layout. The names are
// placeholders (rename them). Each building has 3 floors (see the 3D side views).
const BUILDINGS = [
  {
    id: "B01", name: "Building 1",
    footprint: [[231, 72], [176, 72], [176, 49], [231, 49]]
  },
  {
    id: "B02", name: "Building 2",
    footprint: [[516, 105], [415, 105], [415, 6], [516, 6]]
  },
  {
    id: "B03", name: "Building 3",
    footprint: [[683, 114], [553, 63], [572, 15], [702, 66]]
  },
  {
    id: "B04", name: "Building 4",
    footprint: [[162, 126], [140, 126], [140, 91], [162, 91]]
  },
  {
    id: "B05", name: "Building 5",
    footprint: [[809, 156], [724, 111], [744, 74], [828, 119]]
  },
  {
    id: "B06", name: "Building 6",
    footprint: [[927, 219], [810, 151], [833, 112], [950, 179]]
  },
  {
    id: "B07", name: "Building 7",
    footprint: [[212, 255], [171, 255], [171, 229], [212, 229]]
  },
  {
    id: "B08", name: "Building 8",
    footprint: [[300, 151], [300, 370], [447, 370], [447, 151]],
    holes: [[[336, 186], [416, 187], [415, 367], [335, 366]]]
  },
  {
    id: "B09", name: "Building 9",
    footprint: [[144, 430], [104, 430], [104, 214], [144, 214]]
  },
  {
    id: "B10", name: "Building 10",
    footprint: [[222, 291], [164, 291], [164, 259], [222, 259]]
  },
  {
    id: "B11", name: "Building 11",
    footprint: [[272, 229], [228, 229], [227, 301], [146, 301], [146, 430], [272, 430]]
  },
  {
    id: "B12", name: "Building 12",
    footprint: [[408, 360], [342, 360], [342, 244], [408, 244]]
  },
  {
    id: "B13", name: "Building 13",
    footprint: [[987, 351], [896, 351], [896, 229], [987, 229]]
  },
  {
    id: "B14", name: "Building 14",
    footprint: [[444, 460], [299, 460], [299, 397], [444, 397]]
  },
  {
    id: "B15", name: "Building 15",
    footprint: [[759, 456], [461, 456], [461, 421], [759, 421]]
  },
  {
    id: "B16", name: "Building 16",
    footprint: [[857, 456], [768, 456], [768, 427], [857, 427]]
  },
  {
    id: "B17", name: "Building 17",
    footprint: [[60, 427], [19, 583], [44, 597], [87, 441]]
  },
  {
    id: "B18", name: "Building 18",
    footprint: [[65, 648], [42, 613], [247, 475], [271, 510]]
  },
  {
    id: "B19", name: "Building 19",
    footprint: [[495, 473], [465, 519], [642, 654], [672, 613]]
  },
  {
    id: "B20", name: "Building 20",
    footprint: [[821, 562], [771, 562], [771, 461], [821, 461]]
  },
  {
    id: "B21", name: "Building 21",
    footprint: [[523, 648], [460, 599], [487, 564], [550, 613]]
  },
  {
    id: "B22", name: "Building 22",
    footprint: [[84, 670], [26, 670], [26, 646], [84, 646]]
  },
  {
    id: "B23", name: "Building 23",
    footprint: [[312, 663], [119, 663], [119, 616], [312, 616]]
  },
  {
    id: "B24", name: "Building 24",
    footprint: [[429, 651], [398, 651], [398, 622], [429, 622]]
  },
  {
    id: "B25", name: "Building 25",
    footprint: [[198, 709], [83, 709], [83, 682], [198, 682]]
  },
  {
    id: "B26", name: "Building 26",
    footprint: [[312, 702], [209, 702], [209, 679], [312, 679]]
  },
  {
    id: "B27", name: "Building 27",
    footprint: [[456, 720], [374, 720], [374, 661], [456, 661]]
  },
  {
    id: "B28", name: "Building 28",
    footprint: [[141, 133], [155, 133], [155, 146], [141, 146]]
  }
];