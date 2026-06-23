const fs = require('fs');
const config = require('../config');
const logger = require('../utils/logger');
const { getUserSessionDir, cleanCorruptedSession, isSessionDirValid, deleteDir } = require('../utils/storage');
const { sleep } = require('../utils/helpers');
const { globalQueue } = require('../utils/taskQueue');

let ownerSock = null;
let ownerConnected = false;
let intentionalDisconnect = false;

const OWNER_TID = '__owner__';

async function getLib() {
  return require('@crysnovax/baileys');
}

async function connectOwnerWA({ onCode, onQR, onConnected, onDisconnected } = {}) {
  intentionalDisconnect = false;
  if (!config.ownerWaNumber) {
    logger.warn('OWNER_WA_NUMBER not set - owner WhatsApp features disabled');
    return null;
  }

  const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
  } = await getLib();

  const dir = getUserSessionDir(OWNER_TID, config.ownerWaNumber);
  const isFreshPairing = (onCode || onQR);

  if (isFreshPairing) {
    deleteDir(dir);
    fs.mkdirSync(dir, { recursive: true });
  } else {
    cleanCorruptedSession(dir);
  }

  const { state, saveCreds } = await useMultiFileAuthState(dir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger.child({ level: 'silent' })),
    },
    printQRInTerminal: false,
    browser: [config.bot.pairingName + ' Assistant', 'Chrome', '130.0'],
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
    logger: logger.child({ level: 'silent' }),
    connectTimeoutMs: 60_000,
  });

  ownerSock = sock;
  sock.ev.on('creds.update', saveCreds);

  const isPairing = !state.creds.registered;
  let isRetrying = false;
  let ownerPairingAttempt = 0;

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    // When we receive the first QR event, the socket is ready for pairing.
    if (qr && isPairing && !ownerConnected) {
      if (onCode) {
        ownerPairingAttempt++;
        if (ownerPairingAttempt === 1) {
          try {
            const cleanNumber = config.ownerWaNumber.replace(/\D/g, '');
            logger.info(`Requesting owner pairing code for ${cleanNumber}...`);
            const code = await sock.requestPairingCode(cleanNumber);
            logger.info(`Owner pairing code generated: ${code}`);
            await onCode(code);
          } catch (e) {
            logger.warn(`Owner pairing code request failed: ${e.message}`);
            if (onQR) await onQR(qr);
          }
        }
      } else if (onQR) {
        await onQR(qr);
      }
    }
    if (connection === 'open') {
      ownerConnected = true;
      logger.info(`Owner WA connected: ${config.ownerWaNumber}`);
      if (onConnected) onConnected(sock);
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      logger.info(`Owner WA closed (code=${code})`);

      // Skip close handler during controlled retry or expected 401 during pairing
      if (isRetrying) return;
      if (isPairing && !ownerConnected && (code === 401 || code === DisconnectReason.badSession)) {
        logger.info('Expected 401 during owner pairing, waiting for code request...');
        return;
      }

      ownerConnected = false;
      ownerSock = null;

      if (!intentionalDisconnect && code !== DisconnectReason.loggedOut && code !== 401) {
        logger.info('Owner WA reconnecting in 10s...');
        await sleep(10_000);
        if (intentionalDisconnect) return;
        connectOwnerWA({ onQR, onConnected, onDisconnected }).catch(e =>
          logger.error('Owner WA reconnect failed: ' + e.message)
        );
      }

      if (onDisconnected) onDisconnected(code);
    }
  });

  return sock;
}

function getOwnerSock() {
  return ownerSock;
}

function isOwnerConnected() {
  return ownerConnected && ownerSock !== null;
}

async function disconnectOwner() {
  intentionalDisconnect = true;
  if (ownerSock) {
    try { ownerSock.end(); } catch {}
    ownerSock = null;
    ownerConnected = false;
  }
}

function setOwnerNumber(num) {
  config.ownerWaNumber = num;
}

async function ownerJoinGroup(inviteCode) {
  if (!isOwnerConnected()) throw new Error('Owner WhatsApp not connected');
  return globalQueue.enqueueGroupJoin(async () => {
    return ownerSock.groupAcceptInvite(inviteCode);
  });
}

async function ownerSetGroupPfp(groupJid, imagePath) {
  if (!isOwnerConnected()) throw new Error('Owner WhatsApp not connected');
  const raw = fs.readFileSync(imagePath);
  await ownerSock.updateProfilePicture(groupJid, raw, { hd: true });
}

