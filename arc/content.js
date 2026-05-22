const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isChromeContextValid() {
  try { return !!chrome.runtime.id; } catch { return false; }
}

// ナビパネル内でスクロール可能なコンテナを取得
function getNavScrollable() {
  const navPanel = document.querySelector('[jscontroller="TKuTKe"]') || document.body;
  if (navPanel.scrollHeight > navPanel.clientHeight + 10) return navPanel;
  function find(el, depth) {
    if (depth === 0) return null;
    for (const child of el.children) {
      const oy = getComputedStyle(child).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && child.scrollHeight > child.clientHeight + 10) {
        return child;
      }
      const found = find(child, depth - 1);
      if (found) return found;
    }
    return null;
  }
  return find(navPanel, 5) || navPanel;
}

// ナビパネルを上から下までスクロールして全カレンダーを収集し元の位置に戻す
async function scrollAndCollectCalendars() {
  const scrollEl = getNavScrollable();
  const saved = scrollEl.scrollTop;
  const collected = new Map();

  const collect = () => {
    for (const el of findCalendarElements()) {
      const id = getCalendarId(el);
      if (!id || collected.has(id)) continue;
      const nameEl = el.querySelector('.toUqff');
      if (!nameEl) continue;
      const span = nameEl.querySelector('span[jsslot]');
      const name = (span || nameEl).innerText.trim();
      if (name) collected.set(id, { id, name });
    }
  };

  scrollEl.scrollTop = 0;
  await sleep(80);
  collect();

  while (scrollEl.scrollTop + scrollEl.clientHeight < scrollEl.scrollHeight - 5) {
    scrollEl.scrollTop += 150;
    await sleep(80);
    collect();
  }

  scrollEl.scrollTop = saved;
  return Array.from(collected.values());
}

// カレンダー要素を全件取得（マイカレンダー・他のカレンダー両セクション対応）
function findCalendarElements() {
  // jscontroller="rHQf4" がカレンダー項目の正確なセレクタ（両セクション共通）
  const results = Array.from(document.querySelectorAll('div[jscontroller="rHQf4"][data-id]'));
  if (results.length > 0) return results;

  // フォールバック: チェックボックスを持つ data-id 要素を広く検索
  return Array.from(document.querySelectorAll('div[data-id]')).filter(
    el => el.querySelector('input[type="checkbox"]')
  );
}

// カレンダー要素からIDを取得
function getCalendarId(calendarItem) {
  const id = calendarItem.getAttribute('data-id');
  if (id) return id;

  const checkbox = calendarItem.querySelector('input[type="checkbox"]');
  if (checkbox) {
    const cbId = checkbox.getAttribute('id');
    if (cbId) return cbId;
  }

  const nameEl = calendarItem.querySelector('.toUqff');
  if (nameEl) {
    const span = nameEl.querySelector('span[jsslot]');
    return span ? span.innerText.trim() : nameEl.innerText.trim();
  }

  return null;
}

// IDでカレンダー要素を検索
function findCalendarItemById(id) {
  for (const el of findCalendarElements()) {
    if (getCalendarId(el) === id) return el;
  }
  return null;
}

// 現在DOMに存在する全カレンダーを取得
function getAllCalendars() {
  const calendars = [];
  for (const el of findCalendarElements()) {
    const id = getCalendarId(el);
    const nameEl = el.querySelector('.toUqff');
    if (!id) continue;
    if (!nameEl) continue;
    const span = nameEl.querySelector('span[jsslot]');
    const name = span ? span.innerText.trim() : nameEl.innerText.trim();
    if (name) calendars.push({ id, name });
  }
  return calendars;
}

// カレンダーが現在ONかどうか
function isCalendarOn(id) {
  const el = findCalendarItemById(id);
  if (!el) return false;
  const checkbox = el.querySelector('input[type="checkbox"]');
  return checkbox ? checkbox.checked : false;
}

