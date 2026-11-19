/* =====================================================================
   app.js  -  the page: buttons, search, GPS and showing the route
   Uses graph.js (algorithms) and map3d.js (the 3D map).

   1. Page elements + state     5. Location (GPS)
   2. Small helpers             6. Routing
   3. Start-up setup            7. Events
   4. Floors, view, plan tools  8. Start
   ===================================================================== */


/* ===== 1. PAGE ELEMENTS + STATE ===== */

const $ = (id) => document.getElementById(id);

const hud          = $("hud");
const sheet        = $("sheet");
const sheetToggle  = $("sheetToggle");
const viewToggle   = $("viewToggle");
const floorPicker  = $("floorPicker");
const searchForm   = $("searchForm");
const roomInput    = $("roomInput");
const startSelect  = $("startSelect");
const algoSelect   = $("algoSelect");
const locateButton = $("locateButton");
const testMode     = $("testMode");
const coordMode    = $("coordMode");
const statusBox    = $("status");
const resultsBox   = $("results");

// "Line up the plan" tools
const planRotation = $("planRotation");
const planSize     = $("planSize");
const planOpacity  = $("planOpacity");
const planMove     = $("planMove");
const streetMap    = $("streetMap");
const planReadout  = $("planReadout");
const nudgeButtons = document.querySelectorAll("[data-nudge]");

// Every floor number that exists, like [1, 2]: the highest floor of any place or building.
const FLOOR_COUNT = Math.max.apply(null,
  Object.keys(NODES).map((id) => NODES[id].floor)
    .concat(BUILDINGS.map((b) => b.floors || DEFAULT_FLOORS)));
const FLOORS = Array.from({ length: FLOOR_COUNT }, (_, i) => i + 1);

let mapReady = false;        // true once the 3D map has loaded
let destinationId = null;    // the room the user asked for
let userPos = null;          // { lat, lng } of the user (real GPS or test click)
let lastStartId = null;      // last node we routed from (avoids redrawing too often)
let watchId = null;          // id of the GPS watcher
let activeFloor = null;      // selected floor, or null for "all floors"
let is3D = true;
let hasFocusedOnUser = false;
let switchedToMyLocation = false;   // true once "Start from" switched to "my location" by itself


/* ===== 2. SMALL HELPERS ===== */

function setStatus(text) {
  statusBox.textContent = text;
}

// Space (px) the panels cover on the map, so the route is not hidden behind them.
function cameraPadding() {
  const w = window.innerWidth;
  const h = window.innerHeight;

  if (w >= 820) {
    return { top: 60, bottom: 60, right: 60, left: Math.min(hud.getBoundingClientRect().right + 40, w * 0.5) };
  }
  return {
    top: Math.min(hud.getBoundingClientRect().bottom + 30, h * 0.4),
    bottom: Math.min(h - sheet.getBoundingClientRect().top + 30, h * 0.4),
    left: 30,
    right: 30
  };
}


/* ===== 3. START-UP SETUP ===== */

// Fill the "Start from" dropdown.
function fillStartSelect() {
  startSelect.innerHTML =
    '<option value="gps">Auto (my location)</option>' +
    Object.keys(NODES).map((id) => `<option value="${id}">${NODES[id].name}</option>`).join("");

  // Until the phone finds you, directions start from DEFAULT_START (the main gate).
  if (NODES[DEFAULT_START]) startSelect.value = DEFAULT_START;
}


/* ===== 4. FLOORS + VIEW BUTTONS ===== */

// Round "elevator" buttons: All, 1, 2, ...
function buildFloorPicker() {
  const choices = [{ label: "All", floor: null }].concat(
    FLOORS.map((floor) => ({ label: String(floor), floor: floor }))
  );

  choices.forEach((choice) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = choice.floor === null ? "floor-btn all" : "floor-btn";
    button.textContent = choice.label;
    button.dataset.floor = choice.floor === null ? "all" : String(choice.floor);
    button.setAttribute("aria-label", choice.floor === null ? "All floors" : "Floor " + choice.floor);
    button.addEventListener("click", () => selectFloor(choice.floor));
    floorPicker.appendChild(button);
  });

  selectFloor(null);
}

function selectFloor(floor) {
  activeFloor = floor;
  const wanted = floor === null ? "all" : String(floor);
  Array.from(floorPicker.children).forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.floor === wanted));
  });
  if (mapReady) setFloor(floor);
}

function toggleView() {
  is3D = !is3D;
  viewToggle.textContent = is3D ? "3D" : "2D";
  viewToggle.setAttribute("aria-pressed", String(is3D));
  if (mapReady) setTilt(is3D);
}


// Shows the current PLAN numbers, ready to copy into data.js.
function updatePlanReadout() {
  $("planRotationOut").textContent = PLAN.rotation + "\u00b0";
  $("planSizeOut").textContent = PLAN.metersPerPixel.toFixed(2);
  $("planOpacityOut").textContent = Math.round(PLAN.opacity * 100) + "%";

  planReadout.textContent =
    "lat: " + PLAN.lat.toFixed(6) + ",\n" +
    "lng: " + PLAN.lng.toFixed(6) + ",\n" +
    "metersPerPixel: " + PLAN.metersPerPixel.toFixed(2) + ",\n" +
    "rotation: " + PLAN.rotation + ",\n" +
    "opacity: " + PLAN.opacity;
}

// Run after any PLAN number changed: places get new lat/lng, the map redraws.
function onPlanChanged() {
  applyPlan();
  if (mapReady) {
    refreshCampus();
    showRoute(false);   // draw the route again on the moved plan
  }
  updatePlanReadout();
}

