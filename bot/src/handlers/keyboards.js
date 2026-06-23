const config = require('../config');

const K = {
  mainMenu(owner = false) {
    const b = [
      [{ text: 'Pinterest Images', callback_data: 'pinterest' }],
      [{ text: 'Pair WhatsApp', callback_data: 'pair_wa' }],
      [{ text: 'Paired Accounts', callback_data: 'paired' }],
      [{ text: 'Change Group PFP', callback_data: 'group_pfp' }],
      [{ text: 'Download Media', callback_data: 'download' }],
      [{ text: 'Wallpapers', callback_data: 'wallpapers' }],
      [{ text: 'Support', callback_data: 'support' }],
    ];
    if (owner) b.push([{ text: 'Owner Panel', callback_data: 'owner' }]);
    return { inline_keyboard: b };
  },

  accountMenu(num) {
    return { inline_keyboard: [
      [{ text: 'Change Profile Picture', callback_data: `set_pfp:${num}` }],
      [{ text: 'Get Current Profile Picture', callback_data: `get_pfp:${num}` }],
      [{ text: 'Delete Profile Picture', callback_data: `del_pfp:${num}` }],
      [{ text: 'Auto Change Profile Picture', callback_data: `auto_pfp:${num}` }],
      [{ text: 'Stop Running Auto Change', callback_data: `stop_auto:${num}` }],
      [{ text: 'Purge Session', callback_data: `purge:${num}` }],
      [{ text: 'Back', callback_data: 'paired' }],
    ]};
  },

  afterPair(num) {
    return { inline_keyboard: [
      [{ text: 'Set Profile Picture', callback_data: `set_pfp:${num}` }],
      [{ text: 'Make Session Permanent', callback_data: `perm:${num}` }],
      [{ text: 'Delete Session', callback_data: `purge:${num}` }],
      [{ text: 'Main Menu', callback_data: 'main_menu' }],
    ]};
  },

  autoMenu(num) {
    return { inline_keyboard: [
      [{ text: 'Hour Based', callback_data: `auto_hour:${num}` }],
      [{ text: 'Day Based', callback_data: `auto_day:${num}` }],
      [{ text: 'Back', callback_data: `account:${num}` }],
    ]};
  },

  groupPfpMenu() {
    return { inline_keyboard: [
      [{ text: 'Immediate Change', callback_data: 'gpfp_immediate' }],
      [{ text: 'Scheduled Daily Change', callback_data: 'gpfp_scheduled' }],
      [{ text: 'My Active Tasks', callback_data: 'gpfp_tasks' }],
      [{ text: 'Back', callback_data: 'main_menu' }],
    ]};
  },

  downloadMenu() {
    return { inline_keyboard: [
      [{ text: 'Pinterest', callback_data: 'dl_pinterest' }, { text: 'TikTok', callback_data: 'dl_tiktok' }],
      [{ text: 'Instagram', callback_data: 'dl_instagram' }, { text: 'Twitter/X', callback_data: 'dl_twitter' }],
      [{ text: 'YouTube', callback_data: 'dl_youtube' }, { text: 'Facebook', callback_data: 'dl_facebook' }],
      [{ text: 'Threads', callback_data: 'dl_threads' }, { text: 'Reddit', callback_data: 'dl_reddit' }],
      [{ text: 'Auto Detect (paste any URL)', callback_data: 'dl_auto' }],
      [{ text: 'Back', callback_data: 'main_menu' }],
    ]};
  },

  wallpaperCategories() {
    return { inline_keyboard: [
      [{ text: 'Girls', callback_data: 'wp_girls' }, { text: 'Boys', callback_data: 'wp_boys' }],
      [{ text: 'Anime', callback_data: 'wp_anime' }, { text: 'Cars', callback_data: 'wp_cars' }],
      [{ text: 'Nature', callback_data: 'wp_nature' }, { text: 'Gaming', callback_data: 'wp_gaming' }],
      [{ text: 'Aesthetic', callback_data: 'wp_aesthetic' }],
      [{ text: 'Weekend Specials', callback_data: 'wp_weekend_specials' }],
      [{ text: 'Monthly Collections', callback_data: 'wp_monthly_collections' }],
      [{ text: 'Back', callback_data: 'main_menu' }],
    ]};
  },

  pinterestBottom(q, page) {
    return { inline_keyboard: [[
      { text: 'View More', callback_data: `pi_more:${page + 1}:${q}` },
      { text: 'Main Menu', callback_data: 'main_menu' },
    ]]};
  },

  ownerPanel() {
    return { inline_keyboard: [
      [{ text: 'Restart Bot', callback_data: 'o_restart' }],
      [{ text: 'Force Join Settings', callback_data: 'o_fj' }],
      [{ text: 'Channel Management', callback_data: 'o_channels' }],
      [{ text: 'Broadcast Message', callback_data: 'o_broadcast' }],
      [{ text: 'Statistics', callback_data: 'o_stats' }],
      [{ text: 'Users', callback_data: 'o_users' }],
      [{ text: 'Owner WA Status', callback_data: 'o_wa_status' }],
      [{ text: 'Pair Owner WA', callback_data: 'o_wa_pair' }],
      [{ text: 'Main Menu', callback_data: 'main_menu' }],
    ]};
  },

  confirm(yes, no = 'main_menu') {
    return { inline_keyboard: [[
      { text: 'Confirm', callback_data: yes },
      { text: 'Cancel', callback_data: no },
    ]]};
  },

  back(to) { return { inline_keyboard: [[{ text: 'Back', callback_data: to }]] }; },
  backMain() { return { inline_keyboard: [[{ text: 'Main Menu', callback_data: 'main_menu' }]] }; },
};

module.exports = K;
