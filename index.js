const { Client, GatewayIntentBits, Events } = require('discord.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const token = process.env.DISCORD_TOKEN;

console.log("DISCORD_TOKEN vorhanden:", !!token);

if (!token) {
  console.log("Kein DISCORD_TOKEN gefunden!");
  process.exit(1);
}

client.once(Events.ClientReady, readyClient => {
  console.log(`Eingeloggt als ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'ping') {
    await interaction.reply({ content: 'Pong!' });
  }
});

client.login(token);
