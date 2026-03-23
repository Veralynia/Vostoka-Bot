      if (interaction.commandName === 'meeting_erstellen') {
        if (!isLeader(interaction.member)) {
          await interaction.reply({
            content: 'Dafür brauchst du die Leitungsrolle.',
            flags: MessageFlags.Ephemeral,
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
