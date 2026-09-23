# Changelog

Automatisch gepflegt: jeder inhaltliche Push auf `main` hängt hier automatisch seine Commit-Message an (siehe `.github/workflows/changelog.yml`). Reine Daten-Sync-Commits (`espn-sync-bot`) werden bewusst ausgeklammert, damit hier nur inhaltliche Änderungen stehen.

Für die ausführlichere, im Zusammenhang erklärte Doku (was wurde gebaut, warum, wo im Code) siehe die `docs/session-log-*.md`-Dateien – die werden nicht automatisch generiert, sondern von Claude nach jeder inhaltlichen Änderung von Hand nachgezogen (nicht nur an ausgewählten Punkten), damit bei Kontextverlust möglichst wenig Information verloren geht.

Einträge ab hier kommen automatisch dazu.

## 2026-09-15 – `7f9b714` Automatischer Changelog als zusätzliches Backup

Neuer Workflow (changelog.yml) hängt bei jedem inhaltlichen Push auf
main automatisch die Commit-Message an docs/CHANGELOG.md an – rein
mechanisch aus git log, ohne KI-Zusammenfassung. Reine Daten-Sync-
Commits werden über paths-ignore ausgeklammert, damit der Changelog
nicht von wöchentlichen ESPN-Syncs zugemüllt wird; ein Guard gegen
Doppel-Einträge und einen Selbst-Trigger-Loop ist auch drin.

Ergänzt (ersetzt nicht) die ausführlicheren docs/session-log-*.md-
Dateien: der Changelog ist die lückenlose, garantiert aktuelle
Rohliste; die Session-Logs bleiben die verständnis-basierte
Zusammenfassung, die ich von Hand an sinnvollen Punkten aktualisiere.

## 2026-09-15 – `d10ac3f` Standings: Conference-Ansicht statt Liga-Ansicht als Default

Die Liga-weite Tabelle war der Default-Tab, Conference-Aufteilung nur
per Klick erreichbar - umgedreht, da die Conference-Einteilung für die
Liga die relevantere Sicht ist. render Standings() respektiert jetzt
den aktuell aktiven Tab statt hart die Liga-Ansicht einzublenden.

## 2026-09-15 – `c8d9d06` Transaktionen: neuste zuerst statt chronologisch aufsteigend

Innerhalb einer Woche standen die Transaktionen bisher in Einfüge-
Reihenfolge (älteste zuerst), da neue Einträge einfach ans Array
angehängt werden. Jetzt nach Datum absteigend sortiert.

Sortiert über das Datumsfeld (de-CH-String, T.M.JJJJ), nicht über die
id: ein erster Versuch, die id (die bei echten Sync-Einträgen mit
Date.now() endet) für die Sortierung zu nutzen, scheiterte an älteren
Platzhalter-Transaktionen mit anderer id-Form (z.B. "fa-12353e34" –
Number() interpretiert das als Exponentialschreibweise 12353e34, eine
riesige Zahl, die fälschlich als "neuste" sortiert hätte). Mit echten
Daten gegen diese Falle getestet, bevor gepusht wurde.

## 2026-09-15 – `2d1acf1` Startseite: Interaktive-Tools-Sektion als klar klickbare Kachel-Karten

Bisher stand pro Tool nur ein unterstrichenes Link-Wort am Zeilenanfang,
gefolgt von normalem Fliesstext ("Punkterechner – Stats eintragen...")
– auf Touchscreens nicht erkennbar als klickbar, und der tatsächliche
Tap-Bereich war winzig (nur das erste Wort).

Ersetzt durch ein Kachel-Grid (analog zum bestehenden Kapitel-
Übersichts-Grid direkt darüber): jede Karte ist komplett anklickbar
(Titel + Beschreibung + ein durchgehend sichtbarer amberfarbener
Pfeil-Button), nicht nur hover-abhängig, damit es auch ohne Maus/Hover
sofort als Button erkennbar ist. "Team-Design" (kein echter Link) aus
der Liste raus, jetzt als eigener Hinweistext unter dem Grid statt als
falscher Kachel-Eintrag.

Mit Playwright bei 390px (Handy) und 1200px (Desktop) getestet, inkl.
Klick-Test dass die ganze Kachel (auch der Beschreibungstext, nicht nur
der Titel) den Link auslöst.

## 2026-09-15 – `c842b1b` Neues Feature: wöchentlicher Gesamt-Recap im Boulevard-Stil

Zusätzlich zu den bestehenden Einzel-Spiel-Recaps schreibt Claude jetzt
pro abgeschlossener Woche einen separaten Überblick über den gesamten
Spieltag - Schlagzeile + Fliesstext, der die 3-4 interessantesten
Geschichten der Woche (Upsets, Standout-Leistungen, Kollapse, Bank-
Patzer, Team-Storylines) zu einem Erzählbogen verwebt statt jedes Spiel
einzeln abzuklappern. Neuer System-Prompt mit explizitem Boulevard-
Zeitungs-Ton, angelehnt an den bestehenden Recap-Stil aber bewusst
reisserischer im Kopf (Schlagzeile) und cross-game statt pro Spiel.

- generate-recaps.mjs: callClaude() nimmt jetzt systemPrompt/maxTokens
  als Parameter (vorher hart auf den Einzel-Recap-Prompt/600 Tokens
  verdrahtet), damit Einzel- und Wochen-Recap denselben API-Call-Code
  teilen können. Neue buildWeekPrompt() baut aus allen Spielen der
  Woche einen kompakten Fakten-Digest (Endstand + Upset-Info + 2
  stärkste Fakten pro Spiel aus derselben collectFacts()-Quelle wie
  die Einzel-Recaps). generateWeekRecap() parst die Antwort an der
  Leerzeile in Schlagzeile/Text.
- sync-espn.mjs: ruft generateWeekRecap() im bestehenden Recap-Block
  auf und schreibt das Ergebnis idempotent (ein Eintrag pro Woche) nach
  data/week-recaps.json.
- schedule.html: neuer Anzeige-Block pro Woche, visuell klar getrennt
  von den einzelnen Spiel-Recap-Buttons (dunkle Karte mit Amber-Rand,
  Schlagzeile in Display-Font). Mit Playwright bei 390px und 1200px
  getestet.

data/week-recaps.json startet leer, wird beim nächsten Sync-Lauf nach
Woche 1 befüllt.

## 2026-09-15 – `36e4c6f` Gesamt-Recap auf schedule.html jetzt einklappbar

War bisher als reine Text-Karte immer voll ausgeklappt sichtbar -
gleiche Behandlung wie die Einzel-Spiel-Recaps: <details>/<summary>
mit Tag + Schlagzeile immer sichtbar (das ist der Hook zum Aufklappen),
Fliesstext klappt per Klick auf/zu, rotierender Pfeil-Indikator wie
beim Einzel-Recap-Button. Mit Playwright bei 390px und 1200px getestet,
inkl. Klick-Test für Auf-/Zuklappen.

## 2026-09-15 – `268a425` Header: Sync-Auswahl + Tool-Nav auf dem Handy hinter Menü-Button eingeklappt

Auf schmalen Screens brauchte der Header bisher 4 Zeilen (Titel, Team-
Sync-Auswahl, dann die Nav-Pills umgebrochen auf 2 weitere Zeilen) -
bei sticky Header dauerhaft sichtbarer Platzverlust beim Scrollen
durch lange Listen (Spielplan, Draft Board etc.). Betrifft draft-
board.html, my-team.html, power-rankings.html und schedule.html
(index.html hat mit dem Kapitel-Menü bereits eine eigene kompakte
Lösung und war nicht betroffen).

Neuer Hamburger-Button (id="navToggle") direkt neben dem Titel: auf
≤640px sind Sync-Auswahl und Tool-Nav standardmässig eingeklappt
(header bleibt eine einzige kompakte Zeile), Klick auf den Button
klappt beides in einem Rutsch auf. Auf breiteren Screens ist der
Button unsichtbar und beide Blöcke wie bisher immer sichtbar - keine
Verhaltensänderung am Desktop.

- theme.css: neue .nav-toggle-Styles + Collapse-Regeln für
  .header-sync-wrap/.tool-nav unter header.topbar.nav-open, zentral
  für alle Seiten statt pro Seite dupliziert.
- shared.js: neue initHeaderNav() verdrahtet den Button (Klick
  schaltet die Klasse "nav-open" auf <header>), exportiert über
  window.DraftRoomShared wie initThemePicker/initSyncBar.
- Die 4 betroffenen Seiten: Toggle-Button-Markup ergänzt, initHeaderNav()
  aufgerufen.

Mit Playwright auf allen 4 Seiten bei 390px (Toggle sichtbar,
Sync/Nav initial eingeklappt, nach Klick aufgeklappt) und 1200px
(Toggle unsichtbar, alles wie gehabt sichtbar) getestet.

## 2026-09-15 – `bf7b509` Cache-Busting für theme.css/shared.js + Kapitel-Header-Umbruch auf der Startseite gefixt

1. Cache-Busting (?v=20260915 an theme.css/shared.js in allen 5 Seiten):
   Nach dem letzten Header-Umbau hat der Nutzer das Update auf dem Handy
   nicht gesehen - höchstwahrscheinlich eine alte gecachte Kopie von
   theme.css/shared.js im Browser, da beide bisher ohne Versionierung
   eingebunden waren. Kommentar in beiden Dateien ergänzt: bei künftigen
   inhaltlichen Änderungen das v= in ALLEN Seiten mit hochzählen.

