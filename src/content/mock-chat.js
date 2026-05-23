const MOCK_USERS = [
  { name: 'Kappa_Lover42', color: '#FF4500' },
  { name: 'NoobMaster69', color: '#1E90FF' },
  { name: 'PogChamp99', color: '#FF69B4' },
  { name: 'StreamSniper', color: '#00FA9A' },
  { name: 'CopiumDealer', color: '#FFD700' },
  { name: 'ChannelPointer', color: '#9147FF' },
  { name: 'EmoteSpammer', color: '#FF6347' },
  { name: 'LurkerXD', color: '#7FFFD4' },
  { name: 'PixelPanda', color: '#DA70D6' },
  { name: 'Subwooferr', color: '#ADFF2F' },
  { name: 'GachiGuy', color: '#FF1493' },
  { name: 'NinetyNineCent', color: '#00CED1' },
];

const MOCK_MESSAGES = [
  'POGGERS that play was insane',
  'KEKW',
  'no way that happened',
  'GG WP',
  'streamer is cracked',
  'first time viewer, this is great!',
  'LULW',
  'OMEGALUL',
  'why am I even lurking this',
  'chat is so fast right now',
  'PogU PogU PogU',
  'has anyone seen the new patch notes?',
  'modCheck where is the streamer',
  'monkaS that was close',
  'TriHard 7',
  'EZ Clap',
  'FeelsBadMan I missed the start',
  'Pepega',
  'jebaited again smh',
  'this is the longest message I can possibly type to see how truncation behaves in the overlay rendering layer',
  'D:',
  'hold up wait a minute',
  'PauseChamp',
  'Sadge',
  'widepeepoHappy',
  'lets gooo',
  'first',
  'second',
  'why is everyone spamming KEKW',
  'tactical nuke incoming',
];

class MockChatGenerator {
  constructor(onMessage) {
    this.onMessage = onMessage;
    this.intervalId = null;
    this.counter = 0;
  }

  generate() {
    const user = MOCK_USERS[Math.floor(Math.random() * MOCK_USERS.length)];
    const text = MOCK_MESSAGES[Math.floor(Math.random() * MOCK_MESSAGES.length)];
    let replyTo = null;
    if (Math.random() < 0.15) {
      const target = MOCK_USERS[Math.floor(Math.random() * MOCK_USERS.length)];
      const quote = MOCK_MESSAGES[Math.floor(Math.random() * MOCK_MESSAGES.length)];
      if (target.name !== user.name) {
        replyTo = { username: target.name, quote };
      }
    }
    return {
      id: `mock_${Date.now()}_${this.counter++}`,
      username: user.name,
      displayName: user.name,
      text,
      color: user.color,
      emotes: [],
      replyTo,
      timestamp: Date.now(),
      rawElement: null,
    };
  }

  emitOne() {
    if (this.onMessage) this.onMessage(this.generate());
  }

  emitSpam(count = 14) {
    for (let i = 0; i < count; i++) {
      setTimeout(() => this.emitOne(), i * 80);
    }
  }

  emitHighlightTest() {
    if (!this.onMessage) return 0;
    const roles = DANMAKU_CONSTANTS.HIGHLIGHT_BADGE_ROLES || [];
    const enabledRoles = new Set(danmakuSettings.get('highlightBadges') || []);
    const usersRaw = danmakuSettings.get('highlightUsers') || '';
    const usernames = String(usersRaw)
      .split(/[,\s]+/)
      .map((s) => s.trim().replace(/^@/, ''))
      .filter(Boolean)
      .slice(0, 3);

    const out = [];
    const now = Date.now();
    out.push({
      id: `mock_hl_${now}_baseline`,
      username: 'RegularChatter',
      displayName: 'RegularChatter',
      text: 'normal message (baseline)',
      color: '#bbbbbb',
      badges: [],
      timestamp: now,
      rawElement: null,
    });
    for (const role of roles) {
      if (!enabledRoles.has(role.key)) continue;
      out.push({
        id: `mock_hl_${now}_${role.key}`,
        username: `Test_${role.key}`,
        displayName: `Test_${role.key}`,
        text: `${role.label} badge highlight`,
        color: '#9147FF',
        badges: [{ src: '', alt: role.match }],
        timestamp: now,
        rawElement: null,
      });
    }
    for (const name of usernames) {
      out.push({
        id: `mock_hl_${now}_user_${name}`,
        username: name,
        displayName: name,
        text: `username highlight (@${name})`,
        color: '#FF69B4',
        badges: [],
        timestamp: now,
        rawElement: null,
      });
    }

    if (out.length <= 1) return 0;
    for (let i = 0; i < out.length; i++) {
      setTimeout(() => this.onMessage && this.onMessage(out[i]), i * 400);
    }
    return out.length;
  }

  start(intervalMs = 1200) {
    this.stop();
    this.intervalId = setInterval(() => this.emitOne(), intervalMs);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  isRunning() {
    return !!this.intervalId;
  }

  destroy() {
    this.stop();
    this.onMessage = null;
  }
}
