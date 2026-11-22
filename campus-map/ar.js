/* =====================================================================
   ar.js  -  the "AR guide": your phone camera with a big arrow on the
   floor, a tag on the room you are going to, and a round mini map.
   It moves along the route by itself while you walk (GPS) and shows the
   green "You've arrived" screen at the room.

   app.js CALLS
   initAr(onClose)              once, when the page starts (onClose runs when the guide closes)
   startAr(path)                open the guide for a route (list of place ids)
   arOnPosition(lat, lng, m)    every time the GPS gives a new position

   SECTIONS
   1. Settings              5. Mini map (round, tap it to leave)
   2. State + elements      6. Showing the instruction
   3. Open and close        7. Moving along the route (automatic)
   4. Compass
   ===================================================================== */


/* ===== 1. SETTINGS ===== */

const AR_START_METERS = 15;          // farther than this from the first place of the route: the guide first leads you there
const AR_NEXT_POINT_METERS = 6;      // closer than this to the next point = go on to the one after
const AR_ARRIVE_METERS = 10;         // closer than this to the room = you have arrived
const AR_NOW_METERS = 4;             // closer than this the banner says "Now turn..." instead of "In 12 m"
const AR_BAD_GPS_METERS = 30;        // a GPS reading less exact than this is ignored (indoors it is poor)
const AR_GPS_FRESH_MS = 8000;        // a GPS reading older than this is ignored
const AR_WEAK_GPS_MS = 20000;        // no good GPS for this long: show the "GPS is weak" hint
const AR_STAIRS_MS = 8000;           // taking stairs takes time: wait this long before moving on
const AR_TICK_MS = 1000;             // the guide re-checks once a second, even without a new GPS reading
const AR_COMPASS_SMOOTHING = 0.25;   // 0 to 1. Lower = steadier arrow, slower to turn

const AR_STRAIGHT_DEGREES = 25;      // facing within this many degrees of the target = "Go straight"
const AR_AROUND_DEGREES = 135;       // turned away more than this = "Turn around"
const AR_CAMERA_HALF_FOV = 24;       // the camera sees about 48 degrees across: the room tag slides inside this

const AR_MINI_MIN_METERS = 35;       // the mini map never shows less than this radius around you
const AR_MINI_MAX_METERS = 160;      // ...and never more than this
const AR_MINI_PADDING = 1.35;        // a little room around you and the room


/* ===== 2. STATE + ELEMENTS ===== */

const arEl = {};                     // page elements, filled in by initAr()
const arMini = {};                   // mini map pieces (SVG), built by arBuildMiniMap()
const AR_SVG = "http://www.w3.org/2000/svg";

let arPath = [];                     // the route: place ids
let arIndex = 0;                     // which place you are at (arPath[arIndex])
let arActive = false;
let arStream = null;                 // the camera
let arHeading = null;                // which way the phone faces (degrees from north), or null if unknown
let arArrowAngle = 0;                // the arrow's angle on screen. It never wraps at 360, so it never spins backwards.
let arToStart = false;               // true = you are not at the start of the route yet, so the arrow leads you there first
let arStairsSince = null;            // when you reached the stairs (the guide waits a few seconds there)
let arGps = null;                    // last usable GPS reading: { lat, lng, time }
let arLastGoodGps = 0;               // when we last had a usable reading (for the "GPS is weak" hint)
let arTimer = null;                  // the once-a-second check
let arFramePending = false;          // true while a redraw is waiting for the next frame
let arTotalMeters = 0;               // longest "meters left" seen: the progress bar is measured against it
let arCloseCallback = null;          // app.js function to run when the guide closes

function initAr(onClose) {
  ["ar", "arVideo", "arAction", "arSub", "arBannerIcon", "arArrow", "arHint", "arProgress", "arLeft",
   "arClose", "arArrived", "arArrivedPlace", "arDone", "arButton", "arMini", "arMiniSvg", "arDest", "arDestText",
   "arDistance", "arLeftNum", "arLeftName", "arBarFill"
  ].forEach((id) => { arEl[id] = document.getElementById(id); });

  arCloseCallback = onClose || null;

  arEl.arClose.addEventListener("click", stopAr);
  arEl.arDone.addEventListener("click", stopAr);
  arEl.arMini.addEventListener("click", stopAr);          // tap the mini map = back to the big map
  arEl.arLeft.addEventListener("click", arSkipIfWeakGps); // only does something when the GPS is weak

  arBuildMiniMap();
}


