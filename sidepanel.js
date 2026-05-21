let cachedCalendars = [];

const COLOR_PALETTE = [
  '#AD1457', '#F4511E', '#E4C441', '#0B8043', '#3F51B5',
  '#8E24AA', '#D81B60', '#EF6C00', '#C0CA33', '#009688',
  '#7986CB', '#795548', '#D50000', '#F09300', '#7CB342',
  '#33B679', '#4285F4', '#9E69AF', '#A79B8E', '#616161',
  '#E67C73', '#F6BF26',
];
function getColorForGroup(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i);
    hash |= 0;
  }
  return COLOR_PALETTE[Math.abs(hash) % COLOR_PALETTE.length];
}

// ===== ストレージ =====

function getStoredGroups() {
  return new Promise(resolve =>
    chrome.storage.local.get('calendarGroups', r => resolve(r.calendarGroups || {}))
  );
}

function saveGroups(groups) {
  return new Promise(resolve =>
    chrome.storage.local.set({ calendarGroups: groups }, resolve)
  );
}

// ===== content script との通信 =====

function findCalendarTab() {
  return new Promise(resolve =>
    chrome.tabs.query({ url: 'https://calendar.google.com/*' }, tabs =>
      resolve(tabs.length > 0 ? tabs[0].id : null)
    )
  );
}

function sendMessage(tabId, message) {
  return new Promise((resolve, reject) =>
    chrome.tabs.sendMessage(tabId, message, res => {
      if (chrome.runtime.lastError || !res) return reject(new Error('no_response'));
      resolve(res);
    })
  );
}

async function injectContentScript(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => { delete window.__calendarGroupingInitialized; },
  }).catch(() => {});
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
  await chrome.scripting.insertCSS({ target: { tabId }, files: ['content.css'] });
  await new Promise(r => setTimeout(r, 1000));
}

async function sendToContentScript(message) {
  const tabId = await findCalendarTab();
  if (tabId === null) throw new Error('no_tab');
  try {
    return await sendMessage(tabId, message);
  } catch {
    await injectContentScript(tabId);
    return await sendMessage(tabId, message);
  }
}

// ===== ステータス表示 =====

function setStatus(text, type = '') {
  const el = document.getElementById('spStatus');
  if (!el) return;
  el.textContent = text;
  el.className = 'sp-status' + (type ? ` sp-status-${type}` : '');
}

// ===== カレンダー取得 =====

async function loadCalendars() {
  try {
    setStatus('読み込み中...');
    const res = await sendToContentScript({ action: 'getCalendars' });
    cachedCalendars = res.calendars || [];
    if (cachedCalendars.length > 0) {
      setStatus(`${cachedCalendars.length}件のカレンダーを取得`, 'ok');
    } else {
      setStatus('カレンダーが見つかりません', 'error');
    }
  } catch (err) {
    cachedCalendars = [];
    const msg = err.message === 'no_tab'
      ? 'Googleカレンダーを開いてください'
      : '接続失敗。ページを更新してください';
    setStatus(msg, 'error');
  }
  return cachedCalendars;
}

// ===== グループ一覧 =====

function loadGroups() {
  getStoredGroups().then(groups => {
    const list = document.getElementById('groupList');
    if (!list) return;
    list.innerHTML = '';

    const names = Object.keys(groups);
    if (names.length === 0) {
      list.innerHTML = '<div class="sp-empty">グループがありません。<br>「新規作成」から作ってみましょう。</div>';
      return;
    }

    for (const name of names) {
      list.appendChild(createGroupCard(name, groups));
    }
  });
}

