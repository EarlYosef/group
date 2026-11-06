// ============================================================
//  VetQueue SCREEN CODE  (connects index.html to vetqueue-core.js)
//
//  Load order in index.html: vetqueue-core.js, storage.js, app.js
//
//  vetqueue-core.js provides:
//    Owner, Pet, PetRegistry, QueueManager, createStats,
//    sortByName, sortByAge, sortByQueueNumber,
//    searchByName, searchByQueueNumber, binarySearchByQueueNumber
//  storage.js provides:
//    saveClinic, loadClinic, publishDisplay, clearSaved
//
//  WHERE TO CHANGE THINGS
//    Add or remove a form field ........ index.html (inside <form>) and registerFromForm()
//    Change the error messages ......... findFormProblem()
//    Change the ticket text ............ showTicket()
//    Change what each queue card shows . drawQueue()
//    Change the table columns .......... index.html (<thead>) and drawRecords()
//    Change the search or sort texts ... getRecordsToShow()
//    Change the sample pets ............ SAMPLE_PETS
//    Change colors, sizes, spacing ..... style.css (colors are at the very top)
//    Change queue, sort, search rules .. vetqueue-core.js
//
//  CONTENTS
//    1. Data and settings
//    2. Small helper functions
//    3. Drawing the screen
//    4. Registering pets
//    5. Button and typing events
//    6. Start
// ============================================================


// ============================================================
// 1. DATA AND SETTINGS
// ============================================================

const registry = new PetRegistry();       // every registered pet
const queueManager = new QueueManager();  // the waiting line

let sortBy = "queue";     // "queue", "name" or "age"
let searchText = "";      // what is typed in the search box

// Load what was saved last time (or null if this is the first visit).
// This fills the registry and the queues. The result is the pet that
// was called last, shown in the green "Now calling" banner.
let lastCalledPet = loadClinic(registry, queueManager);

// Words used to describe the sort in the "algorithm info" lines
const SORT_LABELS = { queue: "queue number", name: "name", age: "age" };

// Used by the "Load sample pets" button (handy for demos)
const SAMPLE_PETS = [
  { petName: "Max",   species: "Dog",    age: 5, ownerName: "Ana Reyes", contact: "0917-111-2222", reason: "Regular Checkup", isEmergency: false },
  { petName: "Milo",  species: "Cat",    age: 2, ownerName: "Ben Cruz",  contact: "0918-333-4444", reason: "Injury",          isEmergency: true  },
  { petName: "Bella", species: "Dog",    age: 3, ownerName: "Cora Lim",  contact: "0919-555-6666", reason: "Vaccination",     isEmergency: false },
  { petName: "Coco",  species: "Rabbit", age: 1, ownerName: "Dan Tan",   contact: "0920-777-8888", reason: "Dental Check",    isEmergency: false },
  { petName: "Rex",   species: "Dog",    age: 8, ownerName: "Eli Go",    contact: "0921-999-0000", reason: "Poisoning",       isEmergency: true  },
];


// ============================================================
// 2. SMALL HELPER FUNCTIONS
// ============================================================

// Short name for document.getElementById.
function byId(id) {
  return document.getElementById(id);
}

// Creates an HTML element with optional CSS class and text.
// It uses textContent, so whatever the user types is shown as plain
// text and can never run as code.
function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

// Shows a message under the form. Errors are red, success is green.
function showMessage(text, isError) {
  const box = byId("form-msg");
  box.textContent = text;
  box.classList.toggle("error", isError === true);
}

// The big number card the owner receives after registering.
function showTicket(pet) {
  const ahead = queueManager.getWaitingList().indexOf(pet);

  let info;
  if (ahead === 0) info = "Next to be called";
  else if (ahead === 1) info = "1 patient ahead";
  else info = `${ahead} patients ahead`;
  if (pet.isEmergency) info += " · Priority case";

  byId("ticket-number").textContent = pet.queueLabel;
  byId("ticket-name").textContent = pet.name;
  byId("ticket-info").textContent = info;
  byId("ticket").hidden = false;
}

function hideTicket() {
  byId("ticket").hidden = true;
}


// ============================================================
// 3. DRAWING THE SCREEN
//    Every time something changes we redraw the three parts.
// ============================================================

