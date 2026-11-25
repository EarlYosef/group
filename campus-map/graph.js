/* =====================================================================
   graph.js  -  the graph, BFS, DFS and small helpers
   No map and no page code in here, so you can read it on its own.

   1. Build the graph      3. Algorithm list
   2. BFS and DFS          4. Helpers
   ===================================================================== */


/* ===== 1. BUILD THE GRAPH (adjacency list) ===== */

// graph["GATE"] = ["COURTYARD"], graph["COURTYARD"] = ["GATE", "LIBRARY", ...]
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


/* ===== 2. BFS AND DFS ===== */

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
    if (current === goal) {
      lastSearchVisited = Object.keys(cameFrom).length;
      return buildPath(cameFrom, goal);
    }

    for (const next of graph[current]) {
      if (!(next in cameFrom)) {
        cameFrom[next] = current;
        queue.push(next);               // add to the BACK
      }
    }
  }
  lastSearchVisited = Object.keys(cameFrom).length;
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


/* ===== 2b. DISTANCES (for the "Pathfinding data" box) ===== */

// How many places the last search looked at (shown in the "Pathfinding data" box).
let lastSearchVisited = 0;

const STAIRS_COST_METERS = 6;   // going up or down a floor counts like walking this far

// Cost of walking from place a to place b: real meters, plus a small price for changing floor.
function edgeCost(a, b) {
  const meters = distanceMeters(NODES[a].lat, NODES[a].lng, NODES[b].lat, NODES[b].lng);
  return meters + (NODES[a].floor !== NODES[b].floor ? STAIRS_COST_METERS : 0);
}

// Walking distance of a whole path in meters (floor changes cost extra here too, so it equals the path cost).
function pathCost(path) {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += edgeCost(path[i - 1], path[i]);
  return total;
}


/* ===== 3. ALGORITHM LIST ===== */

// Everything the page needs to know about each algorithm, in one place.
// To add another one, write the function above and add a line here.
function findWithDfs(start, goal) {
  const visited = new Set();
  const path = dfs(start, goal, visited);
  lastSearchVisited = visited.size;
  return path;
}

const ALGORITHMS = {
  bfs:      { label: "BFS",      color: "#08a597", dashed: false, find: bfs },          // teal, solid line
  dfs:      { label: "DFS",      color: "#5b4bdb", dashed: true,  find: findWithDfs }   // indigo, dashed line
};


/* ===== 4. HELPERS ===== */

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

// Position of a node the way MapLibre wants it: [lng, lat]  (longitude FIRST)
function toLngLat(id) {
  return [NODES[id].lng, NODES[id].lat];
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

// Compass direction (0-360 degrees) from one point to another.
// The camera uses it so the route points "up" the screen.
function bearingDegrees(from, to) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLng = toRad(to.lng - from.lng);
  const y = Math.sin(dLng) * Math.cos(toRad(to.lat));
  const x = Math.cos(toRad(from.lat)) * Math.sin(toRad(to.lat)) -
            Math.sin(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
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


// The closest point on any walkway (the lines between places on the ground floor) to a GPS point.
// Returns { lat, lng, meters } or null when no walkway is within maxMeters.
function snapToWalkway(lat, lng, maxMeters) {
  const metersPerLng = metersPerDegreeLng();
  let best = null;
  for (const [fromId, toId] of EDGES) {
    const a = NODES[fromId], b = NODES[toId];
    if (!a || !b || a.floor !== 1 || b.floor !== 1) continue;
    // work in meters around the GPS point
    const ax = (a.lng - lng) * metersPerLng, ay = (a.lat - lat) * METERS_PER_DEGREE;
    const bx = (b.lng - lng) * metersPerLng, by = (b.lat - lat) * METERS_PER_DEGREE;
    const dx = bx - ax, dy = by - ay;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared));
    const px = ax + t * dx, py = ay + t * dy;
    const meters = Math.hypot(px, py);
    if (meters <= maxMeters && (!best || meters < best.meters)) {
      best = { lat: lat + py / METERS_PER_DEGREE, lng: lng + px / metersPerLng, meters };
    }
  }
  return best;
}