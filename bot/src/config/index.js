require('dotenv').config();

const config = {
  botToken: process.env.BOT_TOKEN || '',
  ownerIds: (process.env.OWNER_ID || '').split(',').map(s => s.trim()).filter(Boolean),

  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/pappybot',
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  ownerWaNumber: process.env.OWNER_WA_NUMBER || '',
  sessionSecret: process.env.SESSION_SECRET || 'pappybot-secret-2026',
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',

  channels: {
    telegram: process.env.TELEGRAM_CHANNEL || '',
    whatsapp: process.env.WHATSAPP_CHANNEL || '',
  },

  apis: {
    unsplashKey: process.env.UNSPLASH_ACCESS_KEY || '',
    pexelsKey: process.env.PEXELS_API_KEY || '',
  },

  bot: {
    name: 'PAPPYBOT',
    pairingName: 'PAPPYBOT',
    browserName: 'PAPPYBOT',
    version: '2.0.0',
  },

  limits: {
    maxPairedAccounts: 10,
    maxAutoChangeImages: 30,
    maxScheduleDays: 30,
    maxGroupPfpDays: 30,
    maxDownloadImages: 20,
    pairingTimeoutMs: 60_000,
    reconnectTimeoutMs: 30_000,
    groupJoinCooldownMs: 60_000,
    taskQueueConcurrency: 2,
  },

  safety: {
    minActionDelayMs: 2_000,
    maxActionDelayMs: 5_000,
    joinLeaveDelayMs: 10_000,
    cooldownBetweenJoinsMs: 120_000,
  },
};

module.exports = config;
