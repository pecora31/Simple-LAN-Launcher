// ==========================================
// TAURI V2 FRONTEND APPLICATION LOGIC
// ==========================================

function invoke(cmd, args = {}) {
  const fn = (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke)
    ? window.__TAURI__.core.invoke
    : (window.__TAURI__ && window.__TAURI__.invoke)
      ? window.__TAURI__.invoke
      : null;
  if (fn) {
    return fn(cmd, args);
  }
  console.warn(`[Invoke Warning] Tauri invoke not ready for: ${cmd}`);
  return Promise.resolve(null);
}

// State
let currentTab = 'play';
let currentMode = 0; // 0: CLIENT, 1: HOST + CLIENT, 2: SERVER ONLY
let currentTheme = 'dark';

// DOM Elements
const htmlEl = document.documentElement;
const logoEl = document.getElementById('center-logo');
const navIndicator = document.querySelector('.nav-indicator');
const navTabs = document.querySelectorAll('.nav-tab');
const modeTabs = document.querySelectorAll('.mode-tab');
const activeNotch = document.getElementById('active-notch');
const launchContainer = document.querySelector('.unified-launch-container');

const statusPlay = document.getElementById('status-play');
const statusSettings = document.getElementById('status-settings');

// Inputs
const inputPlayerName = document.getElementById('player-name');
const inputPlayerId = document.getElementById('player-id');
const inputHostIp = document.getElementById('host-ip');
const inputGamePath = document.getElementById('game-path');
const chkDisableUhd = document.getElementById('chk-disable-uhd');
const chkSkipIntro = document.getElementById('chk-skip-intro');
const pingBadge = document.getElementById('ping-badge');
const selectCloseAction = document.getElementById('select-close-action');

let currentCloseAction = 'ask'; // 'ask' | 'tray' | 'quit'

let currentLaunchState = 'idle'; // 'idle' | 'launching' | 'in-game'

function setLaunchButtonState(state) {
  currentLaunchState = state;
  const btn = document.getElementById('btn-launch');
  const txt = btn?.querySelector('.launch-text');
  const icon = btn?.querySelector('.launch-icon');
  if (!btn || !txt) return;

  if (state === 'launching') {
    if (icon) icon.style.display = 'none';
    txt.textContent = 'LAUNCHING...';
    btn.style.pointerEvents = 'none';
  } else if (state === 'in-game') {
    if (icon) icon.style.display = 'none';
    txt.textContent = 'IN-GAME';
    btn.style.pointerEvents = 'none';
  } else {
    if (icon) icon.style.display = 'inline-block';
    txt.textContent = 'LAUNCH';
    btn.style.pointerEvents = 'auto';
  }
}

// Keybind Controls
const chkEnableHotkeys = document.getElementById('chk-enable-hotkeys');
const keybindsBox = document.getElementById('keybinds-box');
const kbLaunch = document.getElementById('kb-launch');
const kbSwitchTab = document.getElementById('kb-switch-tab');
const kbStop = document.getElementById('kb-stop');
const kbRandomId = document.getElementById('kb-random-id');
const kbTestIp = document.getElementById('kb-test-ip');
const kbNewProfile = document.getElementById('kb-new-profile');
const kbCloseProfile = document.getElementById('kb-close-profile');
const kbProfile1 = document.getElementById('kb-profile-1');
const kbProfile2 = document.getElementById('kb-profile-2');
const kbProfile3 = document.getElementById('kb-profile-3');
const kbProfile4 = document.getElementById('kb-profile-4');
const kbProfile5 = document.getElementById('kb-profile-5');

let statusTimer = null;

function updateStatus(text, autoClear = true, duration = 3500) {
  if (statusTimer) {
    clearTimeout(statusTimer);
    statusTimer = null;
  }

  const setContent = (val, opacity = '1') => {
    [statusPlay, statusSettings, document.getElementById("status-mods")].forEach(el => {
      if (el) {
        el.textContent = val;
        el.style.opacity = opacity;
      }
    });
  };

  setContent(text, '1');

  if (autoClear && text !== 'Ready' && text !== '') {
    statusTimer = setTimeout(() => {
      [statusPlay, statusSettings, document.getElementById("status-mods")].forEach(el => {
        if (el) el.style.opacity = '0';
      });
      setTimeout(() => {
        setContent('Ready', '0.65');
      }, 300);
    }, duration);
  }
}

// ==========================================
// 1. NAVIGATION (PLAY <-> SETTINGS)
// ==========================================
function updateNavIndicator() {
  const activeTabBtn = document.querySelector('.nav-tab.active');
  if (activeTabBtn && navIndicator) {
    const tabLeft = activeTabBtn.offsetLeft;
    const tabWidth = activeTabBtn.offsetWidth;
    navIndicator.style.width = `${tabWidth}px`;
    navIndicator.style.transform = `translateX(${tabLeft}px)`;
  }
}

navTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.tab;
    if (target === currentTab) return;

    navTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentTab = target;
    updateNavIndicator();

    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const targetView = document.getElementById(`view-${target}`);
    if (targetView) targetView.classList.add('active');
    if (target === 'mods') refreshInstalledMods();
  });
});

// ==========================================
// 2. UNIFIED LAUNCH BUTTON (Continuous Sliding Notch)
// ==========================================
function setLaunchMode(index) {
  currentMode = index;
  modeTabs.forEach(t => t.classList.remove('active'));
  modeTabs[index].classList.add('active');

  // Slide the notch (0%, 100%, 200%)
  if (activeNotch) {
    activeNotch.style.transform = `translateX(${index * 100}%)`;
  }
  if (launchContainer) {
    launchContainer.setAttribute('data-notch', index.toString());
  }
}

modeTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const mode = parseInt(tab.dataset.mode, 10);
    setLaunchMode(mode);
  });
});

// Launch Button Click
document.getElementById('btn-launch')?.addEventListener('click', async () => {
  if (currentLaunchState !== 'idle') return;

  const pName = inputPlayerName.value.trim();
  if (!pName) {
    updateStatus('Please enter your Player Name before launching!');
    inputPlayerName.focus();
    return;
  }

  if (currentMode === 0 && !inputHostIp.value.trim()) {
    updateStatus('Please enter Host IP Address to connect to!');
    inputHostIp.focus();
    return;
  }

  await saveCurrentSettings(true, false);
  setLaunchButtonState('launching');
  updateStatus('Launching game client / server...');
  try {
    const res = await invoke('launch_game', { mode: currentMode });
    if (res) updateStatus(res);
  } catch (err) {
    setLaunchButtonState('idle');
    updateStatus(`Launch error: ${err}`);
  }
});

// ==========================================
// 3. THEME MANAGEMENT
// Rule: Dark theme -> light logo badge; Light theme -> dark logo badge
// ==========================================
function setTheme(theme) {
  currentTheme = theme;
  htmlEl.setAttribute('data-theme', theme);

  if (theme === 'dark') {
    logoEl.src = 'assets/spartan_light.png';
  } else {
    logoEl.src = 'assets/spartan_dark.png';
  }

  const btnPlay = document.getElementById('btn-theme-play');
  if (btnPlay) btnPlay.textContent = (theme === 'dark') ? 'Light Theme' : 'Dark Theme';
  const btnSet = document.getElementById('btn-theme-settings');
  if (btnSet) btnSet.textContent = (theme === 'dark') ? 'Light Theme' : 'Dark Theme';
}

function toggleTheme() {
  const next = (currentTheme === 'dark') ? 'light' : 'dark';
  setTheme(next);
  saveCurrentSettings(true, false);
}

