// ============================================================
//  VetQueue CORE  (the "brain" - no buttons, no screen code)
//
//  This file is loaded by index.html BEFORE storage.js and app.js.
//  It contains everything about queues, sorting and searching.
//
//  WHERE TO CHANGE THINGS
//    What is stored about each pet ..... class Pet (section 1)
//    Who is called first ............... class QueueManager (section 5)
//    How emergencies are ordered ....... compare function in the QueueManager constructor
//    Remove a pet from the middle ...... remove() in sections 2 and 3, removePet() in section 5
//    Add a new way to sort ............. section 6 (copy sortByAge and change it)
//    Change how searching works ........ section 7
//
//  CONTENTS
//    1. Owner and Pet
//    2. Queue            first come, first served (FIFO)
//    3. Priority Queue   emergencies are served first
//    4. Pet Registry     list of every registered pet
//    5. Queue Manager    uses the two queues above
//    6. Sorting          bubble sort
//    7. Searching        linear search and binary search
// ============================================================


// ============================================================
// 1. OWNER AND PET
// ============================================================

class Owner {
  constructor(name, contact) {
    this.name = name;
    this.contact = contact;
  }
}

class Pet {
  constructor(name, species, age, owner, reason, isEmergency) {
    this.name = name;
    this.species = species;
    this.age = age;
    this.owner = owner;
    this.reason = reason;
    this.isEmergency = isEmergency; // chosen by clinic staff, never by the program
    this.queueNumber = null;        // given later by the QueueManager
    this.status = "Registered";     // Registered -> Waiting -> Done (or Cancelled)
  }

  // Shows the queue number as #001, #002, ...
  get queueLabel() {
    if (this.queueNumber === null) return "---";
    return "#" + String(this.queueNumber).padStart(3, "0");
  }
}


// ============================================================
// 2. QUEUE (first in, first out)
//    Built with a linked list: each node points to the next one.
//    Add at the back, remove from the front. Both are O(1).
//    Removing from the middle is O(n): we walk the list to find it.
// ============================================================

class QueueNode {
  constructor(value) {
    this.value = value;
    this.next = null;
  }
}

class Queue {
  constructor() {
    this.head = null; // front of the line
    this.tail = null; // back of the line
    this.size = 0;
  }

  isEmpty() {
    return this.size === 0;
  }

  // Put a new item at the back of the line.
  enqueue(value) {
    const node = new QueueNode(value);

    if (this.tail === null) {
      this.head = node;       // the line was empty
    } else {
      this.tail.next = node;
    }
    this.tail = node;
    this.size++;
  }

  // Take the item at the front of the line.
  dequeue() {
    if (this.isEmpty()) return null;

    const value = this.head.value;
    this.head = this.head.next;
    if (this.head === null) this.tail = null; // the line is now empty
    this.size--;
    return value;
  }

  // Take one specific item out of the line, wherever it is.
  // Returns true if it was found and removed.
  remove(value) {
    let previous = null;
    let current = this.head;

    while (current !== null) {
      if (current.value === value) {
        if (previous === null) {
          this.head = current.next;     // it was the first one
        } else {
          previous.next = current.next; // skip over it
        }
        if (current === this.tail) this.tail = previous; // it was the last one
        this.size--;
        return true;
      }
      previous = current;
      current = current.next;
    }
    return false;
  }

  // Copy of the line, front to back (does not change the queue).
  toArray() {
    const items = [];
    let current = this.head;
    while (current !== null) {
      items.push(current.value);
      current = current.next;
    }
    return items;
  }
}


// ============================================================
// 3. PRIORITY QUEUE (binary min-heap)
//    Stored in an array. The "best" item is always at position 0.
//    For the item at position i:
//        parent = (i - 1) / 2,  children = 2i + 1 and 2i + 2
//    Add and remove are both O(log n).
//
//    compare(a, b) must return a negative number when a should
//    come out before b.
// ============================================================

class PriorityQueue {
  constructor(compare) {
    this.compare = compare;
    this.heap = [];
  }

  get size() {
    return this.heap.length;
  }

  isEmpty() {
    return this.heap.length === 0;
  }

  enqueue(value) {
    this.heap.push(value);              // add at the end...
    this.moveUp(this.heap.length - 1);  // ...then move it up to its place
  }

  dequeue() {
    if (this.isEmpty()) return null;

    const best = this.heap[0];
    const last = this.heap.pop();
    if (this.heap.length > 0) {
      this.heap[0] = last;  // put the last item at the top...
      this.moveDown(0);     // ...then move it down to its place
    }
    return best;
  }

  // Take one specific item out of the heap, wherever it is.
  // Returns true if it was found and removed.
  remove(value) {
    const index = this.heap.indexOf(value);
    if (index === -1) return false;

    const last = this.heap.pop();       // take the last item out of the array
    if (index < this.heap.length) {     // we removed a spot that is not the end
      this.heap[index] = last;          // so the last item fills the gap...
      this.moveUp(index);               // ...and then moves to its right place
      this.moveDown(index);
    }
    return true;
  }

  // Items in the order they will be served (does not change the queue).
  toArray() {
    const copy = new PriorityQueue(this.compare);
    copy.heap = this.heap.slice();

    const items = [];
    while (!copy.isEmpty()) items.push(copy.dequeue());
    return items;
  }

