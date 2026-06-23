const crypto = require('crypto');
const config = require('../config');

function generateTicketId() {
  return 'TKT-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();
}

function generateTaskId() {
  return 'TASK-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();
}

function formatPhoneNumber(phone) {
  return phone.replace(/[^0-9]/g, '');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay(minMs, maxMs) {
  const delay = minMs + Math.random() * (maxMs - minMs);
  return sleep(delay);
}

function safeDelay() {
  return randomDelay(config.safety.minActionDelayMs, config.safety.maxActionDelayMs);
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

function escapeMarkdown(text) {
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

function calcImageCount(mode, interval) {
  if (mode === 'hour') return Math.ceil(24 / interval);
  return Math.ceil(30 / interval);
}

function extractGroupId(link) {
  const match = link.match(/chat\.whatsapp\.com\/([A-Za-z0-9]+)/);
  return match ? match[1] : null;
}

function isValidWaGroupLink(link) {
  return /^https?:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]+$/.test(link.trim());
}

function isValidPhoneNumber(phone) {
  const num = formatPhoneNumber(phone);
  return num.length >= 7 && num.length <= 15;
}

function truncate(str, len = 100) {
  if (str.length <= len) return str;
  return str.slice(0, len - 3) + '...';
}

module.exports = {
  generateTicketId, generateTaskId, formatPhoneNumber,
  sleep, randomDelay, safeDelay,
  chunkArray, escapeMarkdown, calcImageCount,
  extractGroupId, isValidWaGroupLink, isValidPhoneNumber, truncate,
};
