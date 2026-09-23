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

## 4. Root-URL und PWA-Neustart landeten auf `index.html` statt `start.html`

**Nutzer-Feedback:** Zwei Meldungen kurz nacheinander – (a) "wenn ich die pwa schliesse und wieder öffne lande ich nicht auf der start sondern auf der index", (b) "auch online wenn ich im browser https://radosantar.github.io/draft-room/ öffne lande ich auf der übersicht und nicht auf der startseite".

**Root Cause:** Beides dasselbe strukturelle Problem, kein Caching-Bug (`sw.js` ist ein reiner Passthrough-Service-Worker, cacht nichts). GitHub Pages liefert für eine Verzeichnis-URL (`/draft-room/`, ohne Dateinamen) automatisch die Datei `index.html` – normale Web-Server-Konvention. Bei der installierten PWA kommt zusätzlich hinzu: der `start_url` wird beim Installieren ins Home-Screen-Icon "eingebrannt" und danach nicht rückwirkend aktualisiert.

**Warum kein Datei-Umbenennen als Sofort-Fix:** Die "saubere" Lösung wäre, `start.html` in `index.html` umzubenennen und das alte `index.html` (FAQ/Guide) umzubenennen. Aber `data/team-content.json` (von Hand geschriebene Team-Analysen, dürfen nie automatisiert angefasst werden) enthält mindestens einen fest verdrahteten Link `index.html#term-zero-rb-hero-rb` im Fliesstext – eine Umbenennung hätte diesen Link gebrochen. Ausserdem hätten alle "← Übersicht"-Deep-Links auf 5 Tool-Seiten mit-migriert werden müssen. Deshalb stattdessen ein kleiner, gezielter Workaround.

**Fix:** Redirect-Guard per Inline-Script, direkt nach `<meta charset>` in `index.html` (läuft so früh wie möglich, kein sichtbarer Flash):
```js
var isHome = /\/(index\.html)?$/.test(location.pathname);
if (isHome && !location.hash && !sessionStorage.getItem('draftroom-entered')) {
  location.replace('start.html');
}
```
`start.html` setzt beim Laden das `sessionStorage`-Flag `draftroom-entered`. Wirkung: nackte Root-URL UND vom PWA-Icon geöffnetes `index.html` leiten (ohne Anker, ohne bereits gesetztes Flag) sofort auf `start.html` weiter. Anker-Links (`index.html#draft-tipps` usw. – exakt die Links aus den Tool-Seiten und aus `team-content.json`) werden nie umgeleitet. Klickt man von `start.html` aus bewusst auf die "Übersicht"-Kachel, ist das Flag schon gesetzt → kein Zurück-Bounce. Schliesst man Tab/App komplett, ist `sessionStorage` leer → nächster Aufruf landet wieder auf `start.html`.

**Getestet (Playwright):** (1) frischer Aufruf `/index.html` ohne Anker → landet auf `start.html`. (2) `/index.html#draft-tipps` → bleibt dort, kein Redirect. (3) erst `start.html`, dann Klick auf "Übersicht"-Kachel → bleibt auf `index.html`. (4) neuer Browser-Context (simuliert komplettes Schliessen) → `/index.html` leitet wieder auf `start.html` weiter. Alle vier Fälle wie erwartet.

Commit `9cbf565`, gepusht.

## 5. Geplanter (noch nicht umgesetzter) sauberer Umbau ohne Workaround

Nutzer-Wunsch: einen Plan für den "richtigen" Umbau ohne den Redirect-Workaround, inklusive Backup/Fallback, für später vorbereitet zu haben.

**Ziel:** `start.html` wird physisch zu `index.html` (überschreibt die alte Datei), das bisherige `index.html` (FAQ/Guide) wird zu `uebersicht.html`. Damit liefert GitHub Pages die Root-URL sofort korrekt, kein JS-Redirect mehr nötig, funktioniert auch für Social-Media-/Crawler-Vorschauen ohne JS-Ausführung.

