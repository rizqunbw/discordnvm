const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('🏓 Cek latency bot'),

  async execute(interaction) {
    const sent = await interaction.reply({ content: '🏓 Mengukur latency...', fetchReply: true });
    const latency = sent.createdTimestamp - interaction.createdTimestamp;

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🏓 Pong!')
      .addFields(
        { name: '⚡ Bot Latency', value: `\`${latency}ms\``, inline: true },
        { name: '💙 API Latency', value: `\`${interaction.client.ws.ping}ms\``, inline: true },
      )
      .setTimestamp();

    await interaction.editReply({ content: '', embeds: [embed] });
  },
};
