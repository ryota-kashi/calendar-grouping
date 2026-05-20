# プライバシーポリシー / Privacy Policy

**Calendar Grouping Chrome拡張機能**

最終更新日：2026年5月20日

---

## 1. はじめに

本プライバシーポリシーは、Chrome拡張機能「Calendar Grouping」（以下「本拡張機能」）における個人情報および利用データの取り扱いについて説明します。

---

## 2. 収集するデータ

本拡張機能が収集・保存するデータは以下のみです。

| データ種別 | 内容 | 保存場所 |
|-----------|------|---------|
| カレンダーグループ設定 | ユーザーが作成したグループ名とグループに含まれるカレンダーIDおよび名前 | ブラウザのローカルストレージ（`chrome.storage.local`） |
| カレンダーキャッシュ | GoogleカレンダーのDOMから取得したカレンダーIDと表示名 | ブラウザのローカルストレージ（`chrome.storage.local`） |
| グループ選択状態 | 現在ONになっているグループ名と、グループ操作によって変更されたカレンダーIDのリスト | ブラウザのローカルストレージ（`chrome.storage.local`） |

---

## 3. データの利用目的

収集したデータは以下の目的のみに使用します。

- グループ設定の保存と復元
- Googleカレンダーのサイドバーへのグループ表示
- ページリロード後のグループ選択状態の復元

---

## 4. データの送信・共有

**本拡張機能は、収集したいかなるデータも外部サーバーへ送信しません。**

すべてのデータはお使いのコンピューター上のブラウザのローカルストレージにのみ保存されます。第三者へのデータ提供・販売・共有は一切行いません。

---

## 5. アクセスするWebサイト

本拡張機能は `https://calendar.google.com/` のみで動作します。他のWebサイトへのアクセスや干渉は行いません。

---

## 6. 使用するChrome API

| API | 使用目的 |
|-----|---------|
| `chrome.storage.local` | グループ設定・キャッシュのローカル保存 |
| `chrome.tabs` | GoogleカレンダーのタブIDの取得・新規タブの作成 |
| `chrome.runtime.onMessage` | ポップアップとContent Script間のメッセージ通信 |

---

## 7. データの保持期間

データはユーザーが明示的に削除するまで保持されます。削除方法：

- **キャッシュのみ削除**：拡張機能のポップアップ内「カレンダーキャッシュをクリア」ボタン
- **すべてのデータを削除**：Chromeの設定から拡張機能をアンインストール

---

## 8. お子様のプライバシー

本拡張機能は13歳未満のお子様を対象としておらず、意図的にお子様の個人情報を収集することはありません。

---

## 9. プライバシーポリシーの変更

本ポリシーを変更する場合は、このページを更新し、最終更新日を変更します。

---

## 10. お問い合わせ

本プライバシーポリシーに関するご質問は、GitHubリポジトリのIssueよりお問い合わせください。

- GitHub: [https://github.com/ryota-kashi/calendar-grouping](https://github.com/ryota-kashi/calendar-grouping)

---

## English Summary

This extension stores only calendar group settings, calendar cache, and group selection state — all locally in `chrome.storage.local`. No data is ever transmitted to external servers or shared with third parties. The extension operates exclusively on `https://calendar.google.com/`.
