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

const dock         = $("dock");          // the glass side panel
const panelToggle  = $("panelToggle");   // round arrow on the panel's edge
const menuButton   = $("menuButton");    // opens the panel
const menuLabel    = $("menuLabel");
const viewToggle   = $("viewToggle");
const viewLabel    = $("viewLabel");
const floorPicker  = $("floorPicker");
const lookToggle   = $("lookToggle");
const lookLabel    = $("lookLabel");
const searchForm   = $("searchForm");
const roomInput    = $("roomInput");
const startSelect  = $("startSelect");
const algoSelect   = $("algoSelect");
const locateButton = $("locateButton");
const themeToggle  = $("themeToggle");   // dark mode switch in the side panel
const myLocation   = $("myLocation");    // round Google-style location button
const testMode     = $("testMode");
const coordMode    = $("coordMode");
const statusBox    = $("status");
const resultsBox   = $("results");
const suggestBox   = $("suggest");       // the list of places that match what you type

// "Line up the plan" tools
const planRotation = $("planRotation");
const planSize     = $("planSize");
const planOpacity  = $("planOpacity");
const planMove     = $("planMove");
const planToMe     = $("planToMe");      // button: put the plan on my GPS spot
const planPin      = $("planPin");       // checkbox: next tap = "I am standing here"
const planReset    = $("planReset");     // button: forget the saved plan numbers
const streetMap    = $("streetMap");
const planReadout  = $("planReadout");
const nudgeButtons = document.querySelectorAll("[data-nudge]");

// Every floor number that exists, like [1, 2]: the highest floor of any place or building.
const EMPTY_STEPS = '<p class="empty">Your route will show here.</p>';
const PHONE_WIDTH = 820;   // narrower than this = phone layout (must match style.css)

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
let is3D = false;   // the app opens in 2D
let lastZone = null;          // where you were at the last GPS fix: "far", "approaching", "campus" or "gate" (see zone.js)
let routePath = null;         // the route on screen (list of place ids), for the AR guide
let following = false;        // true = the camera follows your blue dot
let wantsFocus = false;       // true = the next GPS fix should move the camera to you
let switchedToMyLocation = false;   // true once "Start from" switched to "my location" by itself


/* ===== 2. SMALL HELPERS ===== */

function setStatus(text) {
  statusBox.textContent = text;
}

function isPhone() {
  return window.innerWidth < PHONE_WIDTH;
}

/* ===== DARK MODE ===== */

const THEME_KEY = "sac-theme";          // remembered on this phone: "dark" or "light"

// Dark mode: the choice you made before, else what the phone itself uses.
function initTheme() {
  let dark = !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved) dark = saved === "dark";
  } catch (err) { /* storage blocked: just use the phone's setting */ }

  applyTheme(dark);

  themeToggle.addEventListener("click", () => {
    const nextDark = !document.body.classList.contains("dark");
    applyTheme(nextDark);
    try { localStorage.setItem(THEME_KEY, nextDark ? "dark" : "light"); } catch (err) { /* it just will not be remembered */ }
  });
}

function applyTheme(dark) {
  document.body.classList.toggle("dark", dark);
  themeToggle.setAttribute("aria-pressed", String(dark));
  themeToggle.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");

  const bar = document.querySelector('meta[name="theme-color"]');   // the phone's top bar color
  if (bar) bar.setAttribute("content", dark ? "#17110f" : "#f6f5f1");

  if (mapReady) setMapTheme(dark);
}


// True on phones and tablets (a finger), false on laptops and desktops (a mouse).
// The AR guide needs a camera you can walk around with, so only touch devices get its button.
function isTouchDevice() {
  if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) return true;
  if (window.matchMedia && window.matchMedia("(pointer: fine)").matches) return false;
  return "ontouchstart" in window;           // very old browsers that do not know "pointer"
}

// Open or close the side panel.
function setPanel(open) {
  document.body.classList.toggle("panel-open", open);
  menuButton.setAttribute("aria-expanded", String(open));
  panelToggle.setAttribute("aria-expanded", String(open));
}

// The text on the menu button: "Find a room", or the route once there is one.
function setMenuLabel(text) {
  menuLabel.textContent = text;
}

