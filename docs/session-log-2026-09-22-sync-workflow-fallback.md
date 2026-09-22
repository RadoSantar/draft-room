# Session-Log: ESPN-Sync-Workflow – übersprungener Lauf, Fallback gebaut

**Datum:** 2026-09-22
**Zweck dieser Datei:** Backup/Gedächtnisstütze für den Fall, dass der Chat-Kontext verloren geht. Setzt `session-log-2026-09-17-texte-gekuerzt.md` fort (dortiger Stand: Texte gekürzt, Trade-Shapes in beide Richtungen fertig).

## 1. Diagnose: Sync-Lauf heute nicht gefeuert

**Nutzer-Frage:** "es ist jetzt 10:02 und ich sehe noch keine aktualisierung der recaps wieso?"

**Befund:** Heute (Dienstag 22.9., 08:02 UTC = 10:02 Schweizer Zeit) hatten weder der 05:00- noch der 07:00-UTC-Cron-Trigger von `espn-sync.yml` gefeuert – letzter tatsächlicher Lauf war der 16.9. (manuell). Workflow selbst war `state: active`, Cron-Syntax korrekt (`0 5,7,9,11,13 * * 2`). Zum Vergleich geprüft: der andere Workflow im selben Repo (`espn-live-snapshot.yml`) lief heute planmässig um 01:44 UTC – GitHub Actions Scheduling funktioniert also grundsätzlich fürs Repo, das Problem war spezifisch bei espn-sync.yml.

**Wahrscheinlichste Ursache:** alle 5 Trigger-Zeiten lagen exakt auf der vollen Stunde (`:00`) – laut GitHubs eigener Doku die Zeit mit der höchsten Last für Scheduled-Workflows, wo Läufe eher komplett übersprungen als nur verzögert werden. Kein Bug im eigenen Code.

**Sofortmassnahme:** manuell per `workflow_dispatch` (GitHub-MCP-Tool `actions_run_trigger`) einen Lauf angestossen – erfolgreich durchgelaufen 08:03–08:05 UTC.

## 2. Fix: Cron-Minute verschoben + Watchdog-Fallback

**Nutzer-Wunsch:** "ja ausserdem wäre ein fallback für eben solche übersprungenen läufe noch praktisch offensichtlich reichen mehrere ja nicht wenn sie alle übersprungen werden" (Antwort auf meine Rückfrage, ob ich die Cron-Minute verschieben soll).

**Umgesetzt:**
1. `espn-sync.yml`: alle 5 Cron-Zeiten von `:00` auf `:07` verschoben (`7 5,7,9,11,13 * * 2`) – reduziert das Kollisionsrisiko, garantiert aber nichts (GitHub gibt für Scheduled-Runs grundsätzlich keine Zusagen).
2. Neuer Workflow `espn-sync-watchdog.yml`: läuft 1x pro Dienstag um 14:23 UTC (nach dem letzten regulären Versuch um 13:07 UTC, bewusst wieder abseits von `:00`). Prüft per `gh api` gegen die GitHub-Workflow-Run-Historie, ob heute schon ein erfolgreicher `espn-sync`-Lauf war (egal ob scheduled oder manuell ausgelöst) – wenn nicht, stösst er per `gh workflow run espn-sync.yml` selbst einen nach. Nutzt den eingebauten `github.token` mit `permissions: actions: write`, kein neues Secret nötig. Genau die vom Nutzer verlangte Eigenschaft: prüft das ERGEBNIS statt nur öfter zu versuchen – hilft also auch, wenn ausnahmsweise alle 5 regulären Läufe an einem Dienstag ausfallen sollten.

**Nebenbei verifiziert:** der manuelle Sync-Lauf von heute früh hat nebenbei die neue serverseitige Logik aus der letzten Session (Playoff-Picture, Waiver-Trends, Track-Record-Aufzeichnung) zum ersten Mal gegen die echte private ESPN-API laufen lassen – alle drei `data/*.json`-Dateien enthalten jetzt echte Woche-2-Einträge (z.B. Kyler Murray/Cairo Santos/Jaguars D/ST als erste Track-Record-Empfehlungen, echte Playoff-Seeds für alle 10 Teams). Kein Fehler in den Logs, alles lief sauber durch.

