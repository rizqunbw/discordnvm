require('dotenv').config();
const { REST, Routes } = require('@discordjs/rest');
const { ApplicationCommandOptionType } = require('discord-api-types/v10');
const fs = require('fs');
const path = require('path');

const commands = [];

// Load semua slash command dari folder /commands
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
  const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
  for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));
    if (command.data) commands.push(command.data);
  }
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`📤 Registering ${commands.length} slash command(s)...`);

    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );

    console.log('✅ Slash commands berhasil di-register!');
  } catch (error) {
    console.error('❌ Error registering commands:', error);
  }
})();
