/* =====================================================================
   campus3d.js  -  the 3D buildings and trees, copied from YOUR own 3D page
   ("St. Anthony's College - 3D Campus Master Plan").

   Drawn with Three.js on top of the map (a MapLibre "custom layer").
   The ground, roads, track and pool are the picture (plan-image.js), so
   here we only build: buildings (windows + pitched roofs) and trees.

   WHAT TO CHANGE
     CAMPUS_BUILDINGS   one line per building: name, x, y, width, depth, angle, height, building id
     CAMPUS_TREE_SPOTS  where the extra trees stand (see makeTrees)
     LIGHT_LEVEL        0.3 darker ... 1.0 brighter
   If Three.js did not load, the map falls back to the simple 3D in map3d.js.
   ===================================================================== */

var LIGHT_LEVEL = 0.55;
var STOREY = 8;                                        // height of one floor in your 3D page's units

// Your page's numbers -> the picture's pixels (the same picture as plan-image.js)
var C3_SCALE = 1.507, C3_OFFSET_X = -40.52, C3_OFFSET_Z = -8.71;
var C3_CX = 350, C3_CZ = 250;                          // the middle your page used

// CAMPUS_BUILDINGS and CAMPUS_EXTRA_TREES come from layout.js (made from your saved layout file).

var c3 = {                                             // everything this file keeps
  scene: null, camera: null, renderer: null, world: null,
  parts: [],              // one entry per building: { def, body, floors[], apron }
  roofMats: [], wallMats: [],
  visible: false, focus: null, floor: null, look: "color", map: null,
  roomList: [], roomFloor: 1, roomView: null, labels: []   // the room view (see campus3dSetRooms)
};

var C3_WALLS = [0xd9d2c0, 0xd3ccb9, 0xdcd6c6];
var C3_ROOFS = [0xc8553a, 0x4f78a8, 0x4f78a8, 0x3f8d5a, 0x5b7fae, 0xb94a34, 0x4a6f9c];   // for buildings you drew   // soft beige walls (not too bright)
var C3_FLOOR_GOLD = 0xffd24a;                          // the opened floor

function c3Hash(text) { var h = 0; for (var i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0; return Math.abs(h); }
function c3Lit(color, f) {
  var r = Math.min(255, Math.round(((color >> 16) & 255) * f)), g = Math.min(255, Math.round(((color >> 8) & 255) * f)), b = Math.min(255, Math.round((color & 255) * f));
  return (r << 16) | (g << 8) | b;
}

// ---------- textures (drawn with code, no picture files) ----------
function c3Canvas(w, h, draw) {
  var c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h);
  var t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}
function c3Facade() {
  return c3Canvas(64, 64, function (g, w, h) {
    g.fillStyle = "#ffffff"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#e6dcc6"; g.fillRect(0, h - 5, w, 5);                     // bottom edge
    g.fillStyle = "#f8f8f8"; g.fillRect(14, 13, 36, 30);                     // window frame
    var q = g.createLinearGradient(0, 16, 0, 40); q.addColorStop(0, "#9fd0f0"); q.addColorStop(1, "#4f86b0");
    g.fillStyle = q; g.fillRect(17, 16, 30, 24);                             // glass
    g.fillStyle = "#f8f8f8"; g.fillRect(31, 16, 2, 24); g.fillRect(17, 27, 30, 2);
    g.fillStyle = "#cfc6b2"; g.fillRect(12, 43, 40, 3);                      // sill
  });
}

// ---------- one building ----------
function c3Material(color, facade) {
  var m = new THREE.MeshStandardMaterial({ color: color, roughness: 0.85, side: THREE.DoubleSide });
  if (facade) m.map = facade;
  return m;
}
// The window picture repeats along each wall: w = wall width, H = height (in 8-unit tiles)
function c3Box(w, H, h) {
  var g = new THREE.BoxGeometry(w, H, h), uv = g.attributes.uv;
  for (var f = 0; f < 6; f++) for (var k = 0; k < 4; k++) {
    var i = f * 4 + k;
    uv.setXY(i, uv.getX(i) * (f < 2 ? h / 8 : w / 8), uv.getY(i) * H / 8);
  }
  return g;
}

