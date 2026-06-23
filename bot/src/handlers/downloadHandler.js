const K = require('./keyboards');
const config = require('../config');
const { clearState } = require('../middleware/session');
const { downloadMedia, detectPlatform } = require('../downloaders');
const { downloadFile, getDownloadDir } = require('../utils/storage');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

async function sendMediaItem(ctx, item, platform, dir) {
  const ext = item.type === 'video' ? '.mp4' : '.jpg';
  const localPath = path.join(dir, `dl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}${ext}`);

  if (item.type === 'video') {
    try {
      await downloadFile(item.url, localPath);
      await ctx.replyWithVideo({ source: localPath }, { caption: item.title || `${platform} Video` });
      fs.unlinkSync(localPath);
      return true;
    } catch (e) {
      logger.warn(`Video local send: ${e.message}`);
      if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
      return false;
    }
  }

  try {
    await ctx.replyWithPhoto(item.url, { caption: item.title || `${platform} Image` });
    return true;
  } catch {
    try {
      await downloadFile(item.url, localPath);
      await ctx.replyWithPhoto({ source: localPath }, { caption: item.title || '' });
      fs.unlinkSync(localPath);
      return true;
    } catch (e2) {
      logger.warn(`Photo local send fallback: ${e2.message}`);
      if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
      return false;
    }
  }
}

async function start(ctx) {
  await ctx.editMessageText(
    `*${config.bot.name} - Universal Media Downloader*\n\n` +
    `Choose a platform or use *Auto Detect* to paste any URL.\n\n` +
    `Supported: Pinterest, TikTok, Instagram, Facebook, Twitter/X, YouTube, Threads, Reddit\n\n` +
    `You can also use the /download command:\n\`/download <url>\``,
    { parse_mode: 'Markdown', reply_markup: K.downloadMenu() }
  ).catch(() => ctx.reply('Choose platform:', { reply_markup: K.downloadMenu() }));
}

async function promptUrl(ctx, platform) {
  ctx.setState({ step: 'dl_url', platform: platform || 'auto' });
  const text = platform
    ? `*Download from ${platform}*\n\nSend the URL:`
    : `*Auto Detect Download*\n\nPaste any media URL:`;
  await ctx.editMessageText(text, {
    parse_mode: 'Markdown', reply_markup: K.back('download'),
  }).catch(() => ctx.reply(text, { parse_mode: 'Markdown' }));
}

async function handleUrl(ctx, url, bot) {
  clearState(ctx.from.id);

  if (!url || !url.startsWith('http')) {
    return ctx.reply('Please send a valid URL starting with http:// or https://', { reply_markup: K.backMain() });
  }

  const platform = detectPlatform(url);
  const msg = await ctx.reply(
    `Downloading from ${platform || 'Unknown'}...\nPlease wait, this may take a moment.`
  );

  try {
    const result = await downloadMedia(url);

    if (result.error) {
      await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null,
        `Download failed: ${result.error}`,
        { reply_markup: K.back('download') }
      );
      return;
    }

    await ctx.telegram.deleteMessage(ctx.chat.id, msg.message_id).catch(() => {});

    const media = result.media || [];
    if (!media.length) {
      return ctx.reply('No media found at this URL.', { reply_markup: K.back('download') });
    }

    let sent = 0;
    const maxSend = Math.min(media.length, config.limits.maxDownloadImages);
    const sentIndices = new Set();
    const dir = getDownloadDir(String(ctx.from.id));

    if (maxSend > 1) {
      const photos = [];
      const videos = [];
      for (let i = 0; i < maxSend; i++) {
        const item = media[i];
        if (item.type === 'video') videos.push({ idx: i, item });
        else photos.push({ idx: i, item });
      }

      if (photos.length > 1) {
        const mediaGroup = photos.slice(0, 10).map(({ item }, gi) => ({
          type: 'photo',
          media: item.url,
          ...(gi === 0 ? { caption: `*${result.platform}* - ${media.length} item(s)`, parse_mode: 'Markdown' } : {}),
        }));
        try {
          await ctx.replyWithMediaGroup(mediaGroup);
          photos.slice(0, 10).forEach(({ idx }) => sentIndices.add(idx));
          sent = sentIndices.size;
        } catch {
          // fallback to individual sends below
        }
      }

      for (let i = 0; i < maxSend; i++) {
        if (sentIndices.has(i)) continue;
        const item = media[i];
        const ok = await sendMediaItem(ctx, item, result.platform, dir);
        if (ok) { sentIndices.add(i); sent++; }
      }
    } else {
      const item = media[0];
      const ok = await sendMediaItem(ctx, item, result.platform, dir);
      if (ok) {
        sent = 1;
      } else {
        await ctx.reply(`Could not download the media. Please try again later.`, { reply_markup: K.back('download') });
      }
    }

    if (sent > 0) {
      await ctx.reply(
        `Downloaded ${sent} item(s) from ${result.platform}`,
        { reply_markup: K.back('download') }
      );
    }
  } catch (e) {
    logger.error('Download handler: ' + e.message);
    await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null,
      `Download error: ${e.message}`,
      { reply_markup: K.back('download') }
    ).catch(() => {});
  }
}

module.exports = { start, promptUrl, handleUrl };
