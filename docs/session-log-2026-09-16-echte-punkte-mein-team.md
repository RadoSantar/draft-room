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

## 3. Nutzer-Nachfrage: Woche 1 rückwirkend eintragen + rohen Punkteschnitt separat anzeigen

Zwei Fragen direkt im Anschluss:
1. "Kann man Woche 1 nicht eintragen, die Daten sind ja vorhanden?" – Ja: ESPNs Boxscore-API liefert vergangene Wochen weiterhin ab, `fetchWeeklyKeyMomentsByTeam(week)` ist schon nach Wochennummer parametrisiert. Da Woche 1 die einzige bisher abgeschlossene Woche ist (Woche 2 erst im Gange), ist ein kompletter Reset von `data/season-stats.json` auf die leere Ausgangsstruktur (`weeksArchived: []`) gefahrlos – kein Verdopplungsrisiko, da keine andere Woche betroffen ist. Datei zurückgesetzt und gepusht, danach `espn-sync.yml` per `workflow_dispatch` getriggert (Run-ID `35089004604`) – beim nächsten Lauf verarbeitet `archiveSeasonStats()` Woche 1 komplett neu unter dem aktuellen (vollständigen) Code.
2. "Wäre es gut, neben der Rest-Saison-Schätzung auch den Wert der aktuellen realen Punkte zu haben? Ein aktuell starker Spieler könnte sich in 5 Wochen trotzdem verletzen/einbrechen." – Bestätigt als sinnvoll: `playerValue()` berechnete den Punkteschnitt (`ppg`) schon intern für die Rest-Saison-Hochrechnung, zeigte ihn aber nirgends separat an – die Hochrechnung verschluckte damit genau die Information, die für eine eigene Risikoeinschätzung (hält der Lauf, Verletzungsgefahr) nötig wäre. Jetzt zeigt jede real bewertete Stelle BEIDE Zahlen: die Rest-Saison-Schätzung (treibt weiter Sortierung/Trade-Fairness) UND den rohen `Ø`-Punkteschnitt direkt daneben (`valueHtml()` in `renderRoster`, Free-Agent-Karten, Drop-Hinweis, `tradeSidePlayersHtml()`). Mit Playwright bei 390px und 900px geprüft – "300.0 · Ø20.0" passt ohne Umbruch auf beiden Breiten.

## 4. Bewertungs-Basis als expliziter Toggle statt nur automatisch

Nutzer-Folgewunsch: "Können wir Buttons machen dass man auswählen kann, dass Berechnung und Fairness entweder anhand von Projektion oder Live-Punkteschnitt berechnet wird? Ebenfalls das auch bei den Tipps und wo es sonst noch sinnvoll ist."

Neuer Toggle "Projektion" / "Live-Punkteschnitt" oben auf `my-team.html` (gleiche Pill-Optik wie die `.standings-tab`-Buttons auf `schedule.html`), Wahl persistiert per `localStorage` (`draftroom-value-mode`, try/catch-sicher wie überall sonst in diesem Codebase). `playerValue()` bekommt eine neue erste Weiche: `VALUE_MODE === 'proj'` erzwingt für ALLE Spieler die Projektion (auch wenn echte Daten vorliegen), `VALUE_MODE === 'live'` ist das bisherige automatische Verhalten (echte Daten wo vorhanden ab `MIN_GAMES_FOR_REAL`, sonst Projektions-Fallback).

