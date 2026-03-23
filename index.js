
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
