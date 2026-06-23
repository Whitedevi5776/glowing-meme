const { User, Session, AutoChangeJob, SupportTicket, ForceJoin, Channel, GroupPfpTask } = require('../database/models');
const K = require('../handlers/keyboards');
const config = require('../config');
const { setState, clearState } = require('../middleware/session');
const { chunkArray } = require('../utils/helpers');
const { isOwnerConnected, connectOwnerWA } = require('../services/ownerWhatsapp');
const logger = require('../utils/logger');

async function panel(ctx) {
  await ctx.editMessageText(`*${config.bot.name} - Owner Control Panel*\n\nWhat would you like to manage?`,
    { parse_mode: 'Markdown', reply_markup: K.ownerPanel() })
    .catch(() => ctx.reply('Owner Panel:', { reply_markup: K.ownerPanel() }));
}

async function stats(ctx) {
  const [users, activeSessions, allSessions, activeJobs, openTickets, groupTasks] = await Promise.all([
    User.countDocuments(),
    Session.countDocuments({ isActive: true }),
    Session.countDocuments(),
    AutoChangeJob.countDocuments({ isActive: true }),
    SupportTicket.countDocuments({ status: 'open' }),
    GroupPfpTask.countDocuments({ status: { $in: ['pending_join', 'pending_approval', 'pending_admin', 'active'] } }),
  ]);
  const ownerWaStatus = isOwnerConnected() ? 'Connected' : 'Disconnected';

  await ctx.editMessageText(
    `*${config.bot.name} Statistics*\n\n` +
    `Total Users: *${users}*\n` +
    `Total Sessions: *${allSessions}*\n` +
    `Active Sessions: *${activeSessions}*\n` +
    `Active Auto-Changes: *${activeJobs}*\n` +
    `Active Group PFP Tasks: *${groupTasks}*\n` +
    `Open Tickets: *${openTickets}*\n` +
    `Owner WA: *${ownerWaStatus}*`,
    { parse_mode: 'Markdown', reply_markup: K.back('owner') }
  ).catch(() => {});
}

async function users(ctx) {
  const list = await User.find().sort({ lastActive: -1 }).limit(20);
  const lines = list.map((u, i) =>
    `${i + 1}. ${u.firstName || ''} @${u.username || '-'} (\`${u.telegramId}\`)`
  ).join('\n') || 'No users yet.';
  await ctx.editMessageText(`*Users (last 20)*\n\n${lines}`,
    { parse_mode: 'Markdown', reply_markup: K.back('owner') }).catch(() => {});
}

async function broadcastPrompt(ctx) {
  ctx.setState({ step: 'broadcast' });
  await ctx.editMessageText(
    `*Broadcast*\n\nSend the message to broadcast (text, photo, video, or document):`,
    { parse_mode: 'Markdown', reply_markup: K.back('owner') }
  ).catch(() => ctx.reply('Send broadcast message:'));
}

async function broadcastDo(ctx, bot) {
  clearState(ctx.from.id);
  const all = await User.find({ isBlocked: false });
  const m = await ctx.reply(`Broadcasting to ${all.length} users...`);

  let ok = 0, fail = 0;
  for (const chunk of chunkArray(all, 25)) {
    await Promise.allSettled(chunk.map(async u => {
      try {
        const tid = u.telegramId;
        if (ctx.message.text) {
          await bot.telegram.sendMessage(tid, ctx.message.text, { parse_mode: 'Markdown' });
        } else if (ctx.message.photo) {
          await bot.telegram.sendPhoto(tid, ctx.message.photo.at(-1).file_id, { caption: ctx.message.caption || '' });
        } else if (ctx.message.video) {
          await bot.telegram.sendVideo(tid, ctx.message.video.file_id, { caption: ctx.message.caption || '' });
        } else if (ctx.message.document) {
          await bot.telegram.sendDocument(tid, ctx.message.document.file_id, { caption: ctx.message.caption || '' });
        }
        ok++;
      } catch { fail++; }
    }));
    await new Promise(r => setTimeout(r, 80));
  }

  await ctx.telegram.editMessageText(ctx.chat.id, m.message_id, null,
    `*Broadcast done*\n\nSuccess: ${ok}\nFailed: ${fail}`,
    { parse_mode: 'Markdown', reply_markup: K.back('owner') }
  );
}

/* ── Force Join ──────────────────────────────────────────── */
async function fjPanel(ctx) {
  const links = await ForceJoin.find();
  const btns = links.map(l => [
    { text: `${l.title || l.link} ${l.isRequired ? '(Required)' : '(Optional)'}`, callback_data: `fj_info:${l._id}` },
    { text: 'X', callback_data: `fj_del:${l._id}` },
  ]);
  if (links.length < 5) btns.push([{ text: 'Add Link', callback_data: 'fj_add' }]);
  btns.push([{ text: 'Back', callback_data: 'owner' }]);
  await ctx.editMessageText(
    `*Force Join Settings*\n${links.length}/5 links configured:`,
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: btns } }
  ).catch(() => {});
}

async function fjAddPrompt(ctx) {
  ctx.setState({ step: 'fj_add' });
  await ctx.editMessageText(
    `*Add Force Join Link*\n\nSend the channel/group invite link:`,
    { parse_mode: 'Markdown', reply_markup: K.back('o_fj') }
  ).catch(() => ctx.reply('Send invite link:'));
}

async function fjAddDo(ctx) {
  clearState(ctx.from.id);
  const link = ctx.message.text?.trim();
  if (!link.startsWith('http') && !link.startsWith('@'))
    return ctx.reply('Invalid. Send a t.me link or @username.');
  await ForceJoin.create({ link, title: link, isRequired: true, platform: 'telegram' });
  await ctx.reply('Link added.', { reply_markup: K.back('o_fj') });
}

