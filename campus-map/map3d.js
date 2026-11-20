/* =====================================================================
   map3d.js  -  everything that touches the 3D map (MapLibre GL)
   app.js only calls the functions listed here. It never uses the map
   object directly.

   FUNCTIONS app.js CAN USE
   createMap(id)          start the map          onMapReady(fn)     run fn when loaded
   drawRoutes(routes)     draw route lines       clearRoutes()      remove them
   showDestination(id)    pulsing yellow dot     showUser(lat,lng,meters,heading)  blue dot = you
   setFloor(floor)        highlight one floor    setTilt(is3D)      3D or flat view
   flyToRoute(path,pad)   move the camera        focusOn(lat,lng)   center on a point
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

const COLOR_FLOOR        = "#d9a99c";   // a floor that is not selected
const COLOR_FLOOR_ACTIVE = "#e8604c";   // the selected floor
const COLOR_CASING       = "#2d1a15";   // dark brown outline under route lines
const COLOR_USER         = "#1a73e8";   // the blue "you are here" color

let userHeading = null;              // which way you are walking (degrees), or null

let map = null;                      // the MapLibre map (set in createMap)
let is3DView = true;
let userMarker = null;
let gateRippleMarker = null;         // the pulsing circle at the Main Gate
let destinationMarker = null;
let openPopup = null;
let basemapLayerIds = [];            // the street map's own layers (filled when the map loads)
let streetBackground = null;         // the street map's own background color (remembered, to switch it back on)
const readyCallbacks = [];


/* ===== 2. CREATE THE MAP ===== */

// Throws an error if the phone or browser has no WebGL (app.js catches it).
function createMap(containerId) {
  map = new maplibregl.Map({
    container: containerId,
    style: BASEMAP_STYLE,
    center: [PLAN.lng, PLAN.lat],             // [lng, lat]: longitude FIRST
    zoom: MAP_START.zoom,
    pitch: MAP_START.pitch,
    bearing: MAP_START.bearing,
    maxPitch: 78,
    attributionControl: { compact: true }
  });

  // Zoom buttons and a compass. Hidden on phones by style.css.
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");

  map.on("error", (e) => console.warn("Map warning:", e && e.error && e.error.message));

  map.on("load", () => {
    basemapLayerIds = map.getStyle().layers.map((layer) => layer.id);   // remember them before we add ours
    setStreetMap(SHOW_STREET_MAP);
    addCampusLayers();
    readyCallbacks.forEach((fn) => fn());
  });

  return map;
}

function onMapReady(fn) {
  readyCallbacks.push(fn);
}


/* ===== 3. STREET MAP ON / OFF ===== */

