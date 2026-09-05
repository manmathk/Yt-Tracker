# Yt-Tracker

OBS-ready vertical Top 20 YouTube subscriber tracker, deployable as a static GitHub Pages site.

## GitHub Pages architecture

```text
GitHub Pages
     ↓
9:16 HTML/CSS/JS
     ↓
User enters their own YouTube Data API v3 key
     ↓
Key stays in browser localStorage
     ↓
Browser calls YouTube Data API directly
     ↓
Top 20 fixed channel IDs
     ↓
Dynamic ranking + bounded animation
     ↓
OBS Browser Source
     ↓
YouTube Live
```

No Node.js server is required for the GitHub Pages version.

## GitHub Pages deployment

1. Open the repository **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Select the `main` branch and `/ (root)` folder.
4. Save. GitHub will publish `index.html`.

Open the published site. It redirects to `config.html` for first-time setup.

## API key setup

Open `/config.html`, paste your own YouTube Data API v3 key, and click **Save Key**.

The key is stored in that browser's `localStorage`. It is not stored in this repository. Each browser/user must configure their own key.

For a personal OBS setup, this avoids putting your credential in GitHub. Note that browser localStorage is not a secure secrets vault; anyone with access to that browser profile/device may inspect it.

## Local development

The GitHub Pages build is static, so you can serve the repository with any static HTTP server. For example:

```bash
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080/
```

## OBS

Add the published `/live.html` URL as an OBS **Browser Source**.

Recommended source size:

```text
Width: 1080
Height: 1920
FPS: 30 or 60
```

## Data

The tracked set is the global Top 20 subscriber leaderboard observed on Social Blade on September 5, 2026. The IDs are fixed in `data/channels.json`; subscriber counts are fetched live from YouTube and the 20 channels are dynamically sorted by subscriber count. The list should be reviewed periodically because the external leaderboard changes. citeturn757437search1turn678340search0

YouTube's public `subscriberCount` is rounded to three significant figures, so the smooth number animation between refreshes is a visual interpolation rather than an exact per-second official YouTube count. See Google's `channels.list` documentation for the API behavior.

## Files

- `index.html` — GitHub Pages entrypoint
- `config.html` — browser-side API key setup
- `live.html` — 1080×1920 vertical display
- `live.css` — display and setup styling
- `live.js` — YouTube API client, ranking, and animation
- `data/channels.json` — fixed Top 20 channel IDs
- `public/` and `server.js` — optional local/server version retained for non-Pages deployments

## Sources

- Google YouTube Data API `channels.list`: https://developers.google.com/youtube/v3/docs/channels
- Social Blade global YouTube subscriber list: https://socialblade.com/youtube/lists/top/100/subscribers/all/global
