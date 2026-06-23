const fs = require('fs');
const sharp = require('sharp');
const { getUserSessionDir, isSessionDirValid, cleanCorruptedSession } = require('../utils/storage');
const { Session } = require('../database/models');
const config = require('../config');
const logger = require('../utils/logger');
const { sleep } = require('../utils/helpers');

const active = new Map();

let _lib = null;
async function lib() {
  if (_lib) return _lib;
  _lib = require('@rexxhayanasi/elaina-baileys');
  return _lib;
}

async function createWhatsAppSession(telegramId, whatsappNumber, { onCode, onQR, onConnected, onDisconnected } = {}) {
  const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
  } = await lib();

  const dir = getUserSessionDir(telegramId, whatsappNumber);
  cleanCorruptedSession(dir);

  const { state, saveCreds } = await useMultiFileAuthState(dir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger.child({ level: 'silent' })),
    },
    printQRInTerminal: false,
    browser: [config.bot.browserName, 'Chrome', '130.0'],
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
    logger: logger.child({ level: 'silent' }),
    connectTimeoutMs: 30_000,
    defaultQueryTimeoutMs: 30_000,
    retryRequestDelayMs: 500,
    maxMsgRetryCount: 3,
  });

  const key = `${telegramId}:${whatsappNumber}`;
  active.set(key, sock);
  sock.ev.on('creds.update', saveCreds);

  let pairingRequested = false;
  let connectionResolved = false;

  if (onCode && !state.creds.registered) {
    const requestPairing = async (attempt = 1) => {
      if (pairingRequested || connectionResolved) return;
      try {
        await sleep(3000 + (attempt - 1) * 2000);
        if (connectionResolved) return;

        const cleanNumber = whatsappNumber.replace(/\D/g, '');
        const code = await sock.requestPairingCode(cleanNumber, config.bot.pairingName);
        pairingRequested = true;
        if (onCode) await onCode(code);
      } catch (e) {
        logger.warn(`Pairing code attempt ${attempt}: ${e.message}`);
        if (attempt < 3 && !connectionResolved) {
          await sleep(2000);
          return requestPairing(attempt + 1);
        }
        if (onQR) {
          logger.info('Pairing code failed, falling back to QR');
        }
      }
    };
    requestPairing();
  }

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr && onQR && !pairingRequested && !connectionResolved) {
      await onQR(qr);
    }

    if (connection === 'open') {
      connectionResolved = true;
      logger.info(`WA connected: ${whatsappNumber}`);
      await Session.findOneAndUpdate(
        { telegramId: String(telegramId), whatsappNumber },
        {
          isActive: true, lastConnected: new Date(),
          failCount: 0, lastError: null,
        },
        { upsert: true }
      ).catch(() => {});
      if (onConnected) onConnected(sock);
    }

    if (connection === 'close') {
      connectionResolved = true;
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const reason = lastDisconnect?.error?.output?.payload?.error;
      logger.info(`WA closed: ${whatsappNumber} (code=${statusCode}, reason=${reason})`);
      active.delete(key);

      const shouldReconnect = statusCode !== DisconnectReason.loggedOut
        && statusCode !== DisconnectReason.badSession
        && statusCode !== 401;

      await Session.findOneAndUpdate(
        { telegramId: String(telegramId), whatsappNumber },
        {
          isActive: false,
          lastError: reason || `code_${statusCode}`,
          $inc: { failCount: 1 },
        }
      ).catch(() => {});

      if (statusCode === DisconnectReason.badSession || statusCode === 401) {
        logger.warn(`Bad session for ${whatsappNumber}, cleaning up`);
        cleanCorruptedSession(dir);
      }

      if (onDisconnected) onDisconnected(shouldReconnect, statusCode);
    }
  });

  return sock;
}

function getSock(tid, num) { return active.get(`${tid}:${num}`); }