// Shows or hides the street map (roads, names, shops). Your plan and campus stay.
// With the street map off, the page shows only your plan on its own paper color.
function setStreetMap(show) {
  map.getContainer().style.background = MAP_BACKGROUND;   // extra safety: same color behind the map

  map.getStyle().layers.forEach((layer) => {
    if (basemapLayerIds.indexOf(layer.id) === -1) return;   // only the street map's own layers

    // The background layer stays on either way: only its color changes.
    if (layer.type === "background") {
      if (streetBackground === null) streetBackground = (layer.paint && layer.paint["background-color"]) || "#f8f4f0";
      map.setPaintProperty(layer.id, "background-color", show ? streetBackground : MAP_BACKGROUND);
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
function buildFloorsGeoJSON() {
  const features = [];
  BUILDINGS.forEach((b) => {
    const floors = b.floors || DEFAULT_FLOORS;
    const rings = [toRing(b.footprint)].concat((b.holes || []).map(toRing));

    for (let floor = 1; floor <= floors; floor++) {
      features.push({
        type: "Feature",
        properties: {
          building: b.id,
          floor: floor,
          base: (floor - 1) * FLOOR_HEIGHT_METERS,
          top: floor * FLOOR_HEIGHT_METERS - FLOOR_GAP_METERS
        },
        geometry: { type: "Polygon", coordinates: rings }
      });
    }
  });
  return { type: "FeatureCollection", features };
}

// One small dot per place, so you can SEE your graph.
function buildNodesGeoJSON() {
  return {
    type: "FeatureCollection",
    features: Object.keys(NODES).map((id) => ({
      type: "Feature",
      properties: { id: id, name: NODES[id].name, floor: NODES[id].floor },
      geometry: { type: "Point", coordinates: toLngLat(id) }
    }))
  };
}

// Colors the selected floor yellow. floor = null means "no floor selected".
function floorColorExpression(floor) {
  return ["case", ["==", ["get", "floor"], floor === null ? -1 : floor], COLOR_FLOOR_ACTIVE, COLOR_FLOOR];
}

function addCampusLayers() {
  map.addSource("plan",   { type: "image", url: PLAN.image, coordinates: planCorners() });
  map.addSource("floors", { type: "geojson", data: buildFloorsGeoJSON() });
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

  map.addLayer({
    id: "floors-3d",
    type: "fill-extrusion",
    source: "floors",
    paint: {
      "fill-extrusion-color": floorColorExpression(null),
      "fill-extrusion-base": ["get", "base"],
      "fill-extrusion-height": ["get", "top"],
      "fill-extrusion-opacity": 0.6
    }
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

  map.addLayer({
    id: "nodes-dots",
    type: "circle",
    source: "nodes",
    paint: {
      "circle-radius": 4.5,
      "circle-color": "#ffffff",
      "circle-stroke-color": COLOR_CASING,
      "circle-stroke-width": 2
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
  map.getSource("floors").setData(buildFloorsGeoJSON());
  map.getSource("nodes").setData(buildNodesGeoJSON());
  map.setPaintProperty("plan-image", "raster-opacity", PLAN.opacity);
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
}

function clearRoutes() {
  map.getSource("routes").setData(emptyCollection());
}

// Highlight one floor and show only that floor's part of the route.
// floor = null shows everything.
function setFloor(floor) {
  map.setPaintProperty("floors-3d", "fill-extrusion-color", floorColorExpression(floor));

  const onFloor = floor === null ? null : ["==", ["get", "floor"], floor];
  Object.keys(ALGORITHMS).forEach((key) => {
    const ofAlgo = ["==", ["get", "algo"], key];
    map.setFilter("route-" + key, onFloor ? ["all", ofAlgo, onFloor] : ofAlgo);
  });
  map.setFilter("routes-casing", onFloor);
}


/* ===== 5. MARKERS AND CAMERA ===== */

// Yellow pulsing dot at the destination (the pulse is in style.css).
function showDestination(id) {
  if (destinationMarker) {
    destinationMarker.remove();
    destinationMarker = null;
  }
  if (!id) return;

  const el = document.createElement("div");
  el.className = "dest-pin";
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
  const bounds = new maplibregl.LngLatBounds();
  path.forEach((id) => bounds.extend(toLngLat(id)));

  const first = NODES[path[0]];
  const last = NODES[path[path.length - 1]];

  map.fitBounds(bounds, {
    padding: padding,
    maxZoom: 20.5,
    pitch: is3DView ? TILT_3D : 0,
    bearing: is3DView ? bearingDegrees(first, last) : 0,
    duration: 1600
  });
}

function focusOn(lat, lng) {
  map.easeTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 18.5), duration: 1200 });
}

// 3D = tilted camera with the building blocks. 2D = flat, just your plan picture.
function setTilt(is3D) {
  is3DView = is3D;
  map.setLayoutProperty("floors-3d", "visibility", is3D ? "visible" : "none");
  map.easeTo({ pitch: is3D ? TILT_3D : 0, duration: 700 });
}


/* ===== 6. CLICKS AND POPUPS ===== */

// handler receives { lat, lng, nodeId }  (nodeId is null if no place was tapped)
function onMapClick(handler) {
  map.on("click", (e) => {
    let nodeId = null;
    if (map.getLayer("nodes-dots")) {
      // A box around the tap makes small dots easy to hit with a finger.
      const box = [[e.point.x - 12, e.point.y - 12], [e.point.x + 12, e.point.y + 12]];
      const hits = map.queryRenderedFeatures(box, { layers: ["nodes-dots"] });
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