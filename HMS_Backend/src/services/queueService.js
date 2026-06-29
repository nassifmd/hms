const logger = require('../config/logger');
let Bull;
try { Bull = require('bull'); } catch (e) { Bull = null; }
const { AppError } = require('../middleware/errorHandler');

/**
 * Minimal in-memory queue fallback for environments without Redis.
 * - Runs processors synchronously/asynchronously in-process
 * - Keeps basic job metadata so `getJobStatus` / metrics work
 */
class InMemoryQueue {
  constructor(name, options = {}) {
    this.name = name;
    this.jobs = new Map(); // id -> job
    this.waiting = [];
    this.completed = [];
    this.failed = [];
    this.processors = [];
    this._idCounter = 1;
    this.options = options;
    this.eventHandlers = { completed: [], failed: [], stalled: [] };
  }

  async add(jobName, data, opts = {}) {
    const id = String(this._idCounter++);
    const job = {
      id,
      name: jobName,
      data,
      attemptsMade: 0,
      progress: () => 100,
      timestamp: Date.now(),
      processedOn: null,
      finishedOn: null,
      returnvalue: null,
      failedReason: null
    };
    this.jobs.set(id, job);
    this.waiting.push(job);

    // If a processor is registered, run it asynchronously
    setImmediate(async () => {
      try {
        // mark active
        job.processedOn = Date.now();
        const proc = this.processors[0];
        if (proc) {
          const result = await proc(data, { id });
          job.returnvalue = result;
          job.finishedOn = Date.now();
          this.completed.push(job);
          this._emit('completed', job, result);
        } else {
          // no processor: mark as completed
          job.returnvalue = null;
          job.finishedOn = Date.now();
          this.completed.push(job);
          this._emit('completed', job, null);
        }
      } catch (err) {
        job.failedReason = err.message;
        this.failed.push(job);
        this._emit('failed', job, err);
      }
    });

    return job;
  }

  async addBulk(jobs) {
    const results = [];
    for (const j of jobs) {
      results.push(await this.add(j.name || 'job', j.data || {}));
    }
    return results;
  }

  on(event, handler) {
    if (!this.eventHandlers[event]) this.eventHandlers[event] = [];
    this.eventHandlers[event].push(handler);
  }

  _emit(event, ...args) {
    const handlers = this.eventHandlers[event] || [];
    for (const h of handlers) h(...args);
  }

  process(concurrency, processor) { this.processors.push(processor); }

  async getJob(id) { return this.jobs.get(String(id)) || null; }
  async getWaitingCount() { return this.waiting.length; }
  async getActiveCount() { return 0; }
  async getCompletedCount() { return this.completed.length; }
  async getFailedCount() { return this.failed.length; }
  async getDelayedCount() { return 0; }
  async getPausedCount() { return 0; }
  async getFailed(from = 0, limit = 100) { return this.failed.slice(from, from + limit); }
  async getWaiting() { return this.waiting; }

  async pause() { return true; }
  async resume() { return true; }
  async empty() { this.waiting = []; return true; }
  async clean() { return []; }
  async close() { return true; }
}

class QueueService {
  constructor() {
    this.queues = new Map();
    this.redis = null; // keep for compatibility
    this._useRedis = (process.env.REDIS_ENABLED || 'true').toLowerCase() !== 'false' && !process.env.DISABLE_REDIS;
    this._initialized = false;
    this.initialize();
  }

  initialize() {
    if (this._useRedis && Bull) {
      // Try to initialize Bull normally (Redis required by Bull at runtime for persistence).
      try {
        // We'll not create a direct ioredis connection here — Bull will manage it.
        this._initialized = true;
        this.redis = { quit: async () => true };
        logger.info('QueueService: running with Bull (Redis expected by Bull)');
      } catch (err) {
        logger.warn('QueueService: cannot initialize Bull, falling back to in-memory queues', err.message);
        this._useRedis = false;
      }
    } else {
      logger.info('QueueService: using in-memory queue fallback (Redis disabled)');
      this._useRedis = false;
      this.redis = { quit: async () => true };
    }
  }

