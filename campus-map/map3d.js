
/* =====================================================================
   map3d.js  -  everything that touches the 3D map (MapLibre GL)
   app.js only calls the functions listed here. It never uses the map
   object directly.

   FUNCTIONS app.js CAN USE
   createMap(id)          start the map          onMapReady(fn)     run fn when loaded
   drawRoutes(routes)     draw route lines       clearRoutes()      remove them
   showDestination(id)    pulsing yellow dot     showUser(lat,lng,meters,heading)  blue dot = you
   setFloor(floor)        highlight one floor    setTilt(is3D)      3D or flat view
   flyToRoute(path,pad)   move the camera
   setMapTheme(dark)      dark or light map     setMapLook(look)   "color" or "plan" map
   focusOn(lat,lng,zoom)   center on a point     showGate(zoom)     look at the Main Gate
   refreshCampus()        redraw after the PLAN numbers changed
   setStreetMap(show)     street map on or off
   onMapClick(fn)         clicks on the map      showPopup(...)     small info bubble
   showGateRipple(lat,lng,on)  pulsing circle at the Main Gate
   followUser(lat,lng)    keep the camera on you onMapDrag(fn)      run fn when the user drags the map

   SECTIONS
   1. Settings          4. Campus layers (plan, floors, routes, dots)
   2. Create the map    5. Markers and camera
   3. Street map on/off 6. Clicks and popups
   ===================================================================== */


/* ===== 1. SETTINGS ===== */

const TILT_3D = 60;                  // camera tilt in 3D view (degrees)
const FLOOR_GAP_METERS = 0.3;        // thin gap between stacked floors
const ROOF_THICKNESS_METERS = 1.4;   // the colored roof slab on top
const FLAT_EDGE_METERS = 60;         // 2D: how far past the campus edge you can slide
const FLAT_MIN_ZOOM = 16.3;          // 2D: how far you can zoom out
const MIN_ZOOM_3D = 16.6;            // 3D: how far you can zoom out (a fair distance, the whole campus still fits)
const GATE_ZOOM = 17.8;              // how close the camera starts on the Main Gate

const COLOR_FLOOR        = WALL_COLOR;  // a floor that is not selected (beige wall, see data.js)
const COLOR_FLOOR_ACTIVE = "#f2b705";   // the selected floor (SAC yellow)
const COLOR_CASING       = "#2d1a15";   // dark brown outline under route lines
const COLOR_USER         = "#1a73e8";   // the blue "you are here" color
const COLOR_GOLD         = "#f2b705";   // floor highlight yellow
const COLOR_WINDOW       = "#6f8fb3";   // the glass of the windows
const COLOR_DOT_RING     = "#ffcf3d";   // the rings of the place dots (a richer gold)

let userHeading = null;              // which way you are walking (degrees), or null

let map = null;                      // the MapLibre map (set in createMap)
let is3DView = false;               // the app OPENS in 2D (flat, straight, light on the phone)
let userMarker = null;
let gateRippleMarker = null;         // the pulsing circle at the Main Gate
let destinationMarker = null;
let openPopup = null;
let basemapLayerIds = [];            // the street map's own layers (filled when the map loads)
let streetShown = SHOW_STREET_MAP;   // is the street map on right now?
let darkTheme = false;               // dark mode on?
let lookName = "color";              // "color" (the PDF design) or "plan" (the white 2D plan)
let threeActive = false;             // true when your Three.js 3D (campus3d.js) is drawing the buildings
let focusBuildingId = null;          // the building that is opened into floors (null = none)
let shownFloor = null;               // the floor that is lit up (null = none)
let streetBackground = null;         // the street map's own background color (remembered, to switch it back on)
const readyCallbacks = [];


/* ===== 2. CREATE THE MAP ===== */

// Throws an error if the phone or browser has no WebGL (app.js catches it).
function createMap(containerId) {
  map = new maplibregl.Map({
    container: containerId,
    style: OFFLINE_FIRST ? OFFLINE_STYLE : BASEMAP_STYLE,   // plain paper (works offline) or street map
    center: [PLAN.lng, PLAN.lat],             // [lng, lat]: longitude FIRST
    zoom: MAP_START.zoom,
    minZoom: FLAT_MIN_ZOOM,
    pitch: 0,                                 // flat at the start (2D)
    bearing: planUpBearing(),                 // plan straight, like the PDF
    maxPitch: 78,
    pixelRatio: Math.min(window.devicePixelRatio || 1, 2),   // phones draw 3x pixels: 2x looks the same and is much lighter
    fadeDuration: 0,                          // no slow fade-ins: less work per frame
    attributionControl: { compact: true }
  });

  // Zoom buttons and a compass. Hidden on phones by style.css.
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");

  map.on("error", (e) => console.warn("Map warning:", e && e.error && e.error.message));

  map.on("load", () => {
    basemapLayerIds = map.getStyle().layers.map((layer) => layer.id);   // remember them before we add ours
    setStreetMap(SHOW_STREET_MAP);
    addCampusLayers();
    threeActive = initCampus3D(map, "routes-glow");   // your 3D buildings (campus3d.js); false = use the simple 3D below
    lockFlatView(!is3DView);                  // 2D rules from the first frame
    applyGroundVisibility();
    readyCallbacks.forEach((fn) => fn());
  });

  return map;
}

function onMapReady(fn) {
  readyCallbacks.push(fn);
}


/* ===== 3. STREET MAP ON / OFF, LIGHT / DARK ===== */

// The color behind the plan.
function paperColor() {
  // 3D color look: dark night-blue around the campus in dark mode, a soft light gray (not pure white) in light mode
  if (is3DView && lookName !== "plan") return darkTheme ? "#1e222b" : "#d6dae0";
  if (darkTheme) return MAP_BACKGROUND_DARK;
  return lookName === "plan" ? MAP_BACKGROUND_PLAN : MAP_BACKGROUND;
}

