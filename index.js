  const {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  Events,
  MessageFlags,
} = require('discord.js');

const fs = require('fs');
const path = require('path');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const LEADER_ROLE_NAME = process.env.LEADER_ROLE_NAME || 'Vostoka Leitung';

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('Fehlende .env Werte: DISCORD_TOKEN, CLIENT_ID oder GUILD_ID.');
  process.exit(1);
}

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DB_FILE)) {
    const initial = {
      absences: [],
      sanctions: [],
      meetings: [],
      cash: [],
      logs: [],
      settings: {
        factionTag: 'VST',
      },
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf8');
  }
}

function readDb() {
  ensureDb();
  const raw = fs.readFileSync(DB_FILE, 'utf8');
  const db = JSON.parse(raw);

  db.absences = Array.isArray(db.absences) ? db.absences : [];
  db.sanctions = Array.isArray(db.sanctions) ? db.sanctions : [];
  db.meetings = Array.isArray(db.meetings) ? db.meetings : [];
  db.cash = Array.isArray(db.cash) ? db.cash : [];
  db.logs = Array.isArray(db.logs) ? db.logs : [];
  db.settings = db.settings || { factionTag: 'VST' };

  return db;
}

function writeDb(db) {
  ensureDb();
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
}

function nextId(list) {
  if (!Array.isArray(list) || list.length === 0) return 1;
  return Math.max(...list.map(item => Number(item.id) || 0)) + 1;
}

function fmtMoney(value) {
  return '$' + Number(value || 0).toLocaleString('en-US');
}

function isLeader(member) {
  if (!member || !member.roles || !member.roles.cache) return false;
  return member.roles.cache.some(role => role.name === LEADER_ROLE_NAME);
}

function buildPanelEmbed() {
  return new EmbedBuilder()
    .setTitle('🕴️ VOSTOKA Verwaltung')
    .setDescription('Disziplin ist Pflicht. Nutze die Buttons unten für Abwesenheiten, Meetings, Kasse und Logbuch.')
    .setColor(0x5c0e0e)
    .addFields(
      { name: 'Mitglieder', value: 'Abwesenheit eintragen, eigene Sanktionen ansehen', inline: false },
      { name: 'Leitung', value: 'Meetings, Sanktionen, Kasse und Logbuch verwalten', inline: false },
    )
    .setFooter({ text: 'Vostoka vergisst nichts.' });
}

function buildMainButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('absence_create').setLabel('Abwesenheit eintragen').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('absence_list').setLabel('Aktuelle Abwesenheiten').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('sanctions_me').setLabel('Meine Sanktionen').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('sanctions_overview').setLabel('Sanktionsübersicht').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('meeting_list').setLabel('Meetings').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('cash_status').setLabel('Kassenstand').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('log_latest').setLabel('Letzte Logs').setStyle(ButtonStyle.Secondary),
    ),
  ];
}

const commands = [
  new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Sendet das Vostoka-Hauptpanel.'),

  new SlashCommandBuilder()
    .setName('sanktion_add')
    .setDescription('Fügt einem Mitglied eine Sanktion hinzu.')
    .addUserOption(o => o.setName('user').setDescription('Mitglied').setRequired(true))
    .addStringOption(o => o.setName('grund').setDescription('Grund').setRequired(true))
    .addIntegerOption(o => o.setName('betrag').setDescription('Betrag').setRequired(true))
    .addStringOption(o => o.setName('frist').setDescription('Frist, z. B. 2026-03-25').setRequired(true)),

  new SlashCommandBuilder()
    .setName('sanktion_bezahlt')
    .setDescription('Markiert eine Sanktion als bezahlt.')
    .addIntegerOption(o => o.setName('id').setDescription('Sanktions-ID').setRequired(true)),

  new SlashCommandBuilder()
    .setName('meeting_erstellen')
    .setDescription('Erstellt ein Meeting mit Abstimmungsbuttons.')
    .addStringOption(o => o.setName('titel').setDescription('Titel').setRequired(true))
    .addStringOption(o => o.setName('datum').setDescription('Datum/Uhrzeit, z. B. 2026-03-20 20:00').setRequired(true))
    .addStringOption(o => o.setName('info').setDescription('Zusatzinfos').setRequired(false)),

new SlashCommandBuilder()
  .setName('meeting_sanktionieren')
  .setDescription('Sanktioniert alle, die bei einem Meeting nicht abgestimmt haben.')
  .addIntegerOption(o => o.setName('id').setDescription('Meeting-ID').setRequired(true))
  .addIntegerOption(o => o.setName('betrag').setDescription('Sanktionsbetrag').setRequired(true))
  .addStringOption(o => o.setName('frist').setDescription('Frist, z. B. 2026-03-25').setRequired(true)),

  new SlashCommandBuilder()
    .setName('kasse_einnahme')
    .setDescription('Trägt eine Einnahme in die Fraktionskasse ein.')
    .addIntegerOption(o => o.setName('betrag').setDescription('Betrag').setRequired(true))
    .addStringOption(o => o.setName('grund').setDescription('Grund').setRequired(true)),

  new SlashCommandBuilder()
    .setName('kasse_ausgabe')
    .setDescription('Trägt eine Ausgabe in die Fraktionskasse ein.')
    .addIntegerOption(o => o.setName('betrag').setDescription('Betrag').setRequired(true))
    .addStringOption(o => o.setName('grund').setDescription('Grund').setRequired(true)),

  new SlashCommandBuilder()
    .setName('log_add')
    .setDescription('Fügt einen Logbucheintrag hinzu.')
    .addStringOption(o => o.setName('typ').setDescription('Typ').setRequired(true))
    .addStringOption(o => o.setName('text').setDescription('Text').setRequired(true)),
].map(cmd => cmd.toJSON());

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel],
});

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );
}