// Space (px) the panel covers on the map, so the route is not hidden behind it.
// On a phone the panel closes after Go, so only the top button needs room.
function cameraPadding() {
  const w = window.innerWidth;

  if (!isPhone()) {
    const panelOpen = document.body.classList.contains("panel-open");
    return { top: 80, bottom: 60, right: 60, left: panelOpen ? Math.min(dock.getBoundingClientRect().right + 40, w * 0.5) : 60 };
  }
  return { top: 90, bottom: 50, left: 30, right: 30 };
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
  floorPicker.querySelectorAll(".floor-btn").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.floor === wanted));
  });
  if (mapReady) setFloor(floor);
}

function toggleView() {
  is3D = !is3D;
  viewLabel.textContent = is3D ? "3D" : "2D";
  viewToggle.setAttribute("aria-pressed", String(is3D));
  if (mapReady) setTilt(is3D);
}


/* ===== MAP LOOK (the Color / Plan button) ===== */

const LOOK_KEY = "sac-look";
let lookChoice = "color";   // "color" = the design from the PDF | "plan" = the white 2D plan

// Updates the button and the map. The button shows the look you will get when you tap it (like Google Maps).
function applyLook() {
  const next = lookChoice === "color" ? "plan" : "color";
  lookLabel.textContent = next === "plan" ? "Plan" : "Color";
  lookToggle.setAttribute("data-next", next);
  lookToggle.setAttribute("aria-label", next === "plan" ? "Switch to the plan map" : "Switch to the color map");
  if (mapReady) setMapLook(lookChoice);
}

function initLook() {
  try {
    if (localStorage.getItem(LOOK_KEY) === "plan") lookChoice = "plan";
  } catch (err) { /* storage blocked: start with the colors */ }

  lookToggle.addEventListener("click", () => {
    lookChoice = lookChoice === "color" ? "plan" : "color";
    try { localStorage.setItem(LOOK_KEY, lookChoice); } catch (err) { /* it just will not be remembered */ }
    applyLook();
  });
  applyLook();
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

// The plan numbers you fixed on this phone are remembered here (only on this phone).
// To make them permanent for everyone, copy the numbers in the readout into PLAN in data.js.
const PLAN_STORAGE_KEY = "sac-plan-v2";
const PLAN_SAVED_FIELDS = ["lat", "lng", "metersPerPixel", "rotation", "opacity"];
const PLAN_FROM_DATA_JS = {};                 // the numbers that data.js started with
PLAN_SAVED_FIELDS.forEach((f) => { PLAN_FROM_DATA_JS[f] = PLAN[f]; });

function loadSavedPlan() {
  try {
    const saved = JSON.parse(localStorage.getItem(PLAN_STORAGE_KEY));
    if (!saved) return;
    PLAN_SAVED_FIELDS.forEach((f) => { if (typeof saved[f] === "number") PLAN[f] = saved[f]; });
    applyPlan();
  } catch (err) { /* storage blocked or broken: just use data.js */ }
}

function savePlan() {
  try {
    const data = {};
    PLAN_SAVED_FIELDS.forEach((f) => { data[f] = PLAN[f]; });
    localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(data));
  } catch (err) { /* private mode: it just will not be remembered */ }
}

// Run after any PLAN number changed: places get new lat/lng, the map redraws.
function onPlanChanged() {
  applyPlan();
  savePlan();
  refreshZone();          // the gate moved: redo the distance card
  if (mapReady) {
    refreshCampus();
    showRoute(false);   // draw the route again on the moved plan
  }
  updatePlanReadout();
}

// Put the slider handles where the PLAN numbers are.
function syncPlanSliders() {
  planRotation.value = PLAN.rotation;
  planSize.value = PLAN.metersPerPixel;
  planOpacity.value = PLAN.opacity;
}

