require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  PermissionFlagsBits,
  Partials,
  EmbedBuilder
} = require('discord.js');

const cron = require('node-cron');
const fs = require('fs');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction
  ]
});

// =========================
// IDS
// =========================
const ANNOUNCEMENTS_CHANNEL_ID = '1497040961539412135';
const GIFT_CODES_CHANNEL_ID = '1497355137595740292';
const ROLE_CAGE = '1497357550553665577';
const ROLE_SVS = '1497357423113928836';
const ROLE_CC = '1497357656015503401';
const ROLE_TURMOIL = '1502617893005824101';
const ROLE_SANDSEA = '1502623483186643112';

const TIMEZONE = 'Europe/London';
const KTM_COLOR = 0xff4d6d;
const COLORS = {
  svs: 0xff4d6d,
  cage: 0xffb347,
  cc: 0x57c7ff,
  turmoil: 0xff3b3b,
  sandsea: 0x3bffb6
};
const EVENT_IMAGES = {
  svs: null,
  cage: null,
  cc: null,
  turmoil: null,
  sandsea: null
};
const CONFIG_FILE = './config.json';
const CHECKINS_FILE = './checkins.json';
const giftHistory = new Set();

// =========================
// DEFAULT CONFIG
// =========================
const defaultConfig = {
  svsBattleDate: '2026-05-30',
  cageStartDate: '2026-05-05',
  crystalClashStartDate: '2026-05-10',

  turmoilStartDate: null,
  turmoilStartST: null,
  turmoilCycleDays: null,

  sandSeaStartDate: null,
  sandSeaStartST: null,
  sandSeaCycleDays: null,

  roleMessageId: null
};

let config = { ...defaultConfig };

if (fs.existsSync(CONFIG_FILE)) {
  const savedConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  config = { ...defaultConfig, ...savedConfig };
}

function saveConfig() {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

let checkins = [];

if (fs.existsSync(CHECKINS_FILE)) {
  checkins = JSON.parse(fs.readFileSync(CHECKINS_FILE, 'utf8'));
}

function saveCheckins() {
  fs.writeFileSync(CHECKINS_FILE, JSON.stringify(checkins, null, 2));
}
function ping(roleId) {
  return `<@&${roleId}>`;
}

function translationLine() {
  return `

🌍 Reply with your flag for translation 🇫🇷 🇮🇹 🇪🇸 🇬🇧`;
}

function createEventEmbed(title, description, color = COLORS.svs, imageUrl = null) {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setAuthor({
      name: 'KTM • Kings of Total Mayhem',
      iconURL: client.user.displayAvatarURL()
    })
    .setTitle(title)
    .setDescription(description)
    .addFields({
      name: '━━━━━━━━━━━━━━━',
      value: '⚔️ Kings of Total Mayhem ⚔️'
    })
    .setThumbnail(client.user.displayAvatarURL())
    .setFooter({
      text: 'KTM Assistant • Stay chaotic 😏'
    })
    .setTimestamp();

  if (imageUrl) {
    embed.setImage(imageUrl);
  }

  return embed;
}

async function sendToAnnouncements(payload, autoDeleteHours = null) {
  const channel = client.channels.cache.get(ANNOUNCEMENTS_CHANNEL_ID);

  if (!channel) {
    return console.log('❌ Announcements channel not found.');
  }

  const sentMessage = await channel.send(payload);

  if (autoDeleteHours) {
    setTimeout(() => {
      sentMessage.delete().catch(() => {});
    }, autoDeleteHours * 60 * 60 * 1000);
  }

  return sentMessage;
}

function getLondonDateString() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());

  return `${parts.find(p => p.type === 'year').value}-${parts.find(p => p.type === 'month').value}-${parts.find(p => p.type === 'day').value}`;
}

function getLondonTimeString() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(new Date());

  return `${parts.find(p => p.type === 'hour').value}:${parts.find(p => p.type === 'minute').value}`;
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);

  return Math.floor((end - start) / (1000 * 60 * 60 * 24));
}

function isCageDay(today) {
  const diff = daysBetween(config.cageStartDate, today);
  return diff >= 0 && diff % 2 === 0;
}

function isCrystalClashDay(today) {
  const diff = daysBetween(config.crystalClashStartDate, today);
  return diff >= 0 && diff % 14 === 0;
}

function isTurmoilDay(today) {
  if (!config.turmoilStartDate || !config.turmoilCycleDays) return false;

  const diff = daysBetween(config.turmoilStartDate, today);
  return diff >= 0 && diff % Number(config.turmoilCycleDays) === 0;
}

