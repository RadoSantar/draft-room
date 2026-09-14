// Holt mehrmals pro Spieltag (siehe .github/workflows/espn-live-snapshot.yml) den aktuellen
// Zwischenstand der laufenden Woche und hängt ihn an data/live-snapshots.json an. Dient
// ausschliesslich dazu, sync-espn.mjs am Ende der Woche echte Verlaufs-Storylines liefern zu können
// (Kollaps/Comeback, Führungswechsel – siehe findComebackFact()/findLeadChangesFact() dort), die aus
// einem einzigen Fetch NACH Wochenende unmöglich wären, weil da nur noch der Endstand sichtbar ist.
//
// Bewusst sehr schlank gehalten (nur IDs + Scores, keine Spieler-/Roster-Daten) – Namen werden erst
// später beim eigentlichen Sync aufgelöst, der die Team-Namen ohnehin schon kennt.
import { fetchLeague, readJsonSafe, writeJson, nowIso } from './espn-client.mjs';

async function main() {
  const scoreData = await fetchLeague(['mMatchupScore', 'mScoreboard']);

  const weeksMap = {};
  (scoreData.schedule || []).forEach((e) => {
    const wk = e.matchupPeriodId;
    if (wk > 25) return;
    if (!e.home?.teamId || !e.away?.teamId) return;
    (weeksMap[wk] = weeksMap[wk] || []).push({
      homeId: e.home.teamId, homeScore: Math.round(e.home.totalPoints * 10) / 10,
      awayId: e.away.teamId, awayScore: Math.round(e.away.totalPoints * 10) / 10,
      winner: e.winner
    });
  });
  const weeks = Object.keys(weeksMap).map(Number).sort((a, b) => a - b);

  let lastCompletedWeek = 0;
  for (const wk of weeks) {
    if (weeksMap[wk].length && weeksMap[wk].every((g) => g.winner !== 'UNDECIDED')) lastCompletedWeek = wk;
    else break;
  }
  const targetWeek = lastCompletedWeek + 1;

  if (!weeksMap[targetWeek]) {
    console.log(`Keine Spiele für Woche ${targetWeek} gefunden (Saison evtl. noch nicht gestartet oder schon vorbei) – kein Snapshot.`);
    return;
  }

  const existing = await readJsonSafe('live-snapshots.json', { week: null, snapshots: [] });
  const snapshots = existing.week === targetWeek ? existing.snapshots : [];
  snapshots.push({
    at: nowIso(),
    games: weeksMap[targetWeek].map((g) => ({ homeId: g.homeId, homeScore: g.homeScore, awayId: g.awayId, awayScore: g.awayScore }))
  });

  await writeJson('live-snapshots.json', { lastUpdated: nowIso(), week: targetWeek, snapshots });
  console.log(`Snapshot für Woche ${targetWeek} gespeichert (${snapshots.length}. Zwischenstand dieser Woche).`);
}

main().catch((err) => {
  console.error('Live-Snapshot fehlgeschlagen:', err);
  process.exit(1);
});
