const logger = require('./logger');
const config = require('../config');
const { randomDelay } = require('./helpers');

class TaskQueue {
  constructor(concurrency = config.limits.taskQueueConcurrency) {
    this._queue = [];
    this._running = 0;
    this._concurrency = concurrency;
    this._lastJoinTime = 0;
  }

  enqueue(task, priority = 0) {
    return new Promise((resolve, reject) => {
      this._queue.push({ task, priority, resolve, reject });
      this._queue.sort((a, b) => b.priority - a.priority);
      this._process();
    });
  }

  async _process() {
    if (this._running >= this._concurrency || this._queue.length === 0) return;

    this._running++;
    const { task, resolve, reject } = this._queue.shift();

    try {
      const result = await task();
      resolve(result);
    } catch (err) {
      reject(err);
    } finally {
      this._running--;
      this._process();
    }
  }

  async enqueueGroupJoin(task) {
    const now = Date.now();
    const elapsed = now - this._lastJoinTime;
    const cooldown = config.safety.cooldownBetweenJoinsMs;

    if (elapsed < cooldown) {
      const waitMs = cooldown - elapsed;
      logger.info(`Group join cooldown: waiting ${Math.ceil(waitMs / 1000)}s`);
      await new Promise(r => setTimeout(r, waitMs));
    }

    this._lastJoinTime = Date.now();

    await randomDelay(
      config.safety.minActionDelayMs,
      config.safety.maxActionDelayMs
    );

    return this.enqueue(task, 1);
  }

  get pending() { return this._queue.length; }
  get running() { return this._running; }
}

const globalQueue = new TaskQueue();

module.exports = { TaskQueue, globalQueue };