function c3Roof(def, roofColor, wallW, wallD) {
  var w = def[3], h = def[4], roof = new THREE.Group();
  var mat = new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.65, side: THREE.DoubleSide });
  c3.roofMats.push(mat);
  var slab = new THREE.Mesh(new THREE.BoxGeometry(w + 1.6, 1.1, h + 1.6), mat);
  roof.add(slab);

  var small = Math.min(w, h), big = Math.max(w, h);
  var pyramid = (small < 10 || big / small < 1.45);      // squarish -> pyramid, long -> gable (ridge) roof
  var rh = Math.min(14, Math.max(4, small * 0.55));      // roof height
  var geo;
  if (pyramid) {
    geo = new THREE.ConeGeometry(0.5, 1, 4); geo.rotateY(Math.PI / 4); geo.scale(w * 1.45, rh, h * 1.45);
  } else {
    var sw = small + 1.6, ln = big + 1.6, tri = new THREE.Shape();
    tri.moveTo(-sw / 2, 0); tri.lineTo(sw / 2, 0); tri.lineTo(0, rh); tri.closePath();
    geo = new THREE.ExtrudeGeometry(tri, { depth: ln, bevelEnabled: false });
    geo.translate(0, 0, -ln / 2);
    if (w > h) geo.rotateY(Math.PI / 2);
  }
  var top = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.65, side: THREE.DoubleSide }));
  c3.roofMats.push(top.material);
  top.position.y = 0.55 + (pyramid ? rh / 2 : 0);
  roof.add(top);
  top.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), new THREE.LineBasicMaterial({ color: 0x1d2a35, transparent: true, opacity: 0.6 })));

  if (!pyramid) {                                         // the ridge cap
    var ln2 = big + 1.6;
    var ridge = new THREE.Mesh(new THREE.BoxGeometry(w > h ? ln2 : 0.9, 0.6, w > h ? 0.9 : ln2), new THREE.MeshStandardMaterial({ color: c3Lit(roofColor, 1.3), roughness: 0.6 }));
    ridge.position.y = 0.55 + rh + 0.1;
    roof.add(ridge);
  }
  return roof;
}

function c3Building(def, facade) {
  var name = def[0], x = def[1], y = def[2], w = def[3], h = def[4], angle = def[5], H = def[6], id = def[7];
  var data = BUILDINGS.filter(function (b) { return b.id === id; })[0];
  var mine = def[8];                                      // a building you drew has its own colors
  var roofColor = mine ? C3_ROOFS[mine.rc % C3_ROOFS.length] : parseInt((ROOF_COLORS[data && data.roof] || ROOF_COLORS.red).slice(1), 16);
  var wall = mine ? C3_WALLS[mine.wc % C3_WALLS.length] : C3_WALLS[c3Hash(name) % C3_WALLS.length];

  var mats = [0, 1, 2, 3, 4, 5].map(function () { var m = c3Material(wall, facade); c3.wallMats.push(m); return m; });
  var body = new THREE.Mesh(c3Box(w, H, h), mats);
  var px = x + w / 2 - C3_CX, pz = y + h / 2 - C3_CZ, turn = -angle * Math.PI / 180;
  body.position.set(px, H / 2, pz); body.rotation.y = turn;
  body.add(new THREE.LineSegments(new THREE.EdgesGeometry(body.geometry), new THREE.LineBasicMaterial({ color: 0x8f98a3 })));
  for (var f = 1; f * STOREY < H; f++) {                  // a thin ledge between floors
    var ledge = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, 0.6, h + 0.8), new THREE.MeshStandardMaterial({ color: 0xe2d8c4, roughness: 0.9 }));
    ledge.position.y = f * STOREY - H / 2; body.add(ledge);
  }
  var roof = c3Roof(def, roofColor);
  roof.position.y = H / 2; body.add(roof);
  c3.world.add(body);

  var apron = new THREE.Mesh(new THREE.BoxGeometry(w + 7, 0.35, h + 7), new THREE.MeshStandardMaterial({ color: 0xeae3d1, roughness: 0.9 }));
  apron.position.set(px, 0.18, pz); apron.rotation.y = turn; c3.world.add(apron);

  // When this is the building you searched, it opens into floors 1, 2, 3
  var floors = [], each = H / 3, gap = 0.5;
  for (var k = 0; k < 3; k++) {
    var fm = [0, 1, 2, 3, 4, 5].map(function () { return c3Material(wall, facade); });
    var slab = new THREE.Mesh(c3Box(w, each - gap, h), fm);
    slab.position.set(px, k * each + (each - gap) / 2, pz); slab.rotation.y = turn;
    slab.add(new THREE.LineSegments(new THREE.EdgesGeometry(slab.geometry), new THREE.LineBasicMaterial({ color: 0xffffff })));
    slab.visible = false; c3.world.add(slab); floors.push({ mesh: slab, mats: fm, wall: wall });
  }
  c3.parts.push({ def: def, body: body, floors: floors, rect: { x: x, y: y, w: w, h: h, a: angle } });
}

