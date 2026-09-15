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