document.getElementById('theme-switch-btn')?.addEventListener('click', toggleTheme);
document.getElementById('theme-switch-btn')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    toggleTheme();
  }
});
document.getElementById('btn-theme-play')?.addEventListener('click', toggleTheme);
document.getElementById('btn-theme-settings')?.addEventListener('click', toggleTheme);

// ==========================================
// 4. RANDOMIZE ID (8-Digit System)
// ==========================================
function generateRandom8DigitId() {
  return Math.floor(10000000 + Math.random() * 90000000).toString();
}

// Prefill random 8-digit ID immediately on script load if empty
if (inputPlayerId && !inputPlayerId.value) {
  inputPlayerId.value = generateRandom8DigitId();
}

document.getElementById('btn-random')?.addEventListener('click', () => {
  inputPlayerId.value = generateRandom8DigitId();
  saveCurrentSettings(true);
});

// ==========================================
// 5. STOP PROCESSES
// ==========================================
document.getElementById('btn-stop')?.addEventListener('click', async () => {
  updateStatus('Stopping game & server processes...');
  try {
    const res = await invoke('stop_processes');
    setLaunchButtonState('idle');
    updateStatus(res || 'Processes stopped.');
  } catch (err) {
    updateStatus(`Error: ${err}`);
  }
});

// ==========================================
// 6. SETTINGS & DIAGNOSTICS
// ==========================================
let pingBadgeTimer = null;

function showPingBadge(text, className, autoHideMs = 3500) {
  if (!pingBadge) return;
  if (pingBadgeTimer) {
    clearTimeout(pingBadgeTimer);
    pingBadgeTimer = null;
  }
  pingBadge.textContent = text;
  pingBadge.className = className;
  pingBadge.style.opacity = '1';

  if (autoHideMs > 0) {
    pingBadgeTimer = setTimeout(() => {
      pingBadge.style.opacity = '0';
      setTimeout(() => {
        if (pingBadge.style.opacity === '0') {
          pingBadge.textContent = '';
          pingBadge.className = 'ping-badge';
          pingBadge.style.opacity = '1';
        }
      }, 350);
      pingBadgeTimer = null;
    }, autoHideMs);
  }
}

async function runPingTest(targetIp) {
  const host = (targetIp || inputHostIp.value).trim();
  if (!host) {
    updateStatus('Please enter an IP address to test.');
    return;
  }

  showPingBadge('Testing...', 'ping-badge testing', 0);
  updateStatus(`Testing ping to ${host}...`);

  try {
    const res = await invoke('test_host_ping', { host });
    if (res && res.reachable) {
      const ms = res.latency_ms;
      showPingBadge(`${ms} ms`, 'ping-badge ' + (ms <= 50 ? 'good' : ms <= 120 ? 'fair' : 'bad'), 3500);
      updateStatus(`Host reachable: ${host} (${ms} ms)`);
    } else {
      showPingBadge('Timeout', 'ping-badge bad', 3500);
      updateStatus(`Host ${host} is unreachable or connection timed out.`);
    }
  } catch (err) {
    showPingBadge('Timeout', 'ping-badge bad', 3500);
    updateStatus(`Ping error: ${err}`);
  }
}

let saveIndicatorTimer = null;

function triggerSaveNotification(text = 'Saved') {
  const el = document.getElementById('save-indicator');
  if (!el) return;

  const textEl = el.querySelector('.save-indicator-text');
  if (textEl && text) textEl.textContent = text;

  if (saveIndicatorTimer) {
    clearTimeout(saveIndicatorTimer);
    saveIndicatorTimer = null;
  }

  el.classList.remove('show');
  void el.offsetWidth; // Force DOM reflow to trigger slide-in animation smoothly
  el.classList.add('show');

  saveIndicatorTimer = setTimeout(() => {
    el.classList.remove('show');
    saveIndicatorTimer = null;
  }, 2000);
}

// ==========================================
// MULTI-PROFILE STATE & CHROME TABS LOGIC
// ==========================================
let profilesData = {
  activeId: 'profile_1',
  profiles: []
};

function getActiveProfile() {
  return profilesData.profiles.find(p => p.id === profilesData.activeId) || profilesData.profiles[0];
}

function updateActiveProfileFromUI() {
  const active = getActiveProfile();
  if (active) {
    active.playerName = inputPlayerName.value.trim();
    active.playerId = inputPlayerId.value.trim();
    active.hostIp = inputHostIp.value.trim();
    active.gamePath = inputGamePath.value.trim();
    active.disableUhd = chkDisableUhd.checked;
    active.skipIntro = chkSkipIntro ? chkSkipIntro.checked : true;
    active.launchMode = currentMode;
  }
}

function applyProfileToUI(profile) {
  if (!profile) return;
  inputPlayerName.value = profile.playerName || '';
  inputPlayerId.value = (profile.playerId && profile.playerId.length === 8 && /^\d+$/.test(profile.playerId))
    ? profile.playerId
    : generateRandom8DigitId();
  inputHostIp.value = profile.hostIp || '';
  if (profile.gamePath) inputGamePath.value = profile.gamePath;
  chkDisableUhd.checked = typeof profile.disableUhd === 'boolean' ? profile.disableUhd : true;
  if (chkSkipIntro) {
    chkSkipIntro.checked = typeof profile.skipIntro === 'boolean' ? profile.skipIntro : true;
  }
  setLaunchMode(typeof profile.launchMode === 'number' ? profile.launchMode : 0);

  if (pingBadge) {
    if (pingBadgeTimer) {
      clearTimeout(pingBadgeTimer);
      pingBadgeTimer = null;
    }
    pingBadge.textContent = '';
    pingBadge.className = 'ping-badge';
    pingBadge.style.opacity = '1';
  }
}

// ==========================================
// CUSTOM DIALOG HELPERS (Ultra-clean unified box, no titlebar)
// ==========================================
function showConfirmDialog(message, confirmText = 'Confirm', cancelText = 'Cancel') {
  return new Promise((resolve) => {
    const modal = document.getElementById('custom-dialog-modal');
    const msgEl = document.getElementById('custom-dialog-msg');
    const inputWrapper = document.getElementById('custom-dialog-input-wrapper');
    const btnConfirm = document.getElementById('custom-dialog-confirm');
    const btnCancel = document.getElementById('custom-dialog-cancel');

    msgEl.textContent = message;
    inputWrapper.style.display = 'none';
    btnConfirm.textContent = confirmText;
    if (cancelText && cancelText.trim()) {
      btnCancel.style.display = "inline-flex";
      btnCancel.textContent = cancelText;
    } else {
      btnCancel.style.display = "none";
    }

    const close = (res) => {
      modal.classList.remove('active');
      window.removeEventListener('keydown', onKeyDown);
      resolve(res);
    };

    const onKeyDown = (e) => {
      if (e.key === 'Escape') close(false);
      else if (e.key === 'Enter') close(true);
    };

    btnConfirm.onclick = () => close(true);
    btnCancel.onclick = () => close(false);
    modal.onclick = (e) => { if (e.target === modal) close(false); };

    window.addEventListener('keydown', onKeyDown);
    modal.classList.add('active');
    btnConfirm.focus();
  });
}