function isSandSeaDay(today) {
  if (!config.sandSeaStartDate || !config.sandSeaCycleDays) return false;

  const diff = daysBetween(config.sandSeaStartDate, today);
  return diff >= 0 && diff % Number(config.sandSeaCycleDays) === 0;
}

function stHourToUkHour(stHour) {
  return (Number(stHour) + 3) % 24;
}

function formatHour(hour) {
  return String(hour).padStart(2, '0') + ':00';
}

function subtractMinutesFromHour(hour, minutes) {
  const totalMinutes = hour * 60 - minutes;
  const normalized = (totalMinutes + 24 * 60) % (24 * 60);

  const h = Math.floor(normalized / 60);
  const m = normalized % 60;

  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function validDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

function validHour(hour) {
  return /^\d{1,2}$/.test(String(hour)) && Number(hour) >= 0 && Number(hour) <= 23;
}

function validCycle(days) {
  return /^\d+$/.test(String(days)) && Number(days) >= 1;
}

function canManage(message) {
  return message.member.permissions.has(PermissionFlagsBits.ManageGuild);
}

function leaderOnly(message) {
  if (!canManage(message)) {
    message.reply('⚠️ Leaders only 😏');
    return true;
  }

  return false;
}

const reactionRoles = {
  '⚔️': ROLE_SVS,
  '🪑': ROLE_CAGE,
  '💎': ROLE_CC,
  '🔥': ROLE_TURMOIL,
  '🏝️': ROLE_SANDSEA
};



// =========================
// BOT READY + AUTO EVENTS
// =========================
client.once('clientReady', () => {
  console.log(`
━━━━━━━━━━━━━━━━━━━━
✅ KTM BOT ONLINE
━━━━━━━━━━━━━━━━━━━━

👤 Logged in as:
${client.user.tag}

🌍 Timezone:
${TIMEZONE}

⚔️ SVS:
${config.svsBattleDate}

🪑 Cage Cycle:
${config.cageStartDate}

💎 Crystal Clash:
${config.crystalClashStartDate}

🔥 Turmoil:
${config.turmoilStartDate || 'Not set'}

🏝️ Sand & Sea:
${config.sandSeaStartDate || 'Not set'}

━━━━━━━━━━━━━━━━━━━━
`);

const startupEmbed = createEventEmbed(
  '🤖 KTM BOT ONLINE',
  `✅ Systems operational

⚔️ Event automation active
🪑 Cage tracking active
💎 Crystal Clash tracking active
🔥 Turmoil tracking active
🏝️ Sand & Sea tracking active

🕒 Timezone: ${TIMEZONE}`
);

sendToAnnouncements({
  embeds: [startupEmbed]
}, 1);

  // =========================
  // CAGE 2 — ST 11 / UK 14 — every 48h
  // =========================
  cron.schedule('55 13 * * *', () => {
    const today = getLondonDateString();

    if (!isCageDay(today)) return;

    const embed = createEventEmbed(
      `ST 11:00 / UK 14:00

⚠️ Cage 2 starts in 5 minutes

✅ Be online now
✅ Max 100k troops
✅ Use assigned setup
✅ No random joins

👑 Clean seats, clean rallies, no drama.

💬 Questions → #chat${translationLine()}`
    );

    sendToAnnouncements({
  content: ping(ROLE_CAGE),
  embeds: [embed]
}, 12);
    COLORS.cage,
    EVENT_IMAGES.cage
  }, { timezone: TIMEZONE });

  // =========================
  // CAGE 1 — ST 17 / UK 20 — every 48h
  // =========================
  cron.schedule('55 19 * * *', () => {
    const today = getLondonDateString();

    if (!isCageDay(today)) return;

    const embed = createEventEmbed(
      `ST 17:00 / UK 20:00

⚠️ Cage 1 starts in 5 minutes

✅ Be online now
✅ Max 100k troops
✅ Use assigned setup
✅ No random joins

👑 Clean seats, clean rallies, no drama.

💬 Questions → #chat${translationLine()}`
    );

    sendToAnnouncements({
      content: ping(ROLE_CAGE),
      embeds: [embed]
    }, 12);
    COLORS.cage,
    EVENT_IMAGES.cage
  }, { timezone: TIMEZONE });

  // =========================
  // SVS PREP — 03:00 UK after reset
  // =========================
  cron.schedule('0 3 * * *', () => {
    const today = getLondonDateString();

    const prep1 = addDays(config.svsBattleDate, -5);
    const prep2 = addDays(config.svsBattleDate, -4);
    const prep3 = addDays(config.svsBattleDate, -3);
    const prep4 = addDays(config.svsBattleDate, -2);
    const prep5 = addDays(config.svsBattleDate, -1);

    const messages = {
  [prep1]: {
    title: '⚔️ SVS DAY 1 — DEVELOPMENT',
    text: `⚠️ Use:
• Construction Speedups
• Research Speedups
• Hyperalloys
• Forticlad Cores
• Satellite Chips

📈 Push smart — don’t waste stacks

💬 Questions → #chat${translationLine()}`
  },

  [prep2]: {
    title: '⚔️ SVS DAY 2 — GATHERING + SHARDS',
    text: `⚠️ Focus:
• Resource Gathering
• Hero Shards
• Spin Reinforcement

📈 Save stamina for tomorrow if possible

💬 Questions → #chat${translationLine()}`
  },

  [prep3]: {
    title: '⚔️ SVS DAY 3 — STAMINA',
    text: `⚠️ Today is stamina day

Use:
• Fugitives
• Beast Rallies
• Radar efficiently

📈 Don’t waste marches

💬 Questions → #chat${translationLine()}`
  },

  [prep4]: {
    title: '⚔️ SVS DAY 4 — TRAINING',
    text: `⚠️ Focus:
• Troop Training
• Speedups
• Reserve troops if needed

📈 Big stacks today matter

💬 Questions → #chat${translationLine()}`
  },

  [prep5]: {
    title: '⚔️ SVS DAY 5 — FINAL PUSH',
    text: `⚠️ Final prep before battle

Use:
• Remaining items
• Magnets
• Coils
• Collections
• Hero Equipment Parts

📈 Empty the bags 😏

💬 Questions → #chat${translationLine()}`
  }
};

if (!messages[today]) return;

const embed = createEventEmbed(
  messages[today].title,
  messages[today].text
);

    sendToAnnouncements({
      content: ping(ROLE_SVS),
      embeds: [embed]
    });
  }, { timezone: TIMEZONE });

  // =========================
  // SVS BATTLE — 5 min warning
  // =========================
  cron.schedule('55 12 * * *', () => {
    const today = getLondonDateString();

    if (today !== config.svsBattleDate) return;

    const embed = createEventEmbed(
      '⚔️ SVS STARTING IN 5 MIN',
      `ST 10:00 / UK 13:00

⚠️ Be ready
⚠️ Follow calls

💬 Questions → #chat${translationLine()}`
    );

    sendToAnnouncements({
      content: ping(ROLE_SVS),
      embeds: [embed]
    });
  }, { timezone: TIMEZONE });

  // =========================
  // CRYSTAL CLASH — every 14 days
  // =========================
  cron.schedule('55 18 * * *', () => {
    const today = getLondonDateString();

    if (!isCrystalClashDay(today)) return;

    const embed = createEventEmbed(
      `⚠️ Crystal Clash starts soon

✅ Join rallies
✅ Follow assigned calls
✅ Max damage matters

💎 Hit smart. Move clean. Don’t donate points.

💬 Questions → #chat${translationLine()}`
    );

    sendToAnnouncements({
      content: ping(ROLE_CC),
      embeds: [embed]
    }, 24);
    COLORS.cc,
    EVENT_IMAGES.cc
  }, { timezone: TIMEZONE });

// =========================
  // TURMOIL — checks every minute
  // =========================
  cron.schedule('* * * * *', () => {
    const today = getLondonDateString();
    const now = getLondonTimeString();

    if (!isTurmoilDay(today)) return;
    if (config.turmoilStartST === null) return;

    const ukHour = stHourToUkHour(config.turmoilStartST);
    const reminder30 = subtractMinutesFromHour(ukHour, 30);
    const reminder5 = subtractMinutesFromHour(ukHour, 5);

    if (now === reminder30) {
      const embed = createEventEmbed(
        `Time: ST ${formatHour(config.turmoilStartST)} / UK ${formatHour(ukHour)}

⚠️ Turmoil starts in 30 minutes

✅ Prison tick box checked
✅ Prepare reinforcements
✅ Be online before start

🔥 Controlled chaos wins.

💬 Questions → #chat${translationLine()}`
      );

      sendToAnnouncements({
        content: ping(ROLE_TURMOIL),
        embeds: [embed]
      });
    }

    if (now === reminder5) {
      const embed = createEventEmbed(
        `Time: ST ${formatHour(config.turmoilStartST)} / UK ${formatHour(ukHour)}

⚠️ Turmoil starts in 5 minutes

✅ Prison tick box checked
✅ Reinforce correctly
✅ No freestyle

🔥 Fast reactions matter now.

💬 Questions → #chat${translationLine()}`
      );

      sendToAnnouncements({
        content: ping(ROLE_TURMOIL),
        embeds: [embed]
      }, 12);
      COLORS.turmoil,
      EVENT_IMAGES.turmoil
    }
  }, { timezone: TIMEZONE });

  // =========================
  // SAND & SEA — checks every minute
  // =========================
  cron.schedule('* * * * *', () => {
    const today = getLondonDateString();
    const now = getLondonTimeString();

    if (!isSandSeaDay(today)) return;
    if (config.sandSeaStartST === null) return;

    const ukHour = stHourToUkHour(config.sandSeaStartST);
    const reminder30 = subtractMinutesFromHour(ukHour, 30);
    const reminder5 = subtractMinutesFromHour(ukHour, 5);

    if (now === reminder30) {
      const embed = createEventEmbed(
        `Time: ST ${formatHour(config.sandSeaStartST)} / UK ${formatHour(ukHour)}

⚠️ Sand & Sea starts in 30 minutes

✅ Prepare your teams
✅ Conquer the ships
✅ Be online before start
✅ Set marches early

🏝️ Clean coordination wins maps.

💬 Questions → #chat${translationLine()}`
      );

      sendToAnnouncements({
        content: ping(ROLE_SANDSEA),
        embeds: [embed]
      });
    }

    if (now === reminder5) {
      const embed = createEventEmbed(
        `Time: ST ${formatHour(config.sandSeaStartST)} / UK ${formatHour(ukHour)}

⚠️ Sand & Sea starts in 5 minutes

✅ Join immediately
✅ No random movement
✅ Watch alliance calls

🏝️ Stay coordinated and move together.

💬 Questions → #chat${translationLine()}`
      );

      sendToAnnouncements({
        content: ping(ROLE_SANDSEA),
        embeds: [embed]
      }, 12);
      COLORS.sandsea
      EVENT_IMAGES.sandsea
    }
  }, { timezone: TIMEZONE });

});

// =========================
// REACTION ROLE ADD
// =========================
client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;

  if (reaction.partial) await reaction.fetch();
  if (reaction.message.id !== config.roleMessageId) return;

  const roleId = reactionRoles[reaction.emoji.name];
  if (!roleId) return;

  const member = await reaction.message.guild.members.fetch(user.id);
  await member.roles.add(roleId);
});