function bindPlanTools() {
  streetMap.checked = SHOW_STREET_MAP;
  if (OFFLINE_FIRST) {   // offline mode has no street map to show
    streetMap.disabled = true;
    streetMap.parentNode.title = "Set OFFLINE_FIRST = false in data.js to use the street map";
  }
  streetMap.addEventListener("change", () => { if (mapReady) setStreetMap(streetMap.checked); });

  syncPlanSliders();

  // "Bring the plan to my location": the middle of the plan jumps to your GPS spot.
  planToMe.addEventListener("click", () => {
    if (!userPos) {
      setStatus("I don't know where you are yet. Tap the round location button first, then try again.");
      return;
    }
    PLAN.lat = userPos.lat;
    PLAN.lng = userPos.lng;
    onPlanChanged();
    focusOn(userPos.lat, userPos.lng);
    setStatus("The plan is now around you. Tick 'I'm standing here' and tap your spot on the plan.");
  });

  // Forget the saved numbers and go back to data.js.
  planReset.addEventListener("click", () => {
    PLAN_SAVED_FIELDS.forEach((f) => { PLAN[f] = PLAN_FROM_DATA_JS[f]; });
    syncPlanSliders();
    onPlanChanged();
    try { localStorage.removeItem(PLAN_STORAGE_KEY); } catch (err) { /* nothing to forget */ }
    setStatus("Plan numbers reset to the ones in data.js.");
  });

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
//   meters = how accurate the GPS is, heading = walking direction (both optional)
function setUserPosition(lat, lng, meters, heading) {
  userPos = { lat, lng };

  // The first time we know where you are, directions start from you.
  if (!switchedToMyLocation) {
    switchedToMyLocation = true;
    startSelect.value = "gps";
  }

  if (!mapReady) return;

  showUser(lat, lng, meters, heading);
  myLocation.classList.add("is-on");
  arOnPosition(lat, lng, meters);                 // the AR guide moves along with you
  updateZone(lat, lng);                           // the "where am I" card and the gate circle

  // The camera only goes to you when you are ON the campus. Outside, it stays at the campus
  // (or looks straight at the Main Gate when you are close to it) and never turns or slides toward you.
  const zoneNow = classifyLocation(lat, lng).zone;
  const onCampus = zoneNow === "campus" || zoneNow === "gate";
  const cameFromOutside = lastZone === null || lastZone === "far" || lastZone === "approaching";

  if (onCampus && (wantsFocus || cameFromOutside)) {
    // You just got onto the campus (or tapped the location button): zoom in on you.
    setFollowing(true);
    focusOn(lat, lng, 18.5);
  } else if (onCampus && following) {
    if (zoneNow !== lastZone) focusOn(lat, lng, 18.5);   // came closer (for example through the gate): zoom in more
    else followUser(lat, lng);
  } else if (!onCampus) {
    setFollowing(false);
    // Not on the campus yet (near the road or far away): the camera always looks at the Main Gate.
    if (wantsFocus || zoneNow !== lastZone) showGate(zoneNow === "approaching" ? 18 : GATE_ZOOM);
    if (wantsFocus) setStatus(outsideMessage(classifyLocation(lat, lng)));
  }
  wantsFocus = false;
  lastZone = zoneNow;

  // Only re-route if the nearest node changed (the user moved to a new spot).
  if (destinationId && startSelect.value === "gps" && nearestNode(lat, lng).id !== lastStartId) {
    showRoute(false);
  }
}

// What to tell someone who is not on the campus yet.
function outsideMessage(here) {
  if (here.zone === "approaching") return "You are near the Main Gate. The map looks at the gate and will follow you once you walk in.";
  return "You are about " + formatDistance(here.centerMeters) + " from the campus, so the map looks at the Main Gate. It will follow you once you walk in.";
}

// Follow mode: the camera stays on the blue dot. Dragging the map turns it off.
function setFollowing(on) {
  following = on;
  myLocation.classList.toggle("is-following", on);
  myLocation.setAttribute("aria-pressed", String(on));
}

// The round button (and the "Use my location" button in the panel).
// First tap: ask for permission and start tracking. Later taps: jump back to the blue dot.
function locateMe() {
  if (userPos && watchId !== null) {
    const here = classifyLocation(userPos.lat, userPos.lng);
    if (here.zone === "far" || here.zone === "approaching") {
      showGate(here.zone === "approaching" ? 18 : GATE_ZOOM);
      setStatus(outsideMessage(here));
      return;
    }
    setFollowing(true);
    focusOn(userPos.lat, userPos.lng, 18.5);
    return;
  }
  wantsFocus = true;
  startTracking();
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
      const c = pos.coords;
      setUserPosition(c.latitude, c.longitude, c.accuracy, c.heading);
      if (!destinationId && lastZone !== "far") {     // (far away: the "from the campus" message stays)
        setStatus(`Location found (accurate to about ${Math.round(c.accuracy)} m). Type a room and press Go.`);
      }
    },
    (err) => {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
      wantsFocus = false;
      myLocation.classList.remove("is-on");
      setStatus((LOCATION_ERRORS[err.code] || "Could not get your location.") +
                " You can still pick a start from the dropdown.");
    },
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }
  );
}