function bindPlanTools() {
  streetMap.checked = SHOW_STREET_MAP;
  streetMap.addEventListener("change", () => { if (mapReady) setStreetMap(streetMap.checked); });

  planRotation.value = PLAN.rotation;
  planSize.value = PLAN.metersPerPixel;
  planOpacity.value = PLAN.opacity;

  planRotation.addEventListener("input", () => { PLAN.rotation = Number(planRotation.value); onPlanChanged(); });
  planSize.addEventListener("input",     () => { PLAN.metersPerPixel = Number(planSize.value); onPlanChanged(); });
  planOpacity.addEventListener("input",  () => { PLAN.opacity = Number(planOpacity.value); onPlanChanged(); });

  // Arrow buttons: data-nudge="east,north" in meters.
  nudgeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const [east, north] = button.dataset.nudge.split(",").map(Number);
      nudgePlan(east, north);
      onPlanChanged();
    });
  });

  updatePlanReadout();
}


/* ===== 5. LOCATION (GPS) ===== */

// Friendly messages for the three GPS error codes.
const LOCATION_ERRORS = {
  1: "Location is blocked. iPhone: Settings > Privacy > Location Services > Safari Websites. " +
     "Android: tap the lock icon next to the web address, then Permissions.",
  2: "Your phone could not find its position. Try again, ideally outside.",
  3: "Finding your location took too long. Try again."
};

// Called whenever we learn where the user is.
function setUserPosition(lat, lng) {
  userPos = { lat, lng };

  // The first time we know where you are, directions start from you.
  if (!switchedToMyLocation) {
    switchedToMyLocation = true;
    startSelect.value = "gps";
  }

  if (!mapReady) return;

  showUser(lat, lng);

  // The first time we find the user on campus, move the camera to them.
  if (!hasFocusedOnUser && nearestNode(lat, lng).meters <= FAR_FROM_CAMPUS_METERS) {
    hasFocusedOnUser = true;
    focusOn(lat, lng);
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
      setUserPosition(pos.coords.latitude, pos.coords.longitude);
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


/* ===== 6. ROUTING ===== */

function clearRoute() {
  lastStartId = null;   // forget the old start, so the next location update draws the route again
  if (mapReady) {
    clearRoutes();
    showDestination(null);
  }
  resultsBox.innerHTML = "";
}

// Shows one route as a list of steps in the panel. key = "bfs" or "dfs".
function renderSteps(path, key) {
  const algo = ALGORITHMS[key];
  const heading = document.createElement("h3");
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
// fitMap = true moves the camera to the route (only do this when the user presses Go).
function showRoute(fitMap) {
  if (!mapReady) {
    setStatus("The 3D map is still loading. Try again in a moment.");
    return;
  }

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

  drawRoutes(routes);
  routes.forEach((route) => renderSteps(route.path, route.key));
  showDestination(destinationId);

  let message = `Directions to ${NODES[destinationId].name} (from ${NODES[start.id].name}).`;
  if (start.meters > FAR_FROM_CAMPUS_METERS) {
    message += ` Warning: you are about ${Math.round(start.meters)} m from the nearest campus point.`;
  }
  setStatus(message);

  if (fitMap) flyToRoute(routes[0].path, cameraPadding());
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


/* ===== 7. EVENTS ===== */

function bindEvents() {
  // A <form> makes both the Go button and the phone keyboard's Go key work.
  searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    onGo();
  });

  locateButton.addEventListener("click", startTracking);
  startSelect.addEventListener("change", () => showRoute(false));
  algoSelect.addEventListener("change", () => showRoute(false));
  viewToggle.addEventListener("click", toggleView);

  // Hide or show the directions panel so the map gets more room.
  sheetToggle.addEventListener("click", () => {
    const collapsed = sheet.classList.toggle("collapsed");
    sheetToggle.textContent = collapsed ? "Show" : "Hide";
    sheetToggle.setAttribute("aria-expanded", String(!collapsed));
  });
}

// Map clicks: test mode moves "you", coordinate helper shows lat/lng,
// tapping a place shows its name.
function handleMapClick(click) {
  // "Move plan": the tapped spot becomes the new center of the plan.
  if (planMove.checked) {
    PLAN.lat = click.lat;
    PLAN.lng = click.lng;
    onPlanChanged();
    return;
  }

  if (testMode.checked) {
    setUserPosition(click.lat, click.lng);
    if (!destinationId) setStatus("Test location set. Type a room and press Go.");
  }

  if (coordMode.checked) {
    const spot = lngLatToPlan(click.lng, click.lat);   // where that is on the plan picture
    showPopup(click.lat, click.lng,
      `x: ${Math.round(spot.x)}, y: ${Math.round(spot.y)}<br><small>plan pixels: copy into NODES</small>`);
  } else if (click.nodeId) {
    const node = NODES[click.nodeId];
    showPopup(node.lat, node.lng, `<strong>${node.name}</strong><br>Floor ${node.floor}`);
  }
}


/* ===== 8. START ===== */

function start() {
  fillStartSelect();
  buildFloorPicker();
  bindEvents();
  bindPlanTools();

  try {
    createMap("map");
  } catch (err) {
    // No WebGL: very old phone, or WebGL switched off.
    console.error(err);
    setStatus("This phone or browser can't show the 3D map (it needs WebGL). Try a newer browser, or use the flat map version.");
    return;
  }

  setStatus("Loading the 3D map...");

  onMapReady(() => {
    mapReady = true;
    setStreetMap(streetMap.checked);   // in case the box was ticked while the map was loading
    onMapClick(handleMapClick);
    setStatus("Type a room and press Go.");
  });

  // If the map never loads (no internet?), say so instead of staying silent.
  setTimeout(() => {
    if (!mapReady) setStatus("The map is taking a long time to load. Check your internet connection.");
  }, 12000);
}

start();