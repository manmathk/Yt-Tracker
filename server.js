require('dotenv').config();

const path = require('path');
const express = require('express');
const channels = require('./data/channels.json');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.YOUTUBE_API_KEY;
const REFRESH_MS = Math.max(30_000, Number(process.env.REFRESH_MS) || 60_000);

const cache = {
  updatedAt: 0,
  channels: [],
  error: null
};

let resolvedChannels = null;
let refreshing = null;

function publicChannel(item, fallback) {
  const stats = item.statistics || {};
  return {
    id: item.id,
    handle: fallback.handle,
    configuredName: fallback.name,
    name: item.snippet?.title || fallback.name,
    avatar: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.default?.url || null,
    subscribers: stats.hiddenSubscriberCount ? null : Number(stats.subscriberCount || 0),
    hiddenSubscriberCount: Boolean(stats.hiddenSubscriberCount),
    fetchedAt: Date.now()
  };
}

async function youtubeRequest(params) {
  const url = new URL('https://www.googleapis.com/youtube/v3/channels');
  Object.entries({ ...params, key: API_KEY }).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok) {
    const message = body?.error?.message || `YouTube API error (${response.status})`;
    throw new Error(message);
  }
  return body;
}

async function resolveChannelIds() {
  if (resolvedChannels) return resolvedChannels;

  const resolved = [];
  for (const configured of channels) {
    const result = await youtubeRequest({ part: 'id', forHandle: configured.handle });
    const item = result.items?.[0];
    if (item?.id) resolved.push({ ...configured, id: item.id });
    else console.warn(`[yt-tracker] could not resolve ${configured.handle}`);
  }

  if (!resolved.length) throw new Error('No configured YouTube channels could be resolved.');
  resolvedChannels = resolved;
  return resolvedChannels;
}

async function refreshCache() {
  if (!API_KEY) {
    cache.error = 'YOUTUBE_API_KEY is not configured.';
    return;
  }
  if (refreshing) return refreshing;

  refreshing = (async () => {
    const resolved = await resolveChannelIds();
    const ids = resolved.map((channel) => channel.id);

    const details = await youtubeRequest({
      part: 'snippet,statistics',
      id: ids.join(',')
    });

    const byId = new Map((details.items || []).map((item) => [item.id, item]));
    cache.channels = resolved
      .map((configured) => byId.get(configured.id) ? publicChannel(byId.get(configured.id), configured) : null)
      .filter(Boolean);
    cache.updatedAt = Date.now();
    cache.error = null;
    console.log(`[yt-tracker] refreshed ${cache.channels.length}/${channels.length} channels`);
  })();

  try {
    await refreshing;
  } finally {
    refreshing = null;
  }
}

async function ensureFresh() {
  if (Date.now() - cache.updatedAt < REFRESH_MS && cache.channels.length) return;
  await refreshCache();
}

app.disable('x-powered-by');
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: Boolean(cache.channels.length), updatedAt: cache.updatedAt || null, error: cache.error });
});

app.get('/api/channels', async (_req, res) => {
  try {
    await ensureFresh();
    res.set('Cache-Control', 'no-store');
    res.json({
      ok: true,
      updatedAt: cache.updatedAt,
      refreshMs: REFRESH_MS,
      channels: cache.channels
    });
  } catch (error) {
    cache.error = error.message;
    if (cache.channels.length) {
      res.status(200).json({ ok: true, stale: true, updatedAt: cache.updatedAt, refreshMs: REFRESH_MS, error: cache.error, channels: cache.channels });
      return;
    }
    res.status(500).json({ ok: false, error: cache.error });
  }
});

app.get(/^(?!\/api(?:\/|$)).*/, (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'live.html'));
});

app.listen(PORT, () => {
  console.log(`[yt-tracker] listening on http://localhost:${PORT}`);
  refreshCache().catch((error) => {
    cache.error = error.message;
    console.error(`[yt-tracker] initial refresh failed: ${error.message}`);
  });
});
