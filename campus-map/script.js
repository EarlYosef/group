/* =====================================================================
   SAC Campus Navigator

   Uses plain ES2015 JavaScript (no build step) so it also runs on older
   phones: iPhone (iOS 10 and up) and Android phones with an updated Chrome.

   HOW TO USE WITH YOUR REAL CAMPUS
   1. Turn on "Coordinate helper", click the spots on the map, and copy
      the lat/lng it shows into NODES below.
   2. Add every place (gate, hallway, stairs, room) as a node in NODES.
   3. Connect places that you can walk between directly in EDGES.
   4. Change MAP_CENTER if the map opens in the wrong place.

   FILE MAP
   1. Campus data (change this)    5. Map
   2. Graph + algorithms           6. Location (GPS)
   3. Helpers                      7. Routing + drawing
   4. Page elements + state        8. Events
   ===================================================================== */


/* ===== 1. CAMPUS DATA (CHANGE THIS PART) ===== */

// Where the map opens: St. Anthony's College, San Jose, Antique.
const MAP_CENTER = [10.74236, 121.94186];

// Every place. The key (like "D112") is what the user types.
// NOTE: these places are SAMPLES placed around the school's map location.
// They are not the real buildings yet. Replace them using the Coordinate helper.
// floor: 1 = ground floor, 2 = second floor, etc.
const NODES = {
  GATE:        { name: "Main Gate",           lat: 10.74201, lng: 121.94166, floor: 1 },
  COURTYARD:   { name: "Courtyard",           lat: 10.74216, lng: 121.94186, floor: 1 },
  LIBRARY:     { name: "Library",             lat: 10.74216, lng: 121.94156, floor: 1 },
  CANTEEN:     { name: "Canteen",             lat: 10.74236, lng: 121.94211, floor: 1 },
  D_ENTRANCE:  { name: "D Building Entrance", lat: 10.74231, lng: 121.94186, floor: 1 },
  D_HALL_1F:   { name: "D Hallway (1F)",      lat: 10.74246, lng: 121.94186, floor: 1 },
  D101:        { name: "Room D101",           lat: 10.74246, lng: 121.94171, floor: 1 },
  D112:        { name: "Room D112",           lat: 10.74246, lng: 121.94204, floor: 1 },
  D_STAIRS_1F: { name: "D Stairs (1F)",       lat: 10.74256, lng: 121.94186, floor: 1 },
  D_STAIRS_2F: { name: "D Stairs (2F)",       lat: 10.74256, lng: 121.94186, floor: 2 },
  D_HALL_2F:   { name: "D Hallway (2F)",      lat: 10.74256, lng: 121.94194, floor: 2 },
  D201:        { name: "Room D201",           lat: 10.74256, lng: 121.94176, floor: 2 },
  D210:        { name: "Room D210",           lat: 10.74256, lng: 121.94208, floor: 2 }
};

// Walkable connections. Each pair works in BOTH directions.
const EDGES = [
  ["GATE", "COURTYARD"],
  ["COURTYARD", "LIBRARY"],
  ["COURTYARD", "CANTEEN"],
  ["COURTYARD", "D_ENTRANCE"],
  ["CANTEEN", "D_ENTRANCE"],        // a second route, so BFS and DFS can differ
  ["D_ENTRANCE", "D_HALL_1F"],
  ["D_HALL_1F", "D101"],
  ["D_HALL_1F", "D112"],
  ["D_HALL_1F", "D_STAIRS_1F"],
  ["D_STAIRS_1F", "D_STAIRS_2F"],
  ["D_STAIRS_2F", "D_HALL_2F"],
  ["D_HALL_2F", "D201"],
  ["D_HALL_2F", "D210"]
];

// If the user is farther than this (meters) from every point, warn them.
const FAR_FROM_CAMPUS_METERS = 300;


/* ===== 2. GRAPH + ALGORITHMS ===== */

// Adjacency list: graph["GATE"] = ["COURTYARD"], graph["COURTYARD"] = ["GATE", "LIBRARY", ...]
const graph = {};
for (const id in NODES) {
  graph[id] = [];
}
for (const [a, b] of EDGES) {
  if (!NODES[a] || !NODES[b]) {
    console.error("EDGES has an unknown node:", a, b);
    continue;
  }
  graph[a].push(b);
  graph[b].push(a);
}

