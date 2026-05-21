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

function saveGroups(groups) {
  return new Promise((resolve) => {
    if (!isChromeContextValid()) { resolve(); return; }
    try {
      chrome.storage.local.set({ calendarGroups: groups }, resolve);
    } catch { resolve(); }
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
  console.log(`[GroupExt] キャッシュ: ${map.size}件`);

  const domCals = await scrollAndCollectCalendars();
  console.log(`[GroupExt] DOM収集: ${domCals.length}件`, domCals.map(c => c.name));

  for (const cal of domCals) {
    map.set(cal.id, cal);
  }
  const newCache = {};
  map.forEach((v, k) => { newCache[k] = v; });
  try { chrome.storage.local.set({ calendarCache: newCache }); } catch { /* invalidated */ }
  const result = Array.from(map.values());
  console.log(`[GroupExt] 合計: ${result.length}件`);
  return result;
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

let currentSelectedGroupName = null;

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
  if (!el) { console.log(`[GroupExt] calendar not in DOM: ${id}`); return false; }
  el.scrollIntoView({ behavior: 'instant', block: 'nearest' });
  await sleep(100);
  el = findCalendarItemById(id);
  if (!el) { console.log(`[GroupExt] calendar disappeared after scroll: ${id}`); return false; }
  const checkbox = el.querySelector('input[type="checkbox"]');
  if (!checkbox || checkbox.checked) return false;
  checkbox.click();
  await sleep(80);
  return true;
}

async function setCalendarOff(id) {
  let el = findCalendarItemById(id) || await scrollToReveal(id);
  if (!el) { console.log(`[GroupExt] calendar not in DOM: ${id}`); return false; }
  el.scrollIntoView({ behavior: 'instant', block: 'nearest' });
  await sleep(100);
  el = findCalendarItemById(id);
  if (!el) { console.log(`[GroupExt] calendar disappeared after scroll: ${id}`); return false; }
  const checkbox = el.querySelector('input[type="checkbox"]');
  if (!checkbox || !checkbox.checked) return false;
  checkbox.click();
  await sleep(80);
  return true;
}

async function activateGroup(groupName, calendarIds) {
  const groupIdSet = new Set(calendarIds);

  // スクロールして全カレンダーを収集してから非活性化（仮想スクロール対応）
  const deactivated = [];
  for (const cal of await scrollAndCollectCalendars()) {
    if (!groupIdSet.has(cal.id) && isCalendarOn(cal.id)) {
      await setCalendarOff(cal.id);
      deactivated.push(cal.id);
    }
  }

  const activated = [];
  for (const id of calendarIds) {
    if (!isCalendarOn(id)) {
      await setCalendarOn(id);
      activated.push(id);
    }
  }

  currentSelectedGroupName = groupName;
  if (!isChromeContextValid()) return;
  try {
    chrome.storage.local.set({
      currentSelectedGroup: groupName,
      activatedCalendarIds: activated,
      deactivatedCalendarIds: deactivated,
    });
  } catch { /* invalidated */ }
}

function deactivateGroup() {
  if (!isChromeContextValid()) return;
  try {
    chrome.storage.local.get(['activatedCalendarIds', 'deactivatedCalendarIds'], async (result) => {
      const activated = result.activatedCalendarIds || [];
      const deactivated = result.deactivatedCalendarIds || [];
      for (const id of activated) await setCalendarOff(id);
      for (const id of deactivated) await setCalendarOn(id);
      currentSelectedGroupName = null;
      if (!isChromeContextValid()) return;
      try {
        chrome.storage.local.remove(
          ['currentSelectedGroup', 'activatedCalendarIds', 'deactivatedCalendarIds']
        );
      } catch { /* invalidated */ }
    });
  } catch { /* invalidated */ }
}

function getCurrentSelectedGroup() {
  if (!isChromeContextValid()) return;
  try {
    chrome.storage.local.get('currentSelectedGroup', (result) => {
      currentSelectedGroupName = result.currentSelectedGroup || null;
      if (currentSelectedGroupName) {
        getStoredGroups().then((groups) => {
          const group = groups[currentSelectedGroupName];
          if (group) {
            activateGroup(currentSelectedGroupName, group.map((c) => c.id));
          } else {
            currentSelectedGroupName = null;
          }
        });
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
      activateGroup(message.groupName, message.calendarIds);
      sendResponse({ success: true });
    } else if (message.action === 'deactivateGroup') {
      deactivateGroup();
      sendResponse({ success: true });
    } else if (message.action === 'refreshGroupList') {
      sendResponse({ success: true });
    } else if (message.action === 'clearCache') {
      clearCalendarCache().then(() => sendResponse({ success: true }));
    } else {
      sendResponse({ success: false });
    }
    return true;
  });
}

function initialize() {
  if (window.__calendarGroupingInitialized) return;
  window.__calendarGroupingInitialized = true;
  getCurrentSelectedGroup();
  setMessageListener();
  initCalendarCache();
}

initialize();
