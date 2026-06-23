const K = require('./keyboards');
const config = require('../config');
const { clearState } = require('../middleware/session');
const { GroupPfpTask } = require('../database/models');
const { isOwnerConnected } = require('../services/ownerWhatsapp');
const { createImmediateTask, createScheduledTask, startGroupJoin, cancelGroupTask } = require('../services/groupPfp');
const { isValidWaGroupLink, extractGroupId } = require('../utils/helpers');
const { getGroupPfpDir, downloadTelegramFile } = require('../utils/storage');
const logger = require('../utils/logger');

async function start(ctx) {
  if (!isOwnerConnected()) {
    return ctx.editMessageText(
      `*${config.bot.name} - Change Group PFP*\n\nThe ${config.bot.name} Assistant is currently offline. Please try again later or contact support.`,
      { parse_mode: 'Markdown', reply_markup: K.backMain() }
    ).catch(() => ctx.reply('Service temporarily unavailable.', { reply_markup: K.backMain() }));
  }

  await ctx.editMessageText(
    `*${config.bot.name} - Change WhatsApp Group PFP*\n\n` +
    `Choose an option:\n\n` +
    `*Immediate Change* - Change the group PFP right now\n` +
    `*Scheduled Daily* - Auto-change daily for up to ${config.limits.maxGroupPfpDays} days`,
    { parse_mode: 'Markdown', reply_markup: K.groupPfpMenu() }
  ).catch(() => ctx.reply('Choose option:', { reply_markup: K.groupPfpMenu() }));
}

async function immediateStart(ctx) {
  ctx.setState({ step: 'gpfp_image', mode: 'immediate' });
  await ctx.editMessageText(
    `*${config.bot.name} - Immediate Group PFP Change*\n\n` +
    `Step 1: Send the image you want to set as the group profile picture.\n\n` +
    `Full HD - No cropping`,
    { parse_mode: 'Markdown', reply_markup: K.back('group_pfp') }
  ).catch(() => ctx.reply('Send the image for the group PFP:'));
}

async function scheduledStart(ctx) {
  ctx.setState({ step: 'gpfp_days', mode: 'scheduled' });
  await ctx.editMessageText(
    `*${config.bot.name} - Scheduled Daily Group PFP Change*\n\n` +
    `How many days? (Maximum: ${config.limits.maxGroupPfpDays})`,
    { parse_mode: 'Markdown', reply_markup: K.back('group_pfp') }
  ).catch(() => ctx.reply(`How many days? (1-${config.limits.maxGroupPfpDays})`));
}

async function handleDays(ctx) {
  const n = parseInt(ctx.message.text?.trim());
  if (isNaN(n) || n < 1 || n > config.limits.maxGroupPfpDays) {
    return ctx.reply(`Enter a number between 1 and ${config.limits.maxGroupPfpDays}.`);
  }

  ctx.setState({ ...ctx.userState, step: 'gpfp_images', totalDays: n, images: [], required: n });
  await ctx.reply(
    `*${n} day schedule*\n\nPlease upload exactly *${n} image(s)* - one for each day.\n\nSend them one by one.`,
    { parse_mode: 'Markdown' }
  );
}

