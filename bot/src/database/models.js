const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  telegramId:  { type: String, required: true, unique: true },
  username:    String,
  firstName:   String,
  lastName:    String,
  isBlocked:   { type: Boolean, default: false },
  joinedAt:    { type: Date, default: Date.now },
  lastActive:  { type: Date, default: Date.now },
});

const sessionSchema = new mongoose.Schema({
  telegramId:      { type: String, required: true },
  whatsappNumber:  { type: String, required: true },
  isActive:        { type: Boolean, default: false },
  isPermanent:     { type: Boolean, default: false },
  failCount:       { type: Number, default: 0 },
  lastError:       String,
  createdAt:       { type: Date, default: Date.now },
  lastConnected:   Date,
});
sessionSchema.index({ telegramId: 1, whatsappNumber: 1 }, { unique: true });

const autoChangeJobSchema = new mongoose.Schema({
  telegramId:      { type: String, required: true },
  whatsappNumber:  { type: String, required: true },
  mode:            { type: String, enum: ['hour', 'day'], required: true },
  interval:        { type: Number, required: true },
  images:          [{ type: String }],
  currentIndex:    { type: Number, default: 0 },
  isActive:        { type: Boolean, default: true },
  nextRun:         Date,
  bullJobId:       String,
  createdAt:       { type: Date, default: Date.now },
});
autoChangeJobSchema.index({ telegramId: 1, whatsappNumber: 1 }, { unique: true });

const groupPfpTaskSchema = new mongoose.Schema({
  taskId:          { type: String, required: true, unique: true },
  telegramId:      { type: String, required: true },
  groupJid:        String,
  groupInviteCode: { type: String, required: true },
  groupName:       String,
  mode:            { type: String, enum: ['immediate', 'scheduled'], required: true },
  images:          [{ type: String }],
  totalDays:       { type: Number, default: 1 },
  currentDay:      { type: Number, default: 0 },
  status:          { type: String, enum: ['pending_join', 'pending_approval', 'pending_admin', 'active', 'completed', 'failed', 'cancelled'], default: 'pending_join' },
  joinedAt:        Date,
  approvedAt:      Date,
  adminAt:         Date,
  lastChangeAt:    Date,
  nextChangeAt:    Date,
  errorMsg:        String,
  createdAt:       { type: Date, default: Date.now },
  completedAt:     Date,
});
groupPfpTaskSchema.index({ telegramId: 1, status: 1 });

const supportTicketSchema = new mongoose.Schema({
  ticketId:   { type: String, required: true, unique: true },
  telegramId: { type: String, required: true },
  username:   String,
  status:     { type: String, enum: ['open', 'closed'], default: 'open' },
  messages:   [{
    from:      { type: String, enum: ['user', 'owner'] },
    text:      String,
    fileId:    String,
    fileType:  String,
    timestamp: { type: Date, default: Date.now },
  }],
  createdAt:  { type: Date, default: Date.now },
  updatedAt:  { type: Date, default: Date.now },
});

const settingsSchema = new mongoose.Schema({
  key:       { type: String, required: true, unique: true },
  value:     mongoose.Schema.Types.Mixed,
  updatedAt: { type: Date, default: Date.now },
});

const forceJoinSchema = new mongoose.Schema({
  link:      { type: String, required: true },
  chatId:    String,
  title:     String,
  type:      { type: String, enum: ['channel', 'group'], default: 'channel' },
  platform:  { type: String, enum: ['telegram', 'whatsapp'], default: 'telegram' },
  isActive:  { type: Boolean, default: true },
  isRequired: { type: Boolean, default: true },
  addedAt:   { type: Date, default: Date.now },
});

const wallpaperSchema = new mongoose.Schema({
  category:   { type: String, required: true },
  url:        { type: String, required: true },
  localPath:  String,
  source:     String,
  width:      Number,
  height:     Number,
  postedToTg: { type: Boolean, default: false },
  postedToWa: { type: Boolean, default: false },
  addedAt:    { type: Date, default: Date.now },
});
wallpaperSchema.index({ category: 1, postedToTg: 1 });

const channelSchema = new mongoose.Schema({
  platform:  { type: String, enum: ['whatsapp', 'telegram'], required: true },
  link:      { type: String, required: true },
  title:     String,
  isActive:  { type: Boolean, default: true },
  addedAt:   { type: Date, default: Date.now },
});

const User          = mongoose.model('User', userSchema);
const Session       = mongoose.model('Session', sessionSchema);
const AutoChangeJob = mongoose.model('AutoChangeJob', autoChangeJobSchema);
const GroupPfpTask  = mongoose.model('GroupPfpTask', groupPfpTaskSchema);
const SupportTicket = mongoose.model('SupportTicket', supportTicketSchema);
const Settings      = mongoose.model('Settings', settingsSchema);
const ForceJoin     = mongoose.model('ForceJoin', forceJoinSchema);
const Wallpaper     = mongoose.model('Wallpaper', wallpaperSchema);
const Channel       = mongoose.model('Channel', channelSchema);

module.exports = {
  User, Session, AutoChangeJob, GroupPfpTask,
  SupportTicket, Settings, ForceJoin, Wallpaper, Channel,
};
