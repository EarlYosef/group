/* =====================================================================
   zone.js  -  "Where am I?": a small card that says how far you are from
   the campus and the Main Gate, which way (north, west...), and whether
   you are walking toward the gate. Near the gate a pulsing circle pops up.

   The limits (CAMPUS_LIMIT_METERS, GATE_*...) are in data.js.

   app.js CALLS
   initZone()                 once, when the page starts
   updateZone(lat, lng)       every time the GPS gives a new position
   refreshZone()              after the plan moved (redo the last position)

   SECTIONS
   1. Settings    3. Work out the zone
   2. Words       4. Show it (card + circle)
   ===================================================================== */


/* ===== 1. SETTINGS ===== */

const ZONE_MIN_MOVE_METERS = 3;      // you must move this much before we say "toward" or "away"

const zoneEl = {};                   // page elements, filled in by initZone()
let zoneLast = null;                 // the last position we were told: { lat, lng }
let zoneLastGateMeters = null;       // gate distance at the last real move
let zoneWalking = "still";           // "toward", "away" or "still"
let zoneName = null;                 // "far", "approaching", "gate" or "campus": to spot changes


/* ===== 2. WORDS ===== */

// "850 m", "2.4 km", "67 km"
function formatDistance(meters) {
  if (Math.round(meters) < 1000) return Math.round(meters) + " m";
  const km = meters / 1000;
  return (km < 10 ? km.toFixed(1) : Math.round(km)) + " km";
}

// A compass bearing (0 to 360) in words.
function compassWord(bearing) {
  const words = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
  return words[Math.round(bearing / 45) % 8];
}


/* ===== 3. WORK OUT THE ZONE ===== */

// How far from the middle of the plan still counts as "on campus".
// CAMPUS_LIMIT_METERS in data.js, or (when it is null) the size of the plan picture plus 15 m.
function campusLimitMeters() {
  if (typeof CAMPUS_LIMIT_METERS === "number") return CAMPUS_LIMIT_METERS;
  const halfDiagonalPixels = Math.sqrt(PLAN.width * PLAN.width + PLAN.height * PLAN.height) / 2;
  return Math.round(halfDiagonalPixels * PLAN.metersPerPixel + 15);
}

// Pure maths, no page: where is this position compared with the campus and the gate?
function classifyLocation(lat, lng) {
  const gate = NODES[GATE_NODE_ID];
  const centerMeters = distanceMeters(lat, lng, PLAN.lat, PLAN.lng);
  const gateMeters = distanceMeters(lat, lng, gate.lat, gate.lng);

  let zone = "far";
  if (gateMeters <= GATE_ARRIVE_METERS) zone = "gate";
  else if (centerMeters <= campusLimitMeters()) zone = "campus";
  else if (gateMeters <= GATE_APPROACH_METERS) zone = "approaching";

  return {
    zone: zone,
    gateMeters: gateMeters,
    centerMeters: centerMeters,
    // Which side of the gate you are on, and which side of the campus centre
    gateSide: compassWord(bearingDegrees(gate, { lat: lat, lng: lng })),
    campusSide: compassWord(bearingDegrees({ lat: PLAN.lat, lng: PLAN.lng }, { lat: lat, lng: lng })),
    // Which way the gate is from you (degrees), for the little arrow
    toGateBearing: bearingDegrees({ lat: lat, lng: lng }, gate)
  };
}

// Are you getting closer to the gate? Only decides after you moved a few meters.
function trackWalking(gateMeters) {
  if (zoneLastGateMeters === null) {
    zoneLastGateMeters = gateMeters;
    return;
  }
  const change = zoneLastGateMeters - gateMeters;      // plus = closer
  if (Math.abs(change) < ZONE_MIN_MOVE_METERS) return; // too small: keep the old answer (GPS jitters)
  zoneWalking = change > 0 ? "toward" : "away";
  zoneLastGateMeters = gateMeters;
}

// The two lines of text for the card.
function describeZone(info) {
  const gate = formatDistance(info.gateMeters) + " " + info.gateSide + " of the Main Gate";
  const walk = zoneWalking === "toward" ? "Walking toward the Main Gate"
             : zoneWalking === "away" ? "Walking away from the Main Gate"
             : null;

  if (info.zone === "gate") {
    return { title: "You're at the Main Gate", sub: "Welcome to St. Anthony's College" };
  }
  if (info.zone === "approaching") {
    return { title: gate, sub: walk || "Almost at the campus" };
  }
  if (info.zone === "campus") {
    return { title: "On campus · " + gate, sub: walk || "Type a room to get directions" };
  }
  return {
    title: formatDistance(info.centerMeters) + " " + info.campusSide + " of the campus",
    sub: "Outside the campus limit (" + campusLimitMeters() + " m). Directions start at the Main Gate."
  };
}


/* ===== 4. SHOW IT ===== */

function initZone() {
  ["zoneCard", "zoneArrow", "zoneTitle", "zoneSub"].forEach((id) => { zoneEl[id] = document.getElementById(id); });
  zoneEl.zoneCard.addEventListener("click", () => {
    const gate = NODES[GATE_NODE_ID];
    focusOn(gate.lat, gate.lng);          // tap the card: fly to the Main Gate
  });
}

function updateZone(lat, lng) {
  zoneLast = { lat: lat, lng: lng };
  const info = classifyLocation(lat, lng);
  trackWalking(info.gateMeters);
  const words = describeZone(info);

  zoneEl.zoneTitle.textContent = words.title;
  zoneEl.zoneSub.textContent = words.sub;
  zoneEl.zoneCard.hidden = false;
  zoneEl.zoneCard.dataset.zone = info.zone;

  // The little arrow points to the Main Gate (turned with the map, so it stays correct).
  const turn = info.toGateBearing - (map.getBearing ? map.getBearing() : 0);
  zoneEl.zoneArrow.style.webkitTransform = zoneEl.zoneArrow.style.transform = "rotate(" + turn + "deg)";

  // A new zone (for example you just came inside): the card pops.
  if (info.zone !== zoneName) {
    zoneName = info.zone;
    zoneEl.zoneCard.classList.remove("pop");
    void zoneEl.zoneCard.offsetWidth;     // lets the animation start again
    zoneEl.zoneCard.classList.add("pop");
    if (navigator.vibrate && info.zone !== "far") navigator.vibrate(120);
  }

  // The pulsing circle at the Main Gate: near the gate, or on campus walking toward it.
  const gate = NODES[GATE_NODE_ID];
  const showCircle = info.zone === "approaching" || info.zone === "gate" ||
                     (info.zone === "campus" && zoneWalking === "toward");
  showGateRipple(gate.lat, gate.lng, showCircle);
}

// After the plan was moved, the gate moved too: work it out again.
function refreshZone() {
  if (zoneLast) updateZone(zoneLast.lat, zoneLast.lng);
}