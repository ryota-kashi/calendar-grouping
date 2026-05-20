# Calendar Grouping

Googleカレンダーのカレンダーをグループ単位でワンクリック切り替えできるChrome拡張機能です。

---

## 機能

| 機能 | 説明 |
|------|------|
| グループ管理 | カレンダーをグループにまとめて作成・編集・削除 |
| グループON | グループをONにすると、グループ外のカレンダーをすべてOFFにしてグループのみ表示 |
| グループOFF | ONにする前の状態に完全復元（グループ外カレンダーも元通り） |
| サイドバー表示 | Googleカレンダーのナビパネルにグループセクションを注入 |
| キャッシュ | カレンダー情報をローカルにキャッシュ（削除済みも保持） |
| 自動起動 | Googleカレンダーが開いていない場合は自動で開く |

### 既存の類似拡張機能からの改善点

- グループ切り替え時の2秒スクロールアニメーションを廃止 → 体感ゼロに
- `setInterval` による常時ポーリングを廃止 → CPU負荷なし
- MutationObserverの監視範囲をナビパネルに絞る → 軽量化

---

## インストール

### Chrome Web Store（推奨）

*近日公開予定*

### 開発版（手動インストール）

1. このリポジトリをクローン

```bash
git clone https://github.com/ryota-kashi/calendar-grouping.git
```

2. Chromeで `chrome://extensions/` を開く
3. 右上の「デベロッパー モード」をONにする
4. 「パッケージ化されていない拡張機能を読み込む」をクリック
5. クローンしたフォルダを選択

---

## 使い方

1. Googleカレンダー（[calendar.google.com](https://calendar.google.com/)）を開く
2. 拡張機能アイコンをクリックしてポップアップを開く
3. カレンダーを選択してグループ名を入力し「グループを作成」
4. サイドバーのグループ名またはポップアップのグループ名をクリックでON/OFF

---

## 技術スタック

- Chrome Extension Manifest V3
- Vanilla JavaScript（フレームワークなし）
- chrome.storage.local（データ永続化）
- MutationObserver（DOM監視）

---

## ライセンス

MIT License — 詳細は [LICENSE](LICENSE) を参照してください。
