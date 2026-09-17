# Session-Log: UX-Erweiterungen Mein Team (Injury-Badges, Skeletons, Digest, Trends, Playoffs, Track-Record)

**Datum:** 2026-09-16
**Zweck dieser Datei:** Backup/Gedächtnisstütze für den Fall, dass der Chat-Kontext verloren geht. Setzt `session-log-2026-09-16-echte-punkte-mein-team.md` fort (dortiger Stand: positionsgenauer Drop-Kandidat-Fix fertig und live).

**Auslöser:** Nutzer fragte offen "wie könnten wir das Nutzererlebnis noch verbessern?". Ich habe 8 Ideen vorgeschlagen (siehe Chat), Nutzer fand alle interessant und wollte sie alle ausgearbeitet + weitere gefunden ("mach alles"). Reihenfolge der Umsetzung: kleinere/unabhängige Punkte zuerst, grössere/riskantere zuletzt.

## 1. Verletzt-Status-Badges (Q/D/O/IR) bei Spielernamen

**Idee:** ESPN liefert pro Spieler ein `injuryStatus`-Feld (QUESTIONABLE/DOUBTFUL/OUT/INJURY_RESERVE/SUSPENSION/DAY_TO_DAY) – bisher nirgends abgerufen oder angezeigt. Ein angeschlagener Starter oder ein verletzter Free-Agent-Vorschlag war bisher nicht erkennbar.

**Umgesetzt:**
- `scripts/sync-espn.mjs`: `injuryStatus` an 3 Stellen mit durchgereicht – `fetchProjections()`-Output, `playerPool`-Aufbau (Fallback für nicht-projizierte Spieler), und explizit im `roster`-Mapping vor `buildOptimalLineup()` (da dort die Felder einzeln ausgewählt werden, reicht Objekt-Spread allein nicht). `buildOptimalLineup()` selbst spreadet alle Felder durch (`{ slot: label, ...best }`), also landet `injuryStatus` automatisch in `roster.json`.
- `my-team.html`: `INJURY_LABEL`-Map (ESPN-Wert → kurzes Badge-Label) + `injuryBadgeHtml(p)`-Helper. Eingebaut bei Startern/Bank (`renderRoster`), Free-Agent-Karten (`renderFreeAgents`/`fetchFreeAgents` – dort `injuryStatus` zusätzlich aus dem Live-ESPN-Response gemappt), Trade-Karten (`tradeSidePlayersHtml`) und im Drop-Kandidat-Text. `ACTIVE` sowie fehlende/unbekannte Werte zeigen bewusst KEINEN Badge (keine falschen Warnungen). OUT/INJURY_RESERVE/SUSPENSION optisch stärker (kräftigeres Rot via `.is-out`) als Q/D.
- Kurze Legende im bestehenden Hinweis-Kasten ergänzt (Badge-Beispiele + Erklärung).

**Einschränkung:** Konnte den exakten Feldnamen/die Werte nicht live gegen ESPNs API verifizieren, da `ESPN_S2`/`ESPN_SWID` bewusst nur als GitHub-Actions-Secret existieren, nie lokal verfügbar (Sicherheitsvorgabe dieses Projekts). `injuryStatus` mit den Werten QUESTIONABLE/DOUBTFUL/OUT/INJURY_RESERVE/DAY_TO_DAY ist aber ein seit Jahren stabiles, breit dokumentiertes Feld von ESPNs Fantasy-API (u.a. Basis der verbreiteten `espn-api`-Python-Bibliothek) – Code ist zusätzlich defensiv gebaut (fehlt das Feld oder hat einen unbekannten Wert, wird einfach kein Badge gezeigt statt eines Fehlers). **Nächster Schritt:** nach dem nächsten echten Sync-Lauf `data/roster.json` inspizieren, ob `injuryStatus` befüllt wird und die Werte wie erwartet aussehen.

**Getestet:** Playwright mit gemocktem Roster (4 Spieler mit je einem der 4 Haupt-Status Q/D/O/IR verteilt auf Starter und Bank) – alle 4 Badges erscheinen mit korrektem Label, korrektem Tooltip (voller ESPN-Wert) und korrekter `is-out`-Einfärbung; Spieler ohne `injuryStatus` zeigen keinen Badge.

