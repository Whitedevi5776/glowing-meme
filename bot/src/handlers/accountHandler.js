const fs = require('fs');
const { Session } = require('../database/models');
const { setProfilePicture, getProfilePicture, deleteProfilePicture, disconnect } = require('../services/whatsapp');
const { scheduleJob, cancelJob, getActiveJob } = require('../schedulers/autoChange');
const { getUserImageDir, getUserSessionDir, downloadTelegramFile, deleteDir } = require('../utils/storage');
const { calcImageCount } = require('../utils/helpers');
const K = require('./keyboards');
const config = require('../config');
const { setState, clearState } = require('../middleware/session');
const logger = require('../utils/logger');

async function pairedList(ctx) {
  const tid = String(ctx.from.id);
  const sessions = await Session.find({ telegramId: tid });

  if (!sessions.length) {
    const text = `*${config.bot.name} - Paired Accounts*\n\nNo paired accounts yet. Pair one first!`;
    return ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [
        [{ text: 'Pair WhatsApp', callback_data: 'pair_wa' }],
        [{ text: 'Main Menu', callback_data: 'main_menu' }],
      ]},
    }).catch(() => ctx.reply(text, { parse_mode: 'Markdown' }));
  }

  const btns = sessions.map(s => [{
    text: `${s.isActive ? '(Active)' : '(Inactive)'} +${s.whatsappNumber}`,
    callback_data: `account:${s.whatsappNumber}`,
  }]);
  btns.push([{ text: 'Pair New Account', callback_data: 'pair_wa' }]);
  btns.push([{ text: 'Main Menu', callback_data: 'main_menu' }]);

  await ctx.editMessageText(
    `*${config.bot.name} - Your Paired Accounts*\n\nTap an account to manage it:`,
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: btns } }
  ).catch(() => ctx.reply('Select account:', { reply_markup: { inline_keyboard: btns } }));
}

async function accountMenu(ctx, num) {
  const tid = String(ctx.from.id);
  const s = await Session.findOne({ telegramId: tid, whatsappNumber: num });
  const job = await getActiveJob(tid, num);
  const statusLine = s?.isActive ? 'Active' : 'Inactive';
  const jobLine = job ? `\nAuto: every ${job.interval} ${job.mode}(s)` : '';

  await ctx.editMessageText(
    `*${config.bot.name} - Account Manager*\n\n\`+${num}\`\nStatus: ${statusLine}${jobLine}\n\nChoose an action:`,
    { parse_mode: 'Markdown', reply_markup: K.accountMenu(num) }
  ).catch(() => ctx.reply(`Managing +${num}`, { reply_markup: K.accountMenu(num) }));
}

async function setPfpPrompt(ctx, num) {
  ctx.setState({ step: 'set_pfp', num });
  await ctx.editMessageText(
    `*${config.bot.name} - Change Profile Picture*\n\`+${num}\`\n\nSend the image to set.\n\nFull HD - No cropping - Original ratio kept`,
    { parse_mode: 'Markdown', reply_markup: K.back(`account:${num}`) }
  ).catch(() => ctx.reply('Send your profile picture:'));
}

async function handlePfpImage(ctx, num, bot) {
  const tid = String(ctx.from.id);
  clearState(ctx.from.id);

  const photo = ctx.message.photo;
  const doc = ctx.message.document;
  let fid;

  if (doc?.mime_type?.startsWith('image/')) fid = doc.file_id;
  else if (photo) fid = photo[photo.length - 1].file_id;
  else return ctx.reply('Send an image file.');

  const msg = await ctx.reply('Uploading to WhatsApp...');
  try {
    const dir = getUserImageDir(tid, num);
    const imgPath = await downloadTelegramFile(bot, fid, dir, `pfp_${Date.now()}`);
    await setProfilePicture(tid, num, imgPath);
    await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null,
      `*Profile picture updated!*\n\`+${num}\``,
      { parse_mode: 'Markdown', reply_markup: K.accountMenu(num) }
    );
  } catch (e) {
    logger.error('set pfp: ' + e.message);
    await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null,
      `Failed: ${e.message}`,
      { reply_markup: K.back(`account:${num}`) }
    );
  }
}

