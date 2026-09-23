import { fetchLeague } from './espn-client.mjs';

for (const wk of [1, 2, 3]) {
  console.log('\n========== scoringPeriodId=' + wk + ': all TRADE_* entries ==========');
  const data = await fetchLeague(['mTransactions2'], wk);
  const tx = (data.transactions || []).filter((t) => (t.type || '').startsWith('TRADE'));
  tx.forEach((t) => console.log(t.type, '| id=' + t.id, '| related=' + t.relatedTransactionId, '| status=' + t.status, '| teamId=' + t.teamId, '| items=' + (t.items ? t.items.length : 0)));
}

console.log('\n========== searching all 3 weeks for id === ec134c0f-92ca-463e-9826-3c7b31fbb873 ==========');
for (const wk of [1, 2, 3]) {
  const data = await fetchLeague(['mTransactions2'], wk);
  const found = (data.transactions || []).find((t) => t.id === 'ec134c0f-92ca-463e-9826-3c7b31fbb873');
  console.log('week', wk, ':', found ? JSON.stringify(found, null, 2) : 'not found');
}
