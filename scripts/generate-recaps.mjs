// Lässt Claude für jedes abgeschlossene Spiel einen kurzen, reisserischen Recap
// im Stil des Saison-Ausblicks schreiben. Läuft nur, wenn ANTHROPIC_API_KEY gesetzt
// ist – ohne Key wird dieser Schritt übersprungen, der restliche Sync läuft normal weiter.
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-sonnet-5';

const SYSTEM_PROMPT = `Du schreibst kurze, extrem reisserische und dramatische Spiel-Recaps (3-5 Sätze, auf Deutsch) für "Fantasy Playbook", eine private Fantasy-Football-Liga. Stil: wie ein Sport-Kommentator, der jedes Spiel als DAS Ereignis der Woche inszeniert – Superlative, Spannungsbogen, ruhig übertreiben. Sei dabei frech und pointiert: scheu dich nicht vor Spott, Sarkasmus und einer scharfen Zunge, gerne mit einem Lacher oder einer bissigen Pointe zum Schluss. Der Spott zielt IMMER auf Fantasy-Entscheidungen und -Leistungen (z.B. eine schlechte Bank-Aufstellung, ein enttäuschender Star-Spieler, ein sich selbst besiegendes Team) – niemals auf die realen Personen dahinter persönlich.

Wenn im Kontext eine "Standout-Leistung" gegeben ist, baue sie als eigene Pointe ein (z.B. wie dieser eine Spieler das gegnerische Team alt aussehen liess). Wenn eine "Bank-Reue" gegeben ist, mach daraus genüsslich eine Schlüsselszene – vor allem wenn der Tausch laut Kontext sogar zum Sieg gereicht hätte, darf das richtig auf die Spitze getrieben werden. Wenn im Kontext ein "Spitzname für dieses Spiel" gegeben ist, flechte ihn wie einen eingängigen Rubrik-Titel natürlich in den Text ein (z.B. als zugespitzte Formulierung mittendrin, nicht zwingend als separate Überschrift) – er soll sich anfühlen wie ein wiederkehrendes Liga-Ritual ("Klatsche der Woche" & Co.), nicht wie eine angeklebte Floskel. Nutze nur die im Kontext gegebenen Fakten, erfinde keine Spieler-Stats oder Ereignisse, die nicht gegeben sind. Schreib NUR den Fliesstext des Recaps selbst, keine Einleitung wie "Hier ist der Recap", keine Anführungszeichen drumherum, keine Überschrift.`;

