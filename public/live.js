const leaderboard = document.getElementById('leaderboard');
const template = document.getElementById('rowTemplate');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const refreshText = document.getElementById('refreshText');

const state = new Map();
let refreshMs = 60_000;

const compactFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 2
});

function numberFormat(value) {
  if (!Number.isFinite(value)) return '—';
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return Math.round(value).toLocaleString('en-US');
}

function setStatus(kind, text) {
  statusDot.className = `status-dot ${kind || ''}`;
  statusText.textContent = text;
}

function saveSnapshot(channel) {
  const previous = state.get(channel.id);
  const now = Date.now();
  const nextServerValue = channel.subscribers;
  const previousValue = previous?.serverValue ?? nextServerValue;

  state.set(channel.id, {
    ...previous,
    serverValue: nextServerValue,
    animationFrom: previousValue,
    animationTo: nextServerValue,
    fetchedAt: now,
    previousRank: previous?.rank ?? null,
    rank: previous?.rank ?? null
  });
}

function displayedValue(channel) {
  const s = state.get(channel.id);
  if (!s || !Number.isFinite(s.serverValue)) return channel.subscribers;
  if (!Number.isFinite(s.animationFrom) || !Number.isFinite(s.animationTo)) return s.serverValue;

  const progress = Math.min(1, Math.max(0, (Date.now() - s.fetchedAt) / refreshMs));
  const eased = 1 - Math.pow(1 - progress, 3);
  return s.animationFrom + (s.animationTo - s.animationFrom) * eased;
}

function render(channels) {
  const valid = channels.filter((c) => Number.isFinite(c.subscribers));
  valid.forEach(saveSnapshot);
  valid.sort((a, b) => displayedValue(b) - displayedValue(a));

  valid.forEach((channel, index) => {
    const s = state.get(channel.id);
    s.previousRank = s.rank;
    s.rank = index + 1;
  });

  const rows = new Map([...leaderboard.children].map((row) => [row.dataset.id, row]));
  const fragment = document.createDocumentFragment();

  valid.forEach((channel, index) => {
    let row = rows.get(channel.id);
    if (!row) {
      row = template.content.firstElementChild.cloneNode(true);
      row.dataset.id = channel.id;
    }

    const s = state.get(channel.id);
    const movement = s.previousRank == null ? 0 : s.previousRank - s.rank;
    const changed = s.animationFrom !== s.animationTo;
    const change = row.querySelector('.change');

    row.querySelector('.rank').textContent = String(index + 1).padStart(2, '0');
    row.querySelector('.channel-name').textContent = channel.name;
    row.querySelector('.avatar').src = channel.avatar || '';
    row.querySelector('.avatar').alt = `${channel.name} avatar`;
    row.querySelector('.count').textContent = numberFormat(displayedValue(channel));

    change.textContent = changed ? `Estimated transition · ${formatAge(channel.fetchedAt)}` : 'Official API count';
    change.className = `change${changed ? ' up' : ''}`;

    const movementEl = row.querySelector('.movement');
    movementEl.className = 'movement';
    if (movement > 0) {
      movementEl.classList.add('up');
      movementEl.textContent = '↑';
    } else if (movement < 0) {
      movementEl.classList.add('down');
      movementEl.textContent = '↓';
    } else {
      movementEl.textContent = '•';
    }

    row.classList.toggle('top', index < 3);
    fragment.appendChild(row);
  });

  leaderboard.replaceChildren(fragment);
}

async function fetchChannels() {
  try {
    const response = await fetch(`/api/channels?t=${Date.now()}`, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || 'Tracker API unavailable');

    refreshMs = Number(data.refreshMs) || refreshMs;
    render(data.channels || []);
    setStatus('online', data.stale ? 'STALE DATA' : 'LIVE');
    refreshText.textContent = `API: ${formatAge(data.updatedAt)} · every ${Math.round(refreshMs / 1000)}s`;
  } catch (error) {
    setStatus('error', 'OFFLINE');
    refreshText.textContent = error.message;
  }
}

function formatAge(timestamp) {
  if (!timestamp) return '—';
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)}m ago`;
}

function tick() {
  state.forEach((s, id) => {
    const row = leaderboard.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (!row || !Number.isFinite(s.serverValue)) return;
    row.querySelector('.count').textContent = compactFormatter.format(s.animationFrom + (s.animationTo - s.animationFrom) * (1 - Math.pow(1 - Math.min(1, Math.max(0, (Date.now() - s.fetchedAt) / refreshMs)), 3)));
  });
  requestAnimationFrame(tick);
}

fetchChannels();
setInterval(fetchChannels, 15_000);
tick();
