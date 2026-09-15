# Session-Log: Automatische Spiel-Recaps & Storyline-System

**Datum:** 2026-09-14 / 2026-09-15
**Zweck dieser Datei:** Backup/Gedächtnisstütze für den Fall, dass der Chat-Kontext verloren geht. Beschreibt, was in dieser Session gebaut wurde, warum, und wo im Code was liegt – damit eine neue Claude-Session (oder du selbst) den Stand ohne die ursprüngliche Konversation nachvollziehen kann.

## Ausgangslage

Vorherige Sessions hatten bereits gebaut: die ganze Seite (index.html, draft-board.html, schedule.html, power-rankings.html, my-team.html), den ESPN-Sync (`scripts/sync-espn.mjs`) für Standings/Scoreboard/Power-Rankings/Transaktionen, PWA-Support, Trade-Kalkulator, Conference-Splits, Playoff-Wochen-Unterstützung im Scoreboard, und einen ersten einfachen Claude-geschriebenen Recap pro Spiel (`scripts/generate-recaps.mjs`, nur Basis-Fakten: Endstand, wer favorisiert war).

Diese Session hat das Recap-System stark ausgebaut: von "ein einfacher Text pro Spiel" zu einem grossen Pool rotierender Storyline-Fakten plus einem eigenen Live-Snapshot-System.

## Was in dieser Session dazugekommen ist

### 1. Recap-Grundausbau (generate-recaps.mjs)
- Frecherer, "bissiger" Ton im System-Prompt statt neutral-reisserisch.
- Rotationspool: pro Spiel werden nur 2-3 zufällig ausgewählte Fakten (deterministisch per Seed aus Woche+Team-IDs) tatsächlich in den Prompt aufgenommen – sonst würden sich alle Recaps gleich lesen.
- Kuratierte "Spitznamen" pro Spiel-Situation (`BADGE_POOL`, mittlerweile ~20 Kategorien, ~90+ Phrasen) – z.B. "Die Klatsche der Woche" (Blowout ab 50 Punkten), "David gegen Goliath" (Aussenseiter-Sieg), "Das Imperium ist zementiert" (dominantes Team).
- **Wichtige spätere Korrektur:** Der System-Prompt war zu einer langen Checkliste ("Wenn X gegeben ist, tu Y") angewachsen, was zu fragmentierten, listig wirkenden Texten führte. Wurde zu 5 thematischen Gruppen verdichtet plus einer expliziten Form-Regel ("muss sich wie EIN zusammenhängender Gedanke lesen, nicht wie eine Fakten-Liste"). Fakten-Auswahl von 4 zurück auf 3 reduziert.

