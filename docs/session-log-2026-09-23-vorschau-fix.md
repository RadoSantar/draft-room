# Session-Log: Wochen-Vorschau – falsche Alleinstellungs-Behauptung behoben

**Datum:** 2026-09-23
**Zweck dieser Datei:** Backup/Gedächtnisstütze für den Fall, dass der Chat-Kontext verloren geht. Setzt `session-log-2026-09-22-sync-workflow-fallback.md` fort (dortiger Stand: Sync-Workflow-Fallback + Hall-of-Fame-Erweiterungen fertig).

## 1. Hall of Fame: 4 weitere Saison-Highlight-Kategorien vorgeschlagen (noch nicht umgesetzt)

Nutzer fragte, ob "Diese Saison im Rampenlicht" (aktuell 6 Kategorien) auf 10 erweiterbar wäre. Vorgeschlagen, alle ohne neues Tracking aus `scoreboard.json`/`season-stats.json` berechenbar:
1. Konsistentestes Team ("Mr. Zuverlässig") – geringste Woche-zu-Woche-Punkteschwankung.
2. Wundertüte der Saison – grösste Schwankung (Gegenstück zu 1).
3. Iron Man – Spieler mit den meisten Starter-Wochen ohne Bankzeit.
4. Serien-Dominator – Team mit den meisten Wochen als Liga-Topscorer.

**Noch nicht umgesetzt** – Nutzer ist stattdessen mit einem anderen Anliegen (Vorschau-Fehler, siehe unten) weitergefahren. Bei Gelegenheit nachholen, falls Nutzer zustimmt.

## 2. Wochen-Vorschau: falsche "einziges Team ungeschlagen"-Behauptung

**Nutzer-Feedback:** "die aktuelle preview zu woche 3 gefällt mir sehr gut wie es geschrieben ist es hat sich aber ein kleiner fehler eingeschlichen zürich city ravens sind nicht das einzige team mit blütenreiner weste tm06 & Apukalypse now haben ebenfalls noch keine Niederlage erlitten"

**Befund:** Der Live-Text behauptete "Die Zurich City Ravens fliegen als einziges Team mit blütenweisser Weste in Woche 3" – tatsächlich waren TM06 und Apukalypse Now ebenfalls 2-0. Interner Widerspruch: derselbe Text erwähnte TM06 später korrekt als "ungeschlagene AFC-Spitzenreiterin".

**Root Cause:** `buildWeekPreviewPrompt()` in `generate-recaps.mjs` gab pro Spiel nur die Bilanz der 2 beteiligten Teams mit (`homeRecord`/`awayRecord`). Über die 5 Spielzeilen verteilt waren zwar alle 10 Team-Bilanzen im Prompt enthalten, aber Claude musste sie selbst gegeneinander abgleichen, um eine Exklusivitäts-Aussage korrekt zu treffen – und hat sich dabei verzählt (reine Fliesstext-Synthese ohne strukturierte Vor-Berechnung ist bei Cross-Team-Vergleichen fehleranfällig).

**Fix, zwei Ebenen:**
1. **Daten-Ebene (robust):** `buildWeekPreviewPrompt()` berechnet jetzt VORAB über alle Spiele der Woche, welche Teams ungeschlagen sind, und gibt einen fertigen, unmissverständlichen Fakt vor – entweder "X ist das einzige ungeschlagene Team" (bei genau 1) oder "Y Teams sind ungeschlagen: ... – KEINES davon ist das einzige" (bei mehreren). Nimmt Claude die Cross-Team-Zählarbeit ab, statt sie ihm nur per Anweisung aufzutragen.
2. **Prompt-Ebene (Verteidigung in der Tiefe):** `WEEK_PREVIEW_SYSTEM_PROMPT` um eine generelle Anweisung ergänzt, nie eine unbelegte Alleinstellung ("einziges Team", "als Einzige(r)") zu behaupten – falls derselbe Zählfehler bei einer anderen Kategorie (z.B. Serien) auftreten sollte.

`data/week-previews.json`s Woche-3-Eintrag gelöscht, Sync manuell angestossen, sofort neu generiert. **Neuer Text korrekt:** "Gleich drei Teams – Apukalypse Now, Zurich City Ravens und TM06 – ziehen mit weisser Weste in Woche 3…"

**Getestet:** `computeUnbeaten()`-Logik separat mit den echten Woche-3-Bilanzen durchgerechnet (Zurich City Ravens, TM06, Apukalypse Now je 2-0) – liefert jetzt korrekt alle 3 Teams. Live-Regeneration verifiziert (Text oben).

