# Vostoka Bot

## Setup
1. Node.js installieren: https://nodejs.org
2. `.env.example` in `.env` umbenennen.
3. In `.env` folgende Werte eintragen:
   - `DISCORD_TOKEN`
   - `CLIENT_ID`
   - `GUILD_ID`
   - optional `LEADER_ROLE_NAME`
4. Im Bot-Ordner ausführen:
   ```bash
   npm install
   npm start
   ```

## Funktionen
- `/panel`
- `/sanktion_add`
- `/sanktion_bezahlt`
- `/meeting_erstellen`
- `/kasse_einnahme`
- `/kasse_ausgabe`
- `/log_add`
- Buttons für Abwesenheiten, Meetings, Kasse, Logbuch
- Modals für Abwesenheitseinträge und Logbucheinträge

## Hinweise
- Die Daten werden lokal in `data/db.json` gespeichert.
- Der Bot registriert Slash-Commands beim Start automatisch für genau den Server aus `GUILD_ID`.
- Für Führungsbefehle braucht ein Nutzer die Rolle aus `LEADER_ROLE_NAME` oder Administratorrechte.