## 3. Wochenüberblick fehlte ein Spiel

**Nutzer-Feedback:** "im spieltags recap wird das spiel von saints of anarchy vs apukalypse now gar nicht erwähnt alle anderen aber schon"

**Root Cause:** kein Bug – `WEEK_SYSTEM_PROMPT` in `generate-recaps.mjs` wies Claude explizit an, nur "3-4 der interessantesten Geschichten" auszuwählen und "nicht jedes Spiel" zu nennen. Bei 5 Spielen/Woche (10-Team-Liga) blieb dadurch fast immer eins aussen vor. `buildWeekPrompt()` lieferte bereits alle 5 Spiele inkl. Fakten an Claude – die Auswahl passierte rein in der Textgenerierung.

**Fix (nach Rückfrage, 3 Optionen zur Wahl gestellt):** Nutzer wählte den Mittelweg. Ziel von "3-4" auf "4-5" Geschichten angehoben, Fliesstext von 4-6 auf 5-7 Sätze erweitert, Formulierung von "Nenne nicht jedes Spiel – nur die Highlights" zu "bei wenigen Spielen pro Woche deckt das oft schon alle ab – nur bei wirklich unspektakulären Partien darfst du eine weglassen" entschärft. `data/week-recaps.json`s Woche-2-Eintrag gelöscht und per manuellem Workflow-Trigger sofort neu generiert (statt bis nächsten Dienstag zu warten) – der neue Text deckt jetzt tatsächlich alle 5 Spiele ab, inkl. Apukalypse Now vs. Saints of Anarchy (Jonathan Taylor, 29 Punkte).

## 4. Neue Seite: Hall of Fame (pro Jahr + Allzeit-Rekorde)

**Nutzer-Wunsch:** "ausserdem brauchen wir noch eine hall of fame eine pro jahr der liga und eine gesammt wir haben dazu ja schon einige daten können wir das noch ergänzen?"

**Befund:** Die Daten waren tatsächlich schon lange da – `data/league-history.json` führt seit der Liga-Historie-Arbeit (frühere Session) pro Vorjahr (2024/2025) Meister, Endstand und ein `hallOfFame`-Objekt (beste Team-Saison/-Woche, beste Spieler-Woche), wurde aber nirgends angezeigt, nur intern für Recap-Fakten genutzt. Die Datei hatte das "Gesamt" (All-Time) in ihrer eigenen `note` schon vorausgesehen, aber bewusst nicht berechnet gespeichert, "um nicht zu interpretieren/geraten, falls doch noch ältere Daten auftauchen".

**Umgesetzt:** neue Seite `hall-of-fame.html`:
- **Allzeit-Rekorde**: Meiste Titel, beste Team-Saison, beste Team-Woche, beste Spieler-Woche – kombiniert die fixen Vorjahres-Werte aus `league-history.json.hallOfFame` MIT dem live aus `scoreboard.json`/`standings.json`/`season-stats.json` berechneten Stand der laufenden Saison (2026 steht noch nicht in `league-history.json`, wird erst am Saisonende von Hand nachgetragen). Laufende-Saison-Werte sind deutlich "live" markiert.
- **Pro Jahr**: eine Karte pro abgeschlossener Saison (neueste zuerst) mit Podium, Endtabelle, Jahres-Rekorden; plus eine "läuft"-Karte für die aktuelle Saison ganz oben. Playoff-Ergebnisse (falls vorhanden) in einem aufklappbaren Detail-Block, um die Seite kurz zu halten (nach der "kürzen"-Rückmeldung vom 17.9. bewusst nicht alles offen ausgebreitet).
- Nav-Link auf allen 5 bestehenden Seiten ergänzt.

