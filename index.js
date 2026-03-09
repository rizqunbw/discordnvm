require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Collection, Events, ActivityType } = require('discord.js');
const Groq = require('groq-sdk');
const fs = require('fs');
const path = require('path');
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// Vercel Serverless Handler
// ============================================================
app.get('/', (req, res) => {
  res.send('Bot is alive! 🤖 Vercel Serverless running.');
});

// Export Express app untuk Vercel
module.exports = app;

// ============================================================
// Groq AI Setup
// ============================================================
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Simpan history percakapan per user (biar bot ingat konteks)
const conversationHistory = new Map();
const MAX_HISTORY = 10; // Maksimal berapa pesan yang diingat per user

// System prompt — ubah sesuai karakter bot kamu!
const SYSTEM_PROMPT = `Kamu adalah OA (Official Account) bot Discord asisten untuk server RF Online bernama "RF Nvm".

ATURAN MENJAWAB BERDASARKAN KONDISI (BACA BAIK-BAIK):

KONDISI 1: JIKA USER HANYA MENYAPA ("halo", "hi", "bang", "kak", "min", dsb)
- (Bahasa Indonesia): "Halo! Ada yang bisa dibantu kak?"
- (Bahasa Inggris): "Hi there! How can I help you today?"

KONDISI 2: JIKA USER BERTANYA SERVER RATE, DROP RATE, ATAU INFO SERVER UMUM
- Selalu arahkan pengguna untuk mengecek informasi lengkap di website resmi.
- (Bahasa Indonesia): "Untuk informasi lengkap mengenai server rate, drop, fitur, dan info mendetail lainnya, kamu bisa langsung cek di website resmi kita ya: https://rfnvm.com/ 🎮"
- (Bahasa Inggris): "For complete information regarding server rates, drops, features, and other detailed info, please check our official website: https://rfnvm.com/ 🎮"

KONDISI 3: JIKA USER BERTANYA TENTANG DONASI ATAU DONATE (PENTING: DETEKSI BAHASA USER!)
- JIKA USER BERTANYA DALAM BAHASA INDONESIA:
  Jawab dengan rapi: "Halo! Kamu bisa langsung melakukan donasi melalui Control Panel kita di https://gcp.rfnvm.com/. Silakan login ke sana, kemudian pilih menu **Topup > Donation**. Pilih nominal yang kamu inginkan, lalu lakukan pembayaran menggunakan QRIS. Setelah pembayaran berhasil, donasi kamu akan masuk secara otomatis! ✨"
- JIKA USER BERTANYA DALAM BAHASA INGGRIS:
  Jawab dengan tegas: "Hello! You can donate to our server via TransferWise, Remitly or Crypto via Binance!. Please directly contact <@1271431821690802221> for international donation details. Thank you! 💸"

KONDISI 4: JIKA USER BERTANYA HAL LAIN (Error game, akun hilang, reset password, masalah bug, dll yang tidak ada di Kondisi 1-3)
- Jangan pernah mengarang jawaban. Harus Lempar ke Admin (Orang tulen).
- (Bahasa Indonesia): "Halo, maaf ya saya tidak bisa membantu untuk itu. Silahkan langsung menghubungi Official Account Resmi yang dikelola oleh orang asli (bukan AI) dengan memanggil <@1271431821690802221>, karena saya hanya bot AI asisten yang sedang tahap belajar. Terima kasih!"
- (Bahasa Inggris): "Hi! I'm sorry but I can't help with that. Please contact the real human Official Account directly by mentioning <@1271431821690802221>. Thank you!"`;