2. Startseite: Kapitel-Anzeige im Header sprang bei langen Namen um
   (z.B. "Draft-Ablauf") auf eine eigene Zeile, weil chapter-nav dann
   nicht mehr neben dem Titel in die Zeile passte. Root Cause beim
   Debuggen zweimal verschoben:
   - Erster Versuch (flex:1 auf chapter-nav) liess es stattdessen IMMER
     umbrechen (flex-grow verändert die Wrap-Entscheidung selbst).
   - Eigentliche Ursache: .title-group hatte keinen white-space:nowrap
     auf dem Titel-Text - unter Shrink-Druck konnte "Fantasy Playbook"
     selbst intern umbrechen (min-content einer wrappenden Textzeile ist
     nur das längste Wort), was die ganze Header-Zeile aufblähte.
   Fix: neuer .header-top-row-Wrapper um Titel+Kapitel-Anzeige (am
   Desktop per display:contents transparent, unverändertes Verhalten),
   am Handy ein eigener nowrap-Flex-Block mit fixer Breite - der Name
   wird bei Platzmangel mit "…" abgeschnitten statt umzubrechen, der
   Titel bleibt garantiert einzeilig (white-space:nowrap).

3. Beim Debuggen von (2) einen echten Bug aus dem letzten Header-Umbau
   gefunden: die Collapse-Regel in theme.css (header.topbar
   .header-sync-wrap{display:none}) war zu breit gefasst und traf auch
   die Startseite, die aber gar keinen .nav-toggle-Button hat - die
   Team-Sync-Auswahl war dort auf dem Handy dauerhaft unsichtbar, ohne
   Weg sie aufzuklappen. Gefixt mit :has(.nav-toggle), damit die
   Collapse-Regel nur die 4 Seiten mit echtem Toggle-Button trifft.

Alle 5 Seiten mit Playwright bei 390px getestet (alle Kapitel-Namen,
inkl. der beiden längsten "Draft-Ablauf"/"Draft-Tipps": Header bleibt
einzeilig, Sync-Auswahl wieder sichtbar) und bei 1200px (Desktop
unverändert, kein Abschneiden).

## 2026-09-15 – `e9c8e0c` Neues Feature: Wochen-Vorschau vor dem ersten Spiel des Spieltags

Analog zum bestehenden Wochen-Recap (Gesamt-Rückblick nach dem
Spieltag), aber nach vorne gerichtet: ein Ausblick im selben Boulevard-
Stil auf die KOMMENDE, noch nicht gespielte Woche - was steht auf dem
Spiel, welche Serien/Playoff-Implikationen/Revanchen sind relevant.

Timing: der Sync läuft laut Cron nur dienstags (siehe espn-sync.yml),
die kommende Woche startet üblicherweise donnerstags - die Vorschau
für Woche N+1 wird also in genau dem Dienstags-Lauf generiert, der
auch den Recap für die gerade abgeschlossene Woche N schreibt, und ist
damit automatisch rechtzeitig vor dem Anpfiff fertig. Läuft unabhängig
vom Recap-Block, weil sie schon vor Woche 1 sinnvoll ist.

Technisch:
- scripts/sync-espn.mjs: neue buildPreviewMoments() baut für ein noch
  nicht gespieltes Spiel einen Fakten-Satz nur aus dem, was schon vor
  dem Anpfiff feststeht (Bilanz, Serie, Tabellenplatz, Playoff-Kontext,
  Erwartungswert, frühere Duelle) - wiederverwendet dafür
  findStreakFact/findConferenceStandingFact/findPlayoffRaceFact/
  findExpectationFact/findRematchFact, die alle ohnehin nur Team-IDs
  und Bilanz/Historie brauchen, keine Scores DIESES Spiels. Neuer
  Block in main() (unabhängig vom lastCompletedWeek>0-Block): findet
  die kommende Woche über scoreboard.json (das dank ESPNs API schon
  alle 15 Wochen inkl. noch ungespielter Paarungen enthält), prüft ob
  sie wirklich noch nicht begonnen hat (alle Spiele UNDECIDED), und
  schreibt data/week-previews.json fort.
- scripts/generate-recaps.mjs: neue collectPreviewFacts()/
  buildWeekPreviewPrompt()/generateWeekPreview() + eigener
  WEEK_PREVIEW_SYSTEM_PROMPT (Konjunktiv/Futur statt Rückblick, explizit
  keine erfundenen Ergebnisse). pickFactsForGame() nimmt jetzt einen
  optionalen factCollector-Parameter, damit Vorschau und Recap dieselbe
  Kategorie-Deckelung/Zufallsauswahl-Logik teilen können.
- schedule.html: neuer "🔮 Vorschau auf die Woche"-Block, gleiche
  einklappbare Kartenoptik wie der Gesamt-Recap-Block, erscheint am
  Kopf der jeweils kommenden Woche. Mit Playwright bei 390px und
  1200px getestet (zu/aufgeklappt).

Mit gemockter API getestet: Prompt-Aufbau, Schlagzeile+Text-Parsing
und Fakten-Auswahl funktionieren wie erwartet. data/week-previews.json
startet leer, wird ab dem nächsten Dienstags-Lauf befüllt.

## 2026-09-15 – `cc553c1` Spielplan: aktuelle Woche rutscht nach oben, vergangene Wochen eingeklappt

Ab Mittwoch (Tag nach dem Dienstags-Sync) wird die neue Liga-Woche zur
"aktuellen" Woche befördert und an den Anfang der Seite verschoben.
Wochen vor der aktuellen werden automatisch in <details>-Elemente
eingeklappt (neueste zuerst), damit die Seite bei fortschreitender
Saison nicht durch 15 Wochen gescrollt werden muss.

## 2026-09-15 – `b274d78` Wochen-Vorschau erst ab Mittwoch sichtbar

Die Vorschau wird zwar schon am Dienstag vom Sync generiert, soll aber
erst ab Mittwoch (Tag, an dem die Woche zur "aktuellen" wird) auf der
Seite erscheinen. Nutzt dieselbe Reveal-Datum-Logik wie das
Nach-oben-Rutschen der aktuellen Woche.

## 2026-09-15 – `e4d9ac9` Session-Log: Redundanz-Fix, neue Fakten-Kategorien, Wochen-Vorschau, Spielplan-Aufräumen

Der automatische Changelog (docs/CHANGELOG.md) hatte die Commits schon
erfasst, aber die ausführliche, von Hand gepflegte Session-Doku
(docs/session-log-*.md) war seit dem letzten Eintrag vom 2026-09-14
nicht nachgezogen worden - holt den kompletten Stand seither nach:
Bank-Thema-Redundanz-Fix, 13 neue Fakten-Kategorien + season-stats.json,
komplettes Wochen-Vorschau-Feature, Spielplan-Reordering/Einklappen,
Mittwoch-Gating für die Vorschau.

## 2026-09-15 – `660e2b1` Standings: kassierte Punkte + Punktedifferenz ergänzt

pointsAgainst steckte bereits in data/standings.json, wurde bisher nur
nicht angezeigt. Statt einer weiteren vollen Spalte (auf Mobile kein
Platz mehr) zeigt die bestehende Punkte-Spalte jetzt zweizeilig:
erzielte Punkte oben (wie bisher), kassierte Punkte + Differenz klein
darunter.

## 2026-09-15 – `2a82e7b` Session-Log: Standings-Erweiterung (kassierte Punkte/Diff) nachgetragen

## 2026-09-15 – `5c9bb75` Session-Log: neues Stats-Ökosystem (8 Kategorien) + Punkt-D-Vorbereitung nachgetragen

## 2026-09-15 – `f456b41` Session-Log: Saison 2024/2025 Liga-Historie + Stats-Verifikationsstand nachgetragen

## 2026-09-15 – `0f3b801` Punkt D: Fakten-Funktionen für die Liga-Historie (Titelverteidiger, All-Time-Rekorde, Playoff-Geschichte)

Nutzer hat bestätigt, dass 2024 die Gründungssaison war (keine älteren
Daten zu erwarten) - jetzt drei neue find*Fact()-Funktionen, die
data/league-history.json konsumieren:

- findDefendingChampionFact: Titelverteidiger-Storyline früh in der
  neuen Saison (bis Woche 6, danach hat jedes Team sein eigenes Momentum).
- findAllTimeRecordFact: diese Woche wird ein All-Time-Liga-Rekord
  (Spieler- oder Team-Wochenpunkte) aus der Hall of Fame geknackt.
- findPlayoffHistoryFact: die beiden Teams standen sich schon in einem
  früheren Playoff-Spiel gegenüber - grössere Geschichte als die
  reguläre Saison-Revanche (findRematchFact).

defendingChampion/playoffHistory sind vorschau-tauglich (brauchen keine
Spielleistung dieser Woche) und laufen deshalb auch in buildPreviewMoments;
allTimeRecord braucht den echten Spielstand und ist nur im Recap aktiv.

In generate-recaps.mjs: alle drei in collectFacts()/collectPreviewFacts()
(Fliesstext), BADGE_POOL (defendingChampion/allTimeRecord/playoffHistory-
Spitznamen), BADGE_CATEGORY_TO_FACT_CATEGORY und pickBadge() verdrahtet.