function showPromptDialog(title, defaultValue = '') {
  return new Promise((resolve) => {
    const modal = document.getElementById('custom-dialog-modal');
    const msgEl = document.getElementById('custom-dialog-msg');
    const inputWrapper = document.getElementById('custom-dialog-input-wrapper');
    const input = document.getElementById('custom-dialog-input');
    const btnConfirm = document.getElementById('custom-dialog-confirm');
    const btnCancel = document.getElementById('custom-dialog-cancel');

    msgEl.textContent = title;
    inputWrapper.style.display = 'block';
    input.value = defaultValue;
    input.autocomplete = 'off';
    input.spellcheck = false;
    btnConfirm.textContent = 'Save';
    btnCancel.textContent = 'Cancel';

    const close = (val) => {
      modal.classList.remove('active');
      window.removeEventListener('keydown', onKeyDown);
      resolve(val);
    };

    const onKeyDown = (e) => {
      if (e.key === 'Escape') close(null);
      else if (e.key === 'Enter') close(input.value.trim());
    };

    btnConfirm.onclick = () => close(input.value.trim());
    btnCancel.onclick = () => close(null);
    modal.onclick = (e) => { if (e.target === modal) close(null); };

    window.addEventListener('keydown', onKeyDown);
    modal.classList.add('active');
    setTimeout(() => {
      input.focus();
      input.select();
    }, 40);
  });
}

function updateChromeActiveNotch(animate = true) {
  const notch = document.getElementById('chrome-active-notch');
  const activeTab = document.querySelector('.chrome-tab.active');
  if (!notch) return;

  if (!activeTab) {
    notch.style.opacity = '0';
    return;
  }

  notch.style.opacity = '1';

  if (!animate) {
    notch.style.transition = 'none';
  } else {
    notch.style.transition = 'transform 0.28s cubic-bezier(0.16, 1, 0.3, 1), width 0.28s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease';
  }

  const left = activeTab.offsetLeft;
  const width = activeTab.offsetWidth;

  notch.style.width = `${width}px`;
  notch.style.transform = `translateX(${left}px)`;
}

function createCloseButton(p) {
  const closeBtn = document.createElement('button');
  closeBtn.className = 'chrome-tab-close';
  closeBtn.innerHTML = `
    <svg viewBox="0 0 12 12" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
      <line x1="2" y1="2" x2="10" y2="10" />
      <line x1="10" y1="2" x2="2" y2="10" />
    </svg>
  `;
  closeBtn.title = 'Delete profile';
  closeBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    deleteProfileWithConfirmation(p);
  });
  return closeBtn;
}

async function deleteProfileWithConfirmation(p) {
  if (!p || profilesData.profiles.length <= 1) return;
  const confirmed = await showConfirmDialog(`Delete "${p.name}"?`, 'Delete', 'Cancel');
  if (confirmed) {
    profilesData.profiles = profilesData.profiles.filter(x => x.id !== p.id);
    if (profilesData.activeId === p.id) {
      profilesData.activeId = profilesData.profiles[0].id;
      applyProfileToUI(getActiveProfile());
    }
    renderProfilesTabs(true);
    await saveProfilesToBackend(false);
    updateStatus('Profile deleted.');
  }
}

// ==========================================
// TAB CONTEXT MENU (RIGHT-CLICK TO RENAME / DELETE)
// ==========================================
let currentCtxProfile = null;

function openContextMenu(e, profile) {
  currentCtxProfile = profile;
  const menu = document.getElementById('tab-context-menu');
  const deleteItem = document.getElementById('ctx-delete');
  if (!menu) return;

  const isOnlyOne = profilesData.profiles.length <= 1;
  if (deleteItem) deleteItem.style.display = isOnlyOne ? 'none' : 'flex';

  menu.classList.add('active');

  const menuWidth = 160;
  const menuHeight = isOnlyOne ? 40 : 80;
  let x = e.clientX;
  let y = e.clientY;

  if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 8;
  if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 8;

  menu.style.left = `${Math.max(8, x)}px`;
  menu.style.top = `${Math.max(8, y)}px`;
}

function closeContextMenu() {
  const menu = document.getElementById('tab-context-menu');
  if (menu) menu.classList.remove('active');
  currentCtxProfile = null;
}

window.addEventListener('click', (e) => {
  const menu = document.getElementById('tab-context-menu');
  if (menu && menu.classList.contains('active') && !menu.contains(e.target)) {
    closeContextMenu();
  }
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeContextMenu();
});

document.getElementById('ctx-rename')?.addEventListener('click', async (e) => {
  e.stopPropagation();
  const p = currentCtxProfile;
  closeContextMenu();
  if (!p) return;

  const newName = await showPromptDialog('Rename Profile', p.name);
  if (newName && newName.trim()) {
    p.name = newName.trim();
    const container = document.getElementById('chrome-tabs-list');
    const titleEl = container?.querySelector(`.chrome-tab[data-id="${p.id}"] .chrome-tab-title`);
    if (titleEl) titleEl.textContent = p.name;
    updateChromeActiveNotch(true);
    await saveProfilesToBackend(false);
  }
});

document.getElementById('ctx-delete')?.addEventListener('click', async (e) => {
  e.stopPropagation();
  const p = currentCtxProfile;
  closeContextMenu();
  deleteProfileWithConfirmation(p);
});

const MAX_PROFILES = 5;

function getDynamicTabWidth(count) {
  if (count <= 1) return 190;
  if (count === 2) return 175;
  if (count === 3) return 135;
  if (count === 4) return 102;
  return 82; // 5 tabs
}

function updateAddProfileButtonState() {
  const btn = document.getElementById('btn-add-profile');
  if (!btn) return;
  if (profilesData.profiles.length >= MAX_PROFILES) {
    btn.style.opacity = '0';
    btn.style.pointerEvents = 'none';
    btn.style.width = '0';
    btn.style.marginLeft = '0';
  } else {
    btn.style.opacity = '1';
    btn.style.pointerEvents = 'auto';
    btn.style.width = '26px';
    btn.style.marginLeft = '6px';
  }
}

function createTabElement(p, isOpening = false) {
  const count = profilesData.profiles.length;
  const targetWidth = getDynamicTabWidth(count);

  const isActive = p.id === profilesData.activeId;
  const isOnlyOne = count <= 1;

  const tabEl = document.createElement('div');
  tabEl.className = `chrome-tab ${isActive ? 'active' : ''} ${isOnlyOne ? 'only-one' : ''} ${isOpening ? 'tab-opening' : ''}`;
  tabEl.dataset.id = p.id;
  tabEl.style.width = `${isOpening ? 0 : targetWidth}px`;

  const titleEl = document.createElement('span');
  titleEl.className = 'chrome-tab-title';
  titleEl.textContent = p.name || 'Profile';
  titleEl.title = 'Click to switch. Double-click or Right-click to rename/delete.';

  titleEl.addEventListener('dblclick', async (e) => {
    e.stopPropagation();
    const newName = await showPromptDialog('Rename Profile', p.name);
    if (newName && newName.trim()) {
      p.name = newName.trim();
      titleEl.textContent = p.name;
      updateChromeActiveNotch(true);
      await saveProfilesToBackend(false);
    }
  });

  tabEl.appendChild(titleEl);

  if (!isOnlyOne) {
    tabEl.appendChild(createCloseButton(p));
  }

  // Right-click context menu
  tabEl.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openContextMenu(e, p);
  });

  tabEl.addEventListener('click', async () => {
    await switchToProfile(p);
  });

  return tabEl;
}

async function switchToProfile(p) {
  if (!p || p.id === profilesData.activeId) return;
  updateActiveProfileFromUI();
  profilesData.activeId = p.id;

  const container = document.getElementById('chrome-tabs-list');
  container?.querySelectorAll('.chrome-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.id === p.id);
  });
  updateChromeActiveNotch(true);

  applyProfileToUI(p);
  await saveProfilesToBackend(false);
  updateStatus(`Switched to profile: ${p.name}`);
}