// ---------- trees ----------
function c3InBuilding(x, y) {
  return c3.parts.some(function (p) {
    var b = p.rect, t = b.a * Math.PI / 180, c = Math.cos(t), s = Math.sin(t), dx = x - (b.x + b.w / 2), dy = y - (b.y + b.h / 2);
    return Math.abs(dx * c + dy * s) < b.w / 2 + 3 && Math.abs(-dx * s + dy * c) < b.h / 2 + 3;
  });
}

// the spots: a row beside the field, a row along the road, and small groups (same as your page)
/* The trees are made the same way as in your page, so the same trees show up:
   1. the page's own trees (every 6th one is skipped)
   2. in the artwork style: many more over the grass, away from walkways and your roads
   3. the trees you planted
   Trees you removed (CAMPUS_HIDDEN_TREES) and trees inside a building are left out. */
function c3TreeKey(t) { return Math.round(t[0]) + "," + Math.round(t[1]); }

function c3DistToSegment(x, y, a, b) {
  var dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  var t = l2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2)) : 0;
  return Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy));
}

function c3TreeSpots() {
  var seed = 7, a, k;
  function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }

  // 1. the page's own trees
  var own = [];
  for (k = 100; k <= 250; k += 13) own.push([328, k]);
  for (a = -130; a <= 72; a += 8) own.push([465 + 125 * Math.cos(a * Math.PI / 180), 172 + 98 * Math.sin(a * Math.PI / 180)]);
  for (k = 335; k <= 520; k += 15) own.push([k, 443]);
  function group(cx, cy, n, r) { for (var j = 0; j < n; j++) { var q = rnd() * 6.28, d = Math.sqrt(rnd()) * r; own.push([cx + d * Math.cos(q), cy + d * Math.sin(q)]); } }
  group(108, 342, 6, 14); group(98, 390, 4, 8); group(430, 408, 8, 16); group(370, 332, 5, 10);
  group(340, 345, 4, 8); group(160, 345, 4, 10); group(300, 265, 3, 8); group(200, 305, 4, 6);

  // 2. the artwork style: more trees over the grass
  var extra = [];
  if (CAMPUS_ART_TREES) {
    var site = [[28,490],[60,300],[95,140],[118,10],[290,3],[360,15],[490,42],[560,92],[610,150],[680,160],[660,215],[600,300],[590,425],[520,442],[330,450],[315,480]];
    var seed2 = 31;
    var r2 = function () { seed2 = (seed2 * 9301 + 49297) % 233280; return seed2 / 233280; };
    var inSite = function (x, y) {
      var c = false;
      for (var i = 0, j = site.length - 1; i < site.length; j = i++) {
        var p = site[i], q = site[j];
        if ((p[1] > y) !== (q[1] > y) && x < (q[0] - p[0]) * (y - p[1]) / (q[1] - p[1]) + p[0]) c = !c;
      }
      return c;
    };
    var ok = function (x, y) {
      if (!inSite(x, y) || y > 476) return false;
      if (Math.pow((x - 465) / 118, 2) + Math.pow((y - 172) / 94, 2) < 1) return false;    // the track
      if (x > 455 && x < 525 && y > 314 && y < 388) return false;                          // the pool
      if (x > 368 && x < 430 && y > 54 && y < 94) return false;                            // the volleyball court
      if (x > 396 && x < 426 && y > 310 && y < 352) return false;
      return !CAMPUS_OP.some(function (pl) {
        for (var i = 0; i < pl.length - 1; i++) if (c3DistToSegment(x, y, pl[i], pl[i + 1]) < 7) return true;
        return false;
      });
    };
    for (var tries = 0; tries < 400 && extra.length < 420; tries++) {
      var cx = 30 + r2() * 660, cy = 10 + r2() * 470;
      if (!ok(cx, cy)) continue;
      var n = 3 + Math.floor(r2() * 5);
      for (var i = 0; i < n; i++) {
        var an = r2() * 6.28, rr = r2() * 13, tx = cx + Math.cos(an) * rr, ty = cy + Math.sin(an) * rr;
        if (ok(tx, ty)) extra.push([tx, ty]);
      }
    }
  }

  var removed = {};
  CAMPUS_HIDDEN_TREES.forEach(function (key) { removed[key] = true; });
  function wanted(t) { return !removed[c3TreeKey(t)] && !c3InBuilding(t[0], t[1]); }
  function offRoads(t) {                                  // your own roads and paths: no trees on them
    return !CAMPUS_ROADS.some(function (r) { return c3DistToSegment(t[0], t[1], [r[0], r[1]], [r[2], r[3]]) < r[4] / 2 + 4; });
  }
  return own.filter(function (t, i) { return i % 6 !== 5 && wanted(t); })
    .concat(extra.filter(function (t) { return wanted(t) && offRoads(t); }),
            CAMPUS_EXTRA_TREES.filter(function (t) { return !removed[c3TreeKey(t)]; }));
}

