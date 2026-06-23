const { searchImages } = require('../services/pinterest');
const K = require('./keyboards');
const config = require('../config');
const logger = require('../utils/logger');

async function start(ctx) {
  ctx.setState({ step: 'pi_query' });
  const text = `*${config.bot.name} - Image Search*\n\nSend a keyword to search for HD images (up to 20 per page).\n\n_Example:_ \`sukuna\`, \`anime girl\`, \`nature 4k\``;
  const kb = K.back('main_menu');
  await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: kb })
    .catch(() => ctx.reply(text, { parse_mode: 'Markdown' }));
}

async function search(ctx, query, page = 0) {
  const msg = await ctx.reply(`Searching for *"${query}"*...`, { parse_mode: 'Markdown' });

  try {
    const imgs = await searchImages(query, page, 20);
    await ctx.telegram.deleteMessage(ctx.chat.id, msg.message_id).catch(() => {});

    if (!imgs.length) {
      return ctx.reply(`No images found for *"${query}"*.`, {
        parse_mode: 'Markdown', reply_markup: K.backMain(),
      });
    }

    const batch1 = imgs.slice(0, 10);
    const batch2 = imgs.slice(10, 20);

    const media1 = batch1.map((img, i) => ({
      type: 'photo',
      media: img.url,
      ...(i === 0 ? { caption: `*"${query}"* - Page ${page + 1}\n${imgs.length} images`, parse_mode: 'Markdown' } : {}),
    }));

    try {
      await ctx.replyWithMediaGroup(media1);
    } catch {
      for (const img of batch1.slice(0, 5)) {
        await ctx.replyWithPhoto(img.url, { caption: img.title }).catch(() => {});
      }
    }

    if (batch2.length > 0) {
      const media2 = batch2.map((img, i) => ({
        type: 'photo',
        media: img.url,
      }));
      try {
        await ctx.replyWithMediaGroup(media2);
      } catch {
        for (const img of batch2.slice(0, 5)) {
          await ctx.replyWithPhoto(img.url, { caption: img.title }).catch(() => {});
        }
      }
    }

    await ctx.reply(`Showing *${imgs.length}* images for *"${query}"*`, {
      parse_mode: 'Markdown',
      reply_markup: K.pinterestBottom(query, page),
    });
  } catch (e) {
    logger.error('Pinterest: ' + e.message);
    await ctx.telegram.deleteMessage(ctx.chat.id, msg.message_id).catch(() => {});
    await ctx.reply('Search failed. Try again later.', { reply_markup: K.backMain() });
  }
}

async function more(ctx, page, query) {
  await ctx.answerCbQuery('Loading...').catch(() => {});
  await search(ctx, query, page);
}

module.exports = { start, search, more };
