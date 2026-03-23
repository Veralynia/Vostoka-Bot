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

// Rollen, die das Panel und Meetings nutzen dürfen
const ALLOWED_ROLES = ["Leaderschaft", "Glaz"];

// Meetings werden im Speicher gehalten
// Hinweis: Nach einem Railway-Neustart sind sie weg.
// Wenn du willst, mache ich dir danach eine Version mit Speichern in Datei/DB.
const meetings = new Map();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.GuildMember],
});

function hasAllowedRole(member) {
  if (!member || !member.roles || !member.roles.cache) return false;
  return member.roles.cache.some((role) => ALLOWED_ROLES.includes(role.name));
}

function getDisplayName(member) {
  return member?.displayName || member?.user?.globalName || member?.user?.username || "Unbekannt";
}

async function registerCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName("panel")
      .setDescription("Öffnet das Meeting-Panel")
      .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
  ].map((cmd) => cmd.toJSON());

  const guild = await client.guilds.fetch(GUILD_ID);
  await guild.commands.set(commands);
  console.log("✅ Slash-Command /panel wurde registriert.");
}

client.once(Events.ClientReady, async () => {
  try {
    console.log(`✅ Bot online als ${client.user.tag}`);

    if (!TOKEN) {
      console.error("❌ TOKEN fehlt. Bitte in Railway als Variable setzen.");
      process.exit(1);
    }

    if (!GUILD_ID) {
      console.error("❌ GUILD_ID fehlt. Bitte in Railway als Variable setzen.");
      process.exit(1);
    }

    await registerCommands();
  } catch (error) {
    console.error("❌ Fehler beim Starten/Registrieren der Commands:", error);
  }
});

// Slash Commands
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "panel") {
      const member = interaction.member;

      if (!hasAllowedRole(member)) {
        return await interaction.reply({
          content: "❌ Du hast keine Berechtigung, dieses Panel zu nutzen.",
          ephemeral: true,
        });
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

      const embed = new EmbedBuilder()
        .setTitle("📌 Meeting-Panel")
        .setDescription("Wähle eine Aktion aus.")
        .setColor(0x8e44ad);

      await interaction.reply({
        embeds: [embed],
        components: [row],
      });
    }
  } catch (error) {
    console.error("❌ Fehler bei Slash-Command:", error);

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: "❌ Beim Ausführen des Befehls ist ein Fehler aufgetreten.",
        ephemeral: true,
      }).catch(() => {});
    } else {
      await interaction.reply({
        content: "❌ Beim Ausführen des Befehls ist ein Fehler aufgetreten.",
        ephemeral: true,
      }).catch(() => {});
    }
  }
});