**Nötige Änderungen (bei Umsetzung):**
1. `index.html` → `uebersicht.html` umbenennen (Inhalt unverändert).
2. `start.html` → `index.html` umbenennen (überschreibt die dann freie Datei); Redirect-Guard-Script wieder entfernen (wird überflüssig).
3. Alle "← Übersicht"-Links und Inline-Gloss-Links auf den 5 Tool-Seiten (`index.html#draft-tipps`, `index.html#rechner`, `index.html#roster-tipps`, `index.html#trades`, `index.html#basics` usw.) → `uebersicht.html#anker`.
4. Die 6 `title-group`-Logo-Links (aktuell `start.html`) → zurück auf `index.html`.
5. Die neue `index.html` (ex-`start.html`) eigene "Übersicht"-Kachel → `href="uebersicht.html"` statt `index.html`.
6. `manifest.json`: `start_url` zurück auf `./index.html`.
7. Eigene OG-/Twitter-Meta-Tags für die neue `index.html` ergänzen (aktuell hat `start.html` keine); `uebersicht.html`s `og:url` auf die neue Datei anpassen.
8. **Blockierende Voraussetzung:** `data/team-content.json` enthält im TM06-Eintrag den Link `index.html#term-zero-rb-hero-rb` – müsste auf `uebersicht.html#...` geändert werden. Da diese Datei nie automatisiert angefasst werden darf, braucht es dafür **explizite Nutzer-Zustimmung** für genau diese eine Pfad-Anpassung (keine inhaltliche Änderung an den Analysen), bevor der Umbau starten kann.

**Backup/Fallback-Strategie:**
- Vor dem Umbau einen Git-Tag auf dem aktuellen `main`-Stand setzen und pushen (z.B. `git tag backup-vor-index-umbau && git push origin backup-vor-index-umbau`) als klarer Rückspring-Punkt.
- Der gesamte Umbau in einem einzigen, sauber benannten Commit (nicht vermischt mit anderen Änderungen) – ermöglicht im Fehlerfall ein atomares `git revert <commit>`.
- Hinweis: `start.html` als Dateiname verschwindet danach; da die Seite erst seit kurzem existiert und noch nicht breit geteilt wurde, ist das Risiko kaputter externer Links/Lesezeichen gering, aber nicht null.
- Verifikation wie gehabt per Playwright: alle Links auf allen 8 Seiten stichprobenartig prüfen, `manifest.json` parsen, und zusätzlich das rohe HTML von `index.html` (ohne JS-Ausführung, z.B. per `curl`) kontrollieren, dass es direkt den Start-Hub-Inhalt enthält (Crawler-Perspektive).

**Status:** Nicht umgesetzt – wartet auf Nutzer-Entscheid zur blockierenden Voraussetzung (Punkt 8) und allgemeines Go.

## 6. Spielplan: Info-Texte entfernt, Playoff- & Consolation-Bracket ergänzt

**Nutzer-Wunsch:** Drei als nicht zwingend nötig empfundene Erklär-Absätze auf `schedule.html` entfernen (oberhalb des Spielplans: der lange Absatz über Liga-Phase-Format; unterhalb: die zwei Absätze zu Doppel-Duellen/"Max. Conference-intern" und zum Playoff-Übergang). Ausserdem: bei den Standings einen Button für die Playoffs ergänzen, und ein Playoff-/Consolation-Bracket, das jede Woche zusammen mit den Standings automatisch aktualisiert wird.

**Text-Entfernung:** Die drei genannten Absätze (`schedule.html`, ehemals Zeilen 302/332/333) entfernt, Rest der Seite unverändert.

**Playoff-/Consolation-Bracket:** Das exakte Format war bereits als statisches Beispiel in `index.html`s "Playoff-Format"-Kapitel dokumentiert (2 Conference-Sieger + 2 Wildcards = Seeds 1-4 im Titel-Bracket, Seeds 5-10 im Consolation-Bracket, feste Paarungen für Woche 16/Runde 1 und Woche 17/Platzierungsspiele) – daraus liess sich eine präzise, deterministische Berechnung ableiten, keine Annahmen nötig.

- Neue Funktion `buildPlayoffBracket()` in `scripts/sync-espn.mjs` (direkt nach `computePlayoffPicture()`, die schon Seeds 1-4 lieferte – Seeds 5-10 sind einfach die "outside"-Teams derselben Sortierung weitergezählt). Läuft im selben wöchentlichen Sync wie Standings, schreibt `data/playoff-bracket.json`.
- Vor Woche 16 sind alle Paarungen eine reine **Projektion** nach aktuellem Tabellenstand. Sobald `data/scoreboard.json` (das ESPNs `playoffTierType` schon länger passthrough-mässig mitführt) ein echtes Spiel zwischen den erwarteten zwei Teams liefert, übernimmt der Bracket Score und Sieger von dort statt sie zu schätzen.
- Runde-2-Gegner (Finale, Spiel um Platz 3, die drei Platzierungsspiele) hängen vom Ausgang von Runde 1 ab und sind daher bis dahin nur Platzhalter-Text ("Sieger Halbfinale A" etc.) – exakt wie im ursprünglichen statischen Beispiel in `index.html`.
- Sanity-Check ergänzt: `playoff-bracket.json` muss genau 10 Seeds haben.
- Frontend (1. Version): Button "🏆 Playoffs" bei der Standings-Überschrift sprang per Anker zu einem neuen Abschnitt weiter unten; dort wurden beide Brackets mit der (aus `index.html` übernommenen) hellen Bracket-CSS-Komponente gerendert.

