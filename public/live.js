const leaderboard = document.getElementById('leaderboard');
const template = document.getElementById('rowTemplate');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const refreshText = document.getElementById('refreshText');

const state = new Map();
let refreshMs = 60_000;

const formatCompact = new Intl.NumberFormat('en-US', {
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
  const next = {
    ...previous,
    serverValue: channel.subscribers,
    lastServerValue: previous?.serverValue ?? channel.subscribers,
    fetchedAt: now,
    previousRank: previous?.rank ?? null,
    rank: previous?.rank ?? null,
    ratePerSecond: previous?.ratePerSecond ?? 0
  };

  if (previous && Number.isFinite(previous.serverValue) && Number.isFinite(channel.subscribers) && channel.subscribers !== previous.serverValue) {
    const elapsed = Math.max(1, (now - previous.fetchedAt) / 1000);
    next.ratePerSecond = Math.max(-10, Math.min(10, (channel.subscribers - previous.serverValue) / elapsed));
  }

  state.set(channel.id, next);
  return next;
}

function projectedValue(channel) {
  const s = state.get(channel.id);
  if (!s || !Number.isFinite(s.serverValue)) return channel.subscribers;
  const elapsed = Math.max(0, (Date.now() - s.fetchedAt) / 1000);
  // The official API rounds public subscriber counts. This is an interpolation for display only.
  const projection = s.serverValue + s.ratePerSecond * elapsed;
  const target = s.ratePerSecond >= 0 ? projection : s.serverValue;
  return Math.max(0, target);
}

function render(channels) {
  const valid = channels.filter((c) => Number.isFinite(c.subscribers));

  valid.forEach((channel) => saveSnapshot(channel));
  valid.sort((a, b) => projectedValue(b) - projectedValue(a));

  valid.forEach((channel, index) => {
    const s = state.get(channel.id);
    const newRank = index + 1;
    s.previousRank = s.rank;
    s.rank = newRank;
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
    row.querySelector('.rank').textContent = String(index + 1).padStart(2, '0');
    row.querySelector('.channel-name').textContent = channel.name;
    row.querySelector('.avatar').src = channel.avatar || '';
    row.querySelector('.avatar').alt = `${channel.name} avatar`;
    row.querySelector('.count').textContent = numberFormat(projectedValue(channel));

    const rate = s.ratePerSecond;
    const change = row.querySelector('.change');
    if (rate > 0.001) {
      change.textContent = `▲ ~${numberFormat(rate * 60)}/min`;
      change.className = 'change up';
    } else {
      change.textContent = 'Awaiting next API refresh';
      change.className = 'change';
    }

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
  [...state.entries()].forEach(([id, s]) => {
    const row = leaderboard.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (!row || !Number.isFinite(s.serverValue)) return;
    const liveValue = s.serverValue + Math.max(0, s.ratePerSecond) * Math.max(0, (Date.now() - s.fetchedAt) / 1000);
    row.querySelector('.count').textContent = formatCompact.format(liveValue);
  });
  requestAnimationFrame(tick);
}

fetchChannels();
setInterval(fetchChannels, 15_000);
tick();
