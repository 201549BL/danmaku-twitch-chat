const DANMAKU_I18N_SOURCE_KEYS = new Map(Object.entries({
  'Adapt to busy chat': 'settingsAdaptBusyChat',
  'Adapts message rate and speed when chat gets busy': 'settingsAdaptBusyChatTitle',
  'Advanced': 'settingsAdvanced',
  'All chatters': 'settingsAllChatters',
  'All chatters automatically switches to favorites when chat gets busy.': 'settingsBusyEffectsHint',
  'Animated usernames': 'settingsAnimatedUsernames',
  'Appearance': 'settingsAppearance',
  'Badge roles': 'settingsBadgeRoles',
  'Bottom': 'settingsBottom',
  'Burst ×10': 'settingsBurstTen',
  'Choose the people and roles you want to prioritize when chat gets busy.': 'settingsFavoriteHint',
  'Clear': 'settingsClear',
  'Close settings': 'settingsClose',
  'Color pairing': 'settingsColorPairing',
  'Continuous mock messages': 'settingsContinuousMock',
  'Danmaku': 'extensionShortName',
  'Dismiss feedback request': 'settingsDismissFeedback',
  'Dismiss translation request': 'translationHelpDismiss',
  'Drift': 'settingsDrift',
  'Effect': 'settingsEffect',
  'Effects': 'settingsEffects',
  'Enabled': 'settingsEnabled',
  'Favorite chatters': 'settingsFavoriteChatters',
  'Favorites only': 'settingsFavoritesOnly',
  'Fine-tune placement': 'settingsFineTunePlacement',
  'Font': 'settingsFont',
  'Freeze the overlay when a VOD is paused': 'settingsPauseVodTitle',
  'Full': 'settingsFull',
  'Fullscreen only': 'settingsFullscreenOnly',
  'Get help, report a problem, or share an honest rating.': 'settingsHelpHint',
  'Height': 'settingsHeight',
  'Help & feedback': 'settingsHelpFeedback',
  'Hide usernames': 'settingsHideUsernames',
  'Help improve this translation': 'translationHelpTitle',
  'This translation is new. If anything sounds incorrect or unnatural, please tell us.': 'translationHelpBody',
  'Highlight mentions of': 'settingsHighlightMentions',
  'How is Danmaku working for you?': 'settingsFeedbackQuestion',
  'Include the replied-to user and a short quote': 'settingsReplyContextTitle',
  'Loading installed fonts…': 'settingsFontsLoading',
  'Mentions': 'settingsMentions',
  'Message content': 'settingsMessageContent',
  'Message length': 'settingsMessageLength',
  'Message rows': 'settingsMessageRows',
  'Messages per second': 'settingsMessagesPerSecond',
  'Middle': 'settingsMiddle',
  'Motion': 'settingsMotion',
  'New': 'commonNew',
  'No messages dropped recently.': 'settingsNoDropsRecently',
  'On-screen time': 'settingsOnScreenTime',
  'Opacity': 'settingsOpacity',
  'Overlay': 'settingsOverlay',
  'Overlay placement presets': 'settingsPlacementPresets',
  'Pause on hover': 'settingsPauseHover',
  'Pause with VOD': 'settingsPauseVod',
  'Personalization options': 'settingsPersonalizationOptions',
  'Placement': 'settingsPlacement',
  'Pop & fade': 'settingsPopFade',
  'Preview': 'commonPreview',
  'Privacy policy': 'settingsPrivacyPolicy',
  'Rate extension': 'settingsRateExtension',
  'Rate the extension or send feedback.': 'settingsFeedbackPrompt',
  'Reading fonts installed on this device…': 'settingsFontsReading',
  'Report a problem': 'settingsReportProblem',
  'Reset to defaults': 'settingsResetDefaults',
  'Restore defaults': 'settingsRestoreDefaults',
  'Reverse': 'settingsReverse',
  'Scroll': 'settingsScroll',
  'Send feedback': 'settingsSendFeedback',
  'Send mock': 'settingsSendMock',
  'Show badges': 'settingsShowBadges',
  'Show effects for': 'settingsShowEffectsFor',
  'Show for everyone': 'settingsShowEveryone',
  'Show for favorite chatters': 'settingsShowFavorites',
  'Show reply context': 'settingsShowReplyContext',
  'Slide up': 'settingsSlideUp',
  'Stress test': 'settingsStressTest',
  'Style': 'settingsStyle',
  'Suggest a correction': 'translationHelpAction',
  'Test & diagnostics': 'settingsTestDiagnostics',
  'Test favorites': 'settingsTestFavorites',
  'Text size': 'settingsTextSize',
  'Top': 'settingsTop',
  'Top edge': 'settingsTopEdge',
  'Travel time': 'settingsTravelTime',
  'Usage guide': 'settingsUsageGuide',
  'Username appearance': 'settingsUsernameAppearance',
  'Username effect preview': 'settingsUsernameEffectPreview',
  'Usernames': 'settingsUsernames',
  'Your Twitch username': 'settingsYourTwitchUsername',
  'friend1, friend2': 'settingsFavoritePlaceholder',
  "What's new": 'whatsNew',
  'See the latest improvements.': 'whatsNewSummary',
  "See what's new": 'whatsNewShow',
  'View full changelog': 'whatsNewFullChangelog',
  'Dismiss release notes': 'whatsNewDismiss',
  'Drag to move region': 'regionDrag',
  'Fewer rows': 'regionFewerRows',
  'Larger text': 'regionLargerText',
  'Messages dropped in the last 10 seconds. Open settings for details.': 'regionDropsTitle',
  'More rows': 'regionMoreRows',
  'Open danmaku settings': 'regionOpenSettings',
  'Rows': 'regionRows',
  'Size': 'regionSize',
  'Smaller text': 'regionSmallerText',
  'Danmaku: ON': 'playerOn',
  'Danmaku: OFF': 'playerOff',
  'Right-click for settings': 'playerSettingsHint',
  'Toggle Danmaku Chat Overlay': 'playerToggleLabel',
  'Click the Danmaku player button whenever you want to hide or restore the overlay.': 'welcomeStepTwoBody',
  'Danmaku for Twitch': 'extensionShortName',
  'Follow chat on the video': 'welcomeStepTwoTitle',
  'From Chrome': 'welcomeFromChrome',
  'From the Twitch player': 'welcomeFromPlayer',
  'Keep watching. Keep up with chat.': 'welcomeTitle',
  'Make it yours': 'welcomeStepThreeTitle',
  'No account, ads, analytics, or remote data collection. Your settings stay on this device.': 'welcomePrivacy',
  'On a Twitch tab, click the Danmaku extension icon. If it is hidden, open Extensions and pin it first.': 'welcomeChromeBody',
  'One quick refresh': 'welcomeRefreshTitle',
  'Open Twitch': 'welcomeOpenTwitch',
  'Open a Twitch stream': 'welcomeStepOneTitle',
  'Open settings anytime': 'welcomeSettingsTitle',
  'Open settings to adjust placement, rows, text size, motion, and favorites.': 'welcomeStepThreeBody',
  'Quick tip': 'welcomeQuickTip',
  'Right-click the Danmaku button in the player controls. A normal click toggles the overlay.': 'welcomePlayerBody',
  'The overlay starts automatically when chat is available.': 'welcomeStepOneBody',
  'This Twitch tab was already open when Danmaku started. Refresh it once to activate the overlay.': 'welcomeRefreshBody',
  'Twitch chat now appears directly over the video as smooth, readable messages—including in theater and fullscreen modes.': 'welcomeIntro',
  'View usage guide': 'welcomeViewGuide',
  'Welcome to Danmaku for Twitch': 'welcomeDocumentTitle',
  'Classic right-to-left scroll across the player.': 'animScrollDescription',
  'Same as scroll but left-to-right.': 'animReverseDescription',
  'Right-to-left scroll with a slow vertical wobble.': 'animDriftDescription',
  'Messages pop in at a random spot, hold briefly, then fade out.': 'animPopFadeDescription',
  'Messages slide in from below, hold, then drift up and fade.': 'animSlideUpDescription',
  'Off': 'effectStyleOff',
  "Use the chatter's original Twitch color without animation.": 'effectStyleOffDescription',
  'Fixed': 'effectStyleFixed',
  'Use the same effect and color pairing for every selected chatter.': 'effectStyleFixedDescription',
  'Personalized': 'effectStylePersonalized',
  'Give each chatter a consistent look based on their username.': 'effectStylePersonalizedDescription',
  'Flow': 'effectFlow',
  'A smooth color sweep across the username.': 'effectFlowDescription',
  'Ember': 'effectEmber',
  'Rising sparks and organic texture inside the username.': 'effectEmberDescription',
  'Glitch': 'effectGlitch',
  'Brief displaced color slices over the original username.': 'effectGlitchDescription',
  'Same hue': 'paletteSameHue',
  "Two lightness levels of the chatter's original hue.": 'paletteSameHueDescription',
  'Nearby hues': 'paletteNearbyHues',
  'The original color plus a nearby hue for gentle contrast.': 'paletteNearbyHuesDescription',
  'Opposite hues': 'paletteOppositeHues',
  'The original color plus a softened opposite hue for bold contrast.': 'paletteOppositeHuesDescription',
  'Broadcaster': 'roleBroadcaster',
  'Mod': 'roleModerator',
  'VIP': 'roleVip',
  'Sub': 'roleSubscriber',
  'Founder': 'roleFounder',
  'Verified': 'roleVerified',
  'Staff': 'roleStaff',
  'Artist': 'roleArtist',
  'Saved': 'statusSaved',
  'Default': 'commonDefault',
  'Installed fonts are unavailable; using Default.': 'statusFontsUnavailable',
  'Fonts are read from this device and never uploaded.': 'statusFontsPrivate',
  'Keep at least one option': 'statusKeepOneOption',
  'Open a stream to test dynamic mode': 'statusOpenStreamDynamic',
  'Open a stream to test highlights': 'statusOpenStreamHighlights',
  'Enable a badge role or add a username first': 'statusEnableFavoriteFirst',
  'Personalization restored': 'statusPersonalizationRestored',
  'No stream attached.': 'diagnosticsNoStream',
  'No messages dropped in the last 10 s.': 'diagnosticsNoDrops',
  'Rate limit': 'diagnosticsRateLimit',
  'Chat is arriving faster than the renderer drains it. Raise "Max msgs/sec".': 'diagnosticsRateLimitHint',
  'Lane saturation': 'diagnosticsLaneSaturation',
  'All rows are busy. Add rows or lower "Duration".': 'diagnosticsLaneSaturationHint',
  'Active message cap': 'diagnosticsActiveCap',
  'Internal ceiling reached; usually only on wide players with long durations.': 'diagnosticsActiveCapHint',
}));

