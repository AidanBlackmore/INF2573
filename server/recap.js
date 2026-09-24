// End-of-game stats, computed from what actually happened (no AI involved).
// The GM only adds titles and flavour on top of these, so the recap works in mock mode
// and can't invent moments that never happened.
const { describeRound, nameOf, listNames, optionText } = require('./results');

function computeStats(room) {
  const players = room.players;
  const played = room.rounds.filter((r) => r.result);
  const n = (id) => nameOf(players, id);

  const moments = played.map((r, i) => ({ round: i + 1, type: r.plan.type, prompt: r.gm.prompt, outcome: describeRound(r, players) }));
  const awards = [];
  // Candidate "memories": weighted so the most inside-joke-worthy moments come first.
  const candidates = [];
  const highlight = (weight, text, round) => candidates.push({ weight, text, round });

  // Lone wolf: the player most often alone in their choice.
  const alone = {};
  for (const r of played.filter((r) => r.plan.type === 'choice')) {
    const rn = played.indexOf(r);
    for (const o of r.result.byOption) {
      if (o.playerIds.length === 1 && Object.keys(r.answers).length > 2) {
        const pid = o.playerIds[0];
        alone[pid] = (alone[pid] || 0) + 1;
        highlight(2, `When asked "${r.gm.prompt}", ${n(pid)} was the only one who chose "${o.text}".`, rn);
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
    if (unanimous) highlight(2, `Everyone agreed: "${unanimous.text}". A rare moment of unity.`, played.indexOf(r));
  }

  // How the group sees each player: every "who would..." vote they won.
  const seenAs = Object.fromEntries(players.map((p) => [p.id, []]));
  const votesReceived = {};
  for (const r of played.filter((r) => r.plan.type === 'vote_player')) {
    const total = Object.keys(r.answers).length;
    const rn = played.indexOf(r);
    for (const t of r.result.tally) votesReceived[t.playerId] = (votesReceived[t.playerId] || 0) + t.count;
    for (const w of r.result.winners) {
      const count = r.result.tally.find((t) => t.playerId === w).count;
      seenAs[w].push({ prompt: r.gm.prompt, votes: count, of: total });
      if (count === total && total > 2) highlight(5, `"${r.gm.prompt}" Unanimous: ${n(w)}. Every single vote.`, rn);
      else if (r.result.winners.length === 1) highlight(3, `"${r.gm.prompt}" The group said ${n(w)} (${count} of ${total} votes).`, rn);
    }
    // Self-votes are only public if the host revealed who voted for whom.
    if (r.votersRevealed) {
      const selfVoters = Object.keys(r.answers).filter((v) => r.answers[v] === v);
      if (selfVoters.length) highlight(4, `${listNames(selfVoters.map(n))} voted for themselves on "${r.gm.prompt}". Self-aware or proud?`, rn);
    }
  }
  const topVotes = Math.max(0, ...Object.values(votesReceived));
  if (topVotes > 0) {
    awards.push({ label: 'Most Voted', playerIds: Object.keys(votesReceived).filter((id) => votesReceived[id] === topVotes), detail: `${topVotes} votes across all "who would..." questions` });
  }

  // Predictions: who knows the group best, and who nobody can read.
  const guesses = {};
  const correct = {};
  for (const r of played.filter((r) => r.plan.type === 'predict' && r.result.actual)) {
    const rn = played.indexOf(r);
    const target = r.plan.targetId;
    const { guesserIds, correctIds } = r.result;
    for (const pid of guesserIds) {
      guesses[pid] = (guesses[pid] || 0) + 1;
      if (correctIds.includes(pid)) correct[pid] = (correct[pid] || 0) + 1;
    }
    if (guesserIds.length > 1 && correctIds.length === 0) {
      highlight(4, `Nobody predicted that ${n(target)} would choose "${optionText(r, r.result.actual)}". Not one person.`, rn);
    } else if (guesserIds.length > 1 && correctIds.length === guesserIds.length) {
      highlight(3, `Everyone knew ${n(target)} would choose "${optionText(r, r.result.actual)}". Total open book.`, rn);
    } else if (correctIds.length === 1) {
      highlight(3, `Only ${n(correctIds[0])} knew ${n(target)} would choose "${optionText(r, r.result.actual)}".`, rn);
    } else {
      highlight(1, `${listNames(correctIds.map(n))} called it: ${n(target)} chose "${optionText(r, r.result.actual)}".`, rn);
    }
  }
  const topCorrect = Math.max(0, ...Object.values(correct));
  if (topCorrect > 0) {
    const ids = Object.keys(correct).filter((id) => correct[id] === topCorrect);
    awards.push({ label: 'Mind Reader', playerIds: ids, detail: `predicted ${topCorrect} of ${guesses[ids[0]]} right` });
  }

  // Best moment from each round first (so memories cover the whole game), then the rest.
  candidates.sort((a, b) => b.weight - a.weight);
  const firsts = candidates.filter((c, i) => candidates.findIndex((d) => d.round === c.round) === i);
  const highlights = [...firsts, ...candidates.filter((c) => !firsts.includes(c))].map((c) => c.text);
  return { moments, awards, highlights, seenAs };
}

module.exports = { computeStats };
