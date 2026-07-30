# missneo

みすねお

## 何

misskeyにPaintBBS NEOでお絵描きするブックマークレットです。

PaintBBS NEO: [funige/neo](https://github.com/funige/neo/tree/master)

## 使い方

![この画面](images/note.png)

misskeyのノートする画面を呼び出し、以下のブックマークレットを起動します。

```javascript
javascript:(function(){const s=document.createElement('script');s.charset='UTF-8';s.src='https://neo.sakots.net/missneo.js?'+Date.now();document.head.appendChild(s);})();
```

1. Misskeyでノート作成画面を開きます。
2. ブックマークレットを起動して、PaintBBS NEOで絵を描きます。
3. NEOの「投稿」を押します。
4. 対応するMisskeyでは画像がノートへ貼り付けられます。自動で貼り付けられなかった場合は、フォーカスされたノート欄で `Ctrl+V`（Macは `⌘V`）を押してください。

画像のクリップボード書き込みには、HTTPSで配信されたMisskeyと、画像のClipboard APIに対応したブラウザが必要です。(google chromeとmicrosoft edgeは対応しています。)

## ブックマークレットの使い方

### google chromeの場合

ブックマークメニューの「ページを追加」を選びます。

![alt text](images/bookmark1.png)

続いてわかりやすい名前と上記使い方のjavascriptを貼り付けて決定してください。

![alt text](images/bookmark2.png)

### microsoft edgeの場合

edgeはメニューからのブックマークレット新規作成ができません。
既存のブックマークをコピーし、編集してURLを上記javascriptに変更してください。
その後、ブックマークレットの名前はいいかんじに設定してください。

## 開発用

Typescriptとpnpmを使用します。
gitでリポジトリをクローンして開発します。

```bash
pnpm install
pnpm run build
```

ソースは `src/missneo.ts`、配信用ファイルは `missneo.js` です。

## 更新履歴

### [2026/07/30]

- PaintBBS NEOのお絵描き画面と、PNGのクリップボード貼り付け機能を追加
- リポジトリ生やした
