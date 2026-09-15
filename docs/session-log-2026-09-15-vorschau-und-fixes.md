# Session-Log: Redundanz-Fix, neue Fakten-Kategorien, Wochen-Vorschau, Spielplan-Aufräumen

**Datum:** 2026-09-15
**Zweck dieser Datei:** Backup/Gedächtnisstütze für den Fall, dass der Chat-Kontext verloren geht. Setzt `session-log-2026-09-14-recaps.md` fort – dort endete der Stand bei "Warten auf den ersten echten Sync-Lauf".

## 1. Redundanz-Fix: Bank-Thema tauchte in fast jedem Recap auf

Nach dem ersten echten Sync-Lauf für Woche 1 zeigte sich: 4 von 5 Recaps drehten sich ums Bank-Thema (Bank-Reue, Aufstellungs-Patzer), obwohl das Rotationssystem aus der Vortagssession genau das verhindern sollte. Root-Cause-Kette:

1. **Fakten waren korrekt getaggt**, aber `loserBenchRegret`/`winnerBenchRegret` liefen als zwei separate Kategorien mit je eigenem Budget → beide konnten unabhängig voneinander ausgewählt werden.
2. Selbst nach Gruppierung dieser beiden: **`pickBadge()` lief komplett unabhängig vom Fakten-Cap-System** – ein Bank-Spitzname (z.B. "Die Bank wusste es besser") konnte feuern, obwohl der zugehörige Fakt selbst gar nicht ausgewählt wurde.
3. Nach Anbindung der Badges ans Cap-System: **Fallback-auf-unfiltered-Kategorien** in `pickBadge` unterlief den Cap trotzdem, wenn alle "frischen" Kategorien aufgebraucht waren → entfernt (Badges dürfen bei Cap-Erschöpfung einfach ausfallen, Fakten nicht – ein fehlender Spitzname fällt weniger auf als ein wiederholtes Thema).
4. Noch eine dritte, technisch getrennte Bank-Kategorie gefunden (`optimalLineupGap`, hinter "Die Bank wusste es besser") → auch ins gemeinsame Budget aufgenommen.

**Code (`scripts/generate-recaps.mjs`):**
```js
const CATEGORY_GROUP = {
  loserBenchRegret: 'benchRegret',
  winnerBenchRegret: 'benchRegret',
  optimalLineupGap: 'benchRegret',
  seasonBenchTotal: 'benchRegret'
};
function groupOf(category) { return CATEGORY_GROUP[category] || category; }
```
`BADGE_CATEGORY_TO_FACT_CATEGORY` verknüpft jede Badge-Kategorie mit ihrer zugrundeliegenden Fakten-Kategorie, `pickBadge(game, wasUpset, margin, categoryUsage, capPerCategory)` respektiert jetzt denselben `categoryUsage`-Tracker wie `pickFactsForGame`.

**Nebenbefund:** Die reichhaltigeren Prompts (mehr Fakten-Varianz) sprengten bei 2 von 5 Woche-1-Recaps das `max_tokens`-Limit (600) → auf 900 erhöht.

**Ergebnis (echte Woche-1-Daten):** von 4/5 auf 2/5 Bank-Erwähnungen reduziert; die verbleibenden zwei kombinieren Bank-Inhalt mit echten neuen Geschichten (`leagueBestPosition`, `perfectWeekProximity`). Woche 1 hat naturgemäss wenig Fakten-Varianz (keine Saison-Historie) – sollte sich ab Woche 2 automatisch weiter verbessern.

## 2. 13 neue Fakten-Kategorien ("mach direkt alles")

Auf Wunsch alle vorgeschlagenen Kategorien (ohne Historie + mit Historie + eigene Ideen) direkt umgesetzt, in `scripts/sync-espn.mjs` (`find*Fact()`-Funktionen, direkt vor `findKeyMoments`) und `scripts/generate-recaps.mjs` (`collectFacts` + `BADGE_POOL`):