  // Swap with the parent while this item should come out earlier.
  moveUp(i) {
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (this.compare(this.heap[i], this.heap[parent]) >= 0) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  // Swap with the better child while a child should come out earlier.
  moveDown(i) {
    const n = this.heap.length;
    while (true) {
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      let best = i;

      if (left < n && this.compare(this.heap[left], this.heap[best]) < 0) best = left;
      if (right < n && this.compare(this.heap[right], this.heap[best]) < 0) best = right;

      if (best === i) break;
      this.swap(i, best);
      i = best;
    }
  }

  swap(a, b) {
    const temp = this.heap[a];
    this.heap[a] = this.heap[b];
    this.heap[b] = temp;
  }
}


// ============================================================
// 4. PET REGISTRY
//    Keeps every pet that was ever registered (a dynamic array).
// ============================================================

class PetRegistry {
  constructor() {
    this.pets = [];
  }

  add(pet) {
    this.pets.push(pet);
  }

  // Returns a copy, so other code cannot damage the real list.
  getAll() {
    return this.pets.slice();
  }
}


// ============================================================
// 5. QUEUE MANAGER
//    Rule: emergencies are served first, then regular patients
//    in the order they arrived.
// ============================================================

class QueueManager {
  constructor() {
    this.nextNumber = 1;
    this.regularQueue = new Queue();

    // Among emergencies, the one who arrived first (lower number) goes first.
    this.emergencyQueue = new PriorityQueue((a, b) => a.queueNumber - b.queueNumber);
  }

  // Give the pet its queue number and put it in the correct queue.
  addPet(pet) {
    pet.queueNumber = this.nextNumber;
    this.nextNumber++;
    pet.status = "Waiting";
    this.putInQueue(pet);
  }

  // Call the next pet and remove it from the waiting line.
  callNext() {
    let pet;
    if (!this.emergencyQueue.isEmpty()) {
      pet = this.emergencyQueue.dequeue();
    } else {
      pet = this.regularQueue.dequeue();
    }

    if (pet !== null) pet.status = "Done";
    return pet;
  }

  // Take a waiting pet out of the line (for example, the owner left).
  // Returns true if the pet was waiting and is now removed.
  removePet(pet) {
    let removed;
    if (pet.isEmergency) {
      removed = this.emergencyQueue.remove(pet);
    } else {
      removed = this.regularQueue.remove(pet);
    }

    if (removed) pet.status = "Cancelled";
    return removed;
  }

  // Used when saved data is loaded: puts a pet back in its queue
  // WITHOUT giving it a new number.
  restorePet(pet) {
    this.putInQueue(pet);
  }

  // Everyone still waiting, in the order they will be called.
  getWaitingList() {
    return [...this.emergencyQueue.toArray(), ...this.regularQueue.toArray()];
  }

  // Emergency pets go to the heap, regular pets to the FIFO queue.
  putInQueue(pet) {
    if (pet.isEmergency) {
      this.emergencyQueue.enqueue(pet);
    } else {
      this.regularQueue.enqueue(pet);
    }
  }
}


// ============================================================
// 6. SORTING (bubble sort)
//    Compare neighbors and swap them if they are in the wrong
//    order. Repeat until nothing needs swapping. O(n^2).
//    It returns a NEW sorted list and leaves the original alone.
//
//    Optional "stats": pass createStats() to count the work done.
// ============================================================

// A small counter. After a sort or search, stats.comparisons
// (and stats.swaps for sorting) tell how much work it did.
function createStats() {
  return { comparisons: 0, swaps: 0 };
}

function bubbleSort(items, compare, stats) {
  const list = items.slice();

  for (let pass = 0; pass < list.length - 1; pass++) {
    let swapped = false;

    for (let i = 0; i < list.length - 1 - pass; i++) {
      if (stats) stats.comparisons++;

      if (compare(list[i], list[i + 1]) > 0) {
        const temp = list[i];
        list[i] = list[i + 1];
        list[i + 1] = temp;
        swapped = true;
        if (stats) stats.swaps++;
      }
    }

    if (!swapped) break; // already in order, so stop early
  }
  return list;
}

function sortByName(pets, stats) {
  return bubbleSort(pets, (a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()), stats);
}

function sortByAge(pets, stats) {
  return bubbleSort(pets, (a, b) => a.age - b.age, stats);
}

function sortByQueueNumber(pets, stats) {
  return bubbleSort(pets, (a, b) => a.queueNumber - b.queueNumber, stats);
}


// ============================================================
// 7. SEARCHING
//    Linear search: look at every pet one by one. O(n).
//    Binary search: needs a list sorted by queue number. Look at
//    the middle, then throw away the half that cannot contain the
//    answer. O(log n).
//
//    Optional "stats": pass createStats() to count comparisons.
// ============================================================

// Finds every pet whose name contains the text ("ma" finds Max and Mamba).
function searchByName(pets, text, stats) {
  const wanted = text.trim().toLowerCase();
  const found = [];

  for (const pet of pets) {
    if (stats) stats.comparisons++;
    if (pet.name.toLowerCase().includes(wanted)) found.push(pet);
  }
  return found;
}

// Linear search. Queue numbers are unique, so there is at most one match.
function searchByQueueNumber(pets, number, stats) {
  for (const pet of pets) {
    if (stats) stats.comparisons++;
    if (pet.queueNumber === number) return pet;
  }
  return null;
}

// Binary search. The list MUST already be sorted by queue number.
function binarySearchByQueueNumber(sortedPets, number, stats) {
  let low = 0;
  let high = sortedPets.length - 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const middleNumber = sortedPets[middle].queueNumber;
    if (stats) stats.comparisons++;

    if (middleNumber === number) return sortedPets[middle];
    if (middleNumber < number) low = middle + 1;  // look in the right half
    else high = middle - 1;                       // look in the left half
  }
  return null;
}