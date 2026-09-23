import { fetchLeague } from './espn-client.mjs';

for (const wk of [1, 2, 3]) {
  console.log('\n========== scoringPeriodId=' + wk + ' ==========');
  const data = await fetchLeague(['mTransactions2'], wk);
  const tx = data.transactions || [];
  console.log('total:', tx.length);
  const types = {};
  tx.forEach((t) => { types[t.type] = (types[t.type] || 0) + 1; });
  console.log('types:', JSON.stringify(types));
  const spCounts = {};
  tx.forEach((t) => { spCounts[t.scoringPeriodId] = (spCounts[t.scoringPeriodId] || 0) + 1; });
  console.log('by scoringPeriodId:', JSON.stringify(spCounts));
}

console.log('\n\n========== FULL detail for scoringPeriodId=2, WAIVER/FREEAGENT only ==========');
const data2 = await fetchLeague(['mTransactions2'], 2);
const tx2 = (data2.transactions || []).filter((t) => t.type === 'WAIVER' || t.type === 'FREEAGENT');
tx2.forEach((t) => console.log(JSON.stringify(t, null, 2)));
