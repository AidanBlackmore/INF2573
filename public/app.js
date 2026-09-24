// Client: renders one screen per game phase from the state the server sends.
// Buttons use data-action="..." and are handled by one click listener at the bottom.
/* global io */
const socket = io();
const $app = document.getElementById('app');
let state = null;
let lanUrl = null;

// ---------- session (so a phone that sleeps can rejoin) ----------

const SESSION_KEY = 'au-session';
function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
}
function saveSession(s) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch { /* private mode */ }
}
function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}

socket.on('connect', () => {
  const s = loadSession();
  if (s) {
    socket.emit('resume', s, (res) => {
      if (!res.ok) { clearSession(); state = null; render(); }
    });
  } else if (!state) {
    render();
  }
});
socket.on('joined', ({ code, token }) => saveSession({ code, token }));
socket.on('state', (s) => { state = s; render(); });

fetch('/info').then((r) => r.json()).then((info) => { lanUrl = info.urls[0] || null; if (state) render(); }).catch(() => {});

function send(event, payload = {}) {
  socket.emit(event, payload, (res) => { if (res && !res.ok) toast(res.error); });
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.hidden = true; }, 3000);
}

// ---------- helpers ----------

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const me = () => state.players.find((p) => p.id === state.you);
const isHost = () => state.hostId === state.you;
const nameOf = (id) => (state.players.find((p) => p.id === id) || { name: '?' }).name;
const namesOf = (ids) => ids.map(nameOf).join(', ');

function hostBar(html) {
  return isHost() ? `<div class="host-bar stack">${html}</div>` : '';
}

function waitingForHost(text = 'Waiting for the host…') {
  return isHost() ? '' : `<p class="muted center">${esc(text)}</p>`;
}

const ROUND_LABELS = {
  choice: 'Your choice',
  vote_player: 'Group vote',
  predict: 'Prediction',
};

// ---------- screens ----------

function renderHome() {
  const code = new URLSearchParams(location.search).get('code') || '';
  return `
    <h1>Alternate Universe</h1>
    <p class="muted">A party game for friends. An AI Game Master drops your group into another world, then asks what you really think of each other.</p>
    <div class="card stack">
      <input id="name" placeholder="Your name" maxlength="20" autocomplete="off">
    </div>
    <div class="card stack">
      <h3>Join a room</h3>
      <input id="code" class="code" placeholder="CODE" maxlength="4" autocomplete="off" value="${esc(code)}">
      <button class="primary" data-action="join">Join</button>
    </div>
    <div class="card stack">
      <h3>Or start a new one</h3>
      <button data-action="create">Create a room</button>
    </div>`;
}

