// Temporäres Debug-Skript: dumpt ESPNs rohes mTransactions2-Response-Shape in die Action-Logs, um
// die Umstellung von Roster-Diffing auf ESPNs echtes Transaktions-Log korrekt zu implementieren.
// Wird nach der Umstellung wieder entfernt (kein Teil der eigentlichen Sync-Pipeline).
import { fetchLeague } from './espn-client.mjs';

console.log('========== mTransactions2 with scoringPeriodId=3 (current week) ==========');
const data = await fetchLeague(['mTransactions2'], 3);
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

const weekCounts = {};
tx.forEach((t) => { weekCounts[t.scoringPeriodId] = (weekCounts[t.scoringPeriodId] || 0) + 1; });
console.log('by scoringPeriodId:', JSON.stringify(weekCounts));

console.log('\n--- sample WAIVER (up to 2) ---');
tx.filter((t) => t.type === 'WAIVER').slice(0, 2).forEach((t) => console.log(JSON.stringify(t, null, 2)));

console.log('\n--- sample FREEAGENT (up to 2) ---');
tx.filter((t) => t.type === 'FREEAGENT').slice(0, 2).forEach((t) => console.log(JSON.stringify(t, null, 2)));

console.log('\n--- sample WAIVER with non-EXECUTED status (failed claim?) ---');
const failedWaiver = tx.find((t) => t.type === 'WAIVER' && t.status !== 'EXECUTED');
console.log(JSON.stringify(failedWaiver, null, 2));

console.log('\n--- all distinct (type, status) pairs ---');
const pairs = new Set();
tx.forEach((t) => pairs.add(t.type + ' / ' + t.status));
console.log(JSON.stringify([...pairs], null, 2));

console.log('\n--- TRADE_UPHOLD sample (final executed trade?) ---');
console.log(JSON.stringify(tx.find((t) => t.type === 'TRADE_UPHOLD'), null, 2));

console.log('\n--- date field check: proposedDate vs any "processDate"/"executionDate" ---');
const withDates = tx.find((t) => t.type === 'FREEAGENT' || t.type === 'WAIVER');
console.log(JSON.stringify(withDates, null, 2));
