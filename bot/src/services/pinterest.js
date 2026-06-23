const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

async function searchImages(query, page = 0, count = 20) {
  try {
    const r1 = await axios.get('https://duckduckgo.com/', {
      params: { q: query, iax: 'images', ia: 'images' },
      headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' },
      timeout: 10000,
    });
    const match = r1.data.match(/vqd=([\d-]+)/);
    if (!match) throw new Error('No vqd token');
    const vqd = match[1];

    const r2 = await axios.get('https://duckduckgo.com/i.js', {
      params: {
        l: 'us-en', o: 'json', q: query, vqd,
        f: ',,,,,', p: '1',
        s: page * count,
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
        Referer: 'https://duckduckgo.com',
      },
      timeout: 10000,
    });

    const results = (r2.data?.results || []).slice(0, count);
    return results
      .filter(r => r.image && r.width >= 400 && r.height >= 400)
      .map(r => ({
        url: r.image,
        thumb: r.thumbnail,
        title: r.title || query,
        w: r.width,
        h: r.height,
        source: r.source,
      }));
  } catch (e) {
    logger.warn('DDG image search failed: ' + e.message);
    return searchFallback(query, page, count);
  }
}

async function searchFallback(query, page = 0, count = 20) {
  if (config.apis.unsplashKey) {
    try {
      const r = await axios.get('https://api.unsplash.com/search/photos', {
        params: { query, per_page: Math.min(count, 30), page: page + 1 },
        headers: { Authorization: `Client-ID ${config.apis.unsplashKey}` },
        timeout: 8000,
      });
      return (r.data?.results || []).map(p => ({
        url: p.urls?.full || p.urls?.regular,
        thumb: p.urls?.thumb,
        title: p.alt_description || query,
        w: p.width, h: p.height,
        source: 'Unsplash',
      }));
    } catch (e) {
      logger.warn('Unsplash fallback failed: ' + e.message);
    }
  }

  if (config.apis.pexelsKey) {
    try {
      const r = await axios.get('https://api.pexels.com/v1/search', {
        params: { query, per_page: Math.min(count, 20), page: page + 1 },
        headers: { Authorization: config.apis.pexelsKey },
        timeout: 8000,
      });
      return (r.data?.photos || []).map(p => ({
        url: p.src?.original || p.src?.large2x,
        thumb: p.src?.tiny,
        title: p.alt || query,
        w: p.width, h: p.height,
        source: 'Pexels',
      }));
    } catch (e) {
      logger.warn('Pexels fallback failed: ' + e.message);
    }
  }

  return [];
}

async function downloadPinterestPost(url) {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
      timeout: 15000,
      maxRedirects: 5,
    });

    const html = response.data;
    const images = [];

    const jsonMatch = html.match(/<script[^>]*id="__PWS_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (jsonMatch) {
      try {
        const data = JSON.parse(jsonMatch[1]);
        const pins = extractPinsFromData(data);
        images.push(...pins);
      } catch {}
    }

    if (images.length === 0) {
      const ogImages = [...html.matchAll(/property="og:image"\s+content="([^"]+)"/g)];
      for (const m of ogImages) {
        images.push({ url: m[1], title: 'Pinterest Image' });
      }
    }

    if (images.length === 0) {
      const imgMatches = [...html.matchAll(/https:\/\/i\.pinimg\.com\/originals\/[^\s"']+/g)];
      for (const m of imgMatches) {
        images.push({ url: m[0], title: 'Pinterest Image' });
      }
    }

    const unique = [];
    const seen = new Set();
    for (const img of images) {
      const key = img.url.split('?')[0];
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(img);
      }
    }

    return unique.slice(0, config.limits.maxDownloadImages);
  } catch (e) {
    logger.error('Pinterest download: ' + e.message);
    return [];
  }
}

function extractPinsFromData(data) {
  const pins = [];

  function walk(obj) {
    if (!obj || typeof obj !== 'object') return;
    if (obj.images && obj.images.orig) {
      pins.push({
        url: obj.images.orig.url,
        title: obj.description || obj.title || 'Pinterest Image',
        w: obj.images.orig.width,
        h: obj.images.orig.height,
      });
    }
    if (obj.image_xlarge_url) {
      pins.push({ url: obj.image_xlarge_url, title: obj.description || 'Pinterest Image' });
    }
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === 'object') walk(obj[key]);
    }
  }

  walk(data);
  return pins;
}

module.exports = { searchImages, downloadPinterestPost };
