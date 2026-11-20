/* =====================================================================
   data.js  -  THE ONLY FILE YOU CHANGE FOR YOUR REAL CAMPUS

   Everything here is measured on your 2D campus plan (the picture), in
   PIXELS: x counts to the right and y counts downward from the top-left
   corner of the picture (it is 844 x 526 pixels).

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

// Show the street map (roads, names, shops) behind your plan?
// false = only your plan picture. You can still switch the street map on
// inside the page (Testing tools > Line up the plan > Show street map).
const SHOW_STREET_MAP = false;

// Color behind the plan when the street map is hidden (the plan's own paper color).
const MAP_BACKGROUND = "#f6f5f1";

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
  width: 844,               // picture size in pixels
  height: 526,
  lat: 10.739923,           // where the CENTER of the picture sits on the real map
  lng: 121.949430,        // (set so the Main Gate lands on its real spot: Plus Code PXQ2+X3C)
  metersPerPixel: 0.3,      // size: one pixel of the picture = this many meters (about 250 m wide). A guess: fix it with the Testing tools
  rotation: -120,           // turn the picture clockwise by this many degrees (the road on the real map runs NNW to SSE)
  opacity: 1                // 1 = solid, lower = see the street map through it
};


/* ===== 3. PLACES (change this part) ===== */

// Every place. The key (like "D112") is what the user types.
// x, y = position on the plan picture (see "HOW TO ADD A ROOM" above).
// floor: 1 = ground floor, 2 = second floor, etc.
//
// NOTE: these places are SAMPLES, only here so you can try the app.
// Replace them with your final rooms.
const NODES = {
  GATE:          { name: "Main Gate",    x: 297, y: 490, floor: 1 },
  BOTTOM_WALK:   { name: "Bottom Walkway",        x: 297, y: 450, floor: 1 },
  SOUTH_WALK:    { name: "South Walkway",         x: 346, y: 442, floor: 1 },
  SOUTH_EAST:    { name: "South-East Walkway",    x: 378, y: 440, floor: 1 },
  EAST_WALK:     { name: "East Walkway",          x: 378, y: 333, floor: 1 },
  GARDEN_EAST:   { name: "Garden East Corner",    x: 357, y: 336, floor: 1 },
  GARDEN_NORTH:  { name: "Garden North",          x: 318, y: 336, floor: 1 },
  GARDEN:        { name: "Triangle Garden",       x: 318, y: 370, floor: 1 },
  GARDEN_SOUTH:  { name: "Garden South",          x: 318, y: 405, floor: 1 },

  D_ENTRANCE:    { name: "D Building Entrance",   x: 318, y: 313, floor: 1 },
  D_HALL_1F:     { name: "D Hallway (1F)",        x: 318, y: 289, floor: 1 },
  D101:          { name: "Room D101",             x: 288, y: 289, floor: 1 },
  D112:          { name: "Room D112",             x: 348, y: 289, floor: 1 },
  D_STAIRS_1F:   { name: "D Stairs (1F)",         x: 335, y: 276, floor: 1 },
  D_STAIRS_2F:   { name: "D Stairs (2F)",         x: 335, y: 276, floor: 2 },
  D_HALL_2F:     { name: "D Hallway (2F)",        x: 318, y: 289, floor: 2 },
  D201:          { name: "Room D201",             x: 288, y: 289, floor: 2 },
  D210:          { name: "Room D210",             x: 348, y: 289, floor: 2 }
};


/* ===== 4. WALKABLE CONNECTIONS ===== */

// Each pair works in BOTH directions.
const EDGES = [
  ["GATE", "BOTTOM_WALK"],
  ["BOTTOM_WALK", "SOUTH_WALK"],      // the long way round (listed first, so DFS takes it)
  ["SOUTH_WALK", "SOUTH_EAST"],
  ["BOTTOM_WALK", "GARDEN_SOUTH"],    // the short way through the garden
  ["SOUTH_EAST", "EAST_WALK"],
  ["EAST_WALK", "GARDEN_EAST"],
  ["GARDEN_EAST", "GARDEN_NORTH"],
  ["GARDEN_NORTH", "GARDEN"],
  ["GARDEN", "GARDEN_SOUTH"],
  ["GARDEN_NORTH", "D_ENTRANCE"],

  ["D_ENTRANCE", "D_HALL_1F"],
  ["D_HALL_1F", "D101"],
  ["D_HALL_1F", "D112"],
  ["D_HALL_1F", "D_STAIRS_1F"],
  ["D_STAIRS_1F", "D_STAIRS_2F"],
  ["D_STAIRS_2F", "D_HALL_2F"],
  ["D_HALL_2F", "D201"],
  ["D_HALL_2F", "D210"]
];