// If you already allowed location for this site before, start tracking by itself
// (no pop-up appears in that case). Phones without this feature simply skip it.
function autoStartIfAllowed() {
  try {
    navigator.permissions.query({ name: "geolocation" }).then((result) => {
      if (result.state === "granted") startTracking();
    }).catch(() => {});
  } catch (err) { /* old browser: the round button still works */ }
}


/* ===== 6. ROUTING ===== */

function clearRoute() {
  routePath = null;
  lastStartId = null;   // forget the old start, so the next location update draws the route again
  if (mapReady) {
    clearRoutes();
    showDestination(null);
  }
  resultsBox.innerHTML = EMPTY_STEPS;
  setMenuLabel("Find a room");
}

// Shows one route as a list of steps in the panel. key = "bfs" or "dfs".
function renderSteps(path, key, stats) {
  const algo = ALGORITHMS[key];
  const heading = document.createElement("h3");
  const list = document.createElement("ol");

  // style.css reads --route (line color) and data-algo (DFS is dashed).
  [heading, list].forEach((el) => {
    el.style.setProperty("--route", algo.color);
    el.dataset.algo = key;
  });

  heading.textContent = `${algo.label}: ${path.length - 1} steps`;
  resultsBox.appendChild(heading);
  if (stats) resultsBox.appendChild(buildStatsBox(path, stats));

  path.forEach((id, i) => {
    const item = document.createElement("li");
    item.textContent = NODES[id].name;
    if (i > 0 && NODES[id].floor !== NODES[path[i - 1]].floor) {
      item.textContent += ` (go to floor ${NODES[id].floor})`;
    }
    list.appendChild(item);
  });

  resultsBox.appendChild(list);
}

// The small "Pathfinding data" box: how much work the algorithm did and how long the walk is.
function buildStatsBox(path, stats) {
  let meters = 0;
  for (let i = 1; i < path.length; i++) {
    meters += distanceMeters(NODES[path[i - 1]].lat, NODES[path[i - 1]].lng, NODES[path[i]].lat, NODES[path[i]].lng);
  }
  const rows = [
    ["Nodes visited", String(stats.visited)],
    ["Est. distance", Math.round(meters) + " m"],
    ["Path cost", Math.round(pathCost(path))],
    ["Execution time", Math.max(stats.ms, 0.01).toFixed(2) + " ms"]
  ];
  const box = document.createElement("dl");
  box.className = "pf-data";
  const title = document.createElement("p");
  title.className = "pf-title";
  title.textContent = "Pathfinding data";
  box.appendChild(title);
  rows.forEach(([name, value]) => {
    const row = document.createElement("div");
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = name;
    dd.textContent = value;
    row.appendChild(dt);
    row.appendChild(dd);
    box.appendChild(row);
  });
  return box;
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
  // "both" = BFS and DFS side by side
  const keys = algoSelect.value === "both" ? ["bfs", "dfs"] : [algoSelect.value];
  const routes = keys.map((key) => {
    const startedAt = performance.now();
    const path = ALGORITHMS[key].find(start.id, destinationId);
    return { key, path, ms: performance.now() - startedAt, visited: lastSearchVisited };   // lastSearchVisited is set by graph.js
  });

  if (routes.some((route) => route.path === null)) {
    setStatus("No route found. Check that your EDGES connect these places.");
    return;
  }

  drawRoutes(routes);
  routePath = routes[0].path;
  resultsBox.innerHTML = "";   // remove "Your route will show here."
  routes.forEach((route) => renderSteps(route.path, route.key, route));
  showDestination(destinationId);
  setMenuLabel(`${NODES[destinationId].name} \u00b7 ${routes[0].path.length - 1} steps`);

  let message = `Directions to ${NODES[destinationId].name} (from ${NODES[start.id].name}).`;
  if (start.meters > FAR_FROM_CAMPUS_METERS) {
    message += ` You are about ${formatDistance(start.meters)} from the nearest campus point, so directions start there. If you are really on campus, open Testing tools and use 'Bring the plan to my location'.`;
  }
  setStatus(message);

  if (fitMap) flyToRoute(routes[0].path, cameraPadding());
}