- **Ohne Historie nötig:** `powerRankMovement`, `leagueBestPosition`, `marginExtreme`, `positionalFlop`, `waiverInstantSuccess`, `chalk`
- **Mit Saison-Historie:** `formTrend`, `positionalSlump`, `seasonBenchTotal`, `tradeImpact`, `consistency`
- **Eigene Ideen:** `upsetTally`, `perfectWeekProximity`

Dafür neu: **`data/season-stats.json`** (Seed `{"lastUpdated":null,"weeksArchived":[],"teams":{},"players":{}}`), gefüllt via `archiveSeasonStats(week, enrichedGames, keyMomentsByTeam)` in sync-espn.mjs – idempotent über `weeksArchived`-Array (gleiches Muster wie `archiveLiveSnapshotWeek`). Trackt pro Team `benchGapTotal`/`upsetWins`/`positions`, pro Spieler `bestPoints`/`bestWeek`.

Nebenbei mitgezogen, weil für `tradeImpact`/Waiver-Fakten gebraucht: TRADE-Transaktionen haben jetzt strukturierte `legs` (`[{teamId, gainedIds, lostIds}, ...]`), FREEAGENT-"add"-Transaktionen haben jetzt `teamId`/`playerId` (vorher nur "drop").

## 3. Wochen-Vorschau (neues Feature)

Wunsch: eine Vorschau im Stil des Wochen-Recaps, die vor dem ersten Spiel des Spieltags erscheint – forward-looking, nicht rückblickend.

**Kernentdeckung:** `data/scoreboard.json` enthält bereits alle 15 Wochen inkl. noch nicht gespielter (mit `winner:"UNDECIDED"`), dadurch kein separates Schedule-Parsing nötig.

**`scripts/generate-recaps.mjs`:**
- `WEEK_PREVIEW_SYSTEM_PROMPT` – Konjunktiv/Futur, explizites Verbot "erfinde KEINE Ergebnisse".
- `collectPreviewFacts(game)` – nur pre-game-sichere Fakten: `streak`, `confStanding`, `playoffRace`, `expectation`, `rematch` (forward-looking umformuliert).
- `pickFactsForGame(...)` bekam einen optionalen `factCollector`-Parameter, damit Recap und Vorschau dieselbe Dedup-Logik teilen.
- `buildWeekPreviewPrompt(games)` / `export async function generateWeekPreview(games, existingPreviews)` – idempotent über `existingPreviews[week]`, analog zu `generateWeekRecap`.

**`scripts/sync-espn.mjs`:**
- `buildPreviewMoments(game, ctx)` – nutzt nur bereits als "pre-game-sicher" verifizierte, bestehende Fakten-Funktionen (`findStreakFact`, `findConferenceStandingFact`, `findPlayoffRaceFact`, `findExpectationFact`, `findRematchFact` – keine davon hängt vom aktuellen Spielstand ab).
- Neuer, von `lastCompletedWeek > 0` **unabhängiger** Block direkt nach dem Recap-Abschnitt in `main()`: ermittelt `upcomingWeek = lastCompletedWeek + 1`, prüft ob alle Spiele dieser Woche noch `UNDECIDED` sind, baut daraus die Preview-Games (inkl. Bilanz, Vorschau-Stärke-Favorit) und ruft `generateWeekPreview` auf. Läuft auch korrekt vor Saisonstart (`lastCompletedWeek=0` → `upcomingWeek=1`).
- Neue Datei **`data/week-previews.json`**.

**`schedule.html`:** `.week-preview`-CSS (gleiche Kartenoptik wie `.week-recap`), `weekPreviewHtml(wk)` + `loadWeekPreviews()`, direkt unter dem Wochen-Recap im jeweiligen Wochenblock gerendert.

**Timing-Glück:** `espn-sync.yml` läuft nur dienstags – dadurch generiert derselbe Lauf, der den Recap der gerade abgeschlossenen Woche baut, automatisch auch die Vorschau der kommenden Woche. Kein separater Cron nötig.

