const { processScheduledChanges } = require('../services/groupPfp');
const logger = require('../utils/logger');

let _interval = null;

function startGroupPfpScheduler(bot) {
  if (_interval) return;

  _interval = setInterval(async () => {
    try {
      await processScheduledChanges(bot);
    } catch (e) {
      logger.error('Group PFP scheduler: ' + e.message);
    }
  }, 60_000);

  logger.info('Group PFP scheduler started (checks every 60s)');
}

function stopGroupPfpScheduler() {
  if (_interval) {
    clearInterval(_interval);
    _interval = null;
  }
}

module.exports = { startGroupPfpScheduler, stopGroupPfpScheduler };