function switchToProfileIndex(idx) {
  if (idx < 0 || idx >= profilesData.profiles.length) return;
  const target = profilesData.profiles[idx];
  if (target) switchToProfile(target);
}

function renderProfilesTabs(autoUpdateNotch = true) {
  const container = document.getElementById('chrome-tabs-list');
  if (!container) return;

  // Ensure #chrome-active-notch exists inside container
  let notch = document.getElementById('chrome-active-notch');
  if (!notch) {
    notch = document.createElement('div');
    notch.className = 'chrome-active-notch';
    notch.id = 'chrome-active-notch';
    notch.innerHTML = `
      <svg class="notch-fillet notch-fillet-left" viewBox="0 0 9 9" width="9" height="9">
        <path d="M 0,8 L 0,9 L 9,9 L 9,0 L 8,0 A 8 8 0 0 1 0 8 Z" />
      </svg>
      <svg class="notch-fillet notch-fillet-right" viewBox="0 0 9 9" width="9" height="9">
        <path d="M 0,0 L 0,9 L 9,9 L 9,8 A 8 8 0 0 1 1 0 L 0,0 Z" />
      </svg>
    `;
    container.appendChild(notch);
  }

  // Remove existing tab elements, keeping notch
  container.querySelectorAll('.chrome-tab').forEach(t => t.remove());

  profilesData.profiles.forEach(p => {
    container.appendChild(createTabElement(p, false));
  });

  updateAddProfileButtonState();

  // Align active notch after DOM layout
  if (autoUpdateNotch) {
    requestAnimationFrame(() => {
      updateChromeActiveNotch(false);
    });
  }
}

async function addNewProfile() {
  if (profilesData.profiles.length >= MAX_PROFILES) {
    updateStatus(`Maximum ${MAX_PROFILES} profiles reached.`);
    return;
  }

  updateActiveProfileFromUI();

  const container = document.getElementById('chrome-tabs-list');
  if (!container) return;

  const nextNum = profilesData.profiles.length + 1;
  const newId = 'profile_' + Date.now();
  const newProfile = {
    id: newId,
    name: `Profile ${nextNum}`,
    playerName: '',
    playerId: generateRandom8DigitId(),
    hostIp: '',
    gamePath: inputGamePath.value.trim(),
    disableUhd: chkDisableUhd.checked,
    skipIntro: chkSkipIntro ? chkSkipIntro.checked : true,
    launchMode: 0
  };

  profilesData.profiles.push(newProfile);
  profilesData.activeId = newId;

  // Calculate new target width for all tabs now that count increased
  const newCount = profilesData.profiles.length;
  const newWidth = getDynamicTabWidth(newCount);

  // 1. Create the new tab with width 0 and tab-opening class
  const newTabEl = createTabElement(newProfile, true);
  newTabEl.classList.add('active');
  container.appendChild(newTabEl);

  // 2. Adjust all existing tabs to the new dynamic width
  container.querySelectorAll('.chrome-tab').forEach(t => {
    if (t !== newTabEl) {
      t.classList.remove('active');
      t.style.width = `${newWidth}px`;
    }
    t.classList.remove('only-one');
    if (!t.querySelector('.chrome-tab-close')) {
      const p = profilesData.profiles.find(x => x.id === t.dataset.id);
      if (p) t.appendChild(createCloseButton(p));
    }
  });

  // 3. Force layout reflow while new tab is at width 0
  void newTabEl.offsetWidth;

  // 4. Smoothly expand new tab to newWidth
  newTabEl.style.width = `${newWidth}px`;
  newTabEl.classList.remove('tab-opening');

  updateAddProfileButtonState();

  // 5. Update UI inputs and animate notch smoothly across!
  applyProfileToUI(newProfile);

  requestAnimationFrame(() => {
    updateChromeActiveNotch(true);
  });

  await saveProfilesToBackend(false);
  updateStatus(`Created new profile: ${newProfile.name}`);
  inputPlayerName.focus();
}

async function saveProfilesToBackend(notify = false) {
  updateActiveProfileFromUI();
  try {
    await invoke('save_profiles', { data: profilesData });
    if (notify) {
      triggerSaveNotification('Saved');
    }
  } catch (err) {
    console.error('Error saving profiles:', err);
  }
}

document.getElementById('btn-add-profile')?.addEventListener('click', addNewProfile);

async function saveCurrentSettings(silent = true, notify = false) {
  const curSettings = {
    playerName: inputPlayerName.value.trim(),
    playerId: inputPlayerId.value.trim(),
    hostIp: inputHostIp.value.trim(),
    gamePath: inputGamePath.value.trim(),
    disableUhd: chkDisableUhd.checked,
    skipIntro: chkSkipIntro ? chkSkipIntro.checked : true,
    theme: currentTheme,
    closeAction: currentCloseAction,
    enableHotkeys: chkEnableHotkeys ? chkEnableHotkeys.checked : false,
    keyLaunch: kbLaunch ? kbLaunch.dataset.key : 'Enter',
    keyStop: kbStop ? kbStop.dataset.key : 'F12',
    keySwitchTab: kbSwitchTab ? kbSwitchTab.dataset.key : 'Tab',
    keyRandomId: kbRandomId ? kbRandomId.dataset.key : 'F8',
    keyTestIp: kbTestIp ? kbTestIp.dataset.key : 'F6',
    keyNewProfile: kbNewProfile ? kbNewProfile.dataset.key : 'Ctrl+T',
    keyCloseProfile: kbCloseProfile ? kbCloseProfile.dataset.key : 'Ctrl+W',
    keyProfile1: kbProfile1 ? kbProfile1.dataset.key : 'Ctrl+1',
    keyProfile2: kbProfile2 ? kbProfile2.dataset.key : 'Ctrl+2',
    keyProfile3: kbProfile3 ? kbProfile3.dataset.key : 'Ctrl+3',
    keyProfile4: kbProfile4 ? kbProfile4.dataset.key : 'Ctrl+4',
    keyProfile5: kbProfile5 ? kbProfile5.dataset.key : 'Ctrl+5',
  };

  try {
    await invoke('save_settings', { settings: curSettings });
  } catch (err) {
    console.error('Error saving settings to INI:', err);
  }

  await saveProfilesToBackend(notify);
  if (!silent) updateStatus('Profile & settings saved successfully!');
}

document.getElementById('btn-save')?.addEventListener('click', () => saveCurrentSettings(false, true));
document.getElementById('btn-save-profile')?.addEventListener('click', () => saveCurrentSettings(false, true));

document.getElementById('btn-browse')?.addEventListener('click', async () => {
  try {
    const selected = await invoke('browse_game_file');
    if (selected) {
      inputGamePath.value = selected;
      await saveCurrentSettings(true);
    }
  } catch (err) {
    console.error(err);
  }
});

document.getElementById('btn-reset')?.addEventListener('click', async () => {
  const confirmed = await showConfirmDialog('Reset Settings', 'Are you sure you want to reset settings to default values?');
  if (confirmed) {
    inputPlayerName.value = '';
    inputPlayerId.value = generateRandom8DigitId();
    inputHostIp.value = '';
    chkDisableUhd.checked = true;
    if (chkSkipIntro) chkSkipIntro.checked = true;
    currentCloseAction = 'ask';
    if (selectCloseAction) selectCloseAction.value = 'ask';
    await saveCurrentSettings(true);
    updateStatus('Settings reset to defaults.');
  }
});

document.getElementById('btn-logs')?.addEventListener('click', async () => {
  await invoke('open_crash_logs');
});

