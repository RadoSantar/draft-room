import { fetchLeague } from './espn-client.mjs';

const DEFAULTS_URL = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/2026/segments/0/leaguedefaults/3?view=kona_player_info';

const targetIds = [-16030, -16029, 4429835, 4596334];

console.log('\n========== Direkte Abfrage über leaguedefaults (filterIds) ==========');
const filter = JSON.stringify({ players: { filterIds: { value: targetIds } } });
const res = await fetch(DEFAULTS_URL, { headers: { 'x-fantasy-filter': filter } });
console.log('status:', res.status);
const data = await res.json();
console.log('players returned:', (data.players || []).length);
(data.players || []).forEach((pe) => {
  console.log(JSON.stringify(pe.player, null, 2).slice(0, 500));
});

console.log('\n========== Rohe Transaktions-Items mit playerId -16030/-16029 ==========');
for (const wk of [1, 2, 3]) {
  const txData = await fetchLeague(['mTransactions2'], wk);
  (txData.transactions || []).forEach((t) => {
    (t.items || []).forEach((item) => {
      if (item.playerId === -16030 || item.playerId === -16029) {
        console.log('week', wk, 'txType', t.type, 'status', t.status, JSON.stringify(item));
      }
    });
  });
}

