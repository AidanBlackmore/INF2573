// Turns a finished round's raw answers into results the UI can show, and into
// a one-line plain-text summary the GM reads so later rounds can call back to it.

function nameOf(players, id) {
  const p = players.find((pl) => pl.id === id);
  return p ? p.name : '?';
}

// "Ana", "Ana and Ben", "Ana, Ben and Chi"
function listNames(names) {
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function optionText(round, optionId) {
  const opt = round.gm.options.find((o) => o.id === optionId);
  return opt ? opt.text : '?';
}

function computeResult(round, players) {
  const answers = round.answers;
  switch (round.plan.type) {
    case 'choice': {
      const byOption = round.gm.options.map((o) => ({
        optionId: o.id,
        text: o.text,
        playerIds: Object.keys(answers).filter((pid) => answers[pid] === o.id),
      }));
      return { byOption };
    }
    case 'vote_player': {
      // Every player appears, most-voted first. Who voted for whom stays in `answers`
      // and is only sent to players if the host reveals it.
      const tally = players
        .map((p) => ({ playerId: p.id, count: Object.values(answers).filter((v) => v === p.id).length }))
        .sort((a, b) => b.count - a.count);
      const top = tally[0] ? tally[0].count : 0;
      const winners = top > 0 ? tally.filter((t) => t.count === top).map((t) => t.playerId) : [];
      return { tally, winners };
    }
    default:
      return {};
  }
}

// Short factual summary of what happened, e.g. for the GM's history and the recap.
function describeRound(round, players) {
  const r = round.result || {};
  const n = (id) => nameOf(players, id);
  switch (round.plan.type) {
    case 'choice': {
      const parts = r.byOption
        .filter((o) => o.playerIds.length)
        .map((o) => `${o.playerIds.map(n).join(', ')} chose "${o.text}"`);
      return parts.join('; ') || 'Nobody answered.';
    }
    case 'vote_player': {
      if (!r.winners.length) return 'Nobody voted.';
      const counts = r.tally.filter((t) => t.count).map((t) => `${n(t.playerId)} ${t.count}`).join(', ');
      let text = `The group picked ${listNames(r.winners.map(n))} (votes: ${counts}).`;
      if (round.votersRevealed) {
        text += ' Who voted for whom: ' + Object.entries(round.answers).map(([v, t]) => `${n(v)}→${n(t)}`).join(', ') + '.';
      }
      return text;
    }
    default:
      return '';
  }
}

module.exports = { computeResult, describeRound, nameOf, optionText, listNames };
