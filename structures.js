// Hand-built data structures (no built-in queue/heap libraries),
// so the DSA concepts are visible in the code.

// ---------- FIFO Queue (singly linked list) ----------
class QueueNode {
  constructor(value) {
    this.value = value;
    this.next = null;
  }
}

class Queue {
  constructor() {
    this.head = null;
    this.tail = null;
    this.size = 0;
  }

  isEmpty() {
    return this.size === 0;
  }

  // O(1): add to the back
  enqueue(value) {
    const node = new QueueNode(value);
    if (this.tail) this.tail.next = node;
    else this.head = node;
    this.tail = node;
    this.size++;
  }

  // O(1): remove from the front
  dequeue() {
    if (this.isEmpty()) return null;
    const value = this.head.value;
    this.head = this.head.next;
    if (!this.head) this.tail = null;
    this.size--;
    return value;
  }

  peek() {
    return this.isEmpty() ? null : this.head.value;
  }

  // Front-to-back snapshot (does not modify the queue)
  toArray() {
    const out = [];
    for (let n = this.head; n; n = n.next) out.push(n.value);
    return out;
  }
}

// ---------- Priority Queue (binary min-heap) ----------
// `compare(a, b)` returns a negative number if a should be served before b.
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

  // O(log n)
  enqueue(value) {
    this.heap.push(value);
    this._siftUp(this.heap.length - 1);
  }

  // O(log n)
  dequeue() {
    if (this.isEmpty()) return null;
    const top = this.heap[0];
    const last = this.heap.pop();
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this._siftDown(0);
    }
    return top;
  }

  peek() {
    return this.isEmpty() ? null : this.heap[0];
  }

  // Serving order snapshot, without modifying this queue.
  toArray() {
    const copy = new PriorityQueue(this.compare);
    copy.heap = this.heap.slice();
    const out = [];
    while (!copy.isEmpty()) out.push(copy.dequeue());
    return out;
  }

  _siftUp(i) {
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (this.compare(this.heap[i], this.heap[parent]) >= 0) break;
      [this.heap[i], this.heap[parent]] = [this.heap[parent], this.heap[i]];
      i = parent;
    }
  }

  _siftDown(i) {
    const n = this.heap.length;
    while (true) {
      let best = i;
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      if (l < n && this.compare(this.heap[l], this.heap[best]) < 0) best = l;
      if (r < n && this.compare(this.heap[r], this.heap[best]) < 0) best = r;
      if (best === i) break;
      [this.heap[i], this.heap[best]] = [this.heap[best], this.heap[i]];
      i = best;
    }
  }
}

module.exports = { Queue, PriorityQueue };