const COLOR_PALETTE = [
  '#AD1457', '#F4511E', '#E4C441', '#0B8043', '#3F51B5',
  '#8E24AA', '#D81B60', '#EF6C00', '#C0CA33', '#009688',
  '#7986CB', '#795548', '#D50000', '#F09300', '#7CB342',
  '#33B679', '#4285F4', '#9E69AF', '#A79B8E', '#616161',
  '#E67C73', '#F6BF26',
];

function getRandomColorForGroup(groupName) {
  let hash = 0;
  for (let i = 0; i < groupName.length; i++) {
    hash = ((hash << 5) - hash) + groupName.charCodeAt(i);
    hash |= 0;
  }
  return COLOR_PALETTE[Math.abs(hash) % COLOR_PALETTE.length];
}

function getStoredGroups() {
  return new Promise((resolve) => {
    if (!isChromeContextValid()) { resolve({}); return; }
    try {
      chrome.storage.local.get('calendarGroups', (result) => {
        resolve(result.calendarGroups || {});
      });
    } catch { resolve({}); }
  });
}

function getStoredOrder() {
  return new Promise((resolve) => {
    if (!isChromeContextValid()) { resolve([]); return; }
    try {
      chrome.storage.local.get('calendarGroupsOrder', (result) => {
        resolve(result.calendarGroupsOrder || []);
      });
    } catch { resolve([]); }
  });
}

function getStoredMultiGroupMode() {
  return new Promise((resolve) => {
    if (!isChromeContextValid()) { resolve(false); return; }
    try {
      chrome.storage.local.get('multiGroupMode', (result) => {
        resolve(!!result.multiGroupMode);
      });
    } catch { resolve(false); }
  });
}

function getStoredCalendarCache() {
  return new Promise((resolve) => {
    if (!isChromeContextValid()) { resolve({}); return; }
    try {
      chrome.storage.local.get('calendarCache', (result) => {
        resolve(result.calendarCache || {});
      });
    } catch { resolve({}); }
  });
}

function clearCalendarCache() {
  return new Promise((resolve) => {
    if (!isChromeContextValid()) { resolve(); return; }
    try {
      chrome.storage.local.set({ calendarCache: {} }, resolve);
    } catch { resolve(); }
  });
}

function cacheCurrentCalendars() {
  if (!isChromeContextValid()) return;
  getStoredCalendarCache().then((cache) => {
    let updated = false;
    for (const cal of getAllCalendars()) {
      if (!cache[cal.id]) {
        cache[cal.id] = cal;
        updated = true;
      }
    }
    if (updated) {
      try { chrome.storage.local.set({ calendarCache: cache }); } catch { /* invalidated */ }
    }
  });
}

async function getAllCalendarsFromCacheAndDOM() {
  const cache = await getStoredCalendarCache();
  const map = new Map(Object.entries(cache));

  const domCals = await scrollAndCollectCalendars();

  for (const cal of domCals) {
    map.set(cal.id, cal);
  }
  const newCache = {};
  map.forEach((v, k) => { newCache[k] = v; });
  try { chrome.storage.local.set({ calendarCache: newCache }); } catch { /* invalidated */ }

  // DOM スクロール順（サイドバー表示順）を優先し、キャッシュのみの項目を末尾に追加
  const domIdSet = new Set(domCals.map(c => c.id));
  const cacheOnly = Array.from(map.values()).filter(c => !domIdSet.has(c.id));
  return [...domCals, ...cacheOnly];
}

