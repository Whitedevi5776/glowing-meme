const { isOwner } = require('../middleware/auth');
const pi = require('./pinterestHandler');
const pa = require('./pairingHandler');
const ac = require('./accountHandler');
const su = require('./supportHandler');
const gp = require('./groupPfpHandler');
const dl = require('./downloadHandler');
const ow = require('../owner/ownerHandler');
const logger = require('../utils/logger');

async function route(ctx, bot) {
  const step = ctx.userState?.step;
  const owner = isOwner(ctx.from?.id);
  if (!step) return;

  try {
    switch (step) {
      case 'pi_query':
        ctx.clearState();
        return pi.search(ctx, ctx.message.text?.trim() || '', 0);

      case 'pair_phone':
        return pa.handlePhone(ctx, ctx.message.text?.trim() || '', bot);

      case 'set_pfp':
        return ac.handlePfpImage(ctx, ctx.userState.num, bot);

      case 'auto_hour_interval':
      case 'auto_day_interval':
        return ac.handleAutoInterval(ctx);

      case 'auto_hour_images':
      case 'auto_day_images':
        return ac.handleAutoImages(ctx, bot);

      case 'gpfp_image':
      case 'gpfp_images':
        return gp.handleImage(ctx, bot);

      case 'gpfp_days':
        return gp.handleDays(ctx);

      case 'gpfp_link':
        return gp.handleLink(ctx, bot);

      case 'dl_url':
        return dl.handleUrl(ctx, ctx.message.text?.trim() || '', bot);

      case 'support_msg':
        return su.handleMsg(ctx, bot);

      case 'owner_reply':
        if (owner) return su.ownerReplyDo(ctx, bot);
        break;

      case 'broadcast':
        if (owner) return ow.broadcastDo(ctx, bot);
        break;

      case 'fj_add':
        if (owner) return ow.fjAddDo(ctx);
        break;

      case 'ch_add':
        if (owner) return ow.channelAddDo(ctx);
        break;

      default:
        break;
    }
  } catch (err) {
    logger.error('msg router: ' + err.message);
    await ctx.reply('Something went wrong. Try again.').catch(() => {});
  }
}

module.exports = { route };
