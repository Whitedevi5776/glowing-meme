const axios = require('axios');
const logger = require('../utils/logger');

const PLATFORM_PATTERNS = {
  pinterest: /pinterest\.(com|co\.\w+)|pin\.it/i,
  tiktok:    /tiktok\.com|vm\.tiktok/i,
  instagram: /instagram\.com|instagr\.am/i,
  facebook:  /facebook\.com|fb\.watch|fb\.com/i,
  twitter:   /twitter\.com|x\.com/i,
  youtube:   /youtube\.com|youtu\.be/i,
  threads:   /threads\.net/i,
  reddit:    /reddit\.com|redd\.it/i,
};

function detectPlatform(url) {
  for (const [platform, pattern] of Object.entries(PLATFORM_PATTERNS)) {
    if (pattern.test(url)) return platform;
  }
  return null;
}

async function downloadMedia(url) {
  const platform = detectPlatform(url);
  if (!platform) return { error: 'Unsupported platform. Supported: Pinterest, TikTok, Instagram, Facebook, Twitter/X, YouTube, Threads, Reddit' };

  try {
    switch (platform) {
      case 'pinterest':  return await downloadPinterest(url);
      case 'tiktok':     return await downloadTikTok(url);
      case 'instagram':  return await downloadInstagram(url);
      case 'facebook':   return await downloadFacebook(url);
      case 'twitter':    return await downloadTwitter(url);
      case 'youtube':    return await downloadYouTube(url);
      case 'threads':    return await downloadThreads(url);
      case 'reddit':     return await downloadReddit(url);
      default: return { error: 'Platform not supported' };
    }
  } catch (e) {
    logger.error(`Download ${platform}: ${e.message}`);
    return { error: `Failed to download from ${platform}: ${e.message}` };
  }
}

async function downloadPinterest(url) {
  const { downloadPinterestPost } = require('../services/pinterest');
  const images = await downloadPinterestPost(url);
  if (!images.length) return { error: 'No images found on this Pinterest page' };
  return {
    platform: 'Pinterest',
    type: 'images',
    media: images.map(img => ({ url: img.url, type: 'photo', title: img.title })),
  };
}

async function downloadWithAPI(url, platform) {
  const apiEndpoints = [
    { url: 'https://api.cobalt.tools/api/json', type: 'cobalt' },
    { url: 'https://co.wuk.sh/api/json', type: 'cobalt' },
  ];

  for (const api of apiEndpoints) {
    try {
      const response = await axios.post(api.url, {
        url,
        vCodec: 'h264',
        vQuality: 'max',
        aFormat: 'mp3',
        filenamePattern: 'basic',
        isAudioOnly: false,
      }, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      });

      if (response.data?.url) {
        return {
          platform,
          type: 'video',
          media: [{ url: response.data.url, type: 'video', title: `${platform} Video` }],
        };
      }

      if (response.data?.picker) {
        return {
          platform,
          type: 'mixed',
          media: response.data.picker.map(item => ({
            url: item.url,
            type: item.type === 'photo' ? 'photo' : 'video',
            title: `${platform} Media`,
          })),
        };
      }
    } catch (e) {
      logger.warn(`API ${api.url} failed: ${e.message}`);
    }
  }

  return null;
}

async function downloadTikTok(url) {
  const result = await downloadWithAPI(url, 'TikTok');
  if (result) return result;

  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 15000,
      maxRedirects: 10,
    });
    const html = response.data;

    const patterns = [
      /"playAddr":"([^"]+)"/,
      /"downloadAddr":"([^"]+)"/,
      /"play_addr":\s*\{[^}]*"url_list":\s*\["([^"]+)"/,
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) {
        return {
          platform: 'TikTok',
          type: 'video',
          media: [{ url: match[1].replace(/\\u002F/g, '/').replace(/\\u0026/g, '&'), type: 'video', title: 'TikTok Video' }],
        };
      }
    }
  } catch {}

  return { error: 'Could not download TikTok video. The video may be private or the link may have expired. Try again later.' };
}

async function downloadInstagram(url) {
  const result = await downloadWithAPI(url, 'Instagram');
  if (result) return result;
  return { error: 'Could not download Instagram content. Try again later.' };
}

async function downloadFacebook(url) {
  const result = await downloadWithAPI(url, 'Facebook');
  if (result) return result;
  return { error: 'Could not download Facebook content. Try again later.' };
}

async function downloadTwitter(url) {
  const result = await downloadWithAPI(url, 'Twitter/X');
  if (result) return result;

  try {
    const cleanUrl = url.replace('x.com', 'twitter.com');
    const response = await axios.get(`https://publish.twitter.com/oembed?url=${encodeURIComponent(cleanUrl)}`, {
      timeout: 10000,
    });
    if (response.data?.html) {
      const imgMatches = [...response.data.html.matchAll(/src="(https:\/\/pbs\.twimg\.com\/[^"]+)"/g)];
      if (imgMatches.length) {
        return {
          platform: 'Twitter/X',
          type: 'images',
          media: imgMatches.map(m => ({
            url: m[1].replace(/&amp;/g, '&'),
            type: 'photo',
            title: 'Twitter Image',
          })),
        };
      }
    }
  } catch {}

  return { error: 'Could not download Twitter content. Try again later.' };
}

async function downloadYouTube(url) {
  const result = await downloadWithAPI(url, 'YouTube');
  if (result) return result;
  return { error: 'Could not download YouTube content. Try again later.' };
}

async function downloadThreads(url) {
  const result = await downloadWithAPI(url, 'Threads');
  if (result) return result;
  return { error: 'Could not download Threads content. Try again later.' };
}

async function downloadReddit(url) {
  try {
    const jsonUrl = url.endsWith('/') ? url + '.json' : url + '/.json';
    const response = await axios.get(jsonUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PappyBot/2.0)' },
      timeout: 10000,
    });

    const post = response.data?.[0]?.data?.children?.[0]?.data;
    if (!post) return { error: 'Could not parse Reddit post' };

    const media = [];

    if (post.is_video && post.media?.reddit_video?.fallback_url) {
      media.push({
        url: post.media.reddit_video.fallback_url,
        type: 'video',
        title: post.title || 'Reddit Video',
      });
    }

    if (post.url_overridden_by_dest && /\.(jpg|jpeg|png|gif|webp)$/i.test(post.url_overridden_by_dest)) {
      media.push({
        url: post.url_overridden_by_dest,
        type: 'photo',
        title: post.title || 'Reddit Image',
      });
    }

    if (post.is_gallery && post.media_metadata) {
      for (const [, item] of Object.entries(post.media_metadata)) {
        if (item.s?.u) {
          media.push({
            url: item.s.u.replace(/&amp;/g, '&'),
            type: 'photo',
            title: post.title || 'Reddit Gallery',
          });
        }
      }
    }

    if (media.length) {
      return { platform: 'Reddit', type: media.length > 1 ? 'mixed' : media[0].type, media };
    }
  } catch (e) {
    logger.warn(`Reddit download: ${e.message}`);
  }

  const result = await downloadWithAPI(url, 'Reddit');
  if (result) return result;
  return { error: 'Could not download Reddit content. Try again later.' };
}

module.exports = { downloadMedia, detectPlatform };
