# Session-Log: Standings-Label-Feedback, Mein Team auf echten Punkten statt Projektion

**Datum:** 2026-09-16
**Zweck dieser Datei:** Backup/Gedächtnisstütze für den Fall, dass der Chat-Kontext verloren geht. Setzt `session-log-2026-09-15-vorschau-und-fixes.md` fort (dortiger Stand: Woche 2 abwarten, dann `archiveSeasonStats()` + alle neuen Fakten-Kategorien gegen echte Daten verifizieren).

## 1. Standings: "Kass." → "PA"

Nutzer fand die Abkürzung "Kass." (kassiert) für "points against" unklar. Per `AskUserQuestion` vier Alternativen angeboten (PA, Gegenpunkte, Zugelassen, Gegnerpunkte) – Nutzer hat "PA" gewählt (wie im englischen Original PF/PA, unter Fantasy-Spielern verbreitet). `schedule.html`: `.standings-pf-sub` Text von "Kass. / Diff" zu "PA / Diff" geändert. "Erzielt" als Haupt-Label unverändert gelassen (nicht Teil der Rückmeldung).

## 2. Mein Team: Trade-/Drop-Tipps jetzt auf Basis echter Saisonpunkte statt nur Projektion

**Nutzer-Beobachtung:** Die Trade- und Drop-Vorschläge auf `my-team.html` richteten sich weiterhin komplett nach der statischen Preseason-Projektion (`proj`), obwohl längst echte Ergebnisse vorliegen – Idee (laut Nutzer schon mal besprochen, aber nicht in den bisherigen Session-Logs dokumentiert): sobald echte Punkte da sind, sollten Bewertung und Tipps darauf umschwenken.

**Kernidee der Lösung:** Neue `playerValue(p)`-Funktion in `my-team.html`. Sobald ein Spieler mindestens `MIN_GAMES_FOR_REAL = 2` echte Auftritte (Start ODER Bank) in dieser Saison hat, wird sein `proj` durch eine Rest-Saison-Schätzung ersetzt:
```
realValue = totalPoints (bisher erzielt) + (totalPoints / gamesPlayed) × geschätzte verbleibende Wochen (15 - lastCompletedWeek)
```
Bleibt bewusst auf derselben Grössenordnung wie `proj` (Saison-Gesamtsumme), damit ein "echter" Spieler und ein noch "projizierter" Spieler in derselben Trade-Idee direkt vergleichbar bleiben – kein Skalen-Bruch.

**Wo überall umgestellt** (alles was in `my-team.html` bisher `p.proj` direkt für Werteberechnung nutzte):
- `tradeValue()`/`packageValue()` – Kern der Trade-Fairness-Berechnung.
- `weakestBenchDrop()` – Drop-Kandidat wird jetzt nach echtem Wert bestimmt, nicht mehr nach Preseason-Hype.
- Bench-Sortierung/-Anzeige in `renderRoster()`.
- Free-Agent-Sortierung/-Anzeige in `fetchFreeAgents()`/`renderFreeAgents()` (auch für früher rostered, jetzt gedroppte Free Agents funktionsfähig, da `season-stats.json` per `playerId` unabhängig vom aktuellen Rosterstatus gespeichert wird – nur nie-rostered-gewesene FAs bleiben zwangsläufig proj-only).
- `bestIdeaForShape()` – Auswahl der Trade-Zielspieler beim anderen Team.
- `tradeSidePlayersHtml()` – Anzeige in den Trade-Karten.

**Bewusst NICHT umgestellt:** Die "Positions-Stärke im Vergleich zum Liga-Schnitt"-Tabelle (`renderAnalysis`, aus `power-rankings.json`s `posTotals`) und die Starter-Anzeige – beide bleiben proj-basiert, weil `posTotals` serverseitig in `sync-espn.mjs` für die POWER-RANKINGS-Seite berechnet wird (eigene, bewusst von echten Ergebnissen unabhängige Kennzahl "Kader-Stärke laut Draft", siehe deren eigene Seite) – eine Änderung dort hätte über `my-team.html` hinaus auch `power-rankings.html` verändert, was nicht angefragt war. Nutzer-Anfrage war explizit auf "Trade und Drop Tipps" begrenzt.