## 2. Skeleton-Ladezustände und Retry-Buttons bei Fehlern

**Problem:** Die Free-Agent-Sektion zeigte während des Ladens nur Text ("Lade Free Agents…"), keine visuelle Struktur; schlug ein Fetch fehl (initiale Liga-Daten ODER Free Agents), war das eine Sackgasse – kein Weg, es direkt erneut zu versuchen, ohne die ganze Seite neu zu laden. Gerade auf dem Handy/bei wackligem Netz relevant.

**Umgesetzt:**
- `.mt-skeleton`-Karten (einfache Puls-Animation über `@keyframes`) füllen `#mtFreeAgents` während `renderFreeAgents()` lädt, Anzahl passend zur Zahl der Ziel-Positionen.
- Bei fehlgeschlagenem FA-Fetch: `faStatusEl` zeigt Fehlertext + `.mt-retry-btn`-Button, der `renderFreeAgents(team, weakPositions)` mit denselben Argumenten erneut aufruft (Closure merkt sich die Argumente automatisch).
- Initialer Datenload (power-rankings/roster/rostered-ids/season-stats) aus dem anonymen `Promise.all(...)`-Aufruf in eine benannte `loadInitialData()`-Funktion gekapselt, damit sie bei Fehler per Retry-Button erneut aufgerufen werden kann, statt dass der Nutzer die Seite neu laden muss.
- Gleiches `.mt-retry-btn`-Styling für beide Stellen (roter Rahmen, wie die restliche Fehler-Farbe `--endzone`).

**Getestet:** Playwright mit gezielt fehlschlagendem ersten `power-rankings.json`-Request (500, beim zweiten Versuch erfolgreich) – Retry-Button erscheint, Klick lädt danach korrekt alle Team-Optionen nach. Nach Team-Auswahl sind kurz 2 Skeleton-Karten sichtbar, bevor (erwartungsgemäss, da der Live-ESPN-Endpoint in dieser Sandbox nicht mockbar ist) der FA-Fetch fehlschlägt und korrekt den Retry-Button zeigt.

## 3. Neue Sektion "Deine Saison bisher"

**Idee:** `season-stats.json` sammelt pro Team schon seit dem "echte Punkte"-Ausbau (siehe Vorgänger-Session-Log) viele Kennzahlen – Streaks, knappe Spiele/Blowouts, Wochen als Top-/Flopscorer der Liga, verpasste Bank-Swaps, Überraschungssiege – bisher aber nur intern als Zutat für Recap-Fakten (`findStreakFact`, `findCloseGamesFact` etc. in `sync-espn.mjs`) genutzt, nirgends als eigene Übersicht pro Team sichtbar.

**Umgesetzt:** Neue Sektion "Deine Saison bisher" zwischen Roster und Team-Analyse. `renderSeasonStats(teamId)` liest `SEASON_STATS.teams[String(teamId)]` (Keys sind String-Team-IDs) und baut eine Kachel-Übersicht (`.mt-stat-grid`/`.mt-stat-tile`, neues CSS im selben Stil wie die restliche Seite): aktuelle Serie, längste Serie, knappe Spiele (Marge < 5 Punkte, exakt wie in `sync-espn.mjs` definiert), Blowouts (Marge > 30 Punkte), Wochen als Topscorer/Flopscorer der Liga, Überraschungssiege (Sieg als Aussenseiter laut Projektion), Bank-Punkte liegen gelassen (Summe des jeweils besten verpassten gleichpositionellen Starter-Swaps pro Woche, aus `benchRegret()`).

Team ohne Eintrag (`t.games === 0` bzw. gar kein Eintrag, z.B. brandneues Team) zeigt statt leerer Kacheln einen Hinweistext.

**Getestet:** Playwright mit gemocktem `season-stats.json` (3 Wochen, alle 8 Felder befüllt) – alle Kacheln zeigen korrekte Werte und Formatierung (Pluralisierung bei "Siege"/"Niederlagen", korrekte S/N-Kurzform bei knapp/Blowout). Zweites Team ohne Eintrag in `season-stats.teams` zeigt korrekt den Fallback-Hinweis statt 0 Kacheln mit Nullen.