**Scope-Entscheidung "wo es sonst noch sinnvoll ist":** Wirkt jetzt konsistent auf der GANZEN Seite (Roster-Sortierung inkl. Starter, Positions-Stärke-Analyse, Free-Agent-Empfehlungen, Trade-Ideen), nicht mehr nur bei Trade/Drop wie in der ursprünglichen Anfrage. Neu dafür: `posTotalsForRoster(rosterTeam)`/`computeLeagueAvgLive()` als Live-Pendant zu `power-rankings.json`'s fest proj-basierten `posTotals` (dort direkt aus `ROSTER` clientseitig berechnet). Bewusst NICHT angefasst: `power-rankings.html` selbst bzw. `power-rankings.json`s serverseitige Berechnung – das bleibt die eigenständige "Kader-Stärke laut Draft"-Kennzahl, unabhängig von Live-Ergebnissen (eigene, bereits früher in dieser Session getroffene Design-Entscheidung). `renderAnalysis()` dafür entkoppelt: nimmt jetzt ein plain `myPosTotals`-Objekt entgegen statt direkt den `power`-Team-Eintrag.

Erklärtexte unter jeder Sektion (`mtRosterCopy`, `mtAnalysisCopy`, `mtTradesCopy`, `mtModeCopy`) wechseln automatisch mit dem Modus über `updateModeCopy()`. Dabei eine inhaltliche Korrektur nötig: der bestehende Verweis "derselbe Massstab wie im Trade-Fairness-Kalkulator" (der andere, separate proj-basierte Rechner auf `index.html`) stimmt nur noch im Projektion-Modus – im Live-Modus weggelassen, um keine falsche Gleichheits-Behauptung stehen zu lassen.

**Debugging-Fussnote (kein Code-Bug, sondern Test-Artefakt):** Beim Verifizieren zeigte ein Playwright-Test zunächst scheinbar identische Team-Analyse-Werte in beiden Modi. Nach gezieltem Debug-Logging (temporär eingefügt, danach wieder entfernt) gefunden: `page.route()`-Interception von `data/season-stats.json` überlebt in dieser Playwright-Umgebung keinen `page.reload()` – der zweite (reload-te) Seitenaufruf traf die ECHTE (unveränderte) Datei statt der Mock-Daten, wodurch die künstlichen Test-Spieler nicht mehr gefunden wurden. Mit einem Test ohne `reload()` (nur `goto()`) verschwand der Effekt vollständig – RB-Wert wechselte korrekt von 935.7 (proj) auf 970.3 (live), exakt die erwartete Differenz. Für künftige Playwright-Tests in diesem Repo merken: `page.route()` vor jedem `reload()` neu registrieren, falls ein Reload im Testablauf gebraucht wird.

Getestet: Toggle-Klick wechselt Modus, re-rendert alle Sektionen korrekt, `localStorage`-Persistenz über Reload hinweg verifiziert (Toggle-Zustand selbst, unabhängig vom oben beschriebenen Datenmock-Artefakt, funktioniert einwandfrei).

## 5. Nutzer-Feedback: Toggle erst nicht sichtbar, dann "nur Texte ändern sich, keine Werte"

**Erstes Problem:** Nutzer fand den Toggle auf dem Handy zunächst nicht. Per `curl` gegen die Live-URL (`radosantar.github.io/draft-room/my-team.html`) verifiziert: Markup war korrekt deployed und an der richtigen Stelle (direkt nach der Team-Auswahl, vor dem "Wähle oben dein Team"-Hinweis) – kein Code-Bug. Wahrscheinlichste Ursache: Browser-Cache (gleiches Muster wie beim früheren Header-Umbau, `my-team.html` selbst hat kein Cache-Busting wie die CSS/JS-Dateien). Harter Reload empfohlen – hat funktioniert, Nutzer sah den Toggle danach.

**Zweites Problem:** Nach dem Umschalten änderten sich nur die Erklärtexte, aber keine Zahlen. Kein Bug, sondern Daten-Timing: `data/season-stats.json` hatte zu diesem Zeitpunkt für JEDEN Spieler nur `gamesPlayed:1` (nur Woche 1 abgeschlossen, Woche 2 lief noch), `MIN_GAMES_FOR_REAL` stand aber auf 2 – also fiel aktuell jeder Spieler in BEIDEN Modi auf die Projektion zurück, nur der Text (direkt am Modus hängend) unterschied sich. Nutzer per `AskUserQuestion` gefragt, ob die Schwelle bewusst bei 2 (robuster, wartet auf Woche 2) bleiben oder auf 1 gesenkt werden soll (sofort mit Woche-1-Daten sichtbar, aber verrauschter). Nutzer wollte die Schwelle auf 1 senken.

