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
