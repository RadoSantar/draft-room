// Holt mehrmals pro Spieltag (siehe .github/workflows/espn-live-snapshot.yml) den aktuellen
// Zwischenstand der laufenden Woche und hängt ihn an data/live-snapshots.json an. Dient
// ausschliesslich dazu, sync-espn.mjs am Ende der Woche echte Verlaufs-Storylines liefern zu können
// (Kollaps/Comeback, Führungswechsel – siehe findComebackFact()/findLeadChangesFact() dort), die aus
// einem einzigen Fetch NACH Wochenende unmöglich wären, weil da nur noch der Endstand sichtbar ist.
//
// Bewusst sehr schlank gehalten (nur IDs + Scores, keine Spieler-/Roster-Daten) – Namen werden erst
// später beim eigentlichen Sync aufgelöst, der die Team-Namen ohnehin schon kennt.
import { fetchLeague, readJsonSafe, writeJson, nowIso } from './espn-client.mjs';

// ESPN-Lineup-Slot-IDs: 20 = Bench, 21 = IR – identisch zu BENCH_SLOT_ID/IR_SLOT_ID in sync-espn.mjs.
const BENCH_SLOT_ID = 20;
const IR_SLOT_ID = 21;

function sumStarterPoints(side) {
  let total = 0;
  (side.rosterForCurrentScoringPeriod?.entries || []).forEach((e) => {
    if (e.lineupSlotId === BENCH_SLOT_ID || e.lineupSlotId === IR_SLOT_ID) return;
    total += e.playerPoolEntry?.appliedStatTotal || 0;
  });
  return Math.round(total * 10) / 10;
}

async function main() {
  // Erster Fetch ohne scoringPeriodId: liefert zuverlässig den winner-Status (UNDECIDED/HOME/AWAY)
  // jeder Woche, um die laufende Woche (targetWeek) zu bestimmen - dafür reicht dieser View.
  const scoreData = await fetchLeague(['mMatchupScore', 'mScoreboard']);

  const weeksMap = {};
  (scoreData.schedule || []).forEach((e) => {
    const wk = e.matchupPeriodId;
    if (wk > 25) return;
    if (!e.home?.teamId || !e.away?.teamId) return;
    (weeksMap[wk] = weeksMap[wk] || []).push({ homeId: e.home.teamId, awayId: e.away.teamId, winner: e.winner });
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

  // Echte Live-Punktestände kommen NICHT aus obigem mScoreboard-totalPoints: dieses Feld bleibt
  // während einer noch laufenden Woche durchgängig 0, bestätigt für Woche 4/2026 (alle 11
  // Zwischenstände dieser Woche zeigten 0:0 in jedem Spiel, auch für längst abgepfiffene Partien).
  // Stattdessen wie fetchWeeklyKeyMomentsByTeam() in sync-espn.mjs: expliziten scoringPeriodId
  // mitgeben und die tatsächlichen Punkte aus den einzelnen Rosterplätzen aufsummieren (appliedStatTotal
  // der Starter, ohne Bank/IR) - das liefert echte, auch während des Spiels aktuelle Werte.
  const boxData = await fetchLeague(['mBoxscore', 'mMatchupScore'], targetWeek);
  const liveByMatchup = {};
  (boxData.schedule || []).forEach((matchup) => {
    if (matchup.matchupPeriodId !== targetWeek) return;
    if (!matchup.home?.teamId || !matchup.away?.teamId) return;
    liveByMatchup[`${matchup.home.teamId}-${matchup.away.teamId}`] = {
      homeScore: sumStarterPoints(matchup.home),
      awayScore: sumStarterPoints(matchup.away)
    };
  });

  const games = weeksMap[targetWeek].map((g) => {
    const live = liveByMatchup[`${g.homeId}-${g.awayId}`];
    return {
      homeId: g.homeId, homeScore: live ? live.homeScore : 0,
      awayId: g.awayId, awayScore: live ? live.awayScore : 0
    };
  });

  const existing = await readJsonSafe('live-snapshots.json', { week: null, snapshots: [] });
  const snapshots = existing.week === targetWeek ? existing.snapshots : [];
  snapshots.push({ at: nowIso(), games });

  await writeJson('live-snapshots.json', { lastUpdated: nowIso(), week: targetWeek, snapshots });
  console.log(`Snapshot für Woche ${targetWeek} gespeichert (${snapshots.length}. Zwischenstand dieser Woche).`);
}

main().catch((err) => {
  console.error('Live-Snapshot fehlgeschlagen:', err);
  process.exit(1);
});
