// Turns a finished round's raw answers into results the UI can show, and into
// a one-line plain-text summary the GM reads so later rounds can call back to it.

function nameOf(players, id) {
  const p = players.find((pl) => pl.id === id);
  return p ? p.name : '?';
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
    default:
      return '';
  }
}

module.exports = { computeResult, describeRound, nameOf, optionText };
