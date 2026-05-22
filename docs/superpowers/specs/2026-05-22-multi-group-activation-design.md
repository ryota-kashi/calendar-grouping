# 複数グループ同時アクティベーション機能 設計書

## 概要

カレンダーグループを複数同時にONにできる「複数選択モード」を追加する。
既存の「切り替えモード」（1グループのみ）と設定で切り替え可能にする。

---

## 動作仕様

### 切り替えモード（既存・デフォルト）
- グループをクリック → そのグループがON、他グループはOFF
- 現在の動作と同じ

### 複数選択モード（新規）
- グループをクリック → そのグループをON/OFFトグル（他グループに影響なし）
- 複数グループが同時にON可能
- 表示されるカレンダー = 全アクティブグループのカレンダーIDの和集合
- どのグループにも属さないカレンダーはすべて非表示

### 共通動作
- グループがすべてOFFになると、グループ有効化前の状態に完全復元
- 「すべてOFF」ボタンで一括解除可能（1つ以上のグループがONのときのみ表示）

---

## データモデル

### ストレージキー変更

| キー | 変更 | 型 | 説明 |
|------|------|----|------|
| `currentSelectedGroup` | 廃止 | — | `activeGroups` に統合 |
| `activatedCalendarIds` | 廃止 | — | 不要 |
| `deactivatedCalendarIds` | 廃止 | — | 不要 |
| `activeGroups` | **新規** | `string[]` | アクティブなグループ名の配列 |
| `originalCalendarState` | **新規** | `{[calendarId: string]: boolean}` | 最初のグループON前のカレンダー状態スナップショット |
| `multiGroupMode` | **新規** | `boolean` | false=切り替えモード（デフォルト）, true=複数選択モード |

### アクティベーションロジック

```
activateGroup(groupName):
  1. activeGroups が空なら → 全カレンダーのON/OFF状態を originalCalendarState に保存
  2. 切り替えモード: activeGroups = [groupName]
     複数選択モード: activeGroups に groupName を追加（未追加なら）
  3. targetOnIds = 全アクティブグループのカレンダーIDの和集合
  4. targetOnIds に含まれるカレンダー → ON
  5. 含まれないカレンダー → OFF

deactivateGroup(groupName):
  1. activeGroups から groupName を除去
  2. activeGroups に要素が残る → targetOnIds を再計算して再適用
  3. activeGroups が空になる → originalCalendarState から完全復元・スナップショット削除

resetAllGroups():
  1. activeGroups を空に
  2. originalCalendarState から完全復元・スナップショット削除
```

---

## UI変更

### サイドバー（content.js / content.css）

1. **グループセクションヘッダー**に⚙ボタンを追加
   - クリックでインライン設定パネルをトグル表示
   - 設定パネル内にラジオボタン: 「切り替えモード」/ 「複数選択モード」
   - 設定変更は即座に `multiGroupMode` に保存

2. **グループ項目のチェックボックス**
   - `activeGroups` に含まれるグループ = チェック状態
   - 複数グループが同時にチェック表示可能

3. **「すべてOFF」ボタン**
   - `activeGroups.length > 0` のときのみ表示
   - グループリストの下に配置
   - クリックで `resetAllGroups()` を呼び出し

4. `GROUP_SECTION_VERSION` を `'3'` → `'4'` に更新（DOM構造変更のため）

### サイドパネル（sidepanel.html / sidepanel.js / sidepanel.css）

1. グループ一覧の上部にモード切り替えトグルを追加
   - ラベル: 「複数グループ同時ON」
   - `multiGroupMode` と双方向同期（storage経由）

---

## 変数名変更

| 変更前 | 変更後 |
|--------|--------|
| `currentSelectedGroupName` (string \| null) | `activeGroups` (string[]) |

関連する `isActive` 判定を `activeGroups.includes(groupName)` に変更。

---

## 非機能要件

- `multiGroupMode` のデフォルトは `false`（切り替えモード）
- 既存ユーザーの `currentSelectedGroup` は移行しない（次回ページロード時に自然にリセット）
- arc版（arc/content.js）にも同様の変更を適用

---

## スコープ外

- グループ間の優先順位設定
- 「最後に使ったグループ」の履歴