`MIN_GAMES_FOR_REAL` von 2 auf 1 gesenkt, Disclaimer-Text angepasst (inkl. neuem Hinweis: "bei 1-2 gespielten Wochen ist der Punkteschnitt naturgemäss noch verrauscht – wird zuverlässiger, je mehr Wochen dazukommen"). Mit gemocktem 1-Wochen-Datensatz verifiziert: Live-Modus aktiviert sich jetzt sofort korrekt (amber, abweichende Werte).

## 6. Nutzer-Feedback: Live-Modus ändert Werte, aber nicht die Aufstellung selbst

Echter Bug, kein Missverständnis diesmal: die Starter/Bank-ZUORDNUNG kam weiterhin unverändert aus `roster.json`, wo `buildOptimalLineup()` serverseitig fest nach `proj` rechnet (`scripts/scoring.mjs`) – der Toggle hatte bisher nur die ANGEZEIGTEN Zahlen umgeschaltet, nicht die Frage "wer sollte überhaupt starten".

Fix: client-seitiger Nachbau von `buildOptimalLineup()` (identische `STARTER_SLOTS`-Definition aus `scoring.mjs` kopiert), aber `playerValue()` statt starr `proj` als Sortierkriterium – `buildOptimalLineupByValue()` + `liveOptimizedTeam()`-Wrapper. Jetzt überall eingesetzt, wo eine `roster.json`-Team-Struktur verarbeitet wird: `renderRoster` (eigenes Team), `renderFreeAgents`/`weakestBenchDrop` (Drop-Kandidat), `buildTradeIdeas` (sowohl `myRoster` als auch JEDES andere Team in der Schleife – sonst hätte ein Trade-Vorschlag einen Spieler als "Bankspieler des anderen Teams" angeboten, der dort im Live-Modus eigentlich längst Starter wäre). Im Projektion-Modus identisch zum bisherigen Verhalten (da `playerValue()` dort ohnehin auf `proj` zurückfällt), im Live-Modus kann jetzt ein Bankspieler mit besserer echter Form tatsächlich einen Starter verdrängen.

**Test-Erschwernis:** echte `roster.json`-Projektionswerte drifteten zwischen Testläufen (Hintergrund-Sync-Cron lief währenddessen und aktualisierte live von ESPN geladene Projektionen) – dadurch waren reine "echte Daten"-Tests nicht reproduzierbar. Gelöst durch vollständig kontrolliertes Mock-Roster (auch `roster.json`/`power-rankings.json`/`rostered-ids.json` gemockt, nicht nur `season-stats.json`): Bankspieler mit niedriger Projektion aber grossem Live-Boost wird im Live-Modus korrekt zum Starter, ein bisheriger Starter korrekt zur Bank verdrängt; im Projektion-Modus bleibt die ursprüngliche Aufstellung unverändert. Für künftige Tests dieser Seite gemerkt: bei roster-abhängigen Tests immer `roster.json`+`power-rankings.json`+`rostered-ids.json` gemeinsam mocken, nicht nur `season-stats.json`.

## 7. Nutzer-Feedback: Free-Agent-/Trade-Vorschläge zeigten fast nur QBs

Nutzer-Beobachtung mit klarer eigener Diagnose: "da diese vermutlich am meisten Punkte auf der Position machen" – bereits 2 QBs im Roster (kein dritter nötig, höchstens ein Ersatz), aber RB/WR-Bedarf (theoretisch bis zu 4 RB startbar über 2 RB-Slots + 2 Flex) kam kaum vor; bei K/DST reicht dagegen oft schon 1 rostered.