function c3Trees() {
  var spots = c3TreeSpots();
  var greens = [0x2d6a3a, 0x3b7d43, 0x4f9150, 0x255a33, 0x5a9a4c];
  var trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.6, 0.9, 5, 6), new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.9 }), spots.length);
  var crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(4.8, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }), spots.length);
  var tops = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(3, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }), spots.length);
  var d = new THREE.Object3D();
  spots.forEach(function (t, i) {
    var hsh = c3Hash(Math.round(t[0]) + "," + Math.round(t[1])), s = 0.95 + (hsh % 55) / 100, col = greens[hsh % greens.length];
    var x = t[0] - C3_CX, z = t[1] - C3_CZ;
    d.position.set(x, 2.5 * s, z); d.scale.set(s, s, s); d.updateMatrix(); trunks.setMatrixAt(i, d.matrix);
    d.position.set(x, 8.4 * s, z); d.scale.set(s, s * 0.9, s); d.updateMatrix(); crowns.setMatrixAt(i, d.matrix); crowns.setColorAt(i, new THREE.Color(col));
    d.position.set(x + 0.8 * s, 10.7 * s, z - 0.8 * s); d.updateMatrix(); tops.setMatrixAt(i, d.matrix); tops.setColorAt(i, new THREE.Color(c3Lit(col, 1.35)));
  });
  c3.trees = new THREE.Group();                         // one group, so the white Plan look can hide every tree
  [trunks, crowns, tops].forEach(function (m) { m.frustumCulled = false; c3.trees.add(m); });
  c3.world.add(c3.trees);
}