// Walks back through cameFrom to build the path: start ... goal
function buildPath(cameFrom, goal) {
  const path = [];
  let current = goal;
  while (current !== null) {
    path.unshift(current);
    current = cameFrom[current];
  }
  return path;
}

// BFS: explores level by level, so the first time it reaches the goal
// it has used the fewest steps.
function bfs(start, goal) {
  const queue = [start];
  const cameFrom = { [start]: null };   // also acts as the "visited" list

  while (queue.length > 0) {
    const current = queue.shift();      // take from the FRONT (queue)
    if (current === goal) return buildPath(cameFrom, goal);

    for (const next of graph[current]) {
      if (!(next in cameFrom)) {
        cameFrom[next] = current;
        queue.push(next);               // add to the BACK
      }
    }
  }
  return null;                          // no route exists
}

// DFS: goes as deep as possible first, then backs up.
// It finds A path, but not always the shortest one.
function dfs(current, goal, visited = new Set(), path = []) {
  visited.add(current);
  path.push(current);

  if (current === goal) return path;

  for (const next of graph[current]) {
    if (!visited.has(next)) {
      const result = dfs(next, goal, visited, path);
      if (result) return result;
    }
  }

  path.pop();                           // dead end: back up
  return null;
}

// Everything the page needs to know about each algorithm, in one place.
// To add another one, write the function above and add a line here.
const ALGORITHMS = {
  bfs: { label: "BFS", color: "#08a597", dashed: false, find: bfs },   // teal, solid line
  dfs: { label: "DFS", color: "#e0457b", dashed: true,  find: dfs }    // pink, dashed line
};


/* ===== 3. HELPERS ===== */

// "d 112" and "D112" should mean the same thing.
function normalize(text) {
  return text.trim().toUpperCase().replace(/\s+/g, "");
}

// Turns what the user typed ("d112", "main gate") into a node id.
function findNodeFromText(text) {
  const wanted = normalize(text);
  if (wanted === "") return null;

  for (const id in NODES) {
    if (id === wanted || normalize(NODES[id].name) === wanted) return id;
  }
  return null;
}

// Map position of a node: [lat, lng]
function toLatLng(id) {
  return [NODES[id].lat, NODES[id].lng];
}