async function getPfp(ctx, num) {
  const tid = String(ctx.from.id);
  const msg = await ctx.reply('Fetching profile picture...');
  try {
    const url = await getProfilePicture(tid, num);
    await ctx.replyWithPhoto(url, {
      caption: `*Current Profile Picture*\n\`+${num}\``,
      parse_mode: 'Markdown', reply_markup: K.back(`account:${num}`),
    });
    await ctx.telegram.deleteMessage(ctx.chat.id, msg.message_id).catch(() => {});
  } catch (e) {
    await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null,
      `${e.message}`, { reply_markup: K.back(`account:${num}`) }
    );
  }
}

async function delPfpConfirm(ctx, num) {
  await ctx.editMessageText(
    `*Delete Profile Picture*\n\`+${num}\`\n\nAre you sure?`,
    { parse_mode: 'Markdown', reply_markup: K.confirm(`confirm_del_pfp:${num}`, `account:${num}`) }
  ).catch(() => {});
}

async function delPfpDo(ctx, num) {
  const tid = String(ctx.from.id);
  try {
    await deleteProfilePicture(tid, num);
    await ctx.editMessageText(`Profile picture deleted.\n\`+${num}\``,
      { parse_mode: 'Markdown', reply_markup: K.accountMenu(num) });
  } catch (e) {
    await ctx.editMessageText(`${e.message}`, { reply_markup: K.back(`account:${num}`) });
  }
}

async function autoMenu(ctx, num) {
  const tid = String(ctx.from.id);
  const job = await getActiveJob(tid, num);
  const warning = job
    ? `\n\n*Active:* every ${job.interval} ${job.mode}(s) - stop it before starting a new one.`
    : '';
  await ctx.editMessageText(
    `*${config.bot.name} - Auto Change Profile Picture*\n\`+${num}\`${warning}\n\nChoose schedule mode:`,
    { parse_mode: 'Markdown', reply_markup: K.autoMenu(num) }
  ).catch(() => {});
}

async function autoHourPrompt(ctx, num) {
  const tid = String(ctx.from.id);
  if (await getActiveJob(tid, num)) {
    return ctx.editMessageText('Stop current auto-change job first.',
      { reply_markup: K.back(`account:${num}`) });
  }
  ctx.setState({ step: 'auto_hour_interval', num });
  await ctx.editMessageText(
    `*Hour Based Auto Change*\n\`+${num}\`\n\nHow many hours between changes? (1-24)\n\nExamples:\n- 1h = 24 images\n- 2h = 12 images\n- 6h = 4 images\n- 12h = 2 images`,
    { parse_mode: 'Markdown', reply_markup: K.back(`account:${num}`) }
  ).catch(() => ctx.reply('Hours between changes (1-24):'));
}

async function autoDayPrompt(ctx, num) {
  const tid = String(ctx.from.id);
  if (await getActiveJob(tid, num)) {
    return ctx.editMessageText('Stop current auto-change job first.',
      { reply_markup: K.back(`account:${num}`) });
  }
  ctx.setState({ step: 'auto_day_interval', num });
  await ctx.editMessageText(
    `*Day Based Auto Change*\n\`+${num}\`\n\nHow many days between changes? (1-30)`,
    { parse_mode: 'Markdown', reply_markup: K.back(`account:${num}`) }
  ).catch(() => ctx.reply('Days between changes (1-30):'));
}

async function handleAutoInterval(ctx) {
  const { step, num } = ctx.userState;
  const n = parseInt(ctx.message.text?.trim());
  const isHour = step === 'auto_hour_interval';

  if (isHour && (isNaN(n) || n < 1 || n > 24))
    return ctx.reply('Enter a number 1-24.');
  if (!isHour && (isNaN(n) || n < 1 || n > 30))
    return ctx.reply('Enter a number 1-30.');

  const mode = isHour ? 'hour' : 'day';
  const required = calcImageCount(mode, n);

  ctx.setState({ step: `auto_${mode}_images`, num, interval: n, required, images: [] });
  await ctx.reply(
    `*${isHour ? `Every ${n} hour(s)` : `Every ${n} day(s)`}*\n\nI need *${required} image(s)* total.\n\nSend them one by one - I'll confirm as I receive each one.`,
    { parse_mode: 'Markdown' }
  );
}