// ---------- the map layer ----------
function c3Setup(map, gl) {
  c3.scene = new THREE.Scene();
  c3.camera = new THREE.Camera();
  c3.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
  c3.renderer.autoClear = false;

  c3.scene.add(new THREE.HemisphereLight(0xeaf5ff, 0xc4d2a4, 0.85 * LIGHT_LEVEL + 0.15));
  c3.scene.add(new THREE.AmbientLight(0xffffff, 0.15 * LIGHT_LEVEL + 0.1));
  var sun = new THREE.DirectionalLight(0xfff3dc, 0.85 * LIGHT_LEVEL + 0.1);
  sun.position.set(-250, 450, 300);
  c3.scene.add(sun);

  c3.world = new THREE.Group();                         // your page's units -> the picture's pixels
  c3.world.scale.set(C3_SCALE, C3_SCALE, C3_SCALE);
  c3.world.position.set(C3_SCALE * (C3_CX + 12) + C3_OFFSET_X, 0, C3_SCALE * (C3_CZ + 5) + C3_OFFSET_Z);
  c3.scene.add(c3.world);

  var facade = c3Facade();
  CAMPUS_BUILDINGS.forEach(function (def) { c3Building(def, facade); });
  c3Trees();
  c3.world.traverse(function (o) { o.frustumCulled = false; });
  c3.map = map;
  c3Refresh();
}

// the matrix that puts the picture's pixels (x, up, y) onto the map
function c3Matrix() {
  var o = maplibregl.MercatorCoordinate.fromLngLat(planToLngLat(0, 0));
  var ex = maplibregl.MercatorCoordinate.fromLngLat(planToLngLat(1000, 0));
  var ez = maplibregl.MercatorCoordinate.fromLngLat(planToLngLat(0, 1000));
  var ax = (ex.x - o.x) / 1000, ay = (ex.y - o.y) / 1000, bx = (ez.x - o.x) / 1000, by = (ez.y - o.y) / 1000;
  var up = Math.hypot(ax, ay);                           // one pixel of height, in map units
  return new THREE.Matrix4().set(
    ax, 0,  bx, o.x,
    ay, 0,  by, o.y,
    0,  up, 0,  0,
    0,  0,  0,  1);
}

var campus3DLayer = {
  id: "campus-3d",
  type: "custom",
  renderingMode: "3d",
  onAdd: function (map, gl) { c3Setup(map, gl); },
  render: function (gl, matrix) {
    if (!c3.visible) return;
    var m = matrix && matrix.length ? matrix : matrix.defaultProjectionData.mainMatrix;
    c3.camera.projectionMatrix = new THREE.Matrix4().fromArray(m).multiply(c3Matrix());
    c3FaceCamera();
    c3.renderer.resetState();
    c3.renderer.render(c3.scene, c3.camera);
  }
};

// ---------- what map3d.js can ask ----------
// Adds the layer (under the route lines). Returns true when Three.js is available.
function initCampus3D(map, beforeLayerId) {
  if (typeof THREE === "undefined" || typeof maplibregl === "undefined") return false;
  try { map.addLayer(campus3DLayer, beforeLayerId); } catch (e) { return false; }
  return true;
}
function campus3dSetVisible(on) { c3.visible = !!on; if (c3.map) c3.map.triggerRepaint(); }

// Only the building with this id is opened into floors; every other building stays solid.
function campus3dSetFocus(buildingId) { c3.focus = buildingId; c3Refresh(); }
function campus3dSetFloor(floor) { c3.floor = floor; c3Refresh(); }

/* ===== ROOM VIEW (like a dollhouse): the chosen building is cut open on one floor =====
   list = [{ name, x1, y1, x2, y2, chosen }] in plan pixels, floor = 1, 2 or 3.
   An empty list closes the room view again. */