// Dark mode for the map: dark paper, and the (white) plan picture dimmed so it does not glare.
function setMapTheme(dark) {
  darkTheme = dark;
  if (!map || !map.getLayer("plan-image")) return;      // the map is not ready yet: onMapReady will call us again
  setStreetMap(streetShown);                            // redraws the paper color
  ["plan-image", "plan-image-flat", "plan-image-clean"].forEach((id) => map.setPaintProperty(id, "raster-brightness-max", dark && lookName === "plan" ? 0.5 : 1));
  updateLandLook();
}

// Which picture lies on the ground, and are the 3D blocks shown?
//   Color look: 3D = ground + 3D blocks   |   2D = one flat picture with the roofs already drawn (very light)
//   Plan look:  the white plan picture (3D adds the blocks on top)
function applyGroundVisibility() {
  if (!map || !map.getLayer("plan-image-flat")) return;
  const show = lookName === "plan" ? "plan-image-clean" : (is3DView ? "plan-image" : "plan-image-flat");
  ["plan-image", "plan-image-flat", "plan-image-clean"].forEach((id) => {
    map.setLayoutProperty(id, "visibility", id === show ? "visible" : "none");
  });
  const simple3D = is3DView && !threeActive;                  // the simple 3D only when campus3d.js is not running
  map.setLayoutProperty("floors-3d", "visibility", simple3D ? "visible" : "none");
  if (map.getLayer("trees-3d")) map.setLayoutProperty("trees-3d", "visibility", simple3D && lookName !== "plan" ? "visible" : "none");
  if (threeActive) { campus3dSetVisible(is3DView); campus3dSetLook(lookName); }
  if (roomViewId) updateRoomView();                    // 3D and 2D draw the room view differently
}

// The look of the map: "color" (the design from your PDF) or "plan" (the white 2D plan).
function setMapLook(look) {
  lookName = look === "plan" ? "plan" : "color";
  if (!map || !map.getLayer("plan-image-flat")) return;    // not ready: onMapReady will call us again
  applyGroundVisibility();
  setMapTheme(darkTheme);                                  // the white plan is dimmed in dark mode, the color picture is not
  map.setPaintProperty("floors-3d", "fill-extrusion-color", floorColorExpression(shownFloor));
  setStreetMap(streetShown);                               // redraws the paper color
}

// Shows or hides the street map (roads, names, shops). Your plan and campus stay.
// With the street map off, the page shows only your plan on its own paper color.
function setStreetMap(show) {
  streetShown = show;
  map.getContainer().style.background = paperColor();   // extra safety: same color behind the map

  map.getStyle().layers.forEach((layer) => {
    if (basemapLayerIds.indexOf(layer.id) === -1) return;   // only the street map's own layers

    // The background layer stays on either way: only its color changes.
    if (layer.type === "background") {
      if (streetBackground === null) streetBackground = (layer.paint && layer.paint["background-color"]) || "#f8f4f0";
      map.setPaintProperty(layer.id, "background-color", show ? streetBackground : paperColor());
      return;
    }

    const isBuilding = layer.type === "fill-extrusion" || layer["source-layer"] === "building";
    const visible = show && !(HIDE_BASEMAP_BUILDINGS && isBuilding);
    map.setLayoutProperty(layer.id, "visibility", visible ? "visible" : "none");
  });
}

// Id of the first text layer of the street map. The plan goes just under it,
// so the street names stay readable.
function firstLabelLayerId() {
  const layer = map.getStyle().layers.find((l) => l.type === "symbol");
  return layer ? layer.id : undefined;
}


/* ===== 4. CAMPUS LAYERS (plan, floors, routes, dots) ===== */

function emptyCollection() {
  return { type: "FeatureCollection", features: [] };
}

// A list of plan pixels [[x, y], ...] -> a closed outline of [lng, lat] points.
function toRing(points) {
  const ring = points.map(([x, y]) => planToLngLat(x, y));
  ring.push(ring[0]);   // close the outline
  return ring;
}

// Each building becomes one slice per floor, stacked on top of each other.
// Only the FOCUS building (the one that holds the room you searched) is cut into floors 1, 2, 3.
// Every other building is one solid 3D block. All of them get a row of windows on every floor
// and a stepped, pitched roof.
const SILL_METERS = 0.8;        // wall under the windows
const WINDOW_METERS = 1.5;      // the window band

// A slice of wall: kind "wall" or "window"
function wallSlice(rings, id, floor, base, top, kind) {
  return {
    type: "Feature",
    properties: { building: id, floor: floor, base: base, top: top, glass: kind === "window" },
    geometry: { type: "Polygon", coordinates: rings }
  };
}

// One floor = wall, window band, wall (so every floor shows a row of windows)
function floorSlices(rings, id, floor, base, top) {
  const w1 = base + SILL_METERS, w2 = w1 + WINDOW_METERS;
  return [
    wallSlice(rings, id, floor, base, w1, "wall"),
    wallSlice(rings, id, floor, w1, w2, "window"),
    wallSlice(rings, id, floor, w2, top, "wall")
  ];
}

// Moves every side of a convex outline inward by "d" pixels. Returns null if it cannot (not convex / too small).
function insetOutline(pts, d) {
  const n = pts.length;
  const lines = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    const dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy);
    if (len < 1e-6) return null;
    lines.push({ nx: -dy / len, ny: dx / len, px: p[0], py: p[1], dx: dx, dy: dy });
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = lines[(i + n - 1) % n], b = lines[i];
    const a0 = [a.px + a.nx * d, a.py + a.ny * d], b0 = [b.px + b.nx * d, b.py + b.ny * d];
    const den = a.dx * b.dy - a.dy * b.dx;
    if (Math.abs(den) < 1e-9) return null;
    const t = ((b0[0] - a0[0]) * b.dy - (b0[1] - a0[1]) * b.dx) / den;
    out.push([a0[0] + a.dx * t, a0[1] + a.dy * t]);
  }
  return out;
}