// Places that match what you type, shown under the search (like "D" -> D Stairs, Room D112...).
function showSuggestions() {
  const wanted = normalize(roomInput.value);
  suggestBox.innerHTML = "";
  if (wanted === "") { suggestBox.hidden = true; return; }

  // Places that START with what you typed come first (D -> D101, D112, D Stairs...), then places that only contain it.
  const startsWith = (id) => id.indexOf(wanted) === 0 || normalize(NODES[id].name).indexOf(wanted) === 0;
  const matches = Object.keys(NODES)
    .filter((id) => id.indexOf(wanted) !== -1 || normalize(NODES[id].name).indexOf(wanted) !== -1)
    .sort((a, b) => (startsWith(a) ? 0 : 1) - (startsWith(b) ? 0 : 1))
    .slice(0, 6);

  matches.forEach((id) => {
    const item = document.createElement("li");
    item.setAttribute("role", "option");
    item.textContent = NODES[id].name;
    const floor = document.createElement("small");
    floor.textContent = "Floor " + NODES[id].floor;
    item.appendChild(floor);
    // pointerdown (not click) so it works before the input loses focus on a phone
    item.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      roomInput.value = NODES[id].name;
      onGo();
    });
    suggestBox.appendChild(item);
  });
  suggestBox.hidden = matches.length === 0;
}

// Highlights the row of the algorithm that is selected.
function syncAlgoList() {
  document.querySelectorAll("[data-algo-choice]").forEach((row) => {
    row.setAttribute("aria-checked", String(row.dataset.algoChoice === algoSelect.value));
  });
}

// Runs when the user presses Go (or the keyboard's Go/Enter key).
function onGo() {
  suggestBox.hidden = true;
  const found = findNodeFromText(roomInput.value);
  if (!found) {
    destinationId = null;
    clearRoute();
    setStatus(`"${roomInput.value}" was not found. Try something like D112.`);
    return;
  }
  destinationId = found;
  showRoute(true);

  // On a phone: put the keyboard away and close the panel so the route is visible.
  // The menu button now shows the route; tap it to see the steps.
  if (isPhone()) {
    roomInput.blur();
    setPanel(false);
  }
}


/* ===== 7. EVENTS ===== */

function bindEvents() {
  // A <form> makes both the Go button and the phone keyboard's Go key work.
  searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    onGo();
  });

  roomInput.addEventListener("input", showSuggestions);
  roomInput.addEventListener("focus", showSuggestions);
  roomInput.addEventListener("blur", () => { setTimeout(() => { suggestBox.hidden = true; }, 150); });
  roomInput.addEventListener("keydown", (e) => { if (e.key === "Escape") suggestBox.hidden = true; });

  locateButton.addEventListener("click", locateMe);
  myLocation.addEventListener("click", locateMe);
  $("arButton").addEventListener("click", () => {
    if (routePath) {
      startAr(routePath);
      return;
    }
    // No destination yet: open the search so the person can type a room first.
    setPanel(true);
    setStatus("Type a room first (for example D112), press Go, then tap AR guide.");
  });
  startSelect.addEventListener("change", () => showRoute(false));
  algoSelect.addEventListener("change", () => { syncAlgoList(); showRoute(false); });
  // The glass list of algorithms: choosing a row sets the (hidden) dropdown, which does the work
  document.querySelectorAll("[data-algo-choice]").forEach((row) => {
    row.addEventListener("click", () => {
      algoSelect.value = row.dataset.algoChoice;
      algoSelect.dispatchEvent(new Event("change"));
    });
  });
  syncAlgoList();
  viewToggle.addEventListener("click", toggleView);

  // The round arrow hides the panel; the menu button brings it back.
  panelToggle.addEventListener("click", () => setPanel(false));
  menuButton.addEventListener("click", () => setPanel(!document.body.classList.contains("panel-open")));

  initPanelSwipe();
  initLiquid();
}