client.once(Events.ClientReady, async readyClient => {
  console.log(`Eingeloggt als ${readyClient.user.tag}`);
  try {
    await registerCommands();
    console.log('Slash-Commands registriert.');
  } catch (error) {
    console.error('Fehler bei Command-Registrierung:', error);
  }
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      const db = readDb();

      if (interaction.commandName === 'panel') {
        await interaction.reply({
          embeds: [buildPanelEmbed()],
          components: buildMainButtons(),
        });
        return;
      }

      if (interaction.commandName === 'sanktion_add') {
        if (!isLeader(interaction.member)) {
          await interaction.reply({
            content: 'Dafür brauchst du die Leitungsrolle.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const user = interaction.options.getUser('user');
        const grund = interaction.options.getString('grund');
        const betrag = interaction.options.getInteger('betrag');
        const frist = interaction.options.getString('frist');
        const id = nextId(db.sanctions);

        db.sanctions.push({
          id,
          userId: user.id,
          userTag: user.tag,
          grund,
          betrag,
          frist,
          status: 'offen',
          createdAt: new Date().toISOString(),
        });

        writeDb(db);

        await interaction.reply({
          content: 'Sanktion #' + id + ' für ' + user.toString() + ' erstellt: **' + grund + '** | **' + fmtMoney(betrag) + '** | Frist **' + frist + '**',
        });
        return;
      }

      if (interaction.commandName === 'sanktion_bezahlt') {
        if (!isLeader(interaction.member)) {
          await interaction.reply({
            content: 'Dafür brauchst du die Leitungsrolle.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const id = interaction.options.getInteger('id');
        const sanction = db.sanctions.find(s => s.id === id);

        if (!sanction) {
          await interaction.reply({
            content: 'Sanktion #' + id + ' nicht gefunden.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        sanction.status = 'bezahlt';
        sanction.paidAt = new Date().toISOString();
        writeDb(db);

        await interaction.reply({
          content: 'Sanktion #' + id + ' wurde als **bezahlt** markiert.',
        });
        return;
      }

      if (interaction.commandName === 'meeting_erstellen') {
        if (!isLeader(interaction.member)) {
          await interaction.reply({
            content: 'Dafür brauchst du die Leitungsrolle.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
      if (interaction.commandName === 'meeting_sanktionieren') {
        if (!isLeader(interaction.member)) {
          await interaction.reply({
            content: 'Dafür brauchst du die Leitungsrolle.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const meetingId = interaction.options.getInteger('id');
        const betrag = interaction.options.getInteger('betrag');
        const frist = interaction.options.getString('frist');

        const meeting = db.meetings.find(m => m.id === meetingId);

        if (!meeting) {
          await interaction.reply({
            content: 'Meeting #' + meetingId + ' nicht gefunden.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const guildMembers = await interaction.guild.members.fetch();
        const allMembers = guildMembers.filter(m => !m.user.bot);

        const votes = Array.isArray(meeting.votes) ? meeting.votes : [];
        const votedUserIds = new Set(votes.map(v => v.userId));

        const notVoted = allMembers.filter(m => !votedUserIds.has(m.user.id));

        if (!notVoted.size) {
          await interaction.reply({
            content: 'Alle Mitglieder haben bei Meeting #' + meetingId + ' abgestimmt.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        let created = 0;

        for (const [, member] of notVoted) {
          const alreadyExists = db.sanctions.some(s =>
            s.userId === member.user.id &&
            s.grund === 'Nicht abgestimmt bei Meeting #' + meetingId &&
            s.status === 'offen'
          );

          if (alreadyExists) continue;

          db.sanctions.push({
            id: nextId(db.sanctions),
            userId: member.user.id,
            userTag: member.user.tag,
            grund: 'Nicht abgestimmt bei Meeting #' + meetingId,
            betrag,
            frist,
            status: 'offen',
            createdAt: new Date().toISOString(),
          });

          created++;
        }

        writeDb(db);

        const listText = notVoted.map(m => '• ' + m.user.tag).join('\n').slice(0, 1800) || 'Keine';

        const embed = new EmbedBuilder()
          .setTitle('🚨 Meeting-Sanktionen erstellt')
          .setDescription(
            '**Meeting:** #' + meetingId + ' ' + meeting.titel + '\n' +
            '**Betrag:** ' + fmtMoney(betrag) + '\n' +
            '**Frist:** ' + frist + '\n' +
            '**Erstellt:** ' + created
          )
          .addFields({
            name: 'Nicht abgestimmt',
            value: listText,
            inline: false,
          })
          .setColor(0x8c1c1c)
          .setTimestamp();

        await interaction.reply({
          embeds: [embed],
        });
        return;
      }

        const titel = interaction.options.getString('titel');
        const datum = interaction.options.getString('datum');
        const info = interaction.options.getString('info') || 'Keine Zusatzinfos.';
        const id = nextId(db.meetings);

        db.meetings.push({
          id,
          titel,
          datum,
          info,
          createdAt: new Date().toISOString(),
          votes: [],
        });

        writeDb(db);

        const embed = new EmbedBuilder()
          .setTitle('📣 Meeting #' + id + ': ' + titel)
          .setDescription(info)
          .addFields(
            { name: 'Datum', value: datum, inline: false },
            { name: 'Abstimmung', value: 'Bitte unten abstimmen.', inline: false }
          )
          .setColor(0x1f6f3f)
          .setTimestamp();

        const buttons = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('meeting_yes_' + id)
            .setLabel('Zusage')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('meeting_no_' + id)
            .setLabel('Absage')
            .setStyle(ButtonStyle.Danger),
        );

        await interaction.reply({
          embeds: [embed],
          components: [buttons],
        });
        return;
      }

      if (interaction.commandName === 'kasse_einnahme') {
        if (!isLeader(interaction.member)) {
          await interaction.reply({
            content: 'Dafür brauchst du die Leitungsrolle.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const betrag = interaction.options.getInteger('betrag');
        const grund = interaction.options.getString('grund');

        db.cash.push({
          id: nextId(db.cash),
          type: 'einnahme',
          betrag,
          grund,
          by: interaction.user.tag,
          createdAt: new Date().toISOString(),
        });

        writeDb(db);

        await interaction.reply({
          content: 'Einnahme gespeichert: **' + fmtMoney(betrag) + '** | ' + grund,
        });
        return;
      }

      if (interaction.commandName === 'kasse_ausgabe') {
        if (!isLeader(interaction.member)) {
          await interaction.reply({
            content: 'Dafür brauchst du die Leitungsrolle.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const betrag = interaction.options.getInteger('betrag');
        const grund = interaction.options.getString('grund');

        db.cash.push({
          id: nextId(db.cash),
          type: 'ausgabe',
          betrag,
          grund,
          by: interaction.user.tag,
          createdAt: new Date().toISOString(),
        });

        writeDb(db);

        await interaction.reply({
          content: 'Ausgabe gespeichert: **' + fmtMoney(betrag) + '** | ' + grund,
        });
        return;
      }

      if (interaction.commandName === 'log_add') {
        if (!isLeader(interaction.member)) {
          await interaction.reply({
            content: 'Dafür brauchst du die Leitungsrolle.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const typ = interaction.options.getString('typ');
        const text = interaction.options.getString('text');

        db.logs.unshift({
          id: nextId(db.logs),
          typ,
          text,
          by: interaction.user.tag,
          createdAt: new Date().toISOString(),
        });

        writeDb(db);

        await interaction.reply({
          content: 'Log gespeichert: **' + typ + '** | ' + text,
        });
        return;
      }
    }

    if (interaction.isButton()) {
      const db = readDb();
      const { customId } = interaction;

      if (customId === 'absence_create') {
        const modal = new ModalBuilder()
          .setCustomId('absence_modal')
          .setTitle('Abwesenheit eintragen');

        const start = new TextInputBuilder()
          .setCustomId('start')
          .setLabel('Startdatum')
          .setPlaceholder('2026-03-20')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const end = new TextInputBuilder()
          .setCustomId('end')
          .setLabel('Enddatum')
          .setPlaceholder('2026-03-25')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const reason = new TextInputBuilder()
          .setCustomId('reason')
          .setLabel('Grund')
          .setPlaceholder('Optional kurz beschreiben')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder().addComponents(start),
          new ActionRowBuilder().addComponents(end),
          new ActionRowBuilder().addComponents(reason),
        );

        await interaction.showModal(modal);
        return;
      }

      if (customId === 'absence_list') {
        const current = db.absences.slice(-10).reverse();

        if (!current.length) {
          await interaction.reply({
            content: 'Aktuell sind keine Abwesenheiten eingetragen.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const text = current
          .map(a => '• **' + a.userTag + '** | ' + a.start + ' bis ' + a.end + ' | ' + a.reason)
          .join('\n');

        const embed = new EmbedBuilder()
          .setTitle('📅 Aktuelle/letzte Abwesenheiten')
          .setDescription(text)
          .setColor(0x365b8c);

        await interaction.reply({
          embeds: [embed],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (customId === 'sanctions_me') {
        const mine = db.sanctions.filter(s => s.userId === interaction.user.id).slice().reverse();

        if (!mine.length) {
          await interaction.reply({
            content: 'Du hast aktuell keine Sanktionen.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const text = mine
          .map(s => '• **#' + s.id + '** | ' + s.grund + ' | ' + fmtMoney(s.betrag) + ' | ' + s.status + ' | Frist ' + s.frist)
          .join('\n');

        const embed = new EmbedBuilder()
          .setTitle('💸 Deine Sanktionen')
          .setDescription(text)
          .setColor(0x8c1c1c);

        await interaction.reply({
          embeds: [embed],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (customId === 'sanctions_overview') {
        const open = db.sanctions.filter(s => s.status === 'offen');
        const paid = db.sanctions.filter(s => s.status === 'bezahlt');

        const openText = open.length
          ? open.map(s => '• **#' + s.id + '** | <@' + s.userId + '> | ' + s.grund + ' | ' + fmtMoney(s.betrag) + ' | Frist ' + s.frist).join('\n')
          : 'Keine offenen Sanktionen.';

        const paidText = paid.length
          ? paid.map(s => '• **#' + s.id + '** | <@' + s.userId + '> | ' + s.grund + ' | ' + fmtMoney(s.betrag)).join('\n')
          : 'Keine bezahlten Sanktionen.';

        const totalOpen = open.reduce((sum, s) => sum + Number(s.betrag || 0), 0);

        const embed = new EmbedBuilder()
          .setTitle('🚨 Sanktionsübersicht')
          .addFields(
            { name: '❌ Unbezahlt', value: openText, inline: false },
            { name: '✅ Bezahlt', value: paidText, inline: false },
            { name: '💰 Gesamt offen', value: '**' + fmtMoney(totalOpen) + '**', inline: false }
          )
          .setColor(0x8c1c1c)
          .setTimestamp();

        await interaction.reply({
          embeds: [embed],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (
        customId.startsWith('meeting_yes_') ||
        customId.startsWith('meeting_no_')
      ) {
        const parts = customId.split('_');
        const voteTypeRaw = parts[1];
        const meetingId = Number(parts[2]);

        const meeting = db.meetings.find(m => m.id === meetingId);

        if (!meeting) {
          await interaction.reply({
            content: 'Meeting nicht gefunden.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        if (!meeting.votes) meeting.votes = [];

        const vote = voteTypeRaw === 'yes' ? 'zusage' : 'absage';
        const existingVote = meeting.votes.find(v => v.userId === interaction.user.id);

        if (existingVote) {
          existingVote.vote = vote;
          existingVote.userTag = interaction.user.tag;
          existingVote.updatedAt = new Date().toISOString();
        } else {
          meeting.votes.push({
            userId: interaction.user.id,
            userTag: interaction.user.tag,
            vote,
            updatedAt: new Date().toISOString(),
          });
        }

        writeDb(db);

        await interaction.reply({
          content: 'Deine Stimme für Meeting #' + meetingId + ' wurde gespeichert: **' + vote + '**',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (customId === 'meeting_list') {
  const meetings = db.meetings.slice(-5).reverse();

  if (!meetings.length) {
    await interaction.reply({
      content: 'Keine Meetings vorhanden.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const guildMembers = await interaction.guild.members.fetch();
  const allMembers = guildMembers.filter(m => !m.user.bot);

  const textParts = meetings.map(m => {
    const votes = Array.isArray(m.votes) ? m.votes : [];

    const yesUsers = votes
      .filter(v => v.vote === 'zusage')
      .map(v => v.userTag);

    const noUsers = votes
      .filter(v => v.vote === 'absage')
      .map(v => v.userTag);

    const votedUserIds = new Set(votes.map(v => v.userId));

    const notVotedUsers = allMembers
      .filter(member => !votedUserIds.has(member.user.id))
      .map(member => member.user.tag);

    return (
      '• **#' + m.id + ' ' + m.titel + '**\n' +
      '📅 ' + m.datum + '\n' +
      '✅ Zusage:\n' + (yesUsers.join('\n') || 'Keine') + '\n' +
      '❌ Absage:\n' + (noUsers.join('\n') || 'Keine') + '\n' +
      '⚠ Nicht abgestimmt:\n' + (notVotedUsers.join('\n') || 'Keine')
    );
  });

  const embed = new EmbedBuilder()
    .setTitle('📋 Letzte Meetings')
    .setDescription(textParts.join('\n\n').slice(0, 4000))
    .setColor(0x1f6f3f);

  await interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
  });
  return;
}

      if (customId === 'cash_status') {
        const stand = db.cash.reduce((sum, item) => {
          return sum + (item.type === 'einnahme' ? item.betrag : -item.betrag);
        }, 0);

        const recent = db.cash
          .slice(-5)
          .reverse()
          .map(c => '- ' + (c.type === 'einnahme' ? '+' : '-') + ' ' + fmtMoney(c.betrag) + ' | ' + c.grund)
          .join('\n') || 'Keine Einträge.';

        const embed = new EmbedBuilder()
          .setTitle('🏦 Kasse')
          .setDescription('**Stand:** ' + fmtMoney(stand) + '\n\n**Letzte Buchungen**\n' + recent)
          .setColor(0x8a6a15);

        await interaction.reply({
          embeds: [embed],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (customId === 'log_latest') {
        const recent = db.logs.slice(0, 5);

        if (!recent.length) {
          await interaction.reply({
            content: 'Noch keine Logbucheinträge vorhanden.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const text = recent
          .map(l => '- **' + l.typ + '** | ' + l.text + ' | von ' + l.by)
          .join('\n');

        const embed = new EmbedBuilder()
          .setTitle('📝 Letzte Logs')
          .setDescription(text)
          .setColor(0x4a4a4a);

        await interaction.reply({
          embeds: [embed],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
    }

    if (interaction.isModalSubmit()) {
      const db = readDb();

      if (interaction.customId === 'absence_modal') {
        const start = interaction.fields.getTextInputValue('start');
        const end = interaction.fields.getTextInputValue('end');
        const reason = interaction.fields.getTextInputValue('reason');

        db.absences.push({
          id: nextId(db.absences),
          userId: interaction.user.id,
          userTag: interaction.user.tag,
          start,
          end,
          reason,
          createdAt: new Date().toISOString(),
        });

        writeDb(db);

        await interaction.reply({
          content: 'Abwesenheit eingetragen: **' + start + '** bis **' + end + '**',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
    }
  } catch (error) {
    console.error('Fehler bei Interaction:', error);

    if (interaction.isRepliable()) {
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content: 'Es gab einen Fehler bei der Verarbeitung.',
            flags: MessageFlags.Ephemeral,
          });
        } else {
          await interaction.reply({
            content: 'Es gab einen Fehler bei der Verarbeitung.',
            flags: MessageFlags.Ephemeral,
          });
        }
      } catch (_) {}
    }
  }
});

client.login(TOKEN);