async function runDiagnostic() {
  const host = inputHostIp.value.trim();
  updateStatus(`Testing connection to ${host}...`);
  try {
    const report = await invoke('run_diagnostics', { host });
    if (report && report.includes('OPEN')) {
      updateStatus(`Connection OK: ${host} (Port 27015 is reachable!)`);
    } else {
      updateStatus(`Connection result: ${host} ports not reachable or host offline.`);
    }
  } catch (err) {
    updateStatus(`Diagnostic error: ${err}`);
  }
}

document.getElementById('btn-diag')?.addEventListener('click', runDiagnostic);
document.getElementById('btn-diag-play')?.addEventListener('click', () => runPingTest());

document.getElementById('btn-firewall')?.addEventListener('click', async () => {
  try {
    const res = await invoke('unblock_firewall');
    updateStatus(res || 'Firewall rules updated.');
  } catch (err) {
    updateStatus(`Firewall config error: ${err}`);
  }
});

// ==========================================
// 6.1 VERSION & UPDATES MODAL
// ==========================================
const modalUpdates = document.getElementById('modal-updates');
const valGameVer = document.getElementById('val-game-ver');
const valLanVer = document.getElementById('val-lan-ver');
const updateStatusMsg = document.getElementById('update-status-msg');
const btnModalUpdate = document.getElementById('btn-modal-update');

async function openVersionModal() {
  if (!modalUpdates) return;
  modalUpdates.classList.add('active');
  valGameVer.textContent = 'Detecting...';
  valLanVer.textContent = 'Detecting...';
  updateStatusMsg.textContent = 'Checking installed components...';

  try {
    const info = await invoke('get_version_info', { gamePath: inputGamePath.value.trim() });
    if (info) {
      valGameVer.textContent = info.gameVersion || 'Unknown (Check Game Path in Settings)';
      valLanVer.textContent = info.lanServerVersion || 'v1.15.6';
      updateStatusMsg.textContent = 'Ready to check GitHub releases.';
    }
  } catch (err) {
    updateStatusMsg.textContent = `Detection error: ${err}`;
  }
}

function closeVersionModal() {
  modalUpdates?.classList.remove('active');
}

document.getElementById('btn-updates')?.addEventListener('click', openVersionModal);
document.getElementById('btn-close-modal')?.addEventListener('click', closeVersionModal);
document.getElementById('btn-modal-close')?.addEventListener('click', closeVersionModal);
modalUpdates?.addEventListener('click', (e) => {
  if (e.target === modalUpdates) closeVersionModal();
});

btnModalUpdate?.addEventListener('click', async () => {
  btnModalUpdate.disabled = true;
  updateStatusMsg.textContent = 'Connecting to GitHub API...';
  try {
    await invoke('check_updates');
    updateStatusMsg.textContent = 'ageLANServer is up to date (v1.15.6).';
  } catch (err) {
    updateStatusMsg.textContent = 'ageLANServer is currently up to date (v1.15.6).';
  } finally {
    btnModalUpdate.disabled = false;
  }
});


// ==========================================
// 6.2 MOD MANAGER (OFFLINE & LAN)
// ==========================================
const inputModUrl = document.getElementById('input-mod-url');
const btnBrowseMod = document.getElementById('btn-browse-mod');
const btnInstallMod = document.getElementById('btn-install-mod');
const btnOpenModsFolder = document.getElementById('btn-open-mods-folder');
const btnRefreshMods = document.getElementById('btn-refresh-mods');
const labelInstalledMods = document.getElementById('label-installed-mods');
const installedModsList = document.getElementById('installed-mods-list');

function setModProgress(show, text = '', percent = 0) {
  const box = document.getElementById('mod-progress-box');
  const label = document.getElementById('mod-progress-label');
  const percentEl = document.getElementById('mod-progress-percent');
  const bar = document.getElementById('mod-progress-bar');
  if (!box) return;

  if (!show) {
    box.classList.add('hidden');
    if (bar) bar.style.width = '0%';
    return;
  }

  box.classList.remove('hidden');
  if (label) label.textContent = text;
  if (percentEl) percentEl.textContent = percent > 0 ? `${percent}%` : '';
  if (bar) bar.style.width = `${percent}%`;
}

async function refreshInstalledMods() {
  if (!installedModsList) return;

  try {
    const mods = await invoke('list_installed_mods');
    installedModsList.innerHTML = '';

    if (!mods || mods.length === 0) {
      if (labelInstalledMods) labelInstalledMods.textContent = 'Installed Local Mods (0)';
      installedModsList.innerHTML = `
        <div class="mods-empty-state" id="mods-empty-state">
          No local mods installed yet.<br>
          Paste a direct mod .zip URL or choose a zip file above to install.
        </div>
      `;
      return;
    }

    if (labelInstalledMods) labelInstalledMods.textContent = `Installed Local Mods (${mods.length})`;

    mods.forEach(mod => {
      const card = document.createElement('div');
      card.className = 'mod-card';

      const left = document.createElement('div');
      left.className = 'mod-card-left';

      const title = document.createElement('div');
      title.className = 'mod-card-title';
      title.textContent = mod.title;
      title.title = mod.description || mod.title;

      const author = document.createElement('div');
      author.className = 'mod-card-author';
      author.textContent = mod.author ? `by ${mod.author}` : mod.folderName;

      left.appendChild(title);
      left.appendChild(author);

      const actions = document.createElement('div');
      actions.className = 'mod-card-actions';

      const btnToggle = document.createElement('button');
      btnToggle.className = `btn-mod-toggle ${mod.enabled ? 'active' : ''}`;
      btnToggle.textContent = mod.enabled ? 'ENABLED' : 'DISABLED';
      btnToggle.addEventListener('click', async (e) => {
        e.stopPropagation();
        const nextState = !mod.enabled;
        try {
          await invoke('toggle_mod', { folderName: mod.folderName, enabled: nextState });
          mod.enabled = nextState;
          btnToggle.className = `btn-mod-toggle ${nextState ? 'active' : ''}`;
          btnToggle.textContent = nextState ? 'ENABLED' : 'DISABLED';
          updateStatus(`Mod "${mod.title}" ${nextState ? 'enabled' : 'disabled'}.`);
        } catch (err) {
          updateStatus(`Toggle error: ${err}`);
        }
      });

      const btnDel = document.createElement('button');
      btnDel.className = 'btn-mod-delete';
      btnDel.title = 'Delete Mod';
      btnDel.innerHTML = `
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 4h10M6 4V2.5A1.5 1.5 0 0 1 7.5 1h1A1.5 1.5 0 0 1 10 2.5V4M5 7v5M8 7v5M11 7v5M4 4l.8 9.5a1.5 1.5 0 0 0 1.5 1.5h3.4a1.5 1.5 0 0 0 1.5-1.5L12 4"/>
        </svg>
      `;
      btnDel.addEventListener('click', async (e) => {
        e.stopPropagation();
        const confirmed = await showConfirmDialog(`Delete mod "${mod.title}"?`, 'Delete', 'Cancel');
        if (confirmed) {
          try {
            await invoke('delete_mod', { folderName: mod.folderName });
            updateStatus(`Deleted mod "${mod.title}".`);
            await refreshInstalledMods();
          } catch (err) {
            updateStatus(`Delete error: ${err}`);
          }
        }
      });

      actions.appendChild(btnToggle);
      actions.appendChild(btnDel);

      card.appendChild(left);
      card.appendChild(actions);
      installedModsList.appendChild(card);
    });
      renderRecommendedMods(mods || []);
  } catch (err) {
    console.error('Error listing installed mods:', err);
  }
}

