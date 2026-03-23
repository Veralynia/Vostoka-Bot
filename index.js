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
  Events,
} = require("discord.js");

const TOKEN = process.env.TOKEN;
const GUILD_ID = process.env.GUILD_ID;

const ALLOWED_ROLES = ["Leaderschaft", "Glaz"];
const meetings = new Map();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.GuildMember],
});

// ================= READY =================
client.once(Events.ClientReady, async () => {
  console.log(`✅ Online als ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder()
      .setName("panel")
      .setDescription("Meeting Panel öffnen"),
  ];

  const guild = await client.guilds.fetch(GUILD_ID);
  await guild.commands.set(commands);

  console.log("✅ Commands registriert");
});

// ================= COMMAND =================
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "panel") {

    // 👉 FIX gegen Timeout
    await interaction.deferReply();

    const hasRole = interaction.member.roles.cache.some(role =>
      ALLOWED_ROLES.includes(role.name)
    );

    if (!hasRole) {
      return interaction.editReply("❌ Keine Berechtigung");
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("create_meeting")
        .setLabel("📅 Meeting erstellen")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("show_votes")
        .setLabel("📊 Abstimmungen anzeigen")
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.editReply({
      content: "📌 **Meeting Panel**",
      components: [row]
    });
  }
});

// ================= BUTTONS =================
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;

  const member = await interaction.guild.members.fetch(interaction.user.id);
  const name = member.displayName;

  // CREATE
  if (interaction.customId === "create_meeting") {

    const id = Date.now().toString();

    meetings.set(id, {
      yes: [],
      no: []
    });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`yes_${id}`)
        .setLabel("✅ Zusagen")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(`no_${id}`)
        .setLabel("❌ Absagen")
        .setStyle(ButtonStyle.Danger)
    );

    return interaction.reply({
      content: "📅 Neues Meeting gestartet!",
      components: [row]
    });
  }

  // VOTE
  if (interaction.customId.startsWith("yes_") || interaction.customId.startsWith("no_")) {

    const [type, id] = interaction.customId.split("_");
    const meeting = meetings.get(id);
    if (!meeting) return;

    meeting.yes = meeting.yes.filter(n => n !== name);
    meeting.no = meeting.no.filter(n => n !== name);

    if (type === "yes") meeting.yes.push(name);
    if (type === "no") meeting.no.push(name);

    return interaction.reply({
      content: `✅ Gespeichert (${name})`,
      ephemeral: true
    });
  }

  // SHOW
  if (interaction.customId === "show_votes") {

    const last = [...meetings.values()].pop();
    if (!last) return interaction.reply("❌ Kein Meeting");

    const members = await interaction.guild.members.fetch();

    const voted = [...last.yes, ...last.no];

    const notVoted = members
      .filter(m => !m.user.bot)
      .map(m => m.displayName)
      .filter(n => !voted.includes(n));

    const embed = new EmbedBuilder()
      .setTitle("📊 Abstimmung")
      .addFields(
        { name: "✅ Ja", value: last.yes.join("\n") || "Niemand" },
        { name: "❌ Nein", value: last.no.join("\n") || "Niemand" },
        { name: "⚠️ Keine Antwort", value: notVoted.join("\n") || "Alle" }
      );

    return interaction.reply({ embeds: [embed] });
  }
});

client.login(TOKEN); 