async function handleAutoImages(ctx, bot) {
  const { step, num, interval, required, images } = ctx.userState;
  const mode = step.includes('hour') ? 'hour' : 'day';
  const tid = String(ctx.from.id);

  const photo = ctx.message.photo;
  const doc = ctx.message.document;
  let fid;

  if (doc?.mime_type?.startsWith('image/')) fid = doc.file_id;
  else if (photo) fid = photo[photo.length - 1].file_id;
  else return ctx.reply('Send an image.');

  const dir = getUserImageDir(tid, num);
  const imgPath = await downloadTelegramFile(bot, fid, dir, `auto_${mode}_${images.length}`);
  images.push(imgPath);
  ctx.setState({ ...ctx.userState, images });

  if (images.length < required) {
    return ctx.reply(`Image ${images.length}/${required} received. ${required - images.length} more needed.`);
  }

  clearState(ctx.from.id);
  const m = await ctx.reply('Setting up scheduler...');
  try {
    await scheduleJob(tid, num, mode, interval, images);
    await ctx.telegram.editMessageText(ctx.chat.id, m.message_id, null,
      `*Auto Change Scheduled!*\n\n\`+${num}\`\nMode: every ${interval} ${mode}(s)\n${images.length} images\n\nYou'll be notified on each change!`,
      { parse_mode: 'Markdown', reply_markup: K.accountMenu(num) }
    );
  } catch (e) {
    logger.error('schedule: ' + e.message);
    await ctx.telegram.editMessageText(ctx.chat.id, m.message_id, null,
      `Schedule failed: ${e.message}`,
      { reply_markup: K.back(`account:${num}`) }
    );
  }
}

async function stopAuto(ctx, num) {
  const tid = String(ctx.from.id);
  try {
    await cancelJob(tid, num);
    await ctx.editMessageText(
      `*Auto change stopped.*\n\`+${num}\`\n\nImages are still saved.`,
      { parse_mode: 'Markdown', reply_markup: K.accountMenu(num) }
    );
  } catch (e) {
    await ctx.editMessageText(`${e.message}`, { reply_markup: K.back(`account:${num}`) });
  }
}

async function purgeConfirm(ctx, num) {
  await ctx.editMessageText(
    `*Purge Session*\n\`+${num}\`\n\nThis permanently deletes:\n- Session data\n- Stored images\n- Active schedules\n\n*Cannot be undone!*`,
    { parse_mode: 'Markdown', reply_markup: K.confirm(`confirm_purge:${num}`, `account:${num}`) }
  ).catch(() => {});
}

async function purgeDo(ctx, num) {
  const tid = String(ctx.from.id);
  try {
    await cancelJob(tid, num);
    await disconnect(tid, num);
    deleteDir(getUserImageDir(tid, num));
    deleteDir(getUserSessionDir(tid, num));
    await Session.findOneAndDelete({ telegramId: tid, whatsappNumber: num });
    await ctx.editMessageText(
      `*Session purged.*\n\nAll data for \`+${num}\` deleted.`,
      { parse_mode: 'Markdown', reply_markup: K.backMain() }
    );
  } catch (e) {
    await ctx.editMessageText(`${e.message}`, { reply_markup: K.back(`account:${num}`) });
  }
}

async function makePermanent(ctx, num) {
  await Session.findOneAndUpdate({ telegramId: String(ctx.from.id), whatsappNumber: num }, { isPermanent: true });
  await ctx.answerCbQuery('Session marked permanent!').catch(() => {});
  await ctx.editMessageText(
    `*Session is now permanent.*\n\`+${num}\``,
    { parse_mode: 'Markdown', reply_markup: K.accountMenu(num) }
  ).catch(() => {});
}

module.exports = {
  pairedList, accountMenu, setPfpPrompt, handlePfpImage, getPfp,
  delPfpConfirm, delPfpDo, autoMenu, autoHourPrompt, autoDayPrompt,
  handleAutoInterval, handleAutoImages, stopAuto, purgeConfirm, purgeDo, makePermanent,
};