// Map clicks: test mode moves "you", coordinate helper shows lat/lng,
// tapping a place shows its name.
function handleMapClick(click) {
  // "I'm standing here": slide the whole plan so the tapped spot lands on your GPS dot.
  if (planPin.checked) {
    if (!userPos) {
      setStatus("I don't know where you are yet. Tap the round location button first.");
      return;
    }
    PLAN.lat += userPos.lat - click.lat;
    PLAN.lng += userPos.lng - click.lng;
    planPin.checked = false;
    onPlanChanged();
    setStatus("Done. The plan now matches where you stand. Walk around and check that the blue dot follows the paths.");
    return;
  }

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

// Offline mode: sw.js (the service worker) saves the app files on the phone.
// After the first visit with internet, the link opens even with no signal.
function initOffline() {
  const note = $("offlineNote");
  if (!("serviceWorker" in navigator) || window.isSecureContext === false) return;   // needs HTTPS

  navigator.serviceWorker.register("sw.js").then(() => navigator.serviceWorker.ready).then(() => {
    note.hidden = false;
    note.textContent = "Offline ready: this app is saved on your phone.";
  }).catch((error) => console.warn("Offline mode not started:", error));

  window.addEventListener("offline", () => { note.hidden = false; note.textContent = "You are offline. The map and directions still work."; });
  window.addEventListener("online",  () => { note.textContent = "Offline ready: this app is saved on your phone."; });
}

function start() {
  if (isTouchDevice()) document.body.classList.add("is-touch");   // shows the AR guide button
  initTheme();            // light or dark (before the map starts)
  initLook();             // color or white map
  initAr(() => {          // the AR guide (ar.js). When it closes: show the route to the room on the big map.
    if (routePath) flyToRoute(routePath, cameraPadding());
  });
  initZone();             // the "where am I" card (zone.js)
  initOffline();          // saves the app on the phone so it opens without internet
  loadSavedPlan();        // numbers you fixed earlier on this phone (before the map starts)
  setPanel(!isPhone());   // computer: panel open. phone: closed until you tap the button.
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
    setMapTheme(document.body.classList.contains("dark"));   // dark mode chosen before the map was ready
    setMapLook(lookChoice);                                // so was the map look
    onMapClick(handleMapClick);
    onMapDrag(() => setFollowing(false));   // dragging the map = stop following
    showGate();                        // open with a smooth swoop onto the Main Gate
    autoStartIfAllowed();
    setStatus("Type a room and press Go.");
  });

  // If the map never loads (no internet?), say so instead of staying silent.
  setTimeout(() => {
    if (!mapReady) setStatus("The map is taking a long time to load. Check your internet connection.");
  }, 12000);
}

start();


/* ===== 9. SWIPE THE PANEL AWAY + LIQUID BUTTONS ===== */