// The waiting line (right side, top).
function drawQueue() {
  const list = byId("queue-list");
  list.replaceChildren(); // erase the old list

  const waiting = queueManager.getWaitingList();

  for (const pet of waiting) {
    const row = makeElement("li", pet.isEmergency ? "q-item priority" : "q-item");

    row.appendChild(makeElement("span", "q-num", pet.queueLabel));

    const info = makeElement("div");
    info.appendChild(makeElement("div", "q-name", pet.name));
    info.appendChild(makeElement("div", "q-sub", `${pet.species} · ${pet.reason} · Owner: ${pet.owner.name}`));
    info.appendChild(makeElement("div", "q-struct",
      pet.isEmergency ? "Stored in: priority queue (heap)" : "Stored in: FIFO queue (linked list)"));
    row.appendChild(info);

    const badgeClass = pet.isEmergency ? "badge priority" : "badge";
    row.appendChild(makeElement("span", badgeClass, pet.isEmergency ? "Priority" : "Regular"));

    // Small "x" button to take this pet out of the line
    const cancelButton = makeElement("button", "cancel-btn", "✕");
    cancelButton.type = "button";
    cancelButton.title = `Remove ${pet.name} from the queue`;
    cancelButton.setAttribute("aria-label", cancelButton.title);
    cancelButton.addEventListener("click", () => cancelPet(pet));
    row.appendChild(cancelButton);

    list.appendChild(row);
  }

  // "Nobody is waiting" text and the Call next button
  byId("queue-empty").hidden = waiting.length > 0;
  byId("call-next").disabled = waiting.length === 0;

  // Green banner with the pet that was called last
  const banner = byId("now-serving");
  if (lastCalledPet) {
    banner.hidden = false;
    banner.textContent =
      `Now calling ${lastCalledPet.queueLabel} ${lastCalledPet.name} ` +
      `(${lastCalledPet.species}) - owner ${lastCalledPet.owner.name}`;
  } else {
    banner.hidden = true;
  }
}

// Works out which pets to show in the table: first search, then sort.
// Also returns "notes" that explain how much work each algorithm did.
function getRecordsToShow() {
  const notes = [];
  let pets = registry.getAll();

  const text = searchText.trim();
  if (text !== "") {
    // "3" or "#3" means a queue number. Anything else is a name.
    const numberMatch = /^#?(\d+)$/.exec(text);

    if (numberMatch) {
      const number = Number(numberMatch[1]);
      const sortedPets = sortByQueueNumber(pets); // binary search needs sorted data
      const binaryStats = createStats();
      const linearStats = createStats();

      const found = binarySearchByQueueNumber(sortedPets, number, binaryStats);
      searchByQueueNumber(pets, number, linearStats); // only to compare the work
      pets = found ? [found] : [];

      notes.push(
        `Search #${number}: binary search used ${binaryStats.comparisons} comparison(s), ` +
        `linear search would use ${linearStats.comparisons}.`
      );
    } else {
      const stats = createStats();
      pets = searchByName(pets, text, stats);
      notes.push(`Search "${text}" (linear search): checked ${stats.comparisons} pet(s).`);
    }
  }

  const sortStats = createStats();
  if (sortBy === "name") pets = sortByName(pets, sortStats);
  else if (sortBy === "age") pets = sortByAge(pets, sortStats);
  else pets = sortByQueueNumber(pets, sortStats);

  notes.push(
    `Sorted by ${SORT_LABELS[sortBy]} (bubble sort): ` +
    `${sortStats.comparisons} comparisons, ${sortStats.swaps} swaps.`
  );

  return { pets, notes };
}

// The records table (bottom).
function drawRecords() {
  const body = byId("records");
  body.replaceChildren();

  const view = getRecordsToShow();

  for (const pet of view.pets) {
    const row = makeElement("tr");
    row.appendChild(makeElement("td", "num", pet.queueLabel));
    row.appendChild(makeElement("td", "", pet.name));
    row.appendChild(makeElement("td", "", pet.species));
    row.appendChild(makeElement("td", "", String(pet.age)));
    row.appendChild(makeElement("td", "", pet.owner.name));
    row.appendChild(makeElement("td", "", pet.reason));

    // Status badge: Done and Cancelled are grey, priority is red, regular is plain
    let badgeClass = "badge";
    let statusText = pet.status;
    if (pet.status === "Done") {
      badgeClass = "badge done";
    } else if (pet.status === "Cancelled") {
      badgeClass = "badge cancelled";
    } else if (pet.isEmergency) {
      badgeClass = "badge priority";
      statusText = "Waiting (priority)";
    }
    const statusCell = makeElement("td");
    statusCell.appendChild(makeElement("span", badgeClass, statusText));
    row.appendChild(statusCell);

    body.appendChild(row);
  }

  byId("records-empty").hidden = view.pets.length > 0;

  // The lines that explain the work done by the sort and the search
  const info = byId("algo-info");
  info.replaceChildren();
  for (const note of view.notes) info.appendChild(makeElement("div", "", note));
}

