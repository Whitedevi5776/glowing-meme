# PAPPYBOT

A production-ready Telegram bot for WhatsApp profile picture management, group PFP changes, universal media downloading, and HD wallpaper automation. Uses `@whiskeysockets/baileys` for WhatsApp integration with full HD PFP support (no cropping).

## Features

- **WhatsApp Pairing** - Pair via code or QR, auto-reconnect, session recovery
- **Personal PFP Management** - Set, get, delete profile pictures (full HD, zero crop)
- **Auto PFP Rotation** - Hour/day-based schedules via BullMQ + Redis
- **Group PFP Change** - Immediate or scheduled daily changes for WhatsApp groups
- **Smart Group Monitoring** - Event-driven detection of approval, admin promotion, demotion, removal
- **Universal Media Downloader** - Pinterest, TikTok, Instagram, Facebook, Twitter/X, YouTube, Threads, Reddit
- **HD Wallpaper Gallery** - Browse by category (Girls, Boys, Anime, Cars, Nature, Gaming, Aesthetic, etc.)
- **Wallpaper Automation** - Auto-fetch and post to Telegram/WhatsApp channels
- **Inline Bot** - Search images and download media inline
- **Owner Panel** - Stats, broadcast, force-join, channel management, owner WA pairing
- **Rate Limiting & Safety** - Task queues, cooldowns, randomized timing to prevent WhatsApp restrictions

## Requirements

- Node.js 18+
- MongoDB (local or remote)
- Redis (for auto-change scheduler, optional)

## Setup

```bash
cd bot
npm install
cp .env.example .env
# Edit .env with your credentials
npm start
```

## Environment Variables

| Key | Description |
|-----|-------------|
| `BOT_TOKEN` | Telegram bot token from @BotFather |
| `OWNER_ID` | Telegram user ID(s), comma-separated |
| `MONGODB_URI` | MongoDB connection string |
| `REDIS_URL` | Redis URL (for schedulers) |
| `OWNER_WA_NUMBER` | Dedicated WhatsApp number for group PFP tasks |
| `SESSION_SECRET` | Random secret for session encryption |
| `TELEGRAM_CHANNEL` | Telegram channel for wallpaper posting |
| `UNSPLASH_ACCESS_KEY` | Optional: Unsplash API key |
| `PEXELS_API_KEY` | Optional: Pexels API key |

## Architecture

```
bot/src/
├── app.js                         <- Entry point
├── config/index.js                <- Centralized configuration
├── commands/start.js              <- /start, /help, /download
├── handlers/
│   ├── keyboards.js               <- All inline keyboard layouts
│   ├── callbackRouter.js          <- Routes button presses
│   ├── messageRouter.js           <- Routes text/image messages
│   ├── pinterestHandler.js        <- Image search (up to 20/page)
│   ├── pairingHandler.js          <- WhatsApp pairing (code + QR)
│   ├── accountHandler.js          <- Personal PFP management
│   ├── groupPfpHandler.js         <- Group PFP workflows
│   ├── downloadHandler.js         <- Universal media downloader UI
│   ├── wallpaperHandler.js        <- Wallpaper gallery UI
│   └── supportHandler.js          <- Support ticket system
├── services/
│   ├── whatsapp.js                <- Baileys wrapper (pairing, PFP, reconnect)
│   ├── ownerWhatsapp.js           <- Dedicated owner WA (group operations)
│   ├── groupPfp.js                <- Group PFP task engine
│   ├── pinterest.js               <- Image search + Pinterest download
│   ├── wallpaper.js               <- Wallpaper fetching + automation
│   └── support.js                 <- Ticket system
├── downloaders/
│   └── index.js                   <- Universal downloader (8 platforms)
├── inline/
│   └── inlineHandler.js           <- Inline bot queries
├── schedulers/
│   ├── autoChange.js              <- BullMQ PFP auto-change
│   ├── groupPfpScheduler.js       <- Daily group PFP changes
│   └── wallpaperScheduler.js      <- Daily wallpaper posting
├── database/
│   ├── connect.js                 <- MongoDB connection
│   └── models.js                  <- All Mongoose schemas
├── middleware/
│   ├── auth.js                    <- Owner check, force-join
│   ├── session.js                 <- Conversation state
│   └── rateLimit.js               <- Rate limiting
├── owner/
│   └── ownerHandler.js            <- Owner panel + channel management
└── utils/
    ├── logger.js                  <- Pino logger
    ├── helpers.js                 <- Utility functions
    ├── encryption.js              <- AES-256-GCM encryption
    ├── storage.js                 <- File system operations
    └── taskQueue.js               <- Task queue with cooldowns
```

## Deployment

```bash
# Install dependencies
npm install -g pm2

# Start with PM2
cd bot
pm2 start src/app.js --name pappybot
pm2 save
pm2 startup
```

## Owner WA Number

The dedicated Owner WA number is used exclusively for:
- Joining WhatsApp groups to change profile pictures
- Leaving groups after task completion

It is **never** used for messaging, spam, or any other purpose. Set `OWNER_WA_NUMBER` in `.env` and pair via the Owner Panel in the bot.