function renderLobby() {
  const link = lanUrl ? `${lanUrl}/?code=${state.code}` : `${location.origin}/?code=${state.code}`;
  const enough = state.players.length >= state.minPlayers;
  return `
    <p class="tag center">Room code</p>
    <div class="big-code">${esc(state.code)}</div>
    <p class="center small muted">Friends join at <strong>${esc(link)}</strong></p>
    <h2>Players (${state.players.length})</h2>
    <div>${state.players.map((p) => `<span class="pill ${p.connected ? '' : 'off'}">${esc(p.name)}${p.id === state.hostId ? ' 👑' : ''}</span>`).join('')}</div>
    ${enough ? '' : `<p class="muted">Need at least ${state.minPlayers} players to start.</p>`}
    ${hostBar(`<button class="primary" data-action="start" ${enough ? '' : 'disabled'}>Everyone's in, start</button>`)}
    ${waitingForHost('Waiting for the host to start…')}`;
}

function renderWorld() {
  const votes = state.worldVotes || {};
  const mine = votes[state.you];
  const count = (id) => Object.values(votes).filter((v) => v === id).length;
  return `
    <h1>Pick a world</h1>
    <p class="muted">Everyone votes. The host locks it in.</p>
    <div class="stack">
      ${state.worlds.map((w) => `
        <button class="${mine === w.id ? 'selected' : ''}" data-action="voteWorld" data-value="${esc(w.id)}">
          <strong>${esc(w.emoji)} ${esc(w.name)}</strong>${count(w.id) ? ` <span class="pill">${count(w.id)} vote${count(w.id) > 1 ? 's' : ''}</span>` : ''}<br>
          <span class="muted small">${esc(w.tagline)}</span>
        </button>`).join('')}
    </div>
    ${hostBar(`<button class="primary" data-action="lockWorld" ${Object.keys(votes).length ? '' : 'disabled'}>Lock in the top world</button>`)}`;
}

function renderLoading() {
  return `<div class="spinner"></div><p class="center">${esc(state.loadingText || 'Loading…')}</p>`;
}

function renderRoles() {
  const { cast } = state;
  const mine = cast.roles[state.you];
  const rels = cast.relationships;
  return `
    <p class="tag">${esc(state.world.emoji)} ${esc(state.world.name)}</p>
    <p class="scene">${esc(cast.intro)}</p>
    <div class="card highlight">
      <p class="tag">You are</p>
      <h2 style="margin-top:4px">${esc(mine.title)}</h2>
      <p>${esc(mine.blurb)}</p>
    </div>
    <p class="muted small">Take turns reading your role out loud.</p>
    <h2>The cast</h2>
    ${state.players.filter((p) => p.id !== state.you).map((p) => `
      <div class="card"><strong>${esc(p.name)}</strong>: ${esc(cast.roles[p.id].title)}<br><span class="muted small">${esc(cast.roles[p.id].blurb)}</span></div>`).join('')}
    ${rels.length ? `<h2>Relationships</h2>${rels.map((r) => `<div class="card ${r.from === state.you || r.to === state.you ? 'highlight' : ''}">${esc(r.text)}</div>`).join('')}` : ''}
    ${hostBar('<button class="primary" data-action="next">Start round 1</button>')}
    ${waitingForHost()}`;
}

function roundHeader(r) {
  const reader = r.readerId === state.you
    ? '📣 <strong>You</strong> read this one out loud!'
    : `📣 <strong>${esc(nameOf(r.readerId))}</strong> reads this one out loud`;
  return `
    <p class="tag">Round ${r.number} of ${state.totalRounds} · ${esc(ROUND_LABELS[r.type] || r.type)}</p>
    <div class="reader">${reader}</div>
    <p class="scene">${esc(r.scene)}</p>
    <p class="prompt">${esc(r.prompt)}</p>`;
}

function renderAnswering() {
  const r = state.round;
  const waiting = state.players.filter((p) => p.connected && !r.answeredIds.includes(p.id));
  return `
    ${roundHeader(r)}
    <div class="stack">
      ${r.options.map((o) => `<button class="${r.yourAnswer === o.id ? 'selected' : ''}" data-action="answer" data-value="${esc(o.id)}">${esc(o.text)}</button>`).join('')}
    </div>
    <p class="muted small center">${r.yourAnswer ? 'Locked in. You can still change it until everyone has answered.' : ''}</p>
    <p class="small">${waiting.length ? `Waiting for: ${waiting.map((p) => `<span class="pill">${esc(p.name)}</span>`).join('')}` : ''}</p>
    ${hostBar(`<button data-action="forceReveal">Reveal now (don't wait)</button>`)}`;
}

function renderResult(r) {
  const res = r.result;
  if (r.type === 'choice') {
    const total = Math.max(1, Object.keys(r.answers).length);
    return res.byOption.map((o) => `
      <div class="card">
        <strong>${esc(o.text)}</strong>
        <div class="bar" style="width:${Math.max(2, (o.playerIds.length / total) * 100)}%"></div>
        <div class="names">${o.playerIds.length ? esc(namesOf(o.playerIds)) : 'nobody'}</div>
      </div>`).join('');
  }
  return '';
}

function renderReveal() {
  const r = state.round;
  return `
    <p class="tag">Round ${r.number} of ${state.totalRounds} · Results</p>
    <p class="prompt">${esc(r.prompt)}</p>
    ${renderResult(r)}
    ${hostBar(`<button class="primary" data-action="next">${r.isLast ? 'See the recap' : 'Next round'}</button>`)}
    ${waitingForHost()}`;
}

function renderRecap() {
  const { stats, gm } = state.recap;
  return `
    <p class="tag">${esc(state.world.emoji)} ${esc(state.world.name)} · The end</p>
    <h1>Recap</h1>
    ${gm.epilogue ? `<p class="scene">${esc(gm.epilogue)}</p>` : ''}
    <h2>Who you were</h2>
    ${state.players.map((p) => {
      const t = gm.titles[p.id];
      const awards = stats.awards.filter((a) => a.playerIds.includes(p.id));
      return `<div class="card ${p.id === state.you ? 'highlight' : ''}">
        <strong>${esc(p.name)}</strong> <span class="muted small">(${esc(state.cast.roles[p.id].title)})</span>
        ${t ? `<h3 style="margin:6px 0 2px">🏆 ${esc(t.title)}</h3>${t.reason ? `<p class="small">${esc(t.reason)}</p>` : ''}` : ''}
        ${awards.map((a) => `<p class="small"><span class="pill">${esc(a.label)}</span> ${esc(a.detail)}</p>`).join('')}
      </div>`;
    }).join('')}
    ${gm.memories.length ? `<h2>Memories</h2>${gm.memories.map((m) => `<div class="card">💬 ${esc(m)}</div>`).join('')}` : ''}
    <h2>Key moments</h2>
    ${stats.moments.map((m) => `<div class="card"><p class="tag">Round ${m.round}</p><strong>${esc(m.prompt)}</strong><p class="small">${esc(m.outcome)}</p></div>`).join('')}
    ${hostBar('<button class="primary" data-action="playAgain">Play again (same group)</button>')}`;
}

const SCREENS = {
  lobby: renderLobby,
  world: renderWorld,
  loading: renderLoading,
  roles: renderRoles,
  answering: renderAnswering,
  reveal: renderReveal,
  recap: renderRecap,
};

function render() {
  if (!state) {
    $app.innerHTML = renderHome();
    return;
  }
  const screen = SCREENS[state.phase];
  const footer = `<div class="footer">Room ${esc(state.code)} · you are ${esc(me() ? me().name : '?')}${state.gmSource ? ` · GM: ${esc(state.gmSource)}` : ''}
    <br><button class="link" data-action="leave">Leave game</button></div>`;
  $app.innerHTML = (screen ? screen() : `<p>Unknown phase: ${esc(state.phase)}</p>`) + footer;
}

// ---------- input ----------

const ACTIONS = {
  create() {
    send('create', { name: document.getElementById('name').value });
  },
  join() {
    send('join', { name: document.getElementById('name').value, code: document.getElementById('code').value });
  },
  leave() {
    if (!confirm('Leave this game? You can rejoin only while the room is in the lobby.')) return;
    clearSession();
    location.href = '/';
  },
  start: () => send('start'),
  voteWorld: (v) => send('voteWorld', { worldId: v }),
  lockWorld: () => send('lockWorld'),
  next: () => send('next'),
  answer: (v) => send('answer', { value: v }),
  forceReveal: () => send('forceReveal'),
  playAgain: () => send('playAgain'),
};

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn || btn.disabled) return;
  const fn = ACTIONS[btn.dataset.action];
  if (fn) fn(btn.dataset.value);
});