// Distance in meters between two lat/lng points (haversine formula).
function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.pow(Math.sin(dLat / 2), 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.pow(Math.sin(dLng / 2), 2);
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Finds the closest ground-floor node to a position.
// (GPS can't tell floors, so we only snap to floor 1.)
function nearestNode(lat, lng) {
  let bestId = null;
  let bestMeters = Infinity;
  for (const id in NODES) {
    if (NODES[id].floor !== 1) continue;
    const meters = distanceMeters(lat, lng, NODES[id].lat, NODES[id].lng);
    if (meters < bestMeters) {
      bestMeters = meters;
      bestId = id;
    }
  }
  return { id: bestId, meters: bestMeters };
}


/* ===== 4. PAGE ELEMENTS + STATE ===== */

const $ = (id) => document.getElementById(id);

const searchForm   = $("searchForm");
const roomInput    = $("roomInput");
const startSelect  = $("startSelect");
const algoSelect   = $("algoSelect");
const locateButton = $("locateButton");
const testMode     = $("testMode");
const coordMode    = $("coordMode");
const statusBox    = $("status");
const resultsBox   = $("results");
const panel        = $("panel");
const panelToggle  = $("panelToggle");

let destinationId = null;   // the room the user asked for
let userPos = null;         // { lat, lng } of the user (real GPS or test click)
let lastStartId = null;     // last node we routed from (avoids redrawing too often)
let watchId = null;         // id of the GPS watcher

function setStatus(text) {
  statusBox.textContent = text;
}

// Fill the "Start from" dropdown.
startSelect.innerHTML =
  '<option value="gps">Auto (my location)</option>' +
  Object.keys(NODES).map((id) => `<option value="${id}">${NODES[id].name}</option>`).join("");


/* ===== 5. MAP ===== */

const USER_COLOR = "#1a73e8";   // blue dot = you

const map = L.map("map").setView(MAP_CENTER, 19);

L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 21,
  maxNativeZoom: 19,
  attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

// Small dots for every node so you can SEE your graph while testing.
for (const id in NODES) {
  L.circleMarker(toLatLng(id), { radius: 4, color: "#555", weight: 1, fillOpacity: 0.7 })
    .addTo(map)
    .bindTooltip(`${NODES[id].name} (floor ${NODES[id].floor})`);
}

let routeLayers = [];          // lines currently drawn for the route
let destinationMarker = null;  // yellow dot at the destination
let userMarker = null;         // the blue dot
let accuracyCircle = null;     // light circle showing GPS accuracy


/* ===== 6. LOCATION (GPS) ===== */

// Friendly messages for the three GPS error codes.
const LOCATION_ERRORS = {
  1: "Location is blocked. iPhone: Settings > Privacy > Location Services > Safari Websites. " +
     "Android: tap the lock icon next to the web address, then Permissions.",
  2: "Your phone could not find its position. Try again, ideally outside.",
  3: "Finding your location took too long. Try again."
};

// Called whenever we learn where the user is.
function setUserPosition(lat, lng, accuracy) {
  userPos = { lat, lng };

  if (!userMarker) {
    userMarker = L.circleMarker([lat, lng], {
      radius: 8, color: "white", weight: 2, fillColor: USER_COLOR, fillOpacity: 1
    }).addTo(map);
    accuracyCircle = L.circle([lat, lng], {
      radius: accuracy || 5, color: USER_COLOR, weight: 1, fillOpacity: 0.1
    }).addTo(map);
  } else {
    userMarker.setLatLng([lat, lng]);
    accuracyCircle.setLatLng([lat, lng]);
    accuracyCircle.setRadius(accuracy || 5);
  }

  // Only re-route if the nearest node changed (the user moved to a new spot).
  if (destinationId && startSelect.value === "gps" && nearestNode(lat, lng).id !== lastStartId) {
    showRoute(false);
  }
}

function startTracking() {
  if (!("geolocation" in navigator)) {
    setStatus("This browser has no location support. Use the 'Start from' dropdown instead.");
    return;
  }
  if (window.isSecureContext === false) {
    setStatus("Location only works on HTTPS (or localhost). Open the hosted link instead of a local file.");
    return;
  }
  if (watchId !== null) return;  // already tracking

  setStatus("Asking for your location...");
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      if (testMode.checked) return;  // in test mode we ignore real GPS
      setUserPosition(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
      if (!destinationId) {
        setStatus(`Location found (accurate to about ${Math.round(pos.coords.accuracy)} m). Type a room and press Go.`);
      }
    },
    (err) => {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
      setStatus((LOCATION_ERRORS[err.code] || "Could not get your location.") +
                " You can still pick a start from the dropdown.");
    },
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }
  );
}


/* ===== 7. ROUTING + DRAWING ===== */

function clearRoute() {
  routeLayers.forEach((layer) => map.removeLayer(layer));
  routeLayers = [];
  if (destinationMarker) {
    map.removeLayer(destinationMarker);
    destinationMarker = null;
  }
  resultsBox.innerHTML = "";
}

// Draws one route on the map. key = "bfs" or "dfs".
function drawPath(path, key) {
  const algo = ALGORITHMS[key];
  const line = L.polyline(path.map(toLatLng), {
    color: algo.color,
    weight: 5,
    opacity: 0.8,
    dashArray: algo.dashed ? "8 8" : null
  }).addTo(map);
  routeLayers.push(line);
}