Getestet via gemocktem Claude-API-Call: alle drei Kategorien rendern
korrekt im Recap- und im Vorschau-Prompt, Cap-Mechanismus greift wie
erwartet.

## 2026-09-15 – `d7cca25` Session-Log: Punkt D vollständig abgeschlossen (Playoff-Bracket, Hall of Fame, Fakten-Funktionen) nachgetragen

## 2026-09-15 – `90c3b83` Standings: 'Kass.' zu 'PA' geändert (Nutzer-Feedback: unklare Abkürzung)

## 2026-09-16 – `d62b56b` Mein Team: Trade-/Drop-Tipps richten sich ab echten Saisonpunkten nach der Realität statt der Vorschau

Bisher basierten Positions-Stärke... nein, konkret: Bank-Sortierung,
Drop-Kandidat, Free-Agent-Ranking und Trade-Ideen liefen komplett auf
Basis der statischen Preseason-Projektion (proj) - auch noch in Woche
10, obwohl längst echte Ergebnisse vorliegen. Neue playerValue()-
Funktion in my-team.html: sobald ein Spieler mind. 2 echte Auftritte
(Start oder Bank) in dieser Saison hat, wird sein Vorschau-proj durch
eine Rest-Saison-Schätzung ersetzt (bereits erzielte Punkte + Punkte-
schnitt × geschätzt verbleibende Wochen) - bleibt auf der proj-Skala,
damit beide direkt vergleichbar sind. Real-basierte Werte sind amber
markiert (Bank-Liste, Free-Agent-Karten, Trade-Karten), damit sichtbar
bleibt, welche Zahl worauf beruht.

Dafür in sync-espn.mjs: archiveSeasonStats() trackt totalPoints/
gamesPlayed jetzt für JEDEN Auftritt (Start UND Bank), nicht mehr nur
für Starts - sonst hätte ein Spieler, der mal gebenched wurde, künstlich
niedrige Werte bekommen. findSeasonDraftValueFact() entsprechend auf
gamesPlayed statt starterWeeks als Durchschnitts-Divisor umgestellt.

Getestet per Playwright mit gemocktem season-stats.json (zwei Spieler
mit synthetischen echten Punkten, einer über-, einer unterperformt ggü.
Projektion) - Bank-Sortierung, Drop-Kandidat und Trade-Karten reagieren
korrekt, amber-Markierung sitzt an den richtigen Stellen. Aktiviert sich
live automatisch, sobald echte season-stats.json-Daten mit gamesPlayed
vorliegen (erste echte Daten kommen mit dem Woche-2-Abschluss).

## 2026-09-16 – `692b9a8` Session-Log: PA-Label + Mein-Team-Echte-Punkte-Feature (neuer Tages-Log 2026-09-16)

## 2026-09-16 – `62a871c` Session-Log: Woche-1-Backfill und Punkteschnitt-Anzeige nachgetragen

## 2026-09-16 – `df0b4a8` Mein Team: Bewertungs-Basis als expliziter Toggle statt nur automatisch

Nutzer wollte selbst wählen können, ob Berechnung/Fairness durchgehend
auf Projektion oder auf dem Live-Punkteschnitt basiert - bisher schaltete
das nur automatisch pro Spieler um (sobald genug echte Spiele vorliegen).

Neuer Toggle "Projektion" / "Live-Punkteschnitt" oben auf der Seite
(gleiche Pill-Optik wie die Conference/Liga-Tabs auf schedule.html),
Wahl persistiert in localStorage (draftroom-value-mode). playerValue()
respektiert jetzt VALUE_MODE: "proj" erzwingt für ALLE Spieler die
Projektion (auch wenn echte Daten vorliegen), "live" ist das bisherige
automatische Verhalten (echte Daten wo vorhanden, sonst Projektions-
Fallback für Spieler ohne genug Auftritte).

Wirkt jetzt konsistent überall auf der Seite, nicht nur bei Trade/Drop
wie ursprünglich: Roster-Sortierung (Starter UND Bank), Positions-
Stärke-Analyse (neue posTotalsForRoster()/computeLeagueAvgLive() als
Live-Pendant zu power-rankings.json's fest proj-basierten posTotals -
Power-Rankings-Seite selbst bewusst unverändert gelassen, eigenständige
"Kader-Stärke laut Draft"-Kennzahl), Free-Agent-Empfehlungen, Trade-
Ideen. Erklärtexte unter jeder Sektion wechseln automatisch mit dem
Modus (inkl. Korrektur: der Verweis auf "derselbe Massstab wie im
Trade-Fairness-Kalkulator" erscheint nur noch im Projektion-Modus, da
im Live-Modus nicht mehr zutreffend).

Getestet via Playwright mit gemocktem season-stats.json: Toggle-Klick
wechselt Modus, re-rendert alle Sektionen korrekt (Bank-Sortierung,
Team-Analyse-Zahlen, Trade-Copy-Text), localStorage-Persistenz über
Reload hinweg verifiziert. Ein Test-Artefakt unterwegs gefangen und
korrekt als solches identifiziert (page.route()-Interception überlebt
in dieser Playwright-Umgebung keinen page.reload() - kein Bug im
eigentlichen Code, nur beim Testaufbau selbst).

## 2026-09-16 – `62f4b8f` Session-Log: Bewertungs-Basis-Toggle nachgetragen

## 2026-09-16 – `9e2a1e3` Mein Team: Schwelle für Live-Modus auf 1 Spiel gesenkt

Nutzer bemerkte: Toggle wechselt Texte, aber keine Werte - Ursache war
keine Bug, sondern MIN_GAMES_FOR_REAL=2 bei aktuell erst 1 abgeschlossener
Woche (jeder Spieler fällt noch auf proj zurück). Nutzer wollte lieber
sofort mit den Woche-1-Daten sehen können, auch auf Kosten der höheren
Streuung eines Einzelspiels - Schwelle auf 1 gesenkt. Disclaimer-Text
entsprechend angepasst, inkl. Hinweis dass der Schnitt bei 1-2 Wochen
noch verrauscht ist und sich mit mehr Wochen stabilisiert.

Getestet: mit gemocktem 1-Wochen-Datensatz aktiviert der Live-Modus
jetzt sofort korrekt (amber, abweichende Werte ggü. Projektion).

## 2026-09-16 – `944d731` Session-Log: Toggle-Sichtbarkeit + Schwelle-auf-1-Feedback nachgetragen

## 2026-09-16 – `5ce2c0f` Mein Team: Live-Modus optimiert jetzt auch die Aufstellung selbst, nicht nur die Zahlen

Nutzer-Beobachtung: Toggle auf "Live-Punkteschnitt" änderte nur die
angezeigten Werte, aber wer Starter/Bank ist blieb unverändert - die
Aufstellung kam weiterhin unverändert aus roster.json (dort serverseitig
fest proj-optimal berechnet).

Client-seitiger Nachbau von buildOptimalLineup() aus scoring.mjs
(identische STARTER_SLOTS-Definition), aber nach playerValue() statt
starr nach proj sortiert: buildOptimalLineupByValue() + liveOptimizedTeam()
als Wrapper. Jetzt überall verwendet, wo eine roster.json-Team-Struktur
konsumiert wird (Roster-Anzeige, Free-Agent-Drop-Kandidat, Trade-Ideen -
sowohl fürs eigene Team als auch für jedes andere Team in der Schleife),
damit Aufstellung UND angezeigte Zahlen konsistent demselben Modus folgen.

Im Projektion-Modus liefert das dieselbe Aufstellung wie bisher (da
playerValue() dort ohnehin auf proj zurückfällt) - reine Verhaltensänderung
im Live-Modus: ein Bankspieler mit besserem echtem Punkteschnitt kann jetzt
tatsächlich einen bisherigen Starter verdrängen.

Getestet mit vollständig kontrolliertem Mock-Roster (auch roster.json/
power-rankings.json gemockt, nicht nur season-stats.json, da echte
proj-Werte zwischen Testläufen durch laufende Hintergrund-Syncs drifteten):
ein Bankspieler mit niedriger Projektion aber hohem Live-Boost wird im
Live-Modus korrekt zum Starter befördert, ein bisheriger Starter dafür
korrekt auf die Bank verdrängt - im Projektion-Modus bleibt die
ursprüngliche Aufstellung unverändert.

## 2026-09-16 – `9d207b8` Session-Log: Aufstellungs-Reoptimierung im Live-Modus nachgetragen

## 2026-09-16 – `e8b196b` Mein Team: Schwächste-Positionen-Ranking auf prozentuale statt absolute Abweichung umgestellt

Nutzer-Beobachtung: Free-Agent-/Trade-Vorschläge zeigten fast nur QBs,
obwohl bereits 2 im Roster stehen (kein dritter nötig, höchstens ein
Ersatz) - RB/WR-Bedarf (dort theoretisch bis zu 4 startbar) kam kaum vor.

Root Cause: die "schwächste Position" wurde nach absolutem Punkte-Diff
zum Liga-Schnitt bestimmt. QB macht in diesem Scoring-System grundsätzlich
viel mehr Rohpunkte als andere Positionen (Team-Summen ~1000 bei QB vs.
~300 bei TE/K vs. ~30 bei DST) - jede kleine relative QB-Schwäche erzeugt
dadurch einen riesigen absoluten Punkte-Rückstand, der die Auswahl fast
immer dominiert, während ein echtes RB/WR-Loch mit kleinerem absoluten
aber grösserem relativen Rückstand systematisch unterging.

