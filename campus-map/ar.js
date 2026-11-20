/* =====================================================================
   ar.js  -  the "AR guide": your phone camera with a big arrow on the
   floor, like a car navigation. It reads the compass to turn the arrow
   toward the next point of the route.

   app.js CALLS
   initAr()                     once, when the page starts
   startAr(path)                open the guide for a route (list of place ids)
   arOnPosition(lat, lng, m)    every time the GPS gives a new position

   SECTIONS
   1. Settings            4. Compass (which way the phone faces)
   2. State + elements    5. Showing the instruction
   3. Open and close      6. Moving along the route
   ===================================================================== */


/* ===== 1. SETTINGS ===== */

const AR_START_METERS = 15;          // farther than this from the first place of the route: the guide first leads you there
const AR_NEXT_POINT_METERS = 6;      // closer than this to the next point = go on to the one after
const AR_NOW_METERS = 4;             // closer than this the banner says "Now turn..." instead of "In 12 m"
const AR_BAD_GPS_METERS = 30;        // a GPS reading less exact than this is ignored (indoors it is poor)
const AR_GPS_FRESH_MS = 8000;        // a GPS reading older than this is ignored
const AR_COMPASS_SMOOTHING = 0.25;   // 0 to 1. Lower = steadier arrow, slower to turn

const AR_STRAIGHT_DEGREES = 25;      // facing within this many degrees of the target = "Go straight"
const AR_AROUND_DEGREES = 135;       // turned away more than this = "Turn around"


/* ===== 2. STATE + ELEMENTS ===== */

const arEl = {};                     // page elements, filled in by initAr()

let arPath = [];                     // the route: place ids
let arIndex = 0;                     // which place you are at (arPath[arIndex])
let arActive = false;
let arStream = null;                 // the camera
let arHeading = null;                // which way the phone faces (degrees from north), or null if unknown
let arArrowAngle = 0;                // the arrow's angle on screen. It never wraps at 360, so it never spins backwards.
let arToStart = false;               // true = you are not at the start of the route yet, so the arrow leads you to it first
let arGps = null;                    // last usable GPS reading: { lat, lng, time }
let arFramePending = false;          // true while a redraw is waiting for the next frame

function initAr() {
  ["ar", "arVideo", "arAction", "arSub", "arBannerIcon", "arArrow", "arHint", "arProgress",
   "arBack", "arNext", "arClose", "arArrived", "arArrivedPlace", "arDone", "arButton", "arLeft"
  ].forEach((id) => { arEl[id] = document.getElementById(id); });

  arEl.arClose.addEventListener("click", stopAr);
  arEl.arDone.addEventListener("click", stopAr);
  arEl.arBack.addEventListener("click", () => arMove(-1));
  arEl.arNext.addEventListener("click", () => arMove(+1));
}


/* ===== 3. OPEN AND CLOSE ===== */

// Called from the "Start AR guide" button. Must run straight from a tap:
// iPhones only ask about the compass if the page asks right after a tap.
function startAr(path) {
  if (!path || path.length < 2) return;

  arPath = path.slice();                 // our own copy: the map may redraw the route while we walk
  arIndex = 0;
  arActive = true;
  arHeading = null;
  arArrowAngle = 0;

  // Walking in from the road? Then the first target is the start of the route (for example the Main Gate).
  const first = NODES[arPath[0]];
  arToStart = arGpsIsFresh() && distanceMeters(arGps.lat, arGps.lng, first.lat, first.lng) > AR_START_METERS;

  arEl.ar.hidden = false;
  arEl.arArrived.hidden = true;
  document.body.classList.add("ar-on");

  arStartCompass();                      // first: it needs the tap
  arStartCamera();
  arRender();
}