## 4. "Diese Woche"-Digest-Sektion

**Idee (ursprünglicher Vorschlag):** kompakter Block oben, der 3 Dinge bündelt: Schwächste Position + Top-FA, "Sitting a stud"-Alarm (Bankspieler outperformt Starter), Bye-Week-Hinweis nächste Woche.

**Umgesetzt (2 von 3, 1 bewusst verworfen):**
1. **Schwächste Position + Top-FA:** `renderDigest()` zeigt sofort die schwächste Position (aus `weakPositions`, gleiche Berechnung wie die bestehende Team-Analyse), der Free-Agent-Teil folgt asynchron ("wird geladen…" → Top-Empfehlung, sobald `renderFreeAgents()`s Fetch durch ist – dieselbe Berechnung, keine Doppel-Anfrage).
2. **Live-vs-Proj-Divergenz-Alarm (umgedeutete "Sitting a stud"-Idee):** Die ursprüngliche Idee ("Bankspieler hat letzte Woche mehr Punkte gemacht als Starter") liess sich nicht 1:1 umsetzen, weil diese Seite nirgends PRO-WOCHE-Punkte einzelner Spieler persistiert (nur `SEASON_STATS.players[id].totalPoints`/`gamesPlayed` kumuliert über die ganze Saison) UND weil `roster.json`s Starter/Bank ohnehin nie die tatsächliche ESPN-Aufstellung ist, sondern immer schon unsere eigene proj-optimale Berechnung (`buildOptimalLineup()` in `scoring.mjs`) – es gibt also gar keine "echte" Aufstellung, von der man abweichen könnte. Stattdessen umgedeutet zu: unabhängig vom aktuell gewählten Toggle wird IMMER sowohl die proj- als auch die live-optimale Aufstellung berechnet (dafür `playerValue()`/`buildOptimalLineupByValue()`/`liveOptimizedTeam()` um einen optionalen `modeOverride`-Parameter erweitert, ansonsten weiter Default auf das globale `VALUE_MODE`). Weichen beide voneinander ab, erscheint ein Alarm ("Bankspieler X würde unter Live-Punkteschnitt Starter Y ersetzen") – nur wenn man gerade NICHT schon im Live-Modus ist (sonst zeigt die Aufstellung das ohnehin schon).
3. **Bye-Week-Hinweis: bewusst NICHT umgesetzt.** Dieses Projekt trackt aktuell nirgends NFL-Bye-Weeks pro Team. Eine Implementierung hätte entweder einen neuen ESPN-Endpoint-Fetch (`proTeamSchedules` o.ä.) serverseitig in `sync-espn.mjs` gebraucht (konnte ich in dieser Sandbox nicht verifizieren, da `ESPN_S2`/`ESPN_SWID` bewusst nur als GitHub-Actions-Secret existieren) oder eine von Hand eingetragene Bye-Week-Tabelle für die echte NFL-Saison 2026 – Letzteres hätte ich aus dem Gedächtnis raten müssen, was bei echten, folgenreichen Terminen (falscher Bye-Week-Hinweis könnte einen Nutzer dazu bringen, fälschlich einen Spieler zu benchen oder eben nicht) ein zu hohes Fehlerrisiko ist. Zurückgestellt, siehe "Offene Punkte" unten.

**Getestet:** Playwright, 2 Szenarien. (1) Bankspieler mit künstlich riesigem Live-Punkteschnitt (`SEASON_STATS.players['13'].totalPoints=100` bei `gamesPlayed=1`, `weeksArchived=[1]`), Modus per `localStorage` auf `'proj'` erzwungen – Divergenz-Alarm erscheint korrekt, nennt sowohl den promovierten Bankspieler als auch den verdrängten Starter, `is-alert`-Klasse gesetzt. (2) 2-Team-Liga-Mock mit klar unterschiedlichem `posTotals` – "Schwächste Position"-Text erscheint sofort mit "wird geladen…"-Platzhalter, wechselt nach dem (erwartungsgemäss fehlschlagenden, da Live-ESPN-Endpoint in dieser Sandbox nicht mockbar) FA-Fetch korrekt zu "konnte nicht geladen werden".