Fix: renderAnalysis() berechnet jetzt zusätzlich pctDiff (Diff/Liga-Ø)
und sortiert danach statt nach dem absoluten Diff - sowohl für die
"Schwächste Position(en)"-Anzeige als auch für targetPositions in
renderFreeAgents()/buildTradeIdeas() (Auswahl, welche Positionen für
Free-Agent-/Trade-Vorschläge durchsucht werden). Tabellen-Spalte zeigt
jetzt Punkte-Diff UND Prozent nebeneinander, damit die Rangierung
nachvollziehbar bleibt. targetPositions-Anzahl von 2 auf 3 erhöht,
damit mehr Positionsvielfalt in einer Ansicht sichtbar wird.

Getestet mit vollständig kontrolliertem Mock (QB: -100 Punkte/-10%,
RB: -60 Punkte/-12%) - Tabelle zeigt beide Prozentwerte korrekt, "Schwächste
Positionen"-Text listet RB jetzt korrekt VOR QB trotz kleinerem absoluten
Rückstand, genau das vom Nutzer beschriebene Szenario aufgelöst.

## 2026-09-16 – `96fdb56` Session-Log: Prozentuale Positions-Ranking-Umstellung nachgetragen

## 2026-09-16 – `7c9dec0` Mein Team: Drop-Kandidat berücksichtigt jetzt die Position des Free-Agent-Vorschlags

Bug: Der "Drop-Kandidat"-Hinweis neben Free-Agent-Vorschlägen wählte bisher
global den schwächsten Bankspieler über alle Positionen hinweg (weakestBenchDrop),
unabhängig davon, für welche Position der Free Agent vorgeschlagen wurde.
Konkreter Fall: Stafford (QB) performt schwach -> ein QB-Free-Agent wird
vorgeschlagen -> als Drop-Kandidat erschien aber Rico Dowdle (RB), obwohl nur
1 QB startbar ist und ein RB-Drop für ein QB-Upgrade keinen Sinn ergibt.

Fix: weakestBenchDrop(team) entfernt, durch weakestAtPos(team, pos) ersetzt.
Sucht zuerst den schwächsten Bankspieler auf genau dieser Position; gibt es
dort keinen Bankspieler (typ. bei K/DST mit oft nur 1 Rostered-Spieler),
fällt die Funktion auf den aktuellen Starter dieser Position zurück und
kennzeichnet ihn als "würde ersetzt" statt fälschlich eine andere Position
vorzuschlagen. renderFreeAgents ruft weakestAtPos jetzt pro Position einzeln
innerhalb der Karten-Schleife auf statt einmal global davor.

Verifiziert per direktem Funktionstest (Playwright, window-Hook auf
weakestAtPos, da der Live-ESPN-FA-Endpoint in dieser Sandbox nicht mockbar
ist): weakestAtPos(team, 'QB') liefert jetzt korrekt "Backup QB" statt
"Rico Dowdle"; Fallback auf den Starter bei fehlender Bank-Tiefe (K-Beispiel)
funktioniert wie erwartet.

## 2026-09-16 – `bc3739b` Session-Log: Positionsgenauer Drop-Kandidat nachgetragen

Backup-Eintrag für den weakestAtPos-Fix (Commit 7c9dec0), damit bei
Kontextverlust nichts verloren geht.

## 2026-09-16 – `0babb3a` Mein Team: Verletzt-Status-Badges (Q/D/O/IR) bei Spielernamen

ESPNs injuryStatus-Feld (QUESTIONABLE/DOUBTFUL/OUT/INJURY_RESERVE/SUSPENSION/
DAY_TO_DAY) wird jetzt in sync-espn.mjs mit durchgereicht (Projektions-Fetch,
Spieler-Pool, roster.json-Kader-Mapping) und in my-team.html sowohl für
rostered Spieler (Starter/Bench, Trade-Karten, Drop-Kandidat) als auch für
Free-Agent-Vorschläge als kompakter Badge neben dem Namen angezeigt. OUT/
INJURY_RESERVE/SUSPENSION heben sich farblich stärker ab als Q/D. ACTIVE
und fehlende Werte zeigen bewusst keinen Badge.

Ziel: einen angeschlagenen Starter nicht übersehen bzw. bei FA-/Trade-
Vorschlägen sofort sehen, ob ein empfohlener Spieler gerade verletzt ist.

Verifiziert per Playwright mit gemocktem Roster (4 unterschiedliche Status-
Werte auf Starter/Bench verteilt) - alle 4 Badges erscheinen mit korrektem
Label und korrekter is-out-Einfärbung, Spieler ohne Status zeigen keinen
Badge.

## 2026-09-16 – `c9015ff` Session-Log: UX-Erweiterungen gestartet, Injury-Badges nachgetragen

Neuer Session-Log für das "mach alles"-UX-Paket, Backup-Eintrag für den
Injury-Badge-Fix (Commit 0babb3a).

## 2026-09-16 – `9401f3d` Mein Team: Skeleton-Ladezustände und Retry-Buttons bei Fehlern

Bisher zeigte die Seite beim Laden der Free-Agent-Empfehlungen nur einen
Textstatus ohne visuelles Feedback, und ein fehlgeschlagener Fetch (initiale
Liga-Daten oder Free Agents) endete in einer Sackgasse ohne Möglichkeit,
es direkt erneut zu versuchen - gerade auf dem Handy/bei wackligem Netz
spürbar.

Fix:
- Neue Skeleton-Puls-Platzhalter (.mt-skeleton) während Free-Agent-Fetches
  laufen, statt leerer Fläche.
- Retry-Button bei fehlgeschlagenem Free-Agent-Fetch, ruft renderFreeAgents
  mit denselben Argumenten erneut auf.
- Initialer Datenload (power-rankings/roster/rostered-ids/season-stats) in
  loadInitialData() gekapselt, bei Fehler ebenfalls Retry-Button statt
  Sackgasse.

Verifiziert per Playwright: erster Ladeversuch schlägt gezielt fehl (500),
Retry-Button erscheint und lädt beim Klick erfolgreich nach; nach
Team-Auswahl sind kurz Skeleton-Karten sichtbar, danach (da der Live-ESPN-
Endpoint in dieser Sandbox nicht mockbar ist) schlägt der FA-Fetch fehl und
zeigt korrekt den Retry-Button.

## 2026-09-16 – `5795a4f` Session-Log: Skeleton-Ladezustände und Retry nachgetragen

Backup-Eintrag für Commit 9401f3d.

## 2026-09-16 – `931f974` Mein Team: Neue Sektion "Deine Saison bisher" mit eigener Team-Statistik

sync-espn.mjs sammelt pro Team schon lange viele Kennzahlen (Streaks,
knappe Spiele/Blowouts, Wochen als Top-/Flopscorer der Liga, verpasste
Bank-Swaps, Überraschungssiege) in season-stats.json - bisher aber nur
als Zutat für Recap-Fakten genutzt, nirgends als eigene Übersicht pro
Team sichtbar.

Neue Sektion zwischen Roster und Team-Analyse fasst diese Werte in einer
Kachel-Übersicht zusammen: aktuelle Serie, längste Serie der Saison,
knappe Spiele (Marge < 5 Punkte), Blowouts (Marge > 30 Punkte), Wochen als
Topscorer/Flopscorer der Liga, Überraschungssiege (Sieg als Aussenseiter
laut Projektion) und Bank-Punkte, die durch den besten verpassten
Starter-Swap pro Woche liegen geblieben wären. Teams ohne Daten (noch
keine Woche ausgewertet) zeigen einen Hinweistext statt einer leeren
Kachel-Fläche.

Verifiziert per Playwright: Team mit gemockten Saisonwerten zeigt alle 8
Kacheln mit korrekt berechneten/formatierten Werten; Team ohne Eintrag in
season-stats.json zeigt korrekt den Fallback-Hinweis statt leerer Kacheln.

## 2026-09-16 – `cb6965c` Session-Log: Team-Statistik-Sektion nachgetragen

Backup-Eintrag für Commit 931f974.

## 2026-09-16 – `b95ed07` Mein Team: Neue "Diese Woche"-Digest-Sektion oben auf der Seite

Bisher waren die wichtigsten Signale über die ganze Seite verteilt (Team-
Analyse, Free-Agent-Empfehlungen, Trade-Ideen) - man musste sich durchscrollen,
um sich ein Gesamtbild zu machen. Neue Sektion "Diese Woche" ganz oben
bündelt zwei Dinge:

1. Schwächste Position + Top-Free-Agent-Empfehlung dafür in einem Satz
   (FA-Empfehlung wird asynchron nachgeladen, sobald renderFreeAgents()
   fertig ist - dieselbe Berechnung, nur zusätzlich oben zusammengefasst).
2. Live-vs-Projektion-Divergenz-Alarm: unabhängig vom aktuell gewählten
   Toggle wird IMMER sowohl die proj- als auch die live-optimale Aufstellung
   berechnet (playerValue()/buildOptimalLineupByValue()/liveOptimizedTeam()
   dafür um einen optionalen modeOverride-Parameter erweitert, Default bleibt
   das globale VALUE_MODE - rückwärtskompatibel). Weicht die live-optimale
   Aufstellung ab (ein Bankspieler mit besserem echtem Punkteschnitt würde
   einen aktuellen proj-Starter verdrängen), erscheint ein Hinweis - nur
   wenn man gerade NICHT schon im Live-Modus ist, sonst zeigt die Aufstellung
   das längst von selbst.

