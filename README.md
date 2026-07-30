# missneo

みすねお

## 何

misskeyにPaintBBS NEOでお絵描きするブックマークレットです。

## 使い方

![この画面](images/note.png)

misskeyのノートする画面を呼び出し、以下のブックマークレットを起動します。

```javascript
javascript:(function(){const s=document.createElement('script');s.charset='UTF-8';s.src='https://neo.sakots.net/missneo.js?'+Date.now();document.head.appendChild(s);})();
```

## 開発用

Typescriptとpnpmを使用します。
gitでリポジトリをクローンして開発します。

```bash
pnpm install
```

## 更新履歴

### [2026/07/30]

- リポジトリ生やした