async function callClaude(userPrompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }]
    })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Claude-API-Fehler (${res.status}): ${text}`);
  }
  const data = await res.json();
  return (data.content?.[0]?.text || '').trim();
}

// Deterministischer Pseudo-Zufall aus einem String-Seed (kein echter Zufall nötig – soll bei
// wiederholten Läufen mit denselben Daten dieselbe Auswahl treffen). Liefert eine gemischte Kopie
// von items, aus der der Aufrufer die ersten `count` nimmt.
function seededShuffle(items, seedStr) {
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) seed = (seed * 31 + seedStr.charCodeAt(i)) >>> 0;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Sammelt alle verfügbaren Storyline-Fakten für ein Spiel als fertige Kontext-Sätze. Nicht jedes
// Spiel hat jeden Fakt (z.B. positionale Dominanz oder eine Serie gibt es nicht immer) – das allein
// sorgt schon für Abwechslung, zusätzlich wird unten nur eine Zufallsauswahl davon in den Prompt
// aufgenommen, damit sich nicht jede Woche nach demselben Schema liest.
function collectFacts(game) {
  const facts = [];

  if (game.standout) {
    const s = game.standout;
    const standoutTeam = s.side === 'home' ? game.homeName : game.awayName;
    facts.push(`Standout-Leistung des Spiels: ${s.name} (${s.pos}) mit ${s.points.toFixed(1)} Punkten für ${standoutTeam}.`);
  }

  if (game.loserBenchRegret) {
    const r = game.loserBenchRegret;
    let t = `Bank-Reue: ${r.team} liess ${r.benchPlayer.name} (${r.benchPlayer.pos}, ${r.benchPlayer.points.toFixed(1)} Punkte) auf der Bank sitzen, während Starter ${r.starter.name} (${r.starter.points.toFixed(1)} Punkte) spielte.`;
    t += r.wouldHaveWon ? ' Mit dem Tausch hätte es sogar zum Sieg gereicht!' : ' Auch mit dem Tausch hätte es nicht ganz zum Sieg gereicht, aber es wäre knapper geworden.';
    facts.push(t);
  }

  if (game.winnerBenchRegret) {
    const r = game.winnerBenchRegret;
    facts.push(`Trotz Sieg liess ${r.team} auf der Bank Punkte liegen: ${r.benchPlayer.name} (${r.benchPlayer.pos}, ${r.benchPlayer.points.toFixed(1)} Punkte) sass draussen, während Starter ${r.starter.name} nur ${r.starter.points.toFixed(1)} Punkte brachte – am Ende reichte es trotzdem.`);
  }

  if (game.positionalDominance) {
    const d = game.positionalDominance;
    facts.push(`Positionale Dominanz: Allein die ${d.pos}s von ${d.team} holten ${d.groupTotal.toFixed(1)} Punkte – mehr als das komplette Team von ${d.opponent} (${d.opponentTotal.toFixed(1)}) zusammen.`);
  }

  if (game.streak) {
    const s = game.streak;
    facts.push(s.streakType === 'WIN'
      ? `${s.team} gewinnt damit das ${s.streakLength}. Spiel in Folge.`
      : `${s.team} kassiert damit die ${s.streakLength}. Niederlage in Folge.`);
  }

  return facts;
}

// Kuratierte "Spitznamen" pro Spiel-Situation – mehrere pro Kategorie für Abwechslung, gedacht als
// wiederkehrendes, augenzwinkerndes Liga-Ritual (ähnlich "Tor des Monats"). Trifft eine Situation auf
// mehrere Kategorien zu (z.B. Blowout + Bank-Reue), landen alle passenden Spitznamen in einem
// gemeinsamen Topf, aus dem – wieder seedbasiert-deterministisch – nur einer gezogen wird.
const BADGE_POOL = {
  blowout: ['Die Klatsche der Woche', 'Frühstück serviert', 'Schulhof-Abreibung', 'Der Elfmeter der Woche', 'Liga-Massaker'],
  nailbiter: ['Herzschlagfinale der Woche', 'Zitterpartie der Woche', 'Photo Finish', 'Nervenkrieg pur'],
  upset: ['David gegen Goliath', 'Der Aussenseiter-Coup', 'Vorschau? Welche Vorschau?', 'Papierform war gestern'],
  fatalBenchRegret: ['Eigentor der Woche', 'Selbstzerstörung par excellence', 'Bank-Bankrott', 'Hausgemachte Pleite'],
  standout: ['Ein-Mann-Armee', 'MVP der Woche', 'Der Unaufhaltsame', 'Solo-Gala'],
  winStreak: ['Die Dampfwalze rollt', 'Unaufhaltsam', 'Auf Erfolgskurs', 'Der Lauf geht weiter'],
  lossStreak: ['Free Fall', 'Krisenmodus', 'Der Absturz geht weiter', 'Kein Land in Sicht'],
  dominance: ['One-Man-Show', 'Die Übermacht', 'Allein gegen alle – und gewonnen'],
  tie: ['Unentschieden-Drama', 'Keiner wollte gewinnen', 'Geteiltes Leid']
};

function pickBadge(game, wasUpset, margin) {
  const categories = [];
  if (game.winner === 'TIE') categories.push('tie');
  if (margin >= 30) categories.push('blowout');
  if (margin > 0 && margin <= 5) categories.push('nailbiter');
  if (wasUpset) categories.push('upset');
  if (game.loserBenchRegret?.wouldHaveWon) categories.push('fatalBenchRegret');
  if (game.standout && game.standout.points >= 30) categories.push('standout');
  if (game.streak?.streakType === 'WIN' && game.streak.streakLength >= 3) categories.push('winStreak');
  if (game.streak?.streakType === 'LOSS' && game.streak.streakLength >= 3) categories.push('lossStreak');
  if (game.positionalDominance) categories.push('dominance');

  const candidates = categories.flatMap((c) => BADGE_POOL[c]);
  if (!candidates.length) return null;
  const key = game.week + '-' + [game.homeId, game.awayId].sort().join('-') + '-badge';
  return seededShuffle(candidates, key)[0];
}

function buildPrompt(game) {
  const margin = Math.abs(game.homeScore - game.awayScore);
  const winner = game.winner === 'HOME' ? game.homeName : game.winner === 'AWAY' ? game.awayName : null;
  const loser = game.winner === 'HOME' ? game.awayName : game.winner === 'AWAY' ? game.homeName : null;
  const favorite = game.homeProj >= game.awayProj ? game.homeName : game.awayName;
  const wasUpset = winner && loser && winner !== favorite;

  let context = `Woche ${game.week}: ${game.homeName} (Vorschau-Stärke: ${game.homeProj.toFixed(0)} Punkte-Projektion für die Saison) gegen ${game.awayName} (${game.awayProj.toFixed(0)}). `;
  context += `Endstand: ${game.homeName} ${game.homeScore.toFixed(1)} : ${game.awayScore.toFixed(1)} ${game.awayName}. `;
  if (game.winner === 'TIE') {
    context += 'Das Spiel endete unentschieden. ';
  } else {
    context += `${winner} gewinnt mit ${margin.toFixed(1)} Punkten Vorsprung gegen ${loser}. `;
    context += wasUpset
      ? `${favorite} galt vor der Saison als das stärker aufgestellte Team – ${winner} hat hier also den Außenseiter-Sieg gelandet. `
      : `${winner} war schon vor der Saison das stärker aufgestellte Team und bestätigt das hier. `;
  }

  const key = game.week + '-' + [game.homeId, game.awayId].sort().join('-');
  const picked = seededShuffle(collectFacts(game), key).slice(0, 2);
  picked.forEach((sentence) => { context += sentence + ' '; });

  const badge = pickBadge(game, wasUpset, margin);
  if (badge) context += `Spitzname für dieses Spiel: "${badge}". `;

  context += 'Schreibe jetzt den Recap.';
  return context;
}

/**
 * @param {Array} games - Spiele einer Woche, angereichert mit week/homeProj/awayProj.
 * @param {Object} existingByKey - bereits vorhandene Recaps (key -> recap), um Doppel-Calls zu vermeiden.
 * @returns {Promise<Object>} key -> recap text (nur neu generierte)
 */
export async function generateRecapsForGames(games, existingByKey) {
  if (!ANTHROPIC_API_KEY) {
    console.log('ANTHROPIC_API_KEY nicht gesetzt – überspringe Recap-Generierung.');
    return {};
  }
  const out = {};
  for (const game of games) {
    const key = game.week + '-' + [game.homeId, game.awayId].sort().join('-');
    if (existingByKey[key]) continue;
    try {
      const prompt = buildPrompt(game);
      const recap = await callClaude(prompt);
      out[key] = { week: game.week, homeName: game.homeName, awayName: game.awayName, recap };
      console.log('Recap generiert:', game.homeName, 'vs', game.awayName);
    } catch (err) {
      console.error('Recap fehlgeschlagen für', game.homeName, 'vs', game.awayName, ':', err.message);
    }
  }
  return out;
}