**Live verifiziert** (Sync-Lauf 2026-09-15, Run-ID 35006709744): Woche-2-Vorschau erfolgreich erzeugt ("Woche 2 wird zum grossen Härtetest für die Verlierer..."), sauber in `data/week-previews.json` gelandet, korrekt in `schedule.html` gerendert (Playwright-Check bei 390px/720px).

## 4. Spielplan: aktuelle Woche rutscht nach oben, vergangene eingeklappt

Nutzer-Feedback: mit fortschreitender Saison wird die Liste aller 15 Wochen unübersichtlich, man muss scrollen. Wunsch: ab Mittwoch (Tag nach dem Dienstags-Sync) soll der aktuelle Spieltag nach oben rutschen, der vergangene eingeklappt werden.

**`schedule.html`:**
- `weekRevealDate(w)` – berechnet aus `WEEK_DATES[w]` (Format "DD.MM.–DD.MM.YYYY") das Start-Datum der Woche minus 1 Tag (= i.d.R. Mittwoch, da NFL-Wochen meist Do–Mo laufen).
- `computeCurrentWeek()` – höchste Wochenzahl, deren `weekRevealDate` bereits erreicht ist.
- `render()` sortiert jetzt: **aktuelle Woche zuerst**, dann **kommende Wochen aufsteigend**, dann **vergangene Wochen absteigend** (neueste zuerst), Letztere in `<details class="sched-week-collapsed">` gewrappt (Standard: zugeklappt, mit ▸-Pfeil-Indikator).
- Team-Filter (`applyFilter`) funktioniert unverändert weiter, da `.sched-week` sowohl auf `<div>` als auch auf `<details>` sitzt (Selektor ist elementunabhängig).

**Verifiziert per Playwright** mit gemocktem `Date` (simuliert Mitte Woche 6): Reihenfolge korrekt (6, 7–15, dann 5→1 eingeklappt), Auf-/Zuklappen funktioniert, Team-Filter funktioniert weiter, mobile Ansicht (390px) korrekt.

## 5. Wochen-Vorschau erst ab Mittwoch sichtbar

Folge-Wunsch: die Vorschau wird zwar schon dienstags generiert, soll aber – konsistent mit Punkt 4 – ebenfalls erst ab Mittwoch angezeigt werden (nicht schon Dienstagnachmittag, sobald der Sync durchgelaufen ist).

`weekPreviewHtml(wk)` nutzt jetzt dieselbe `weekRevealDate(wk.w)`-Funktion wie `computeCurrentWeek()` und gibt `''` zurück, solange das aktuelle Datum davor liegt.

**Verifiziert per Playwright** (gemocktes Datum): Dienstag → 0 Vorschau-Elemente im DOM, Mittwoch/Donnerstag → 1 Element sichtbar.

## 6. Standings: kassierte Punkte + Differenz ergänzt

`data/standings.json` enthielt `pointsAgainst` schon seit längerem (Sync-Skript liefert es mit), die Tabelle in `schedule.html` zeigte bisher aber nur `pointsFor` ("Punkte"). Statt einer zusätzlichen vollen Spalte (auf Mobile bei 390px kein Platz mehr – die bestehenden 4 Spalten neben dem Teamnamen sind schon eng) wurde die bestehende Punkte-Spalte zweizeilig gemacht: erzielte Punkte oben (wie bisher, amber/gross), kassierte Punkte + Differenz (`+47.5`/`-30.0` etc.) klein darunter (`.standings-pf-sub`). Diff wird clientseitig berechnet (`pointsFor - pointsAgainst`), keine Backend-/Sync-Änderung nötig. Mit Playwright bei 390px und 1200px geprüft – passt sauber ohne Umbruch.

## 7. Neues Stats-Ökosystem: 8 weitere Fakten-Kategorien

