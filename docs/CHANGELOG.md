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
