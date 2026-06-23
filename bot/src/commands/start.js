const K = require('../handlers/keyboards');
const config = require('../config');
const { isOwner, checkForceJoin } = require('../middleware/auth');
const { Channel } = require('../database/models');

async function start(ctx, bot) {
  const canUse = await checkForceJoin(ctx, bot);
  if (!canUse) return;

  const name = ctx.from?.first_name || 'User';
  const owner = isOwner(ctx.from?.id);

  const channels = await Channel.find({ isActive: true });
  const waChannels = channels.filter(c => c.platform === 'whatsapp');
  const tgChannels = channels.filter(c => c.platform === 'telegram');

  let channelText = '';
  if (tgChannels.length) {
    channelText += '\n\n*Telegram Channel:*\n' + tgChannels.map(c => c.link).join('\n');
  }
  if (waChannels.length) {
    channelText += '\n\n*WhatsApp Channel:*\n' + waChannels.map(c => c.link).join('\n');
  }

  await ctx.reply(
    `*Welcome to ${config.bot.name}, ${name}!*\n\n` +
    `Your all-in-one WhatsApp & Media manager.\n\n` +
    `*Features:*\n` +
    `- Upload HD profile pictures with *zero cropping*\n` +
    `- Search images (up to 20 per page)\n` +
    `- Auto-rotate profile pics on a schedule\n` +
    `- Change WhatsApp Group profile pictures\n` +
    `- Download media from 8+ platforms\n` +
    `- HD Wallpaper gallery\n` +
    `- Manage unlimited WhatsApp accounts\n` +
    `${channelText}\n\n` +
    `_Choose an option below to get started:_`,
    { parse_mode: 'Markdown', reply_markup: K.mainMenu(owner) }
  );
}

module.exports = { start };
