document.addEventListener('DOMContentLoaded', () => {
  const openBtn = document.getElementById('openCalendarBtn');
  if (openBtn) {
    openBtn.addEventListener('click', openGoogleCalendar);
  }
});

function openGoogleCalendar() {
  chrome.tabs.query({ url: 'https://calendar.google.com/*' }, (tabs) => {
    if (tabs.length > 0) {
      // すでに開いているタブがあればそれをアクティブにする
      chrome.tabs.update(tabs[0].id, { active: true });
      chrome.windows.update(tabs[0].windowId, { focused: true });
    } else {
      // 開いていなければ新しく開く
      chrome.tabs.create({ url: 'https://calendar.google.com/' });
    }
    // ポップアップを閉じる
    window.close();
  });
}
