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

## 2026-09-15 – `e654899` Workflows: Push-Race gegen main abgesichert (live aufgetreten)

Der erste echte Dienstags-Sync ist gerade real mit "! [rejected] main ->
main (fetch first)" fehlgeschlagen: der Sync-Schritt lief durch, aber
der Push scheiterte, weil zwischen Checkout und Push ein anderer Commit
auf main gelandet war (Changelog-Bot + eigene Pushes in derselben
Zeitspanne). Alle drei automatisierten Workflows (espn-sync,
espn-live-snapshot, changelog) hatten dasselbe Muster: einfaches "git
push" ohne jede Absicherung.

Fix: fetch+reset+recommit-Retry (0/2/4/8/16s) statt Rebase – da alle
betroffenen Dateien (data/*.json, docs/CHANGELOG.md) bei jedem Lauf
ohnehin frisch neu geschrieben/angehängt werden, ist "auf dem neuesten
main neu committen" robuster als ein Rebase, der bei geänderter Basis
in Konflikte laufen könnte. Lokal mit einer simulierten Race (zwei
Klone, konkurrierender Push) verifiziert: saubere lineare Historie,
kein Datenverlust auf beiden Seiten.