async function ensureSock(tid, num) {
  let s = getSock(tid, num);
  if (s) return s;

  s = await reconnect(tid, num);
  if (!s) throw new Error('WhatsApp not connected. Please re-pair.');
  return s;
}

async function reconnect(tid, num) {
  const session = await Session.findOne({ telegramId: String(tid), whatsappNumber: num });
  if (!session) return null;

  const dir = getUserSessionDir(tid, num);
  if (!isSessionDirValid(dir)) return null;

  if (session.failCount >= 5) {
    logger.warn(`Too many failures for ${num}, skipping reconnect`);
    return null;
  }

  return new Promise(res => {
    let done = false;
    const timeout = setTimeout(() => {
      if (!done) { done = true; res(null); }
    }, config.limits.reconnectTimeoutMs);

    createWhatsAppSession(tid, num, {
      onConnected: sock => {
        if (!done) { done = true; clearTimeout(timeout); res(sock); }
      },
      onDisconnected: () => {
        if (!done) { done = true; clearTimeout(timeout); res(null); }
      },
    }).catch(() => {
      if (!done) { done = true; clearTimeout(timeout); res(null); }
    });
  });
}

async function toFullHDBuffer(imagePath) {
  const raw = fs.readFileSync(imagePath);
  return sharp(raw).jpeg({ quality: 100 }).toBuffer();
}

async function setFullHDProfilePicture(sock, jid, imagePath) {
  const { jidNormalizedUser, S_WHATSAPP_NET } = await lib();
  const img = await toFullHDBuffer(imagePath);
  let targetJid;
  if (jidNormalizedUser(jid) !== jidNormalizedUser(sock.user.id)) {
    targetJid = jidNormalizedUser(jid);
  }
  await sock.query({
    tag: 'iq',
    attrs: {
      ...(targetJid ? { target: targetJid } : {}),
      to: S_WHATSAPP_NET,
      type: 'set',
      xmlns: 'w:profile:picture',
    },
    content: [{ tag: 'picture', attrs: { type: 'image' }, content: img }],
  });
}

async function setProfilePicture(tid, num, imagePath) {
  const sock = await ensureSock(tid, num);
  await setFullHDProfilePicture(sock, sock.user.id, imagePath);
}

async function setGroupProfilePicture(sock, groupJid, imagePath) {
  await setFullHDProfilePicture(sock, groupJid, imagePath);
}

async function getProfilePicture(tid, num) {
  const sock = await ensureSock(tid, num);
  return sock.profilePictureUrl(sock.user.id, 'image');
}

async function deleteProfilePicture(tid, num) {
  const sock = await ensureSock(tid, num);
  await sock.removeProfilePicture(sock.user.id);
}

async function joinGroupViaInvite(sock, inviteCode) {
  return sock.groupAcceptInvite(inviteCode);
}

async function leaveGroup(sock, groupJid) {
  await sock.groupLeave(groupJid);
}

async function getGroupMetadata(sock, groupJid) {
  return sock.groupMetadata(groupJid);
}

async function isAdminInGroup(sock, groupJid) {
  const meta = await getGroupMetadata(sock, groupJid);
  const botJid = sock.user.id;
  const botId = botJid.split(':')[0] + '@s.whatsapp.net';
  const participant = meta.participants.find(p =>
    p.id === botJid || p.id === botId || p.id.split(':')[0] === botJid.split(':')[0]
  );
  return participant?.admin === 'admin' || participant?.admin === 'superadmin';
}

async function disconnect(tid, num) {
  const s = getSock(tid, num);
  if (s) {
    await s.logout().catch(() => {});
    active.delete(`${tid}:${num}`);
  }
}

function getActiveSessions() {
  return active;
}

module.exports = {
  createWhatsAppSession, setProfilePicture, setGroupProfilePicture,
  getProfilePicture, deleteProfilePicture,
  joinGroupViaInvite, leaveGroup, getGroupMetadata, isAdminInGroup,
  disconnect, reconnect, getSock, ensureSock, getActiveSessions,
};