**Getestet:**
- Bracket-Pairing-Logik zuerst isoliert mit Mock-Daten geprüft (Szenario "keine echten Spiele" → korrekte Seed-Paarungen + Platzhalter; Szenario "Runde 1 entschieden" → Runde 2 löst korrekt auf, inkl. dem etwas ungewöhnlichen "Platz 7/8 = Sieger Spiel 3 vs. Verlierer Spiel 3"-Rematch) – alle Erwartungen exakt getroffen.
- Danach echten Sync über `espn-sync.yml` manuell angestossen (Run #30, erfolgreich) und `data/playoff-bracket.json` live erzeugen lassen – 10 echte Seeds nach aktuellem Wochen-2-Stand, korrekte Paarungen.

Commit `8290e37` (Code), `7fcf9fc` (automatischer Sync-Lauf, erzeugt `playoff-bracket.json`).

**Korrektur nach Nutzer-Feedback:** Die separate Sektion mit Button/hellem Kartendesign war nicht gewünscht. Stattdessen: "Playoffs" wurde als **dritter Tab** direkt in die bestehende Standings-Tab-Leiste eingebaut (neben "Nach Conference"/"Liga") – Klick darauf blendet die Standings-Tabelle aus und zeigt beide Brackets an exakt derselben Stelle, im selben dunklen `.standings-table`-Look (Turf-Hintergrund, IBM-Plex-Mono, Amber-Akzente für Seed-Badges und Scores) statt der hellen Karten-Optik. Die alte Sektion (eigene Überschrift, Sprung-Button, `.bracket-match`/`.bracket-wrap`-CSS) wurde komplett entfernt. `setStandingsView(view)` steuert jetzt zentral, welche der drei Ansichten (Conference/Liga/Playoffs) sichtbar ist. Playwright erneut gegen die echten Live-Daten geprüft: alle drei Tab-Zustände schalten korrekt um, Bracket-Zeilen zeigen dieselben 10 Matches wie zuvor, keine Konsolen-Fehler, Screenshot bestätigt einheitliches Design.

Commit `6b9a12c`, gepusht.

**Zweite Korrektur nach Nutzer-Feedback (Qualifikationsregel war falsch):** "das playoff bracket stimmt so aber noch nicht es sind jeweils platz 1&2 von AFC & NFC in den playoffs nicht platz 1-4 der Liga". Die ursprüngliche Annahme (übernommen aus dem bis dahin unbemerkt falschen statischen Beispiel in `index.html`s FAQ) war: 2 Conference-Sieger + 2 liga-weite Wildcards nach Gesamt-Bilanz. Tatsächliches Format dieser Liga: schlicht die **Top 2 jeder Conference** (2 aus NFC, 2 aus AFC) – unabhängig davon, wie stark die andere Conference insgesamt ist.

- `computePlayoffPicture()` in `sync-espn.mjs` korrigiert: Playoff-Pool ist jetzt `confStandings[id].rank <= 2` (statt Conference-Leader + beste 2 Nicht-Leader liga-weit), geseedet 1-4 nach Gesamt-Bilanz über beide Conferences. Diese eine Funktion wird von drei Stellen geteilt (Playoff-Bracket, `data/playoff-picture.json` für my-team.html's Playoff-Chancen, und `findPlayoffRaceFact()` für generierte Recaps) – der Fix behebt alle drei auf einmal.
- `qualTag`-Badge basiert jetzt auf dem echten Conference-Rang (`rank===1` → "Conf.-Sieger", `rank===2` → "Conf. #2") statt auf der Seed-Nummer, da Seed 1-4 nicht mehr zwingend "2 Sieger, dann 2 Wildcards" in dieser Reihenfolge sind.
- Statisches FAQ-Beispiel in `index.html` ("Playoff-Format") ebenfalls korrigiert (Regel-Erklärung, Quali-Tags, Zusammenfassungs-Notiz) – die Beispiel-Zahlen selbst blieben gültig, weil die "Wildcards" des ursprünglichen Beispiels zufällig ohnehin die Conference-Zweiten waren. Beschreibender Kommentar in `my-team.html` ebenfalls angepasst.

**Getestet:** Gezielter Testfall mit einer durchweg starken Conference (bis 13-2 auf Platz 3) gegen eine durchweg schwache (bis 4-11 auf Platz 2) – bestätigt, dass die schwache Conference-Nummer-2 jetzt korrekt qualifiziert und die starke Conference-Nummer-3 trotz besserer Bilanz draussen bleibt. Danach echten Sync-Lauf ausgelöst (Run #31) und die echten Ergebnisse von Hand gegen die tatsächlichen Conference-Tabellen nachgerechnet (NFC: Apukalypse Now, Buhaaner qualifizieren; AFC: TM06, Zurich City Ravens – Run CMC bleibt trotz mehr Punkten als Buhaaner draussen, weil es in der stärkeren AFC nur Rang 3 ist) – korrekt. Live-Seite per Playwright erneut geprüft, keine Fehler.

Commit `5a56985` (Code), Sync-Run #31 (erzeugt korrigierte `data/playoff-bracket.json`/`playoff-picture.json`), gepusht.

**Dritte Iteration nach Nutzer-Feedback (Kartendesign statt Einzeiler):** Nutzer schickte einen Screenshot von ESPNs eigener "Projected Playoff Matchups"-Ansicht als Vorbild ("das gefällt mir von der Anordnung besser") mit dem Wunsch, das Finale als "unser Fantasy Super Bowl" optisch hervorstechen zu lassen. Die dünnen `.bracket-row`-Einzeiler wurden durch ein Karten-Layout ersetzt: pro Match eine eigene Karte mit den zwei Team-Zeilen übereinander (Seed-Badge, Name, Score sobald entschieden), Runde 1 und Runde 2 als zwei Grid-Spalten nebeneinander (bricht auf schmalen Screens auf eine Spalte um) – dieselbe Anordnung wie im ESPN-Screenshot, aber in der eigenen dunklen Turf/Chalk/Amber-Optik statt ESPNs hellem Corporate-Look. Unentschiedene Runde-2-Gegner zeigen eine gedimmte kursive "TBD"-Zeile mit dem Platzhaltertext. Die Finale-Karte hat jetzt einen dicken Amber-Rahmen, Schlagschatten und ein "🏆 Fantasy Super Bowl"-Banner oben.

**Getestet:** Playwright gegen die echten Live-Daten (Sync-Run #31s `playoff-bracket.json`) – 10 Karten total, genau 1 als "is-final" markiert, korrekter Text im Finale-Banner. Screenshots bei 420px (mobil, einspaltig) und 1000px (Desktop, zwei Spalten nebeneinander) visuell geprüft – Layout entspricht der gewünschten Anordnung, Finale-Karte klar abgehoben, keine Konsolen-Fehler.

Commit `15dba6e`, gepusht.

**Vierte Iteration nach Nutzer-Feedback (Hinweistext entfernt):** "den hinweis text braucht es nicht" – der erklärende Absatz unter dem Bracket ("Seeds sind eine Projektion nach aktuellem Tabellenstand…") wurde komplett entfernt, inklusive `#bracketNote`-Element und der zugehörigen JS-Logik in `setStandingsView()`/`renderBracket()`. Ladefehler zeigen sich jetzt als kurze Status-Zeile direkt in der Playoffs-Spalte statt in einer separaten Notiz. Playwright bestätigt: Element weg, Projektionstext nicht mehr im DOM, alle 10 Karten weiterhin korrekt, keine Fehler.

Commit `52075bf`, gepusht.

**Fünfte Iteration nach Nutzer-Feedback (Spiel um Platz 3 verschoben):** "packe die Halbfinal-Verlierer zum Consolation Bracket, so dass der Super Bowl alleine steht - sieht schöner aus und wirkt wichtiger dann." Das "Spiel um Platz 3" wandert aus der Finale-Spalte in die Platzierungsspiele-Spalte des Consolation Brackets – die Finale-Karte steht dort jetzt allein mit entsprechend mehr Raum/Gewicht. Da diese Spalte dadurch zwei Pools mischt (Platz 3 aus dem Titel-Bracket, Platz 5-10 aus dem Consolation Bracket), haben alle vier Karten dort jetzt einen kleinen Label-Tag (`bracket-card-tag`, z.B. "Spiel um Platz 3", "Platz 5/6") für klare Zuordnung. Sektions-Überschrift zu "Consolation Bracket (Platz 3, 5–10)" präzisiert. Playwright bestätigt: Finale-Spalte hat genau 1 Karte, Consolation-Spalte hat 7 (3 Runde 1 + 4 mit Tag), Tags korrekt beschriftet, keine Fehler.

Commit `33d813c`, gepusht.

**Sechste Iteration nach Nutzer-Feedback (Spalten vertikal zentriert):** "lass es noch so anordnen dass der Final schön in der mitte ist und nicht oben bei halbfinale 1 klebt... und unten die hinteren 3 spiele mittig zu den rechten vier platzieren." Jede Bracket-Spalte ist jetzt intern ein Flex-Container: Die Runden-Beschriftung ("Runde 1 · Woche 16" etc.) bleibt oben fix auf gleicher Höhe wie die Nachbarspalte, darunter zentriert sich die Kartengruppe (`bracket-col-cards`, `justify-content:center`) vertikal im verbleibenden Platz. Da CSS-Grid-Zeilen standardmässig gleich hoch gestreckt werden, übernimmt die kürzere Spalte automatisch die Höhe der längeren – Finale steht jetzt mittig zwischen den beiden Halbfinal-Karten, die 3 Consolation-Runde-1-Spiele stehen mittig zu den 4 Platzierungsspielen. Playwright-Screenshot bestätigt das Ergebnis visuell, Textextraktion bestätigt alle Platzhalter-Texte weiterhin korrekt (kein Rendering-Fehler, nur eine Fehlinterpretation meinerseits beim ersten Blick auf den Screenshot).

Commit `27861a9`, gepusht.

## 7. Power Rankings: Verlauf-Texte entfernt, SOS-Text gekürzt, Draft Recap einklappbar

**Nutzer-Wunsch:** Auf `power-rankings.html` zwei Erklär-Absätze entfernen (Power-Ranking-Verlauf-Intro, SOS-Verlauf-Intro), den SOS-Erklärtext kürzen, und die "📋 Draft Recap"-Blöcke pro Team einklappbar machen (einzeln UND grundsätzlich alle eingeklappt beim Laden), damit man gezielt nur das gewünschte Team öffnet statt durch alle 10 Analysen zu scrollen.

- Die beiden Absätze über "Power-Ranking-Verlauf" und "Strength-of-Schedule-Verlauf" entfernt – die Verlaufstabellen darunter sind selbsterklärend.
- SOS-Erklärtext gekürzt von 3 Sätzen auf 1 prägnanten Satz, Kernaussagen bleiben erhalten (15 Gegner, Conference-Gegner zählt doppelt, Rang 1 = schwierigster Spielplan, aktualisiert sich live mit den Power Rankings).
- "📋 Draft Recap" pro Team-Karte ist jetzt ein `<details>`-Element (`.recap-details`, gleiches `+`/`−`-Marker-Muster wie das bereits bestehende "Komplettes Draft Board (20 Picks)" direkt darunter), statt statisch sichtbarem Text. Alle 10 starten eingeklappt und lassen sich unabhängig voneinander öffnen.

**Getestet:** Playwright – beide entfernten Texte nicht mehr im DOM, SOS-Absatz zeigt den gekürzten Text, 10 `.recap-details`-Elemente vorhanden, keines davon beim Laden `open`, Klick auf eines öffnet nur dieses eine und zeigt den korrekten Analyse-Text, keine Konsolen-Fehler. Screenshot einer Team-Karte visuell bestätigt: "Draft Recap" und "Komplettes Draft Board" erscheinen jetzt einheitlich als zwei eingeklappte Aufklapp-Zeilen am Kartenende.

Commit `0c74382`, gepusht.

**Zweite Iteration (ESPN-Satz verschoben, Transaktionen & Team-Karten einklappbar):** Drei weitere Anpassungen im direkten Anschluss: (a) "dieser Satz gehört auch zum Draft Recap und nicht nach oben" – der Satz "Den kompletten offiziellen Draft Recap gibt's dazu direkt bei ESPN..." stand im allgemeinen Seiten-Intro oben, gehört inhaltlich aber zum Draft-Recap-Bereich – jetzt direkt vor der Team-Karten-Liste platziert. (b) "transaktionen sollen auch standardmässig eingeklappt sein... soll es nach touch buttons und nicht nach link aussehen" – `.tx-week` startet jetzt immer eingeklappt (bisher war die neuste Woche automatisch offen) und die Summary sieht jetzt wie ein Pill-Button aus (Kartenhintergrund, Rahmen, abgerundet) statt wie ein Text-Link mit "+"-Präfix. (c) "und die teams sollen auch eingeklappt sein" – die kompletten Team-Karten (bisher statische, immer voll sichtbare `<section>`) sind jetzt selbst `<details>`-Elemente: Rang-Badge, Name und Rang-Bewegung bleiben als Summary sichtbar, der ganze Rest (Tagline, Stats, Positions-Tabelle, Saison-Ausblick, Draft Recap, Draft Board) ist eingeklappt und öffnet sich erst auf Klick, mit demselben rotierenden Pfeil-Muster wie die Wochen-Karten auf `schedule.html`.

**Getestet:** Playwright – Satz steht jetzt als direktes Geschwister-Element unmittelbar vor `#teamCards`; beide Transaktions-Wochen starten eingeklappt, Summary-Hintergrund/Radius bestätigen den Button-Look; alle 10 Team-Karten starten eingeklappt, Klick öffnet gezielt nur die eine Karte und zeigt danach Stats/Tabelle korrekt an; keine Konsolen-Fehler. Screenshots bestätigen das Ergebnis visuell.

Commit `75fecba`, gepusht.

## 8. Transaktionen: Woche 2 fehlte komplett – Umstieg auf ESPNs echtes Transaktions-Log

**Nutzer-Frage:** "weshalb fehlt bei den transaktionen eigentlich woche2? woche 3 waiver kommen ja erst morgen dazu"

**Root Cause gefunden:** Transaktionen wurden bisher durch Roster-Diffing rekonstruiert (aktueller Kader-Snapshot gegen den letzten Lauf verglichen), jede neu gefundene Differenz mit der AKTUELLEN ESPN-Matchup-Periode ZUM ZEITPUNKT DES SYNC-LAUFS gestempelt – nicht mit der Woche, in der sie tatsächlich passiert ist. Der automatische Sync läuft nur wöchentlich (Dienstags). Lauf-Historie geprüft: letzter Lauf während Woche 2 aktiv war am 16.9., danach kein Lauf bis 22.9. – zu dem Zeitpunkt zeigte ESPN schon Woche 3 an. Alle Änderungen vom 16.–21.9. (echte Woche 2) landeten dadurch fälschlich unter "Woche 3", "Woche 2" fehlte komplett. Nichts verloren, nur falsch beschriftet.

**Auf Nutzer-Wunsch (per Rückfrage: "ESPNs echtes Transaktions-Log nutzen") korrigiert statt nur häufiger zu syncen:**

- Per temporärem Debug-Workflow (`debug-transactions.yml`, nach Gebrauch wieder entfernt) das echte ESPN-API-Verhalten erkundet, statt blind zu raten: `view=mTransactions2` ohne `scoringPeriodId`-Parameter liefert nur die aktuelle Periode UND grösstenteils Lineup-Rauschen (type `ROSTER`). Mit explizitem `scoringPeriodId=N` bekommt man WAIVER/FREEAGENT/TRADE-Einträge – aber der Parameter filtert exakt auf GENAU DIESE eine Periode, keine kumulative Historie. Jede Woche muss also einzeln abgefragt werden.
- Neue Funktionen in `sync-espn.mjs`: `fetchAllTransactions(throughWeek)` fragt Wochen 1..throughWeek einzeln ab und fügt zusammen. `buildTransactionsFromLog()` übersetzt ESPNs Rohformat in die bestehende Anzeige-Struktur:
  - `FREEAGENT` (status EXECUTED): sofortige Adds/Drops, ADD+DROP im selben ESPN-Eintrag werden zu einer Zeile mit Zusatztext kombiniert (wie bisher).
  - `WAIVER` (executionType PROCESS): EXECUTED → erfolgreicher Waiver Claim, FAILED_* → WAIVER_FAILED. PENDING/CANCELED (vom Manager zurückgezogen) werden bewusst nicht angezeigt, da kein Endergebnis.
  - Trades laufen über mehrere verknüpfte ESPN-Einträge (TRADE_PROPOSAL trägt die Spieler-Items, TRADE_UPHOLD macht ihn nach der Review-Frist rechtskräftig – kommt 1x pro beteiligtem Team, über `relatedTransactionId` dedupliziert –, TRADE_DECLINE bei Ablehnung). Die Zuordnungstabelle wird aus ALLEN Wochen gebaut, da eine Trade-Zusage in einer späteren Woche liegen kann als das ursprüngliche Angebot.
  - `ROSTER` (Lineup-Änderungen) und `DRAFT` (Draft-Picks) werden ignoriert.
  - Behält die alte id-Präfix-Konvention (`add-`/`drop-` für FREEAGENT) bei, weil `findWaiverKarmaFact()`/`findWaiverInstantSuccessFact()` weiter oben im Skript genau danach filtern.
- `roster-snapshot.json` und das gesamte alte Diff-Apparat (gainedByTeam/lostByTeam/isFirstRun) komplett entfernt – `transactions.json` wird jetzt bei jedem Lauf deterministisch aus ESPNs Log neu gebaut statt inkrementell fortgeschrieben. Die verwaiste `data/roster-snapshot.json` ebenfalls aus dem Repo entfernt.
- **Zweiter Bugfix während der Verifikation:** `currentWeek` initial über `teamData.status.currentMatchupPeriod` bestimmt – zeigte sich als falsch (zeigt die zuletzt VOLLSTÄNDIG gewertete Woche, nicht die aktuell laufende Transaktions-Periode; Free Agency für die kommende Woche öffnet aber schon, sobald die letzte Woche fertig gewertet ist). Auf `lastCompletedWeek + 1` umgestellt – dieselbe "upcomingWeek"-Logik, die an anderer Stelle im Skript für die Wochen-Vorschau schon existiert.

**Getestet:**
- Offline mit Mock-Daten, die exakt den echten ESPN-Antworten aus dem Debug-Workflow nachgebildet sind: FREEAGENT solo/mit Drop-Partner, WAIVER erfolgreich/gescheitert/pending/zurückgezogen, Trade-Korrelation über 2 UPHOLD-Einträge auf 1 Anzeige-Eintrag dedupliziert, unrelated canceled Proposals erzeugen keine Geister-Einträge, ROSTER/DRAFT-Rauschen korrekt ignoriert.
- Danach zwei echte Sync-Läufe ausgelöst: erster zeigte nur Wochen 1–2 (der `currentWeek`-Bug), nach dessen Fix zweiter Lauf bestätigt korrekt "30 Transaktionen aus ESPNs Log gebaut (Wochen 1-3)" – Woche 3 bewusst leer, weil aktuell alle Woche-3-Aktivität noch als PENDING-Waiver-Claims vorliegt (Waiver-Tag ist laut Nutzer erst morgen).
- **Woche 2 zeigt jetzt 23 echte Transaktionen** (Waiver Claims, Free-Agent-Adds, ein abgelehntes Trade-Angebot, gescheiterte Waiver-Claims) mit korrekten Daten (17.–19.9.2026) statt komplett zu fehlen. Live-Seite per Playwright bestätigt: Button "Woche 2 (23)" öffnet alle 23 Einträge korrekt, keine Konsolen-Fehler.

Commits `b5a3a98` (Hauptfix), `45cf41c` (currentWeek-Korrektur), `7bf040d` (Aufräumen), plus zwei Sync-Läufe, gepusht.

**Dritte Iteration (fehlender Trade trotz neuem Log-Ansatz):** "gestern gab es einen trade... wann beginnt jeweils eine woche bzw. endet sie?" – ein echter, rechtskräftig gewordener Trade (Hopp Schwiiz ↔ Saints of Anarchy, 22.9.) erschien trotz des Umstiegs auf ESPNs Log nicht in Woche 3.

**Root Cause gefunden:** `buildTransactionsFromLog()` baut Trades aus `TRADE_UPHOLD` (macht den Trade nach Review-Frist rechtskräftig) + der zugehörigen `TRADE_PROPOSAL` (trägt die Spieler-Details) zusammen, verknüpft über `relatedTransactionId`. Für genau diesen Trade lieferte ESPN die ursprüngliche `TRADE_PROPOSAL` nirgends zurück – exhaustiv geprüft über alle `scoringPeriodId` 0–3 einzeln sowie über den "Recent Activity"-Feed (`kona_league_communication`, liefert für diese Liga generell 0 Einträge). Eine echte Datenlücke bei ESPN, kein Fehler in unserem Code. Ohne Behandlung wurde der Trade beim fehlenden Proposal-Match still verworfen – `if (!proposal) return;`.

**Fix:** Neuer Fallback-Pfad in der `TRADE_UPHOLD`-Verarbeitung: fehlt die Proposal, werden die beiden beteiligten Teams stattdessen aus dem zugehörigen `TRADE_ACCEPT`-Eintrag (dessen `teamId`) plus der eigenen `teamId` des `TRADE_UPHOLD`-Eintrags abgeleitet, und der Trade wird trotzdem angezeigt – mit einem ehrlichen Hinweis, dass die gehandelten Spieler bei ESPN für uns nicht abrufbar sind, statt komplett zu verschwinden. Dabei auch einen latenten Duplikat-Fall behoben: reale Daten zeigten 2 `TRADE_UPHOLD`-Einträge mit derselben `relatedTransactionId` (nicht zuverlässig 1x pro Team) – die Dedup-Markierung (`seenTradeGroup.add()`) wird jetzt sofort nach der ersten Prüfung gesetzt, bevor in den Detail- oder Fallback-Pfad verzweigt wird, damit kein zweiter Eintrag entsteht.

**Getestet:** Offline mit einem Mock, der exakt die reale ESPN-Datenform nachbildet (1 `TRADE_ACCEPT` mit `teamId: 6`, 2 `TRADE_UPHOLD` mit `teamId: 1`, keine passende Proposal) – Ergebnis: genau 1 Eintrag, keine Duplikate, korrekte Teamnamen. Danach live per Sync-Lauf verifiziert: Der Trade vom 22.9. (Woche 3) erscheint jetzt korrekt. Überraschender Nebenbefund: auch die beiden bereits bekannten Trades aus Woche 1 und Woche 2 hatten offenbar dieselbe Datenlücke – sie erscheinen jetzt ebenfalls (vorher vermutlich ebenso still verworfen, nur nicht aufgefallen), ebenfalls ohne Spieler-Details. Die Lücke scheint also systemisch bei ESPN zu liegen, nicht auf diesen einen Trade beschränkt. Playwright gegen die live regenerierten Daten bestätigt: alle 3 Trades erscheinen in den jeweils richtigen Wochen mit dem Hinweistext, keine Duplikate, keine Konsolen-Fehler.

**Antwort auf "wann beginnt/endet eine Woche?"** (aus den Rohdaten abgeleitet): Free Agency/Trades für die neue Periode öffnen, sobald die letzte Partie der Vorwoche (meist Montagabend) gewertet ist – sofortige Free-Agent-Adds sind ab dann jederzeit möglich (z.B. Woche 1: erste Aktivität bereits am 6.9.). Waiver-Claims dagegen werden nicht sofort verarbeitet, sondern laufen erst zu einem festen wöchentlichen Termin (beobachtete `waiverProcessStatus`-Zeitstempel: 9.9. und 17.9., jeweils 2–3 Tage nach Wochenbeginn) – deckt sich mit der Nutzer-Aussage, dass Woche-3-Waiver "erst morgen" (also mit demselben Rhythmus) durchlaufen.

Commit `43e4920` (Fallback-Fix), `b03c9f4` (Aufräumen Debug-Tooling), plus Sync-Lauf `e246691`, gepusht.

## Offene, noch nicht umgesetzte Punkte
- #12: Punkterechner – QB-Rushing-First-Down-Bonus nachrüsten.
- #13: Punkterechner – DST-Lücken (Forced Fumbles, Safeties, geblockte Kicks) prüfen.
- Bye-Week-Hinweis im Digest: weiterhin zurückgestellt (siehe früherer Session-Log).
- Hall of Fame: 4 weitere Saison-Highlight-Kategorien (siehe Punkt 1 oben) – warten auf Nutzer-Zustimmung.
- Hall of Fame: sobald die 2026er-Saison abgeschlossen ist, `data/league-history.json` von Hand ergänzen.
- Sauberer Umbau `start.html`↔`index.html` ohne Redirect-Workaround (siehe Punkt 5 oben) – wartet auf Nutzer-Zustimmung zu `data/team-content.json`-Link-Anpassung.

## Nächster Schritt
Nutzer könnte auf die vorgeschlagenen 4 Hall-of-Fame-Kategorien zurückkommen – bei Zustimmung direkt umsetzen (Muster wie die vorherigen 6 Kategorien: computeSeasonHighlights() in hall-of-fame.html erweitern). Ansonsten: weiter die Sync-Workflow-Zuverlässigkeit (Cron-Minute-Offset, Fast-Retry, Sanity-Check) über die nächsten Dienstage beobachten. Root-URL/PWA-Redirect-Fix ist live und getestet. Sauberer Umbau ohne Workaround (Punkt 5) bei Gelegenheit mit Nutzer besprechen – insbesondere die nötige Ausnahme für `data/team-content.json`. Playoff-/Consolation-Bracket ist live (Punkt 6) – sobald die Liga-Phase weiter fortschreitet, beobachten, ob die Projektion sich wie erwartet stabilisiert, und ab Woche 16 kontrollieren, dass echte Spiele korrekt statt der Platzhalter erscheinen. Transaktionen laufen jetzt über ESPNs echtes Log (Punkt 8) – bei den nächsten regulären Sync-Läufen beobachten, ob Wochen weiterhin lückenlos erscheinen (sollte durch den Wechsel weg vom Roster-Diffing strukturell nicht mehr passieren können, aber gut, es im Auge zu behalten).