  getQueue(name, options = {}) {
    if (this.queues.has(name)) return this.queues.get(name);

    let queue;
    if (this._useRedis && Bull) {
      // create a real Bull queue (will attempt Redis via Bull)
      queue = new Bull(name, {
        redis: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT) || 6379,
          password: process.env.REDIS_PASSWORD
        },
        defaultJobOptions: {
          attempts: options.attempts || 3,
          backoff: { type: 'exponential', delay: options.backoffDelay || 2000 },
          removeOnComplete: options.removeOnComplete || 100,
          removeOnFail: options.removeOnFail || 50,
          timeout: options.timeout || 30000
        },
        ...options
      });

      // Attach lightweight handlers for observability
      queue.on('completed', (job, result) => logger.debug(`Job ${job.id} completed`, { queue: name }));
      queue.on('failed', (job, err) => logger.error(`Job ${job.id} failed`, { queue: name, error: err.message }));
      queue.on('stalled', (job) => logger.warn(`Job ${job.id} stalled`, { queue: name }));
    } else {
      // In-memory fallback
      queue = new InMemoryQueue(name, options);
    }

    this.queues.set(name, queue);
    return queue;
  }

  async addJob(queueName, jobName, data, options = {}) {
    const queue = this.getQueue(queueName);
    const job = await queue.add(jobName, data, options);
    logger.info('Job added to queue', { queue: queueName, jobId: job.id, jobName });
    return job;
  }

  async addBulk(queueName, jobs) { const queue = this.getQueue(queueName); return queue.addBulk(jobs); }
  async getJobStatus(queueName, jobId) { const queue = this.getQueue(queueName); const job = await queue.getJob(jobId); if (!job) return null; const state = 'completed'; return { id: job.id, name: job.name, data: job.data, state, progress: job.progress ? job.progress() : 100, attempts: job.attemptsMade || 0, timestamp: job.timestamp, processedOn: job.processedOn, finishedOn: job.finishedOn, returnvalue: job.returnvalue, failedReason: job.failedReason }; }

  async getQueueMetrics(queueName) {
    const queue = this.getQueue(queueName);
    const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
      queue.getPausedCount()
    ]);
    return { waiting, active, completed, failed, delayed, paused, total: waiting + active + completed + failed + delayed + paused };
  }

  async pauseQueue(queueName, options = {}) { const queue = this.getQueue(queueName); await queue.pause(options.local); return true; }
  async resumeQueue(queueName, options = {}) { const queue = this.getQueue(queueName); await queue.resume(options.local); return true; }
  async emptyQueue(queueName) { const queue = this.getQueue(queueName); await queue.empty(); return true; }
  async cleanQueue(queueName, grace = 24 * 3600 * 1000, limit = 100) { const queue = this.getQueue(queueName); const results = await Promise.all([queue.clean(grace, 'completed', limit), queue.clean(grace, 'failed', limit), queue.clean(grace, 'delayed', limit), queue.clean(grace, 'wait', limit)]); return { completed: results[0].length, failed: results[1].length, delayed: results[2].length, waiting: results[3].length }; }
  async retryFailed(queueName, limit = 100) { const queue = this.getQueue(queueName); const failed = await queue.getFailed(0, limit); const results = []; for (const job of failed) { try { await job.retry(); results.push({ id: job.id, success: true }); } catch (error) { results.push({ id: job.id, success: false, error: error.message }); } } return results; }
  process(queueName, concurrency, processor) { const queue = this.getQueue(queueName); queue.process(concurrency, processor); }

  async close() {
    const closePromises = [];
    for (const [name, queue] of this.queues) {
      if (queue && typeof queue.close === 'function') closePromises.push(queue.close().then(() => logger.info(`Queue closed`, { queue: name })));
    }
    await Promise.all(closePromises);
    if (this.redis && typeof this.redis.quit === 'function') await this.redis.quit();
    logger.info('All queues closed');
  }
}

const queueService = new QueueService();

// create named queues (will be in-memory when Redis is disabled)
const emailQueue = queueService.getQueue('email', { attempts: 3, backoffDelay: 5000 });
const smsQueue = queueService.getQueue('sms', { attempts: 3, backoffDelay: 2000 });
const notificationQueue = queueService.getQueue('notification', { attempts: 2, backoffDelay: 3000 });
const reportQueue = queueService.getQueue('report', { attempts: 2, timeout: 60000 });
const claimsQueue = queueService.getQueue('claims', { attempts: 3, backoffDelay: 10000, timeout: 30000 });
const backupQueue = queueService.getQueue('backup', { attempts: 1, timeout: 300000 });

module.exports = { queueService, emailQueue, smsQueue, notificationQueue, reportQueue, claimsQueue, backupQueue };