### 2. Storyline-Fakten aus den ESPN-Wochendaten (sync-espn.mjs)
Alle diese Fakten werden in `findKeyMoments()` berechnet und als optionaler Kontext an Claude übergeben (nie erfunden, nur echte Daten):
- **Standout-Leistung**, **Bank-Reue** (Sieger & Verlierer) – bester Starter, Bankspieler die einen Starter derselben Position blamiert hätten (via ESPNs `mBoxscore`-View, `scoringPeriodId`).
- **Positionale Dominanz** (eine Positionsgruppe outscort allein das ganze Gegner-Team).
- **Serien** (ESPNs eigene Streak-Zählung).
- **Aufstellungs-Patzer** (`buildOptimalLineup()` aus scoring.mjs, diesmal mit echten Wochenpunkten statt Saison-Projektion).
- **Conference-Standing** inkl. Rang-Bewegung ggü. Vorwoche (`data/conference-standings-history.json`, eigene Snapshot-Historie analog zum bestehenden Power-Ranking-Verlauf).
- **Saison-Bestwert/Negativrekord**.
- **Playoff-Rennen** ab Woche 8 (bildet ESPNs echtes 4-Team-Format nach: 2 Conference-Sieger + 2 Wildcards nach Gesamt-Bilanz, Re-Seed 1-4/2-3 – recherchiert über ESPNs Fan-Support-Doku, nicht selbst erfunden).
- **Playoff-Bracket-Kontext** (`playoffTierType` direkt von ESPN übernommen: Gewinner-Bracket = Championship-Jagd, Verlierer-Bracket = Toilet Bowl).
- **Pechvogel der Woche / Hässlicher Sieg** (Score-Vergleich innerhalb der Woche).
- **Revanche/Wiederholung** (Conference-Gegner treffen sich 2x pro Saison; markiert auch ob's das letzte Duell der Saison war).
- **Kicker/Defense hat's entschieden**.
- **Waiver-Wire-Karma** (Team A dropt Spieler X, X spielt später gegen A und liefert – Drop-Transaktionen haben dafür jetzt `playerId`/`teamId`-Felder statt nur Freitext).
- **Erwartungswert-Bilanz** (vereinfachte Pythagorean-Expectation aus pointsFor/pointsAgainst).
- **Schnäppchen der Woche / Draft-Reue** (Standout aus spätem Draft-Pick vs. früher Pick der von der Bank blamiert wurde).
- **"Imperium"-Storylines** (Team-Meilensteine, bewusst gross erzählt): erster Sieg nach Pleitenserie, weiterhin sieglos, makellose Bilanz, dominantes Team baut aus/stolpert, Team mit Losing-Bilanz auf Siegesserie.
- **Wochen-Ausblick**: jeder Recap endet mit je einem Teaser-Satz pro Team zur nächsten Partie (inkl. Bilanz/Conference-Rang des kommenden Gegners).

### 3. Live-Score-Snapshots (neues System)
Da ein einziger Sync-Lauf NACH Wochenende nur den Endstand sieht, aber keine Geschichte wie "Team X lag früh mit 40 Punkten vorne, verlor am Ende trotzdem" erzählen kann, gibt es jetzt:

- **`scripts/espn-client.mjs`** (neu): gemeinsame ESPN-Fetch-/Datei-I/O-Hilfsfunktionen, aus sync-espn.mjs extrahiert, damit das neue Snapshot-Skript sie nicht duplizieren musste.
- **`scripts/snapshot-live-scores.mjs`** (neu): schlankes Skript, holt nur Team-IDs+Scores der aktuell laufenden Woche, hängt sie an `data/live-snapshots.json` an. Rollt automatisch auf die neue Woche, sobald sich die "aktuell laufende Woche" ändert.
- **`.github/workflows/espn-live-snapshot.yml`** (neu): läuft 8x pro Spieltag (Do/So/Mo, grosszügige Zeitfenster rund um TNF/frühe+späte Sonntagsspiele/SNF/MNF, siehe Kommentare in der Datei für die genauen UTC-Zeiten).

Daraus abgeleitete Fakten (alle mit "laut unseren Zwischenständen"-Vorsicht formuliert, da nur Stichproben, kein lückenloser Verlauf):
- **Kollaps/Comeback** (Team lag ≥15 Punkte vorne, verlor trotzdem).
- **Nervenkrieg** (Führungswechsel-Anzahl).
- **Frühstarter/Spätzünder** (Anteil des Endstands beim ersten Wochen-Snapshot).
- **Zittersieg** (Sieger lag ≥20 vorne, Vorsprung schmolz um ≥15, reichte aber noch).
- **Monday-Night-Rettung** (lag vor Montagabend zurück, gewann trotzdem).
- **Dauerhafter Nervenkrieg** (≥3 Snapshots in Folge unter 5 Punkten Differenz).

### 4. Saison-Persönlichkeiten
**`data/season-personality.json`** (neu, via `archiveLiveSnapshotWeek()` in sync-espn.mjs): archiviert pro abgeschlossener Woche (idempotent, einmal pro Woche dank `weeksArchived`-Guard) pro Team, wie oft es comebackt/kollabiert/im Nervenkrieg steckt/von Anfang bis Ende führt. Ab 3 Spielen mit Live-Daten und ≥40%-Quote bekommt ein Team einen wiederkehrenden Beinamen im Recap ("notorischer Last-Minute-Held" & Co.) – wird aussagekräftiger, je mehr Wochen mit Live-Daten vorliegen.

## Bekannte Näherungen/Grenzen (bewusst so designt, kein Bug)
- Live-Snapshots sind Stichproben (8x/Woche), kein lückenloser Verlauf – "Höchststand" heisst "höchster beobachteter Stand", nicht literal der Allzeit-Peak.
- Playoff-Rennen-Elimination ist eine einfache Maximal-Siege-Schranke, keine echte Restspielplan-Simulation.
- Erwartungswert-Bilanz nutzt Exponent 2 (vereinfachte Pythagorean-Expectation), nicht den "echten" Football-Exponenten ~2,37.
- Woche 1 (2026-09-14/15) hatte nur 1 Live-Snapshot, weil der Workflow erst mitten in der Woche hinzugefügt wurde – die Live-Fakten greifen normal erst ab Woche 2 mit voller Snapshot-Abdeckung. Alle Fakten-Funktionen degradieren graceful (geben `null` zurück statt zu crashen), wenn zu wenig Snapshot-Daten vorhanden sind.
- GitHub Actions Cron kann verzögert feuern (beobachtet: ~2h17min Verspätung beim allerersten Live-Snapshot-Lauf) – bekannte GH-Actions-Eigenheit, keine Fehlkonfiguration.

## Wo die Recaps angezeigt werden
`schedule.html` – als aufklappbares "📰 Recap"-Feld direkt unter jedem abgeschlossenen Spiel (sowohl in der Gesamtansicht als auch in der nach Team gefilterten Ansicht).

## Sync-Zeitplan
- **Haupt-Sync** (`espn-sync.yml`): Dienstags 05:00, 07:00, 09:00, 11:00, 13:00 UTC (= 07:00-15:00 Schweizer Sommerzeit), plus manuell auslösbar. Generiert Recaps nur für die Woche, die gerade komplett abgeschlossen wurde (Wiederholungsläufe sind idempotent).
- **Live-Snapshot** (`espn-live-snapshot.yml`): 8x pro Spieltag, siehe oben.

## Offene, noch nicht umgesetzte Punkte (aus der Aufgabenliste, unabhängig von den Recaps)
- #12: Punkterechner – QB-Rushing-First-Down-Bonus nachrüsten.
- #13: Punkterechner – DST-Lücken (Forced Fumbles, Safeties, geblockte Kicks) prüfen.

## Nächster Schritt (Stand Ende dieser Session)
Warten auf den ersten echten Sync-Lauf mit tatsächlich generierten Recaps (Woche 1 muss zuerst komplett abgeschlossen sein), dann prüfen, wie sich die Recaps in der Praxis lesen – ggf. Ton/Fakten-Auswahl nachschärfen.