## 5. Neue Sektion "Trending im Waiver Wire"

**Idee:** `rostered-ids.json` wird schon regelmässig synct – daraus liesse sich Woche-zu-Woche ableiten, welche Free Agents league-weit am stärksten zu-/abgehen.

**Umgesetzt:** `sync-espn.mjs` liest jetzt VOR dem Überschreiben von `rostered-ids.json` den vorherigen Snapshot (`prevRosteredSnapshot`/`prevRosteredIds`), diffed ihn gegen den aktuellen Kader-Stand (`rosteredIds`) und schreibt das Ergebnis nach `data/waiver-trends.json`: `{lastUpdated, since, added: [...], dropped: [...]}`. `espn-sync.yml` läuft nur dienstags (5x im 2h-Abstand), der Diff zwischen dem letzten Dienstags-Lauf und dem ersten des nächsten deckt also praktisch eine volle Woche ab – die Seite zeigt bewusst den echten `since`-Zeitstempel statt pauschal "diese Woche" zu behaupten (robuster, falls der Zeitplan mal dichter wird).

Für gedroppte Spieler (die evtl. weder gedraftet noch aktuell rostered sind, z.B. ein früher Free-Agent-Pickup, der wieder gecuttet wurde) wurde `allNeededIds` um `prevRosteredIds` erweitert, damit `playerInfo()` sie weiterhin über den bestehenden Projektions-Bulk-Fetch auflösen kann statt als "Unbekannter Spieler" zu enden. Erster Lauf ohne Vorgänger-Datei (`prevRosteredSnapshot.lastUpdated` fehlt) liefert bewusst leere `added`/`dropped`-Listen, statt den kompletten aktuellen Kader fälschlich als "neu geholt" zu melden.

`my-team.html`: neue Sektion zwischen Free-Agent-Empfehlungen und Trade-Ideen, zweispaltig ("Neu geholt" / "Neu gedroppt", je bis 8 Einträge nach ADP sortiert – bewusst nicht "Meistgeholt" genannt, da pro Spieler nur ein Add/Drop-Event existiert, keine Häufigkeit über mehrere Teams). Liga-weit und team-unabhängig, deshalb nur einmal beim initialen Laden gefüllt (`renderTrending()`), nicht bei jedem Team-Wechsel neu berechnet. Initiale `data/waiver-trends.json` mit leerem Platzhalter-Stand (`lastUpdated: null`) angelegt – erster echter Diff erst ab dem übernächsten Sync-Lauf verfügbar.

**Getestet:** Playwright mit gemockten Trends-Daten – beide Spalten zeigen korrekt sortierte Einträge mit Name/Position/Team/ADP. Leerer Anfangszustand (`lastUpdated: null`) zeigt korrekt den Hinweistext ("Noch keine zwei Sync-Läufe zum Vergleichen vorhanden") statt leerer Spalten.

## 6. Neue Sektion "Playoff-Chancen"

**Idee:** einfache Hochrechnung, was ein Team noch für die Playoffs braucht.

**Umgesetzt:** `sync-espn.mjs` hatte bereits `computePlayoffPicture(standings, confStandings)` (2 Conference-Sieger als Seed 1/2, beste 2 Non-Conference-Sieger als Wildcard-Seeds 3/4, Punkte als Tiebreak) sowie die Elimination-Logik in `findPlayoffRaceFact()` – bisher aber nur zur Erzeugung einzelner Recap-Sätze für JE EIN Spiel genutzt, nie als vollständige Übersicht. Neu: direkt nach der Standings-/Conference-Berechnung wird für ALLE Teams auf einmal derselbe Status berechnet (`in` mit Seed + Cushion zum ersten Verfolger, `chasing` mit Sieges-Rückstand zu Platz 4, oder `eliminated` – exakt dieselbe "selbst mit nur Siegen aus den Restspielen nicht mehr genug"-Näherung wie im bestehenden Code, Restspiele = 15 minus zuletzt komplett gewertete Woche) und nach `data/playoff-picture.json` geschrieben.

