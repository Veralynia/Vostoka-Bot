const {
  Client,
  GatewayIntentBits,
  Partials,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionsBitField,
  Events
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.GuildMember]
});

const TOKEN = "MTQ4Mzc0NzEyODcwMTYyMDMyNQ.G3SoGQ.Jm9BzrTpogyf3ot49IzZNONYLcV-K31R2leszs";
const CLIENT_ID = "1483747128701620325";
const GUILD_ID = "1416200773641044202";

// 👉 Rollen die nutzen dürfen
const ALLOWED_ROLES = ["Leaderschaft", "Glaz"];

// 👉 Speicher für Meetings
let meetings = {};


// ==========================
// COMMAND REGISTRIEREN
// ==========================
client.once('ready', async () => {
  console.log(`✅ Eingeloggt als ${client.user.tag}`);

  const command = new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Meeting Panel öffnen')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator);

  await client.application.commands.set([command], GUILD_ID);
});


// ==========================
// PANEL COMMAND
// ==========================
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'panel') {

    const hasRole = interaction.member.roles.cache.some(role =>
      ALLOWED_ROLES.includes(role.name)
    );

    if (!hasRole) {
      return interaction.reply({
        content: "❌ Keine Berechtigung",
        ephemeral: true
      });
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('create_meeting')
        .setLabel('📅 Meeting erstellen')
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId('show_votes')
        .setLabel('📊 Abstimmungen anzeigen')
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({
      content: "📌 **Meeting Panel**",
      components: [row]
    });
  }
});


// ==========================
// BUTTON HANDLING
// ==========================
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isButton()) return;

  // ======================
  // MEETING ERSTELLEN
  // ======================
  if (interaction.customId === 'create_meeting') {

    const meetingId = Date.now();

    meetings[meetingId] = {
      yes: [],
      no: []
    };

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`yes_${meetingId}`)
        .setLabel('✅ Zusagen')
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(`no_${meetingId}`)
        .setLabel('❌ Absagen')
        .setStyle(ButtonStyle.Danger)
    );

    const embed = new EmbedBuilder()
      .setTitle("📅 Neues Meeting")
      .setDescription("Stimme jetzt ab!");

    await interaction.reply({
      embeds: [embed],
      components: [row]
    });
  }


  // ======================
  // ABSTIMMUNG
  // ======================
  if (interaction.customId.startsWith('yes_') || interaction.customId.startsWith('no_')) {

    const [type, id] = interaction.customId.split('_');
    const meeting = meetings[id];

    if (!meeting) return;

    const member = await interaction.guild.members.fetch(interaction.user.id);

    const name = member.displayName; // 👉 HIER IST DER FIX

    // Entfernen aus beiden Listen
    meeting.yes = meeting.yes.filter(n => n !== name);
    meeting.no = meeting.no.filter(n => n !== name);

    if (type === 'yes') meeting.yes.push(name);
    if (type === 'no') meeting.no.push(name);

    await interaction.reply({
      content: `✅ Stimme gespeichert (${name})`,
      ephemeral: true
    });
  }


  // ======================
  // ANZEIGEN
  // ======================
  if (interaction.customId === 'show_votes') {

    const lastMeeting = Object.values(meetings).pop();
    if (!lastMeeting) {
      return interaction.reply("❌ Kein Meeting vorhanden");
    }

    const guild = interaction.guild;
    const members = await guild.members.fetch();

    const voted = [...lastMeeting.yes, ...lastMeeting.no];

    const notVoted = members
      .filter(m => !m.user.bot)
      .map(m => m.displayName)
      .filter(name => !voted.includes(name));

    const embed = new EmbedBuilder()
      .setTitle("📊 Abstimmung")
      .addFields(
        {
          name: "✅ Zugesagt",
          value: lastMeeting.yes.join("\n") || "Niemand"
        },
        {
          name: "❌ Abgesagt",
          value: lastMeeting.no.join("\n") || "Niemand"
        },
        {
          name: "⚠️ Nicht abgestimmt",
          value: notVoted.join("\n") || "Alle haben abgestimmt"
        }
      );

    await interaction.reply({
      embeds: [embed]
    });
  }
});


// ==========================
client.login(TOKEN);
