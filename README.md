# userkit

AIチャット「zeta」で使う、自分のキャラクター（user）のための非公式ツール集です。
すべてブラウザだけで動き、入力した文字や画像はその端末の中だけで処理・保存されます（サーバーへの送信・アカウント登録はありません）。

**サイト**: https://purity0km-droid.github.io/userkit/

| ツール | できること |
|---|---|
| [userprof](https://purity0km-droid.github.io/userkit/userprof/) | userのプロフィール・年表・設定メモ・画像を、プロットごとにまとめて保存。zetaのユーザープロフィール(1000字)を丸ごと保存して、字数を数えながら1000字に収める道具も |
| [usermask](https://purity0km-droid.github.io/userkit/usermask/) | スクショのユーザー名・アイコンを、なぞるだけで隠す。登録した名前・アイコンは次の画像から自動で見つける |
| [talklog](https://purity0km-droid.github.io/userkit/talklog/) | zeta（Web版）のトークを、吹き出しのまま読めるHTMLファイルに保存。書き出したログの閲覧・テキスト化も |
| [userpair](https://purity0km-droid.github.io/userkit/userpair/) | 2人（または1人）のキャラシートを作って画像で保存 |
| [userline](https://purity0km-droid.github.io/userkit/userline/) | プロフィール・年表・まとめ・関係を1枚にしたタイムライン風ペアカードを画像で保存 |
| [usersns](https://purity0km-droid.github.io/userkit/usersns/) | セットログ風のVlog画面(2〜4人)・インスタ風の投稿(タグ付け)・ストーリーを、1つの画面で切り替えて作って画像で保存 |

## 注意

- zeta公式とは関係のない、ファンメイドのツールです。
- データはブラウザに保存されます。閲覧履歴やサイトデータを消すと失われるため、各ツールの「保存」「バックアップ」でファイルに書き出してください。
- talklog は zeta の画面の作りに合わせて動いています。zeta 側の変更で動かなくなることがあります。

## 開発

ビルドは不要です（素の HTML / CSS / JavaScript）。ローカルで確認するときは、このフォルダで簡単なサーバーを立てて開きます。

```
python -m http.server 5175
```

→ http://127.0.0.1:5175/

- `assets/` … 共通の部品（kit.js / kit.css：共通バー・ダイアログなど、editor.js / editor.css：userpair・userline・usersns の編集部品）
- `dev/zeta-mock.html` … talklog の収集スクリプトを確かめるための模擬トーク画面（zeta の画面ではありません）

PNG書き出し（userpair / userline / usersns）には [html-to-image](https://github.com/bubkoo/html-to-image)（MIT）を CDN から読み込んで使っています。
