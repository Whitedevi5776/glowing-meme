const K = require('./keyboards');
const config = require('../config');
const { searchImages } = require('../services/pinterest');
const { CATEGORIES } = require('../services/wallpaper');
const logger = require('../utils/logger');

async function start(ctx) {
  await ctx.editMessageText(
    `*${config.bot.name} - Wallpaper Gallery*\n\nBrowse HD wallpapers by category:`,
    { parse_mode: 'Markdown', reply_markup: K.wallpaperCategories() }
  ).catch(() => ctx.reply('Choose category:', { reply_markup: K.wallpaperCategories() }));
}

async function browseCategory(ctx, category) {
  const displayName = category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  const msg = await ctx.reply(`Loading ${displayName} wallpapers...`);

  try {
    const query = `${category.replace(/_/g, ' ')} wallpaper 4k HD`;
    const images = await searchImages(query, 0, 10);

    await ctx.telegram.deleteMessage(ctx.chat.id, msg.message_id).catch(() => {});

    if (!images.length) {
      return ctx.reply(`No wallpapers found for ${displayName}. Try again later.`, {
        reply_markup: K.back('wallpapers'),
      });
    }

    const media = images.slice(0, 10).map((img, i) => ({
      type: 'photo',
      media: img.url,
      ...(i === 0 ? {
        caption: `*${displayName} Wallpapers*\n${images.length} HD images\n\nBy ${config.bot.name}`,
        parse_mode: 'Markdown',
      } : {}),
    }));

    try {
      await ctx.replyWithMediaGroup(media);
    } catch {
      for (const img of images.slice(0, 5)) {
        await ctx.replyWithPhoto(img.url, { caption: img.title }).catch(() => {});
      }
    }

    await ctx.reply(`Showing ${Math.min(images.length, 10)} ${displayName} wallpapers`, {
      reply_markup: { inline_keyboard: [
        [{ text: 'Load More', callback_data: `wp_more:${category}:1` }],
        [{ text: 'Back to Categories', callback_data: 'wallpapers' }],
        [{ text: 'Main Menu', callback_data: 'main_menu' }],
      ]},
    });
  } catch (e) {
    logger.error(`Wallpaper browse ${category}: ${e.message}`);
    await ctx.telegram.deleteMessage(ctx.chat.id, msg.message_id).catch(() => {});
    await ctx.reply('Failed to load wallpapers. Try again.', { reply_markup: K.back('wallpapers') });
  }
}

async function loadMore(ctx, category, page) {
  await ctx.answerCbQuery('Loading...').catch(() => {});
  const displayName = category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  try {
    const query = `${category.replace(/_/g, ' ')} wallpaper 4k HD`;
    const images = await searchImages(query, page, 10);

    if (!images.length) {
      return ctx.reply(`No more ${displayName} wallpapers found.`, {
        reply_markup: K.back('wallpapers'),
      });
    }

    const media = images.slice(0, 10).map((img, i) => ({
      type: 'photo',
      media: img.url,
      ...(i === 0 ? {
        caption: `*${displayName} Wallpapers* - Page ${page + 1}\n\nBy ${config.bot.name}`,
        parse_mode: 'Markdown',
      } : {}),
    }));

    try {
      await ctx.replyWithMediaGroup(media);
    } catch {
      for (const img of images.slice(0, 5)) {
        await ctx.replyWithPhoto(img.url, { caption: img.title }).catch(() => {});
      }
    }

    await ctx.reply(`Page ${page + 1} - ${Math.min(images.length, 10)} wallpapers`, {
      reply_markup: { inline_keyboard: [
        [{ text: 'Load More', callback_data: `wp_more:${category}:${page + 1}` }],
        [{ text: 'Back to Categories', callback_data: 'wallpapers' }],
        [{ text: 'Main Menu', callback_data: 'main_menu' }],
      ]},
    });
  } catch (e) {
    logger.error(`Wallpaper more ${category}: ${e.message}`);
    await ctx.reply('Failed to load more. Try again.', { reply_markup: K.back('wallpapers') });
  }
}

module.exports = { start, browseCategory, loadMore };
