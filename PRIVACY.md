# Privacy Policy

**Danmaku for Twitch — Chat Overlay** does not collect, store, or transmit any personal data.

## What the extension does

- Reads chat messages from the Twitch page DOM — the same messages your browser already displays in Twitch's chat panel.
- Renders those messages as scrolling overlays on the video player.
- Stores your preferences (font size, rows, region, animation mode, etc.) locally in your browser via `chrome.storage.local`.
- Stores a small local counter and timestamps for successful viewing sessions solely to decide when to show a dismissible feedback request. This information never leaves your browser.
- Stores which localized translation invitations you have dismissed so each language prompt is shown only once. This information never leaves your browser.
- Reads the names of fonts installed on your device so you can select one for chat messages. The list stays inside the extension and is never transmitted.

## What the extension does NOT do

- It does not send chat messages, user data, or anything else to any server.
- It does not include analytics, telemetry, tracking, or third-party scripts.
- It does not make its own network requests.

## Network activity

When rendering an emote (Twitch native, BetterTTV, FrankerFaceZ, or 7TV), the extension uses the image URL already present in the chat DOM. Your browser then loads that image from the original provider — exactly as it does for Twitch's native chat panel. The extension does not proxy, log, or modify these requests.

On live channels the extension reads chat from a hidden popout-chat iframe (`https://www.twitch.tv/popout/{channel}/chat`). This iframe is loaded by your browser as a normal Twitch page; Twitch will see it as an additional popout-chat view. No third-party domains are contacted as a result.

## Permissions used

- `storage` — to persist your preferences locally on your device.
- `fontSettings` — to read the list of installed font names for the font selector. The extension does not change Chrome's global font settings.
- `host_permissions: https://www.twitch.tv/*` — to read the Twitch chat DOM and inject the overlay on Twitch stream pages.

No other websites are accessed by the extension.

## Contact

If you have privacy concerns or questions, open an issue on the project's GitHub repository.