**Getestet:** Playwright verifiziert, dass Allzeit-Rekorde korrekt zwischen historischem und Live-Wert wählen (Live gewinnt nur bei tatsächlich höherem Wert), Season-Karten in korrekter Reihenfolge erscheinen, Playoff-Details nur bei Jahren mit vorhandenen Bracket-Daten. Mobile-Screenshot (420px) zur visuellen Kontrolle geprüft.

## 5. Sanity-Check + sofortiger Retry nach jedem fehlgeschlagenen Lauf

**Nutzer-Wunsch:** "ja aber ich denke nach jedem workflow ein check ob er überhaupt lief reduziert die wartezeit unf fann auch ein sanity check am ende würde sich definitiv auch lohnen" (Antwort auf meine Rückfrage, ob die einmal-täglich-Prüfung schon reicht).

**Umgesetzt, zwei Teile:**
1. **Inhaltlicher Sanity-Check** (`runSanityChecks()` in `sync-espn.mjs`, ganz am Schluss von `main()` nach allen Schreibvorgängen): prüft grobe Plausibilität – erwartete Team-Zahl (10) in `standings.json`/`power-rankings.json`/`roster.json`, jedes Team hat einen Kader mit Startern, `scoreboard.json` hat Wochen. Wirft bei einer Verletzung, wodurch das bestehende `main().catch()` den Prozess mit Exit-Code 1 beendet. Grund: bisher hätte eine ESPN-API-Störung, die eine teilweise/leere Antwort OHNE Exception liefert, stillschweigend kaputte Daten committet – der Job wäre grün geblieben, obwohl inhaltlich nichts Brauchbares passiert ist. Verifiziert gegen die aktuellen echten `data/*.json`-Dateien (alle Checks bestehen: 10 Teams überall, alle Kader haben Starter, 15 Scoreboard-Wochen).
2. **Sofortiger Retry statt Tages-Check**: neuer `fast-retry`-Job in `espn-sync-watchdog.yml`, per `workflow_run`-Trigger – feuert innerhalb von Sekunden nach JEDEM `espn-sync.yml`-Lauf (nicht erst beim Tages-Check um 14:23 UTC). Bei `conclusion != 'success'` (z.B. durch den neuen Sanity-Check ausgelöst) wird sofort ein Retry angestossen. Bewusst nur für `github.event.workflow_run.event == 'schedule'` (nicht `workflow_dispatch`) – sonst würde ein fehlschlagender Retry sich selbst erneut triggern (Endlosschleife). Der bestehende Tages-Check (jetzt `daily-check`-Job, unverändert) bleibt als zweites, unabhängiges Netz für den anderen Fehlerfall: dass GAR KEIN Lauf feuert (dafür gibt's kein `workflow_run`-Event zum Reagieren – das war ja das ursprüngliche Problem von heute Morgen).

Damit jetzt drei sich ergänzende Schichten: Cron-Minute-Offset (`:07`, reduziert Skip-Risiko), sofortiger `workflow_run`-Retry (reagiert in Sekunden statt Stunden auf einen fehlgeschlagenen, aber tatsächlich gefeuerten Lauf), Tages-Check (fängt den Fall ab, dass gar nichts feuert).

**Nicht live end-to-end getestet** (kann GitHub's Cron-Scheduler nicht gezielt zum Überspringen bringen, um das zu erzwingen) – Logik durch sorgfältiges Lesen verifiziert, `runSanityChecks()` zusätzlich gegen echte aktuelle Daten geprüft.

## Offene, noch nicht umgesetzte Punkte
- #12: Punkterechner – QB-Rushing-First-Down-Bonus nachrüsten.
- #13: Punkterechner – DST-Lücken (Forced Fumbles, Safeties, geblockte Kicks) prüfen.
- Bye-Week-Hinweis im Digest (siehe früherer Session-Log): weiterhin zurückgestellt.
- Hall of Fame: wenn die aktuelle Saison (2026) am Ende abgeschlossen ist, muss `data/league-history.json` von Hand um den 2026er-Eintrag ergänzt werden (gleiches manuelles Muster wie 2024/2025) – die Seite zeigt bis dahin die laufende Saison weiterhin live/vorläufig an.

## 6. Hall of Fame erweitert: Ewige Tabelle, Saison-Highlights, Rivalitäten

**Nutzer-Frage:** "welche coolen daten können wir noch in die hall of fame aufnehmen?" – Antwort mit 3 Gruppen (sofort möglich / kumuliert ableitbar / braucht neue Daten) vorgeschlagen. **Nutzer-Antwort:** "ok finde alles gut ausser Trade-Aktivität über die Jahre".

**Umgesetzt (alles ausser Trade-Aktivität):**
- `scripts/sync-espn.mjs`: `board`-Einträge in `power-rankings.json` bekommen ein `id`-Feld (Spieler-ID) – fehlte bisher, nötig für eine zuverlässige Verknüpfung mit `season-stats.json`s `players[id]` (Namensabgleich wäre fehleranfällig). Rein additiv.
- **Ewige Tabelle**: Karriere-Bilanz jedes Teams über alle Saisons (2024/2025 aus `league-history.json` + laufende Saison live aus `standings.json`), sortiert nach Titeln dann Sieg-Quote. ⭐-Badge für Gründungsmitglieder. Punkte bewusst NICHT aufsummiert, da 2024/2025 `pointsFor=null` haben (schon in der bestehenden `league-history.json`-note dokumentiert – eine Teilsumme wäre irreführend gewesen). Callout "Immer nah dran" fürs Team mit den meisten Playoff-Teilnahmen ohne Titel.
- **Diese Saison im Rampenlicht**: 8 live berechnete Kennzahlen der laufenden Saison – längste Sieges-/Niederlagenserie, grösster Blowout/knappster Sieg (aus `scoreboard.json`-Einzelspielen), meiste Überraschungssiege, "Bank-König", bester Draft-Value-Pick und grösster Draft-Flop (Draft-Runde vs. tatsächliche Punkte, via das neue `board[].id`). Bewusst als "diese Saison"-Highlights gerahmt statt "aller Zeiten" – 2024/2025 haben diese granularen Daten nicht, Tracking läuft erst seit dieser Session.
- **Rivalitäten**: Team-Paare mit zwei Begegnungen diese Saison ("Doppel-Duelle"), beide Ergebnisse. Nur laufende Saison – alte Spielpläne sind nicht gespeichert, nur Endstände.

**Bewusst weggelassen:** Trade-Aktivität über die Jahre (Nutzer-Wunsch).

**Getestet:** Playwright mit gemockten Daten über alle drei neuen Sektionen – Ewige Tabelle sortiert korrekt (Titel zuerst, dann Sieg-Quote), Gründungs-Badge korrekt nur bei 2024er-Teams, "Immer nah dran" wählt richtig. Alle 8 Highlights zeigen plausible Mock-Werte. Rivalitäten erkennt beide konstruierten Doppel-Duelle mit korrekter Spiel-für-Spiel-Aufschlüsselung. Mobile-Screenshot (420px) geprüft.

## Offene, noch nicht umgesetzte Punkte (Ergänzung)
- Hall of Fame: sobald mehr Saisons mit dem neuen granularen Tracking vorliegen (ab Saisonende 2026), werden "Diese Saison im Rampenlicht" und "Rivalitäten" zu echten Mehrjahres-Vergleichen ausbaubar – aktuell bewusst auf die laufende Saison beschränkt.

## Nächster Schritt
Nächsten Dienstag beobachten: greift die verschobene Cron-Minute (`:07`)? Falls ein Lauf trotzdem fehlschlägt, greift der neue `fast-retry`-Job? Springt der `daily-check` nur ein, wenn wirklich nötig? (Run-Historie von `espn-sync-watchdog.yml` prüfen.) Ausserdem: `data/suggestion-history.json` weiter beobachten – die ersten Einträge sind jetzt da, Grading (min. 2 Wochen später) greift frühestens ab Woche 4.