// Is the outline convex, and which way does it turn? (+1 / -1, or 0 if not convex)
function turnOf(pts) {
  let sign = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], c = pts[(i + 2) % pts.length];
    const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cr) < 1e-6) continue;
    const s = cr > 0 ? 1 : -1;
    if (sign === 0) sign = s; else if (s !== sign) return 0;
  }
  return sign;
}

// The roof: steps that get smaller toward the top, like a pitched (hip) roof. Flat slab if the outline is not simple.
function roofFeatures(b, rings, baseMeters, totalFloors) {
  const color = ROOF_COLORS[b.roof] || ROOF_COLORS.red;
  const flat = [{
    type: "Feature",
    properties: { building: b.id, floor: 0, roof: color, base: baseMeters, top: baseMeters + ROOF_THICKNESS_METERS },
    geometry: { type: "Polygon", coordinates: rings }
  }];
  if ((b.holes || []).length > 0) return flat;
  const turn = turnOf(b.footprint);
  if (turn === 0) return flat;

  // the outline must run the same way the insets expect
  const pts = turn > 0 ? b.footprint.slice().reverse() : b.footprint.slice();
  let area = 0, perim = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    area += p[0] * q[1] - q[0] * p[1];
    perim += Math.hypot(q[0] - p[0], q[1] - p[1]);
  }
  const inRadius = Math.abs(area) / perim;                 // about half the narrow side, in pixels
  const height = Math.max(1.6, Math.min(4.8, inRadius * PLAN.metersPerPixel * 0.9));
  const steps = 5;
  const features = [];
  for (let i = 0; i < steps; i++) {
    const inset = insetOutline(pts, inRadius * 0.94 * (i / steps));
    if (!inset) return flat;
    features.push({
      type: "Feature",
      properties: { building: b.id, floor: 0, roof: color, shade: i / steps,
                    base: baseMeters + height * (i / steps), top: baseMeters + height * ((i + 1) / steps) + (i === 0 ? 0.3 : 0.05) },
      geometry: { type: "Polygon", coordinates: [toRing(inset)] }
    });
  }
  return features;
}

function buildFloorsGeoJSON(focusId) {
  let features = [];
  BUILDINGS.forEach((b) => {
    const floors = b.floors || DEFAULT_FLOORS;
    const rings = [toRing(b.footprint)].concat((b.holes || []).map(toRing));
    const topOfWalls = floors * FLOOR_HEIGHT_METERS - FLOOR_GAP_METERS;

    for (let floor = 1; floor <= floors; floor++) {
      const base = (floor - 1) * FLOOR_HEIGHT_METERS, top = floor * FLOOR_HEIGHT_METERS - FLOOR_GAP_METERS;
      // floor: -2 means "not the opened building": never highlighted
      features = features.concat(floorSlices(rings, b.id, b.id === focusId ? floor : -2, base, top));
    }
    features = features.concat(roofFeatures(b, rings, topOfWalls, floors));
  });
  return { type: "FeatureCollection", features };
}

// Little 3D trees: a brown trunk and two green crowns. TREES (data.js) holds their spots on the plan.
function buildTreesGeoJSON() {
  const GREENS = ["#4f9a4f", "#3f8a45", "#5aa55a", "#357a3e"];
  const features = [];
  const circle = (x, y, r) => toRing(Array.from({ length: 9 }, (_, i) => [x + r * Math.cos(i * 2 * Math.PI / 9), y + r * Math.sin(i * 2 * Math.PI / 9)]));
  const part = (x, y, r, base, top, color) => features.push({
    type: "Feature", properties: { color: color, base: base, top: top },
    geometry: { type: "Polygon", coordinates: [circle(x, y, r)] }
  });
  TREES.forEach(([x, y, r], i) => {
    const crown = r * 1.25;                                // crown size in plan pixels
    const h = 3.2 + (i % 4) * 0.5;                         // a little different from tree to tree
    const g = GREENS[i % GREENS.length];
    part(x, y, 0.8, 0, 1.8, "#6b4a2f");                    // trunk
    part(x, y, crown, 1.6, 1.6 + h * 0.6, g);              // big crown
    part(x, y, crown * 0.62, 1.6 + h * 0.6, 1.6 + h, GREENS[(i + 1) % GREENS.length]);   // top crown
  });
  return { type: "FeatureCollection", features };
}

// Which building holds this place? (the place's spot on the plan is inside the building's outline)
function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function buildingOfNode(id) {
  const n = NODES[id];
  if (!n) return null;
  if (n.building) return n.building;                    // rooms from layout.js know their building
  const hit = BUILDINGS.find((b) => pointInRing(n.x, n.y, b.footprint) && !(b.holes || []).some((h) => pointInRing(n.x, n.y, h)));
  return hit ? hit.id : null;
}

// Opens one building into floors (null = every building solid).
function setFocusBuilding(id) {
  focusBuildingId = id;
  if (threeActive) campus3dSetFocus(id);
  if (map && map.getSource("floors")) map.getSource("floors").setData(buildFloorsGeoJSON(id));
}

// Only the places on the route show a dot (like Google Maps). ids = [] hides them all.
function showRouteDots(ids) {
  if (map && map.getLayer("nodes-dots")) map.setFilter("nodes-dots", ["in", ["get", "id"], ["literal", ids]]);
}

