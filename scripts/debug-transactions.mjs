import { fetchLeague } from './espn-client.mjs';

for (const wk of [1, 2, 3]) {
  console.log('\n========== kona_league_communication, scoringPeriodId=' + wk + ' ==========');
  const data = await fetchLeague(['kona_league_communication'], wk);
  const topics = data.topics || [];
  console.log('topics:', topics.length);
  if (topics.length) console.log(JSON.stringify(topics, null, 2));
}

// Also try without any view restriction, and with a broader view combo that might include comm feed.
console.log('\n========== mTransactions2 + kona_league_communication combined, no scoringPeriodId ==========');
const combo = await fetchLeague(['mTransactions2', 'kona_league_communication']);
console.log('keys:', Object.keys(combo));
console.log('topics:', (combo.topics || []).length);

// Last resort: try scoringPeriodId=0 in case the proposal predates week 1.
console.log('\n========== mTransactions2, scoringPeriodId=0 ==========');
const wk0 = await fetchLeague(['mTransactions2'], 0);
const tx0 = (wk0.transactions || []);
console.log('total:', tx0.length);
const found0 = tx0.find((t) => t.id === 'ec134c0f-92ca-463e-9826-3c7b31fbb873');
console.log('target found in week 0:', found0 ? JSON.stringify(found0, null, 2) : 'not found');
