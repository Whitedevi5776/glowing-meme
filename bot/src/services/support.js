const { SupportTicket } = require('../database/models');
const { generateTicketId } = require('../utils/helpers');
const config = require('../config');
const logger = require('../utils/logger');

async function getOrCreateTicket(tid, username) {
  let t = await SupportTicket.findOne({ telegramId: String(tid), status: 'open' });
  if (!t) t = await SupportTicket.create({
    ticketId: generateTicketId(), telegramId: String(tid), username, messages: [],
  });
  return t;
}

async function addUserMsg(tid, username, text, fileId, fileType) {
  const t = await getOrCreateTicket(tid, username);
  t.messages.push({ from: 'user', text, fileId, fileType });
  t.updatedAt = new Date();
  await t.save();
  return t;
}

async function addOwnerReply(ticketId, text) {
  const t = await SupportTicket.findOne({ ticketId });
  if (!t) return null;
  t.messages.push({ from: 'owner', text });
  t.updatedAt = new Date();
  await t.save();
  return t;
}

async function closeTicket(ticketId) {
  return SupportTicket.findOneAndUpdate({ ticketId }, { status: 'closed' });
}

async function forwardToOwner(bot, ticket, { text, fileId, fileType }) {
  const header = `Ticket #${ticket.ticketId}\nUser: @${ticket.username || 'unknown'} (\`${ticket.telegramId}\`)\n\n`;
  const kb = { inline_keyboard: [[
    { text: 'Reply', callback_data: `reply_ticket:${ticket.ticketId}` },
    { text: 'Close', callback_data: `close_ticket:${ticket.ticketId}` },
  ]]};

  for (const oid of config.ownerIds) {
    try {
      if (text && !fileId) {
        await bot.telegram.sendMessage(oid, header + text, { parse_mode: 'Markdown', reply_markup: kb });
      } else if (fileType === 'photo') {
        await bot.telegram.sendPhoto(oid, fileId, { caption: header + (text || ''), parse_mode: 'Markdown', reply_markup: kb });
      } else if (fileType === 'video') {
        await bot.telegram.sendVideo(oid, fileId, { caption: header + (text || ''), parse_mode: 'Markdown', reply_markup: kb });
      } else if (fileType === 'document') {
        await bot.telegram.sendDocument(oid, fileId, { caption: header + (text || ''), parse_mode: 'Markdown', reply_markup: kb });
      }
    } catch (e) { logger.warn('Forward to owner: ' + e.message); }
  }
}

async function replyToUser(bot, tid, text) {
  await bot.telegram.sendMessage(String(tid),
    `*Support Reply:*\n\n${text}`, { parse_mode: 'Markdown' });
}

module.exports = { addUserMsg, addOwnerReply, closeTicket, forwardToOwner, replyToUser };