// One small dot per place, so you can SEE your graph.
function buildNodesGeoJSON() {
  return {
    type: "FeatureCollection",
    features: Object.keys(NODES).map((id) => ({
      type: "Feature",
      properties: { id: id, name: NODES[id].name, floor: NODES[id].floor, hidden: !!NODES[id].hidden },
      geometry: { type: "Point", coordinates: toLngLat(id) }
    }))
  };
}

// Colors the selected floor yellow (roofs keep their color). floor = null means "no floor selected".
function floorColorExpression(floor) {
  const plan = lookName === "plan";
  return ["case",
    ["has", "roof"], plan ? ROOF_PLAN : ["get", "roof"],                   // roofs keep their own color
    ["==", ["get", "floor"], floor === null ? -1 : floor], COLOR_FLOOR_ACTIVE,
    ["get", "glass"], plan ? "#9aa6b8" : COLOR_WINDOW,                     // the window band
    plan ? WALL_PLAN : COLOR_FLOOR];
}

function isCoarsePointer() {
  return !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
}

// Each algorithm's route color as a map expression: ["match", ["get", "algo"], "bfs", "#08a597", ..., fallback]
function routeColorExpression() {
  const expression = ["match", ["get", "algo"]];
  Object.keys(ALGORITHMS).forEach((key) => { expression.push(key, ALGORITHMS[key].color); });
  expression.push("#ffffff");
  return expression;
}

// Draws one small white chevron ">" (with space after it) and gives it to the map as "route-arrow".
// Returns false if the browser cannot draw it (the route then simply has no arrows).
function addRouteArrowImage() {
  try {
    if (map.hasImage("route-arrow")) return true;
    const canvas = document.createElement("canvas");
    canvas.width = 72;      // 36 x 14 css pixels at pixelRatio 2: the arrow and the gap after it
    canvas.height = 28;
    const ctx = canvas.getContext("2d");
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#ffffff";
    ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.moveTo(14, 5);
    ctx.lineTo(28, 14);
    ctx.lineTo(14, 23);
    ctx.stroke();
    map.addImage("route-arrow", ctx.getImageData(0, 0, canvas.width, canvas.height), { pixelRatio: 2 });
    return true;
  } catch (err) {
    console.warn("Route arrows not drawn:", err && err.message);
    return false;
  }
}

/* ===== GRASS LAND =====
   The green land you added in your page (CAMPUS_LAND), drawn under the plan picture.
   The picture's dark margin is see-through, so the grass shows there and past the picture's edge. */
const LAND_COLORS = { grass: ["#4a7646", "#3c6139"], lush: ["#76b85c", "#5c9748"], dirt: ["#a98f6c", "#86714f"], sand: ["#e3d3a0", "#bdb085"] };   // [light, dark]

function buildLandGeoJSON() {
  const planPoint = (x, y) => planToLngLat(1.5061 * (x + 12) - 40.52, 1.5085 * (y + 5) - 8.71);   // page units -> map
  return {
    type: "FeatureCollection",
    features: CAMPUS_LAND.map((l) => ({
      type: "Feature",
      properties: { kind: l[4] },
      geometry: { type: "Polygon", coordinates: [[planPoint(l[0], l[1]), planPoint(l[0] + l[2], l[1]), planPoint(l[0] + l[2], l[1] + l[3]), planPoint(l[0], l[1] + l[3]), planPoint(l[0], l[1])]] }
    }))
  };
}

// Light or dark colors, and hidden in the plain white "Plan" look
function updateLandLook() {
  if (!map || !map.getLayer("land")) return;
  const shade = darkTheme ? 1 : 0;
  const colors = ["match", ["get", "kind"]];
  Object.keys(LAND_COLORS).forEach((kind) => colors.push(kind, LAND_COLORS[kind][shade]));
  colors.push(LAND_COLORS.grass[shade]);
  map.setPaintProperty("land", "fill-color", colors);
  map.setLayoutProperty("land", "visibility", lookName === "plan" ? "none" : "visible");
  CAMPUS_LAND.forEach((l, i) => {
    if (!map.getLayer("land-grass-" + i)) return;
    map.setLayoutProperty("land-grass-" + i, "visibility", lookName === "plan" ? "none" : "visible");
    map.setPaintProperty("land-grass-" + i, "raster-brightness-max", darkTheme ? 0.8 : 1);
  });
}

/* The grass picture: painted in the browser the same way as your page paints it
   (a green base, soft darker and lighter patches, small blades), then repeated over the grass land. */
function paintGrassTile(size) {
  const c = document.createElement("canvas"); c.width = c.height = size;
  const g = c.getContext("2d");
  let seed = 11;
  const random = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  const colors = ["#35603f", "#35603f", "#3d6a45", "#6a9355", "#7a9a55", "#2f5a3a"];
  g.fillStyle = "#46744a"; g.fillRect(0, 0, size, size);
  for (let i = 0; i < 46; i++) {                                    // soft patches (drawn 9 times so the tile joins up)
    const x = random() * size, y = random() * size, r = (18 + random() * 34) * size / 256, color = colors[i % colors.length];
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
      const cx = x + ox * size, cy = y + oy * size, grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, color); grad.addColorStop(1, color + "00");
      g.globalAlpha = 0.34; g.fillStyle = grad; g.fillRect(cx - r, cy - r, 2 * r, 2 * r);
    }
  }
  g.globalAlpha = 0.4;                                              // small blades
  for (let i = 0; i < 900 * (size * size) / 65536; i++) { g.fillStyle = colors[i % colors.length]; g.fillRect(random() * size, random() * size, 2, 3); }
  return c;
}

