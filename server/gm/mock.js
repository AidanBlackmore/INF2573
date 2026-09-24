// Mock Game Master: canned responses from config/mock/<world>.json.
// Returns the same shapes as the live GM so the rest of the app can't tell the difference.
const config = require('../config');

function pick(list, i) {
  return list[i % list.length];
}

function randomOf(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function fill(text, vars) {
  return text.replace(/\{(\w+)\}/g, (m, key) => (key in vars ? vars[key] : m));
}

async function setup({ world, players }) {
  const script = config.mockScript(world.id).setup;
  const offset = Math.floor(Math.random() * script.roles.length);
  const roles = players.map((p, i) => ({ playerId: p.id, ...pick(script.roles, i + offset) }));
  // Pair each player with the next one so everyone is in at least one relationship.
  const relationships = players.length < 2 ? [] : players.map((p, i) => {
    const other = players[(i + 1) % players.length];
    const text = fill(pick(script.relationships, i + offset), { a: p.name, b: other.name });
    return { from: p.id, to: other.id, text };
  });
  return { intro: script.intro, roles, relationships };
}

async function round({ world, players, history, plan }) {
  const pool = config.mockScript(world.id).rounds[plan.type];
  const usedOfType = history.filter((h) => h.type === plan.type).length;
  const tpl = pick(pool, usedOfType);
  const target = players.find((p) => p.id === plan.targetId);
  const others = players.filter((p) => p.id !== plan.targetId);
  const vars = { target: target ? target.name : 'someone', someone: randomOf(others.length ? others : players).name };
  return {
    scene: fill(tpl.scene, vars),
    type: plan.type,
    prompt: fill(tpl.prompt, vars),
    options: (tpl.options || []).map((text, i) => ({ id: 'abcdef'[i], text: fill(text, vars) })),
    targetPlayerId: plan.targetId || '',
    callback: '',
  };
}

async function recap({ world, players, stats }) {
  const script = config.mockScript(world.id).recap;
  const offset = Math.floor(Math.random() * script.titles.length);
  return {
    titles: players.map((p, i) => ({ playerId: p.id, title: pick(script.titles, i + offset), reason: '' })),
    memories: stats.highlights.slice(0, 3),
    epilogue: script.epilogue,
  };
}

module.exports = { setup, round, recap };
