/* =====================================================================
   share.js  -  "Share my location"

   A student taps the button and sends a link (Messenger, SMS...) to a parent.
   The parent opens it and the map shows a blue pin where the student was,
   with a "Directions to here" button.

   How it works (no server needed): the link holds the NAME of the nearest place
   (like D112) and the time. It is a snapshot, not live tracking, and it never
   contains GPS numbers. Nothing is sent until the student taps the button.
   ===================================================================== */

const SHARE_PARAM = "at";       // ?at=D112
const SHARE_TIME_PARAM = "t";   // &t=1732540000000  (when it was shared)

let sharedPin = null;           // the blue pin on the map (parent side)

/* ===== 1. SENDING (the student) ===== */

// The closest place with a real name (walkway points have no name, so they are skipped).
function nearestNamedPlace(lat, lng) {
  let best = null;
  Object.keys(NODES).forEach((id) => {
    const node = NODES[id];
    if (node.hidden || node.floor !== 1) return;
    const meters = distanceMeters(lat, lng, node.lat, node.lng);
    if (!best || meters < best.meters) best = { id, meters };
  });
  return best;
}

function buildShareLink(placeId) {
  const base = window.location.origin + window.location.pathname;
  return base + "?" + SHARE_PARAM + "=" + encodeURIComponent(placeId) + "&" + SHARE_TIME_PARAM + "=" + Date.now();
}

async function shareMyLocation() {
  if (!userPos) {                                   // we do not know where the student is yet
    locateMe();                                     // ask for permission (app.js)
    setStatus("Turn on your location, then tap 'Share my location' again.");
    return;
  }
  const place = nearestNamedPlace(userPos.lat, userPos.lng);
  if (!place || place.meters > FAR_FROM_CAMPUS_METERS) {
    setStatus("You are not on the campus yet, so there is no place to share.");
    return;
  }

  const name = NODES[place.id].name;
  const url = buildShareLink(place.id);
  const text = "I am near " + name + " at St. Anthony's College. Open this to see the spot:";

  if (navigator.share) {                            // phones: the normal share sheet
    try { await navigator.share({ title: "My location", text: text, url: url }); } catch (e) { /* closed the sheet */ }
    return;
  }
  try {                                             // computers: copy the link
    await navigator.clipboard.writeText(text + " " + url);
    setStatus("Link copied. Paste it in a message to send your location (near " + name + ").");
  } catch (e) {
    window.prompt("Copy this link and send it:", url);
  }
}

/* ===== 2. RECEIVING (the parent) ===== */

function minutesAgoText(time) {
  const minutes = Math.max(0, Math.round((Date.now() - time) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return minutes + " min ago";
  return Math.round(minutes / 60) + " h ago";
}

// Opened from a shared link: show the pin, a small card, and fly there.
function showSharedPlace() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get(SHARE_PARAM);
  if (!id || !NODES[id] || NODES[id].hidden) return;

  const node = NODES[id];
  const time = Number(params.get(SHARE_TIME_PARAM));

  const pin = document.createElement("div");
  pin.className = "shared-pin";
  sharedPin = new maplibregl.Marker({ element: pin }).setLngLat([node.lng, node.lat]).addTo(map);
  map.easeTo({ center: [node.lng, node.lat], zoom: 19, duration: 1800 });

  const card = document.createElement("div");
  card.className = "shared-card";
  card.innerHTML =
    '<div><strong>Shared location</strong><br>Near ' + node.name + (time ? " · " + minutesAgoText(time) : "") + "</div>" +
    '<button type="button" class="shared-go">Directions to here</button>' +
    '<button type="button" class="shared-close" aria-label="Close">×</button>';
  document.body.appendChild(card);

  card.querySelector(".shared-go").addEventListener("click", () => {
    destinationId = id;
    roomInput.value = node.name;
    selectFloor(null);
    showRoute(true);
    card.remove();
  });
  card.querySelector(".shared-close").addEventListener("click", () => {
    card.remove();
    sharedPin.remove();
  });
}

function initShare() {
  const button = document.getElementById("shareButton");
  if (button) button.addEventListener("click", shareMyLocation);
  onMapReady(showSharedPlace);                      // after the map is ready
}