// カレンダー要素がDOMに追加されたとき即座にキャッシュするオブザーバー
function observeCalendarDOMChanges() {
  const observer = new MutationObserver((mutations) => {
    if (!isChromeContextValid()) { observer.disconnect(); return; }
    let hasCalendarNodes = false;
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (
          node.matches?.('div[jscontroller="rHQf4"][data-id]') ||
          node.querySelector?.('div[jscontroller="rHQf4"][data-id]')
        ) {
          hasCalendarNodes = true;
          break;
        }
      }
      if (hasCalendarNodes) break;
    }
    if (hasCalendarNodes) cacheCurrentCalendars();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function initCalendarCache() {
  // 段階的にキャッシュ（ページ読み込み直後・少し後・遅れて展開されるセクション用）
  setTimeout(cacheCurrentCalendars, 1000);
  setTimeout(cacheCurrentCalendars, 3000);
  setTimeout(cacheCurrentCalendars, 6000);
  // 「その他のカレンダー」展開時など、後から現れる要素も自動キャッシュ
  observeCalendarDOMChanges();
}

let activeGroups = [];
let _activating = false;
let _docClickHandler = null;

async function scrollToReveal(id) {
  const scrollEl = getNavScrollable();
  const saved = scrollEl.scrollTop;
  scrollEl.scrollTop = 0;
  await sleep(150);
  while (true) {
    const el = findCalendarItemById(id);
    if (el) return el;
    if (scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 5) break;
    scrollEl.scrollTop += 150;
    await sleep(150);
  }
  scrollEl.scrollTop = saved;
  return null;
}

async function setCalendarOn(id) {
  let el = findCalendarItemById(id) || await scrollToReveal(id);
  if (!el) return false;
  el.scrollIntoView({ behavior: 'instant', block: 'nearest' });
  await sleep(100);
  el = findCalendarItemById(id);
  if (!el) return false;
  const checkbox = el.querySelector('input[type="checkbox"]');
  if (!checkbox || checkbox.checked) return false;
  checkbox.click();
  await sleep(80);
  return true;
}

async function setCalendarOff(id) {
  let el = findCalendarItemById(id) || await scrollToReveal(id);
  if (!el) return false;
  el.scrollIntoView({ behavior: 'instant', block: 'nearest' });
  await sleep(100);
  el = findCalendarItemById(id);
  if (!el) return false;
  const checkbox = el.querySelector('input[type="checkbox"]');
  if (!checkbox || !checkbox.checked) return false;
  checkbox.click();
  await sleep(80);
  return true;
}

async function captureCurrentCalendarState() {
  const state = {};
  for (const cal of await scrollAndCollectCalendars()) {
    state[cal.id] = isCalendarOn(cal.id);
  }
  return state;
}

async function applyCalendarState(targetOnIds) {
  for (const cal of await scrollAndCollectCalendars()) {
    if (targetOnIds.has(cal.id)) {
      await setCalendarOn(cal.id);
    } else {
      await setCalendarOff(cal.id);
    }
  }
}

async function restoreOriginalState(originalCalendarState) {
  for (const [id, wasOn] of Object.entries(originalCalendarState)) {
    if (wasOn) {
      await setCalendarOn(id);
    } else {
      await setCalendarOff(id);
    }
  }
}

async function activateGroup(groupName) {
  if (!isChromeContextValid() || _activating) return;
  _activating = true;
  try {
    const [groups, isMulti, stored] = await Promise.all([
      getStoredGroups(),
      getStoredMultiGroupMode(),
      new Promise((resolve) => {
        try {
          chrome.storage.local.get(['activeGroups', 'originalCalendarState'], (r) => resolve(r));
        } catch { resolve({}); }
      }),
    ]);

    let newActive = [...activeGroups];
    let originalState = stored.originalCalendarState || null;

    if (newActive.length === 0) {
      originalState = await captureCurrentCalendarState();
    }

    if (isMulti) {
      if (!newActive.includes(groupName)) newActive = [...newActive, groupName];
    } else {
      newActive = [groupName];
    }

    const targetOnIds = new Set();
    for (const name of newActive) {
      for (const cal of (groups[name] || [])) {
        targetOnIds.add(cal.id);
      }
    }

    await applyCalendarState(targetOnIds);
    activeGroups = newActive;

    try {
      chrome.storage.local.set(
        { activeGroups: newActive, originalCalendarState: originalState },
        () => { loadGroupsToPage(); }
      );
    } catch { /* invalidated */ }
  } finally {
    _activating = false;
  }
}

async function deactivateGroup(groupName) {
  if (!isChromeContextValid()) return;
  const stored = await new Promise((resolve) => {
    try {
      chrome.storage.local.get(['activeGroups', 'originalCalendarState'], (r) => resolve(r));
    } catch { resolve({}); }
  });

  const newActive = activeGroups.filter((n) => n !== groupName);
  const originalState = stored.originalCalendarState || {};

  if (newActive.length === 0) {
    await restoreOriginalState(originalState);
    activeGroups = [];
    try {
      chrome.storage.local.remove(
        ['activeGroups', 'originalCalendarState'],
        () => { loadGroupsToPage(); }
      );
    } catch { /* invalidated */ }
  } else {
    const groups = await getStoredGroups();
    const targetOnIds = new Set();
    for (const name of newActive) {
      for (const cal of (groups[name] || [])) {
        targetOnIds.add(cal.id);
      }
    }
    await applyCalendarState(targetOnIds);
    activeGroups = newActive;
    try {
      chrome.storage.local.set(
        { activeGroups: newActive },
        () => { loadGroupsToPage(); }
      );
    } catch { /* invalidated */ }
  }
}

async function resetAllGroups() {
  if (!isChromeContextValid()) return;
  const stored = await new Promise((resolve) => {
    try {
      chrome.storage.local.get('originalCalendarState', (r) => resolve(r));
    } catch { resolve({}); }
  });

  await restoreOriginalState(stored.originalCalendarState || {});
  activeGroups = [];
  try {
    chrome.storage.local.remove(
      ['activeGroups', 'originalCalendarState'],
      () => { loadGroupsToPage(); }
    );
  } catch { /* invalidated */ }
}

const GROUP_SECTION_VERSION = '4';

function insertGroupSection() {
  const existing = document.querySelector('#custom-group-section');
  if (existing) {
    if (existing.dataset.version === GROUP_SECTION_VERSION) return;
    existing.remove();
  }

  let targetH2 = null;
  let sectionName = 'カレンダーグループ';

  for (const h2 of document.querySelectorAll('h2.XuJrye')) {
    const text = h2.textContent.trim();
    if (text === 'カレンダー リスト') {
      targetH2 = h2;
    } else if (text === 'Calendar list') {
      targetH2 = h2;
      sectionName = 'Calendar groups';
    }
  }

  if (!targetH2) {
    console.error('[GroupExt] カレンダー リスト の h2 が見つかりません');
    return;
  }

  const section = document.createElement('div');
  section.id = 'custom-group-section';
  section.dataset.version = GROUP_SECTION_VERSION;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.classList.add('custom-nUt0vb', 'custom-uQ1ixe');
  btn.setAttribute('aria-expanded', 'true');
  btn.innerHTML = `
    <div class="GsuJoe"></div>
    <div class="x5FT4e kkUTBb" style="width:100%;">
      <div class="o8t45d" style="display:flex;align-items:center;justify-content:space-between;width:100%;">
        <div class="aIwHYe">${sectionName}</div>
        <div style="display:flex;align-items:center;">
          <button type="button" class="group-gear-btn" title="グループ選択モード設定" style="border:none;background:none;cursor:pointer;padding:4px;border-radius:4px;color:#5f6368;display:flex;align-items:center;font-size:16px;line-height:1;margin-right:2px;">⚙</button>
          <i class="google-material-icons meh4fc hggPq Dk9A5d" aria-hidden="true" style="margin-right:12px;">keyboard_arrow_up</i>
        </div>
      </div>
    </div>
  `;

  const settingsPanel = document.createElement('div');
  settingsPanel.id = 'group-settings-panel';
  settingsPanel.style.display = 'none';
  settingsPanel.innerHTML = `
    <div class="group-settings-inner">
      <div class="group-settings-title">グループ選択モード</div>
      <label class="group-settings-label">
        <input type="radio" name="group-mode" value="single">
        <div>
          <div class="group-settings-mode-name">切り替えモード</div>
          <div class="group-settings-mode-desc">1つのグループのみON</div>
        </div>
      </label>
      <label class="group-settings-label">
        <input type="radio" name="group-mode" value="multi">
        <div>
          <div class="group-settings-mode-name">複数選択モード</div>
          <div class="group-settings-mode-desc">複数グループを同時にON可能</div>
        </div>
      </label>
    </div>
  `;

  const container = document.createElement('div');
  container.id = 'group-list-container';
  container.setAttribute('role', 'list');
  container.setAttribute('aria-expanded', 'true');

  const list = document.createElement('ul');
  list.id = 'group-list';
  container.appendChild(list);

  const resetContainer = document.createElement('div');
  resetContainer.id = 'group-reset-container';

  btn.addEventListener('click', () => {
    const expanded = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', String(!expanded));
    container.setAttribute('aria-expanded', String(!expanded));
    btn.querySelector('i').textContent = expanded ? 'keyboard_arrow_down' : 'keyboard_arrow_up';
    container.style.display = expanded ? 'none' : 'block';
  });

  const gearBtn = btn.querySelector('.group-gear-btn');

  const closeSettingsPanel = () => {
    settingsPanel.style.display = 'none';
    gearBtn.style.background = '';
    gearBtn.style.color = '';
  };

  gearBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = settingsPanel.style.display !== 'none';
    if (isOpen) {
      closeSettingsPanel();
    } else {
      settingsPanel.style.display = 'block';
      gearBtn.style.background = 'rgba(26,115,232,0.12)';
      gearBtn.style.color = '#1a73e8';
    }
  });

  if (_docClickHandler) document.removeEventListener('click', _docClickHandler);
  _docClickHandler = (e) => {
    if (settingsPanel.style.display === 'none') return;
    if (!settingsPanel.contains(e.target) && e.target !== gearBtn) {
      closeSettingsPanel();
    }
  };
  document.addEventListener('click', _docClickHandler);

  settingsPanel.querySelectorAll('input[name="group-mode"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      if (!isChromeContextValid()) return;
      const isMulti = radio.value === 'multi';
      try {
        chrome.storage.local.set({ multiGroupMode: isMulti });
      } catch { /* invalidated */ }
    });
  });

  section.appendChild(btn);
  section.appendChild(settingsPanel);
  section.appendChild(container);
  section.appendChild(resetContainer);
  targetH2.insertAdjacentElement('afterend', section);

  getStoredMultiGroupMode().then((isMulti) => {
    settingsPanel.querySelectorAll('input[name="group-mode"]').forEach((r) => {
      r.checked = r.value === (isMulti ? 'multi' : 'single');
    });
  });

  loadGroupsToPage();
}

