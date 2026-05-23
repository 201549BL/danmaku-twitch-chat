# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.4.0] - 2026-05-23

### Added
- Reply context on live chat. When a message is a reply, the danmaku is prefixed with a small "↳ @user" plus a truncated snippet of the quoted message, so replies have visible context instead of appearing as a bare line. Controlled by a new "Show reply context" toggle in the settings panel (default on), independent of "Show usernames". VOD chat is unchanged for now.

### Fixed
- Region-resize drag no longer "sticks" when the cursor outpaces the shrinking band. Drag now uses pointer capture, so release is detected reliably even if the cursor ends up over Twitch UI or another element.
- Region overlay (handles, toolbar, row guides) no longer flickers as the cursor crosses the resize handles, and a short hover-off delay keeps the overlay from vanishing when briefly moving onto Twitch's player header controls.

## [1.3.0] - 2026-05-16

### Added
- Optional "Favorites only" sub-toggle under "Show usernames" — when on, only highlighted (favorite) chatters get their username and badges shown; everyone else's message renders without a name prefix.
- "Pause with video (VOD)" setting (default on) — on VOD pages, the overlay freezes while the video is paused and resumes when it plays. Live streams are unaffected, since their chat doesn't pause with the player.

### Changed
- "Pause on hover" now defaults to off for new installs (existing users keep their saved setting).
- Default region height shrunk from 35% to 13% so the three default rows sit nearly flush at the top of the player instead of spread across the upper third.

### Fixed
- Single-emote messages no longer appear horizontally squished. Emote and badge images now use `object-fit: contain` and explicitly clear `max-width`, so they can't be distorted by upstream Twitch styling that constrained the image box.

## [1.2.0] - 2026-05-15

### Added
- Highlight favorite chatters by username or badge role. Favorites get a cyan glow and are prioritized over normal chat when the queue or active-message cap is reached.
- Toggle button in the player controls bar to enable/disable the overlay without opening the settings panel.

## [1.1.0] - 2026-05-14

First Chrome Web Store submission.

### Added
- Dynamic mode (rate and scroll-speed adapt when chat is more active than usual).
- Diagnostics surfacing dropped-message counts and reasons in the toolbar and settings panel.
- Channel-change detection via URL polling so the overlay re-initializes when navigating between streams.

### Changed
- Render loop switched to `requestAnimationFrame`; dropped the 80 ms inter-message delay.
- Toolbar icon now opens the floating in-player settings panel directly; the standalone options page was removed.

### Fixed
- Caret jump in text inputs, scroll-distance calculation, dead toolbar icon, leaked listeners on navigation.

## [1.0.0] - 2026-05-14

Initial import of the danmaku-twitch-chat source.