// One picture of grass for a land rectangle (page units), made from repeated tiles
function grassPicture(l) {
  const tile = paintGrassTile(256), pxW = Math.round(l[2] * 1.5061), pxH = Math.round(l[3] * 1.5085);
  const c = document.createElement("canvas"); c.width = pxW; c.height = pxH;
  const g = c.getContext("2d"), step = 170 * 1.5061;                // one tile = 170 units on the ground (big, so the repeat is hard to see)
  for (let x = 0; x < pxW; x += step) for (let y = 0; y < pxH; y += step) g.drawImage(tile, x, y, step + 1, step + 1);
  return c.toDataURL("image/jpeg", 0.85);
}

function addGrassLayers() {
  const planPoint = (x, y) => planToLngLat(1.5061 * (x + 12) - 40.52, 1.5085 * (y + 5) - 8.71);
  CAMPUS_LAND.forEach((l, i) => {
    if (l[4] !== "grass") return;                                   // other kinds (dirt, sand...) stay flat colors
    map.addSource("land-grass-" + i, { type: "image", url: grassPicture(l), coordinates: [planPoint(l[0], l[1]), planPoint(l[0] + l[2], l[1]), planPoint(l[0] + l[2], l[1] + l[3]), planPoint(l[0], l[1] + l[3])] });
    map.addLayer({ id: "land-grass-" + i, type: "raster", source: "land-grass-" + i, paint: { "raster-fade-duration": 0, "raster-resampling": "linear" } });
  });
}

function addCampusLayers() {
  map.addSource("land", { type: "geojson", data: buildLandGeoJSON() });
  map.addLayer({ id: "land", type: "fill", source: "land", paint: { "fill-color": LAND_COLORS.grass[0], "fill-antialias": false } });
  addGrassLayers();
  map.addSource("plan",   { type: "image", url: PLAN.image, coordinates: planCorners() });
  map.addSource("plan-clean", { type: "image", url: PLAN_IMAGE_CLEAN, coordinates: planCorners() });
  map.addSource("plan-flat",  { type: "image", url: (typeof PLAN_IMAGE_FLAT === "string" ? PLAN_IMAGE_FLAT : PLAN_IMAGE), coordinates: planCorners() });
  map.addSource("floors", { type: "geojson", data: buildFloorsGeoJSON(focusBuildingId) });
  map.addSource("room-area", { type: "geojson", data: emptyCollection() });
  map.addSource("trees",  { type: "geojson", data: buildTreesGeoJSON() });
  map.addSource("routes", { type: "geojson", data: emptyCollection() });
  map.addSource("nodes",  { type: "geojson", data: buildNodesGeoJSON() });
  map.addSource("user-accuracy", { type: "geojson", data: emptyCollection() });

  // Your plan picture, lying flat on the ground.
  map.addLayer({
    id: "plan-image",
    type: "raster",
    source: "plan",
    paint: { "raster-opacity": PLAN.opacity, "raster-fade-duration": 0 }
  }, firstLabelLayerId());

  // The flat color picture for 2D (ground + roofs seen from above). Only one picture is shown at a time.
  map.addLayer({
    id: "plan-image-flat",
    type: "raster",
    source: "plan-flat",
    layout: { visibility: "none" },
    paint: { "raster-opacity": PLAN.opacity, "raster-fade-duration": 0 }
  }, firstLabelLayerId());

  // The 2D plan picture itself (white). Hidden until you tap the Color / Plan button.
  map.addLayer({
    id: "plan-image-clean",
    type: "raster",
    source: "plan-clean",
    layout: { visibility: "none" },
    paint: { "raster-opacity": PLAN.opacity, "raster-fade-duration": 0 }
  }, firstLabelLayerId());

  map.addLayer({
    id: "floors-3d",
    type: "fill-extrusion",
    source: "floors",
    layout: { visibility: is3DView ? "visible" : "none" },
    paint: {
      "fill-extrusion-color": floorColorExpression(null),
      "fill-extrusion-base": ["get", "base"],
      "fill-extrusion-height": ["get", "top"],
      "fill-extrusion-opacity": 1   // solid blocks are faster to draw on a phone
    }
  });

  map.addLayer({
    id: "trees-3d",
    type: "fill-extrusion",
    source: "trees",
    layout: { visibility: is3DView ? "visible" : "none" },
    paint: { "fill-extrusion-color": ["get", "color"], "fill-extrusion-base": ["get", "base"], "fill-extrusion-height": ["get", "top"], "fill-extrusion-opacity": 1 }
  });

  // The room you chose, lit up on the plan (gold)
  map.addLayer({ id: "room-area", type: "fill", source: "room-area", paint: {
    "fill-color": ["case", ["get", "chosen"], COLOR_GOLD, "#7fb7b0"],
    "fill-opacity": ["case", ["get", "chosen"], 0.6, 0.3]
  } });
  map.addLayer({ id: "room-area-line", type: "line", source: "room-area", paint: { "line-color": "#ffffff", "line-width": 2 } });

  // A soft glow under the route, in the route's own color (BFS teal, DFS indigo)
  map.addLayer({
    id: "routes-glow",
    type: "line",
    source: "routes",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": routeColorExpression(), "line-width": 20, "line-blur": 12, "line-opacity": 0.6 }
  });

  // Dark outline under the route so it stays visible on any map color.
  map.addLayer({
    id: "routes-casing",
    type: "line",
    source: "routes",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": COLOR_CASING, "line-width": 10, "line-opacity": 0.85 }
  });

  // One line layer per algorithm (BFS solid teal, DFS dashed indigo).
  Object.keys(ALGORITHMS).forEach((key) => {
    const algo = ALGORITHMS[key];
    const paint = { "line-color": algo.color, "line-width": 6 };
    if (algo.dashed) paint["line-dasharray"] = [1.5, 1.5];

    map.addLayer({
      id: "route-" + key,
      type: "line",
      source: "routes",
      filter: ["==", ["get", "algo"], key],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: paint
    });
  });

  // Little white arrows running along the route (a picture repeated along the line: works offline)
  if (addRouteArrowImage()) {
    map.addLayer({
      id: "routes-arrows",
      type: "line",
      source: "routes",
      layout: { "line-cap": "butt", "line-join": "round" },
      paint: { "line-pattern": "route-arrow", "line-width": 14, "line-opacity": 0.95 }
    });
  }

  // Invisible bigger circles so a tap on a place is still found when its dot is hidden
  map.addLayer({
    id: "nodes-hit",
    type: "circle",
    source: "nodes",
    filter: ["!", ["get", "hidden"]],                    // only real places can be tapped
    paint: { "circle-radius": 9, "circle-opacity": 0 }
  });

  map.addLayer({
    id: "nodes-dots",
    type: "circle",
    source: "nodes",
    filter: ["in", ["get", "id"], ["literal", []]],     // hidden until a route is drawn
    paint: {
      "circle-radius": 4.5,
      "circle-color": "#4a0c16",
      "circle-stroke-color": COLOR_DOT_RING,
      "circle-stroke-width": 2.5
    }
  });

  // The pale blue circle around "you": how sure the GPS is (like Google Maps).
  map.addLayer({
    id: "user-accuracy",
    type: "fill",
    source: "user-accuracy",
    paint: { "fill-color": COLOR_USER, "fill-opacity": 0.16, "fill-outline-color": COLOR_USER }
  });
}

