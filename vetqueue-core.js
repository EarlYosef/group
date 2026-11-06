
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
    this.status = "Registered";     // Registered -> Waiting -> Done
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

    if (pet.isEmergency) {
      this.emergencyQueue.enqueue(pet);
    } else {
      this.regularQueue.enqueue(pet);
    }
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

  // Everyone still waiting, in the order they will be called.
  getWaitingList() {
    return [...this.emergencyQueue.toArray(), ...this.regularQueue.toArray()];
  }
}


// ============================================================
// 6. SORTING (bubble sort)
//    Compare neighbors and swap them if they are in the wrong
//    order. Repeat until nothing needs swapping. O(n^2).
//    It returns a NEW sorted list and leaves the original alone.
// ============================================================

function bubbleSort(items, compare) {
  const list = items.slice();

  for (let pass = 0; pass < list.length - 1; pass++) {
    let swapped = false;

    for (let i = 0; i < list.length - 1 - pass; i++) {
      if (compare(list[i], list[i + 1]) > 0) {
        const temp = list[i];
        list[i] = list[i + 1];
        list[i + 1] = temp;
        swapped = true;
      }
    }

    if (!swapped) break; // already in order, so stop early
  }
  return list;
}

function sortByName(pets) {
  return bubbleSort(pets, (a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
}

function sortByAge(pets) {
  return bubbleSort(pets, (a, b) => a.age - b.age);
}

function sortByQueueNumber(pets) {
  return bubbleSort(pets, (a, b) => a.queueNumber - b.queueNumber);
}


// ============================================================
// 7. SEARCHING (linear search)
//    Look at every pet one by one until we have checked them all.
//    O(n).
// ============================================================

// Finds every pet whose name contains the text ("ma" finds Max and Mamba).
function searchByName(pets, text) {
  const wanted = text.trim().toLowerCase();
  const found = [];

  for (const pet of pets) {
    if (pet.name.toLowerCase().includes(wanted)) found.push(pet);
  }
  return found;
}

// Queue numbers are unique, so there is at most one match.
function searchByQueueNumber(pets, number) {
  for (const pet of pets) {
    if (pet.queueNumber === number) return pet;
  }
  return null;
}