/* ===== 5. BUILDINGS (stacked floors in 3D) ===== */

// Floors every building gets, unless it has its own  floors: 3  line.
const DEFAULT_FLOORS = 2;
const FLOOR_HEIGHT_METERS = 3.5;

// footprint = the building's corners on the plan picture, in pixels.
// holes     = optional empty yards inside (like the courtyard of Building 9).
// These outlines were traced automatically from your plan. The names are
// placeholders (rename them) and the heights are a guess (DEFAULT_FLOORS).
const BUILDINGS = [
  {
    id: "B01", name: "Building 1",
    footprint: [[162, 63], [175, 63], [175, 84], [162, 84]]
  },
  {
    id: "B02", name: "Building 2",
    footprint: [[186, 35], [222, 35], [222, 48], [186, 48]]
  },
  {
    id: "B03", name: "Building 3",
    footprint: [[348, 10], [414, 10], [414, 70], [348, 70]]
  },
  {
    id: "B04", name: "Building 4",
    footprint: [[442, 42], [455, 12], [537, 45], [525, 75]]
  },
  {
    id: "B05", name: "Building 5",
    footprint: [[556, 75], [568, 52], [625, 82], [613, 105]]
  },
  {
    id: "B06", name: "Building 6",
    footprint: [[614, 102], [628, 78], [705, 122], [691, 147]]
  },
  {
    id: "B07", name: "Building 7",
    footprint: [[183, 156], [208, 156], [208, 171], [183, 171]]
  },
  {
    id: "B08", name: "Building 8",
    footprint: [[178, 176], [215, 176], [215, 196], [178, 196]]
  },
  {
    id: "B09", name: "Building 9",
    footprint: [[270, 103], [367, 103], [367, 249], [270, 249]],
    holes: [[[292, 126], [347, 126], [347, 248], [292, 248]]]
  },
  {
    id: "B10", name: "Building 10",
    footprint: [[298, 166], [341, 166], [341, 242], [298, 242]]
  },
  {
    id: "B11", name: "Building 11",
    footprint: [[671, 156], [731, 156], [731, 236], [671, 236]]
  },
  {
    id: "B12", name: "Building 12",
    footprint: [[138, 146], [163, 146], [163, 290], [138, 290]]
  },
  {
    id: "B13", name: "Building 13",
    footprint: [[166, 205], [219, 205], [219, 290], [166, 290]]
  },
  {
    id: "B14", name: "Building 14",
    footprint: [[221, 156], [249, 156], [249, 290], [221, 290]]
  },
  {
    id: "D", name: "D Building (sample)",
    footprint: [[269, 269], [365, 269], [365, 310], [269, 310]]
  },
  {
    id: "B16", name: "Building 16",
    footprint: [[378, 285], [577, 285], [577, 307], [378, 307]]
  },
  {
    id: "B17", name: "Building 17",
    footprint: [[585, 289], [643, 289], [643, 307], [585, 307]]
  },
  {
    id: "B18", name: "Building 18",
    footprint: [[108, 291], [123, 295], [96, 398], [80, 394]]
  },
  {
    id: "B19", name: "Building 19",
    footprint: [[233, 322], [248, 344], [111, 436], [96, 414]]
  },
  {
    id: "B20", name: "Building 20",
    footprint: [[380, 349], [401, 322], [519, 414], [498, 442]]
  },
  {
    id: "B21", name: "Building 21",
    footprint: [[587, 313], [619, 313], [619, 378], [587, 378]]
  },
  {
    id: "B22", name: "Building 22",
    footprint: [[85, 437], [123, 437], [123, 451], [85, 451]]
  },
  {
    id: "B23", name: "Building 23",
    footprint: [[148, 417], [276, 417], [276, 446], [148, 446]]
  },
  {
    id: "B24", name: "Building 24",
    footprint: [[336, 421], [355, 421], [355, 438], [336, 438]]
  },
  {
    id: "B25", name: "Building 25",
    footprint: [[380, 404], [395, 385], [434, 415], [419, 434]]
  },
  {
    id: "B26", name: "Building 26",
    footprint: [[123, 461], [199, 461], [199, 478], [123, 478]]
  },
  {
    id: "B27", name: "Building 27",
    footprint: [[208, 459], [276, 459], [276, 472], [208, 472]]
  },
  {
    id: "B28", name: "Building 28",
    footprint: [[319, 447], [373, 447], [373, 485], [319, 485]]
  }

];