Verifiziert per Playwright: (1) Divergenz-Alarm erscheint korrekt und nennt
den richtigen Bankspieler/Starter bei einem gezielt konstruierten Szenario
(Bankspieler mit riesigem Live-Punkteschnitt, Modus auf "proj" erzwungen).
(2) Schwächste-Position-Hinweis erscheint mit "wird geladen"-Platzhalter,
wechselt nach FA-Fetch korrekt zu "konnte nicht geladen werden" (da der
Live-ESPN-Endpoint in dieser Sandbox nicht mockbar ist - dieselbe bekannte
Einschränkung wie bei den vorherigen FA-Tests dieser Session).

## 2026-09-17 – `d415cd7` Session-Log: "Diese Woche"-Digest nachgetragen

Backup-Eintrag für Commit b95ed07, inkl. Begründung, warum der
Bye-Week-Teil der ursprünglichen Digest-Idee bewusst zurückgestellt wurde.

## 2026-09-17 – `f727393` Mein Team: Neue Sektion "Trending im Waiver Wire"

sync-espn.mjs liest jetzt vor dem Überschreiben von rostered-ids.json den
vorherigen Snapshot, diffed ihn gegen den aktuellen Kader-Stand und schreibt
das Ergebnis nach data/waiver-trends.json: welche Spieler seither liga-weit
neu geholt bzw. gedroppt wurden. Da espn-sync.yml nur dienstags läuft (5x
im 2h-Abstand), deckt der Diff zwischen dem letzten Dienstags-Lauf und dem
ersten des nächsten praktisch eine volle Woche ab - die Seite zeigt bewusst
den echten "seit"-Zeitstempel statt pauschal "diese Woche" zu behaupten.

Für gedroppte Spieler (die evtl. weder gedraftet noch aktuell rostered
sind) wurde allNeededIds um den vorherigen Snapshot erweitert, damit
playerInfo() sie weiterhin über den bestehenden Projektions-Bulk-Fetch
auflösen kann, statt als "Unbekannter Spieler" zu enden. Erster Lauf ohne
Vorgänger-Datei liefert bewusst leere added/dropped-Listen statt den
kompletten aktuellen Kader fälschlich als "neu geholt" zu melden.

my-team.html: neue Sektion zwischen Free-Agent-Empfehlungen und Trade-Ideen,
zweispaltig (Neu geholt / Neu gedroppt, je bis 8 Einträge, nach ADP
sortiert). Liga-weit und team-unabhängig, deshalb nur einmal beim initialen
Laden gefüllt statt bei jedem Team-Wechsel neu berechnet. Initiale
data/waiver-trends.json mit leerem Platzhalter-Stand angelegt (erster
echter Diff erst ab dem übernächsten Sync-Lauf verfügbar).

Verifiziert per Playwright: gemockte Trends-Daten zeigen beide Spalten
korrekt sortiert mit Name/Position/Team/ADP; leerer Anfangszustand
(lastUpdated: null) zeigt korrekt den Hinweistext statt leerer Spalten.

## 2026-09-17 – `9516f91` Session-Log: Trending im Waiver Wire nachgetragen

Backup-Eintrag für Commit f727393.

## 2026-09-17 – `0136531` Mein Team: Neue Sektion "Playoff-Chancen"

sync-espn.mjs berechnet jetzt bei jedem Lauf eine vollständige Playoff-
Hochrechnung für ALLE Teams auf einmal (data/playoff-picture.json), nach
derselben Bracket-Logik wie computePlayoffPicture() (bereits vorhanden für
Recap-Storylines): die 2 Conference-Sieger als Seed 1/2, die 2 besten
Non-Conference-Sieger nach Bilanz als Wildcard-Seeds 3/4 (Punkte als
Tiebreak). Pro Team wird der Status "in" (mit Seed und Vorsprung/Rückstand
zum ersten Verfolger), "chasing" (Rückstand in Siegen zu Platz 4) oder
"eliminated" (auch mit ausschliesslich Siegen aus den verbleibenden Spielen
nicht mehr genug) berechnet - "eliminated" exakt dieselbe simple
Näherungslogik wie im bestehenden findPlayoffRaceFact() für Recaps
(Restspiele = 15 minus zuletzt komplett gewertete Woche).

my-team.html: neue Sektion "Playoff-Chancen" zwischen "Deine Saison bisher"
und "Team-Analyse". Zeigt für das gewählte Team eine passende Kurzeinschätzung
plus eine sortierte Liste aller Teams mit Status-Tag, das eigene Team optisch
hervorgehoben. Vor Woche 8 (dieselbe Schwelle wie findPlayoffRaceFact() in
sync-espn.mjs, hier übernommen statt neu erfunden) erscheint statt der Liste
ein Hinweis, dass es noch zu früh für eine sinnvolle Einschätzung ist.

Verifiziert per Playwright: (A) Woche 5 zeigt korrekt den "zu früh"-Hinweis
ohne Liste. (B) Woche 13 mit 6 Teams in allen 3 Status-Ausprägungen (in
Seed 1-4, chasing mit 0 Siegen Rückstand als Tiebreaker-Fall, eliminated)
zeigt korrekte Sortierung, korrekten Copy-Text für den Tiebreaker-Fall und
korrekte optische Hervorhebung des eigenen Teams.

## 2026-09-17 – `ea30056` Session-Log: Playoff-Chancen nachgetragen

Backup-Eintrag für Commit 0136531.

## 2026-09-17 – `923dcf1` Mein Team: Neue Sektion "Track-Record vergangener Tipps"

sync-espn.mjs erfasst jetzt bei jedem Lauf mit neu abgeschlossener Woche pro
Team die aktuell schwächste Position (proj-basiert, wie auf my-team.html)
und den dazu besten verfügbaren Free Agent (neue fetchTopFreeAgent()-Funktion,
serverseitiger Nachbau von my-team.html's fetchFreeAgents() über denselben
öffentlichen, cookie-losen DEFAULTS_URL-Endpoint) - zusammen mit einem
Baseline-Snapshot aus season-stats.json (Punkte/Spiele des Spielers sowie
der Team-Position zu diesem Zeitpunkt) in data/suggestion-history.json
gespeichert.

Mindestens 2 Wochen später wird jeder noch unbewertete Eintrag automatisch
bewertet: Punkteschnitt des vorgeschlagenen Spielers SEIT der Empfehlung
(Differenz zum Baseline-Snapshot) vs. Punkteschnitt, den das Team an dieser
Position im selben Zeitraum tatsächlich gemacht hat (ebenfalls per Differenz
- season-stats.json führt nur kumulierte Saison-Summen, keine Wochen-
Auflösung, daher dieselbe Snapshot-Diff-Technik wie bei waiver-trends.json).
Verdict "besser"/"schlechter"/"etwa gleich" je nach prozentualer Abweichung
(>10% Schwelle in beide Richtungen). Kein neues Ergebnis, wenn der Spieler
seither noch gar nicht gespielt hat (z.B. Bye Week) - Grading verschiebt
sich automatisch auf den nächsten Lauf.

my-team.html: neue Sektion "Track-Record vergangener Tipps" am Ende,
zeigt für das gewählte Team alle vergangenen Tipps (neueste zuerst) mit
Verdict-Badge oder "wird bewertet"-Platzhalter für noch offene Einträge.

Verifiziert: Grading-Logik separat mit synthetischen Daten in Node
durchgerechnet (zu früh -> bleibt unbewertet; Spieler klar besser ->
"besser"; Spieler hat noch nicht gespielt -> bleibt unbewertet; Spieler
schlechter -> "schlechter" - alle 4 Fälle korrekt). Playwright-Test mit
gemockter Tipp-Historie über 2 Teams: Anzeige filtert korrekt nur die
Einträge des gewählten Teams, sortiert neueste zuerst, zeigt korrekte
Verdict-Klassen/Texte für bewertete und unbewertete Einträge.

## 2026-09-17 – `a9b6a0d` Session-Log: Track-Record vergangener Tipps nachgetragen, UX-Paket abgeschlossen

Backup-Eintrag für Commit 923dcf1 - letzter Punkt der "mach alles"-UX-Liste
aus diesem Arbeitspaket. Alle 7 Punkte (Injury-Badges, Skeleton/Retry,
Team-Statistik-Karte, Diese-Woche-Digest, Trending Free Agents,
Playoff-Chancen, Track-Record) sind jetzt umgesetzt und live.

## 2026-09-17 – `af468be` Mein Team: Texte durchgehend gekürzt gegen zu langes Scrollen

Nutzer-Feedback: die Hinweis-Kachel oben war ein Textblock mit ~180 Wörtern
- man musste zu lange scrollen, um zum eigentlichen Inhalt zu kommen.

Hinweis-Kachel von 8 auf 3 kurze Sätze gekürzt (Näherungs-Disclaimer,
Toggle-Erklärung, Badge-Erklärung - Rest gestrichen, war Nice-to-have-Nuance
ohne Kerninformation). Zusätzlich alle anderen Erklärtexte auf der Seite
durchgesehen und wo sinnvoll gekürzt, ohne Bedeutung zu verlieren: Intro-
Absatz, Modus-Copy (Roster/Analyse/Trades), Saison-Statistik-Copy,
Playoff-Copy (inkl. aller 3 Status-Varianten), Trending-Copy, Track-Record-
Copy, FA-Drop-Hinweise, Digest-Divergenz-Alarm, Datenquelle-Hinweis am
Seitenende. Funktionalität/Bedeutung unverändert, nur Wortzahl reduziert.