Nutzer wollte mehr NFL-artige Statistiken ("für alles gibt's irgendeine Statistik"), auf Vorschlag hin direkt alles umgesetzt (ausser Punkt D, siehe unten). Acht neue `find*Fact()`-Funktionen in `sync-espn.mjs` (direkt vor `findKeyMoments`, Kommentarblock "Weitere Statistik-Kategorien"):

- **`findLongestStreakFact`** – Saison-Serien-Rekord (unabhängig von ESPNs eigener, sich bei jedem Serienende zurücksetzender `streakLength`).
- **`findMarginTallyFact`** – Häufung knapper (<5pt) bzw. deutlicher (>30pt) Spiele über die Saison.
- **`findScoringLeaderTallyFact`** – wie oft Wochen-Highscorer/-Lowscorer der ganzen Liga.
- **`findIronManFact`** – Starter, der bisher jede Woche in der Aufstellung stand.
- **`findTopWeeklyPerformanceFact`** – "Mount Rushmore": Standout dieser Woche knackt die Top-4-Einzelwochenleistungen der Liga-Geschichte.
- **`findSeasonMilestoneFact`** – Team knackt eine runde Saison-Punkte-Marke (250er-Schritte).
- **`findSeasonDraftValueFact`** – saisonlange (statt nur wochenweise) Draft-Value-Bilanz.
- **`findLeagueActivityFact`** – Team mit den meisten Waiver-/Trade-Bewegungen der Saison.

Dafür `archiveSeasonStats()` erweitert um: Serien-Tracking (`curStreakType/Len`, `longestWinStreak/longestLossStreak`), Margen-Zähler (`closeWins/closeLosses/blowoutWins/blowoutLosses`), Wochen-Highscorer/-Lowscorer-Flags, kumulierte Spieler-Gesamtpunkte + Starter-Wochen (`players[id].totalPoints/starterWeeks`), sowie `records.topWeeklyPerformances` (liga-weite Top-4-Liste, nach jeder Woche neu sortiert/gekappt).

**Bug gefunden und gefixt vor dem Push:** `teamStat()` initialisierte die neuen Felder nur bei komplett NEUEN Team-Einträgen. Für die 10 bereits existierenden Teams (aus früheren Sync-Läufen vor diesem Feature) fehlten die Felder, wodurch z.B. `t.closeWins++` auf `undefined` zu `NaN` geworden wäre – und ab dann für immer `NaN` geblieben wäre. Gefixt durch ein migrationssicheres Merge-Pattern (`{ ...defaults, ...(stats.teams[teamId] || {}) }`), das fehlende Felder bei bestehenden Einträgen nachträgt. Dabei ebenfalls beachtet: `positions: {}` darf NICHT aus einer geteilten äusseren Konstante gespreadet werden, sonst würden alle in einem Lauf neu angelegten Teams dieselbe Objektreferenz teilen – stattdessen wird das Default-Objekt pro Aufruf frisch inline erzeugt.

In `generate-recaps.mjs`: alle 8 Kategorien in `collectFacts()` (Fliesstext-Templates), `BADGE_POOL` (neue Spitznamen: `seasonStreakRecord`, `closeSpecialist`/`blowoutSpecialist`, `scoringLeaderHigh`/`Low`, `ironMan`, `mountRushmore`, `milestone`, `activeManager`), `BADGE_CATEGORY_TO_FACT_CATEGORY` und `pickBadge()` verdrahtet. `CATEGORY_GROUP` um zwei Einträge ergänzt: `longestStreak` teilt sich das Budget mit `streak` (gleiches Thema, nur Saison-Rekord- statt Wochen-Variante), `seasonDraftValue` teilt sich das Budget mit `draftValue`.

Getestet via gemocktem Claude-API-Call (Muster wie beim Redundanz-Fix): einzelnes Spiel mit allen 8 neuen Feldern → korrekt im Prompt gerendert, Cap-Mechanismus wählt wie erwartet nur 2 Fakten aus; 5-Spiele-Woche mit identischen Fakten in jedem Spiel → Cap verteilt korrekt über die Spiele (mit dem erwarteten Fallback-Verhalten bei künstlich niedriger Fakten-Vielfalt, analog zum bereits bekannten Verhalten des bestehenden Systems).

