// カレンダー要素を全件取得
function findCalendarElements() {
  return Array.from(document.querySelectorAll('div[jscontroller="rHQf4"][data-id]'));
}

// カレンダー要素からIDを取得（複数フォールバックあり）
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

// 現在DOMに存在する全カレンダーを { id, name } 配列で返す
function getAllCalendars() {
  const calendars = [];
  for (const el of findCalendarElements()) {
    const id = getCalendarId(el);
    const nameEl = el.querySelector('.toUqff');
    if (!id || !nameEl) continue;
    const span = nameEl.querySelector('span[jsslot]');
    const name = span ? span.innerText.trim() : nameEl.innerText.trim();
    if (name) calendars.push({ id, name });
  }
  return calendars;
}

// カレンダーが現在ONかどうか（DOMに存在しない場合は false）
function isCalendarOn(id) {
  const el = findCalendarItemById(id);
  if (!el) return false;
  const checkbox = el.querySelector('input[type="checkbox"][jsname="YPqjbf"]');
  return checkbox ? checkbox.checked : false;
}

const COLOR_PALETTE = [
  '#AD1457', '#F4511E', '#E4C441', '#0B8043', '#3F51B5',
  '#8E24AA', '#D81B60', '#EF6C00', '#C0CA33', '#009688',
  '#7986CB', '#795548', '#D50000', '#F09300', '#7CB342',
  '#33B679', '#4285F4', '#9E69AF', '#A79B8E', '#616161',
  '#E67C73', '#F6BF26',
];

const groupColors = {};

function getRandomColorForGroup(groupName) {
  if (groupColors[groupName]) return groupColors[groupName];
  const color = COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)];
  groupColors[groupName] = color;
  return color;
}

function getStoredGroups() {
  return new Promise((resolve) => {
    chrome.storage.local.get('calendarGroups', (result) => {
      resolve(result.calendarGroups || {});
    });
  });
}

function getStoredCalendarCache() {
  return new Promise((resolve) => {
    chrome.storage.local.get('calendarCache', (result) => {
      resolve(result.calendarCache || {});
    });
  });
}

function clearCalendarCache() {
  return new Promise((resolve) => {
    chrome.storage.local.set({ calendarCache: {} }, resolve);
  });
}

function cacheCurrentCalendars() {
  getStoredCalendarCache().then((cache) => {
    let updated = false;
    for (const cal of getAllCalendars()) {
      if (!cache[cal.id]) {
        cache[cal.id] = cal;
        updated = true;
      }
    }
    if (updated) chrome.storage.local.set({ calendarCache: cache });
  });
}

async function getAllCalendarsFromCacheAndDOM() {
  const cache = await getStoredCalendarCache();
  const map = new Map(Object.entries(cache));
  for (const cal of getAllCalendars()) {
    map.set(cal.id, cal);
  }
  const newCache = {};
  map.forEach((v, k) => { newCache[k] = v; });
  chrome.storage.local.set({ calendarCache: newCache });
  return Array.from(map.values());
}

function initCalendarCache() {
  setTimeout(cacheCurrentCalendars, 2000);
}