const DANMAKU_I18N = {
  getLocale() {
    try {
      return chrome.i18n.getUILanguage() || 'en';
    } catch (error) {
      return 'en';
    }
  },

  t(key, fallback = '', substitutions) {
    try {
      const translated = chrome.i18n.getMessage(key, substitutions);
      return translated || fallback;
    } catch (error) {
      return fallback;
    }
  },

  text(source) {
    if (!source) return source;
    const key = DANMAKU_I18N_SOURCE_KEYS.get(source);
    return key ? this.t(key, source) : source;
  },

  localizeTree(root) {
    if (!root) return;
    const doc = root.ownerDocument || root;
    const walker = doc.createTreeWalker(root, 4);
    let node = walker.nextNode();
    while (node) {
      const source = node.nodeValue.trim();
      if (source) {
        const translated = this.text(source);
        if (translated !== source) {
          node.nodeValue = node.nodeValue.replace(source, translated);
        }
      }
      node = walker.nextNode();
    }

    const elements = [];
    if (root.nodeType === 1) elements.push(root);
    if (root.querySelectorAll) elements.push(...root.querySelectorAll('*'));
    for (const element of elements) {
      for (const attribute of ['title', 'aria-label', 'placeholder']) {
        const source = element.getAttribute?.(attribute);
        if (!source) continue;
        const translated = this.text(source);
        if (translated !== source) element.setAttribute(attribute, translated);
      }
    }
  },

  localizeDocument(doc = document) {
    if (doc.documentElement) {
      doc.documentElement.lang = this.getLocale().replace('_', '-');
    }
    this.localizeTree(doc.documentElement || doc);
    const title = this.t('welcomeDocumentTitle', doc.title);
    if (title) doc.title = title;
  },
};