/* ===== 3. OPEN AND CLOSE ===== */

// Called from the "AR guide" button. Must run straight from a tap:
// iPhones only ask about the compass if the page asks right after a tap.
function startAr(path) {
  if (!path || path.length < 2) return;

  arPath = path.slice();                 // our own copy: the map may redraw the route while we walk
  arActive = true;
  arHeading = null;
  arArrowAngle = 0;
  arTotalMeters = 0;
  arLastGoodGps = arGpsIsFresh() ? Date.now() : 0;

  arSetIndex(0);

  // Walking in from the road? Then the first target is the start of the route (for example the Main Gate).
  const first = NODES[arPath[0]];
  arToStart = arGpsIsFresh() && distanceMeters(arGps.lat, arGps.lng, first.lat, first.lng) > AR_START_METERS;

  arEl.ar.hidden = false;
  arEl.arArrived.hidden = true;
  document.body.classList.add("ar-on");

  arStartCompass();                      // first: it needs the tap
  arStartCamera();
  arSetMiniRoute();
  arTimer = window.setInterval(arTick, AR_TICK_MS);
  arRender();
}

function stopAr() {
  if (!arActive) return;
  arActive = false;
  arEl.ar.hidden = true;
  document.body.classList.remove("ar-on");

  window.clearInterval(arTimer);
  arTimer = null;
  arStopCompass();
  if (arStream) {
    arStream.getTracks().forEach((track) => track.stop());
    arStream = null;
  }
  arEl.arVideo.srcObject = null;

  if (arCloseCallback) arCloseCallback();
}

// The back camera. If it is blocked or missing, the arrow still works on a dark background.
function arStartCamera() {
  arEl.ar.classList.remove("no-camera");

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    arEl.ar.classList.add("no-camera");
    return;
  }

  navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false })
    .then((stream) => {
      if (!arActive) {                   // closed again before the camera was ready
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      arStream = stream;
      arEl.arVideo.srcObject = stream;
      const playing = arEl.arVideo.play();
      if (playing && playing.catch) playing.catch(() => {});
    })
    .catch(() => arEl.ar.classList.add("no-camera"));
}


/* ===== 4. COMPASS ===== */

function arStartCompass() {
  // Listen right away. On an iPhone the events only start after the person allows motion access.
  window.addEventListener("deviceorientationabsolute", arOnOrientation, true);   // Android
  window.addEventListener("deviceorientation", arOnOrientation, true);           // iPhone (and some Androids)

  // iPhone (iOS 13+) shows a permission pop-up, and only if we ask straight after a tap.
  const Orientation = window.DeviceOrientationEvent;
  if (Orientation && typeof Orientation.requestPermission === "function") {
    try {
      const asking = Orientation.requestPermission();
      if (asking && asking.catch) asking.catch(() => {});
    } catch (err) { /* old or odd browser: the arrow just stays ahead */ }
  }
}

function arStopCompass() {
  window.removeEventListener("deviceorientationabsolute", arOnOrientation, true);
  window.removeEventListener("deviceorientation", arOnOrientation, true);
}

// The direction the BACK of the phone (the camera) faces, in degrees from north.
function arCameraHeading(e) {
  // iPhone: the phone gives a ready-made compass number.
  if (typeof e.webkitCompassHeading === "number") return e.webkitCompassHeading;

  // Android: only trust readings that are measured against north.
  if (!e.absolute || e.alpha === null) return null;

  const toRad = Math.PI / 180;
  const a = e.alpha * toRad, b = (e.beta || 0) * toRad, g = (e.gamma || 0) * toRad;

  // Direction the camera points, as east (vx) and north (vy), from the three tilt angles.
  const vx = -Math.cos(a) * Math.sin(g) - Math.sin(a) * Math.sin(b) * Math.cos(g);
  const vy = -Math.sin(a) * Math.sin(g) + Math.cos(a) * Math.sin(b) * Math.cos(g);

  // Phone lying flat: the camera points at the floor, so use the top edge instead.
  if (Math.sqrt(vx * vx + vy * vy) < 0.2) return (360 - e.alpha) % 360;

  return (Math.atan2(vx, vy) / toRad + 360) % 360;
}