function createGroupCard(name, groups) {
  const color = getColorForGroup(name);
  const count = (groups[name] || []).length;

  const card = document.createElement('div');
  card.classList.add('sp-group-card');

  card.innerHTML = `
    <div class="sp-group-color" style="background:${color}"></div>
    <div class="sp-group-info">
      <span class="sp-group-name">${name}</span>
      <span class="sp-group-count">${count}件のカレンダー</span>
    </div>
    <div class="sp-group-actions">
      <button class="sp-action-btn sp-edit-btn" title="編集">
        <svg viewBox="0 0 20 20" fill="currentColor">
          <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/>
        </svg>
      </button>
      <button class="sp-action-btn sp-delete-btn" title="削除">
        <svg viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
        </svg>
      </button>
    </div>
  `;

  card.querySelector('.sp-edit-btn').addEventListener('click', e => {
    e.stopPropagation();
    showForm(name);
  });

  card.querySelector('.sp-delete-btn').addEventListener('click', e => {
    e.stopPropagation();
    if (confirm(`グループ「${name}」を削除しますか？`)) deleteGroup(name);
  });

  return card;
}

// ===== グループ削除 =====

function deleteGroup(name) {
  getStoredGroups().then(groups => {
    delete groups[name];
    saveGroups(groups).then(() => loadGroups());
  });
}

// ===== 作成・編集フォーム =====

let editingGroupName = null;

async function showForm(groupName = null) {
  editingGroupName = groupName;

  const form = document.getElementById('groupForm');
  document.getElementById('formTitle').textContent =
    groupName ? 'グループを編集' : '新しいグループを作成';
  document.getElementById('formGroupName').value = groupName || '';
  form.style.display = 'block';
  document.getElementById('formGroupName').focus();

  const calList = document.getElementById('formCalList');
  calList.innerHTML = '<div class="sp-loading">読み込み中...</div>';

  const calendars = cachedCalendars.length > 0 ? cachedCalendars : await loadCalendars();
  const groups = await getStoredGroups();
  const selected = new Set((groupName ? groups[groupName] || [] : []).map(c => c.id));

  if (calendars.length === 0) {
    calList.innerHTML = '<div class="sp-loading">カレンダーが見つかりません。<br>Googleカレンダーを開いてください。</div>';
    return;
  }

  calList.innerHTML = calendars.map(cal => `
    <label class="sp-cal-item">
      <input type="checkbox" value="${cal.id}" data-name="${cal.name}" ${selected.has(cal.id) ? 'checked' : ''}/>
      <span>${cal.name}</span>
    </label>
  `).join('');
}

function hideForm() {
  document.getElementById('groupForm').style.display = 'none';
  editingGroupName = null;
}

function saveForm() {
  const name = document.getElementById('formGroupName').value.trim();
  if (!name) { alert('グループ名を入力してください。'); return; }

  const checked = document.querySelectorAll('#formCalList input[type="checkbox"]:checked');
  const calendars = Array.from(checked).map(cb => ({ id: cb.value, name: cb.dataset.name }));
  if (calendars.length === 0) { alert('カレンダーを1つ以上選択してください。'); return; }

  getStoredGroups().then(groups => {
    if (editingGroupName) delete groups[editingGroupName];
    if (groups[name]) { alert('同じ名前のグループが既に存在します。'); return; }
    groups[name] = calendars;
    saveGroups(groups).then(() => {
      sendToContentScript({ action: 'refreshGroupList' }).catch(() => {});
      hideForm();
      loadGroups();
    });
  });
}

// ===== ストレージ変更を監視して他UIと同期 =====

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if ('calendarGroups' in changes) {
    loadGroups();
  }
});

// ===== 初期化 =====

document.addEventListener('DOMContentLoaded', () => {
  loadGroups();
  loadCalendars();

  document.getElementById('createGroupBtn').addEventListener('click', () => showForm());
  document.getElementById('refreshBtn').addEventListener('click', loadCalendars);
  document.getElementById('formSaveBtn').addEventListener('click', saveForm);
  document.getElementById('formCancelBtn').addEventListener('click', hideForm);
  document.getElementById('formCancelBtn2').addEventListener('click', hideForm);
  document.getElementById('clearCacheBtn').addEventListener('click', () => {
    if (!confirm('カレンダーキャッシュをクリアしますか？')) return;
    sendToContentScript({ action: 'clearCache' })
      .then(loadCalendars)
      .catch(() => alert('失敗しました。Googleカレンダーを開いてください。'));
  });
});
