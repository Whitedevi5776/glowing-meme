const { runDailyWallpaperJob } = require('../services/wallpaper');
const logger = require('../utils/logger');

let _interval = null;
const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

function startWallpaperScheduler(bot) {
  if (_interval) return;

  runDailyWallpaperJob(bot).catch(e =>
    logger.error('Initial wallpaper job: ' + e.message)
  );

  _interval = setInterval(async () => {
    try {
      await runDailyWallpaperJob(bot);
    } catch (e) {
      logger.error('Wallpaper scheduler: ' + e.message);
    }
  }, TWENTY_FOUR_HOURS);

  logger.info('Wallpaper scheduler started (runs daily)');
}

function stopWallpaperScheduler() {
  if (_interval) {
    clearInterval(_interval);
    _interval = null;
  }
}

module.exports = { startWallpaperScheduler, stopWallpaperScheduler };