function campus3dSetRooms(list, floor) { c3.roomList = list || []; c3.roomFloor = floor; c3Refresh(); }

// A flat picture (a name or the pin) that always turns to face you, from the front AND the back.
// (A THREE.Sprite does not do this in a map layer: seen from behind it disappears.)
function c3FacingPlane(texture, w, h, order) {
  var plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, side: THREE.DoubleSide }));
  plane.renderOrder = order;
  c3.labels.push(plane);
  return plane;
}

// Turn every label toward the camera (only left/right turning, so the text stays upright).
function c3FaceCamera() {
  if (!c3.labels.length) return;
  var inv = new THREE.Matrix4();
  if (inv.copy(c3.camera.projectionMatrix).invert) inv.copy(c3.camera.projectionMatrix).invert();
  else inv.getInverse(c3.camera.projectionMatrix);
  var near = new THREE.Vector3(0, 0, -1).applyMatrix4(inv), far = new THREE.Vector3(0, 0, 1).applyMatrix4(inv);
  var yaw = Math.atan2(near.x - far.x, near.z - far.z);       // the plane's front must point back at the camera
  c3.labels.forEach(function (label) { label.rotation.y = yaw; });
}

function c3NameSprite(text, chosen) {
  var size = chosen ? 30 : 22;
  var canvas = document.createElement("canvas");
  canvas.width = 512; canvas.height = 96;
  (function (g, w, h) {
    g.font = "bold " + size * 2 + "px sans-serif";
    g.textAlign = "center"; g.textBaseline = "middle";
    var pad = g.measureText(text).width + 40;
    g.fillStyle = chosen ? "rgba(255,210,74,0.95)" : "rgba(30,34,43,0.72)";
    g.fillRect((w - pad) / 2, 8, pad, h - 16);
    g.fillStyle = chosen ? "#1e222b" : "#ffffff";
    g.fillText(text, w / 2, h / 2 + 2);
  })(canvas.getContext("2d"), 512, 96);
  var tex = new THREE.CanvasTexture(canvas);
  var k = chosen ? 0.05 : 0.034;
  return c3FacingPlane(tex, 512 * k, 96 * k, 10);
}

// Plan pixels (what the room list uses) -> the units of your page that the buildings use
function c3FromPx(x, y) { return [(x + 40.52) / 1.5061 - 12 - C3_CX, (y + 8.71) / 1.5085 - 5 - C3_CZ]; }

// The round pin that sits ON the chosen room's floor (so on floor 3 it floats at floor 3, not on the ground)
function c3PinSprite() {
  var canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  var g = canvas.getContext("2d");
  g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2);
  g.fillStyle = "rgba(242,183,5,0.35)"; g.fill();                  // soft glow ring
  g.beginPath(); g.arc(64, 64, 34, 0, Math.PI * 2);
  g.fillStyle = "#f2b705"; g.fill();
  g.lineWidth = 8; g.strokeStyle = "#7a1f2b"; g.stroke();          // gold dot, maroon edge
  return c3FacingPlane(new THREE.CanvasTexture(canvas), 7, 7, 9);
}

