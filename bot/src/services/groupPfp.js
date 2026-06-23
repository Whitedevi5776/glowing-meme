const config = require('../config');
const logger = require('../utils/logger');
const { GroupPfpTask } = require('../database/models');
const { sleep, extractGroupId } = require('../utils/helpers');
const { ownerJoinGroup, ownerSetGroupPfp, ownerLeaveGroup, isOwnerConnected, isOwnerAdminInGroup } = require('./ownerWhatsapp');

async function createImmediateTask(telegramId, inviteCode, imagePath) {
  const { generateTaskId } = require('../utils/helpers');
  const task = await GroupPfpTask.create({
    taskId: generateTaskId(),
    telegramId: String(telegramId),
    groupInviteCode: inviteCode,
    mode: 'immediate',
    images: [imagePath],
    totalDays: 1,
    status: 'pending_join',
  });
  return task;
}

async function createScheduledTask(telegramId, inviteCode, images, totalDays) {
  const { generateTaskId } = require('../utils/helpers');
  const task = await GroupPfpTask.create({
    taskId: generateTaskId(),
    telegramId: String(telegramId),
    groupInviteCode: inviteCode,
    mode: 'scheduled',
    images,
    totalDays,
    status: 'pending_join',
  });
  return task;
}

async function startGroupJoin(task, bot) {
  if (!isOwnerConnected()) {
    task.status = 'failed';
    task.errorMsg = 'Owner WhatsApp not connected';
    await task.save();
    throw new Error('Owner WhatsApp not connected. Please contact the bot owner.');
  }

  try {
    const groupJid = await ownerJoinGroup(task.groupInviteCode);
    task.groupJid = groupJid;
    task.status = 'pending_admin';
    task.joinedAt = new Date();
    task.approvedAt = new Date();
    await task.save();

    await bot.telegram.sendMessage(
      task.telegramId,
      `${config.bot.name} Assistant has joined the group!\n` +
      `Task: \`${task.taskId}\`\n\n` +
      `Please promote the ${config.bot.name} Assistant to *admin* so it can change the group profile picture.`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});

    startAdminCheck(task, bot);
    return task;
  } catch (e) {
    if (e.message?.includes('invite') || e.message?.includes('not-authorized')) {
      task.status = 'pending_approval';
      await task.save();

      await bot.telegram.sendMessage(
        task.telegramId,
        `A join request has been sent to the group.\n` +
        `Task: \`${task.taskId}\`\n\n` +
        `Please approve the join request from:\n` +
        `Name: *${config.bot.name} Assistant*\n` +
        `Number: \`+${config.ownerWaNumber}\`\n\n` +
        `Make the account *admin* after approval.`,
        { parse_mode: 'Markdown' }
      ).catch(() => {});

      startApprovalCheck(task, bot);
      return task;
    }

    task.status = 'failed';
    task.errorMsg = e.message;
    await task.save();
    throw e;
  }
}

function startApprovalCheck(task, bot) {
  let checks = 0;
  const maxChecks = 60;
  const interval = setInterval(async () => {
    checks++;
    if (checks > maxChecks) {
      clearInterval(interval);
      const t = await GroupPfpTask.findOne({ taskId: task.taskId });
      if (t && t.status === 'pending_approval') {
        t.status = 'failed';
        t.errorMsg = 'Join request was not approved within 30 minutes';
        t.completedAt = new Date();
        await t.save();
        await bot.telegram.sendMessage(
          t.telegramId,
          `Join request timed out for task \`${t.taskId}\`. Please try again.`,
          { parse_mode: 'Markdown' }
        ).catch(() => {});
      }
      return;
    }

    const t = await GroupPfpTask.findOne({ taskId: task.taskId });
    if (!t || t.status !== 'pending_approval') {
      clearInterval(interval);
      return;
    }
  }, 30_000);
}

function startAdminCheck(task, bot) {
  let checks = 0;
  const maxChecks = 60;
  const interval = setInterval(async () => {
    checks++;
    if (checks > maxChecks) {
      clearInterval(interval);
      const t = await GroupPfpTask.findOne({ taskId: task.taskId });
      if (t && t.status === 'pending_admin') {
        t.status = 'failed';
        t.errorMsg = 'Not promoted to admin within 30 minutes';
        t.completedAt = new Date();
        await t.save();
        await ownerLeaveGroup(t.groupJid).catch(() => {});
        await bot.telegram.sendMessage(
          t.telegramId,
          `Timed out waiting for admin promotion for task \`${t.taskId}\`. Bot has left the group.`,
          { parse_mode: 'Markdown' }
        ).catch(() => {});
      }
      return;
    }

    const t = await GroupPfpTask.findOne({ taskId: task.taskId });
    if (!t || t.status !== 'pending_admin') {
      clearInterval(interval);
      return;
    }

    try {
      const isAdmin = await isOwnerAdminInGroup(t.groupJid);
      if (isAdmin) {
        clearInterval(interval);
        t.status = 'active';
        t.adminAt = new Date();
        await t.save();

        await bot.telegram.sendMessage(
          t.telegramId,
          `${config.bot.name} Assistant has been promoted to admin!\nTask \`${t.taskId}\` is now active. Changing group PFP...`,
          { parse_mode: 'Markdown' }
        ).catch(() => {});

        await executeGroupPfpChange(t, bot);
      }
    } catch (e) {
      logger.warn(`Admin check error: ${e.message}`);
    }
  }, 30_000);
}

