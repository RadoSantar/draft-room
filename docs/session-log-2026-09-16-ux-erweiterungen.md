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

## Offene, noch nicht umgesetzte Punkte
- #12: Punkterechner – QB-Rushing-First-Down-Bonus nachrüsten.
- #13: Punkterechner – DST-Lücken (Forced Fumbles, Safeties, geblockte Kicks) prüfen.
- Injury-Badges: echten Sync-Lauf abwarten und `data/roster.json` auf tatsächlich befüllte `injuryStatus`-Werte prüfen (siehe oben).

## Nächster Schritt (laufend)
Weiter mit den nächsten Punkten aus der "mach alles"-Liste: Skeleton-Ladezustände + Retry bei Fehlern, danach eigene Team-Statistik-Karte, "Diese Woche"-Digest, Trending Free Agents, Playoff-Szenario, Track-Record vergangener Tipps – jeweils einzeln committen und hier nachtragen.
