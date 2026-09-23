// Temporäres Debug-Skript: dumpt ESPNs rohes mTransactions2-Response-Shape in die Action-Logs, um
// die Umstellung von Roster-Diffing auf ESPNs echtes Transaktions-Log korrekt zu implementieren.
// Wird nach der Umstellung wieder entfernt (kein Teil der eigentlichen Sync-Pipeline).
import { fetchLeague } from './espn-client.mjs';

const data = await fetchLeague(['mTransactions2']);
const tx = data.transactions || [];
console.log('total transactions:', tx.length);

const types = {};
const statuses = {};
tx.forEach((t) => {
  types[t.type] = (types[t.type] || 0) + 1;
  statuses[t.status] = (statuses[t.status] || 0) + 1;
});
console.log('types:', JSON.stringify(types));
console.log('statuses:', JSON.stringify(statuses));

console.log('\n--- oldest 3 ---');
const sorted = tx.slice().sort((a, b) => (a.processDate || a.proposedDate || 0) - (b.processDate || b.proposedDate || 0));
console.log(JSON.stringify(sorted.slice(0, 3), null, 2));

console.log('\n--- newest 3 ---');
console.log(JSON.stringify(sorted.slice(-3), null, 2));

console.log('\n--- sample TRADE ---');
console.log(JSON.stringify(tx.find((t) => t.type === 'TRADE'), null, 2));

console.log('\n--- sample WAIVER ---');
console.log(JSON.stringify(tx.find((t) => t.type === 'WAIVER'), null, 2));

console.log('\n--- sample FREEAGENT ---');
console.log(JSON.stringify(tx.find((t) => t.type === 'FREEAGENT'), null, 2));

console.log('\n--- any non-EXECUTED status samples (one each) ---');
const seenStatus = new Set();
tx.forEach((t) => {
  if (t.status !== 'EXECUTED' && !seenStatus.has(t.status)) {
    seenStatus.add(t.status);
    console.log(JSON.stringify(t, null, 2));
  }
});

console.log('\n\n========== ATTEMPT 2: kona_league_communication (Recent Activity feed) ==========');
const commData = await fetchLeague(['kona_league_communication']);
const topics = commData.topics || [];
console.log('total topics:', topics.length);
if (topics.length) {
  console.log(JSON.stringify(topics.slice(0, 5), null, 2));
}

console.log('\n\n========== ATTEMPT 3: mTransactions2 with explicit scoringPeriodId=1 ==========');
const week1Data = await fetchLeague(['mTransactions2'], 1);
console.log('total transactions (week1 param):', (week1Data.transactions || []).length);
const w1Types = {};
(week1Data.transactions || []).forEach((t) => { w1Types[t.type] = (w1Types[t.type] || 0) + 1; });
console.log('week1 types:', JSON.stringify(w1Types));