// The open floor of the focus building, all in one group:
// a floor plate + low outer walls for every part of the building, then the rooms (tile, partitions, name).
function c3BuildRoomView() {
  var g = new THREE.Group();
  c3.parts.forEach(function (part) {
    var d = part.def;
    if (d[7] !== c3.focus) return;
    var w = d[3], h = d[4], each = d[6] / 3, base = (c3.roomFloor - 1) * each, wallH = Math.min(5, each - 0.6);
    var turn = -d[5] * Math.PI / 180, cx = d[1] + w / 2 - C3_CX, cz = d[2] + h / 2 - C3_CZ;
    var plate = new THREE.Mesh(new THREE.BoxGeometry(w, 0.8, h), new THREE.MeshStandardMaterial({ color: 0xe9e4d6, roughness: 0.9 }));
    plate.position.set(cx, base + 0.4, cz); plate.rotation.y = turn; g.add(plate);
    var wallMat = new THREE.MeshStandardMaterial({ color: part.floors[0].wall, roughness: 0.9 });
    var c = Math.cos(turn), n = Math.sin(turn);
    [[w, 0.8, 0, h / 2], [w, 0.8, 0, -h / 2], [0.8, h, w / 2, 0], [0.8, h, -w / 2, 0]].forEach(function (side) {
      var wall = new THREE.Mesh(new THREE.BoxGeometry(side[0], wallH, side[1]), wallMat);   // the sides that stay
      wall.position.set(cx + side[2] * c + side[3] * n, base + 0.8 + wallH / 2, cz - side[2] * n + side[3] * c);
      wall.rotation.y = turn; g.add(wall);
    });
  });

  var part = c3.parts.filter(function (p) { return p.def[7] === c3.focus; })[0];
  var each = part.def[6] / 3, base = (c3.roomFloor - 1) * each, wallH = Math.min(5, each - 0.6);
  c3.roomList.forEach(function (r) {
    var p1 = c3FromPx(r.x1, r.y1), p2 = c3FromPx(r.x2, r.y2);
    var rw = p2[0] - p1[0], rh = p2[1] - p1[1], mx = (p1[0] + p2[0]) / 2, mz = (p1[1] + p2[1]) / 2;
    var tile = new THREE.Mesh(new THREE.BoxGeometry(rw - 0.3, 0.2, rh - 0.3),
      new THREE.MeshStandardMaterial({ color: r.chosen ? C3_FLOOR_GOLD : 0x7fb7b0, roughness: 0.8 }));
    tile.position.set(mx, base + 0.9, mz); g.add(tile);
    var edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(rw, wallH * 0.7, rh)),
      new THREE.LineBasicMaterial({ color: r.chosen ? 0xffffff : 0xcfd6dc }));
    edge.position.set(mx, base + 0.8 + wallH * 0.35, mz); g.add(edge);       // thin partition walls
    if (r.chosen) { var pin = c3PinSprite(); pin.position.set(mx, base + 2.2, mz); g.add(pin); }
    var label = c3NameSprite(r.name, r.chosen);
    label.position.set(mx, base + wallH + (r.chosen ? 3 : 2), mz); g.add(label);
  });
  return g;
}
// "color" = the colorful look, "plan" = the white plan look
function campus3dSetLook(look) { c3.look = look; c3Refresh(); }

function c3Refresh() {
  if (!c3.scene) return;
  var plan = c3.look === "plan";
  if (c3.trees) c3.trees.visible = !plan;                            // white Plan look: only the buildings, no trees
  if (c3.roomView) { c3.world.remove(c3.roomView); c3.roomView = null; }
  c3.labels = [];                                                    // the old name tags go with the old room view
  var cut = c3.roomList && c3.roomList.length ? c3.roomFloor : 0;     // the floor that is cut open (0 = none)
  c3.parts.forEach(function (p) {
    var open = p.def[7] === c3.focus;
    p.body.visible = !open;
    p.floors.forEach(function (f, i) {
      f.mesh.visible = open && (!cut || i + 1 < cut);                 // room view: floors below stay, this one opens, above go
      var on = c3.floor === i + 1 && !cut;
      f.mats.forEach(function (m) { m.color.setHex(on ? C3_FLOOR_GOLD : f.wall); });
    });
  });
  if (cut && c3.focus) { c3.roomView = c3BuildRoomView(); c3.roomView.traverse(function (o) { o.frustumCulled = false; }); c3.world.add(c3.roomView); }
  c3.roofMats.forEach(function (m) { if (m.userData.color === undefined) m.userData.color = m.color.getHex(); m.color.setHex(plan ? 0xb9bec6 : m.userData.color); });
  if (c3.map) c3.map.triggerRepaint();
}