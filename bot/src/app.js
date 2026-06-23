const config = require('./config');
const { Telegraf } = require('telegraf');
const { connectDB } = require('./database/connect');
const { sessionMiddleware } = require('./middleware/session');
const { rateLimitMiddleware } = require('./middleware/rateLimit');
const { upsertUser } = require('./middleware/auth');
const { start: startCmd } = require('./commands/start');
const { route: cbRoute } = require('./handlers/callbackRouter');
const { route: msgRoute } = require('./handlers/messageRouter');
const { handleInlineQuery } = require('./inline/inlineHandler');
const { startWorker, restoreJobs } = require('./schedulers/autoChange');
const { startGroupPfpScheduler } = require('./schedulers/groupPfpScheduler');
const { startWallpaperScheduler } = require('./schedulers/wallpaperScheduler');
const { connectOwnerWA, setupGroupEventListeners, isOwnerConnected } = require('./services/ownerWhatsapp');
const { downloadMedia } = require('./downloaders');
const logger = require('./utils/logger');

if (!config.botToken) { logger.error('BOT_TOKEN missing!'); process.exit(1); }

const bot = new Telegraf(config.botToken);

async function launch() {
  await connectDB();

  const { Settings } = require('./database/models');
  const savedNum = await Settings.findOne({ key: 'ownerWaNumber' });
  if (savedNum?.value && !config.ownerWaNumber) {
    config.ownerWaNumber = savedNum.value;
    logger.info(`Owner WA number loaded from DB: +${savedNum.value}`);
  }

  bot.use(sessionMiddleware());
  bot.use(rateLimitMiddleware());

  bot.start(async ctx => { await upsertUser(ctx); await startCmd(ctx, bot); });
  bot.help(async ctx => {
    await ctx.reply(
      `*${config.bot.name} Help*\n\n` +
      `/start - Main menu\n` +
      `/help - This message\n` +
      `/download <url> - Download media from any supported platform\n\n` +
      `Use the inline buttons to navigate.\n` +
      `Use inline mode: @${ctx.botInfo.username} <query>`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.command('download', async ctx => {
    const url = ctx.message.text?.split(' ').slice(1).join(' ').trim();
    if (!url) {
      return ctx.reply('Usage: `/download <url>`\n\nSupported: Pinterest, TikTok, Instagram, Facebook, Twitter/X, YouTube, Threads, Reddit', { parse_mode: 'Markdown' });
    }

    const { handleUrl } = require('./handlers/downloadHandler');
    await handleUrl(ctx, url, bot);
  });

  bot.on('inline_query', handleInlineQuery);
  bot.on('callback_query', ctx => cbRoute(ctx, bot));
  bot.on('message', async ctx => {
    await upsertUser(ctx);
    await msgRoute(ctx, bot);
  });

  bot.catch((err, ctx) => logger.error(`[${ctx?.updateType}] ${err.message}`));

  try {
    await startWorker(bot);
    await restoreJobs(bot);
  } catch (e) {
    logger.warn('Scheduler unavailable (Redis not running): ' + e.message);
    logger.warn('Auto-change features will not work until Redis is started.');
  }

  startGroupPfpScheduler(bot);

  if (config.apis.pexelsKey || config.apis.unsplashKey) {
    startWallpaperScheduler(bot);
  } else {
    logger.info('Wallpaper scheduler skipped (no API keys configured)');
  }

  if (config.ownerWaNumber) {
    try {
      await connectOwnerWA({
        onConnected: (sock) => {
          setupGroupEventListeners(bot);
          logger.info(`Owner WA connected: +${config.ownerWaNumber}`);
        },
      });
    } catch (e) {
      logger.warn('Owner WA auto-connect failed: ' + e.message);
      logger.warn('Use the Owner Panel to pair manually.');
    }
  }

  await bot.launch({ dropPendingUpdates: true });
  logger.info(`${config.bot.name} v${config.bot.version} is live!`);

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

launch().catch(err => { logger.error('Launch failed: ' + err.message); process.exit(1); });
