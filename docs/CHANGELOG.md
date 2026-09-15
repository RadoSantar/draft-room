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

## 2026-09-15 – `458fc84` Wochen-Recap: max_tokens erhöht, erster Lauf lief in Truncation

Erster echter Lauf des neuen Gesamt-Recap-Features ist mit
"stop_reason: max_tokens" leer zurückgekommen - 700 Tokens reichten
nicht für Schlagzeile + 4-6 Sätze über 5 Spiele mit Fakten-Digest.
Gleiche Fehlerklasse wie schon bei den Einzel-Recaps (dort war die
Lösung ebenfalls: Budget hochsetzen). Auf 1200 angehoben.