function loadGroupsToPage() {
  Promise.all([getStoredGroups(), getStoredOrder()]).then(([groups, order]) => {
    const list = document.getElementById('group-list');
    const resetContainer = document.getElementById('group-reset-container');
    if (!list) return;

    list.style.visibility = 'hidden';
    list.innerHTML = '';

    const names = Object.keys(groups);
    const sorted = [
      ...order.filter((n) => groups[n]),
      ...names.filter((n) => !order.includes(n)),
    ];

    for (const groupName of sorted) {
      const color = getRandomColorForGroup(groupName);
      const isActive = activeGroups.includes(groupName);

      const item = document.createElement('li');
      item.classList.add('group-item-row');
      if (isActive) item.classList.add('group-item-active');
      item.style.cssText = 'display:flex;align-items:center;gap:8px;padding:0 12px 0 16px;cursor:pointer;height:32px;';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = isActive;
      checkbox.tabIndex = -1;
      checkbox.style.cssText = `width:14px;height:14px;flex-shrink:0;accent-color:${color};pointer-events:none;`;

      const colorDot = document.createElement('div');
      colorDot.classList.add('group-color-dot');
      colorDot.style.background = color;

      const span = document.createElement('span');
      span.textContent = groupName;
      span.style.cssText = 'flex:1;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';

      item.addEventListener('click', () => {
        if (activeGroups.includes(groupName)) {
          deactivateGroup(groupName);
        } else {
          activateGroup(groupName);
        }
      });

      item.appendChild(checkbox);
      item.appendChild(colorDot);
      item.appendChild(span);
      list.appendChild(item);
    }

    list.style.visibility = 'visible';

    if (resetContainer) {
      resetContainer.innerHTML = '';
      if (activeGroups.length > 0) {
        const resetBtn = document.createElement('button');
        resetBtn.type = 'button';
        resetBtn.classList.add('group-reset-btn');
        resetBtn.textContent = 'すべてOFF';
        resetBtn.addEventListener('click', () => resetAllGroups());
        resetContainer.appendChild(resetBtn);
      }
    }
  });
}