## 8. Punkt D (Rivalitäten & Liga-Historie) – Infrastruktur vorbereitet, wartet auf Nutzer-Daten

ESPNs History-Seite (`fantasy.espn.com/football/league/history?leagueId=686672943`) liess sich nicht automatisiert auslesen (WebFetch bekam nur die statische Seiten-Hülle, die eigentlichen Daten laden per JS nach Login nach). Nutzer hat angeboten, Screenshots aus der App für Saison 2024 & 2025 zu schicken.

Neu angelegt: **`data/league-history.json`** (Platzhalter-Schema: `{ lastUpdated: null, seasons: {}, note: "..." }`) – wird befüllt, sobald die Screenshots da sind. Noch KEINE Fakten-Funktionen dafür geschrieben (macht ohne echte Daten keinen Sinn) – das folgt, sobald Vorsaisons-Standings/Meister bekannt sind (z.B. "Titelverteidiger", "seit Saison 2024 nicht mehr gegen X verloren", Mehrjahres-Head-to-Head).

**Verifikation des Stats-Ökosystems:** Ein echter `espn-sync.yml`-Lauf nach dem Push war fehlerfrei (Job-Logs geprüft), aber `archiveSeasonStats()` griff dabei noch nicht wirklich, weil Woche 2 zum Zeitpunkt des Laufs noch nicht abgeschlossen war (`lastCompletedWeek` unverändert bei 1) – die neue Logik bekommt ihren ersten echten Testlauf erst beim nächsten Dienstags-Sync nach Abschluss von Woche 2. `data/season-stats.json` wurde beim Testlauf nicht verändert (korrekt, da der ganze Recap-Block übersprungen wird) – noch offen/zu beobachten.

**Update, noch im selben Gespräch:** Nutzer hat zwei ESPN-App-Screenshots der Liga-Historie geschickt (Saison 2024 und 2025, jeweils Champion/2./3. Platz + komplette Endtabelle mit 6 Teams). Direkt in `data/league-history.json` eingetragen:
- **2024**: Champion Tackleberry Finn, 2. Saints of Anarchy, 3. Lord of the Rings (Team existiert im aktuellen 2026er-Kader nicht mehr – keine Annahme über Umbenennung getroffen).
- **2025**: Champion Zurich City Ravens, 2. Tackleberry Finn, 3. Sherlock Mahomes.

**Wichtige Korrektur vom Nutzer selbst:** Die Team-Reihenfolge in ESPNs History-Ansicht ist die finale PLAYOFF-Platzierung, nicht nach Regular-Season-Bilanz sortiert – 2025 hatte Sherlock Mahomes mit 13-2 die mit Abstand beste Bilanz der Liga, landete laut Bracket-Ergebnis aber nur auf Rang 3, während Tackleberry Finn mit nur 6-9 bis ins Championship-Spiel kam (Rang 2). Schema deshalb von `standings` (hätte Bilanz-Sortierung impliziert) auf `finalStandings` mit explizitem `rank`-Feld umbenannt, plus deutlicher Hinweis-Kommentar in der Datei selbst, damit das nicht später fälschlich als bilanz-sortierte Tabelle missverstanden wird. `pointsFor` war in beiden Screenshots nicht ersichtlich, bewusst `null` gelassen statt geraten. Beide Saisons hatten offenbar nur 6 Teams (Wachstum auf die aktuellen 10 muss zwischen 2025 und 2026 passiert sein).