`my-team.html`: neue Sektion zwischen "Deine Saison bisher" und "Team-Analyse". Zeigt eine Kurzeinschätzung fürs gewählte Team (3 Textvarianten je nach Status, inkl. Tiebreaker-Sonderfall "gleich viele Siege wie Platz 4, aber schlechterer Tiebreaker") plus eine nach Status/Seed/Siegen sortierte Liste aller Teams, das eigene optisch hervorgehoben (`.is-mine`). Vor Woche 8 erscheint statt der Liste ein "noch zu früh"-Hinweis – dieselbe Schwelle wie die bereits bestehende `findPlayoffRaceFact()`-Konvention in `sync-espn.mjs` (dort schon so gewählt, weil die Aussage davor zu verrauscht wäre), hier bewusst übernommen statt eine eigene Schwelle zu erfinden.

**Getestet:** Reine Logik zuerst mit einem eigenständigen Node-Skript gegen synthetische 10-Team-Daten durchgerechnet (Konferenzsieger-Vorrang trotz weniger Siegen, Tiebreaker-Fälle, Elimination ab Woche 13 mit nur noch 2 Restspielen) – Ergebnisse manuell nachvollzogen, alle korrekt. Danach Playwright gegen `my-team.html`: (A) Woche 5 zeigt korrekt den "zu früh"-Hinweis ohne Liste. (B) Woche 13 mit 6 Teams über alle 3 Status-Ausprägungen zeigt korrekte Sortierung, korrekten Tiebreaker-Copy-Text und korrekte `is-mine`-Hervorhebung.

## 7. Neue Sektion "Track-Record vergangener Tipps" (letzter Punkt der "mach alles"-Liste)

**Idee:** Verlauf, ob frühere Trade-/Drop-Tipps sich im Nachhinein gelohnt hätten.

**Architektur-Problem zuerst gelöst:** FA-/Trade-Vorschläge werden auf `my-team.html` komplett clientseitig und live berechnet – es gab bisher NIRGENDS eine Persistenz für "das haben wir mal vorgeschlagen". Ausserdem führt `season-stats.json` nur KUMULIERTE Saison-Summen (keine Wochen-Auflösung), was eine naive "Punkte seit Woche X"-Abfrage unmöglich macht. Gelöst durch dieselbe Snapshot-Diff-Technik wie bei `waiver-trends.json` (Punkt 5): bei der Empfehlung wird ein Baseline-Snapshot (aktuelle kumulierte Werte von Spieler und Team-Position) gespeichert, die spätere Bewertung bildet einfach die Differenz zum dann aktuellen Stand – funktioniert mit dem bestehenden Datenmodell, ohne es umzubauen.

**Umgesetzt (sync-espn.mjs):**
- Neue `fetchTopFreeAgent(pos, rosteredIdSet)`-Funktion – serverseitiger Nachbau von `fetchFreeAgents()` aus `my-team.html`, über denselben öffentlichen, cookie-losen `DEFAULTS_URL`-Endpoint (kein neues Auth-Risiko, exakt dasselbe Muster wie das bereits bestehende `fetchProjections()`).
- Bei jedem Lauf mit neu abgeschlossener Woche: pro Team die schwächste Position (proj-basiert, gleiche Definition wie überall sonst) + `fetchTopFreeAgent()` dafür ermitteln, zusammen mit Baseline-Snapshot aus `season-stats.json` in `data/suggestion-history.json` anhängen (idempotent pro Team+Woche, kein Duplikat bei mehrfachen Dienstags-Läufen).
- Mindestens 2 Wochen später (`GRADE_AFTER_WEEKS`) wird jeder unbewertete Eintrag automatisch bewertet: Punkteschnitt-Differenz seit Baseline für Spieler UND Team-Position, Verdict "besser"/"schlechter"/"etwa gleich" bei >10% Abweichung. Kein Grading, wenn der Spieler seither noch gar nicht gespielt hat (z.B. Bye Week oder nie geholt) – verschiebt sich automatisch auf den nächsten Lauf, statt eine Bewertung mit 0 Spielen zu erzwingen.

