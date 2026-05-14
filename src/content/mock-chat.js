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
    return {
      id: `mock_${Date.now()}_${this.counter++}`,
      username: user.name,
      displayName: user.name,
      text,
      color: user.color,
      emotes: [],
      timestamp: Date.now(),
      rawElement: null,
    };
  }

  emitOne() {
    if (this.onMessage) this.onMessage(this.generate());
  }

  emitSpam(count = 14) {
    // Public Twitch CDN URL for PogChamp (legacy v1 path); used only as a
    // recognizable image so the renderer can hash + aggregate it.
    const src = 'https://static-cdn.jtvnw.net/emoticons/v2/305954156/static/light/2.0';
    const alt = 'PogChamp';
    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        if (!this.onMessage) return;
        const user = MOCK_USERS[Math.floor(Math.random() * MOCK_USERS.length)];
        this.onMessage({
          id: `mock_spam_${Date.now()}_${this.counter++}`,
          username: user.name,
          displayName: user.name,
          text: alt,
          segments: [{ type: 'image', src, alt }],
          badges: [],
          color: user.color,
          timestamp: Date.now(),
          rawElement: null,
        });
      }, i * 80);
    }
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