// Run after the PLAN numbers changed (moved, turned, resized): everything
// that depends on them is drawn again. app.js redraws the route itself.
function refreshCampus() {
  map.getSource("plan").setCoordinates(planCorners());
  map.getSource("plan-clean").setCoordinates(planCorners());
  map.getSource("plan-flat").setCoordinates(planCorners());
  if (!is3DView) map.setMaxBounds(campusBounds());      // 2D: the edge moves with the plan
  map.getSource("floors").setData(buildFloorsGeoJSON());
  map.getSource("nodes").setData(buildNodesGeoJSON());
  map.setPaintProperty("plan-image", "raster-opacity", PLAN.opacity);
  map.setPaintProperty("plan-image-clean", "raster-opacity", PLAN.opacity);
  map.setPaintProperty("plan-image-flat", "raster-opacity", PLAN.opacity);
}

// Splits a path into lines, one per floor. Each line is a list of [lng, lat].
// (The stairs sit at the same spot on both floors, so the lines still touch.)
function pathToLines(path) {
  const lines = [];
  path.forEach((id) => {
    const floor = NODES[id].floor;
    const last = lines[lines.length - 1];
    if (last && last.floor === floor) {
      last.coords.push(toLngLat(id));
    } else {
      lines.push({ floor: floor, coords: [toLngLat(id)] });
    }
  });
  return lines.filter((line) => line.coords.length >= 2);
}

// routes = [{ key: "bfs", path: [...] }, ...]
function drawRoutes(routes) {
  const features = [];
  routes.forEach((route) => {
    pathToLines(route.path).forEach((line) => {
      features.push({
        type: "Feature",
        properties: { algo: route.key, floor: line.floor },
        geometry: { type: "LineString", coordinates: line.coords }
      });
    });
  });
  map.getSource("routes").setData({ type: "FeatureCollection", features });
  const ids = [];
  routes.forEach((route) => route.path.forEach((id) => { if (ids.indexOf(id) < 0) ids.push(id); }));
  showRouteDots(ids);
}

function clearRoutes() {
  map.getSource("routes").setData(emptyCollection());
  showRouteDots([]);
}

// Highlight one floor and show only that floor's part of the route.
// floor = null shows everything.
function setFloor(floor) {
  shownFloor = floor;
  if (threeActive) campus3dSetFloor(floor);
  if (roomViewId) updateRoomView();                    // the room view opens the floor you picked
  map.setPaintProperty("floors-3d", "fill-extrusion-color", floorColorExpression(floor));

  const onFloor = floor === null ? null : ["==", ["get", "floor"], floor];
  Object.keys(ALGORITHMS).forEach((key) => {
    const ofAlgo = ["==", ["get", "algo"], key];
    map.setFilter("route-" + key, onFloor ? ["all", ofAlgo, onFloor] : ofAlgo);
  });
  map.setFilter("routes-casing", onFloor);
  map.setFilter("routes-glow", onFloor);
  if (map.getLayer("routes-arrows")) map.setFilter("routes-arrows", onFloor);
}


/* ===== 5. MARKERS AND CAMERA ===== */

// Yellow pulsing dot at the destination (the pulse is in style.css).
// Lights up the rectangle of the chosen room (nothing if it has no rectangle)
/* ===== ROOM VIEW =====
   Choose a room (D118, O-104...) and its building opens like a dollhouse on that floor:
   the outer walls stay, the rooms inside show with their names, and your room is gold.
   3D with campus3d.js draws it with Three.js; otherwise (2D) the map draws the rooms + name tags. */
let destinationPin = null;      // the round pin on the room
let roomViewId = null;          // the room you chose
let roomMarkers = [];           // name tags on the map (2D)

// Rooms of one building floor: [{ id, name, x1, y1, x2, y2, chosen }]
function roomsOnFloor(buildingId, floor, chosenId) {
  if (typeof ROOM_AREAS === "undefined") return [];
  const seen = {};
  const list = [];
  Object.keys(ROOM_AREAS).forEach((key) => {
    const node = NODES[key], a = ROOM_AREAS[key];
    if (!node || node.hidden || node.building !== buildingId || a[0] !== floor) return;
    const spot = a.slice(1).map(Math.round).join(",");           // two rooms on one rectangle: show one
    const room = { id: key, name: node.name.replace(/^Room\s+/i, ""), x1: a[1], y1: a[2], x2: a[3], y2: a[4], chosen: key === chosenId };
    if (seen[spot] === undefined) { seen[spot] = list.length; list.push(room); }
    else if (room.chosen) list[seen[spot]] = room;
  });
  return list;
}