// =========================
// REACTION ROLE REMOVE
// =========================
client.on('messageReactionRemove', async (reaction, user) => {
  if (user.bot) return;

  if (reaction.partial) await reaction.fetch();
  if (reaction.message.id !== config.roleMessageId) return;

  const roleId = reactionRoles[reaction.emoji.name];
  if (!roleId) return;

  const member = await reaction.message.guild.members.fetch(user.id);
  await member.roles.remove(roleId);
});

// =========================
// COMMANDS
// =========================
client.on('messageCreate', async message => {
  if (message.author.bot) return;

  const content = message.content.trim();

  // ROLE SETUP
  if (content === '!rolesetup') {
    if (!canManage(message)) {
      return message.reply('Only leaders can set this up 😏');
    }

    const roleMessage = await message.channel.send(`🎭 **PICK YOUR PINGS**

React below to choose what notifications you want:

⚔️ SVS
🪑 Cage
💎 Crystal Clash
🔥 Turmoil
🏝️ Sand & Sea

Click again to remove a role.

🌍 Reply with your flag for translation 🇫🇷 🇮🇹 🇪🇸 🇬🇧`);

    await roleMessage.react('⚔️');
    await roleMessage.react('🪑');
    await roleMessage.react('💎');
    await roleMessage.react('🔥');
    await roleMessage.react('🏝️');

    config.roleMessageId = roleMessage.id;
    saveConfig();

    return message.reply('✅ Reaction roles are ready');
  }

  // PING
if (content === '!ping') {
  return message.reply(`🏓 Pong! ${client.ws.ping}ms`);
}

// TEST REMINDERS
if (content === '!testreminders') {
  if (leaderOnly(message)) return;

  await message.reply('🧪 Sending test reminders...');

  sendToAnnouncements({
    content: ping(ROLE_CAGE),
    embeds: [createEventEmbed(
      '🪑 TEST — CAGE REMINDER',
      'This is a test cage reminder.',
      COLORS.cage
    )]
  });

  sendToAnnouncements({
    content: ping(ROLE_SVS),
    embeds: [createEventEmbed(
      '⚔️ TEST — SVS REMINDER',
      'This is a test SVS reminder.',
      COLORS.svs
    )]
  });

  return;
}

// NEXT EVENT
if (content === '!next') {
  const today = getLondonDateString();

  let nextEvent = 'No upcoming events found.';
  let eventDate = null;

  if (config.svsBattleDate >= today) {
    nextEvent = '⚔️ SVS Battle';
    eventDate = config.svsBattleDate;
  }

  if (
    config.turmoilStartDate &&
    config.turmoilStartDate >= today &&
    (!eventDate || config.turmoilStartDate < eventDate)
  ) {
    nextEvent = '🔥 Turmoil';
    eventDate = config.turmoilStartDate;
  }

  if (
    config.sandSeaStartDate &&
    config.sandSeaStartDate >= today &&
    (!eventDate || config.sandSeaStartDate < eventDate)
  ) {
    nextEvent = '🏝️ Sand & Sea';
    eventDate = config.sandSeaStartDate;
  }

  const embed = createEventEmbed(
    '📅 NEXT MAJOR EVENT',
    eventDate
      ? `Next event:
      
${nextEvent}

📆 ${eventDate}`
      : 'No future events configured yet.'
  );

  return message.reply({ embeds: [embed] });
}

// SCHEDULE
if (content === '!schedule') {
  const embed = createEventEmbed(
    '📅 KTM EVENT SCHEDULE',
    `⚔️ **SVS Battle**
${config.svsBattleDate}

🪑 **Cage**
Every 48h
Cage 2 → ST 11 / UK 14
Cage 1 → ST 17 / UK 20

💎 **Crystal Clash**
Every 14 days
Start date:
${config.crystalClashStartDate}

🔥 **Turmoil**
Date:
${config.turmoilStartDate || 'Not set'}

Time:
${config.turmoilStartST !== null
  ? `ST ${formatHour(config.turmoilStartST)} / UK ${formatHour(stHourToUkHour(config.turmoilStartST))}`
  : 'Not set'}

Cycle:
${config.turmoilCycleDays
  ? `Every ${config.turmoilCycleDays} days`
  : 'Not set'}

🏝️ **Sand & Sea**
Date:
${config.sandSeaStartDate || 'Not set'}

Time:
${config.sandSeaStartST !== null
  ? `ST ${formatHour(config.sandSeaStartST)} / UK ${formatHour(stHourToUkHour(config.sandSeaStartST))}`
  : 'Not set'}

Cycle:
${config.sandSeaCycleDays
  ? `Every ${config.sandSeaCycleDays} days`
  : 'Not set'}`
  );

  return message.reply({ embeds: [embed] });
}

// RULES
if (content === '!rules') {
  const embed = createEventEmbed(
    '📜 KTM RULES',
    `⚔️ Respect alliance calls
⚔️ Follow event instructions
⚔️ No random rallies during organised events
⚔️ Use correct formations when requested
⚔️ Stay active or communicate absences
⚔️ Keep chat civil — chaos is fine, drama is not 😏

🔥 Important:
If leadership posts it in announcements, it matters.

🌍 International alliance:
Use translation flags when needed 🇫🇷 🇮🇹 🇪🇸 🇬🇧`
  );

  return message.reply({ embeds: [embed] });
}

// CHECK-IN
if (content.startsWith('!checkin')) {
  const today = getLondonDateString();
  const eventName = content.replace('!checkin', '').trim() || 'general';

const alreadyCheckedIn = checkins.some(
  entry =>
    entry.userId === message.author.id &&
    entry.date === today
);

if (alreadyCheckedIn) {
  return message.reply('⚠️ You already checked in today.');
}
  const entry = {
    userId: message.author.id,
    username: message.author.username,
    event: eventName,
    channelId: message.channel.id,
    date: getLondonDateString(),
    time: getLondonTimeString()
  };

  checkins.push(entry);
  saveCheckins();

  const embed = createEventEmbed(
    '✅ EVENT CHECK-IN',
    `${message.author} checked in for:

⚔️ ${eventName.toUpperCase()}

📅 ${entry.date}
🕒 ${entry.time}

⚔️ Participation recorded.`
  );

  return message.channel.send({ embeds: [embed] });
}

// CLEAR CHECKINS
if (content === '!clearcheckins') {
  if (leaderOnly(message)) return;

  checkins = [];
  saveCheckins();

  return message.reply('🧹 Check-in history cleared.');
}

  // HELP
if (content === '!help') {
  const embed = createEventEmbed(
    '📌 KTM BOT COMMANDS',
    `**General**
\`!help\` — show this menu
\`!status\` — show saved event settings
\`!rolesetup\` — create reaction role message
\`!ping\` — check if bot is alive
\`!next\` — show next major saved event
\`!testreminders\` — send test reminder embeds
\`!schedule\` — show alliance event schedule
\`!rules\` — show alliance rules
\`!checkin\` — event participation check-in
\`!clearcheckins\` — clear all check-in records

**Leader Broadcasts**
\`!announce text\`
\`!gift CODE\`
\`!svs text\`
\`!cc text\`
\`!cage1\`
\`!cage2\`
\`!turmoil text\`
\`!sandsea text\`

**Event Settings**
\`!setsvs YYYY-MM-DD\`
\`!setcage YYYY-MM-DD\`
\`!setcc YYYY-MM-DD\`

**Turmoil**
\`!setturmoil YYYY-MM-DD\`
\`!setturmoiltime ST_HOUR\`
\`!setturmoilcycle DAYS\`

**Sand & Sea**
\`!setsandsea YYYY-MM-DD\`
\`!setsandseatime ST_HOUR\`
\`!setsandseacycle DAYS\`

⚔️ KTM Assistant — chaos, but organised.`
  );

  return message.reply({ embeds: [embed] });
}

  // SET SVS
  if (content.startsWith('!setsvs')) {
    if (!canManage(message)) return message.reply('Only leaders can change SVS date 😏');

    const date = content.replace('!setsvs', '').trim();

    if (!validDate(date)) {
      return message.reply('Use this format: `!setsvs 2026-05-30`');
    }

    config.svsBattleDate = date;
    saveConfig();

    return message.reply(`✅ SVS date updated to **${date}**`);
  }

  // SET CAGE
  if (content.startsWith('!setcage')) {
    if (!canManage(message)) return message.reply('Only leaders can change cage cycle 😏');

    const date = content.replace('!setcage', '').trim();

    if (!validDate(date)) {
      return message.reply('Use this format: `!setcage 2026-05-05`');
    }

    config.cageStartDate = date;
    saveConfig();

    return message.reply(`✅ Cage cycle updated to **${date}**`);
  }

  // SET CRYSTAL CLASH
  if (content.startsWith('!setcc')) {
    if (!canManage(message)) return message.reply('Only leaders can change Crystal Clash 😏');

    const date = content.replace('!setcc', '').trim();

    if (!validDate(date)) {
      return message.reply('Use this format: `!setcc 2026-05-10`');
    }

    config.crystalClashStartDate = date;
    saveConfig();

    return message.reply(`✅ Crystal Clash updated to **${date}**`);
  }

  // SET TURMOIL DATE
  if (content.startsWith('!setturmoil ')) {
    if (!canManage(message)) return message.reply('Only leaders can change Turmoil 😏');

    const date = content.replace('!setturmoil', '').trim();

    if (!validDate(date)) {
      return message.reply('Use this format: `!setturmoil 2026-05-12`');
    }

    config.turmoilStartDate = date;
    saveConfig();

    return message.reply(`✅ Turmoil start date updated to **${date}**`);
  }

  // SET TURMOIL TIME
  if (content.startsWith('!setturmoiltime')) {
    if (!canManage(message)) return message.reply('Only leaders can change Turmoil time 😏');

    const stHour = content.replace('!setturmoiltime', '').trim();

    if (!validHour(stHour)) {
      return message.reply('Use ST hour only. Example: `!setturmoiltime 18`');
    }

    config.turmoilStartST = Number(stHour);
    saveConfig();

    const ukHour = stHourToUkHour(config.turmoilStartST);

    return message.reply(`✅ Turmoil time updated:

ST ${formatHour(config.turmoilStartST)}
UK ${formatHour(ukHour)}`);
  }

  // SET TURMOIL CYCLE
  if (content.startsWith('!setturmoilcycle')) {
    if (!canManage(message)) return message.reply('Only leaders can change Turmoil cycle 😏');

    const cycle = content.replace('!setturmoilcycle', '').trim();

    if (!validCycle(cycle)) {
      return message.reply('Use number of days. Example: `!setturmoilcycle 7`');
    }

    config.turmoilCycleDays = Number(cycle);
    saveConfig();

    return message.reply(`✅ Turmoil repeats every **${cycle} days**`);
  }

  // SET SAND & SEA DATE
  if (content.startsWith('!setsandsea ')) {
    if (!canManage(message)) return message.reply('Only leaders can change Sand & Sea 😏');

    const date = content.replace('!setsandsea', '').trim();

    if (!validDate(date)) {
      return message.reply('Use this format: `!setsandsea 2026-05-12`');
    }

    config.sandSeaStartDate = date;
    saveConfig();

    return message.reply(`✅ Sand & Sea start date updated to **${date}**`);
  }

  // SET SAND & SEA TIME
  if (content.startsWith('!setsandseatime')) {
    if (!canManage(message)) return message.reply('Only leaders can change Sand & Sea time 😏');

    const stHour = content.replace('!setsandseatime', '').trim();

    if (!validHour(stHour)) {
      return message.reply('Use ST hour only. Example: `!setsandseatime 18`');
    }

    config.sandSeaStartST = Number(stHour);
    saveConfig();

    const ukHour = stHourToUkHour(config.sandSeaStartST);

    return message.reply(`✅ Sand & Sea time updated:

ST ${formatHour(config.sandSeaStartST)}
UK ${formatHour(ukHour)}`);
  }

  // SET SAND & SEA CYCLE
  if (content.startsWith('!setsandseacycle')) {
    if (!canManage(message)) return message.reply('Only leaders can change Sand & Sea cycle 😏');

    const cycle = content.replace('!setsandseacycle', '').trim();

    if (!validCycle(cycle)) {
      return message.reply('Use number of days. Example: `!setsandseacycle 7`');
    }

    config.sandSeaCycleDays = Number(cycle);
    saveConfig();

    return message.reply(`✅ Sand & Sea repeats every **${cycle} days**`);
  }

  // STATUS
if (content === '!status') {
  const embed = createEventEmbed(
    '📊 KTM BOT STATUS',
    `**SVS Battle Date**
${config.svsBattleDate}

**Cage Start Date**
${config.cageStartDate}

**Crystal Clash Start Date**
${config.crystalClashStartDate}

**Turmoil**
Date: ${config.turmoilStartDate || 'Not set'}
Time: ${config.turmoilStartST !== null ? `ST ${formatHour(config.turmoilStartST)} / UK ${formatHour(stHourToUkHour(config.turmoilStartST))}` : 'Not set'}
Cycle: ${config.turmoilCycleDays ? `Every ${config.turmoilCycleDays} days` : 'Not set'}

**Sand & Sea**
Date: ${config.sandSeaStartDate || 'Not set'}
Time: ${config.sandSeaStartST !== null ? `ST ${formatHour(config.sandSeaStartST)} / UK ${formatHour(stHourToUkHour(config.sandSeaStartST))}` : 'Not set'}
Cycle: ${config.sandSeaCycleDays ? `Every ${config.sandSeaCycleDays} days` : 'Not set'}

**Reaction Role Message**
${config.roleMessageId || 'Not set'}`
  );

  return message.reply({ embeds: [embed] });
}

  // ANNOUNCEMENT
if (content.startsWith('!announce')) {
  const text = content.replace('!announce', '').trim();

  if (!text) return message.reply('Give me something to announce 😏');

  const embed = createEventEmbed(
    '📢 ANNOUNCEMENT',
    `${text}

⚠️ If it’s posted here → it matters`
  );

  sendToAnnouncements({ embeds: [embed] });

  if (message.channel.id !== ANNOUNCEMENTS_CHANNEL_ID) {
    return message.reply('✅ Announcement posted in #announcements');
  }

  return;
}

  // CAGE 1
  if (content.startsWith('!cage1')) {
    const embed = createEventEmbed(
      '🪑 CAGE 1',
      `Time: ST 17:00 / UK 20:00

⚠️ Be ready before start
⚠️ Follow hero setup
⚠️ Do NOT exceed 100k troops
⚠️ No random joins

💬 Questions → #chat${translationLine()}`
    );

    return message.channel.send({
      content: ping(ROLE_CAGE),
      embeds: [embed]
    });
  }

  // CAGE 2
  if (content.startsWith('!cage2')) {
    const embed = createEventEmbed(
      '🪑 CAGE 2',
      `Time: ST 11:00 / UK 14:00

⚠️ Be ready before start
⚠️ Follow hero setup
⚠️ Do NOT exceed 100k troops
⚠️ No random joins

💬 Questions → #chat${translationLine()}`
    );

    return message.channel.send({
      content: ping(ROLE_CAGE),
      embeds: [embed]
    });
  }

  // SVS
  if (content.startsWith('!svs')) {
    if (leaderOnly(message)) return;
    const text = content.replace('!svs', '').trim();

    const embed = createEventEmbed(
      '⚔️ SVS UPDATE',
      `${text || 'Follow daily tasks and use items only on the correct day.'}

⚠️ Wrong day = wasted points
⚠️ Check before using big stacks

💬 Questions → #chat${translationLine()}`
    );

    const svsChannel = client.channels.cache.get(SVS_CHANNEL_ID);

if (!svsChannel) {
  return message.reply('❌ SVS channel not found.');
}

await svsChannel.send({
  content: ping(ROLE_SVS),
  embeds: [embed]
});

if (message.channel.id !== SVS_CHANNEL_ID) {
  return message.reply('✅ SVS update posted in #svs');
}

return;
  }

  // CRYSTAL CLASH
  if (content.startsWith('!cc')) {
    if (leaderOnly(message)) return;
    const text = content.replace('!cc', '').trim();

    const embed = createEventEmbed(
      '💎 CRYSTAL CLASH',
      `${text || 'Follow pinned setup.'}

⚠️ No freestyle
⚠️ Max damage matters

💬 Questions → #chat${translationLine()}`
    );

    const ccChannel = client.channels.cache.get(CC_CHANNEL_ID);

if (!ccChannel) {
  return message.reply('❌ Crystal Clash channel not found.');
}

await ccChannel.send({
  content: ping(ROLE_CC),
  embeds: [embed]
});

if (message.channel.id !== CC_CHANNEL_ID) {
  return message.reply('✅ Crystal Clash update posted in #crystal-clash');
}

return;
  }

  // TURMOIL
  if (content.startsWith('!turmoil')) {
    if (leaderOnly(message)) return;
    const text = content.replace('!turmoil', '').trim();

    const embed = createEventEmbed(
      '🔥 TURMOIL',
      `${text || 'Prepare properly.'}

⚠️ Prison tick box
⚠️ Reinforce correctly
⚠️ Follow rally instructions

💬 Questions → #chat${translationLine()}`
    );

    const turmoilChannel = client.channels.cache.get(ANNOUNCEMENTS_CHANNEL_ID);

if (!turmoilChannel) {
  return message.reply('❌ Announcements channel not found.');
}

await turmoilChannel.send({
  content: ping(ROLE_TURMOIL),
  embeds: [embed]
});

if (message.channel.id !== ANNOUNCEMENTS_CHANNEL_ID) {
  return message.reply('✅ Turmoil update posted in #announcements');
}

return;
  }

  // SAND & SEA
  if (content.startsWith('!sandsea')) {
    if (leaderOnly(message)) return;
    const text = content.replace('!sandsea', '').trim();

    const embed = createEventEmbed(
      '🏝️ SAND & SEA',
      `${text || 'Prepare your teams and follow instructions.'}

⚠️ Follow lane assignments
⚠️ Join on time
⚠️ No random movement

💬 Questions → #chat${translationLine()}`
    );

    const sandSeaChannel = client.channels.cache.get(ANNOUNCEMENTS_CHANNEL_ID);

if (!sandSeaChannel) {
  return message.reply('❌ Announcements channel not found.');
}

await sandSeaChannel.send({
  content: ping(ROLE_SANDSEA),
  embeds: [embed]
});

if (message.channel.id !== ANNOUNCEMENTS_CHANNEL_ID) {
  return message.reply('✅ Sand & Sea update posted in #announcements');
}

return;
  }

  // GIFT CODES
if (content.startsWith('!gift')) {
  if (leaderOnly(message)) return;
  const code = content.replace('!gift', '').trim();

  if (!code) {
    return message.reply('Give me the code 😏 Example: `!gift HappyMay1st`');
  }

  const normalizedCode = code.toLowerCase();

  if (giftHistory.has(normalizedCode)) {
    return message.reply('⚠️ That gift code was already posted.');
  }

  giftHistory.add(normalizedCode);

  const embed = createEventEmbed(
    '🎁 NEW GIFT CODE',
    `## ${code}

⏳ Use fast — gift codes expire quickly

🎯 Redeem in-game:
Profile → Settings → Gift Code

💬 Questions → #chat`
  );

  const giftChannel = client.channels.cache.get(GIFT_CODES_CHANNEL_ID);

if (!giftChannel) {
  return message.reply('❌ Gift codes channel not found. Check the channel ID.');
}

const sentMessage = await giftChannel.send({
  content: '🎁 New KTM gift code dropped!',
  embeds: [embed]
});

if (message.channel.id !== GIFT_CODES_CHANNEL_ID) {
  message.reply('✅ Gift code posted in #gift-codes');
}

  // Optional auto delete after 24h
  setTimeout(() => {
    sentMessage.delete().catch(() => {});
  }, 24 * 60 * 60 * 1000);
}
});

process.on('unhandledRejection', error => {
  console.error('❌ Unhandled promise rejection:', error);
});

process.on('uncaughtException', error => {
  console.error('❌ Uncaught exception:', error);
});

client.login(process.env.DISCORD_TOKEN);
