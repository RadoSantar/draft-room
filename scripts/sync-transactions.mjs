// Leichter, täglicher Sync NUR für data/transactions.json (Waiver/Trades/Drops).
//
// Hintergrund: der volle Sync (siehe sync-espn.mjs/espn-sync.yml) läuft nur dienstags, weil er
// Standings/Scoreboard/Power-Rankings neu berechnet und Claude Recaps schreiben lässt (teuer, macht
// unter der Woche keinen Sinn - da ändert sich an Ergebnissen/Recaps nichts). Waiver-Claims und Trades
// passieren aber über die ganze Woche verteilt, nicht nur dienstags. Dieser Workflow hält
// transactions.json täglich aktuell, ohne den teuren vollen Sync mit auszulösen: kein Claude-Call,
// kein ANTHROPIC_API_KEY nötig, nur ESPN_S2/ESPN_SWID.
//
// Nutzt bewusst dieselben fetchProjections()/fetchAllTransactions()/buildTransactionsFromLog()/
// computeLastCompletedWeek()-Funktionen wie sync-espn.mjs (von dort exportiert), statt sie hier ein
// zweites Mal nachzubauen - siehe Kommentar in espn-client.mjs: auseinanderlaufende Logik zwischen
// Skripten war in diesem Projekt schon mal die Ursache für Bugs. sync-espn.mjs startet seinen eigenen
// main() beim direkten Aufruf (node scripts/sync-espn.mjs) automatisch, aber NICHT beim reinen Import
// wie hier (siehe Guard am Dateiende dort).
//
// Rührt NIE team-content.json an.
import { fetchLeague, writeJson, nowIso } from './espn-client.mjs';
import { fetchProjections, fetchAllTransactions, buildTransactionsFromLog, computeLastCompletedWeek } from './sync-espn.mjs';

async function main() {
  console.log('Lade Team-Namen und aktuelle Woche von ESPN…');
  const teamData = await fetchLeague(['mTeam']);
  const teamNames = {};
  teamData.teams.forEach((t) => { teamNames[t.id] = (t.name || '').trim(); });

  // Nur die für lastCompletedWeek nötigen Felder (week + winner je Matchup) - identisch zur Form, die
  // computeLastCompletedWeek() erwartet, aber ohne den vollen scoreboard.json-Aufbau (Namen/Scores),
  // der für einen reinen Transaktions-Sync nicht gebraucht wird.
  const scoreData = await fetchLeague(['mMatchupScore', 'mScoreboard']);
  const weeksMap = {};
  (scoreData.schedule || []).forEach((e) => {
    const wk = e.matchupPeriodId;
    if (wk > 25 || !e.home?.teamId || !e.away?.teamId) return;
    (weeksMap[wk] = weeksMap[wk] || []).push({ winner: e.winner });
  });
  const scoreboard = Object.keys(weeksMap).map(Number).sort((a, b) => a - b).map((wk) => ({ week: wk, games: weeksMap[wk] }));
  const lastCompletedWeek = computeLastCompletedWeek(scoreboard);
  const currentWeek = lastCompletedWeek + 1;

  console.log(`Hole Transaktionen für Wochen 1-${currentWeek}…`);
  const rawTx = await fetchAllTransactions(currentWeek);

  // Kein Roster-/Draft-Fetch in diesem leichten Sync (der wäre für Namen/Positionen nicht nötig) -
  // playerInfo() stützt sich ausschliesslich auf gezielt für die tatsächlich in den Transaktionen
  // referenzierten IDs nachgeholte Projektionen. Siehe Session-Log vom 25.9.2026 ("Unbekannter
  // Spieler"-Fix) - genau dieser Ansatz löst dort bereits kurzlebige Adds/Drops auf.
  const txPlayerIds = new Set();
  rawTx.forEach((t) => { (t.items || []).forEach((i) => { if (i.playerId != null) txPlayerIds.add(i.playerId); }); });
  const projections = await fetchProjections([...txPlayerIds]);

  function playerInfo(id) {
    const proj = projections[id];
    if (proj) return proj;
    return { name: 'Unbekannter Spieler #' + id, pos: '?', proTeam: '', adp: 999, proj: null, injuryStatus: null };
  }

  const txData = buildTransactionsFromLog(rawTx, teamNames, playerInfo);
  console.log(`${txData.length} Transaktionen aus ESPNs Log gebaut (Wochen 1-${currentWeek}).`);
  await writeJson('transactions.json', { lastUpdated: nowIso(), data: txData });
  console.log('Transaktions-Sync abgeschlossen.');
}

main().catch((err) => {
  console.error('Transaktions-Sync fehlgeschlagen:', err);
  process.exit(1);
});
