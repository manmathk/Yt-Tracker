# Yt-Tracker

OBS-ready vertical Top 20 YouTube subscriber tracker.

## Architecture

```text
YouTube Data API v3
        ↓
20 fixed YouTube channel handles
        ↓
Node/Express cache
        ↓
9:16 HTML/CSS/JS
        ↓
OBS Browser Source
        ↓
YouTube Live
```

The public leaderboard is designed for **1080×1920 (9:16)** capture. The browser polls the local API frequently, while the backend refreshes YouTube data on a longer cache interval to avoid unnecessary API calls.

## Data source

The project uses the official YouTube Data API v3 `channels.list` endpoint with `snippet,statistics`. YouTube's public `subscriberCount` is rounded down to three significant figures, so the smooth per-second number shown between API refreshes is explicitly an **estimate/interpolation**, not an exact YouTube count.

The initial 20-channel set follows the global subscriber leaderboard observed on Social Blade on September 5, 2026. The set is fixed; the app dynamically re-ranks those 20 channels using the latest YouTube API response. The set should be reviewed periodically because the external ranking can change.

## Run locally

1. Enable **YouTube Data API v3** in Google Cloud and create an API key.
2. Copy `.env.example` to `.env` and set `YOUTUBE_API_KEY`.
3. Install dependencies:

```bash
npm install
```

4. Start the server:

```bash
npm start
```

5. Open:

```text
http://localhost:3000/live.html
```

## OBS

Add an OBS **Browser Source** using the deployed `/live.html` URL.

Recommended size:

```text
Width: 1080
Height: 1920
FPS: 30 or 60
```

## Deployment

`render.yaml` is included for a simple Render web-service deployment. Set the `YOUTUBE_API_KEY` environment variable in Render; never commit the real key to Git.

## Configuration

Edit `data/channels.json` to change the 20 tracked channels. Each entry uses a YouTube handle, and the backend resolves the handles to channel IDs once per server process before requesting all channel statistics in a single batched API call.

## Routes

- `/live.html` — vertical OBS display
- `/api/channels` — cached channel data
- `/api/health` — health/status endpoint

## Sources

- Google YouTube Data API: https://developers.google.com/youtube/v3/docs/channels
- Social Blade global YouTube subscriber list: https://socialblade.com/youtube/lists/top/100/subscribers/all/global
