const QRCode = require('qrcode');
const { createWhatsAppSession } = require('../services/whatsapp');
const { Session } = require('../database/models');
const K = require('./keyboards');
const config = require('../config');
const { clearState } = require('../middleware/session');
const { isValidPhoneNumber, formatPhoneNumber } = require('../utils/helpers');
const logger = require('../utils/logger');

async function start(ctx) {
  ctx.setState({ step: 'pair_phone' });
  const text = `*${config.bot.name} - Pair WhatsApp Account*\n\nSend your WhatsApp number with country code.\n\n_Example:_ \`+1234567890\``;
  await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: K.back('main_menu') })
    .catch(() => ctx.reply(text, { parse_mode: 'Markdown' }));
}

async function handlePhone(ctx, phone, bot) {
  const tid = String(ctx.from.id);
  const num = formatPhoneNumber(phone);

  if (!isValidPhoneNumber(phone)) {
    return ctx.reply('Invalid number. Include country code, e.g. `+12345678900`', { parse_mode: 'Markdown' });
  }

  const existingCount = await Session.countDocuments({ telegramId: tid });
  if (existingCount >= config.limits.maxPairedAccounts) {
    return ctx.reply(`Maximum ${config.limits.maxPairedAccounts} paired accounts reached. Remove one first.`, { reply_markup: K.backMain() });
  }

  clearState(ctx.from.id);
  const wait = await ctx.reply(`Connecting \`+${num}\` via ${config.bot.name}...`, { parse_mode: 'Markdown' });

  let qrSent = false;

  try {
    await createWhatsAppSession(tid, num, {
      onCode: async code => {
        await ctx.telegram.deleteMessage(ctx.chat.id, wait.message_id).catch(() => {});
        await ctx.reply(
          `*${config.bot.name} Pairing Code for* \`+${num}\`:\n\n` +
          `\`\`\`\n${code}\n\`\`\`\n\n` +
          `*Steps:*\n1. Open WhatsApp\n2. Settings -> Linked Devices\n3. Link a Device -> Enter code\n\nExpires in 60 seconds`,
          { parse_mode: 'Markdown' }
        );
      },
      onQR: async qr => {
        if (qrSent) return;
        qrSent = true;
        try {
          const qrBuffer = await QRCode.toBuffer(qr, { width: 512, margin: 2 });
          await ctx.telegram.deleteMessage(ctx.chat.id, wait.message_id).catch(() => {});
          await ctx.replyWithPhoto(
            { source: qrBuffer },
            {
              caption: `*${config.bot.name} QR Code for* \`+${num}\`\n\nScan this QR code in WhatsApp -> Linked Devices`,
              parse_mode: 'Markdown',
            }
          );
        } catch (e) {
          logger.warn('QR send failed: ' + e.message);
        }
      },
      onConnected: async sock => {
        const info = sock.user;
        await Session.findOneAndUpdate(
          { telegramId: tid, whatsappNumber: num },
          { telegramId: tid, whatsappNumber: num, isActive: true, lastConnected: new Date(), failCount: 0 },
          { upsert: true }
        );
        await ctx.reply(
          `*${config.bot.name} - Paired Successfully!*\n\n` +
          `Number: \`+${num}\`\n` +
          `Name: ${info?.name || 'Unknown'}\n\n` +
          `What would you like to do next?`,
          { parse_mode: 'Markdown', reply_markup: K.afterPair(num) }
        );
      },
      onDisconnected: async (reconnect, code) => {
        if (!reconnect) {
          await ctx.reply(`Session ended - you were logged out from \`+${num}\`.`, {
            parse_mode: 'Markdown', reply_markup: K.backMain(),
          });
        }
      },
    });
  } catch (e) {
    logger.error('Pairing: ' + e.message);
    await ctx.telegram.deleteMessage(ctx.chat.id, wait.message_id).catch(() => {});
    await ctx.reply(`Pairing failed: ${e.message}\n\nPlease try again.`, { reply_markup: K.backMain() });
  }
}

module.exports = { start, handlePhone };