function stopAr() {
  arActive = false;
  arEl.ar.hidden = true;
  document.body.classList.remove("ar-on");

  arStopCompass();
  if (arStream) {
    arStream.getTracks().forEach((track) => track.stop());
    arStream = null;
  }
  arEl.arVideo.srcObject = null;
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


/* ===== 5. SHOWING THE INSTRUCTION ===== */

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

// Meters still to walk: from here to the next target, then along the rest of the route.
function arMetersLeft(here, target, leadingToStart) {
  let total = distanceMeters(here.lat, here.lng, target.lat, target.lng);
  const from = leadingToStart ? 0 : arIndex + 1;   // the route continues from the target
  for (let i = from; i < arPath.length - 1; i++) {
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
  const from = NODES[arPath[arIndex]];
  const next = NODES[arPath[arIndex + 1]];
  const leadingToStart = arToStart && arGpsIsFresh();     // first walk to the start of the route
  const target = leadingToStart ? NODES[arPath[0]] : next;
  const meters = distanceMeters(here.lat, here.lng, target.lat, target.lng);
  const changesFloor = !leadingToStart && next.floor !== from.floor;

  // How far to turn, from "straight ahead" (0). Right is plus, left is minus.
  let turn = 0;
  if (arHeading !== null) turn = arAngleDiff(bearingDegrees(here, target), arHeading);

  // Turn the arrow smoothly: add the small change, never jump around the circle.
  arArrowAngle += arAngleDiff(turn, arArrowAngle % 360);
  const rotation = "rotate(" + arArrowAngle + "deg)";
  arEl.arArrow.style.webkitTransform = arEl.arArrow.style.transform = rotation;
  arEl.arBannerIcon.style.webkitTransform = arEl.arBannerIcon.style.transform = rotation;

  // The words
  let action;
  if (changesFloor) action = "Take the stairs to floor " + next.floor;
  else if (arHeading === null) action = "Head to " + target.name;
  else action = arActionFor(turn);

  const distanceText = meters < AR_NOW_METERS ? "Now" : "In " + Math.round(meters) + " m";
  arEl.arAction.textContent = action;
  arEl.arSub.textContent = changesFloor
    ? "Tap Next when you are on floor " + next.floor
    : (arHeading === null ? distanceText : distanceText + " \u00b7 " + target.name);   // (the name is already in the title when there is no compass)

  // Bottom: how far to the room you typed, and which step you are on
  const destination = NODES[arPath[arPath.length - 1]];
  arEl.arLeft.textContent = Math.round(arMetersLeft(here, target, leadingToStart)) + " m to " + destination.name;
  arEl.arProgress.textContent = leadingToStart ? "Getting to the start" : "Step " + (arIndex + 1) + " of " + lastIndex;
  arEl.arBack.disabled = arIndex === 0 && !leadingToStart;
  arEl.ar.classList.toggle("is-stairs", changesFloor);

  arEl.arHint.textContent = arHeading === null
    ? "Compass not ready. Wave your phone in a figure 8 and allow motion access if asked."
    : "";
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


/* ===== 6. MOVING ALONG THE ROUTE ===== */

// Back / Next buttons (always work, even when the GPS is bad).
function arMove(step) {
  arToStart = false;                     // you decided where you are
  arIndex = Math.max(0, Math.min(arPath.length - 1, arIndex + step));
  arRender();
}

// app.js tells us each new GPS position.
function arOnPosition(lat, lng, accuracyMeters) {
  const usable = accuracyMeters === undefined || accuracyMeters <= AR_BAD_GPS_METERS;
  arGps = usable ? { lat: lat, lng: lng, time: Date.now() } : null;
  if (!arActive || !usable) return;

  // Reached the start of the route (for example you walked in through the Main Gate)?
  if (arToStart) {
    const first = NODES[arPath[0]];
    if (distanceMeters(lat, lng, first.lat, first.lng) <= AR_START_METERS) arToStart = false;
  }

  // Reached the next point? Then aim at the one after.
  // (Stairs are never skipped by GPS: both floors are at the same spot. Tap Next there.)
  const lastIndex = arPath.length - 1;
  while (!arToStart && arIndex < lastIndex) {
    const from = NODES[arPath[arIndex]];
    const next = NODES[arPath[arIndex + 1]];
    if (next.floor !== from.floor) break;
    if (distanceMeters(lat, lng, next.lat, next.lng) > AR_NEXT_POINT_METERS) break;
    arIndex++;
  }
  arRender();
}