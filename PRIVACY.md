# Privacy Policy

**Danmaku Twitch Chat** does not collect, store, or transmit any personal data.

## What the extension does

- Reads chat messages from the Twitch page DOM — the same messages your browser already displays in Twitch's chat panel.
- Renders those messages as scrolling overlays on the video player.
- Stores your preferences (font size, rows, region, animation mode, etc.) locally in your browser via `chrome.storage.local`.

## What the extension does NOT do

- It does not send chat messages, user data, or anything else to any server.
- It does not include analytics, telemetry, tracking, or third-party scripts.
- It does not make its own network requests.

## Network activity

When rendering an emote (Twitch native, BetterTTV, FrankerFaceZ, or 7TV), the extension uses the image URL already present in the chat DOM. Your browser then loads that image from the original provider — exactly as it does for Twitch's native chat panel. The extension does not proxy, log, or modify these requests.

## Permissions used

- `storage` — to persist your preferences locally on your device.
- `host_permissions: https://www.twitch.tv/*` — to read the Twitch chat DOM and inject the overlay on Twitch stream pages.

No other websites are accessed by the extension.

## Contact

If you have privacy concerns or questions, open an issue on the project's GitHub repository.
