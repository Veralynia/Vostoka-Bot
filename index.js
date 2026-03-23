const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

const token = process.env.DISCORD_TOKEN;

if (!token) {
    console.log("Kein DISCORD_TOKEN gefunden!");
    process.exit(1);
}

client.once('ready', () => {
    console.log(`Eingeloggt als ${client.user.tag}`);
});

client.login(token);