function arOnOrientation(e) {
  const heading = arCameraHeading(e);
  if (heading === null || isNaN(heading)) return;

  // Smooth it (and handle the jump from 359 to 0).
  if (arHeading === null) {
    arHeading = heading;
  } else {
    arHeading = (arHeading + arAngleDiff(heading, arHeading) * AR_COMPASS_SMOOTHING + 360) % 360;
  }
  arRenderSoon();
}

// Shortest turn from angle b to angle a, between -180 and +180.
function arAngleDiff(a, b) {
  return ((a - b + 540) % 360) - 180;
}


/* ===== 5. MINI MAP (round, tap it to leave) ===== */

// A tiny flat map drawn with SVG: the buildings, the route line, you and the room.
// It is drawn once here; arRenderMini() only moves things afterwards.

function arSvg(tag, attributes) {
  const node = document.createElementNS(AR_SVG, tag);
  Object.keys(attributes || {}).forEach((name) => node.setAttribute(name, attributes[name]));
  return node;
}

function arBuildMiniMap() {
  const svg = arEl.arMiniSvg;

  // Everything in "world" is drawn in plan pixels and turned as one piece
  arMini.world = arSvg("g");

  BUILDINGS.forEach((building) => {
    let d = arRing(building.footprint);
    (building.holes || []).forEach((hole) => { d += arRing(hole); });
    arMini.world.appendChild(arSvg("path", {
      d: d, "fill-rule": "evenodd", fill: "rgba(255,255,255,0.22)",
      stroke: "rgba(255,255,255,0.45)", "stroke-width": "1", "vector-effect": "non-scaling-stroke"
    }));
  });

  // The route: a white outline under a blue line. The part you already walked fades.
  const lineStyle = { fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round", "vector-effect": "non-scaling-stroke" };
  arMini.casing = arSvg("polyline", Object.assign({ stroke: "#ffffff", "stroke-width": "8" }, lineStyle));
  arMini.route  = arSvg("polyline", Object.assign({ stroke: "#3b82f6", "stroke-width": "5" }, lineStyle));
  arMini.done   = arSvg("polyline", Object.assign({ stroke: "rgba(255,255,255,0.55)", "stroke-width": "5" }, lineStyle));
  arMini.dest   = arSvg("circle", { fill: "#f2b705", stroke: "#ffffff", "stroke-width": "2.5", "vector-effect": "non-scaling-stroke" });
  [arMini.casing, arMini.route, arMini.done, arMini.dest].forEach((node) => arMini.world.appendChild(node));
  svg.appendChild(arMini.world);

  // You: a blue dot with a white ring and a beam. It is not turned with the world: it always faces up.
  arMini.you = arSvg("g");
  arMini.beam = arSvg("path", { d: "M0 0 L-0.55 -1.6 A1.7 1.7 0 0 1 0.55 -1.6 Z", fill: "rgba(59,130,246,0.55)" });
  arMini.dot = arSvg("circle", { r: "0.5", fill: "#2563eb", stroke: "#ffffff", "stroke-width": "2.5", "vector-effect": "non-scaling-stroke" });
  arMini.you.appendChild(arMini.beam);
  arMini.you.appendChild(arMini.dot);
  svg.appendChild(arMini.you);
}

// "M x y L x y ... Z" for one outline of points
function arRing(points) {
  return "M" + points.map((p) => p[0] + " " + p[1]).join(" L") + " Z";
}

// The route line, from the plan pixels of the places (run once when the guide opens).
function arSetMiniRoute() {
  const points = arPath.map((id) => NODES[id].x + "," + NODES[id].y).join(" ");
  arMini.casing.setAttribute("points", points);
  arMini.route.setAttribute("points", points);

  const last = NODES[arPath[arPath.length - 1]];
  arMini.dest.setAttribute("cx", last.x);
  arMini.dest.setAttribute("cy", last.y);
}

// Move the mini map: show you AND the room, turned so the way you face is up.
function arRenderMini(here) {
  const you = lngLatToPlan(here.lng, here.lat);                 // plan pixels
  const dest = NODES[arPath[arPath.length - 1]];

  // How much to show: both you and the room, but between the min and max radius.
  const pixelsPerMeter = 1 / PLAN.metersPerPixel;
  const minRadius = AR_MINI_MIN_METERS * pixelsPerMeter;
  const maxRadius = AR_MINI_MAX_METERS * pixelsPerMeter;
  const gap = Math.sqrt(Math.pow(dest.x - you.x, 2) + Math.pow(dest.y - you.y, 2));
  let radius = Math.max(minRadius, (gap / 2) * AR_MINI_PADDING);
  let centerX = (you.x + dest.x) / 2, centerY = (you.y + dest.y) / 2;

  if (radius > maxRadius) {            // the room is very far: keep you in view and lean toward the room
    radius = maxRadius;
    const lean = (radius * 0.5) / gap;
    centerX = you.x + (dest.x - you.x) * lean;
    centerY = you.y + (dest.y - you.y) * lean;
  }

  // Turn the world so "forward" is up. (Plan "up" points to the compass bearing PLAN.rotation.)
  const turn = arHeading === null ? 0 : PLAN.rotation - arHeading;
  arEl.arMiniSvg.setAttribute("viewBox", (centerX - radius) + " " + (centerY - radius) + " " + (2 * radius) + " " + (2 * radius));
  arMini.world.setAttribute("transform", "rotate(" + turn + " " + centerX + " " + centerY + ")");

  // Where you end up after the turn
  const rad = turn * Math.PI / 180;
  const dx = you.x - centerX, dy = you.y - centerY;
  const youX = centerX + dx * Math.cos(rad) - dy * Math.sin(rad);
  const youY = centerY + dx * Math.sin(rad) + dy * Math.cos(rad);
  const size = radius * 0.11;                                   // dot size follows the zoom
  arMini.you.setAttribute("transform", "translate(" + youX + " " + youY + ") scale(" + size + ")");
  arMini.beam.setAttribute("display", arHeading === null ? "none" : "inline");

  arMini.dest.setAttribute("r", size * 0.62);
  arMini.done.setAttribute("points", arPath.slice(0, arIndex + 1).map((id) => NODES[id].x + "," + NODES[id].y).join(" "));
}


/* ===== 6. SHOWING THE INSTRUCTION ===== */

// The compass fires many times a second: draw at most once per screen frame.
function arRenderSoon() {
  if (arFramePending) return;
  arFramePending = true;
  window.requestAnimationFrame(() => {
    arFramePending = false;
    if (arActive) arRender();
  });
}

// Do we have a recent, exact-enough GPS reading?
function arGpsIsFresh() {
  return arGps !== null && Date.now() - arGps.time < AR_GPS_FRESH_MS;
}

// Where you are: your GPS spot if it is recent and exact enough, else the place on the route you reached.
function arHere() {
  return arGpsIsFresh() ? arGps : NODES[arPath[arIndex]];
}

// What the arrow aims at right now.
//   kind "start":  you are still walking in to the first place of the route
//   kind "stairs": the next step changes floor: aim at the place AFTER the stairs
//   kind "walk":   the next place on the same floor
function arAim() {
  if (arToStart && arGpsIsFresh()) return { kind: "start", index: 0 };

  const from = NODES[arPath[arIndex]];
  const next = NODES[arPath[arIndex + 1]];
  if (next.floor !== from.floor) {
    const hasAfter = arPath[arIndex + 2] !== undefined;
    return { kind: "stairs", index: hasAfter ? arIndex + 2 : arIndex + 1, floor: next.floor };
  }
  return { kind: "walk", index: arIndex + 1 };
}

// Meters still to walk: from here to the aim, then along the rest of the route.
function arMetersLeft(here, aim) {
  const target = NODES[arPath[aim.index]];
  let total = distanceMeters(here.lat, here.lng, target.lat, target.lng);
  for (let i = aim.index; i < arPath.length - 1; i++) {
    const a = NODES[arPath[i]], b = NODES[arPath[i + 1]];
    if (a.floor === b.floor) total += distanceMeters(a.lat, a.lng, b.lat, b.lng);
  }
  return total;
}

function arRender() {
  if (!arActive) return;

  const lastIndex = arPath.length - 1;
  if (arIndex >= lastIndex) {
    arShowArrived();
    return;
  }
  arEl.arArrived.hidden = true;

  const here = arHere();
  const aim = arAim();
  const target = NODES[arPath[aim.index]];
  const destination = NODES[arPath[lastIndex]];
  const meters = distanceMeters(here.lat, here.lng, target.lat, target.lng);

  // How far to turn, from "straight ahead" (0). Right is plus, left is minus.
  let turn = 0;
  if (arHeading !== null) turn = arAngleDiff(bearingDegrees(here, target), arHeading);

  // Turn the arrow smoothly: add the small change, never jump around the circle.
  arArrowAngle += arAngleDiff(turn, arArrowAngle % 360);
  const rotation = "rotate(" + arArrowAngle + "deg)";
  arEl.arArrow.style.webkitTransform = arEl.arArrow.style.transform = rotation;
  arEl.arBannerIcon.style.webkitTransform = arEl.arBannerIcon.style.transform = rotation;

  // The words at the top
  let action;
  if (aim.kind === "stairs") action = "Take the stairs to floor " + aim.floor;
  else if (arHeading === null) action = "Head to " + target.name;
  else action = arActionFor(turn);

  const distanceText = meters < AR_NOW_METERS ? "Now" : "In " + Math.round(meters) + " m";
  arEl.arAction.textContent = action;
  if (aim.kind === "stairs") arEl.arSub.textContent = "Then continue to " + target.name;
  else arEl.arSub.textContent = arHeading === null ? distanceText : distanceText + " · " + target.name;   // (the name is already in the title when there is no compass)

  // At the bottom: how far to the room you typed, and which step you are on
  const metersLeft = arMetersLeft(here, aim);
  arEl.arLeftNum.textContent = Math.round(metersLeft) + " m";
  arEl.arLeftName.textContent = " to " + destination.name;
  arTotalMeters = Math.max(arTotalMeters, metersLeft);
  const done = arTotalMeters > 0 ? 1 - metersLeft / arTotalMeters : 0;
  arEl.arBarFill.style.width = Math.round(Math.max(0, Math.min(1, done)) * 100) + "%";

  // Big distance to the next point, floating under the arrow on the "floor"
  arEl.arDistance.textContent = meters < AR_NOW_METERS ? "Now" : Math.round(meters) + " m";
  arEl.arProgress.textContent = aim.kind === "start" ? "Getting to the start" : "Step " + (arIndex + 1) + " of " + lastIndex;

  arRenderDestinationTag(here, destination, metersLeft);
  arRenderHint();
  arRenderMini(here);
}

// The tag floating in the camera on the room you are going to.
// It slides sideways as you turn. Outside the camera's view it sticks to the edge with an arrow.
function arRenderDestinationTag(here, destination, metersLeft) {
  if (arHeading === null) {
    arEl.arDest.hidden = true;
    return;
  }
  const away = arAngleDiff(bearingDegrees(here, destination), arHeading);     // plus = to the right
  const inView = Math.abs(away) <= AR_CAMERA_HALF_FOV;
  const percent = Math.max(12, Math.min(88, 50 + (away / AR_CAMERA_HALF_FOV) * 40));

  arEl.arDestText.textContent = destination.name + " · " + Math.round(metersLeft) + " m";
  arEl.arDest.setAttribute("data-side", inView ? "" : (away > 0 ? "right" : "left"));
  arEl.arDest.hidden = false;

  // Keep the whole tag on the screen: its middle may not go closer to the edge than half its width
  const screenWidth = arEl.ar.clientWidth;
  const half = arEl.arDest.offsetWidth / 2 + 8;
  const middle = Math.max(half, Math.min(screenWidth - half, (percent / 100) * screenWidth));
  arEl.arDest.style.left = middle + "px";
}

// A short hint when something is not working (compass or GPS).
function arRenderHint() {
  const weakGps = Date.now() - arLastGoodGps > AR_WEAK_GPS_MS;
  arEl.arLeft.classList.toggle("is-weak", weakGps);

  if (weakGps) arEl.arHint.textContent = "GPS is weak here. Tap the distance box to move to the next point.";
  else if (arHeading === null) arEl.arHint.textContent = "Compass not ready. Wave your phone in a figure 8 and allow motion access if asked.";
  else arEl.arHint.textContent = "";
}

// "Go straight", "Turn left"... from how far you are turned away from the target.
function arActionFor(turn) {
  const size = Math.abs(turn);
  if (size < AR_STRAIGHT_DEGREES) return "Go straight";
  if (size > AR_AROUND_DEGREES) return "Turn around";
  return turn > 0 ? "Turn right" : "Turn left";
}

// The green "You've arrived" screen with the door.
function arShowArrived() {
  const place = NODES[arPath[arPath.length - 1]];
  arEl.arArrivedPlace.textContent = place.name;

  if (arEl.arArrived.hidden) {
    arEl.arArrived.hidden = false;
    if (navigator.vibrate) navigator.vibrate(200);
  }
}


/* ===== 7. MOVING ALONG THE ROUTE (automatic) ===== */

// Go to place number i. (Stairs: remember when you got there.)
function arSetIndex(i) {
  const lastIndex = arPath.length - 1;
  arIndex = Math.max(0, Math.min(lastIndex, i));
  const changesFloor = arIndex < lastIndex && NODES[arPath[arIndex + 1]].floor !== NODES[arPath[arIndex]].floor;
  arStairsSince = changesFloor ? Date.now() : null;
}

// app.js tells us each new GPS position.
function arOnPosition(lat, lng, accuracyMeters) {
  const usable = accuracyMeters === undefined || accuracyMeters <= AR_BAD_GPS_METERS;
  arGps = usable ? { lat: lat, lng: lng, time: Date.now() } : null;
  if (usable) arLastGoodGps = Date.now();
  if (!arActive) return;

  arAdvance();
  arRender();
}

// Once a second: re-check (stairs wait on a timer, and the GPS may be quiet).
function arTick() {
  if (!arActive) return;
  arAdvance();
  arRender();
}

// Reached the next point? Then aim at the one after. Reached the room? Then you have arrived.
function arAdvance() {
  if (!arGpsIsFresh()) return;
  const lastIndex = arPath.length - 1;

  // First walk to the start of the route (for example in through the Main Gate)
  if (arToStart) {
    const first = NODES[arPath[0]];
    if (distanceMeters(arGps.lat, arGps.lng, first.lat, first.lng) > AR_START_METERS) return;
    arToStart = false;
  }

  while (arIndex < lastIndex) {
    const aim = arAim();
    const target = NODES[arPath[aim.index]];
    const meters = distanceMeters(arGps.lat, arGps.lng, target.lat, target.lng);

    let reached;
    if (aim.kind === "stairs") {
      // GPS cannot tell floors apart (both floors are at the same spot), so wait a few seconds for the climb.
      reached = Date.now() - arStairsSince >= AR_STAIRS_MS && meters <= AR_NEXT_POINT_METERS;
    } else {
      reached = meters <= (aim.index === lastIndex ? AR_ARRIVE_METERS : AR_NEXT_POINT_METERS);
    }
    if (!reached) break;

    arSetIndex(aim.index);
  }
}

// Only for weak GPS (for example deep inside a building): tapping the distance box moves on one point.
function arSkipIfWeakGps() {
  if (!arActive || Date.now() - arLastGoodGps <= AR_WEAK_GPS_MS) return;

  if (arToStart) arToStart = false;
  else arSetIndex(arAim().index);
  arRender();
}