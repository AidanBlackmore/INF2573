// End-of-game stats, computed from what actually happened (no AI involved).
// The GM only adds titles and flavour on top of these, so the recap works in mock mode
// and can't invent moments that never happened.
const { describeRound, nameOf } = require('./results');

function computeStats(room) {
  const players = room.players;
  const played = room.rounds.filter((r) => r.result);
  const n = (id) => nameOf(players, id);

  const moments = played.map((r, i) => ({ round: i + 1, type: r.plan.type, prompt: r.gm.prompt, outcome: describeRound(r, players) }));
  const awards = [];
  const highlights = [];

  // Lone wolf: the player most often alone in their choice.
  const alone = {};
  for (const r of played.filter((r) => r.plan.type === 'choice')) {
    for (const o of r.result.byOption) {
      if (o.playerIds.length === 1 && Object.keys(r.answers).length > 2) {
        const pid = o.playerIds[0];
        alone[pid] = (alone[pid] || 0) + 1;
        highlights.push(`When asked "${r.gm.prompt}", ${n(pid)} was the only one who chose "${o.text}".`);
      }
    }
  }
  const topAlone = Math.max(0, ...Object.values(alone));
  if (topAlone > 0) {
    awards.push({ label: 'Lone Wolf', playerIds: Object.keys(alone).filter((id) => alone[id] === topAlone), detail: `went against the group ${topAlone} time${topAlone > 1 ? 's' : ''}` });
  }

  // Hive mind: a choice round where everyone agreed.
  for (const r of played.filter((r) => r.plan.type === 'choice')) {
    const answered = Object.keys(r.answers).length;
    const unanimous = r.result.byOption.find((o) => answered > 1 && o.playerIds.length === answered);
    if (unanimous) highlights.push(`Everyone agreed: "${unanimous.text}". A rare moment of unity.`);
  }

  return { moments, awards, highlights };
}

module.exports = { computeStats };
