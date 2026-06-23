const { searchImages } = require('../services/pinterest');
const { downloadMedia, detectPlatform } = require('../downloaders');
const config = require('../config');
const logger = require('../utils/logger');

async function handleInlineQuery(ctx) {
  const query = ctx.inlineQuery?.query?.trim();
  if (!query) return showDefaultResults(ctx);

  try {
    if (query.startsWith('http')) {
      return handleUrlInline(ctx, query);
    }

    return handleSearchInline(ctx, query);
  } catch (e) {
    logger.error('Inline query: ' + e.message);
    await ctx.answerInlineQuery([], {
      cache_time: 5,
      switch_pm_text: `${config.bot.name} - Error occurred`,
      switch_pm_parameter: 'start',
    }).catch(() => {});
  }
}

async function showDefaultResults(ctx) {
  const results = [
    {
      type: 'article',
      id: 'help_search',
      title: 'Search Images',
      description: 'Type a keyword to search for HD images',
      input_message_content: { message_text: `Use @${ctx.botInfo.username} <keyword> to search images inline` },
      thumb_url: 'https://img.icons8.com/fluency/96/search.png',
    },
    {
      type: 'article',
      id: 'help_download',
      title: 'Download Media',
      description: 'Paste a URL to download from Pinterest, TikTok, Instagram, etc.',
      input_message_content: { message_text: `Use @${ctx.botInfo.username} <url> to download media inline` },
      thumb_url: 'https://img.icons8.com/fluency/96/download.png',
    },
  ];

  await ctx.answerInlineQuery(results, {
    cache_time: 300,
    switch_pm_text: `Open ${config.bot.name}`,
    switch_pm_parameter: 'start',
    is_personal: true,
  }).catch(() => {});
}

async function handleSearchInline(ctx, query) {
  const images = await searchImages(query, 0, 20);

  if (!images.length) {
    return ctx.answerInlineQuery([{
      type: 'article',
      id: 'no_results',
      title: `No images found for "${query}"`,
      description: 'Try a different search term',
      input_message_content: { message_text: `No images found for "${query}"` },
    }], { cache_time: 30 }).catch(() => {});
  }

  const results = images.map((img, i) => ({
    type: 'photo',
    id: `img_${i}_${Date.now()}`,
    photo_url: img.url,
    thumb_url: img.thumb || img.url,
    photo_width: img.w || 800,
    photo_height: img.h || 600,
    title: img.title || query,
    caption: `${img.title || query}\n\nvia ${config.bot.name}`,
  }));

  await ctx.answerInlineQuery(results, {
    cache_time: 60,
    is_personal: false,
    switch_pm_text: `Open ${config.bot.name}`,
    switch_pm_parameter: 'start',
  }).catch(() => {});
}

async function handleUrlInline(ctx, url) {
  const platform = detectPlatform(url);
  if (!platform) {
    return ctx.answerInlineQuery([{
      type: 'article',
      id: 'unsupported',
      title: 'Unsupported Platform',
      description: 'Supported: Pinterest, TikTok, Instagram, Facebook, Twitter, YouTube, Threads, Reddit',
      input_message_content: { message_text: 'Unsupported platform' },
    }], { cache_time: 10 }).catch(() => {});
  }

  await ctx.answerInlineQuery([{
    type: 'article',
    id: 'downloading',
    title: `Download from ${platform}`,
    description: 'Tap to start downloading',
    input_message_content: {
      message_text: `Downloading from ${platform}...\nURL: ${url}\n\nUse /download ${url} in the bot chat for best results.`,
    },
  }], { cache_time: 5, is_personal: true }).catch(() => {});
}

module.exports = { handleInlineQuery };
