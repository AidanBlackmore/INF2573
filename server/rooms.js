// In-memory rooms and the game's phase machine. This is the only file that changes game state.
//
// Phases: lobby -> world -> loading -> roles -> (answering -> reveal) x N -> recap
const crypto = require('crypto');
const config = require('./config');
const gm = require('./gm');
const { computeResult, describeRound } = require('./results');
const { computeStats } = require('./recap');

const rooms = new Map();
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I/O, easy to read aloud

class GameError extends Error {}
const bad = (msg) => { throw new GameError(msg); };

function newCode() {
  let code;
  do {
    code = Array.from({ length: 4 }, () => CODE_LETTERS[crypto.randomInt(CODE_LETTERS.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function cleanName(name) {
  const n = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 20);
  if (!n) bad('Please enter a name.');
  return n;
}

// ---------- joining ----------

function createRoom(name) {
  const room = {
    code: newCode(),
    hostId: null,
    phase: 'lobby',
    loadingText: '',
    worldVotes: {},
    world: null,
    players: [],
    cast: null,
    plan: null,
    rounds: [],
    recap: null,
    gmSource: null,
    busy: false,
    listeners: new Set(), // callbacks fired after every state change
  };
  rooms.set(room.code, room);
  const player = addPlayer(room, name);
  return { room, player };
}

function addPlayer(room, name) {
  const n = cleanName(name);
  if (room.phase !== 'lobby') bad('That game has already started.');
  if (room.players.length >= config.roundPlan().maxPlayers) bad('That room is full.');
  if (room.players.some((p) => p.name.toLowerCase() === n.toLowerCase())) bad('Someone in the room already has that name.');
  const player = { id: `p${room.players.length + 1}`, name: n, token: crypto.randomUUID(), connected: true };
  room.players.push(player);
  if (!room.hostId) room.hostId = player.id;
  return player;
}

function joinRoom(code, name) {
  const room = getRoom(code);
  return { room, player: addPlayer(room, name) };
}

function getRoom(code) {
  const room = rooms.get(String(code || '').trim().toUpperCase());
  if (!room) bad('No room with that code.');
  return room;
}

function resume(code, token) {
  const room = getRoom(code);
  const player = room.players.find((p) => p.token === token);
  if (!player) bad('Could not rejoin that room.');
  player.connected = true;
  return { room, player };
}

function setConnected(room, playerId, connected) {
  const p = room.players.find((pl) => pl.id === playerId);
  if (!p) return;
  p.connected = connected;
  // If the host drops, hand control to the next connected player.
  if (!connected && room.hostId === playerId) {
    const next = room.players.find((pl) => pl.connected);
    if (next) room.hostId = next.id;
  } else if (connected && !room.players.some((pl) => pl.connected && pl.id === room.hostId)) {
    room.hostId = playerId;
  }
  // A dropped player shouldn't block the round.
  if (room.phase === 'answering' && everyoneAnswered(room)) reveal(room);
}

// ---------- helpers ----------

function currentRound(room) {
  return room.rounds[room.rounds.length - 1] || null;
}

function requireHost(room, playerId) {
  if (room.hostId !== playerId) bad('Only the host can do that.');
}

function requirePhase(room, phase) {
  if (room.phase !== phase) bad('Not right now.');
}

function connectedPlayers(room) {
  return room.players.filter((p) => p.connected);
}

function everyoneAnswered(room) {
  const round = currentRound(room);
  return connectedPlayers(room).every((p) => p.id in round.answers);
}

function history(room) {
  return room.rounds
    .filter((r) => r.result)
    .map((r, i) => ({ round: i + 1, type: r.plan.type, targetId: r.plan.targetId || '', prompt: r.gm.prompt, outcome: describeRound(r, room.players) }));
}

function gmContext(room, extra = {}) {
  return {
    world: room.world,
    players: room.players.map(({ id, name }) => ({ id, name })),
    cast: room.cast,
    history: history(room),
    ...extra,
  };
}

function changed(room) {
  for (const fn of room.listeners) fn(room);
}

// Runs a GM call behind a loading screen. Guards against double-taps.
async function withGM(room, loadingText, fn) {
  if (room.busy) bad('The Game Master is busy.');
  room.busy = true;
  const prevPhase = room.phase;
  room.phase = 'loading';
  room.loadingText = loadingText;
  changed(room);
  try {
    await fn();
  } catch (err) {
    console.error('[rooms] GM step failed:', err);
    room.phase = prevPhase;
  } finally {
    room.busy = false;
    changed(room);
  }
}

// ---------- phase actions (called from socket handlers) ----------

function start(room, playerId) {
  requireHost(room, playerId);
  requirePhase(room, 'lobby');
  const min = config.roundPlan().minPlayers;
  if (room.players.length < min) bad(`You need at least ${min} players.`);
  room.phase = 'world';
}

function voteWorld(room, playerId, worldId) {
  requirePhase(room, 'world');
  if (!config.world(worldId)) bad('Unknown world.');
  room.worldVotes[playerId] = worldId;
}

function lockWorld(room, playerId) {
  requireHost(room, playerId);
  requirePhase(room, 'world');
  const counts = {};
  for (const w of Object.values(room.worldVotes)) counts[w] = (counts[w] || 0) + 1;
  const top = Math.max(0, ...Object.values(counts));
  const leaders = Object.keys(counts).filter((w) => counts[w] === top);
  const hostPick = room.worldVotes[playerId];
  const chosen = leaders.includes(hostPick) ? hostPick : leaders[0];
  if (!chosen) bad('Vote for a world first.');
  room.world = config.world(chosen);
  room.plan = config.roundPlan();
  return withGM(room, 'The Game Master is casting your roles…', async () => {
    const { data, source } = await gm.setup(gmContext(room));
    room.cast = data;
    room.gmSource = source;
    room.phase = 'roles';
  });
}

function planRound(room) {
  const index = room.rounds.length;
  const spec = room.plan.rounds[index];
  const plan = { type: spec.type };
  const connected = connectedPlayers(room);
  if (spec.type === 'predict') {
    // Put the spotlight on whoever has had it least.
    const spotlight = (id) => room.rounds.filter((r) => r.plan.targetId === id).length;
    const fewest = Math.min(...connected.map((p) => spotlight(p.id)));
    const candidates = connected.filter((p) => spotlight(p.id) === fewest);
    plan.targetId = candidates[crypto.randomInt(candidates.length)].id;
  }
  // Rotate who reads the scene out loud.
  plan.readerId = connected[index % connected.length].id;
  return plan;
}

function nextRound(room, playerId) {
  requireHost(room, playerId);
  if (!['roles', 'reveal'].includes(room.phase)) bad('Not right now.');
  if (room.rounds.length >= room.plan.rounds.length) return finish(room);
  const plan = planRound(room);
  const number = room.rounds.length + 1;
  return withGM(room, `The Game Master is writing round ${number}…`, async () => {
    const { data, source } = await gm.round(gmContext(room, { plan, roundNumber: number, totalRounds: room.plan.rounds.length }));
    room.rounds.push({ plan, gm: data, answers: {}, result: null });
    room.gmSource = source;
    room.phase = 'answering';
  });
}

function answer(room, playerId, value) {
  requirePhase(room, 'answering');
  const round = currentRound(room);
  if (!round.gm.options.some((o) => o.id === value)) bad('That is not an option.');
  round.answers[playerId] = value; // can change your mind until the reveal
  if (everyoneAnswered(room)) reveal(room);
}

function forceReveal(room, playerId) {
  requireHost(room, playerId);
  requirePhase(room, 'answering');
  reveal(room);
}

function reveal(room) {
  const round = currentRound(room);
  round.result = computeResult(round, room.players);
  room.phase = 'reveal';
}

function finish(room) {
  const stats = computeStats(room);
  return withGM(room, 'The Game Master is writing your story…', async () => {
    const { data, source } = await gm.recap(gmContext(room, { stats }));
    room.recap = { stats, gm: data };
    room.gmSource = source;
    room.phase = 'recap';
  });
}

function playAgain(room, playerId) {
  requireHost(room, playerId);
  requirePhase(room, 'recap');
  Object.assign(room, { phase: 'world', worldVotes: {}, world: null, cast: null, rounds: [], recap: null });
}

// ---------- what each player is allowed to see ----------

function publicState(room, viewerId) {
  const round = currentRound(room);
  const state = {
    code: room.code,
    phase: room.phase,
    you: viewerId,
    hostId: room.hostId,
    players: room.players.map(({ id, name, connected }) => ({ id, name, connected })),
    loadingText: room.loadingText,
    gmSource: room.gmSource,
    minPlayers: config.roundPlan().minPlayers,
  };
  if (room.phase === 'world') {
    state.worlds = config.worlds();
    state.worldVotes = room.worldVotes;
  }
  if (room.world) state.world = room.world;
  if (room.cast) state.cast = room.cast;
  if (room.plan) state.totalRounds = room.plan.rounds.length;
  if (round && ['answering', 'reveal'].includes(room.phase)) {
    const revealed = room.phase === 'reveal';
    state.round = {
      number: room.rounds.length,
      type: round.plan.type,
      targetId: round.plan.targetId || null,
      readerId: round.plan.readerId,
      scene: round.gm.scene,
      prompt: round.gm.prompt,
      callback: round.gm.callback,
      options: round.gm.options,
      answeredIds: Object.keys(round.answers),
      yourAnswer: round.answers[viewerId] ?? null,
      // Other players' answers stay hidden until the reveal.
      answers: revealed ? round.answers : null,
      result: revealed ? round.result : null,
      isLast: room.rounds.length >= room.plan.rounds.length,
    };
  }
  if (room.phase === 'recap') state.recap = room.recap;
  return state;
}

module.exports = {
  GameError, createRoom, joinRoom, getRoom, resume, setConnected, publicState, changed,
  start, voteWorld, lockWorld, nextRound, answer, forceReveal, playAgain,
};
