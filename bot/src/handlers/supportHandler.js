const { addUserMsg, addOwnerReply, closeTicket, forwardToOwner, replyToUser } = require('../services/support');
const K = require('./keyboards');
const config = require('../config');
const { clearState } = require('../middleware/session');
const logger = require('../utils/logger');

async function start(ctx) {
  ctx.setState({ step: 'support_msg' });
  await ctx.editMessageText(
    `*${config.bot.name} - Support Center*\n\nSend your message, question, or issue.\n\nYou can send: text, photo, document, or video.\n\nOur team will reply as soon as possible.`,
    { parse_mode: 'Markdown', reply_markup: K.back('main_menu') }
  ).catch(() => ctx.reply('Send your support message:'));
}

async function handleMsg(ctx, bot) {
  clearState(ctx.from.id);
  const tid = String(ctx.from.id);
  const username = ctx.from.username || ctx.from.first_name || 'User';

  let text = ctx.message.text || ctx.message.caption || '';
  let fid = null, ftype = null;
  if (ctx.message.photo) { fid = ctx.message.photo[ctx.message.photo.length - 1].file_id; ftype = 'photo'; }
  if (ctx.message.document) { fid = ctx.message.document.file_id; ftype = 'document'; }
  if (ctx.message.video) { fid = ctx.message.video.file_id; ftype = 'video'; }

  try {
    const ticket = await addUserMsg(tid, username, text, fid, ftype);
    await forwardToOwner(bot, ticket, { text, fileId: fid, fileType: ftype });
    await ctx.reply(
      `*Message sent!*\n\nTicket: \`${ticket.ticketId}\`\n\nYou'll receive our reply here in chat.`,
      { parse_mode: 'Markdown', reply_markup: K.backMain() }
    );
  } catch (e) {
    logger.error('support msg: ' + e.message);
    await ctx.reply('Failed to send. Try again.', { reply_markup: K.backMain() });
  }
}

async function ownerReplyPrompt(ctx, ticketId) {
  ctx.setState({ step: 'owner_reply', ticketId });
  await ctx.editMessageText(
    `*Replying to #${ticketId}*\n\nSend your reply:`,
    { parse_mode: 'Markdown', reply_markup: K.back('owner') }
  ).catch(() => ctx.reply('Send your reply:'));
}

async function ownerReplyDo(ctx, bot) {
  const { ticketId } = ctx.userState;
  clearState(ctx.from.id);
  const ticket = await addOwnerReply(ticketId, ctx.message.text);
  if (!ticket) return ctx.reply(`Ticket ${ticketId} not found.`);
  await replyToUser(bot, ticket.telegramId, ctx.message.text);
  await ctx.reply(`Reply sent for ticket \`${ticketId}\``, { parse_mode: 'Markdown' });
}

async function closeDo(ctx, ticketId) {
  await closeTicket(ticketId);
  await ctx.answerCbQuery('Ticket closed').catch(() => {});
  await ctx.editMessageText(`Ticket *#${ticketId}* closed.`, { parse_mode: 'Markdown' }).catch(() => {});
}

module.exports = { start, handleMsg, ownerReplyPrompt, ownerReplyDo, closeDo };
