const fields = [
  'enabled',
  'fullscreenOnly',
  'showUsernames',
  'fontSize',
  'rows',
  'regionTop',
  'regionHeight',
  'opacity',
  'duration',
  'maxMessagesPerSecond',
  'maxMessageLength',
];

const checkboxFields = ['enabled', 'fullscreenOnly', 'showUsernames'];

async function loadSettings() {
  const result = await chrome.storage.local.get('danmakuSettings');
  const settings = { ...DANMAKU_CONSTANTS.DEFAULTS, ...result.danmakuSettings };

  for (const field of fields) {
    const el = document.getElementById(field);
    if (!el) continue;

    if (checkboxFields.includes(field)) {
      el.checked = settings[field];
    } else {
      el.value = settings[field];
    }
  }

  updateOpacityDisplay();
}

function getSettings() {
  const settings = {};

  for (const field of fields) {
    const el = document.getElementById(field);
    if (!el) continue;

    if (checkboxFields.includes(field)) {
      settings[field] = el.checked;
    } else if (field === 'opacity') {
      settings[field] = parseFloat(el.value);
    } else {
      settings[field] = parseInt(el.value, 10);
    }
  }

  return settings;
}

async function saveSettings() {
  const settings = getSettings();
  await chrome.storage.local.set({ danmakuSettings: settings });
  showStatus('Settings saved!');
}

async function resetSettings() {
  await chrome.storage.local.set({ danmakuSettings: DANMAKU_CONSTANTS.DEFAULTS });
  await loadSettings();
  showStatus('Settings reset to defaults');
}

function showStatus(message) {
  const status = document.getElementById('status');
  status.textContent = message;
  setTimeout(() => {
    status.textContent = '';
  }, 2000);
}

function updateOpacityDisplay() {
  const opacity = document.getElementById('opacity');
  const display = document.getElementById('opacityValue');
  display.textContent = Math.round(opacity.value * 100) + '%';
}

document.addEventListener('DOMContentLoaded', () => {
  loadSettings();

  document.getElementById('save').addEventListener('click', saveSettings);
  document.getElementById('reset').addEventListener('click', resetSettings);
  document.getElementById('opacity').addEventListener('input', updateOpacityDisplay);
});