async function handleImage(ctx, bot) {
  const { mode, images, required, totalDays } = ctx.userState;
  const tid = String(ctx.from.id);

  const photo = ctx.message.photo;
  const doc = ctx.message.document;
  let fid;

  if (doc?.mime_type?.startsWith('image/')) fid = doc.file_id;
  else if (photo) fid = photo[photo.length - 1].file_id;
  else return ctx.reply('Send an image file.');

  const tempId = `temp_${Date.now()}`;
  const dir = getGroupPfpDir(tid, tempId);
  const currentImages = images || [];
  const imgPath = await downloadTelegramFile(bot, fid, dir, `gpfp_${currentImages.length}`);
  currentImages.push(imgPath);

  if (mode === 'immediate') {
    ctx.setState({ ...ctx.userState, step: 'gpfp_link', images: currentImages });
    await ctx.reply(
      `Image received!\n\nStep 2: Send the WhatsApp Group invite link.\n\n_Example:_ \`https://chat.whatsapp.com/ABC123...\``,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  const needed = required || totalDays;
  ctx.setState({ ...ctx.userState, images: currentImages });

  if (currentImages.length < needed) {
    return ctx.reply(`Image ${currentImages.length}/${needed} received. Please upload ${needed - currentImages.length} more.`);
  }

  ctx.setState({ ...ctx.userState, step: 'gpfp_link', images: currentImages });
  await ctx.reply(
    `All ${needed} images received!\n\nNow send the WhatsApp Group invite link.\n\n_Example:_ \`https://chat.whatsapp.com/ABC123...\``,
    { parse_mode: 'Markdown' }
  );
}

async function handleLink(ctx, bot) {
  const { mode, images, totalDays } = ctx.userState;
  const tid = String(ctx.from.id);
  const link = ctx.message.text?.trim();

  if (!isValidWaGroupLink(link)) {
    return ctx.reply('Invalid WhatsApp group link. Send a valid link like: `https://chat.whatsapp.com/ABC123...`', { parse_mode: 'Markdown' });
  }

  const inviteCode = extractGroupId(link);
  if (!inviteCode) {
    return ctx.reply('Could not extract group invite code from the link. Please try again.');
  }

  clearState(ctx.from.id);

  const ownerNum = config.ownerWaNumber;
  const msg = await ctx.reply(
    `*${config.bot.name} - Group PFP Setup*\n\n` +
    `The following account will join the group:\n\n` +
    `Name: *${config.bot.name} Assistant*\n` +
    `Number: \`+${ownerNum}\`\n\n` +
    `Please:\n` +
    `1. Approve the join request (if needed)\n` +
    `2. Make the account *admin*\n\n` +
    `Joining now...`,
    { parse_mode: 'Markdown' }
  );

  try {
    let task;
    if (mode === 'immediate') {
      task = await createImmediateTask(tid, inviteCode, images[0]);
    } else {
      task = await createScheduledTask(tid, inviteCode, images, totalDays);
    }

    await startGroupJoin(task, bot);

    await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null,
      `*${config.bot.name} - Task Created*\n\n` +
      `Task ID: \`${task.taskId}\`\n` +
      `Mode: ${mode === 'immediate' ? 'Immediate' : `Scheduled (${totalDays} days)`}\n` +
      `Status: ${task.status.replace(/_/g, ' ')}\n\n` +
      `You'll be notified of progress.`,
      { parse_mode: 'Markdown', reply_markup: K.backMain() }
    );
  } catch (e) {
    logger.error('Group PFP task: ' + e.message);
    await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null,
      `Failed: ${e.message}`,
      { reply_markup: K.backMain() }
    );
  }
}

async function listTasks(ctx) {
  const tid = String(ctx.from.id);
  const tasks = await GroupPfpTask.find({
    telegramId: tid,
    status: { $in: ['pending_join', 'pending_approval', 'pending_admin', 'active'] },
  }).sort({ createdAt: -1 }).limit(10);

  if (!tasks.length) {
    return ctx.editMessageText(
      `*${config.bot.name} - Active Group PFP Tasks*\n\nNo active tasks.`,
      { parse_mode: 'Markdown', reply_markup: K.back('group_pfp') }
    ).catch(() => {});
  }

  const lines = tasks.map((t, i) => {
    const status = t.status.replace(/_/g, ' ');
    const progress = t.mode === 'scheduled' ? ` (Day ${t.currentDay}/${t.totalDays})` : '';
    return `${i + 1}. \`${t.taskId}\` - ${status}${progress}`;
  }).join('\n');

  const btns = tasks.map(t => [{
    text: `Cancel ${t.taskId}`,
    callback_data: `gpfp_cancel:${t.taskId}`,
  }]);
  btns.push([{ text: 'Back', callback_data: 'group_pfp' }]);

  await ctx.editMessageText(
    `*${config.bot.name} - Active Tasks*\n\n${lines}`,
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: btns } }
  ).catch(() => {});
}

async function cancelTask(ctx, taskId) {
  try {
    const task = await cancelGroupTask(taskId);
    if (!task) {
      return ctx.answerCbQuery('Task not found.').catch(() => {});
    }
    await ctx.answerCbQuery('Task cancelled!').catch(() => {});
    await listTasks(ctx);
  } catch (e) {
    await ctx.answerCbQuery(`Error: ${e.message}`).catch(() => {});
  }
}

module.exports = {
  start, immediateStart, scheduledStart,
  handleDays, handleImage, handleLink,
  listTasks, cancelTask,
};