**Root Cause bestätigt:** "schwächste Position" wurde nach ABSOLUTEM Punkte-Diff zum Liga-Schnitt bestimmt. QB macht in diesem Scoring grundsätzlich viel mehr Rohpunkte als andere Positionen (Team-Summen ~1000 bei QB vs. ~300 bei TE/K vs. ~30 bei DST) – jede kleine relative QB-Schwäche erzeugt einen riesigen absoluten Rückstand, der die Auswahl fast immer dominierte, während ein echtes RB/WR-Loch (kleinerer absoluter, aber grösserer relativer Rückstand) systematisch unterging.

**Fix:** `renderAnalysis()` berechnet jetzt zusätzlich `pctDiff = diff/avg` und sortiert danach statt nach absolutem `diff` – sowohl für die "Schwächste Position(en)"-Anzeige als auch für `targetPositions` in `renderFreeAgents()`/`buildTradeIdeas()`. Tabelle zeigt Punkte-Diff UND Prozent nebeneinander (`.delta-pct`, gleiches gedämpfte Sub-Text-Muster wie bei `.standings-pf-sub`/`.proj-sub`). `targetPositions`-Anzahl von 2 auf 3 erhöht für mehr Positionsvielfalt pro Ansicht. Team-Analyse-Erklärtext ergänzt, warum die Prozentzahl (nicht die reine Punktezahl) die Auswahl treibt.

**Bewusst nicht umgesetzt** (Scope-Reduktion): keine explizite "Ziel-Rostertiefe pro Position" (QB=2, RB=4 etc., wie vom Nutzer selbst skizziert) als zusätzliches Kriterium – die prozentuale Umstellung allein löst das geschilderte Problem bereits direkt und ohne zusätzliche Heuristik-Komplexität; falls sich in der Praxis zeigt, dass das nicht reicht (z.B. Position taucht trotz voller Tiefe weiter auf), wäre das der nächste Ausbauschritt.

**Verifiziert** mit vollständig kontrolliertem Mock (QB: -100 Punkte absolut / -10% relativ, RB: -60 Punkte absolut / -12% relativ – kleinerer absoluter, aber grösserer relativer Rückstand): Tabelle zeigt beide Prozentwerte korrekt, "Schwächste Positionen"-Text listet RB jetzt korrekt VOR QB trotz kleinerem absoluten Rückstand – exakt das vom Nutzer beschriebene Szenario aufgelöst.

## Offene, noch nicht umgesetzte Punkte
- #12: Punkterechner – QB-Rushing-First-Down-Bonus nachrüsten.
- #13: Punkterechner – DST-Lücken (Forced Fumbles, Safeties, geblockte Kicks) prüfen.
- Falls die prozentuale Umstellung in der Praxis nicht ausreicht: explizite Ziel-Rostertiefe pro Position (QB=2, RB/WR=4, TE=2, K/DST=1) als zusätzliches Kriterium nachrüsten.

## Nächster Schritt (Stand Ende dieser Session)
Läuft gerade: `espn-sync.yml`-Run `35089004604` (Woche-1-Backfill) verifizieren – Job-Logs auf Fehler prüfen, danach `data/season-stats.json` inhaltlich inspizieren (insbesondere ob `players[id].totalPoints`/`gamesPlayed`/`starterWeeks` und die neuen Team-Felder wie `longestWinStreak`/`closeWins` für Woche 1 jetzt korrekt befüllt sind, keine NaN-Werte). Danach: Woche 2 abwarten, dann beim nächsten Dienstags-Sync erneut verifizieren, dass alles mit echten Woche-2-Daten fehlerfrei weiterläuft. Sobald `gamesPlayed >= 2` erreicht ist (jetzt schon ab Wochenabschluss 2 möglich dank Backfill, statt erst ab Woche 3), live auf `my-team.html` prüfen, ob die "echten" Werte inkl. Punkteschnitt-Anzeige plausibel aussehen.
