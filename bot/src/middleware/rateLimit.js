const timestamps = new Map();
const WINDOW = 1500;
const MAX = 3;

function rateLimitMiddleware() {
  return async (ctx, next) => {
    const id = ctx.from?.id;
    if (!id) return next();
    const now = Date.now();
    const ts = (timestamps.get(id) || []).filter(t => now - t < WINDOW);
    ts.push(now);
    timestamps.set(id, ts);
    if (ts.length > MAX) {
      if (ctx.callbackQuery) {
        return ctx.answerCbQuery('Slow down! Please wait a moment.', { show_alert: true }).catch(() => {});
      }
      return;
    }
    return next();
  };
}

module.exports = { rateLimitMiddleware };