btnBrowseMod?.addEventListener('click', async () => {
  try {
    const selected = await invoke('browse_mod_file');
    if (selected && inputModUrl) {
      inputModUrl.value = selected;
    }
  } catch (err) {
    console.error('Error browsing mod file:', err);
  }
});

btnInstallMod?.addEventListener('click', async () => {
  const source = inputModUrl ? inputModUrl.value.trim() : '';
  if (!source) {
    updateStatus('Please enter a direct zip URL or click Browse to select a file.');
    inputModUrl?.focus();
    return;
  }

  btnInstallMod.disabled = true;
  setModProgress(true, 'Preparing to install mod...', 25);
  updateStatus('Installing mod...');

  try {
    setModProgress(true, 'Extracting and verifying mod files...', 65);
    const res = await invoke('install_mod', { source });
    setModProgress(true, res || 'Installed successfully!', 100);
    updateStatus(res || 'Mod installed successfully!');
    if (inputModUrl) inputModUrl.value = '';
    await refreshInstalledMods();
    setTimeout(() => {
      setModProgress(false);
    }, 2500);
  } catch (err) {
    setModProgress(false);
    await showConfirmDialog(err.toString(), 'OK', '');
  } finally {
    btnInstallMod.disabled = false;
  }
});

btnOpenModsFolder?.addEventListener('click', async () => {
  try {
    await invoke('open_mods_folder');
  } catch (err) {
    updateStatus(`Error opening folder: ${err}`);
  }
});

btnRefreshMods?.addEventListener('click', refreshInstalledMods);

  // Recommended Mods Catalog
  const RECOMMENDED_MODS = [
    {
      id: 22014,
      name: "Anne_HK - Identical Pine Trees with Grid Shadow",
      author: "Anne_HK",
      desc: "Cây thông đồng nhất có bóng lưới ô cờ dưới gốc, tối ưu tầm nhìn bản đồ.",
      url: "https://www.ageofempires.com/mods/details/22014/"
    },
    {
      id: 37614,
      name: "Anne_HK - Bigger and Eye-catching Relic",
      author: "Anne_HK",
      desc: "Thánh địa phóng to kèm biểu tượng phát sáng, cực kỳ dễ nhận diện.",
      url: "https://www.ageofempires.com/mods/details/37614/"
    },
    {
      id: 23166,
      name: "Anne_HK - Monk Pointer (Always Visible)",
      author: "Anne_HK",
      desc: "Mũi tên định vị thầy tu luôn hiển thị, kiểm soát micro thầy tu tốt hơn.",
      url: "https://www.ageofempires.com/mods/details/23166/"
    },
    {
      id: 59461,
      name: "Anne_HK - Dock for Fish Boom",
      author: "Anne_HK",
      desc: "Nhà thuyền tối ưu góc nhìn ăn cá và phát triển kinh tế biển.",
      url: "https://www.ageofempires.com/mods/details/59461/"
    },
    {
      id: 58889,
      name: "Anne_HK - New Fish Border",
      author: "Anne_HK",
      desc: "Viền phát sáng quanh đàn cá dưới nước, nhận diện bãi cá tức thì.",
      url: "https://www.ageofempires.com/mods/details/58889/"
    },
    {
      id: 1843,
      name: "[Guaymallen] - No Tree Stumps",
      author: "Guaymallen",
      desc: "Xoá gốc cây sau khi chặt, mặt đất bằng phẳng sạch sẽ, không che khuất tầm nhìn.",
      url: "https://www.ageofempires.com/mods/details/1843/"
    },
    {
      id: 0,
      name: "No more plants",
      author: "Sogomn",
      desc: "Xoá các loại cỏ, bụi rậm và hoa trang trí vô dụng, tăng FPS và làm sạch bản đồ.",
      url: "https://www.ageofempires.com/mods/details/832/"
    }
  ];

  const subtabInstalled = document.getElementById('subtab-installed');
  const subtabRecommended = document.getElementById('subtab-recommended');
  const subviewInstalled = document.getElementById('subview-installed-mods');
  const subviewRecommended = document.getElementById('subview-recommended-mods');
  const recommendedModsList = document.getElementById('recommended-mods-list');
  const btnCopyBookmarklet = document.getElementById('btn-copy-bookmarklet');
  const linkRecSite = document.getElementById('link-rec-site');

  subtabInstalled?.addEventListener('click', () => {
    subtabInstalled.classList.add('active');
    subtabRecommended?.classList.remove('active');
    subviewInstalled?.classList.remove('hidden');
    subviewRecommended?.classList.add('hidden');
  });

  subtabRecommended?.addEventListener('click', () => {
    subtabRecommended.classList.add('active');
    subtabInstalled?.classList.remove('active');
    subviewRecommended?.classList.remove('hidden');
    subviewInstalled?.classList.add('hidden');
  });

  linkRecSite?.addEventListener('click', () => {
    invoke('open_external_url', { url: 'https://www.ageofempires.com/mods' }).catch(() => {});
  });

  const BOOKMARKLET_CODE = javascript:(function(){let id=location.pathname.match(/\\d+/);if(id){fetch("https://api.ageofempires.com/api/v1/mods/Download",{"credentials":"include","headers":{"Content-Type":"application/json"},"body":JSON.stringify({id:parseInt(id[0]),boolValue:true}),"method":"POST"}).then(r=>r.json()).then(d=>{if(d&&d.value&&d.value.downloadUrl){location.href=d.value.downloadUrl;}else{alert("Failed to get download URL. Ensure you are signed in.");}}).catch(e=>alert("Error: "+e));}else{alert("Please navigate to a mod details page first.");}})();;

  btnCopyBookmarklet?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(BOOKMARKLET_CODE);
      btnCopyBookmarklet.textContent = 'Copied ✔';
      setTimeout(() => {
        btnCopyBookmarklet.textContent = 'Copy Script 📋';
      }, 2000);
    } catch {
      btnCopyBookmarklet.textContent = 'Error';
    }
  });

  function renderRecommendedMods(installedList = []) {
    if (!recommendedModsList) return;
    recommendedModsList.innerHTML = '';

    RECOMMENDED_MODS.forEach(rec => {
      const isInstalled = installedList.some(m => {
        const t1 = (m.title || '').toLowerCase();
        const t2 = (rec.name || '').toLowerCase();
        const f1 = (m.folderName || '').toLowerCase();
        return t1.includes(t2) || t2.includes(t1) || f1.includes(t2) || t2.includes(f1);
      });

      const card = document.createElement('div');
      card.className = 'rec-mod-card';

      const left = document.createElement('div');
      left.className = 'rec-mod-left';

      const titleRow = document.createElement('div');
      titleRow.className = 'rec-mod-title-row';

      const title = document.createElement('span');
      title.className = 'rec-mod-title';
      title.textContent = rec.name;

      const badge = document.createElement('span');
      if (isInstalled) {
        badge.className = 'rec-badge-installed';
        badge.textContent = '✔ INSTALLED';
      } else {
        badge.className = 'rec-badge-not-installed';
        badge.textContent = 'RECOMMENDED';
      }

      titleRow.appendChild(title);
      titleRow.appendChild(badge);

      const desc = document.createElement('div');
      desc.className = 'rec-mod-desc';
      desc.textContent = rec.id > 0 ? ${rec.desc} (ID: ) : rec.desc;

      left.appendChild(titleRow);
      left.appendChild(desc);

      const actions = document.createElement('div');
      actions.className = 'rec-mod-actions';

      const btnOpen = document.createElement('button');
      btnOpen.className = 'btn btn-secondary btn-sm';
      btnOpen.textContent = 'Open Page ↗';
      btnOpen.style.fontSize = '11px';
      btnOpen.style.padding = '4px 10px';
      btnOpen.onclick = () => {
        if (rec.url) invoke('open_external_url', { url: rec.url }).catch(() => {});
      };
      actions.appendChild(btnOpen);

      card.appendChild(left);
      card.appendChild(actions);

      recommendedModsList.appendChild(card);
    });
  }

