# Danmaku Twitch Chat

A Chrome extension that displays Twitch chat as scrolling overlays on the video player — danmaku-style.

## Features

- **Five animation modes**: Scroll, Reverse, Drift (slow vertical wobble), Pop & fade, Slide up
- **Dynamic mode**: automatically increases message rate and scroll speed when chat activity spikes
- **Configurable region** with on-player drag handles — define exactly where chat appears; scales correctly across windowed, theater, and fullscreen
- **In-region toolbar** (hover the chat area on the player) for quick rows / font-size adjustments and a settings shortcut
- **@mention highlighting**: messages mentioning your username are visually distinguished
- **Pause on hover**: animations freeze when you mouse over the chat region
- **Live preview** with mock chat messages and a diagnostics panel showing drop statistics
- **Emote and badge support**: Twitch native, BetterTTV, FrankerFaceZ, and 7TV emotes rendered inline; optional subscriber/moderator badges
- **Player controls toggle**: quick enable/disable button in the Twitch player controls bar
- **Fullscreen-ready**: overlay reparents into the fullscreen element automatically
- **Auto-save** of all settings; nothing leaves your device

## Installation

### Chrome Web Store

*(once published — link will go here)*

## Usage

1. Navigate to any Twitch channel (e.g. `twitch.tv/somechannel`).
2. Chat messages appear as scrolling overlays on the video.
3. **Use the toggle button** in the player controls (bottom-right) to quickly enable/disable the overlay. Right-click or shift-click for settings.
4. **Hover the chat region** on the player to reveal the toolbar (rows ±, size ±, settings gear) and drag handles for resizing or moving the region.
5. Click the gear icon to open the full settings panel. Clicking the extension's toolbar icon also opens the panel on the active Twitch tab.

## Settings

All changes apply live and auto-save.

| Setting | Description |
|---|---|
| Enable overlay | Master on/off |
| Fullscreen only | Hide overlay outside fullscreen |
| Show usernames | Show "username:" prefix on each message |
| Show badges | Display subscriber, moderator, etc. badges |
| Pause on hover | Freeze animations when hovering the chat region |
| Dynamic mode | Auto-boost rate and speed when chat activity spikes |
| Highlight @mentions | Your Twitch username; messages mentioning you are highlighted |
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
- On live streams, chat is read from a hidden popout iframe to avoid interfering with the main chat panel. If Twitch changes the popout URL structure, the extension falls back to the main page chat.

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
│   │   ├── player-toggle.js
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

## License

MIT
