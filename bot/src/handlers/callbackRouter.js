const { isOwner, checkForceJoin } = require('../middleware/auth');
const K = require('./keyboards');
const config = require('../config');
const pi = require('./pinterestHandler');
const pa = require('./pairingHandler');
const ac = require('./accountHandler');
const su = require('./supportHandler');
const gp = require('./groupPfpHandler');
const dl = require('./downloadHandler');
const wp = require('./wallpaperHandler');
const ow = require('../owner/ownerHandler');
const logger = require('../utils/logger');

async function route(ctx, bot) {
  const data = ctx.callbackQuery?.data;
  if (!data) return;
  await ctx.answerCbQuery().catch(() => {});

  const uid = ctx.from?.id;
  const owner = isOwner(uid);

  try {
    if (data !== 'check_join' && data !== 'main_menu') {
      if (!await checkForceJoin(ctx, bot)) return;
    }

    /* ── Navigation ── */
    if (data === 'main_menu') {
      return ctx.editMessageText(`*${config.bot.name} - Main Menu*\n\nChoose an option:`, {
        parse_mode: 'Markdown', reply_markup: K.mainMenu(owner),
      }).catch(() => ctx.reply('Main Menu:', { reply_markup: K.mainMenu(owner) }));
    }

    if (data === 'check_join') {
      if (await checkForceJoin(ctx, bot)) {
        return ctx.editMessageText(`*Access granted!*\n\nChoose an option:`, {
          parse_mode: 'Markdown', reply_markup: K.mainMenu(owner),
        }).catch(() => ctx.reply('Verified!', { reply_markup: K.mainMenu(owner) }));
      }
      return;
    }

    /* ── Pinterest ── */
    if (data === 'pinterest') return pi.start(ctx);
    if (data.startsWith('pi_more:')) {
      const [, page, ...rest] = data.split(':');
      return pi.more(ctx, parseInt(page), rest.join(':'));
    }

    /* ── Pairing ── */
    if (data === 'pair_wa') return pa.start(ctx);
    if (data.startsWith('pair_delete:')) return pa.deleteAndRepair(ctx, data.slice(12));
    if (data.startsWith('pair_code:')) return pa.doPairCode(ctx, data.slice(10), bot);
    if (data.startsWith('pair_qr:')) return pa.doPairQR(ctx, data.slice(8), bot);

    /* ── Paired accounts ── */
    if (data === 'paired') return ac.pairedList(ctx);
    if (data.startsWith('account:')) return ac.accountMenu(ctx, data.slice(8));

    /* ── PFP actions ── */
    if (data.startsWith('set_pfp:')) return ac.setPfpPrompt(ctx, data.slice(8));
    if (data.startsWith('get_pfp:')) return ac.getPfp(ctx, data.slice(8));
    if (data.startsWith('del_pfp:')) return ac.delPfpConfirm(ctx, data.slice(8));
    if (data.startsWith('confirm_del_pfp:')) return ac.delPfpDo(ctx, data.slice(16));

    /* ── Auto change ── */
    if (data.startsWith('auto_pfp:')) return ac.autoMenu(ctx, data.slice(9));
    if (data.startsWith('auto_hour:')) return ac.autoHourPrompt(ctx, data.slice(10));
    if (data.startsWith('auto_day:')) return ac.autoDayPrompt(ctx, data.slice(9));
    if (data.startsWith('stop_auto:')) return ac.stopAuto(ctx, data.slice(10));

    /* ── Purge ── */
    if (data.startsWith('purge:')) return ac.purgeConfirm(ctx, data.slice(6));
    if (data.startsWith('confirm_purge:')) return ac.purgeDo(ctx, data.slice(14));

    /* ── Permanent session ── */
    if (data.startsWith('perm:')) return ac.makePermanent(ctx, data.slice(5));

    /* ── Group PFP ── */
    if (data === 'group_pfp') return gp.start(ctx);
    if (data === 'gpfp_immediate') return gp.immediateStart(ctx);
    if (data === 'gpfp_scheduled') return gp.scheduledStart(ctx);
    if (data === 'gpfp_tasks') return gp.listTasks(ctx);
    if (data.startsWith('gpfp_cancel:')) return gp.cancelTask(ctx, data.slice(12));

    /* ── Download ── */
    if (data === 'download') return dl.start(ctx);
    if (data === 'dl_auto') return dl.promptUrl(ctx, null);
    if (data.startsWith('dl_')) {
      const platform = data.slice(3);
      const names = {
        pinterest: 'Pinterest', tiktok: 'TikTok', instagram: 'Instagram',
        twitter: 'Twitter/X', youtube: 'YouTube', facebook: 'Facebook',
        threads: 'Threads', reddit: 'Reddit',
      };
      return dl.promptUrl(ctx, names[platform] || platform);
    }

    /* ── Wallpapers ── */
    if (data === 'wallpapers') return wp.start(ctx);
    if (data.startsWith('wp_more:')) {
      const parts = data.slice(8).split(':');
      return wp.loadMore(ctx, parts[0], parseInt(parts[1]));
    }
    if (data.startsWith('wp_')) {
      const category = data.slice(3);
      if (['girls', 'boys', 'anime', 'cars', 'nature', 'gaming', 'aesthetic', 'weekend_specials', 'monthly_collections'].includes(category)) {
        return wp.browseCategory(ctx, category);
      }
    }

    /* ── Support ── */
    if (data === 'support') return su.start(ctx);
    if (data.startsWith('reply_ticket:') && owner) return su.ownerReplyPrompt(ctx, data.slice(13));
    if (data.startsWith('close_ticket:') && owner) return su.closeDo(ctx, data.slice(13));

    /* ── Owner panel ── */
    if (!owner && data.startsWith('o'))
      return ctx.answerCbQuery('Owner only.', { show_alert: true }).catch(() => {});

    if (data === 'owner') return ow.panel(ctx);
    if (data === 'o_stats') return ow.stats(ctx);
    if (data === 'o_users') return ow.users(ctx);
    if (data === 'o_broadcast') return ow.broadcastPrompt(ctx);
    if (data === 'o_restart') return ow.restart(ctx);
    if (data === 'o_fj') return ow.fjPanel(ctx);
    if (data === 'fj_add') return ow.fjAddPrompt(ctx);
    if (data.startsWith('fj_del:')) return ow.fjDel(ctx, data.slice(7));
    if (data === 'o_channels') return ow.channelPanel(ctx);
    if (data === 'ch_add_wa') return ow.channelAddPrompt(ctx, 'whatsapp');
    if (data === 'ch_add_tg') return ow.channelAddPrompt(ctx, 'telegram');
    if (data.startsWith('ch_del:')) return ow.channelDel(ctx, data.slice(7));
    if (data === 'o_wa_status') return ow.ownerWaStatus(ctx);
    if (data === 'o_wa_pair') return ow.ownerWaPair(ctx, bot);

  } catch (err) {
    logger.error('cb router: ' + err.message);
    await ctx.reply('Something went wrong. Please try again.').catch(() => {});
  }
}

module.exports = { route };