// Shows one route as a list of steps in the panel. key = "bfs" or "dfs".
function renderSteps(path, key) {
  const algo = ALGORITHMS[key];
  const heading = document.createElement("h2");
  const list = document.createElement("ol");

  // style.css reads --route (line color) and data-algo (DFS is dashed).
  [heading, list].forEach((el) => {
    el.style.setProperty("--route", algo.color);
    el.dataset.algo = key;
  });

  heading.textContent = `${algo.label}: ${path.length - 1} steps`;

  path.forEach((id, i) => {
    const item = document.createElement("li");
    item.textContent = NODES[id].name;
    if (i > 0 && NODES[id].floor !== NODES[path[i - 1]].floor) {
      item.textContent += ` (go to floor ${NODES[id].floor})`;
    }
    list.appendChild(item);
  });

  resultsBox.appendChild(heading);
  resultsBox.appendChild(list);
}

// Where does the route start? Returns { id, meters } or null if we don't know yet.
// meters = how far the user is from that point (0 when picked from the dropdown).
function getStart() {
  if (startSelect.value !== "gps") return { id: startSelect.value, meters: 0 };
  if (!userPos) return null;
  return nearestNode(userPos.lat, userPos.lng);
}

// Main function: find the start, run the algorithm(s), draw.
// fitMap = true zooms the map to the route (only do this when the user presses Go).
function showRoute(fitMap) {
  clearRoute();
  if (!destinationId) return;

  const start = getStart();
  if (!start) {
    setStatus("Waiting for your location... or pick a starting point from the dropdown.");
    return;
  }
  lastStartId = start.id;

  // Run the chosen algorithm(s). "both" runs BFS and DFS.
  const keys = algoSelect.value === "both" ? ["bfs", "dfs"] : [algoSelect.value];
  const routes = keys.map((key) => ({ key, path: ALGORITHMS[key].find(start.id, destinationId) }));

  if (routes.some((route) => route.path === null)) {
    setStatus("No route found. Check that your EDGES connect these places.");
    return;
  }

  routes.forEach((route) => {
    drawPath(route.path, route.key);
    renderSteps(route.path, route.key);
  });

  destinationMarker = L.circleMarker(toLatLng(destinationId), {
    radius: 9, color: "#0b2e38", weight: 3, fillColor: "#ffc72c", fillOpacity: 1
  }).addTo(map);

  let message = `Directions to ${NODES[destinationId].name} (from ${NODES[start.id].name}).`;
  if (start.meters > FAR_FROM_CAMPUS_METERS) {
    message += ` Warning: you are about ${Math.round(start.meters)} m from the nearest campus point.`;
  }
  setStatus(message);

  if (fitMap) {
    map.fitBounds(routes[0].path.map(toLatLng), { padding: [40, 40], maxZoom: 20 });
  }
}

// Runs when the user presses Go (or the keyboard's Go/Enter key).
function onGo() {
  const found = findNodeFromText(roomInput.value);
  if (!found) {
    destinationId = null;
    clearRoute();
    setStatus(`"${roomInput.value}" was not found. Try something like D112.`);
    return;
  }
  destinationId = found;
  showRoute(true);
}


/* ===== 8. EVENTS ===== */

// A <form> makes both the Go button and the phone keyboard's Go key work.
searchForm.addEventListener("submit", (e) => {
  e.preventDefault();
  onGo();
});

locateButton.addEventListener("click", startTracking);
startSelect.addEventListener("change", () => showRoute(false));
algoSelect.addEventListener("change", () => showRoute(false));

// Phones: hide/show the details so the map gets more room.
panelToggle.addEventListener("click", () => {
  const collapsed = panel.classList.toggle("collapsed");
  panelToggle.textContent = collapsed ? "Show details" : "Hide details";
  panelToggle.setAttribute("aria-expanded", String(!collapsed));
  map.invalidateSize();   // tell Leaflet the map area changed size
});

// Map clicks: test mode moves "you", coordinate helper shows lat/lng.
map.on("click", (e) => {
  if (testMode.checked) {
    setUserPosition(e.latlng.lat, e.latlng.lng, 5);
    if (!destinationId) setStatus("Test location set. Type a room and press Go.");
  }

  if (coordMode.checked) {
    L.popup()
      .setLatLng(e.latlng)
      .setContent(`lat: ${e.latlng.lat.toFixed(5)}<br>lng: ${e.latlng.lng.toFixed(5)}<br><small>copy into NODES</small>`)
      .openOn(map);
  }
});