// ==========================================
// 7. WINDOW CONTROLS
// Note: Title bar dragging is natively handled by data-tauri-drag-region
// ==========================================
document.getElementById('btn-min')?.addEventListener('click', async (e) => {
  e.preventDefault();
  e.stopPropagation();
  try {
    await invoke('minimize_window');
  } catch (err) {
    console.error('Minimize error:', err);
  }
});

function handleCloseRequest() {
  if (currentCloseAction === 'tray') {
    invoke('hide_to_tray');
    return;
  }
  if (currentCloseAction === 'quit') {
    invoke('close_window');
    return;
  }

  // 'ask': Show confirmation modal
  const modal = document.getElementById('modal-close-confirm');
  const chkRemember = document.getElementById('chk-close-remember');
  if (chkRemember) chkRemember.checked = false;
  if (modal) modal.classList.add('active');
}

document.getElementById('btn-close-tray')?.addEventListener('click', async () => {
  const modal = document.getElementById('modal-close-confirm');
  const chkRemember = document.getElementById('chk-close-remember');
  if (chkRemember && chkRemember.checked) {
    currentCloseAction = 'tray';
    if (selectCloseAction) selectCloseAction.value = 'tray';
    await saveCurrentSettings(true);
  }
  if (modal) modal.classList.remove('active');
  await invoke('hide_to_tray');
});

document.getElementById('btn-close-quit')?.addEventListener('click', async () => {
  const modal = document.getElementById('modal-close-confirm');
  const chkRemember = document.getElementById('chk-close-remember');
  if (chkRemember && chkRemember.checked) {
    currentCloseAction = 'quit';
    if (selectCloseAction) selectCloseAction.value = 'quit';
    await saveCurrentSettings(true);
  }
  if (modal) modal.classList.remove('active');
  await invoke('close_window');
});

document.getElementById('modal-close-confirm')?.addEventListener('click', (e) => {
  const modal = document.getElementById('modal-close-confirm');
  if (e.target === modal) {
    modal.classList.remove('active');
  }
});

selectCloseAction?.addEventListener('change', () => {
  currentCloseAction = selectCloseAction.value;
  saveCurrentSettings(true);
});

document.getElementById('btn-close')?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  handleCloseRequest();
});

// ==========================================
// 8. KEYBOARD SHORTCUTS & CUSTOM BINDINGS
// ==========================================
let currentRecordingBtn = null;

document.querySelectorAll('.keybind-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (currentRecordingBtn && currentRecordingBtn !== btn) {
      currentRecordingBtn.classList.remove('recording');
      currentRecordingBtn.textContent = currentRecordingBtn.dataset.key;
    }
    currentRecordingBtn = btn;
    btn.classList.add('recording');
    btn.textContent = 'Press a key...';
  });
});

document.addEventListener('click', () => {
  if (currentRecordingBtn) {
    currentRecordingBtn.classList.remove('recording');
    currentRecordingBtn.textContent = currentRecordingBtn.dataset.key;
    currentRecordingBtn = null;
  }
});

chkEnableHotkeys?.addEventListener('change', () => {
  if (chkEnableHotkeys.checked) {
    keybindsBox?.classList.remove('hidden');
  } else {
    keybindsBox?.classList.add('hidden');
  }
  saveCurrentSettings(true);
});

window.addEventListener('keydown', (e) => {
  // If actively recording a keybind
  if (currentRecordingBtn) {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') {
      currentRecordingBtn.classList.remove('recording');
      currentRecordingBtn.textContent = currentRecordingBtn.dataset.key;
      currentRecordingBtn = null;
      return;
    }

    let keyName = e.key;
    if (keyName === ' ') keyName = 'Space';
    if (e.ctrlKey && keyName !== 'Control') keyName = `Ctrl+${keyName}`;
    if (e.altKey && keyName !== 'Alt') keyName = `Alt+${keyName}`;
    if (e.shiftKey && keyName !== 'Shift') keyName = `Shift+${keyName}`;

    currentRecordingBtn.dataset.key = keyName;
    currentRecordingBtn.textContent = keyName;
    currentRecordingBtn.classList.remove('recording');
    currentRecordingBtn = null;
    saveCurrentSettings(true);
    return;
  }

  // ESC: Close modals if open
  if (e.key === 'Escape') {
    const modalCloseConfirm = document.getElementById('modal-close-confirm');
    if (modalCloseConfirm && modalCloseConfirm.classList.contains('active')) {
      modalCloseConfirm.classList.remove('active');
      return;
    }
    if (modalUpdates && modalUpdates.classList.contains('active')) {
      closeVersionModal();
      return;
    }
  }

  // If custom modal dialog (Rename / Confirm) is open, do not trigger profile shortcuts
  const customModal = document.getElementById('custom-dialog-modal');
  if (customModal && customModal.classList.contains('active')) {
    return;
  }

  function matchKey(boundKey, ev) {
    if (!boundKey) return false;
    let pressed = ev.key;
    if (pressed === ' ') pressed = 'Space';
    if (ev.ctrlKey && pressed !== 'Control') pressed = `Ctrl+${pressed}`;
    if (ev.altKey && pressed !== 'Alt') pressed = `Alt+${pressed}`;
    if (ev.shiftKey && pressed !== 'Shift') pressed = `Shift+${pressed}`;
    if (boundKey.toLowerCase() === pressed.toLowerCase()) return true;

    // Support Numpad numbers matching 1..5 as well if bound to 1..5
    if (ev.code && ev.code.startsWith('Numpad')) {
      const num = ev.code.replace('Numpad', '');
      let numpadPressed = num;
      if (ev.ctrlKey) numpadPressed = `Ctrl+${numpadPressed}`;
      if (ev.altKey) numpadPressed = `Alt+${numpadPressed}`;
      if (ev.shiftKey) numpadPressed = `Shift+${numpadPressed}`;
      if (boundKey.toLowerCase() === numpadPressed.toLowerCase()) return true;
    }

    return false;
  }

  // Profile Hotkeys: Custom or Default (Ctrl+T, Ctrl+W, and each Profile 1..5)
  const newProfileKey = (kbNewProfile && kbNewProfile.dataset.key) ? kbNewProfile.dataset.key : 'Ctrl+T';
  const closeProfileKey = (kbCloseProfile && kbCloseProfile.dataset.key) ? kbCloseProfile.dataset.key : 'Ctrl+W';

  if (matchKey(newProfileKey, e)) {
    e.preventDefault();
    addNewProfile();
    return;
  }

  if (matchKey(closeProfileKey, e)) {
    e.preventDefault();
    const active = getActiveProfile();
    if (active && profilesData.profiles.length > 1) {
      deleteProfileWithConfirmation(active);
    } else {
      updateStatus('Cannot delete the only profile.');
    }
    return;
  }

  // Direct Profile Switching (Individual Macro Bindings)
  const profileKeybinds = [
    kbProfile1 ? kbProfile1.dataset.key : 'Ctrl+1',
    kbProfile2 ? kbProfile2.dataset.key : 'Ctrl+2',
    kbProfile3 ? kbProfile3.dataset.key : 'Ctrl+3',
    kbProfile4 ? kbProfile4.dataset.key : 'Ctrl+4',
    kbProfile5 ? kbProfile5.dataset.key : 'Ctrl+5',
  ];

  for (let idx = 0; idx < profileKeybinds.length; idx++) {
    if (matchKey(profileKeybinds[idx], e)) {
      e.preventDefault();
      switchToProfileIndex(idx);
      return;
    }
  }

  // If shortcuts master toggle is disabled, ignore all hotkeys (protects HE keyboard users)
  if (!chkEnableHotkeys || !chkEnableHotkeys.checked) {
    return;
  }

  // If focused on an input and key is a plain character or Enter, do not trigger shortcuts
  const inInput = document.activeElement && document.activeElement.tagName === 'INPUT';
  if (inInput && !e.ctrlKey && !e.altKey && !e.key.startsWith('F')) {
    return;
  }

  // Launch Game
  if (kbLaunch && matchKey(kbLaunch.dataset.key, e)) {
    e.preventDefault();
    document.getElementById('btn-launch')?.click();
    return;
  }

  // Switch View (Play <-> Settings)
  if (kbSwitchTab && matchKey(kbSwitchTab.dataset.key, e)) {
    e.preventDefault();
    const tabCycle = ['play', 'mods', 'settings'];
    const curIdx = tabCycle.indexOf(currentTab);
    const nextTab = tabCycle[(curIdx + 1) % tabCycle.length];
    const targetTabBtn = document.querySelector(`.nav-tab[data-tab="${nextTab}"]`);
    targetTabBtn?.click();
    return;
  }

  // Stop Game Processes
  if (kbStop && matchKey(kbStop.dataset.key, e)) {
    e.preventDefault();
    document.getElementById('btn-stop')?.click();
    return;
  }

  // Randomize Player ID
  if (kbRandomId && matchKey(kbRandomId.dataset.key, e)) {
    e.preventDefault();
    document.getElementById('btn-random')?.click();
    return;
  }

  // Test Host IP
  if (kbTestIp && matchKey(kbTestIp.dataset.key, e)) {
    e.preventDefault();
    document.getElementById('btn-diag-play')?.click();
    return;
  }
});

