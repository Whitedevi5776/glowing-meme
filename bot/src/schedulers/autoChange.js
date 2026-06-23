const net = require('net');
const { Queue, Worker } = require('bullmq');
const { AutoChangeJob } = require('../database/models');
const { setProfilePicture } = require('../services/whatsapp');
const config = require('../config');
const logger = require('../utils/logger');

let _redisOk = null;

function parseRedisUrl() {
  const url = config.redis.url;
  const m = url.match(/redis:\/\/(?::(.+)@)?([^:]+):(\d+)/);
  return { host: m?.[2] || '127.0.0.1', port: parseInt(m?.[3] || '6379'), password: m?.[1] };
}

function checkRedis() {
  return new Promise(resolve => {
    if (_redisOk !== null) return resolve(_redisOk);
    const { host, port } = parseRedisUrl();
    const sock = new net.Socket();
    sock.setTimeout(2000);
    sock.once('connect', () => { sock.destroy(); _redisOk = true; resolve(true); });
    sock.once('error', () => { sock.destroy(); _redisOk = false; resolve(false); });
    sock.once('timeout', () => { sock.destroy(); _redisOk = false; resolve(false); });
    sock.connect(port, host);
  });
}

function redisConn() {
  const { host, port, password } = parseRedisUrl();
  return { host, port, ...(password ? { password } : {}), maxRetriesPerRequest: null };
}

let _queue = null;
let _worker = null;

function getQueue() {
  if (!_queue) _queue = new Queue('pappybot-auto-pfp', { connection: redisConn() });
  return _queue;
}

async function startWorker(bot) {
  if (!await checkRedis()) {
    logger.warn('Redis unavailable - auto-change scheduler disabled. Start Redis to enable it.');
    return;
  }
  if (_worker) return;

  _worker = new Worker('pappybot-auto-pfp', async job => {
    const { telegramId, whatsappNumber } = job.data;
    const doc = await AutoChangeJob.findOne({ telegramId, whatsappNumber, isActive: true });
    if (!doc || !doc.images.length) return;

    const idx = doc.currentIndex % doc.images.length;
    const imgPath = doc.images[idx];

    try {
      await setProfilePicture(telegramId, whatsappNumber, imgPath);

      doc.currentIndex = (idx + 1) % doc.images.length;
      doc.nextRun = new Date(Date.now() + ms(doc.mode, doc.interval));
      await doc.save();

      await bot.telegram.sendMessage(
        telegramId,
        `*Auto PFP Updated*\n\`+${whatsappNumber}\`\nImage ${idx + 1}/${doc.images.length}`,
        { parse_mode: 'Markdown' }
      ).catch(() => {});
    } catch (e) {
      logger.error(`Auto PFP failed for +${whatsappNumber}: ${e.message}`);
      await bot.telegram.sendMessage(
        telegramId,
        `Auto PFP change failed for \`+${whatsappNumber}\`: ${e.message}\nWill retry on next cycle.`,
        { parse_mode: 'Markdown' }
      ).catch(() => {});
    }
  }, { connection: redisConn() });

  _worker.on('failed', (job, err) => logger.error(`Job failed: ${err.message}`));
  logger.info('Auto-PFP scheduler started');
}

function ms(mode, n) {
  return mode === 'hour' ? n * 3_600_000 : n * 86_400_000;
}

async function scheduleJob(telegramId, whatsappNumber, mode, interval, images) {
  if (!await checkRedis()) throw new Error('Redis not running - scheduler unavailable.');
  await cancelJob(telegramId, whatsappNumber);

  const jid = `pfp:${telegramId}:${whatsappNumber}`;
  await getQueue().add('change', { telegramId, whatsappNumber }, {
    repeat: { every: ms(mode, interval) }, jobId: jid,
    removeOnComplete: false, removeOnFail: false,
  });

  await AutoChangeJob.findOneAndUpdate(
    { telegramId, whatsappNumber },
    {
      telegramId, whatsappNumber, mode, interval, images,
      currentIndex: 0, isActive: true,
      nextRun: new Date(Date.now() + ms(mode, interval)), bullJobId: jid,
    },
    { upsert: true }
  );
}

async function cancelJob(telegramId, whatsappNumber) {
  if (await checkRedis()) {
    try {
      const q = getQueue();
      const jid = `pfp:${telegramId}:${whatsappNumber}`;
      const job = await q.getJob(jid);
      if (job) await job.remove();
      for (const r of await q.getRepeatableJobs()) {
        if (r.key?.includes(jid)) await q.removeRepeatableByKey(r.key);
      }
    } catch {}
  }
  await AutoChangeJob.findOneAndUpdate({ telegramId, whatsappNumber }, { isActive: false });
}

async function restoreJobs(bot) {
  if (!await checkRedis()) return;
  const jobs = await AutoChangeJob.find({ isActive: true });
  for (const j of jobs) {
    try {
      await scheduleJob(j.telegramId, j.whatsappNumber, j.mode, j.interval, j.images);
      logger.info(`Restored job: +${j.whatsappNumber}`);
    } catch (e) { logger.warn('Restore job: ' + e.message); }
  }
}

async function getActiveJob(telegramId, whatsappNumber) {
  return AutoChangeJob.findOne({ telegramId, whatsappNumber, isActive: true });
}

module.exports = { startWorker, scheduleJob, cancelJob, restoreJobs, getActiveJob };