**Weitere Updates, noch im selben Gespräch:**
- Nutzer hat den kompletten 2025er-Playoff-Bracket nachgeliefert (Woche 16 Halbfinale + Woche 17 Finale/3.-Platz-Spiel/5.-Platz-Spiel, mit Seeds und echten Scores) → in `league-history.json` unter `seasons.2025.playoffs` eingetragen. Bestätigt/erklärt die schon vorhandenen `finalStandings`: Seed-1 Sherlock Mahomes (13-2) verlor überraschend im Halbfinale gegen Seed-4 Tackleberry Finn (6-9), die dann im Finale gegen Zurich City Ravens verloren.
- Nutzer hat drei Hall-of-Fame-Screenshots geschickt (Champions, meiste Team-Punkte pro Saison, meiste Team-Punkte in einer Woche, meiste Spieler-Punkte in einer Woche, je 2024 vs. 2025) → in `league-history.json` unter `hallOfFame` eingetragen. Bestätigt nebenbei explizit: Liga "Est. 2024", 2025 war die "2nd Saison" → beantwortet die offene Frage von oben.
- Per `AskUserQuestion` nachgefragt, ob 2024 wirklich die Gründungssaison war (vs. noch ältere Daten abzuwarten) → Nutzer hat bestätigt: 2024 war die erste Saison, keine älteren Daten zu erwarten. `leagueFounded: 2024` im JSON vermerkt.

**Damit Punkt D fertig umgesetzt:** Drei neue `find*Fact()`-Funktionen in `sync-espn.mjs` (Kommentarblock "Punkt D: Liga-Historie", direkt nach `findLeagueActivityFact`):
- `findDefendingChampionFact` – Titelverteidiger-Storyline, nur früh in der neuen Saison (≤6 Spiele) relevant.
- `findAllTimeRecordFact` – diese Woche wird ein All-Time-Liga-Rekord (Spieler- oder Team-Wochenpunkte) aus der Hall of Fame geknackt; braucht echte Spielleistung, deshalb NICHT vorschau-tauglich.
- `findPlayoffHistoryFact` – die beiden Teams trafen sich schon in einem früheren Playoff-Spiel (durchsucht alle erfassten Saisons' `playoffs`-Objekte) – grössere Geschichte als die reguläre Saison-Revanche (`findRematchFact`, nur innerhalb derselben Saison).

`defendingChampion`/`playoffHistory` sind vorschau-tauglich und laufen deshalb auch in `buildPreviewMoments`. `main()` lädt jetzt zusätzlich `league-history.json` und reicht es als `ctx.leagueHistory` sowohl in den Recap- als auch den Preview-Kontext durch.

In `generate-recaps.mjs`: alle drei Kategorien in `collectFacts()` UND `collectPreviewFacts()` (mit forward-looking Formulierung für Letzteres), `BADGE_POOL` (`defendingChampion`, `allTimeRecord`, `playoffHistory`), `BADGE_CATEGORY_TO_FACT_CATEGORY` und `pickBadge()` verdrahtet.

Getestet via gemocktem Claude-API-Call: alle drei Kategorien rendern korrekt sowohl im Einzel-Recap- als auch im Wochen-Vorschau-Prompt.

## Offene, noch nicht umgesetzte Punkte
- #12: Punkterechner – QB-Rushing-First-Down-Bonus nachrüsten.
- #13: Punkterechner – DST-Lücken (Forced Fumbles, Safeties, geblockte Kicks) prüfen.

Alle in dieser Session besprochenen Punkte (Standings-Erweiterung, 8 neue Stats-Kategorien, Punkt D/Liga-Historie) sind damit umgesetzt.

## Nächster Schritt (Stand Ende dieser Session)
Woche 2 abwarten, dann beim nächsten Dienstags-Sync verifizieren, dass `archiveSeasonStats()`, die 8 neuen Saison-Stats-Kategorien UND die 3 neuen Liga-Historie-Kategorien mit echten Daten fehlerfrei laufen (insbesondere die migrationssicheren Defaults für die schon bestehenden Woche-1-Team-Einträge in `season-stats.json`). `findDefendingChampionFact` sollte ab Woche 1-2 der neuen Saison sofort greifen (Zurich City Ravens als Titelverteidiger 2025), gut beobachtbar beim nächsten Recap.
