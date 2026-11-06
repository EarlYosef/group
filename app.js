
const registry = new PetRegistry();       // every registered pet
const queueManager = new QueueManager();  // the waiting line

let sortBy = "queue";    // "queue", "name" or "age"
let searchText = "";     // what is typed in the search box
let lastCalledPet = null; // shown in the green "Now calling" banner


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
    row.appendChild(info);

    const badgeClass = pet.isEmergency ? "badge priority" : "badge";
    row.appendChild(makeElement("span", badgeClass, pet.isEmergency ? "Priority" : "Regular"));

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
function getRecordsToShow() {
  let pets = registry.getAll();

  const text = searchText.trim();
  if (text !== "") {
    // "3" or "#3" means a queue number. Anything else is a name.
    const numberMatch = /^#?(\d+)$/.exec(text);
    if (numberMatch) {
      const pet = searchByQueueNumber(pets, Number(numberMatch[1]));
      pets = pet ? [pet] : [];
    } else {
      pets = searchByName(pets, text);
    }
  }

  if (sortBy === "name") return sortByName(pets);
  if (sortBy === "age") return sortByAge(pets);
  return sortByQueueNumber(pets);
}

// The records table (bottom).
function drawRecords() {
  const body = byId("records");
  body.replaceChildren();

  const pets = getRecordsToShow();

  for (const pet of pets) {
    const row = makeElement("tr");
    row.appendChild(makeElement("td", "num", pet.queueLabel));
    row.appendChild(makeElement("td", "", pet.name));
    row.appendChild(makeElement("td", "", pet.species));
    row.appendChild(makeElement("td", "", String(pet.age)));
    row.appendChild(makeElement("td", "", pet.owner.name));
    row.appendChild(makeElement("td", "", pet.reason));

    // Status badge: Done is grey, priority is orange, regular is green
    let badgeClass = "badge";
    let statusText = pet.status;
    if (pet.status === "Done") {
      badgeClass = "badge done";
    } else if (pet.isEmergency) {
      badgeClass = "badge priority";
      statusText = "Waiting (priority)";
    }
    const statusCell = makeElement("td");
    statusCell.appendChild(makeElement("span", badgeClass, statusText));
    row.appendChild(statusCell);

    body.appendChild(row);
  }

  byId("records-empty").hidden = pets.length > 0;
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


// ============================================================
// 4. READING THE REGISTRATION FORM
// ============================================================

// Checks the form fields. Returns an error text, or "" if all is fine.
function findFormProblem(fields) {
  if (fields.petName === "") return "Please enter the pet's name.";
  if (fields.ownerName === "") return "Please enter the owner's name.";
  if (!Number.isFinite(fields.age)) return "Age must be a number.";
  if (fields.age < 0) return "Age cannot be negative.";
  return "";
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
    return;
  }

  const owner = new Owner(fields.ownerName, fields.contact);
  const pet = new Pet(fields.petName, fields.species, fields.age, owner, fields.reason, fields.isEmergency);
  registry.add(pet);
  queueManager.addPet(pet);

  showMessage(`Registered ${pet.name}. Queue number ${pet.queueLabel}${pet.isEmergency ? " (priority)" : ""}.`, false);

  // Clear the form, ready for the next pet
  form.reset();
  inputs.age.value = 1;
  inputs.reason.value = "Checkup";
  inputs.name.focus();

  drawEverything();
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
  lastCalledPet = queueManager.callNext();
  drawEverything();
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


// ============================================================
// 6. START
// ============================================================

drawEverything();