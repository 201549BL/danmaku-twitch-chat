const checkboxFields = ['enabled', 'fullscreenOnly', 'showUsernames'];
const floatFields = ['opacity'];
const intFields = [
  'fontSize',
  'rows',
  'regionTop',
  'regionHeight',
  'duration',
  'maxMessagesPerSecond',
  'maxMessageLength',
];
const allFields = [...checkboxFields, ...floatFields, ...intFields];

async function loadSettings() {
  await danmakuSettings.load();
  const settings = danmakuSettings.getAll();

  for (const field of allFields) {
    const el = document.getElementById(field);
    if (!el) continue;
    if (checkboxFields.includes(field)) {
      el.checked = !!settings[field];
    } else {
      el.value = settings[field];
    }
  }

  updateOpacityDisplay();
}

function readField(field) {
  const el = document.getElementById(field);
  if (!el) return undefined;
  if (checkboxFields.includes(field)) return el.checked;
  if (floatFields.includes(field)) return parseFloat(el.value);
  return parseInt(el.value, 10);
}

async function saveSettings() {
  const patch = {};
  for (const field of allFields) {
    const value = readField(field);
    if (value === undefined || Number.isNaN(value)) continue;
    patch[field] = value;
  }
  danmakuSettings.setMany(patch);
  await danmakuSettings.save();
  showStatus('Settings saved!');
}

async function resetSettings() {
  danmakuSettings.setMany(DANMAKU_CONSTANTS.DEFAULTS);
  await danmakuSettings.save();
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