function clearRoomMarkers() {
  roomMarkers.forEach((m) => m.remove());
  roomMarkers = [];
}

function highlightRoom(id) {
  roomViewId = id || null;
  updateRoomView();
}

// Draw (or clear) the room view for the chosen room. Call again when the floor changes.
function updateRoomView() {
  clearRoomMarkers();
  const node = roomViewId ? NODES[roomViewId] : null;
  showPinOnFloor(node);
  const area = node && typeof ROOM_AREAS !== "undefined" ? ROOM_AREAS[roomViewId] : null;
  const floor = shownFloor || (area ? area[0] : 1);
  const rooms = area && node.building ? roomsOnFloor(node.building, floor, roomViewId) : [];
  const inThree = threeActive && is3DView;

  if (threeActive) campus3dSetRooms(rooms, floor);
  if (!map || !map.getSource("room-area")) return;
  ["room-area", "room-area-line"].forEach((layer) => {
    if (map.getLayer(layer)) map.setLayoutProperty(layer, "visibility", inThree ? "none" : "visible");
  });
  map.getSource("room-area").setData({
    type: "FeatureCollection",
    features: inThree ? [] : rooms.map((r) => ({
      type: "Feature",
      properties: { chosen: r.chosen },
      geometry: { type: "Polygon", coordinates: [toRing([[r.x1, r.y1], [r.x2, r.y1], [r.x2, r.y2], [r.x1, r.y2]])] }
    }))
  });
  if (inThree) return;
  rooms.forEach((r) => {                                          // name tags (2D)
    const el = document.createElement("div");
    el.className = "room-tag" + (r.chosen ? " chosen" : "");
    el.textContent = r.name;
    roomMarkers.push(new maplibregl.Marker({ element: el }).setLngLat(planToLngLat((r.x1 + r.x2) / 2, (r.y1 + r.y2) / 2)).addTo(map));
  });
}

// The pin (and the gold room) only show on the floor the room is on: pick another floor and it hides.
function showPinOnFloor(node) {
  if (!destinationPin) return;
  const onFloor = !node || !shownFloor || node.floor === shownFloor;
  const drawnInThree = threeActive && is3DView && node && node.building;   // campus3d.js draws the pin on the floor itself
  destinationPin.style.display = onFloor && !drawnInThree ? "" : "none";
}

// Fly close to the room so the opened building fills the screen.
function flyToRoom(id, padding) {
  const area = typeof ROOM_AREAS !== "undefined" ? ROOM_AREAS[id] : null;
  if (!area) return false;
  const c = planToLngLat((area[1] + area[3]) / 2, (area[2] + area[4]) / 2);
  map.easeTo({
    center: c,
    zoom: 20,
    padding: padding,                                 // keep the room clear of the panels
    pitch: is3DView ? 55 : 0,
    bearing: is3DView ? MAP_START.bearing : planUpBearing(),
    duration: 1600
  });
  return true;
}

function showDestination(id) {
  highlightRoom(id);
  setFocusBuilding(id ? buildingOfNode(id) : null);     // only this building opens into floors 1, 2, 3
  if (destinationMarker) {
    destinationMarker.remove();
    destinationMarker = null;
  }
  if (!id) return;

  const el = document.createElement("div");
  el.className = "dest-pin";
  destinationPin = el;
  showPinOnFloor(NODES[id]);
  destinationMarker = new maplibregl.Marker({ element: el }).setLngLat(toLngLat(id)).addTo(map);
}

// Blue dot = you (like Google Maps): a dot, a pulsing halo, a pale circle for the
// GPS accuracy, and a small beam showing the direction you walk (when the phone knows it).
//   meters  = accuracy radius, or undefined for none (test mode)
//   heading = degrees clockwise from north, or null
function showUser(lat, lng, meters, heading) {
  if (!userMarker) {
    const el = document.createElement("div");
    el.className = "user-dot";
    el.innerHTML = '<span class="user-halo"></span><span class="user-beam"></span><span class="user-core"></span>';
    userMarker = new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map);
    map.on("rotate", () => pointBeam());   // keep the beam right when the map turns
  } else {
    userMarker.setLngLat([lng, lat]);
  }

  userHeading = (typeof heading === "number" && !isNaN(heading)) ? heading : null;
  pointBeam();

  const circle = meters > 0 ? circlePolygon(lat, lng, Math.min(meters, 150)) : null;
  map.getSource("user-accuracy").setData(circle ? { type: "FeatureCollection", features: [circle] } : emptyCollection());
}

// Turn the direction beam (hidden when there is no heading).
function pointBeam() {
  if (!userMarker) return;
  const el = userMarker.el || userMarker.getElement && userMarker.getElement();
  const beam = el && el.querySelector(".user-beam");
  if (!beam) return;
  if (userHeading === null) {
    beam.style.display = "none";
    return;
  }
  const bearing = map.getBearing ? map.getBearing() : 0;
  beam.style.display = "block";
  beam.style.webkitTransform = beam.style.transform = "rotate(" + (userHeading - bearing) + "deg)";
}

// A circle of `meters` radius around a point, as a GeoJSON polygon (64 corners).
function circlePolygon(lat, lng, meters) {
  const ring = [];
  const metersPerDegLng = metersPerDegreeLng();
  for (let i = 0; i <= 64; i++) {
    const angle = (i / 64) * 2 * Math.PI;
    ring.push([lng + (meters * Math.cos(angle)) / metersPerDegLng,
               lat + (meters * Math.sin(angle)) / METERS_PER_DEGREE]);
  }
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } };
}

