// ============================================================
//  VetQueue STORAGE  (saving data and sharing it with display.html)
//
//  The browser keeps small pieces of text in "localStorage". We use
//  it for two things:
//    1. SAVE_KEY     the whole clinic, so a page refresh loses nothing
//    2. DISPLAY_KEY  a small summary that display.html reads, so the
//                    waiting-room screen updates when staff call a pet
//
//  Used by index.html (app.js) and display.html (display.js).
//  The functions that rebuild pets also need vetqueue-core.js.
//
//  CONTENTS
//    1. Names of the saved items
//    2. Reading and writing text safely
//    3. Saving and loading the clinic     (staff page)
//    4. Sharing with the waiting-room screen
// ============================================================


// ============================================================
// 1. NAMES OF THE SAVED ITEMS
//    Change the "v1" if you ever change the saved format, so old
//    saved data is ignored instead of breaking the page.
// ============================================================

const SAVE_KEY = "vetqueue-clinic-v1";
const DISPLAY_KEY = "vetqueue-display-v1";


// ============================================================
// 2. READING AND WRITING TEXT SAFELY
//    localStorage can be blocked (for example in private windows),
//    so every call is wrapped and fails quietly.
// ============================================================

function readSaved(key) {
  try {
    const text = localStorage.getItem(key);
    return text === null ? null : JSON.parse(text);
  } catch (error) {
    return null;
  }
}

function writeSaved(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    // Saving is a bonus. If it fails, the page keeps working without it.
  }
}

function clearSaved() {
  try {
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem(DISPLAY_KEY);
  } catch (error) {
    // nothing to do
  }
}


// ============================================================
// 3. SAVING AND LOADING THE CLINIC
// ============================================================

// A pet as plain data (a class object cannot be saved directly).
function petToPlain(pet) {
  return {
    name: pet.name,
    species: pet.species,
    age: pet.age,
    ownerName: pet.owner.name,
    contact: pet.owner.contact,
    reason: pet.reason,
    isEmergency: pet.isEmergency,
    queueNumber: pet.queueNumber,
    status: pet.status,
  };
}

// The reverse: plain data back into a real Pet.
function plainToPet(saved) {
  const owner = new Owner(String(saved.ownerName), String(saved.contact || ""));
  const pet = new Pet(
    String(saved.name),
    String(saved.species),
    Number(saved.age),
    owner,
    String(saved.reason),
    saved.isEmergency === true
  );
  pet.queueNumber = Number(saved.queueNumber);
  pet.status = String(saved.status);
  return pet;
}

// Saves every pet, the next queue number, and who was called last.
function saveClinic(registry, queueManager, lastCalledPet) {
  writeSaved(SAVE_KEY, {
    nextNumber: queueManager.nextNumber,
    lastCalledNumber: lastCalledPet ? lastCalledPet.queueNumber : null,
    pets: registry.getAll().map(petToPlain),
  });
}

// Fills the (empty) registry and queues from the saved data.
// Returns the pet that was called last, or null.
function loadClinic(registry, queueManager) {
  const saved = readSaved(SAVE_KEY);
  if (!saved || !Array.isArray(saved.pets)) return null;

  let pets;
  try {
    pets = saved.pets.map(plainToPet);
    if (!pets.every((pet) => Number.isFinite(pet.queueNumber) && Number.isFinite(pet.age))) {
      throw new Error("saved data is damaged");
    }
  } catch (error) {
    return null; // damaged data: start fresh instead of crashing
  }

  // Every pet goes back in the registry...
  for (const pet of pets) registry.add(pet);

  // ...and the ones still waiting go back in their queues, oldest first.
  const waiting = pets.filter((pet) => pet.status === "Waiting");
  for (const pet of sortByQueueNumber(waiting)) queueManager.restorePet(pet);

  const highestNumber = pets.reduce((most, pet) => Math.max(most, pet.queueNumber), 0);
  queueManager.nextNumber = Math.max(Number(saved.nextNumber) || 1, highestNumber + 1);

  return pets.find((pet) => pet.queueNumber === saved.lastCalledNumber) || null;
}


// ============================================================
// 4. SHARING WITH THE WAITING-ROOM SCREEN
//    Only numbers and pet names are shared. No owner names, no
//    phone numbers and no medical reasons, because the screen
//    may be visible to everyone in the waiting room.
// ============================================================

function petToDisplay(pet) {
  return {
    number: pet.queueNumber,
    label: pet.queueLabel,
    name: pet.name,
    species: pet.species,
    isEmergency: pet.isEmergency,
  };
}

// Called by the staff page after every change.
function publishDisplay(queueManager, lastCalledPet) {
  writeSaved(DISPLAY_KEY, {
    updatedAt: Date.now(),
    nowServing: lastCalledPet ? petToDisplay(lastCalledPet) : null,
    waiting: queueManager.getWaitingList().map(petToDisplay),
  });
}

// Called by the waiting-room screen. Returns null if nothing was shared yet.
function readDisplay() {
  return readSaved(DISPLAY_KEY);
}