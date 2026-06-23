const axios = require('axios');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const logger = require('../utils/logger');
const { Wallpaper, Channel } = require('../database/models');
const { getWallpaperCategoryDir, downloadFile } = require('../utils/storage');
const { sleep } = require('../utils/helpers');

const CATEGORIES = [
  'girls', 'boys', 'anime', 'cars', 'nature',
  'gaming', 'aesthetic', 'weekend_specials', 'monthly_collections',
];

const CATEGORY_QUERIES = {
  girls: 'beautiful girl portrait aesthetic wallpaper 4k',
  boys: 'handsome man portrait aesthetic wallpaper 4k',
  anime: 'anime wallpaper 4k aesthetic',
  cars: 'luxury sports car wallpaper 4k',
  nature: 'nature landscape wallpaper 4k',
  gaming: 'gaming wallpaper 4k aesthetic',
  aesthetic: 'aesthetic wallpaper 4k pastel',
  weekend_specials: 'weekend vibes aesthetic wallpaper',
  monthly_collections: 'monthly wallpaper collection aesthetic',
};

async function fetchWallpapers(category, count = 10) {
  const query = CATEGORY_QUERIES[category] || `${category} wallpaper 4k`;
  const images = [];

  if (config.apis.pexelsKey) {
    try {
      const r = await axios.get('https://api.pexels.com/v1/search', {
        params: { query, per_page: count, page: Math.floor(Math.random() * 5) + 1 },
        headers: { Authorization: config.apis.pexelsKey },
        timeout: 10000,
      });
      for (const photo of (r.data?.photos || [])) {
        images.push({
          url: photo.src?.original || photo.src?.large2x,
          width: photo.width,
          height: photo.height,
          source: 'pexels',
        });
      }
    } catch (e) {
      logger.warn(`Pexels fetch (${category}): ${e.message}`);
    }
  }

  if (images.length < count && config.apis.unsplashKey) {
    try {
      const r = await axios.get('https://api.unsplash.com/search/photos', {
        params: { query, per_page: count - images.length, page: Math.floor(Math.random() * 5) + 1 },
        headers: { Authorization: `Client-ID ${config.apis.unsplashKey}` },
        timeout: 10000,
      });
      for (const photo of (r.data?.results || [])) {
        images.push({
          url: photo.urls?.full || photo.urls?.regular,
          width: photo.width,
          height: photo.height,
          source: 'unsplash',
        });
      }
    } catch (e) {
      logger.warn(`Unsplash fetch (${category}): ${e.message}`);
    }
  }

  return images;
}

async function downloadAndStoreWallpapers(category, count = 5) {
  const images = await fetchWallpapers(category, count);
  const dir = getWallpaperCategoryDir(category);
  const stored = [];

  for (const img of images) {
    try {
      const existing = await Wallpaper.findOne({ url: img.url });
      if (existing) continue;

      const filename = `wp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
      const localPath = path.join(dir, filename);
      await downloadFile(img.url, localPath);

      const wp = await Wallpaper.create({
        category,
        url: img.url,
        localPath,
        source: img.source,
        width: img.width,
        height: img.height,
      });
      stored.push(wp);
      await sleep(500);
    } catch (e) {
      logger.warn(`Download wallpaper: ${e.message}`);
    }
  }

  return stored;
}

async function getUnpostedWallpapers(category, platform, limit = 5) {
  const query = { category };
  if (platform === 'telegram') query.postedToTg = false;
  if (platform === 'whatsapp') query.postedToWa = false;

  return Wallpaper.find(query).sort({ addedAt: 1 }).limit(limit);
}

async function postWallpapersToTelegram(bot, category) {
  const channel = config.channels.telegram;
  if (!channel) return [];

  const wallpapers = await getUnpostedWallpapers(category, 'telegram', 5);
  const posted = [];

  for (const wp of wallpapers) {
    try {
      const source = wp.localPath && fs.existsSync(wp.localPath)
        ? { source: wp.localPath }
        : wp.url;

      await bot.telegram.sendPhoto(channel, source, {
        caption: `${category.replace(/_/g, ' ').toUpperCase()} Wallpaper\n\nBy ${config.bot.name}`,
      });

      wp.postedToTg = true;
      await wp.save();
      posted.push(wp);
      await sleep(2000);
    } catch (e) {
      logger.warn(`Post to TG channel: ${e.message}`);
    }
  }

  return posted;
}

async function runDailyWallpaperJob(bot) {
  logger.info('Running daily wallpaper job');

  for (const category of CATEGORIES) {
    try {
      await downloadAndStoreWallpapers(category, 3);
      await postWallpapersToTelegram(bot, category);
      await sleep(5000);
    } catch (e) {
      logger.error(`Wallpaper job (${category}): ${e.message}`);
    }
  }

  logger.info('Daily wallpaper job complete');
}

module.exports = {
  CATEGORIES, fetchWallpapers, downloadAndStoreWallpapers,
  getUnpostedWallpapers, postWallpapersToTelegram, runDailyWallpaperJob,
};