## 3. Neue Startseite `start.html` – mobile Navigation optimiert

**Nutzer-Wunsch:** "ich möchte gern die handy navigation weiter optimieren, wie wärs mit einer zusätzlichen neuen startseite zu oberst kommt der button wähle dein team dann kann man das design auswählen und danach Buttons die zu den Seiten führen also zuerst mein Team, Spielplan, power rankings, dann die grosse seite mit der übersicht und allem, hall of fame, draftboard"

Auf Nachfrage (AskUserQuestion) bestätigt: `start.html` soll die **echte Homepage** werden – Logo-Klick auf allen Seiten und die installierte PWA (`manifest.json` `start_url`) führen künftig dorthin. `index.html` bleibt inhaltlich unverändert, wird aber zu einem Navigationsziel statt impliziter Startseite.

**Umsetzung (Plan-Mode, Plan von Nutzer per ExitPlanMode bestätigt):**
- Neue Datei `start.html`: schlanker Header (nur Branding, kein Link, kein Hamburger-Menü – die Seite IST ja schon die Navigation), drei Abschnitte im `<main>`:
  1. **Wähle dein Team** – grosses `<select id="syncTeamSelect">` + Status, verdrahtet mit `initSyncBar()`.
  2. **Design auswählen** – bestehendes `.theme-picker`-Markup (Ball/Logo-Preview + Select), grösser gestylt, verdrahtet mit `initThemePicker()`.
  3. **Navigation** – 6 grosse, einspaltige Karten in exakt der gewünschten Reihenfolge: Mein Team → Spielplan → Power Rankings → Übersicht (index.html) → Hall of Fame → Draft Board, Taglines aus bestehenden Seitenbeschreibungen übernommen.
- `my-team.html`, `draft-board.html`, `schedule.html`, `power-rankings.html`, `hall-of-fame.html`: Logo-Link (`title-group`) zeigt jetzt auf `start.html` statt `index.html`.
- `index.html`: Logo (`title-group`) war bisher kein Link (index.html war ja "Home") – jetzt `<a href="start.html">`.
- `manifest.json`: `start_url` von `./index.html` auf `./start.html` geändert.
- Bewusst unverändert: die "← Übersicht"-Links in jeder Tool-Seite (zeigen auf spezifische Guide-Anker wie `index.html#draft-tipps`), sowie `index.html`s eigener Inhalt.

**Getestet (Playwright, lokaler `http.server`, Mobile-Breite 420px):**
- Team-Sync-Select zeigt Platzhalter + alle 10 Liga-Teams.
- Theme-Select zeigt 32 NFL-Teams + Platzhalter; Auswahl setzt `data-team-theme` und ändert sichtbar Header-Hintergrundfarbe (getestet mit Carolina Panthers).
- Alle 6 Nav-Karten haben exakt die richtigen `href`s in der richtigen Reihenfolge.
- Logo-Links auf allen 6 betroffenen Seiten zeigen jetzt korrekt auf `start.html`.
- `manifest.json` parst korrekt mit neuem `start_url`.
- "← Übersicht"-Deep-Links (z.B. `index.html#draft-tipps`) unverändert bestätigt.
- Mobile-Screenshot visuell geprüft: keine Überlappung, gute Tap-Ziele, sauberes einspaltiges Layout.

Commit `489ee33`, gepusht.

## Offene, noch nicht umgesetzte Punkte
- #12: Punkterechner – QB-Rushing-First-Down-Bonus nachrüsten.
- #13: Punkterechner – DST-Lücken (Forced Fumbles, Safeties, geblockte Kicks) prüfen.
- Bye-Week-Hinweis im Digest: weiterhin zurückgestellt (siehe früherer Session-Log).
- Hall of Fame: 4 weitere Saison-Highlight-Kategorien (siehe Punkt 1 oben) – warten auf Nutzer-Zustimmung.
- Hall of Fame: sobald die 2026er-Saison abgeschlossen ist, `data/league-history.json` von Hand ergänzen.

## Nächster Schritt
Nutzer könnte auf die vorgeschlagenen 4 Hall-of-Fame-Kategorien zurückkommen – bei Zustimmung direkt umsetzen (Muster wie die vorherigen 6 Kategorien: computeSeasonHighlights() in hall-of-fame.html erweitern). Ansonsten: weiter die Sync-Workflow-Zuverlässigkeit (Cron-Minute-Offset, Fast-Retry, Sanity-Check) über die nächsten Dienstage beobachten. Neue Startseite `start.html` ist live – bei Gelegenheit Nutzer-Feedback dazu einholen (z.B. ob Reihenfolge/Wortlaut der Karten passt).
