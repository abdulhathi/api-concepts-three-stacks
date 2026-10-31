// Concept 21 · Throttling: bounded concurrency plus a bounded FIFO queue; a full queue sheds load.

export class ThrottleFullError extends Error {
  constructor() {
    super('concurrency limit and queue are both full');
  }
}

export class ConcurrencyThrottle {
  private running = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(
    private readonly maxRunning: number,
    private readonly maxWaiting: number,
  ) {}

  get stats(): { running: number; waiting: number } {
    return { running: this.running, waiting: this.waiting.length };
  }

  /** Runs `task` when a slot is free, queues it when not, and throws ThrottleFullError when the queue is full too. */
  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.running >= this.maxRunning) {
      if (this.waiting.length >= this.maxWaiting) throw new ThrottleFullError();
      await new Promise<void>((resolve) => this.waiting.push(resolve)); // the slot is handed over by release()
    } else {
      this.running++;
    }
    try {
      return await task();
    } finally {
      this.release();
    }
  }

  private release(): void {
    const next = this.waiting.shift();
    if (next) next(); // keep `running` unchanged: the slot passes straight to the oldest waiter
    else this.running--;
  }
}
