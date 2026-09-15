# Changelog

Automatisch gepflegt: jeder inhaltliche Push auf `main` hängt hier automatisch seine Commit-Message an (siehe `.github/workflows/changelog.yml`). Reine Daten-Sync-Commits (`espn-sync-bot`) werden bewusst ausgeklammert, damit hier nur inhaltliche Änderungen stehen.

Für die ausführlichere, im Zusammenhang erklärte Doku (was wurde gebaut, warum, wo im Code) siehe die `docs/session-log-*.md`-Dateien – die werden nicht automatisch generiert, sondern von Claude an sinnvollen Punkten von Hand aktualisiert.

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

## 2026-09-15 – `608ffc8` Recaps: falsche "Start bei 0 Punkten"-Erzählung gefixt, Recap-Button sichtbarer

Dritter echter Befund aus dem Woche-1-Lauf: fast jeder Recap erzählte
eine "Team lag früh bei 0.0 Punkten"-Geschichte. Ursache: der einzige
Live-Snapshot dieser Woche wurde VOR dem eigentlichen Spielbeginn
aufgenommen (Workflow kam erst mitten in der Woche dazu) und zeigte
buchstäblich 0:0 für alle 5 Spiele – kein echter Frühstand, sondern
schlicht "Spiel hatte noch nicht angefangen". Alle Live-Fakten
(Frühstarter/Spätzünder, Kollaps/Comeback, Nervenkrieg, Zittersieg,
Dauerhafter Nervenkrieg) haben das trotzdem als echten Datenpunkt
gewertet.

Fix: extractDiffTimeline() und findPaceFact() ignorieren jetzt
Snapshots, in denen ein Spiel noch bei 0:0 steht – das ist kein
Zwischenstand, sondern "noch nicht losgegangen". Betrifft auch
data/season-personality.json: dort hatte JEDES Woche-1-Siegerteam
fälschlich "ledWireToWire" kassiert, weil der 0:0-Fake-Startpunkt nie
als Rückstand zählte – zurückgesetzt, damit es sauber neu aufgebaut
wird.

Ausserdem das Wort "Snapshot" (zu technisch, kein Football-Jargon) aus
den Fakten-Sätzen entfernt (durch "Zwischenstand"/"im Wochenverlauf"
ersetzt) und dem System-Prompt eine explizite Anweisung gegeben, den
Begriff zu vermeiden.

Recap-Button auf schedule.html war nur eine kleine unauffällige
Textzeile ohne jede Button-Optik – jetzt eine klar erkennbare
Pillen-Form mit Amber-Hintergrund und rotierendem Pfeil-Indikator beim
Auf-/Zuklappen, Label von "Recap" auf "Recap lesen" präzisiert.

Alle 5 Woche-1-Recaps aus dem Cache entfernt, damit sie mit den Fixes
sauber neu generiert werden.
