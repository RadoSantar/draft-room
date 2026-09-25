import { fetchLeague } from './espn-client.mjs';

const teamData = await fetchLeague(['mTeam']);
console.log('\n========== Volle Team-Rohdaten ==========');
teamData.teams.forEach((t) => {
  console.log(JSON.stringify({
    id: t.id,
    name: t.name,
    location: t.location,
    nickname: t.nickname,
    abbrev: t.abbrev
  }, null, 2));
});
