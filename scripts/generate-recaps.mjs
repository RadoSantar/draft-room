// Lässt Claude für jedes abgeschlossene Spiel einen kurzen, reisserischen Recap
// im Stil des Saison-Ausblicks schreiben. Läuft nur, wenn ANTHROPIC_API_KEY gesetzt
// ist – ohne Key wird dieser Schritt übersprungen, der restliche Sync läuft normal weiter.
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-sonnet-5';

const SYSTEM_PROMPT = `Du schreibst kurze, extrem reisserische und dramatische Spiel-Recaps (3-4 Sätze, auf Deutsch) für "Fantasy Playbook", eine private Fantasy-Football-Liga. Stil: wie ein Sport-Kommentator, der jedes Spiel als DAS Ereignis der Woche inszeniert – Superlative, Spannungsbogen, ruhig übertreiben. Bleib bei den gegebenen Fakten (Teamnamen, Endstand, wer favorisiert war), erfinde keine Spieler-Stats oder Ereignisse, die nicht gegeben sind. Schreib NUR den Fliesstext des Recaps selbst, keine Einleitung wie "Hier ist der Recap", keine Anführungszeichen drumherum, keine Überschrift.`;

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