async function getAIReply(userId, userMessage) {
  // Ambil atau buat history untuk user ini
  if (!conversationHistory.has(userId)) {
    conversationHistory.set(userId, []);
  }
  const history = conversationHistory.get(userId);

  // Tambahkan pesan user ke history
  history.push({ role: 'user', content: userMessage });

  // Batasi history biar tidak terlalu panjang
  if (history.length > MAX_HISTORY * 2) {
    history.splice(0, 2);
  }

  try {
    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...history,
      ],
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      max_tokens: 500,
      temperature: 0.7,
    });

    const reply = completion.choices[0]?.message?.content || 'Maaf, gw lagi bingung nih 😅';

    // Simpan reply bot ke history
    history.push({ role: 'assistant', content: reply });
    conversationHistory.set(userId, history);

    return reply;
  } catch (error) {
    console.error('[Groq Error]', error.message);
    if (error.status === 429) {
      return '⏳ Lagi banyak yang chat nih, coba lagi bentar ya!';
    }
    return '❌ Maaf, AI-nya lagi error. Coba lagi nanti!';
  }
}

// ============================================================
// Discord Client Setup
// ============================================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [
    Partials.Channel,  // wajib untuk bisa nerima DM
    Partials.Message,  // wajib untuk bisa proses pesan DM
  ],
});

// Koleksi command
client.commands = new Collection();

// Channel ID yang boleh AI reply (kosongkan biar reply di semua channel)
const AI_CHANNEL_ID = process.env.AI_CHANNEL_ID || null;

// ============================================================
// Load Commands dari folder /commands
// ============================================================
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
  const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
  for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));
    if (command.data && command.execute) {
      client.commands.set(command.data.name, command);
      console.log(`[Commands] Loaded: /${command.data.name}`);
    }
  }
}

// ============================================================
// Event: Bot siap
// ============================================================
client.once(Events.ClientReady, (readyClient) => {
  console.log(`✅ Bot online sebagai: ${readyClient.user.tag}`);
  console.log(`📡 Terhubung ke ${readyClient.guilds.cache.size} server`);
  console.log(`🤖 Groq AI: ${process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'}`);

  client.user.setPresence({
    activities: [{
      name: 'Custom Status',
      type: ActivityType.Custom,
      state: 'rfnvm.com',
    }],
    status: 'online',
  });
});

// ============================================================
// Event: Slash Command Interactions
// ============================================================
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`[Error] Slash command /${interaction.commandName}:`, error);
    const errMsg = { content: '❌ Terjadi error saat menjalankan command!', ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errMsg);
    } else {
      await interaction.reply(errMsg);
    }
  }
});

// ============================================================
// Event: Prefix Commands + AI Auto-Reply
// ============================================================
const PREFIX = process.env.PREFIX || '!';
// Cooldown per user (ms) — biar tidak spam AI
const AI_COOLDOWN = parseInt(process.env.AI_COOLDOWN_MS) || 3000;
const cooldowns = new Map();