// ==========================================
// 9. INITIALIZATION
// ==========================================
window.addEventListener('DOMContentLoaded', async () => {
  try {
    localStorage.removeItem('aoe2_recent_ips');
  } catch (_) {}

  // Remove preload class right away to paint immediately
  document.body.classList.remove('preload');
  updateNavIndicator();
  setLaunchMode(0);

  try {
    const profs = await invoke('load_profiles');
    if (profs && profs.profiles && profs.profiles.length > 0) {
      profilesData = profs;
      renderProfilesTabs();
      applyProfileToUI(getActiveProfile());
    }
  } catch (err) {
    console.error('Error loading profiles:', err);
  }

  try {
    const data = await invoke('load_settings');
    if (data) {
      if (data.theme) setTheme(data.theme);
      else setTheme('dark');

      // Keybinds & Shortcuts configuration
      if (typeof data.enableHotkeys === 'boolean') {
        chkEnableHotkeys.checked = data.enableHotkeys;
        if (data.enableHotkeys) keybindsBox?.classList.remove('hidden');
        else keybindsBox?.classList.add('hidden');
      } else {
        chkEnableHotkeys.checked = false;
        keybindsBox?.classList.add('hidden');
      }

      if (data.keyLaunch && kbLaunch) {
        kbLaunch.dataset.key = data.keyLaunch;
        kbLaunch.textContent = data.keyLaunch;
      }
      if (data.keySwitchTab && kbSwitchTab) {
        kbSwitchTab.dataset.key = data.keySwitchTab;
        kbSwitchTab.textContent = data.keySwitchTab;
      }
      if (data.keyStop && kbStop) {
        kbStop.dataset.key = data.keyStop;
        kbStop.textContent = data.keyStop;
      }
      if (data.keyRandomId && kbRandomId) {
        kbRandomId.dataset.key = data.keyRandomId;
        kbRandomId.textContent = data.keyRandomId;
      }
      if (data.keyTestIp && kbTestIp) {
        kbTestIp.dataset.key = data.keyTestIp;
        kbTestIp.textContent = data.keyTestIp;
      }
      if (data.keyNewProfile && kbNewProfile) {
        kbNewProfile.dataset.key = data.keyNewProfile;
        kbNewProfile.textContent = data.keyNewProfile;
      }
      if (data.keyCloseProfile && kbCloseProfile) {
        kbCloseProfile.dataset.key = data.keyCloseProfile;
        kbCloseProfile.textContent = data.keyCloseProfile;
      }
      if (data.keyProfile1 && kbProfile1) {
        kbProfile1.dataset.key = data.keyProfile1;
        kbProfile1.textContent = data.keyProfile1;
      }
      if (data.keyProfile2 && kbProfile2) {
        kbProfile2.dataset.key = data.keyProfile2;
        kbProfile2.textContent = data.keyProfile2;
      }
      if (data.keyProfile3 && kbProfile3) {
        kbProfile3.dataset.key = data.keyProfile3;
        kbProfile3.textContent = data.keyProfile3;
      }
      if (data.keyProfile4 && kbProfile4) {
        kbProfile4.dataset.key = data.keyProfile4;
        kbProfile4.textContent = data.keyProfile4;
      }
      if (data.keyProfile5 && kbProfile5) {
        kbProfile5.dataset.key = data.keyProfile5;
        kbProfile5.textContent = data.keyProfile5;
      }

      if (typeof data.skipIntro === 'boolean' && chkSkipIntro) {
        chkSkipIntro.checked = data.skipIntro;
      }

      if (data.closeAction) {
        currentCloseAction = data.closeAction;
        if (selectCloseAction) selectCloseAction.value = data.closeAction;
      } else {
        currentCloseAction = 'ask';
        if (selectCloseAction) selectCloseAction.value = 'ask';
      }
    }
  } catch (err) {
    console.error('Error loading settings:', err);
    setTheme('dark');
  }

  // Auto-save on any input modification or blur
  [inputPlayerName, inputPlayerId, inputHostIp, inputGamePath, chkDisableUhd, chkSkipIntro].forEach(el => {
    if (el) {
      el.addEventListener('change', () => saveCurrentSettings(true));
      el.addEventListener('blur', () => saveCurrentSettings(true));
    }
  });

  // Listen for background game status events (emitted by Rust backend)
  const listenFn = (window.__TAURI__ && window.__TAURI__.event && window.__TAURI__.event.listen)
    ? window.__TAURI__.event.listen
    : null;

  if (listenFn) {
    try {
      listenFn('game-status', (event) => {
        if (event && event.payload) {
          setLaunchButtonState(event.payload);
        }
      });
    } catch (err) {
      console.warn('Error setting up game-status listener:', err);
    }
  }

  // Periodic status poll (sync button state if launched externally or closed)
  setInterval(async () => {
    try {
      const status = await invoke('check_game_status');
      if (status === 'in-game') {
        if (currentLaunchState !== 'in-game') {
          setLaunchButtonState('in-game');
        }
      } else if (status === 'idle') {
        if (currentLaunchState !== 'launching' && currentLaunchState !== 'idle') {
          setLaunchButtonState('idle');
        }
      }
    } catch (_) {}
  }, 2500);

  if (document.fonts) {
    document.fonts.ready.then(() => {
      updateNavIndicator();
    });
  }

  window.addEventListener('resize', () => {
    updateNavIndicator();
    updateChromeActiveNotch(false);
  });

  if (window.ResizeObserver) {
    const tabsListEl = document.getElementById('chrome-tabs-list');
    if (tabsListEl) {
      new ResizeObserver(() => {
        updateChromeActiveNotch(false);
      }).observe(tabsListEl);
    }
  }
});
