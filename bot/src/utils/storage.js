const fs = require('fs');
const path = require('path');
const axios = require('axios');
const config = require('../config');

const DATA_DIR = path.join(process.cwd(), 'data');
const STORAGE_DIR = path.join(DATA_DIR, 'images');
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
const WALLPAPERS_DIR = path.join(DATA_DIR, 'wallpapers');
const DOWNLOADS_DIR = path.join(DATA_DIR, 'downloads');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

ensureDir(STORAGE_DIR);
ensureDir(SESSIONS_DIR);
ensureDir(WALLPAPERS_DIR);
ensureDir(DOWNLOADS_DIR);

function getUserImageDir(telegramId, whatsappNumber) {
  const dir = path.join(STORAGE_DIR, String(telegramId), String(whatsappNumber).replace(/[^0-9]/g, ''));
  ensureDir(dir);
  return dir;
}

function getUserSessionDir(telegramId, whatsappNumber) {
  const dir = path.join(SESSIONS_DIR, String(telegramId), String(whatsappNumber).replace(/[^0-9]/g, ''));
  ensureDir(dir);
  return dir;
}

function getGroupPfpDir(telegramId, taskId) {
  const dir = path.join(STORAGE_DIR, String(telegramId), 'group_pfp', String(taskId));
  ensureDir(dir);
  return dir;
}

function getWallpaperCategoryDir(category) {
  const dir = path.join(WALLPAPERS_DIR, category.toLowerCase().replace(/\s+/g, '_'));
  ensureDir(dir);
  return dir;
}

function getDownloadDir(telegramId) {
  const dir = path.join(DOWNLOADS_DIR, String(telegramId));
  ensureDir(dir);
  return dir;
}

async function downloadFile(url, destPath, headers) {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 60000,
    headers: headers || { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36' },
  });
  fs.writeFileSync(destPath, response.data);
  return destPath;
}

async function downloadTelegramFile(bot, fileId, destDir, filename) {
  const file = await bot.telegram.getFile(fileId);
  const ext = path.extname(file.file_path) || '.jpg';
  const fileUrl = `https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`;
  const destPath = path.join(destDir, filename + ext);
  await downloadFile(fileUrl, destPath);
  return destPath;
}

function deleteDir(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .map(f => path.join(dir, f))
    .filter(f => fs.statSync(f).isFile());
}

function isSessionDirValid(dir) {
  if (!fs.existsSync(dir)) return false;
  const files = fs.readdirSync(dir);
  return files.length > 0 && files.some(f => f.includes('creds'));
}

function cleanCorruptedSession(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  const hasCreds = files.some(f => f.includes('creds'));
  if (!hasCreds && files.length > 0) {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
  }
}

module.exports = {
  getUserImageDir, getUserSessionDir, getGroupPfpDir,
  getWallpaperCategoryDir, getDownloadDir,
  downloadTelegramFile, downloadFile, deleteDir, listFiles,
  isSessionDirValid, cleanCorruptedSession, ensureDir,
  DATA_DIR, STORAGE_DIR, SESSIONS_DIR, WALLPAPERS_DIR, DOWNLOADS_DIR,
};
