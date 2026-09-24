// Loads the team-editable config files in /config.
// Files are re-read on every call so you can tweak them without restarting.
const fs = require('fs');
const path = require('path');

const CONFIG_DIR = path.join(__dirname, '..', 'config');

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, file), 'utf8'));
}

function worlds() {
  return readJson('worlds.json');
}

function world(id) {
  return worlds().find((w) => w.id === id) || null;
}

function roundPlan() {
  return readJson('round-plan.json');
}

function mockScript(worldId) {
  const specific = path.join(CONFIG_DIR, 'mock', `${worldId}.json`);
  return fs.existsSync(specific) ? readJson(`mock/${worldId}.json`) : readJson('mock/generic.json');
}

module.exports = { worlds, world, roundPlan, mockScript };