client.on(Events.MessageCreate, async (message) => {
  // Ignore bot messages
  if (message.author.bot) return;

  // ——— Prefix Commands ———
  if (message.content.startsWith(PREFIX)) {
    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    if (commandName === 'ping') {
      const latency = Date.now() - message.createdTimestamp;
      return message.reply(`🏓 Pong! Latency: **${latency}ms** | API: **${client.ws.ping}ms**`);
    }

    if (commandName === 'help') {
      const embed = {
        color: 0x5865F2,
        title: '📖 Daftar Command',
        description: `**Prefix:** \`${PREFIX}\`\n\n💡 **Kamu juga bisa ngobrol langsung dengan AI** — mention bot atau chat di channel yang ditentukan!`,
        fields: [
          { name: '🔧 Utility', value: '`!ping` — Cek latency\n`!help` — Tampilkan ini\n`!info` — Info server\n`!reset` — Reset history chat AI', inline: false },
          { name: '🎮 Fun', value: '`!8ball <pertanyaan>` — Tanya bola ajaib\n`!roll` — Roll dadu 1-100', inline: false },
          { name: '🤖 AI Chat', value: 'Mention bot atau chat di channel AI untuk ngobrol dengan Groq AI!', inline: false },
        ],
        footer: { text: 'Powered by Discord.js + Groq AI 🔥' },
        timestamp: new Date().toISOString(),
      };
      return message.reply({ embeds: [embed] });
    }

    if (commandName === 'info') {
      const guild = message.guild;
      if (!guild) return;
      const embed = {
        color: 0x57F287,
        title: `📊 Info Server: ${guild.name}`,
        thumbnail: { url: guild.iconURL() || '' },
        fields: [
          { name: '👥 Member', value: `${guild.memberCount}`, inline: true },
          { name: '📅 Dibuat', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true },
          { name: '🤖 Latency', value: `${client.ws.ping}ms`, inline: true },
        ],
        timestamp: new Date().toISOString(),
      };
      return message.reply({ embeds: [embed] });
    }

    if (commandName === '8ball') {
      const question = args.join(' ');
      if (!question) return message.reply('❓ Tulis pertanyaannya dulu! Contoh: `!8ball Apakah hari ini lucky?`');
      const answers = [
        '✅ Ya, pasti!', '✅ Sangat mungkin.', '✅ Tentu saja!',
        '🤔 Mungkin iya.', '🤔 Tidak pasti.', '🤔 Tanyakan lagi nanti.',
        '❌ Sepertinya tidak.', '❌ Tidak mungkin.', '❌ Jangan harap!',
      ];
      return message.reply(`🎱 **Pertanyaan:** ${question}\n**Jawaban:** ${answers[Math.floor(Math.random() * answers.length)]}`);
    }

    if (commandName === 'roll') {
      return message.reply(`� Kamu dapat angka: **${Math.floor(Math.random() * 100) + 1}** / 100`);
    }

    if (commandName === 'reset') {
      conversationHistory.delete(message.author.id);
      return message.reply('🔄 History chat AI kamu sudah direset! Kita mulai dari awal ya.');
    }

    return; // Command tidak dikenal, abaikan
  }

  // ——— AI Auto-Reply Logic ———
  const isMentioned = message.mentions.has(client.user);
  const isInAIChannel = AI_CHANNEL_ID ? message.channelId === AI_CHANNEL_ID : false;
  const isDM = message.channel.type === 1; // DM channel

  // Bot reply kalau: di-mention, di DM, atau di channel AI yang ditentukan
  if (!isMentioned && !isInAIChannel && !isDM) return;

  // Cek cooldown
  const userId = message.author.id;
  const now = Date.now();
  if (cooldowns.has(userId)) {
    const timeLeft = AI_COOLDOWN - (now - cooldowns.get(userId));
    if (timeLeft > 0) {
      return message.react('⏳');
    }
  }
  cooldowns.set(userId, now);

  // Bersihkan mention dari pesan
  const userText = message.content
    .replace(/<@!?[0-9]+>/g, '')
    .trim();

  if (!userText) {
    return message.reply('Halo! Ada yang bisa gw bantu? 😊');
  }

  // Tampilkan "typing..." biar keliatan natural
  await message.channel.sendTyping();

  try {
    const aiReply = await getAIReply(userId, userText);

    // Potong reply kalau terlalu panjang (Discord max 2000 chars)
    const chunks = aiReply.match(/.{1,1900}/gs) || [aiReply];

    await message.reply(chunks[0]);

    // Kalau ada lebih dari 1 chunk, kirim sebagai follow-up
    for (let i = 1; i < chunks.length; i++) {
      await message.channel.send(chunks[i]);
    }
  } catch (error) {
    console.error('[AI Reply Error]', error);
    await message.reply('❌ Ups, ada yang error. Coba lagi ya!');
  }
});

// ============================================================
// Error handling biar bot tidak crash
// ============================================================
process.on('unhandledRejection', (error) => {
  console.error('[UnhandledRejection]', error);
});

process.on('uncaughtException', (error) => {
  console.error('[UncaughtException]', error);
});

// ============================================================
// Login Bot
// ============================================================
if (!process.env.DISCORD_TOKEN) {
  console.error('❌ DISCORD_TOKEN tidak ditemukan di .env!');
  process.exit(1);
}
if (!process.env.GROQ_API_KEY) {
  console.warn('⚠️  GROQ_API_KEY tidak ditemukan — fitur AI dinonaktifkan!');
}

client.login(process.env.DISCORD_TOKEN);