// The three numbers in the top bar.
function drawCounters() {
  const waiting = queueManager.getWaitingList();
  const priorityCount = waiting.filter((pet) => pet.isEmergency).length;

  byId("stat-waiting").textContent = waiting.length;
  byId("stat-emergency").textContent = priorityCount;
  byId("stat-total").textContent = registry.getAll().length;
}

function drawEverything() {
  drawQueue();
  drawRecords();
  drawCounters();
}

// Call this after EVERY change: redraw, save, and tell the waiting-room screen.
function update() {
  drawEverything();
  saveClinic(registry, queueManager, lastCalledPet);
  publishDisplay(queueManager, lastCalledPet);
}


// ============================================================
// 4. REGISTERING PETS
// ============================================================

// Checks the form fields. Returns an error text, or "" if all is fine.
function findFormProblem(fields) {
  if (fields.petName === "") return "Please enter the pet's name.";
  if (fields.ownerName === "") return "Please enter the owner's name.";
  if (!Number.isFinite(fields.age)) return "Age must be a number.";
  if (fields.age < 0) return "Age cannot be negative.";
  return "";
}

// Creates the pet, saves it in the registry and puts it in the right queue.
function addPetToClinic(fields) {
  const owner = new Owner(fields.ownerName, fields.contact);
  const pet = new Pet(fields.petName, fields.species, fields.age, owner, fields.reason, fields.isEmergency);
  registry.add(pet);
  queueManager.addPet(pet);
  return pet;
}

function registerFromForm(form) {
  // form.elements.<name> reads the input whose name="..." is that word
  const inputs = form.elements;

  const fields = {
    petName: inputs.name.value.trim(),
    species: inputs.species.value,
    age: Number(inputs.age.value),
    ownerName: inputs.owner.value.trim(),
    contact: inputs.contact.value.trim(),
    reason: inputs.reason.value.trim() || "Checkup",
    isEmergency: inputs.emergency.checked,
  };

  const problem = findFormProblem(fields);
  if (problem !== "") {
    showMessage(problem, true);
    hideTicket();
    return;
  }

  const pet = addPetToClinic(fields);

  showMessage(`Registered ${pet.name}. Queue number ${pet.queueLabel}${pet.isEmergency ? " (priority)" : ""}.`, false);
  showTicket(pet);

  // Clear the form, ready for the next pet
  form.reset();
  inputs.age.value = 1;
  inputs.reason.value = "Checkup";
  inputs.name.focus();

  update();
}

// Takes a waiting pet out of the line (asks first, in case of a mis-click).
function cancelPet(pet) {
  if (!window.confirm(`Remove ${pet.name} (${pet.queueLabel}) from the queue?`)) return;

  queueManager.removePet(pet);
  hideTicket(); // the "patients ahead" number on the ticket would now be out of date
  update();
}


// ============================================================
// 5. BUTTON AND TYPING EVENTS
// ============================================================

// "Register and add to queue" button
byId("reg-form").addEventListener("submit", (event) => {
  event.preventDefault(); // stop the browser from reloading the page
  try {
    registerFromForm(event.target);
  } catch (error) {
    // Safety net: show any unexpected problem instead of failing silently
    showMessage("Something went wrong: " + error.message, true);
    console.error(error);
  }
});

// "Call next patient" button
byId("call-next").addEventListener("click", () => {
  const pet = queueManager.callNext();
  if (pet !== null) lastCalledPet = pet; // keep the old banner if nobody was waiting
  hideTicket(); // the "patients ahead" number on the ticket would now be out of date
  update();
});

// Search box: update the table on every key press
byId("search").addEventListener("input", (event) => {
  searchText = event.target.value;
  drawRecords();
});

// Sort buttons: Queue # / Name / Age
const sortButtons = document.querySelectorAll(".seg button");
sortButtons.forEach((button) => {
  button.addEventListener("click", () => {
    sortBy = button.dataset.sort; // from data-sort="..." in index.html
    sortButtons.forEach((other) => other.classList.toggle("active", other === button));
    drawRecords();
  });
});

// "Load sample pets" button (footer)
byId("load-sample").addEventListener("click", () => {
  SAMPLE_PETS.forEach((fields) => addPetToClinic(fields));
  showMessage(`Added ${SAMPLE_PETS.length} sample pets.`, false);
  hideTicket();
  update();
});

// "Reset all data" button (footer)
byId("reset-all").addEventListener("click", () => {
  if (!window.confirm("Delete ALL pets and start again?")) return;

  clearSaved();
  window.location.reload();
});


// ============================================================
// 6. START
// ============================================================

update();