// Buttons
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (!interaction.isButton()) return;

    const member = await interaction.guild.members.fetch(interaction.user.id);

    // Meeting erstellen
    if (interaction.customId === "create_meeting") {
      if (!hasAllowedRole(member)) {
        return await interaction.reply({
          content: "❌ Du hast keine Berechtigung, ein Meeting zu erstellen.",
          ephemeral: true,
        });
      }

      const meetingId = Date.now().toString();

      meetings.set(meetingId, {
        id: meetingId,
        createdAt: new Date(),
        yes: new Set(),
        no: new Set(),
      });

      const voteRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`yes_${meetingId}`)
          .setLabel("✅ Zusagen")
          .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
          .setCustomId(`no_${meetingId}`)
          .setLabel("❌ Absagen")
          .setStyle(ButtonStyle.Danger)
      );

      const embed = new EmbedBuilder()
        .setTitle("📅 Neues Meeting")
        .setDescription("Bitte stimme über die Buttons ab.")
        .addFields(
          { name: "✅ Zugesagt", value: "Niemand", inline: true },
          { name: "❌ Abgesagt", value: "Niemand", inline: true }
        )
        .setFooter({ text: `Meeting-ID: ${meetingId}` })
        .setColor(0x5865f2)
        .setTimestamp();

      return await interaction.reply({
        embeds: [embed],
        components: [voteRow],
      });
    }

    // Abstimmen
    if (interaction.customId.startsWith("yes_") || interaction.customId.startsWith("no_")) {
      const [voteType, meetingId] = interaction.customId.split("_");
      const meeting = meetings.get(meetingId);

      if (!meeting) {
        return await interaction.reply({
          content: "❌ Dieses Meeting wurde nicht gefunden oder wurde nach einem Neustart gelöscht.",
          ephemeral: true,
        });
      }

      const displayName = getDisplayName(member);

      // Erst aus beiden Sets entfernen, dann neu setzen
      meeting.yes.delete(displayName);
      meeting.no.delete(displayName);

      if (voteType === "yes") {
        meeting.yes.add(displayName);
      } else {
        meeting.no.add(displayName);
      }

      const yesList = [...meeting.yes];
      const noList = [...meeting.no];

      const updatedEmbed = new EmbedBuilder()
        .setTitle("📅 Neues Meeting")
        .setDescription("Bitte stimme über die Buttons ab.")
        .addFields(
          {
            name: "✅ Zugesagt",
            value: yesList.length ? yesList.join("\n") : "Niemand",
            inline: true,
          },
          {
            name: "❌ Abgesagt",
            value: noList.length ? noList.join("\n") : "Niemand",
            inline: true,
          }
        )
        .setFooter({ text: `Meeting-ID: ${meetingId}` })
        .setColor(0x5865f2)
        .setTimestamp(meeting.createdAt);

      await interaction.update({
        embeds: [updatedEmbed],
        components: interaction.message.components,
      });

      return await interaction.followUp({
        content: `✅ Deine Stimme wurde gespeichert: **${displayName}**`,
        ephemeral: true,
      });
    }

    // Abstimmungen anzeigen
    if (interaction.customId === "show_votes") {
      if (!hasAllowedRole(member)) {
        return await interaction.reply({
          content: "❌ Du hast keine Berechtigung, Abstimmungen anzusehen.",
          ephemeral: true,
        });
      }

      const allMeetings = [...meetings.values()];
      const lastMeeting = allMeetings[allMeetings.length - 1];

      if (!lastMeeting) {
        return await interaction.reply({
          content: "❌ Es gibt aktuell kein Meeting.",
          ephemeral: true,
        });
      }

      const guildMembers = await interaction.guild.members.fetch();

      const votedNames = new Set([
        ...lastMeeting.yes,
        ...lastMeeting.no,
      ]);

      const notVoted = guildMembers
        .filter((m) => !m.user.bot)
        .map((m) => getDisplayName(m))
        .filter((name) => !votedNames.has(name));

      const embed = new EmbedBuilder()
        .setTitle("📊 Abstimmungsübersicht")
        .addFields(
          {
            name: "✅ Zugesagt",
            value: lastMeeting.yes.size ? [...lastMeeting.yes].join("\n") : "Niemand",
          },
          {
            name: "❌ Abgesagt",
            value: lastMeeting.no.size ? [...lastMeeting.no].join("\n") : "Niemand",
          },
          {
            name: "⚠️ Nicht abgestimmt",
            value: notVoted.length ? notVoted.join("\n") : "Alle haben abgestimmt",
          }
        )
        .setFooter({ text: `Meeting-ID: ${lastMeeting.id}` })
        .setColor(0xf1c40f)
        .setTimestamp(lastMeeting.createdAt);

      return await interaction.reply({
        embeds: [embed],
        ephemeral: true,
      });
    }
  } catch (error) {
    console.error("❌ Fehler bei Button-Interaktion:", error);

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: "❌ Bei der Button-Aktion ist ein Fehler aufgetreten.",
        ephemeral: true,
      }).catch(() => {});
    } else {
      await interaction.reply({
        content: "❌ Bei der Button-Aktion ist ein Fehler aufgetreten.",
        ephemeral: true,
      }).catch(() => {});
    }
  }
});

client.login(TOKEN);
