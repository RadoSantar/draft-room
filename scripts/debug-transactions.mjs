import { fetchLeague } from './espn-client.mjs';

console.log('========== scoringPeriodId=3: trade-related entries ==========');
const data3 = await fetchLeague(['mTransactions2'], 3);
const tx3 = data3.transactions || [];
const tradeStuff = tx3.filter((t) => (t.type || '').startsWith('TRADE'));
tradeStuff.forEach((t) => console.log(JSON.stringify(t, null, 2)));

console.log('\n========== week boundaries: min/max proposedDate per scoringPeriodId (weeks 1-3) ==========');
for (const wk of [1, 2, 3]) {
  const data = await fetchLeague(['mTransactions2'], wk);
  const tx = (data.transactions || []).filter((t) => t.type !== 'DRAFT' && t.type !== 'ROSTER');
  if (!tx.length) { console.log('week', wk, ': no non-noise transactions'); continue; }
  const dates = tx.map((t) => t.processDate || t.proposedDate).sort((a, b) => a - b);
  console.log('week', wk, 'earliest:', new Date(dates[0]).toISOString(), 'latest:', new Date(dates[dates.length - 1]).toISOString(), 'count:', tx.length);
}

console.log('\n========== scoreboard-ish: league status fields ==========');
const statusData = await fetchLeague(['mStatus', 'mSettings']);
console.log(JSON.stringify(statusData.status, null, 2));
