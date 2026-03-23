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

const fs = require("fs");
const path = require("path");

const TOKEN = process.env.TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "bot-data.json");

const LEADERSHIP_ROLES = ["Leaderschaft"];
const VIEW_ROLES = ["Leaderschaft", "Glaz"];

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  partials: [Partials.GuildMember],
});

const state = {
  currentMeetingId: null,
  meetings: {},
  absences: {},
  sanctions: [],
};

function ensureDataDir() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function saveState() {
  ensureDataDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), "utf8");
}

function loadState() {
  try {
    ensureDataDir();

    if (!fs.existsSync(DATA_FILE)) {
      saveState();
      return;
    }

    const raw = fs.readFileSync(DATA_FILE, "utf8");
    if (!raw.trim()) {
      saveState();
      return;
    }

    const parsed = JSON.parse(raw);

    state.currentMeetingId = parsed.currentMeetingId || null;
    state.meetings = parsed.meetings || {};
    state.absences = parsed.absences || {};
    state.sanctions = Array.isArray(parsed.sanctions) ? parsed.sanctions : [];
  } catch (error) {
    console.error("❌ Fehler beim Laden der Daten:", error);
  }
}

function hasLeadershipRole(member) {
  return member.roles.cache.some((role) => LEADERSHIP_ROLES.includes(role.name));
}

function hasViewRole(member) {
  return member.roles.cache.some((role) => VIEW_ROLES.includes(role.name));
}

function getDisplayName(member) {
  return (
    member.displayName ||
    member.nickname ||
    member.user?.globalName ||
    member.user?.username ||
    "Unbekannt"
  );
}

function getCurrentMeeting() {
  if (!state.currentMeetingId) return null;
  return state.meetings[state.currentMeetingId] || null;
}

function getAbsentDisplayNames() {
  return new Set(Object.values(state.absences).map((a) => a.displayName));
}

function getMeetingVotedNames(meeting) {
  return new Set([...(meeting?.yes || []), ...(meeting?.no || [])]);
}

function addSanction({ meetingId, userId, displayName, reason }) {
  const exists = state.sanctions.some(
    (s) => s.meetingId === meetingId && s.userId === userId && s.reason === reason
  );

  if (exists) return false;

  state.sanctions.push({
    id: `${meetingId}_${userId}`,
    meetingId,
    userId,
    displayName,
    reason,
    createdAt: new Date().toISOString(),
  });

  return true;
}

async function applyAutoSanctionsForCurrentMeeting(guild) {
  const meeting = getCurrentMeeting();
  if (!meeting) return [];

  const members = await guild.members.fetch();
  const absentIds = new Set(Object.keys(state.absences));
  const votedNames = getMeetingVotedNames(meeting);

  const newlySanctioned = [];

  for (const member of members.values()) {
    if (member.user.bot) continue;
    if (absentIds.has(member.id)) continue;

    const displayName = getDisplayName(member);
    if (votedNames.has(displayName)) continue;

    const created = addSanction({
      meetingId: meeting.id,
      userId: member.id,
      displayName,
      reason: "Nicht am aktuellen Meeting abgestimmt",
    });

    if (created) {
      newlySanctioned.push(displayName);
    }
  }

  meeting.closed = true;
  meeting.closedAt = new Date().toISOString();
  saveState();

  return newlySanctioned;
}

function buildPanelRows(member) {
  const isLeadership = hasLeadershipRole(member);
  const isViewer = hasViewRole(member);

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("create_meeting")
      .setLabel("📅 Meeting erstellen")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!isLeadership),

    new ButtonBuilder()
      .setCustomId("close_meeting")
      .setLabel("🔒 Meeting schließen")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!isLeadership),

    new ButtonBuilder()
      .setCustomId("show_votes")
      .setLabel("📊 Aktuelles Meeting")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!isViewer)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("show_sanctions")
      .setLabel("⚠️ Sanktionen")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!isViewer),

    new ButtonBuilder()
      .setCustomId("mark_absent")
      .setLabel("🟡 Abwesenheit melden")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId("remove_absent")
      .setLabel("🟢 Abwesenheit entfernen")
      .setStyle(ButtonStyle.Secondary)
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("show_absences")
      .setLabel("📋 Abwesenheiten")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!isViewer)
  );

  return [row1, row2, row3];
}