function observeNavPanel() {
  const target =
    document.querySelector('.hEtGGf.HDIIVe.sBn5T[jscontroller="TKuTKe"]') ||
    document.body;

  const observer = new MutationObserver(() => {
    if (!isChromeContextValid()) { observer.disconnect(); return; }
    if (!document.querySelector('#custom-group-section')) {
      insertGroupSection();
    }
  });
  observer.observe(target, { childList: true, subtree: true });

  insertGroupSection();
}

function initActiveGroups() {
  if (!isChromeContextValid()) return;
  try {
    chrome.storage.local.get('activeGroups', (result) => {
      const storedActive = result.activeGroups || [];
      activeGroups = storedActive;
      if (storedActive.length > 0) {
        getStoredGroups().then((groups) => {
          const targetOnIds = new Set();
          for (const name of activeGroups) {
            for (const cal of (groups[name] || [])) {
              targetOnIds.add(cal.id);
            }
          }
          applyCalendarState(targetOnIds).then(() => loadGroupsToPage());
        });
      } else {
        loadGroupsToPage();
      }
    });
  } catch { /* invalidated */ }
}

function setMessageListener() {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === 'ping') {
      sendResponse({ pong: true });
    } else if (message.action === 'getCalendars') {
      getAllCalendarsFromCacheAndDOM().then((calendars) => sendResponse({ calendars }));
    } else if (message.action === 'activateGroup') {
      activateGroup(message.groupName);
      sendResponse({ success: true });
    } else if (message.action === 'deactivateGroup') {
      deactivateGroup(message.groupName);
      sendResponse({ success: true });
    } else if (message.action === 'resetAllGroups') {
      resetAllGroups();
      sendResponse({ success: true });
    } else if (message.action === 'refreshGroupList') {
      loadGroupsToPage();
      sendResponse({ success: true });
    } else if (message.action === 'clearCache') {
      clearCalendarCache().then(() => sendResponse({ success: true }));
    } else {
      sendResponse({ success: false });
    }
    return true;
  });
}

function setStorageListener() {
  if (!isChromeContextValid()) return;
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !isChromeContextValid()) return;
      if ('calendarGroups' in changes || 'calendarGroupsOrder' in changes) {
        insertGroupSection();
        loadGroupsToPage();
      }
      if ('multiGroupMode' in changes) {
        const panel = document.getElementById('group-settings-panel');
        if (panel) {
          const isMulti = !!changes.multiGroupMode.newValue;
          panel.querySelectorAll('input[name="group-mode"]').forEach((r) => {
            r.checked = r.value === (isMulti ? 'multi' : 'single');
          });
        }
      }
    });
  } catch { /* invalidated */ }
}

function initialize() {
  if (window.__calendarGroupingInitialized) return;
  window.__calendarGroupingInitialized = true;
  initActiveGroups();
  observeNavPanel();
  setMessageListener();
  setStorageListener();
  initCalendarCache();
}

initialize();
