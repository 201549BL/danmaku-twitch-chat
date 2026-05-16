# Danmaku Twitch Chat — agent context

A Chrome MV3 extension that renders Twitch chat as scrolling overlays on the video player. No build step — files in `src/` are loaded directly via the `content_scripts` array in `manifest.json`.

## File layout

- `manifest.json` — MV3 manifest. `version` is the single source of truth for the extension version.
- `src/shared/constants.js` — `DANMAKU_CONSTANTS` (defaults, limits, selectors, highlight badge roles).
- `src/shared/settings.js` — `DanmakuSettings`: persists to `chrome.storage.local`, syncs across contexts.
- `src/content/renderer.js` — lane allocation, animation modes (`scroll` / `reverse` / `drift` / `popFade` / `slideUp`), dynamic-mode pressure smoothing, highlight/favorite logic.
- `src/content/chat-observer.js` + `twitch-detector.js` — DOM scraping of live chat and VOD chat. Selectors live in `DANMAKU_CONSTANTS.SELECTORS`.
- `src/content/settings-panel.js` + `.css` — in-player floating settings UI.
- `src/content/overlay.js`, `region-editor.js`, `player-toggle.js` — overlay container, drag-to-set region, toolbar.
- `src/background/service-worker.js` — minimal; just wires the toolbar action.
- `assets/` — extension icons (referenced by `manifest.json`).

## Conventions

- No bundler, no imports. Globals are registered in file load order via `content_scripts.js` in `manifest.json`. If you add a new file, append it to that list.
- New user-facing settings go in `DANMAKU_CONSTANTS.DEFAULTS` (with a clamp in `DanmakuSettings.clampValue` if numeric), and get a row in the settings panel template.
- Always add a one-line entry under `## [Unreleased]` in `CHANGELOG.md` for any user-visible change.

## Release flow

The repo is set up so an agent can do everything up to (but not including) the Chrome Web Store upload.

### Agent-handleable

1. Decide the bump from `[Unreleased]` content: feature → minor, fix-only → patch, breaking → major.
2. Run the release script:
   ```
   ./scripts/release.sh <X.Y.Z>
   ```
   This bumps `manifest.json` and moves `[Unreleased]` → `[X.Y.Z] - <today>` in `CHANGELOG.md`. The working tree must be clean before running.
3. Commit and tag (ask the user for approval first — push is destructive-ish):
   ```
   git commit -am "chore: release <X.Y.Z>"
   git tag v<X.Y.Z>
   git push && git push --tags
   ```
4. Build the Web Store zip from the tag:
   ```
   mkdir -p dist
   git archive --format=zip --output=dist/danmaku-<X.Y.Z>.zip \
     v<X.Y.Z> manifest.json src assets
   ```
5. Draft GitHub Release notes from the `[<X.Y.Z>]` section of `CHANGELOG.md` (use `gh release create v<X.Y.Z> --notes-file <(...)`).

### User must do manually

- Upload `dist/danmaku-<X.Y.Z>.zip` at the Chrome Web Store dashboard (Package → Upload new package). Requires dashboard login.
- Paste the `[<X.Y.Z>]` CHANGELOG section into the "What's new in this version" field.
- Click "Submit for review".

### Notes

- If `manifest.json`'s `permissions` or `host_permissions` change between releases, expect a longer review and a re-permission prompt for existing users.
- The Web Store rejects packages whose `version` is not strictly greater than the published one — never reuse a version number.
- `dist/` is covered by `*.zip` in `.gitignore`; don't commit built zips.

## Testing

There is no automated test suite. Before releasing, smoke-test in a real browser on:

- A live stream (chat panel visible).
- A VOD (different DOM path; see `VOD_CHAT_*` selectors).
- Theatre mode and fullscreen.
- Channel switch (URL change without full reload).
- The settings panel: every toggle and slider, the "Test highlights" / "Test dynamic" buttons.