function buildVoteRow(meetingId, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`yes_${meetingId}`)
      .setLabel("✅ Zusagen")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),

    new ButtonBuilder()
      .setCustomId(`no_${meetingId}`)
      .setLabel("❌ Absagen")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled)
  );
}

function buildMeetingEmbed(meeting) {
  const yesList = meeting.yes || [];
  const noList = meeting.no || [];

  return new EmbedBuilder()
    .setTitle("📅 Aktuelles Meeting")
    .setDescription(
      meeting.closed
        ? "Dieses Meeting ist geschlossen."
        : "Bitte stimme über die Buttons ab."
    )
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
    .setFooter({ text: `Meeting-ID: ${meeting.id}` })
    .setColor(meeting.closed ? 0x7f8c8d : 0x5865f2)
    .setTimestamp(new Date(meeting.createdAt));
}

async function registerCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName("panel")
      .setDescription("Öffnet das Meeting-Panel")
      .setDefaultMemberPermissions(PermissionsBitField.Flags.SendMessages),
  ].map((cmd) => cmd.toJSON());

  const guild = await client.guilds.fetch(GUILD_ID);
  await guild.commands.set(commands);
  console.log("✅ /panel registriert");
}

client.once(Events.ClientReady, async () => {
  try {
    if (!TOKEN) {
      console.error("❌ TOKEN fehlt.");
      process.exit(1);
    }

    if (!GUILD_ID) {
      console.error("❌ GUILD_ID fehlt.");
      process.exit(1);
    }

    loadState();

    console.log(`✅ Bot online als ${client.user.tag}`);
    console.log(`💾 Datenpfad: ${DATA_FILE}`);

    await registerCommands();
  } catch (error) {
    console.error("❌ Fehler beim Start:", error);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName !== "panel") return;

    await interaction.deferReply({ ephemeral: true });

    const member = await interaction.guild.members.fetch(interaction.user.id);

    const embed = new EmbedBuilder()
      .setTitle("📌 Meeting-Panel")
      .setDescription(
        [
          `**Dein Name:** ${getDisplayName(member)}`,
          `**Leaderschaft:** ${hasLeadershipRole(member) ? "Ja" : "Nein"}`,
          `**Panel-Zugriff:** ${hasViewRole(member) ? "Ja" : "Nein"}`,
          "",
          "Glaz kann keine Meetings erstellen oder schließen.",
          "Sanktionen werden automatisch beim Schließen des aktuellen Meetings erstellt.",
        ].join("\n")
      )
      .setColor(0x8e44ad);

    await interaction.editReply({
      embeds: [embed],
      components: buildPanelRows(member),
    });
  } catch (error) {
    console.error("❌ Fehler bei /panel:", error);

    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: "❌ Beim Öffnen des Panels ist ein Fehler aufgetreten.",
          embeds: [],
          components: [],
        });
      } else {
        await interaction.reply({
          content: "❌ Beim Öffnen des Panels ist ein Fehler aufgetreten.",
          ephemeral: true,
        });
      }
    } catch (_) {}
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (!interaction.isButton()) return;

    const member = await interaction.guild.members.fetch(interaction.user.id);
    const displayName = getDisplayName(member);
    const isLeadership = hasLeadershipRole(member);
    const isViewer = hasViewRole(member);

    if (interaction.customId === "create_meeting") {
      if (!isLeadership) {
        return await interaction.reply({
          content: "❌ Nur Leaderschaft darf Meetings erstellen.",
          ephemeral: true,
        });
      }

      const currentMeeting = getCurrentMeeting();
      if (currentMeeting && !currentMeeting.closed) {
        return await interaction.reply({
          content: "❌ Es gibt bereits ein offenes Meeting. Schließe es zuerst.",
          ephemeral: true,
        });
      }

      const meetingId = Date.now().toString();

      state.currentMeetingId = meetingId;
      state.meetings[meetingId] = {
        id: meetingId,
        createdAt: new Date().toISOString(),
        yes: [],
        no: [],
        closed: false,
        closedAt: null,
      };

      saveState();

      return await interaction.reply({
        embeds: [buildMeetingEmbed(state.meetings[meetingId])],
        components: [buildVoteRow(meetingId, false)],
      });
    }

    if (interaction.customId === "close_meeting") {
      if (!isLeadership) {
        return await interaction.reply({
          content: "❌ Nur Leaderschaft darf Meetings schließen.",
          ephemeral: true,
        });
      }

      const meeting = getCurrentMeeting();
      if (!meeting) {
        return await interaction.reply({
          content: "❌ Es gibt aktuell kein Meeting.",
          ephemeral: true,
        });
      }

      if (meeting.closed) {
        return await interaction.reply({
          content: "❌ Das aktuelle Meeting ist bereits geschlossen.",
          ephemeral: true,
        });
      }

      const newlySanctioned = await applyAutoSanctionsForCurrentMeeting(interaction.guild);

      return await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("🔒 Meeting geschlossen")
            .setDescription("Das aktuelle Meeting wurde geschlossen.")
            .addFields({
              name: "🚨 Neu sanktioniert",
              value: newlySanctioned.length ? newlySanctioned.join("\n") : "Niemand",
            })
            .setColor(0xe74c3c)
            .setTimestamp(),
        ],
        ephemeral: true,
      });
    }

    if (interaction.customId.startsWith("yes_") || interaction.customId.startsWith("no_")) {
      const [voteType, meetingId] = interaction.customId.split("_");
      const meeting = state.meetings[meetingId];

      if (!meeting) {
        return await interaction.reply({
          content: "❌ Dieses Meeting wurde nicht gefunden.",
          ephemeral: true,
        });
      }

      if (meetingId !== state.currentMeetingId) {
        return await interaction.reply({
          content: "❌ Es kann nur für das aktuellste Meeting abgestimmt werden.",
          ephemeral: true,
        });
      }

      if (meeting.closed) {
        return await interaction.reply({
          content: "❌ Dieses Meeting ist bereits geschlossen.",
          ephemeral: true,
        });
      }

      meeting.yes = meeting.yes.filter((n) => n !== displayName);
      meeting.no = meeting.no.filter((n) => n !== displayName);

      if (voteType === "yes") {
        meeting.yes.push(displayName);
      } else {
        meeting.no.push(displayName);
      }

      saveState();

      await interaction.update({
        embeds: [buildMeetingEmbed(meeting)],
        components: [buildVoteRow(meeting.id, false)],
      });

      return await interaction.followUp({
        content: `✅ Stimme gespeichert für **${displayName}**`,
        ephemeral: true,
      });
    }

    if (interaction.customId === "show_votes") {
      if (!isViewer) {
        return await interaction.reply({
          content: "❌ Du darfst das nicht ansehen.",
          ephemeral: true,
        });
      }

      const meeting = getCurrentMeeting();
      if (!meeting) {
        return await interaction.reply({
          content: "❌ Es gibt aktuell kein Meeting.",
          ephemeral: true,
        });
      }

      const members = await interaction.guild.members.fetch();
      const absentNames = getAbsentDisplayNames();
      const votedNames = getMeetingVotedNames(meeting);

      const allHumans = [];
      for (const m of members.values()) {
        if (!m.user.bot) allHumans.push(getDisplayName(m));
      }

      const notVoted = allHumans.filter((name) => !votedNames.has(name));
      const sanctionable = notVoted.filter((name) => !absentNames.has(name));

      return await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("📊 Aktuellstes Meeting")
            .setDescription("Es wird immer nur das aktuelle Meeting angezeigt.")
            .addFields(
              {
                name: "✅ Zugesagt",
                value: meeting.yes.length ? meeting.yes.join("\n") : "Niemand",
              },
              {
                name: "❌ Abgesagt",
                value: meeting.no.length ? meeting.no.join("\n") : "Niemand",
              },
              {
                name: "⚠️ Nicht abgestimmt",
                value: notVoted.length ? notVoted.join("\n") : "Alle haben abgestimmt",
              },
              {
                name: "🟡 Abwesend",
                value: absentNames.size ? [...absentNames].join("\n") : "Niemand",
              },
              {
                name: "🚨 Wird sanktioniert",
                value: sanctionable.length ? sanctionable.join("\n") : "Niemand",
              }
            )
            .setColor(0xf1c40f)
            .setTimestamp(new Date(meeting.createdAt)),
        ],
        ephemeral: true,
      });
    }

    if (interaction.customId === "show_sanctions") {
      if (!isViewer) {
        return await interaction.reply({
          content: "❌ Du darfst das nicht ansehen.",
          ephemeral: true,
        });
      }

      const sanctionsForCurrentMeeting = state.currentMeetingId
        ? state.sanctions.filter((s) => s.meetingId === state.currentMeetingId)
        : [];

      return await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("⚠️ Sanktionen")
            .setDescription("Angezeigt werden nur Sanktionen des aktuellen Meetings.")
            .addFields({
              name: "🚨 Sanktioniert",
              value: sanctionsForCurrentMeeting.length
                ? sanctionsForCurrentMeeting.map((s) => s.displayName).join("\n")
                : "Niemand",
            })
            .setColor(0xe67e22)
            .setTimestamp(),
        ],
        ephemeral: true,
      });
    }

    if (interaction.customId === "mark_absent") {
      state.absences[member.id] = {
        userId: member.id,
        displayName,
        since: new Date().toISOString(),
      };

      saveState();

      return await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("🟡 Abwesenheit gemeldet")
            .setDescription(`**${displayName}** wurde als abwesend markiert.`)
            .setColor(0xf1c40f)
            .setTimestamp(),
        ],
        ephemeral: true,
      });
    }

    if (interaction.customId === "remove_absent") {
      if (!state.absences[member.id]) {
        return await interaction.reply({
          content: "❌ Du bist aktuell nicht als abwesend eingetragen.",
          ephemeral: true,
        });
      }

      delete state.absences[member.id];
      saveState();

      return await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("🟢 Abwesenheit entfernt")
            .setDescription(`**${displayName}** ist nicht mehr als abwesend markiert.`)
            .setColor(0x2ecc71)
            .setTimestamp(),
        ],
        ephemeral: true,
      });
    }

    if (interaction.customId === "show_absences") {
      if (!isViewer) {
        return await interaction.reply({
          content: "❌ Du darfst das nicht ansehen.",
          ephemeral: true,
        });
      }

      const entries = Object.values(state.absences);

      return await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("📋 Aktuelle Abwesenheiten")
            .setDescription(
              entries.length
                ? entries.map((a) => `• ${a.displayName}`).join("\n")
                : "Niemand ist aktuell abwesend gemeldet."
            )
            .setColor(0x3498db)
            .setTimestamp(),
        ],
        ephemeral: true,
      });
    }
  } catch (error) {
    console.error("❌ Fehler bei Button-Interaktion:", error);

    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: "❌ Bei der Button-Aktion ist ein Fehler aufgetreten.",
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: "❌ Bei der Button-Aktion ist ein Fehler aufgetreten.",
          ephemeral: true,
        });
      }
    } catch (_) {}
  }
});

client.login(TOKEN);