async function executeGroupPfpChange(task, bot) {
  try {
    if (task.mode === 'immediate') {
      await ownerSetGroupPfp(task.groupJid, task.images[0]);
      task.status = 'completed';
      task.currentDay = 1;
      task.lastChangeAt = new Date();
      task.completedAt = new Date();
      await task.save();

      await bot.telegram.sendMessage(
        task.telegramId,
        `Group profile picture has been changed successfully!\nTask: \`${task.taskId}\`\n\nThe bot will now leave the group.`,
        { parse_mode: 'Markdown' }
      ).catch(() => {});

      await sleep(config.safety.joinLeaveDelayMs);
      await ownerLeaveGroup(task.groupJid).catch(() => {});
    } else {
      await ownerSetGroupPfp(task.groupJid, task.images[0]);
      task.currentDay = 1;
      task.lastChangeAt = new Date();
      task.nextChangeAt = new Date(Date.now() + 86_400_000);
      await task.save();

      await bot.telegram.sendMessage(
        task.telegramId,
        `Group PFP changed (Day 1/${task.totalDays})!\nTask: \`${task.taskId}\`\n\nNext change in 24 hours.`,
        { parse_mode: 'Markdown' }
      ).catch(() => {});
    }
  } catch (e) {
    logger.error(`Group PFP change error: ${e.message}`);
    task.status = 'failed';
    task.errorMsg = e.message;
    task.completedAt = new Date();
    await task.save();

    await bot.telegram.sendMessage(
      task.telegramId,
      `Failed to change group PFP for task \`${task.taskId}\`: ${e.message}`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});
  }
}

async function processScheduledChanges(bot) {
  const now = new Date();
  const tasks = await GroupPfpTask.find({
    mode: 'scheduled',
    status: 'active',
    nextChangeAt: { $lte: now },
  });

  for (const task of tasks) {
    try {
      if (task.currentDay >= task.totalDays) {
        task.status = 'completed';
        task.completedAt = new Date();
        await task.save();

        await bot.telegram.sendMessage(
          task.telegramId,
          `Your schedule has ended.\nTask: \`${task.taskId}\`\nThe bot has left the group.`,
          { parse_mode: 'Markdown' }
        ).catch(() => {});

        await sleep(config.safety.joinLeaveDelayMs);
        await ownerLeaveGroup(task.groupJid).catch(() => {});
        continue;
      }

      const imageIndex = task.currentDay;
      if (imageIndex >= task.images.length) {
        task.status = 'completed';
        task.completedAt = new Date();
        await task.save();
        await ownerLeaveGroup(task.groupJid).catch(() => {});
        continue;
      }

      const isAdmin = await isOwnerAdminInGroup(task.groupJid);
      if (!isAdmin) {
        task.status = 'failed';
        task.errorMsg = 'Lost admin rights';
        task.completedAt = new Date();
        await task.save();

        await bot.telegram.sendMessage(
          task.telegramId,
          `${config.bot.name} Assistant lost admin rights.\nTask \`${task.taskId}\` cancelled.`,
          { parse_mode: 'Markdown' }
        ).catch(() => {});
        continue;
      }

      await ownerSetGroupPfp(task.groupJid, task.images[imageIndex]);
      task.currentDay += 1;
      task.lastChangeAt = new Date();
      task.nextChangeAt = new Date(Date.now() + 86_400_000);
      await task.save();

      await bot.telegram.sendMessage(
        task.telegramId,
        `Group PFP changed (Day ${task.currentDay}/${task.totalDays})!\nTask: \`${task.taskId}\`\n\n${task.currentDay < task.totalDays ? 'Next change in 24 hours.' : 'This was the last scheduled change.'}`,
        { parse_mode: 'Markdown' }
      ).catch(() => {});
    } catch (e) {
      logger.error(`Scheduled change error for ${task.taskId}: ${e.message}`);
    }
  }
}

async function cancelGroupTask(taskId) {
  const task = await GroupPfpTask.findOne({ taskId });
  if (!task) return null;

  if (task.groupJid && ['pending_admin', 'active'].includes(task.status)) {
    await ownerLeaveGroup(task.groupJid).catch(() => {});
  }

  task.status = 'cancelled';
  task.completedAt = new Date();
  await task.save();
  return task;
}

module.exports = {
  createImmediateTask, createScheduledTask,
  startGroupJoin, executeGroupPfpChange,
  processScheduledChanges, cancelGroupTask,
};