async function ownerLeaveGroup(groupJid) {
  if (!isOwnerConnected()) throw new Error('Owner WhatsApp not connected');
  await ownerSock.groupLeave(groupJid);
}

async function ownerGetGroupMetadata(groupJid) {
  if (!isOwnerConnected()) throw new Error('Owner WhatsApp not connected');
  return ownerSock.groupMetadata(groupJid);
}

async function isOwnerAdminInGroup(groupJid) {
  if (!isOwnerConnected()) return false;
  try {
    const meta = await ownerGetGroupMetadata(groupJid);
    const botJid = ownerSock.user.id;
    const botId = botJid.split(':')[0] + '@s.whatsapp.net';
    const participant = meta.participants.find(p =>
      p.id === botJid || p.id === botId || p.id.split(':')[0] === botJid.split(':')[0]
    );
    return participant?.admin === 'admin' || participant?.admin === 'superadmin';
  } catch {
    return false;
  }
}

function setupGroupEventListeners(bot) {
  if (!ownerSock) return;

  ownerSock.ev.on('group-participants.update', async ({ id, participants, action }) => {
    const { GroupPfpTask } = require('../database/models');
    const tasks = await GroupPfpTask.find({
      groupJid: id,
      status: { $in: ['pending_approval', 'pending_admin', 'active'] },
    });

    if (!tasks.length) return;

    const botJid = ownerSock.user.id;
    const botId = botJid.split(':')[0] + '@s.whatsapp.net';
    const isBotAffected = participants.some(p =>
      p === botJid || p === botId || p.split(':')[0] === botJid.split(':')[0]
    );

    if (!isBotAffected) return;

    for (const task of tasks) {
      if (action === 'remove') {
        task.status = 'failed';
        task.errorMsg = 'Bot was removed from the group';
        task.completedAt = new Date();
        await task.save();
        await bot.telegram.sendMessage(
          task.telegramId,
          `The ${config.bot.name} assistant was removed from the group.\nTask \`${task.taskId}\` has been cancelled.`,
          { parse_mode: 'Markdown' }
        ).catch(() => {});
      }
    }
  });

  ownerSock.ev.on('group-participants.update', async ({ id, participants, action }) => {
    if (action !== 'promote' && action !== 'demote') return;

    const { GroupPfpTask } = require('../database/models');
    const botJid = ownerSock.user.id;
    const botId = botJid.split(':')[0] + '@s.whatsapp.net';
    const isBotAffected = participants.some(p =>
      p === botJid || p === botId || p.split(':')[0] === botJid.split(':')[0]
    );

    if (!isBotAffected) return;

    const tasks = await GroupPfpTask.find({
      groupJid: id,
      status: { $in: ['pending_admin', 'active'] },
    });

    for (const task of tasks) {
      if (action === 'promote' && task.status === 'pending_admin') {
        task.status = 'active';
        task.adminAt = new Date();
        await task.save();

        await bot.telegram.sendMessage(
          task.telegramId,
          `${config.bot.name} Assistant has been promoted to admin!\nTask \`${task.taskId}\` is now active. Changing group PFP...`,
          { parse_mode: 'Markdown' }
        ).catch(() => {});

        const { executeGroupPfpChange } = require('./groupPfp');
        executeGroupPfpChange(task, bot).catch(e =>
          logger.error(`Group PFP change failed: ${e.message}`)
        );
      }

      if (action === 'demote' && task.status === 'active') {
        task.status = 'failed';
        task.errorMsg = 'Admin rights were removed';
        task.completedAt = new Date();
        await task.save();

        await bot.telegram.sendMessage(
          task.telegramId,
          `${config.bot.name} Assistant lost admin rights in the group.\nTask \`${task.taskId}\` has been cancelled.`,
          { parse_mode: 'Markdown' }
        ).catch(() => {});
      }
    }
  });

  logger.info('Group event listeners set up for owner WA');
}

module.exports = {
  connectOwnerWA, getOwnerSock, isOwnerConnected,
  disconnectOwner, setOwnerNumber,
  ownerJoinGroup, ownerSetGroupPfp, ownerLeaveGroup,
  ownerGetGroupMetadata, isOwnerAdminInGroup,
  setupGroupEventListeners,
};