**Visuelle Kennzeichnung:** Werte, die auf echten Punkten basieren, erscheinen amber (passend zur bestehenden Farbkonvention der Seite für "echt/live" – siehe `.standings-pf`/`.sched-score`), alle anderen bleiben in der bisherigen neutralen Farbe. Bei Free-Agent-Karten wechselt zusätzlich das Text-Label von "Proj." zu "Ø-Saison". Neuer Satz im bestehenden Hinweis-Kasten oben auf der Seite erklärt das Verhalten kurz.

### sync-espn.mjs: `archiveSeasonStats()` erweitert

Bisher trackte `players[id].totalPoints`/`starterWeeks` NUR Starts (aus der letzten Session, für `findSeasonDraftValueFact`/`findIronManFact`). Für "Mein Team" braucht es aber die ECHTE Gesamtproduktion eines Spielers unabhängig von Aufstellungs-Entscheidungen (ein guter Spieler, der mal auf der Bank sass, ist nicht automatisch schlechter). Umgestellt: `totalPoints`/`gamesPlayed` zählen jetzt JEDEN Auftritt (Start oder Bank), `starterWeeks` bleibt separat nur für echte Starts (weiterhin korrekt für `findIronManFact`). `findSeasonDraftValueFact()` entsprechend von `starterWeeks` auf `gamesPlayed` als Durchschnitts-Divisor umgestellt (sonst hätte das Mischen von Bank-Punkten in `totalPoints` bei unverändertem `starterWeeks`-Divisor den Schnitt verzerrt).

Migrationssicher gebaut (gleiches Merge-Pattern wie beim Team-Stats-Bugfix von gestern): bestehende Spieler-Einträge aus Woche 1 (nur `bestPoints`/`bestWeek`) bekommen die neuen Felder beim nächsten Auftritt sauber nachgetragen statt NaN zu produzieren.

**Bekannte Einschränkung (dokumentiert, kein Bug):** Woche 1 ist schon in `weeksArchived` und wird nie erneut verarbeitet – `totalPoints`/`gamesPlayed` fehlt also für jeden Spieler dauerhaft der Woche-1-Beitrag. Kein Backfill gemacht (Aufwand/Nutzen), `MIN_GAMES_FOR_REAL=2` bedeutet dadurch praktisch: die echte Bewertung greift frühestens nach Abschluss von Woche 3 (2 gezählte Wochen: 2 und 3). Gleiches Muster wie die bereits dokumentierte Woche-1-Live-Snapshot-Lücke.

**Getestet:** Playwright mit `page.route()`-Interception von `data/season-stats.json` (echte Daten existieren noch nicht, da Woche 2 erst begonnen hat) – zwei synthetische Spieler (einer über-, einer unterperformt ggü. Projektion) korrekt in Bank-Sortierung, Drop-Kandidat-Hinweis und Trade-Karten reflektiert, amber-Markierung an den richtigen Stellen, Zahlen rechnerisch korrekt nachvollzogen.

## Offene, noch nicht umgesetzte Punkte
- #12: Punkterechner – QB-Rushing-First-Down-Bonus nachrüsten.
- #13: Punkterechner – DST-Lücken (Forced Fumbles, Safeties, geblockte Kicks) prüfen.

## Nächster Schritt (Stand Ende dieser Session)
Weiterhin: Woche 2 abwarten, dann beim nächsten Dienstags-Sync verifizieren, dass `archiveSeasonStats()` (jetzt inkl. der `totalPoints`/`gamesPlayed`-Erweiterung für alle Auftritte) und alle neuen Fakten-Kategorien fehlerfrei mit echten Daten laufen. Zusätzlich beobachten: sobald `gamesPlayed >= 2` für die ersten Spieler erreicht ist (voraussichtlich nach Woche 3), live auf `my-team.html` prüfen, ob die "echten" Werte plausibel aussehen und die amber-Markierung wie erwartet erscheint.
