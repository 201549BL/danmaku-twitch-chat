# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.5.0] - 2026-08-23

### Added
- Added three distinct color-adaptive username effects—Flow, Ember, and Glitch—with selectable same-hue, nearby-hue, and opposite-hue pairings.
- Added Personalized mode, which deterministically assigns each username a consistent weighted effect and color pairing.
- Personalized mode can be narrowed to preferred effects and color pairings while retaining the simple all-options default.
- Added unseen-option tracking so future catalog additions can display a New badge without confusing deliberately excluded options with new ones.
- Added favorite-only and everyone scopes for username effects, with favorite-only as the default.

### Changed
- Everyone-scope username effects now fall back to favorites when dynamic chat pressure is high, reducing rendering load during busy chat.
- Simplified username-effect settings into Off, Personalized, and Fixed choices, with clearer checkbox-based personalization options and fixed controls shown only when relevant.
- Added a live multi-username preview to the effect settings and placed Personalized as the rightmost mode in the progression.
- Effect and color options now open a viewport-clamped floating preview on hover or keyboard focus, keeping comparisons visible while browsing larger catalogs.
- Settings disclosures now use full-width headers with prominent chevron controls and distinct surfaced backgrounds for open groups and nested options.
- Appearance, Placement, and Motion settings are now collapsed groups, reducing the panel's initial length while keeping Overlay controls immediately available.
- Personalized choices are now snapshotted per installation, so newly shipped effects remain opt-in for existing users.
- Personalized assignment now uses weighted rendezvous selection, minimizing chatter appearance changes when users add or remove an option.
- Removed the username entrance shimmer and enhanced-favorite glow for a calmer, more consistent treatment.
- Increased username-effect highlight contrast and movement speed so favorite treatments remain clearly visible without glow.
- Consolidated overlapping username effects into Off, Flow, Ember, and Glitch, with nearby hues as the default color pairing.

### Fixed
- Packaged username textures now resolve through the extension runtime URL instead of disappearing after content-script injection on Twitch.
- Palette derivation now handles Twitch's CSS `rgb()` and `rgba()` username colors instead of giving live chatters the same fallback accent.
- Busy-chat fallback now stops effects on already-visible ordinary usernames immediately while leaving favorite effects active.
- Username effects now keep the original chatter color as their minimum brightness and use a softer shadow, preventing dark textures and heavy outlines from reducing readability.
- Username effects now use a very dark, subtly color-adaptive SVG morphology border and an even darker lower edge, separating the bright animated fill from video backgrounds.
- Enhanced favorite and role username effects use a flat outline without a hard lower shadow.

## [1.4.2] - 2026-08-21

### Changed
- Reworked the settings panel around a smaller set of everyday controls, with placement tuning, message content, favorites, advanced options, and diagnostics grouped into clear disclosures.
- Replaced the ambiguous username toggles with one choice: show names for everyone, favorite chatters only, or nobody.
- Dynamic mode now reacts to sudden bursts, sustained fast chat, and queue backlog. At peak pressure it can process up to four times the configured message rate and substantially shorten message travel or display time.

### Fixed
- Messages now wait in the queue when all lanes are briefly occupied instead of being removed and immediately dropped.
- Favorite chatter configuration now clearly identifies usernames and badge roles as the people to prioritize during busy chat.

## [1.4.1] - 2026-08-16

### Fixed
- VOD chat animations no longer remain frozen after Twitch replaces its internal video element. The pause watcher now follows the current video and resynchronizes playback state automatically.

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
