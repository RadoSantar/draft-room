import { fetchLeague } from './espn-client.mjs';

const targetRelated = [
  '1bab103b-9025-438e-b857-b2bf8955b31a', // Woche 2 Trade
  'ec134c0f-92ca-463e-9826-3c7b31fbb873'  // Woche 3 Trade
];

// Team-Namen zur Zuordnung dumpen (um "TM06" zu identifizieren).
const teamData = await fetchLeague(['mTeam']);
const teams = (teamData.teams || []).map((t) => ({
  id: t.id,
  name: (t.location ? t.location + ' ' : '') + (t.nickname || '') || t.name || t.abbrev
}));
console.log('\n========== Teams ==========');
console.log(JSON.stringify(teams, null, 2));

for (const wk of [1, 2, 3, 4]) {
  console.log('\n========== mTransactions2, scoringPeriodId=' + wk + ' ==========');
  const data = await fetchLeague(['mTransactions2'], wk);
  const tx = data.transactions || [];
  const relevant = tx.filter((t) =>
    targetRelated.includes(t.relatedTransactionId) ||
    targetRelated.includes(t.id) ||
    (t.type && t.type.startsWith('TRADE'))
  );
  console.log('total tx:', tx.length, '| relevant TRADE* entries:', relevant.length);
  relevant.forEach((t) => {
    console.log(JSON.stringify({
      id: t.id,
      type: t.type,
      status: t.status,
      executionType: t.executionType,
      scoringPeriodId: t.scoringPeriodId,
      teamId: t.teamId,
      relatedTransactionId: t.relatedTransactionId,
      memberId: t.memberId,
      items: t.items
    }, null, 2));
  });
}
