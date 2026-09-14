// Gemeinsame ESPN-Fetch- und Datei-I/O-Hilfsfunktionen für die Sync-Skripte (sync-espn.mjs und
// snapshot-live-scores.mjs). Zentral gehalten, damit Cookie-Aufbau/Env-Var-Prüfung nur an einer
// Stelle existieren – nie in mehreren Skripten separat nachbauen, das war schon mal die Ursache für
// auseinanderlaufende Logik in diesem Projekt.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.join(__dirname, '..', 'data');

export const LEAGUE_ID = process.env.ESPN_LEAGUE_ID || '686672943';
export const SEASON = process.env.ESPN_SEASON || '2026';
const ESPN_S2 = process.env.ESPN_S2;
const ESPN_SWID = process.env.ESPN_SWID;

if (!ESPN_S2 || !ESPN_SWID) {
  console.error('ESPN_S2 und/oder ESPN_SWID fehlen als Umgebungsvariable. Abbruch.');
  process.exit(1);
}

const COOKIE = `SWID=${ESPN_SWID}; espn_s2=${ESPN_S2}`;
const LEAGUE_BASE = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${SEASON}/segments/0/leagues/${LEAGUE_ID}`;

export async function fetchLeague(views, scoringPeriodId) {
  let url = LEAGUE_BASE + '?' + views.map((v) => 'view=' + v).join('&');
  if (scoringPeriodId) url += '&scoringPeriodId=' + scoringPeriodId;
  const res = await fetch(url, { headers: { Cookie: COOKIE } });
  if (!res.ok) throw new Error(`ESPN-Fetch fehlgeschlagen (${res.status}): ${url}`);
  return res.json();
}

export async function readJsonSafe(file, fallback) {
  try {
    const raw = await readFile(path.join(DATA_DIR, file), 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

export async function writeJson(file, value) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(path.join(DATA_DIR, file), JSON.stringify(value), 'utf8');
  console.log('geschrieben:', file);
}

export function nowIso() {
  return new Date().toISOString();
}