**Umgesetzt (my-team.html):** neue Sektion am Ende der Seite, zeigt alle vergangenen Tipps des gewählten Teams (neueste zuerst) mit farbigem Verdict-Badge oder "wird bewertet"-Platzhalter.

**Getestet:** Grading-Mathematik separat mit einem eigenständigen Node-Skript gegen 4 synthetische Szenarien durchgerechnet (zu früh nach Baseline → bleibt unbewertet; Spieler klar besser als Team-Position → "besser"; Spieler seither ohne neue Auftritte → bleibt unbewertet statt Fehlbewertung mit 0 Spielen; Spieler schlechter → "schlechter") – alle 4 korrekt. Playwright-Test mit gemockter 2-Team-Historie: Anzeige filtert korrekt nur Einträge des gewählten Teams, sortiert neueste zuerst, zeigt korrekte Verdict-Klassen/-Texte je nach Grading-Status.

**Bekannte Grenze (bewusst in Kauf genommen):** `teamPosPpgSince` ist der Punkteschnitt PRO SPIELER-AUFTRITT an dieser Position übers ganze Team (Summe aller Starter+Bank-Punkte an der Position, geteilt durch Anzahl Auftritte) – ein plausibler Proxy für "Positions-Stärke", aber nicht exakt "der eine Spieler, der ersetzt worden wäre". Für die Kernfrage "hätte sich der Tipp gelohnt" reicht das als Näherung.

## Offene, noch nicht umgesetzte Punkte
- #12: Punkterechner – QB-Rushing-First-Down-Bonus nachrüsten.
- #13: Punkterechner – DST-Lücken (Forced Fumbles, Safeties, geblockte Kicks) prüfen.
- Injury-Badges: echten Sync-Lauf abwarten und `data/roster.json` auf tatsächlich befüllte `injuryStatus`-Werte prüfen (siehe oben).
- Bye-Week-Hinweis im Digest: bräuchte entweder einen neuen ESPN-`proTeamSchedules`-Fetch serverseitig (nächster Sync-Lauf mit echten Credentials nötig, um das zu verifizieren) oder eine von Hand gepflegte Bye-Week-Tabelle – bewusst nicht aus dem Gedächtnis geraten (Fehlerrisiko bei echten Terminen), siehe Punkt 4 oben.
- Trending im Waiver Wire: echten Sync-Lauf zweimal abwarten (für einen ersten echten `since`-Diff) und `data/waiver-trends.json` danach inhaltlich verifizieren.
- Playoff-Chancen: echten Sync-Lauf abwarten und `data/playoff-picture.json` mit den echten Liga-Daten inhaltlich verifizieren (aktuell erst Woche 1-2 gespielt, Sektion zeigt bis Woche 8 ohnehin nur den "zu früh"-Hinweis).
- Track-Record vergangener Tipps: braucht mindestens 3 abgeschlossene Wochen (1 Woche für den ersten Eintrag + 2 Wochen `GRADE_AFTER_WEEKS`), bevor der erste echte, bewertete Eintrag erscheinen kann – bis dahin `data/suggestion-history.json` regelmässig nach echten Einträgen prüfen, insbesondere ob `fetchTopFreeAgent()` gegen die echte ESPN-API wie erwartet funktioniert (in dieser Sandbox nicht testbar, da `ESPN_S2`/`ESPN_SWID` nur als GitHub-Actions-Secret existieren).

## Nächster Schritt (Stand Ende dieser Session)
Alle 7 Punkte der "mach alles"-UX-Liste sind umgesetzt und live (Commits siehe oben, jeweils mit Changelog-Bot-Merge dazwischen). Nächster sinnvoller Schritt: die nächsten paar Dienstags-Sync-Läufe beobachten und verifizieren, dass alle neuen serverseitigen Berechnungen (Injury-Status, Trending-Diff, Playoff-Picture, Track-Record-Aufzeichnung+Grading) fehlerfrei mit echten Liga-Daten durchlaufen – keiner davon konnte in dieser Sandbox gegen die echte private ESPN-API getestet werden (nur die reine Berechnungslogik isoliert, plus alles Clientseitige per Playwright mit gemockten Daten). Bei Auffälligkeiten in den Sync-Logs (GitHub Actions) nachbessern.