Verifiziert per Playwright: alle Copy-Felder rendern weiterhin korrekt
und deutlich kürzer, keine Funktion beschädigt.

## 2026-09-17 – `b814cd1` Session-Log: Texte gekürzt (neuer Tag)

Backup-Eintrag für Commit af468be.

## 2026-09-17 – `7d88c5d` Mein Team: Trade-Ideen jetzt auch in umgekehrter Richtung (1-für-2, 1-für-3)

TRADE_SHAPES enthielt bisher nur [1,1], [2,1], [3,1], [3,2], [2,3] - also nie
den Fall, dass DU wenige, dafür wertvollere Spieler gibst und dafür MEHRERE
vom anderen Team bekommst. bestIdeaForShape()/combinations() unterstützten
das schon immer symmetrisch, es fehlten nur die Shapes [1,2] und [1,3] in
der Liste.

Verifiziert per Playwright mit gezielt konstruiertem Szenario (mein Bank-RB
im Wert von 150 passt exakt zu den zwei Bank-RBs des anderen Teams im Wert
von 80+70=150): die Dedup-Logik (fairster Shape pro Team+Position gewinnt)
wählt jetzt korrekt den 1-für-2-Vorschlag statt eines der bisherigen
Shapes, Verdict "Sehr ausgeglichen".

## 2026-09-17 – `af8c2d0` Session-Log: Trade-Shapes in umgekehrter Richtung nachgetragen

Backup-Eintrag für Commit 7d88c5d.

## 2026-09-22 – `a73779b` Workflows: Cron-Minute von :00 verschoben + Watchdog gegen komplett übersprungene Sync-Tage

Heute (22.9.) feuerte weder der 05:00- noch der 07:00-UTC-Trigger von
espn-sync.yml, obwohl der Workflow aktiv und korrekt konfiguriert war -
laut GitHub selbst ist die volle Stunde die Zeit mit der höchsten Last für
Scheduled-Workflows, wo Läufe eher übersprungen als nur verzögert werden.

1. espn-sync.yml: alle 5 Cron-Zeiten von :00 auf :07 verschoben (reduziert
   das Kollisionsrisiko, behebt es aber nicht vollständig - GitHub gibt für
   Scheduled-Runs keine Garantie).

2. Neuer Workflow espn-sync-watchdog.yml als echtes Netz: läuft 1x pro
   Dienstag um 14:23 UTC (nach dem letzten regulären Versuch um 13:07 UTC,
   bewusst auf einer weiteren Minute abseits von :00), prüft über die
   GitHub-API ob heute schon ein erfolgreicher espn-sync-Lauf war (egal ob
   scheduled oder manuell) und stösst sonst per workflow_dispatch einen
   nach. Mehrere Trigger-Zeiten allein reichen als Netz nicht, wenn
   ausgerechnet alle an einem Tag übersprungen werden - der Watchdog prüft
   das Ergebnis statt einfach nur öfter zu versuchen.

Manueller Sync-Lauf von eben (08:03-08:05 UTC) bereits erfolgreich
durchgelaufen und verifiziert nebenbei die neue serverseitige Logik aus
der letzten Session gegen echte Liga-Daten: playoff-picture.json,
waiver-trends.json und suggestion-history.json enthalten jetzt echte
Woche-2-Einträge (u.a. Kyler Murray/Cairo Santos/Jaguars D/ST als erste
Track-Record-Empfehlungen).

## 2026-09-22 – `c1159d4` Session-Log: Sync-Workflow-Diagnose und Watchdog-Fallback (neuer Tag)

Backup-Eintrag für Commit a73779b.

## 2026-09-22 – `07b9c41` Neue Seite: Hall of Fame (pro Jahr + Allzeit-Rekorde)

Nutzer-Wunsch: "ausserdem brauchen wir noch eine hall of fame eine pro jahr
der liga und eine gesammt wir haben dazu ja schon einige daten können wir
das noch ergänzen?"

Die Daten waren tatsächlich schon lange da: data/league-history.json führt
seit der Liga-Historie-Session pro Vorjahr (2024/2025) Meister, Endstand
und ein hallOfFame-Objekt (beste Team-Saison/-Woche, beste Spieler-Woche) -
wurde bisher aber NIRGENDS angezeigt, nur intern für Recap-Fakten in
sync-espn.mjs genutzt (findDefendingChampionFact, findAllTimeRecordFact
etc.). league-history.json's eigene note hatte das "Gesamt" (All-Time)
schon vorausgesehen: "beste Team-Saison aller Zeiten ... aus den beiden
Jahreswerten oben ableitbar, aber bewusst nicht zusammengefasst
gespeichert" - genau das jetzt clientseitig nachgeholt.

Neue Seite hall-of-fame.html:
- "Allzeit-Rekorde": Meiste Titel, beste Team-Saison, beste Team-Woche,
  beste Spieler-Woche - kombiniert die fixen Vorjahres-Werte aus
  league-history.json.hallOfFame MIT dem live aus scoreboard.json/
  standings.json/season-stats.json berechneten Stand der laufenden Saison
  (2026 ist noch nicht in league-history.json, die wird erst am Saisonende
  von Hand nachgetragen - siehe deren eigene note). Laufende-Saison-Werte
  sind deutlich "live" markiert, da sie noch fallen können.
- "Pro Jahr": eine Karte pro abgeschlossener Saison (neueste zuerst) mit
  Podium, Endtabelle und den jahresspezifischen Rekorden, plus eine
  "läuft"-Karte für die aktuelle Saison ganz oben (Zwischenstand statt
  Meister). Playoff-Ergebnisse (falls vorhanden, z.B. 2025) in einem
  aufklappbaren Detail-Block, um die Seite nicht unnötig zu verlängern.

