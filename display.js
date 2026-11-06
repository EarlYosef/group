// ============================================================
//  VetQueue WAITING-ROOM SCREEN  (display.html)
//
//  Shows the queue number being served and the numbers waiting.
//  It does not change anything. It only reads what the staff page
//  (index.html) shares through storage.js.
//
//  Both pages must be opened in the SAME browser, from the same
//  place (for example both from Live Server).
//
//  WHERE TO CHANGE THINGS
//    How many "next" numbers are shown ... MAX_SHOWN
//    How often the screen checks ......... CHECK_EVERY_MS
//    Colors and sizes .................... display.css
//
//  CONTENTS
//    1. Settings
//    2. Helper functions
//    3. Drawing the screen
//    4. Start
// ============================================================


// ============================================================
// 1. SETTINGS
// ============================================================

const MAX_SHOWN = 8;          // how many waiting numbers fit on the screen
const CHECK_EVERY_MS = 1000;  // look for new data every second

let lastServingNumber;        // lets us notice when the number changes


// ============================================================
// 2. HELPER FUNCTIONS
// ============================================================

function byId(id) {
  return document.getElementById(id);
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function formatTime(milliseconds) {
  return new Date(milliseconds).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// Makes the big number flash for a moment so people notice the change.
function flashServingNumber() {
  const box = byId("serving-number");
  box.classList.remove("flash");
  void box.offsetWidth; // forces the browser to restart the animation
  box.classList.add("flash");
}


// ============================================================
// 3. DRAWING THE SCREEN
// ============================================================

function drawDisplay(data) {
  const servingNumber = byId("serving-number");
  const servingName = byId("serving-name");
  const list = byId("next-list");
  list.replaceChildren();

  // Nothing shared yet (the staff page has not been opened)
  if (data === null) {
    servingNumber.textContent = "---";
    servingName.textContent = "";
    byId("next-empty").hidden = false;
    byId("next-more").hidden = true;
    byId("status").textContent = "Waiting for the clinic desk. Open index.html in this same browser.";
    return;
  }

  // Now serving
  if (data.nowServing) {
    servingNumber.textContent = data.nowServing.label;
    servingName.textContent = `${data.nowServing.name} (${data.nowServing.species})`;
  } else {
    servingNumber.textContent = "---";
    servingName.textContent = "No patient called yet";
  }

  // Flash only when the number really changed (not on the first draw)
  const newNumber = data.nowServing ? data.nowServing.number : null;
  if (lastServingNumber !== undefined && newNumber !== lastServingNumber) flashServingNumber();
  lastServingNumber = newNumber;

  // Next in line
  const shown = data.waiting.slice(0, MAX_SHOWN);
  for (const pet of shown) {
    const row = makeElement("li", pet.isEmergency ? "next-item priority" : "next-item");
    row.appendChild(makeElement("span", "next-number", pet.label));
    row.appendChild(makeElement("span", "next-name", pet.name));
    if (pet.isEmergency) row.appendChild(makeElement("span", "next-tag", "Priority"));
    list.appendChild(row);
  }

  byId("next-empty").hidden = data.waiting.length > 0;

  const hiddenCount = data.waiting.length - shown.length;
  byId("next-more").hidden = hiddenCount <= 0;
  byId("next-more").textContent = `+ ${hiddenCount} more waiting`;

  byId("status").textContent = `Last update: ${formatTime(data.updatedAt)}`;
}

function refresh() {
  drawDisplay(readDisplay());
}

function updateClock() {
  byId("clock").textContent = formatTime(Date.now());
}


// ============================================================
// 4. START
// ============================================================

// The browser tells us right away when another page saves something...
window.addEventListener("storage", refresh);

// ...and we also check every second, as a backup.
setInterval(refresh, CHECK_EVERY_MS);
setInterval(updateClock, 1000);

refresh();
updateClock();