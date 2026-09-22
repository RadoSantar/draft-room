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

## Offene, noch nicht umgesetzte Punkte
- #12: Punkterechner – QB-Rushing-First-Down-Bonus nachrüsten.
- #13: Punkterechner – DST-Lücken (Forced Fumbles, Safeties, geblockte Kicks) prüfen.
- Bye-Week-Hinweis im Digest (siehe früherer Session-Log): weiterhin zurückgestellt.

## Nächster Schritt
Nächsten Dienstag beobachten, ob die verschobene Cron-Minute (`:07`) das Problem behebt bzw. ob der Watchdog je einspringen muss (Log/Run-Historie von `espn-sync-watchdog.yml` prüfen). Ausserdem: `data/suggestion-history.json` weiter beobachten – die ersten Einträge sind jetzt da, Grading (min. 2 Wochen später) greift frühestens ab Woche 4.