// The pulsing circle at the Main Gate (drawn as 3 rings that grow and fade). visible=false hides it.
function showGateRipple(lat, lng, visible) {
  if (!visible) {
    if (gateRippleMarker) { gateRippleMarker.remove(); gateRippleMarker = null; }
    return;
  }
  if (!gateRippleMarker) {
    const el = document.createElement("div");
    el.className = "gate-ripple";
    el.innerHTML = "<i></i><i></i><i></i>";
    gateRippleMarker = new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map);
  } else {
    gateRippleMarker.setLngLat([lng, lat]);    // the plan may have moved
  }
}

// Keep the camera on you while you walk (zoom and tilt stay as they are).
function followUser(lat, lng) {
  map.easeTo({ center: [lng, lat], duration: 500 });
}

// Run fn when the user drags the map with a finger or mouse.
function onMapDrag(fn) {
  map.on("dragstart", fn);
}

// Zoom to the route and turn the camera so the route points up the screen.
// padding = space (px) that the panels cover, so the route stays visible.
function flyToRoute(path, padding) {
  if (flyToRoom(path[path.length - 1], padding)) return;       // a room with a known area: go close to it
  const bounds = new maplibregl.LngLatBounds();
  path.forEach((id) => bounds.extend(toLngLat(id)));

  const first = NODES[path[0]];
  const last = NODES[path[path.length - 1]];

  map.fitBounds(bounds, {
    padding: padding,
    maxZoom: 20.5,
    pitch: is3DView ? TILT_3D : 0,
    bearing: is3DView ? bearingDegrees(first, last) : planUpBearing(),   // 2D: the plan stays straight
    duration: 1600
  });
}

// The compass direction that makes the plan picture look straight (its top edge up).
function planUpBearing() {
  return ((PLAN.rotation % 360) + 360) % 360;
}

// The campus plus a little room around it. In 2D the map cannot be dragged past this.
function campusBounds() {
  const bounds = new maplibregl.LngLatBounds();
  planCorners().forEach((corner) => bounds.extend(corner));
  const pad = FLAT_EDGE_METERS;
  return new maplibregl.LngLatBounds(
    [bounds.getWest() - pad / metersPerDegreeLng(), bounds.getSouth() - pad / METERS_PER_DEGREE],
    [bounds.getEast() + pad / metersPerDegreeLng(), bounds.getNorth() + pad / METERS_PER_DEGREE]);
}

function focusOn(lat, lng, zoom) {
  map.easeTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), zoom || 18.5), duration: 1200 });
}

// Look at the Main Gate, in the middle of the screen, with a smooth swoop.
// This is the camera's home: it is used when the app opens, and whenever you are not on the campus
// yet (even from far away). The camera never turns by itself: only the tilt and zoom animate.
function showGate(zoom) {
  const gate = NODES[GATE_NODE_ID];
  map.easeTo({
    center: [gate.lng, gate.lat],
    zoom: zoom || GATE_ZOOM,
    pitch: is3DView ? TILT_3D : 0,
    bearing: is3DView ? MAP_START.bearing : planUpBearing(),
    duration: 2000,
    easing: (t) => 1 - Math.pow(1 - t, 3)      // starts fast, lands softly
  });
}

// 3D = tilted camera with the building blocks, free to turn.
// 2D = flat and straight like Google Maps: you can only slide it (up, down, left, right) and zoom,
//      and it stops at the edge of the campus.
function setTilt(is3D) {
  is3DView = is3D;
  applyGroundVisibility();
  setStreetMap(streetShown);                                // 3D color look has a dark background
  lockFlatView(!is3D);
  if (is3D) {
    map.easeTo({ pitch: TILT_3D, bearing: MAP_START.bearing, duration: 700 });
  } else {
    map.easeTo({ pitch: 0, bearing: planUpBearing(), duration: 700 });
  }
}

// on = true: no turning, no tilting, edge limits.  on = false: free like 3D.
function lockFlatView(on) {
  if (on) {
    map.dragRotate.disable();                      // right-drag turn / tilt
    map.touchZoomRotate.disableRotation();         // two-finger turn
    map.touchPitch.disable();                      // two-finger tilt
    map.keyboard.disableRotation();
    map.setMinZoom(FLAT_MIN_ZOOM);
    map.setMaxBounds(campusBounds());
  } else {
    map.dragRotate.enable();
    map.touchZoomRotate.enableRotation();
    map.touchPitch.enable();
    map.keyboard.enableRotation();
    map.setMaxBounds(null);
    map.setMinZoom(MIN_ZOOM_3D);
  }
}


/* ===== 6. CLICKS AND POPUPS ===== */

// handler receives { lat, lng, nodeId }  (nodeId is null if no place was tapped)
function onMapClick(handler) {
  map.on("click", (e) => {
    let nodeId = null;
    if (map.getLayer("nodes-hit")) {
      // A box around the tap makes small dots easy to hit with a finger.
      const box = [[e.point.x - 12, e.point.y - 12], [e.point.x + 12, e.point.y + 12]];
      const hits = map.queryRenderedFeatures(box, { layers: ["nodes-hit"] });
      if (hits.length > 0) nodeId = hits[0].properties.id;
    }
    handler({ lat: e.lngLat.lat, lng: e.lngLat.lng, nodeId: nodeId });
  });
}

function showPopup(lat, lng, html) {
  if (openPopup) openPopup.remove();
  openPopup = new maplibregl.Popup({ closeButton: false, offset: 12 })
    .setLngLat([lng, lat])
    .setHTML(html)
    .addTo(map);
}