// Swipe the panel to the left to close it (the round logo button still works too).
// The panel follows your finger, then slides away. A short or mostly-vertical swipe does nothing.
function initPanelSwipe() {
  let startX = 0, startY = 0, startTime = 0, dragging = false, decided = false;

  dock.addEventListener("touchstart", (event) => {
    if (event.touches.length !== 1) return;
    startX = event.touches[0].clientX;
    startY = event.touches[0].clientY;
    startTime = Date.now();
    dragging = false;
    decided = false;
  }, { passive: true });

  dock.addEventListener("touchmove", (event) => {
    if (decided && !dragging) return;
    const dx = event.touches[0].clientX - startX;
    const dy = event.touches[0].clientY - startY;
    if (!decided && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
      decided = true;
      dragging = dx < 0 && Math.abs(dx) > Math.abs(dy) * 1.4;     // only a clear swipe to the left
      if (dragging) dock.style.transition = "none";
    }
    if (dragging) dock.style.transform = "translateX(" + Math.min(0, dx) + "px)";
  }, { passive: true });

  function endSwipe(event) {
    if (!dragging) return;
    dragging = false;
    const dx = (event.changedTouches[0].clientX) - startX;
    const fast = Math.abs(dx) / Math.max(1, Date.now() - startTime) > 0.5;   // px per millisecond
    dock.style.transition = "";
    if (dx < -70 || (dx < -30 && fast)) {
      dock.style.transform = "translateX(calc(-100% - 40px))";
      setPanel(false);
    } else {
      dock.style.transform = "none";
    }
    setTimeout(() => { dock.style.transform = ""; }, 500);       // hand control back to the CSS
  }
  dock.addEventListener("touchend", endSwipe, { passive: true });
  dock.addEventListener("touchcancel", endSwipe, { passive: true });
}

// A "liquid" highlight: one blob that stretches and slides to the chosen item, like water.
function setupLiquid(container, itemSelector) {
  const blob = document.createElement("span");
  blob.className = "liquid-blob";
  blob.setAttribute("aria-hidden", "true");
  container.insertBefore(blob, container.firstChild);
  let lastTop = null, lastBottom = null, timer = 0;

  function place(animate) {
    const item = container.querySelector('[aria-pressed="true"], [aria-checked="true"]');
    if (!item || !item.offsetHeight) return;
    const top = item.offsetTop, height = item.offsetHeight, bottom = top + height;
    window.clearTimeout(timer);
    if (!animate || lastTop === null) {
      blob.classList.add("no-anim");
      blob.style.top = top + "px";
      blob.style.height = height + "px";
      blob.offsetHeight;                                          // apply now, before the animation comes back
      blob.classList.remove("no-anim");
    } else if (top !== lastTop) {
      // 1) stretch from the old spot to the new one, 2) let the tail catch up and settle
      blob.classList.add("is-stretching");
      blob.style.top = Math.min(top, lastTop) + "px";
      blob.style.height = (Math.max(bottom, lastBottom) - Math.min(top, lastTop)) + "px";
      timer = window.setTimeout(() => {
        blob.classList.remove("is-stretching");
        blob.style.top = top + "px";
        blob.style.height = height + "px";
      }, 130);
      drop(item);
    }
    lastTop = top;
    lastBottom = bottom;
  }

  new MutationObserver(() => place(true)).observe(container, { attributes: true, subtree: true, attributeFilter: ["aria-pressed", "aria-checked"] });
  window.addEventListener("resize", () => place(false));
  if (window.ResizeObserver) new ResizeObserver(() => place(false)).observe(container);
  place(false);
}

// A water drop: a ring that spreads out from the item you chose.
function drop(item) {
  const ring = document.createElement("span");
  ring.className = "liquid-drop";
  item.appendChild(ring);
  window.setTimeout(() => ring.remove(), 700);
}

function initLiquid() {
  setupLiquid(floorPicker, ".floor-btn");
  setupLiquid(document.querySelector(".algo-list"), ".algo-row");

  // Every glass button squishes a little and sends a ripple from where you touched it.
  document.addEventListener("pointerdown", (event) => {
    const target = event.target.closest && event.target.closest(".floor-btn, .algo-row, #goButton, .btn-outline, .view-btn, .locate-fab");
    if (!target || target.classList.contains("ar-start")) return;
    if (getComputedStyle(target).position === "static") target.style.position = "relative";
    const rect = target.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 1.6;
    const ripple = document.createElement("span");
    ripple.className = "liquid-ripple";
    ripple.style.width = ripple.style.height = size + "px";
    ripple.style.left = (event.clientX - rect.left - size / 2) + "px";
    ripple.style.top = (event.clientY - rect.top - size / 2) + "px";
    target.appendChild(ripple);
    window.setTimeout(() => ripple.remove(), 650);
  }, { passive: true });
}