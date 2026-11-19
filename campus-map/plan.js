/* =====================================================================
   plan.js  -  puts your 2D plan (a picture) on the real map

   The picture counts in PIXELS (x to the right, y downward, from its
   top-left corner). The map counts in latitude / longitude. This file
   converts between the two, using the PLAN numbers in data.js
   (where the picture sits, how big it is, how much it is turned).

   1. Conversion          3. Give every place its lat/lng
   2. Moving the plan
   ===================================================================== */


/* ===== 1. CONVERSION ===== */

const METERS_PER_DEGREE = 111320;   // meters in one degree of latitude (close enough for a campus)

function metersPerDegreeLng() {
  return METERS_PER_DEGREE * Math.cos((PLAN.lat * Math.PI) / 180);
}

// Picture pixel (x, y)  ->  [lng, lat]
function planToLngLat(x, y) {
  const r = (PLAN.rotation * Math.PI) / 180;
  const dx = (x - PLAN.width / 2) * PLAN.metersPerPixel;
  const dy = -(y - PLAN.height / 2) * PLAN.metersPerPixel;   // pictures count y downward, maps count north upward
  const east  =  dx * Math.cos(r) + dy * Math.sin(r);
  const north = -dx * Math.sin(r) + dy * Math.cos(r);
  return [PLAN.lng + east / metersPerDegreeLng(), PLAN.lat + north / METERS_PER_DEGREE];
}

// [lng, lat]  ->  picture pixel { x, y }   (the opposite direction)
function lngLatToPlan(lng, lat) {
  const r = (PLAN.rotation * Math.PI) / 180;
  const east  = (lng - PLAN.lng) * metersPerDegreeLng();
  const north = (lat - PLAN.lat) * METERS_PER_DEGREE;
  const dx = east * Math.cos(r) - north * Math.sin(r);
  const dy = east * Math.sin(r) + north * Math.cos(r);
  return {
    x: PLAN.width / 2 + dx / PLAN.metersPerPixel,
    y: PLAN.height / 2 - dy / PLAN.metersPerPixel
  };
}

// The four corners of the picture on the map, in the order MapLibre wants:
// top-left, top-right, bottom-right, bottom-left.
function planCorners() {
  return [
    planToLngLat(0, 0),
    planToLngLat(PLAN.width, 0),
    planToLngLat(PLAN.width, PLAN.height),
    planToLngLat(0, PLAN.height)
  ];
}


/* ===== 2. MOVING THE PLAN ===== */

// Slide the whole plan by some meters (east and north are positive).
function nudgePlan(eastMeters, northMeters) {
  PLAN.lng += eastMeters / metersPerDegreeLng();
  PLAN.lat += northMeters / METERS_PER_DEGREE;
}


/* ===== 3. GIVE EVERY PLACE ITS LAT/LNG ===== */

// graph.js and map3d.js use lat/lng. Run this again whenever PLAN changes.
function applyPlan() {
  for (const id in NODES) {
    const [lng, lat] = planToLngLat(NODES[id].x, NODES[id].y);
    NODES[id].lng = lng;
    NODES[id].lat = lat;
  }
}

applyPlan();