Nav-Link auf allen 5 bestehenden Seiten ergänzt (Header-tool-nav bzw.
index.html's Mobile-Menü + Tool-Karten-Grid).

Verifiziert per Playwright: Allzeit-Rekorde wählen korrekt zwischen
historischem und Live-Wert (Live gewinnt nur, wenn tatsächlich höher -
im Test z.B. bei Team-Woche/Spieler-Woche, während die historische
Team-Saison 2025 weiterhin vorne liegt). Season-Karten erscheinen in
korrekter Reihenfolge (2026 live, 2025, 2024), Playoff-Details nur bei
Jahren mit vorhandenen Bracket-Daten. Mobile-Screenshot (420px) zur
visuellen Kontrolle geprüft.

## 2026-09-22 – `599c75f` Session-Log: Wochenüberblick-Fix und Hall-of-Fame-Seite nachgetragen

Backup-Einträge für Commit 630dd7c (Wochenüberblick deckt jetzt alle
Spiele ab) und 07b9c41 (neue Hall-of-Fame-Seite).

## 2026-09-22 – `0cf6bf1` Sync: Sanity-Check am Ende + sofortiger Retry nach jedem fehlgeschlagenen Lauf

Nutzer-Wunsch: ein Check nach jedem einzelnen Sync-Lauf (nicht nur einmal
täglich) reduziert die Wartezeit bis zur Reaktion, UND ein inhaltlicher
Sanity-Check am Ende des Sync-Skripts lohnt sich zusätzlich.

1. scripts/sync-espn.mjs: neue runSanityChecks(), ganz am Schluss von
   main() aufgerufen, NACHDEM alle data/*.json-Dateien geschrieben wurden.
   Prüft grobe Plausibilität (erwartete Team-Zahl 10 in standings/power-
   rankings/roster, jedes Team hat einen Kader mit Startern, scoreboard hat
   Wochen) und wirft bei einer Verletzung - dadurch beendet main().catch()
   weiter unten den Prozess mit Exit-Code 1. Bisher hätte eine ESPN-API-
   Störung, die eine teilweise/leere Antwort ohne Exception liefert,
   stillschweigend kaputte Daten committet (Job wäre grün geblieben).
   Verifiziert: aktuelle echte data/*.json-Dateien erfüllen alle Checks
   (10 Teams überall, alle Kader haben Starter, 15 Scoreboard-Wochen).

2. .github/workflows/espn-sync-watchdog.yml: neuer fast-retry-Job, per
   workflow_run-Trigger (feuert innerhalb von Sekunden nach JEDEM
   espn-sync.yml-Lauf, nicht erst beim Tages-Check um 14:23 UTC). Bei einem
   fehlgeschlagenen Lauf (conclusion != 'success', z.B. durch den neuen
   Sanity-Check ausgelöst) wird sofort ein Retry angestossen. Reagiert
   bewusst NUR auf scheduled Läufe (github.event.workflow_run.event ==
   'schedule'), nicht auf workflow_dispatch - sonst würde ein
   fehlschlagender Retry sich selbst erneut triggern (Endlosschleife).
   Der bestehende Tages-Check (jetzt daily-check-Job) bleibt unverändert
   als zweites Netz für den anderen Fehlerfall: dass GAR KEIN Lauf feuert
   (dafür gibt's kein workflow_run-Event zum Reagieren).

## 2026-09-22 – `9e2c2f3` Session-Log: Sanity-Check und Fast-Retry nachgetragen

Backup-Eintrag für Commit 0cf6bf1.

## 2026-09-22 – `bd43df9` Hall of Fame: Ewige Tabelle, Saison-Highlights, Rivalitäten

Nutzer wollte alle vorgeschlagenen Kategorien ausser "Trade-Aktivität über
die Jahre" umgesetzt haben:

1. scripts/sync-espn.mjs: board-Einträge in power-rankings.json bekommen
   jetzt ein id-Feld (Spieler-ID) - bisher nur r/rp/ov/pos/name/team/proj/
   adp, fehlte für eine zuverlässige Verknüpfung mit season-stats.json's
   players[id] (Namensabgleich wäre fehleranfällig gewesen). Rein additiv,
   bricht keine bestehenden Konsumenten (power-rankings.html/draft-board.html
   lesen nur die schon vorhandenen Felder aus).

2. hall-of-fame.html, drei neue Sektionen zwischen Allzeit-Rekorden und
   Pro Jahr:

   - "Ewige Tabelle": Karriere-Bilanz jedes Teams über alle Saisons
     (2024/2025 aus league-history.json + laufende Saison live aus
     standings.json), sortiert nach Titeln dann Sieg-Quote. ⭐-Badge für
     Gründungsmitglieder (dabei seit leagueFounded). Punkte bewusst NICHT
     aufsummiert (2024/2025 haben pointsFor=null, siehe bestehende note in
     league-history.json - eine Teilsumme wäre irreführend). Callout
     "Immer nah dran" für das Team mit den meisten Playoff-Teilnahmen ohne
     Titel.
   - "Diese Saison im Rampenlicht": 8 live berechnete Kennzahlen der
     laufenden Saison - längste Sieges-/Niederlagenserie, grösster
     Blowout/knappster Sieg (aus scoreboard.json-Einzelspielen, präziser
     als die reinen Zähler in season-stats.json), meiste Überraschungssiege,
     "Bank-König" (meiste liegen gelassene Bankpunkte), bester Draft-Value-
     Pick und grösster Draft-Flop (Runde vs. tatsächliche Punkte/Punkteschnitt,
     via das neue board[].id mit season-stats.json's players verknüpft).
     Bewusst als "diese Saison"-Highlights gerahmt, nicht als "aller
     Zeiten" - 2024/2025 haben diese granularen Daten nicht, werden erst ab
     jetzt getrackt.
   - "Rivalitäten": Team-Paare, die sich diese Saison schon zweimal
     gegenüberstanden (Doppel-Duelle im Spielplan), mit beiden
     Spielergebnissen. Nur für die laufende Saison - alte Spielpläne sind
     nicht gespeichert, nur Endstände.

Verifiziert per Playwright mit gemockten Daten über alle drei Sektionen:
Ewige Tabelle sortiert korrekt (Titel zuerst, dann Sieg-Quote), Gründungs-
Badge korrekt nur bei 2024er-Teams, "Immer nah dran"-Callout wählt korrekt
das Team mit den meisten titel-losen Playoff-Teilnahmen. Alle 8 Saison-
Highlights zeigen plausible Werte aus den Mock-Daten. Rivalitäten erkennt
korrekt beide konstruierten Doppel-Duelle mit richtiger Spiel-für-Spiel-
Aufschlüsselung. Mobile-Screenshot (420px) zur visuellen Kontrolle geprüft.

## 2026-09-22 – `f1e48d2` Session-Log: Hall-of-Fame-Erweiterung nachgetragen

Backup-Eintrag für Commit bd43df9.

## 2026-09-22 – `d7e2b42` Hall of Fame: grosse Champion-Kachel ganz oben

Nutzer-Wunsch: "zu oberst in der hall of fame als eigene kachel schön
gross soll der aktuelle champion stehen".

Neue Hero-Kachel direkt unter dem Intro-Text, ausserhalb des sonst bis
zum Laden versteckten Content-Bereichs (erscheint also sofort). Zeigt
den Champion der zuletzt ABGESCHLOSSENEN Saison (höchstes Jahr in
league-history.json.seasons - die laufende Saison 2026 hat noch keinen
Meister) gross mit Pokal-Emoji, Jahr und Endbilanz. Zeigt nichts, falls
noch keine Saison abgeschlossen ist (defensiv für den Fall einer
komplett leeren Historie).

Verifiziert per Playwright: zeigt korrekt "Amtierender Meister · Saison
2025 – Zurich City Ravens – 11-4" bei gemockten Daten mit 2024+2025.
Mobile-Screenshot (420px) bestätigt die gewünschte Grösse/Prominenz.

## 2026-09-22 – `3a0e07b` Session-Log: Champion-Hero-Kachel nachgetragen

Backup-Eintrag für Commit d7e2b42.

## 2026-09-23 – `82b8274` Session-Log: Vorschau-Fix nachgetragen (neuer Tag)

Backup-Eintrag für Commit 637cd8e, inkl. der noch nicht umgesetzten
4 vorgeschlagenen Hall-of-Fame-Kategorien als offener Punkt.

## 2026-09-23 – `489ee33` Neue Startseite start.html als mobile Navigations-Hub

Landet man künftig zuerst auf start.html: Team wählen (Sync), Design
auswählen, dann 6 grosse Buttons zu Mein Team, Spielplan, Power
Rankings, Übersicht (index.html), Hall of Fame und Draft Board -
schnellerer Einstieg auf dem Handy statt dem langen Guide als
Startpunkt. Alle Seiten-Logos und die PWA (manifest.json start_url)
verlinken jetzt hierher; index.html bleibt inhaltlich unverändert und
wird zu einem der Navigationsziele.

## 2026-09-23 – `7b90481` Session-Log: Neue Startseite start.html nachgetragen

## 2026-09-23 – `9cbf565` Startseite: Redirect-Guard für Root-URL und PWA-Neustart

Sowohl die nackte GitHub-Pages-URL als auch ein installiertes PWA-Icon
landeten weiterhin auf index.html statt start.html - bei GitHub Pages
serviert eine Verzeichnis-URL immer die Datei namens index.html, und
ein bereits installiertes Icon behält den start_url-Wert von der
Installation. Statt index.html/start.html umzubenennen (würde die fest
verdrahteten index.html#anker-Links in data/team-content.json brechen,
die nie automatisiert angefasst werden dürfen), leitet index.html jetzt
per kleinem Inline-Script beim ersten Aufruf pro Session ohne Anker auf
start.html weiter. Anker-Links (#draft-tipps etc.) und bewusste
Navigation von start.html aus zu index.html bleiben unangetastet.

## 2026-09-23 – `38c724e` Session-Log: Root-URL/PWA-Redirect-Fix + Umbau-Plan nachgetragen

## 2026-09-23 – `3ad3e1d` Session-Log: Spielplan-Bracket-Feature nachgetragen

## 2026-09-23 – `6b9a12c` Spielplan: Playoffs als dritter Standings-Tab statt eigener Sektion

Nutzer-Feedback: Playoffs sollten wie "Nach Conference"/"Liga" ein
dritter Umschalt-Tab bei den Standings sein, im selben dunklen
Tabellen-Design, der die Standings beim Umschalten ausblendet - keine
separate Sektion mit eigenem Button/Kartendesign weiter unten.

Playoffs-Tab ersetzt jetzt Standings-Tabelle/Conference-Ansicht 1:1 an
derselben Stelle. Bracket-Zeilen im selben .standings-table-Look wie
die Team-Zeilen (dunkler Turf-Hintergrund, IBM-Plex-Mono-Label, Amber-
Score/Seed-Akzente) statt der vorherigen hellen Karten-Komponente.

## 2026-09-23 – `426d3da` Session-Log: Playoffs-Tab-Korrektur nachgetragen

## 2026-09-23 – `0468279` Session-Log: Playoff-Qualifikationsregel-Korrektur nachgetragen

## 2026-09-23 – `3390ef7` Session-Log: Bracket-Kartendesign nachgetragen

## 2026-09-23 – `15dba6e` Playoffs-Tab: Kartendesign mit zwei Runden nebeneinander, Finale hervorgehoben

Nutzer-Feedback (mit ESPN-Screenshot als Vorbild): Bracket-Anordnung als
zwei Runden-Spalten nebeneinander gefällt besser als die bisherigen
dünnen Einzeiler, und das Finale soll als "Fantasy Super Bowl" optisch
hervorstechen.

Jedes Match ist jetzt eine eigene Karte mit den zwei Team-Zeilen
übereinander (Seed-Badge, Name, Score sobald entschieden), Runde 1 und
Runde 2/Finale als eigene Spalten nebeneinander (Grid, bricht auf
schmalen Screens auf eine Spalte um). Noch unbekannte Runde-2-Gegner
zeigen eine gedimmte "TBD"-Zeile mit dem Platzhaltertext (z.B. "Sieger
Halbfinale A"). Die Finale-Karte bekommt einen dicken Amber-Rahmen,
Schlagschatten und ein "🏆 Fantasy Super Bowl"-Banner, um sich klar von
den übrigen Matches abzuheben. Weiterhin dieselbe dunkle Turf/Chalk/
Amber-Optik wie Standings und Spielplan-Zeilen, nur als Karten statt
Tabellenzeilen.

## 2026-09-23 – `52075bf` Playoffs-Tab: Projektions-Hinweistext entfernt

Nutzer-Feedback: der erklärende Absatz unter dem Bracket
("Seeds sind eine Projektion...") wird nicht gebraucht.

bracketNote-Element und die zugehörige Logik komplett entfernt.
Ladefehler zeigen sich jetzt direkt als Status-Zeile in der
Playoffs-Spalte statt in einer separaten Notiz.

## 2026-09-23 – `57badfa` Session-Log: Hinweistext-Entfernung nachgetragen

## 2026-09-23 – `33d813c` Playoffs-Tab: Spiel um Platz 3 zum Consolation Bracket, Finale steht allein

Nutzer-Feedback: "packe die Halbfinal-Verlierer zum Consolation
Bracket, so dass der Super Bowl alleine steht - sieht schöner aus und
wirkt wichtiger dann."

Das "Spiel um Platz 3" (Verlierer der Halbfinals) ist jetzt Teil der
Consolation-Bracket-Sektion statt der Finale-Spalte - die Finale-Karte
steht dort jetzt allein und bekommt dadurch mehr visuellen Raum/
Gewicht. Da die Platzierungsspiele-Spalte im Consolation Bracket jetzt
zwei unterschiedliche Pools mischt (Platz 3 aus dem Titel-Bracket,
Platz 5-10 aus dem Consolation Bracket selbst), haben alle vier Karten
dort einen kleinen Label-Tag ("Spiel um Platz 3", "Platz 5/6" etc.)
bekommen, damit die Zuordnung trotzdem eindeutig bleibt. Sektions-
Überschrift entsprechend zu "Consolation Bracket (Platz 3, 5–10)"
präzisiert.

## 2026-09-23 – `efd03c8` Session-Log: Spiel-um-Platz-3-Verschiebung nachgetragen

## 2026-09-23 – `27861a9` Playoffs-Tab: kürzere Bracket-Spalte vertikal zur längeren zentriert

Nutzer-Feedback: das Finale soll nicht oben an Halbfinale 1 kleben,
sondern schön mittig zwischen den beiden Halbfinal-Karten stehen; im
Consolation Bracket sollen die 3 Runde-1-Spiele mittig zu den 4
Platzierungsspielen rechts stehen, für ein gleichmässigeres Bild.

Jede Bracket-Spalte ist jetzt intern ein Flex-Container: Die Runden-
Beschriftung bleibt oben fix (beide Spalten-Labels bleiben auf
gleicher Höhe), darunter zentriert sich die Kartengruppe vertikal im
verbleibenden Platz. Da CSS-Grid-Zeilen standardmässig gleich hoch
gestreckt werden, übernimmt automatisch die kürzere Spalte die Höhe
der längeren und zentriert ihre Karten mittig darin - Finale mittig
zwischen den Halbfinals, die 3 Consolation-Runde-1-Spiele mittig zu
den 4 Platzierungsspielen.

## 2026-09-23 – `25a2c9d` Session-Log: Spalten-Zentrierung nachgetragen

## 2026-09-23 – `0c74382` Power Rankings: Verlauf-Texte entfernt, SOS-Text gekürzt, Draft Recap einklappbar

Auf Wunsch die beiden Erklär-Absätze über Power-Ranking-Verlauf und
Strength-of-Schedule-Verlauf entfernt (Tabellen sind selbsterklärend),
den SOS-Erklärtext gekürzt (Kernaussage bleibt: 15 Gegner, Conference-
Gegner zählt doppelt, Rang 1 = schwierigster Spielplan, live).

"📋 Draft Recap" pro Team ist jetzt ein <details>-Element (Muster wie
"Komplettes Draft Board" direkt darunter) statt statisch sichtbarem
Text - alle 10 starten eingeklappt, lassen sich einzeln unabhängig
voneinander öffnen, damit man gezielt nur das gewünschte Team liest
statt durch alle 10 Analysen scrollen zu müssen.

## 2026-09-23 – `f43f108` Session-Log: Power-Rankings-Aufräumarbeiten nachgetragen

## 2026-09-23 – `75fecba` Power Rankings: ESPN-Satz zum Draft Recap verschoben, Transaktionen & Team-Karten einklappbar

Drei Anpassungen auf Nutzer-Feedback:

1. Der Satz "Den kompletten offiziellen Draft Recap gibt's dazu direkt
   bei ESPN..." gehörte inhaltlich zum Draft-Recap-Bereich, stand aber
   oben im allgemeinen Seiten-Intro - jetzt direkt vor der Team-Karten-
   Liste platziert statt am Seitenanfang.

2. Transaktions-Wochen (.tx-week) starten jetzt alle eingeklappt (bisher
   war die neuste Woche automatisch offen) und sehen wie Touch-Buttons
   aus (Pill-Form, Kartenhintergrund, Rahmen) statt wie ein Text-Link
   mit "+"-Präfix - "Woche 1", "Woche 2" usw. als eigenständige,
   antippbare Buttons.

3. Die kompletten Team-Karten (bisher statische <section>, immer voll
   sichtbar) sind jetzt selbst <details>-Elemente: Rang-Badge, Name und
   Rang-Bewegung bleiben als Summary sichtbar, der Rest (Tagline, Stats,
   Positions-Tabelle, Saison-Ausblick, Draft Recap, Draft Board) ist
   eingeklappt und öffnet sich erst auf Klick - Pfeil-Indikator im
   selben Rotations-Muster wie die Wochen-Karten auf schedule.html.

## 2026-09-23 – `4491a3a` Session-Log: Power-Rankings-Einklapp-Iteration nachgetragen

## 2026-09-23 – `7616999` Temp: Debug-Workflow für ESPNs mTransactions2-Response-Shape

Nur zur Vorbereitung der Umstellung von Roster-Diffing auf ESPNs
echtes Transaktions-Log (siehe Session-Log) - dumpt die rohe Antwort
in die Action-Logs, schreibt/committet nichts. Wird nach der
Umstellung wieder entfernt.

## 2026-09-23 – `7f325e0` Temp: Debug-Skript um Recent-Activity-Feed und Wochen-Param erweitert

mTransactions2 zeigte fast nur Lineup-Rauschen (type ROSTER) und keine
Waiver-/Free-Agent-Einträge - testet zusätzlich kona_league_communication
(dieselbe Quelle wie ESPNs eigene "Recent Activity"-Seite) sowie einen
expliziten scoringPeriodId-Parameter.

## 2026-09-23 – `e2e7772` Temp: Debug-Skript auf scoringPeriodId=3 fokussiert (kumulative Historie)

## 2026-09-23 – `dcee9d3` Temp: Debug-Skript vergleicht scoringPeriodId 1/2/3, Detail für Woche 2

## 2026-09-23 – `0954ddc` Session-Log: Transaktions-Log-Umstellung nachgetragen

## 2026-09-23 – `bfbcd58` Temp: Debug-Workflow für Trade-Status und Wochen-Grenzen

## 2026-09-23 – `f099450` Temp: Debug-Skript sucht die fehlende TRADE_PROPOSAL über alle Wochen

## 2026-09-23 – `e645118` Temp: Debug-Skript prüft Recent-Activity-Feed und Woche-0 als letzte Quellen

## 2026-09-23 – `0104aca` Changelog: fehlende TRADE_PROPOSAL-Datenlücke und Fallback-Fix dokumentiert

Session-Log um die dritte Transaktions-Iteration ergänzt: Root Cause
(ESPN liefert die ursprüngliche Proposal für manche Trades nicht
zurück), der Fallback-Fix, der Live-Verifikationsbefund (betrifft
auch die Trades aus Woche 1 und 2), sowie die Antwort auf die Frage
nach Wochen-Start/-Ende.

## 2026-09-23 – `22f5d12` Temp: Debug-Workflow prüft falsch zugeordnete Trade-Partner (Woche 2/3)

Nutzer meldet: bei beiden Trades ist jeweils nur ein Team korrekt,
das andere fehlerhaft. Dumpt Team-Namen + alle TRADE*-Rohdatensätze
für die betroffenen relatedTransactionIds, um die korrekte
Team-Zuordnungslogik zu finden.

## 2026-09-23 – `5f3bede` Changelog: falsche Gegner-Teams bei Trade-Fallback dokumentiert und behoben

Session-Log um die vierte Transaktions-Iteration ergänzt: Nutzer
bestätigte, dass TRADE_UPHOLD.teamId in allen 3 Fällen das falsche
Gegner-Team lieferte. Root Cause, der Fix (TRADE_OVERRIDES statt
TRADE_UPHOLD.teamId) und die Live-Verifikation dokumentiert.

## 2026-09-23 – `90e2018` Power Rankings: Intro- und Hinweistext gekürzt, veralteten Transaktionstext korrigiert

Intro-Absatz und die Hinweisbox unter "Power Ranking" gekürzt, Kernaussagen
bleiben erhalten. Nebenbei bemerkt: der Transaktionen-Absatz behauptete noch
"neueste Woche automatisch aufgeklappt" - stimmte seit der letzten Änderung
(alle Wochen starten eingeklappt) nicht mehr, jetzt korrigiert.

## 2026-09-23 – `8df7a5d` Changelog: Power-Rankings-Textkürzungen dokumentiert

## 2026-09-23 – `68e9261` Power Rankings: "Nach dem Draft"-Präfix aus dem Status-Kicker entfernt

War statisch hinterlegt und stimmte längst nicht mehr (Liga ist bei
Woche 3) - "Stand <Datum>" allein reicht.

## 2026-09-23 – `3a99596` Changelog: "Nach dem Draft"-Präfix-Fix dokumentiert