async function fjDel(ctx, id) {
  await ForceJoin.findByIdAndDelete(id);
  await ctx.answerCbQuery('Removed').catch(() => {});
  await fjPanel(ctx);
}

/* ── Channel Management ──────────────────────────────────── */
async function channelPanel(ctx) {
  const channels = await Channel.find({ isActive: true });
  const waChs = channels.filter(c => c.platform === 'whatsapp');
  const tgChs = channels.filter(c => c.platform === 'telegram');

  let text = `*${config.bot.name} - Channel Management*\n\n`;
  text += `*WhatsApp Channels:*\n`;
  text += waChs.length ? waChs.map(c => `- ${c.title || c.link}`).join('\n') : 'None';
  text += `\n\n*Telegram Channels:*\n`;
  text += tgChs.length ? tgChs.map(c => `- ${c.title || c.link}`).join('\n') : 'None';

  const btns = [];
  for (const ch of channels) {
    btns.push([
      { text: `${ch.platform === 'whatsapp' ? 'WA' : 'TG'}: ${ch.title || ch.link}`, callback_data: `ch_info:${ch._id}` },
      { text: 'X', callback_data: `ch_del:${ch._id}` },
    ]);
  }
  btns.push([
    { text: 'Add WhatsApp Channel', callback_data: 'ch_add_wa' },
    { text: 'Add Telegram Channel', callback_data: 'ch_add_tg' },
  ]);
  btns.push([{ text: 'Back', callback_data: 'owner' }]);

  await ctx.editMessageText(text, {
    parse_mode: 'Markdown', reply_markup: { inline_keyboard: btns },
  }).catch(() => {});
}

async function channelAddPrompt(ctx, platform) {
  ctx.setState({ step: 'ch_add', platform });
  await ctx.editMessageText(
    `*Add ${platform === 'whatsapp' ? 'WhatsApp' : 'Telegram'} Channel*\n\nSend the channel link:`,
    { parse_mode: 'Markdown', reply_markup: K.back('o_channels') }
  ).catch(() => ctx.reply('Send channel link:'));
}

async function channelAddDo(ctx) {
  const { platform } = ctx.userState;
  clearState(ctx.from.id);
  const link = ctx.message.text?.trim();
  if (!link.startsWith('http') && !link.startsWith('@')) {
    return ctx.reply('Invalid. Send a valid link.');
  }
  await Channel.create({ platform, link, title: link });
  await ctx.reply(`${platform === 'whatsapp' ? 'WhatsApp' : 'Telegram'} channel added.`, { reply_markup: K.back('o_channels') });
}

async function channelDel(ctx, id) {
  await Channel.findByIdAndDelete(id);
  await ctx.answerCbQuery('Channel removed').catch(() => {});
  await channelPanel(ctx);
}

/* ── Owner WA Status ─────────────────────────────────────── */
async function ownerWaStatus(ctx) {
  const connected = isOwnerConnected();
  const num = config.ownerWaNumber || 'Not configured';
  await ctx.editMessageText(
    `*Owner WhatsApp Status*\n\n` +
    `Number: \`${num}\`\n` +
    `Status: ${connected ? 'Connected' : 'Disconnected'}\n\n` +
    `${!connected ? 'Use "Pair Owner WA" to connect.' : 'The owner account is active and ready for group PFP tasks.'}`,
    { parse_mode: 'Markdown', reply_markup: K.back('owner') }
  ).catch(() => {});
}

async function ownerWaPair(ctx, bot) {
  if (!config.ownerWaNumber) {
    return ctx.editMessageText(
      `*Owner WA Pairing*\n\nSet OWNER_WA_NUMBER in .env first.`,
      { parse_mode: 'Markdown', reply_markup: K.back('owner') }
    ).catch(() => {});
  }

  if (isOwnerConnected()) {
    return ctx.editMessageText(
      `*Owner WA*\n\nAlready connected as \`+${config.ownerWaNumber}\``,
      { parse_mode: 'Markdown', reply_markup: K.back('owner') }
    ).catch(() => {});
  }

  const msg = await ctx.reply(`Connecting owner WA \`+${config.ownerWaNumber}\`...`, { parse_mode: 'Markdown' });

  try {
    await connectOwnerWA({
      onCode: async code => {
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null,
          `*${config.bot.name} Owner WA Pairing Code:*\n\n\`\`\`\n${code}\n\`\`\`\n\n` +
          `Enter this code in WhatsApp -> Linked Devices\nExpires in 60 seconds`,
          { parse_mode: 'Markdown' }
        );
      },
      onConnected: async () => {
        const { setupGroupEventListeners } = require('../services/ownerWhatsapp');
        setupGroupEventListeners(bot);
        await ctx.reply(
          `*Owner WA Connected!*\n\`+${config.ownerWaNumber}\`\n\nGroup PFP features are now active.`,
          { parse_mode: 'Markdown', reply_markup: K.back('owner') }
        );
      },
    });
  } catch (e) {
    logger.error('Owner WA pair: ' + e.message);
    await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null,
      `Owner WA pairing failed: ${e.message}`,
      { reply_markup: K.back('owner') }
    ).catch(() => {});
  }
}

async function restart(ctx) {
  await ctx.editMessageText('Restarting...', { parse_mode: 'Markdown' }).catch(() => {});
  logger.info('Restart requested by owner');
  setTimeout(() => process.exit(0), 500);
}

module.exports = {
  panel, stats, users, broadcastPrompt, broadcastDo,
  fjPanel, fjAddPrompt, fjAddDo, fjDel,
  channelPanel, channelAddPrompt, channelAddDo, channelDel,
  ownerWaStatus, ownerWaPair, restart,
};
