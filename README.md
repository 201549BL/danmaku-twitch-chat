# Danmaku Twitch Chat

A Chrome extension that displays Twitch chat as scrolling overlays on the video player — danmaku-style.

## Features

- **Five animation modes**: Scroll, Reverse, Drift (slow vertical wobble), Pop & fade, Slide up
- **Configurable region** with on-player drag handles — define exactly where chat appears; scales correctly across windowed, theater, and fullscreen
- **In-region toolbar** (hover the chat area on the player) for quick rows / font-size adjustments and a settings shortcut
- **Live preview** with mock chat messages
- **Emote support**: Twitch native, BetterTTV, FrankerFaceZ, and 7TV — rendered inline as images
- **Fullscreen-ready**: overlay reparents into the fullscreen element automatically
- **Auto-save** of all settings; nothing leaves your device

## Installation

### From the Chrome Web Store

*(once published — link will go here)*

### From source

1. Clone or download this repository.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked**.
5. Select the project folder.

## Usage

1. Navigate to any Twitch channel (e.g. `twitch.tv/somechannel`).
2. Chat messages appear as scrolling overlays on the video.
3. **Hover the chat region** on the player to reveal the toolbar (rows ±, size ±, settings gear) and drag handles for resizing or moving the region.
4. Click the gear icon to open the full settings panel. Clicking the extension's toolbar icon also opens the panel on the active Twitch tab.

## Settings

All changes apply live and auto-save.

| Setting | Description |
|---|---|
| Enable overlay | Master on/off |
| Fullscreen only | Hide overlay outside fullscreen |
| Show usernames | Show "username:" prefix on each message |
| Font size | Reference pixel size at a 720p player; scales with the player |
| Rows | Number of message lanes |
| Region top / height | Where the chat band sits on the player, as % |
| Opacity | Message transparency |
| Animation mode | Scroll / Reverse / Drift / Pop & fade / Slide up |
| Duration | Scroll-style modes traversal time (seconds) |
| Lifetime | Stationary modes (pop & fade, slide up) on-screen duration |
| Max msgs / sec | Rate limit for new messages |
| Max msg length | Truncate long messages |

## Privacy

See [`PRIVACY.md`](PRIVACY.md). Short version: the extension does not collect, transmit, or store any user data on remote servers. Settings live in `chrome.storage.local`.

## Known limitations

- Relies on Twitch's chat DOM structure. If Twitch ships major DOM changes the extension may need a selector update.
- Badges (subscriber, moderator, etc.) are not displayed.

## Development

Vanilla JavaScript with no build step. Edit files in `src/` and click "Reload" on the extension in `chrome://extensions`.

### Project structure

```
danmaku-twitch-chat/
├── manifest.json
├── PRIVACY.md
├── src/
│   ├── content/             # injected on Twitch pages
│   │   ├── index.js
│   │   ├── twitch-detector.js
│   │   ├── chat-observer.js
│   │   ├── renderer.js
│   │   ├── overlay.js
│   │   ├── region-editor.js
│   │   ├── mock-chat.js
│   │   ├── settings-panel.js
│   │   ├── overlay.css
│   │   └── settings-panel.css
│   ├── background/
│   │   └── service-worker.js
│   └── shared/
│       ├── constants.js
│       └── settings.js
└── assets/
    ├── icon.svg             # source
    ├── icon-16.png
    ├── icon-48.png
    └── icon-128.png
```

## Publishing to the Chrome Web Store

### Build the upload zip

Include only the files the extension needs at runtime:

```bash
zip -r danmaku-twitch-chat.zip manifest.json src/ assets/ \
  --exclude '*.DS_Store' --exclude 'assets/icon.svg'
```

(The SVG source is fine to ship but isn't referenced by Chrome — excluding keeps the zip smaller.)

Exclude these in any case: `.git/`, `.claude/`, `.gitignore`, `README.md`, `PRIVACY.md`, `*.zip`.

### Regenerating icons

If you edit `assets/icon.svg`, regenerate the PNGs:

```bash
npx -y svgexport assets/icon.svg assets/icon-16.png  16:16
npx -y svgexport assets/icon.svg assets/icon-48.png  48:48
npx -y svgexport assets/icon.svg assets/icon-128.png 128:128
```

### Store listing checklist

These are filled in on the Chrome Web Store dashboard, not in the zip:

- **128×128 store icon** — use `assets/icon-128.png`
- **Screenshots** — at least one 1280×800 or 640×400 PNG/JPG showing the overlay over a live Twitch player
- **Short description** — up to 132 characters
- **Detailed description** — feature list and usage; the README's Features section is a fine starting point
- **Single purpose** — "Display Twitch chat as scrolling overlays on the video player"
- **Permissions justification**:
  - `storage` — saves user preferences locally
  - `host_permissions: https://www.twitch.tv/*` — required to read the chat DOM and inject the overlay on Twitch stream pages
- **Privacy practices** — declare "Does not collect user data" (matches `PRIVACY.md`)

### Submission

1. Sign up at the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) (one-time $5 fee).
2. Click **New item** → upload the zip.
3. Fill out the listing fields above.
4. Submit for review. First review typically takes 1–3 days.

## License

MIT
