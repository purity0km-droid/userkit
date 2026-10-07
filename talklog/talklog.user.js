// ==UserScript==
// @name         talklog (zetaトーク保存)
// @namespace    https://purity0km-droid.github.io/userkit/
// @version      1.0.0
// @description  zetaのトーク画面に「talklog」ボタンを出し、トークを吹き出しのまま読めるHTMLファイルに保存します。内容はどこにも送信しません。
// @author       userkit
// @match        https://zeta-ai.io/*
// @match        https://*.zeta-ai.io/*
// @require      https://purity0km-droid.github.io/userkit/talklog/collector.js
// @grant        none
// @run-at       document-idle
// @homepageURL  https://purity0km-droid.github.io/userkit/talklog/
// ==/UserScript==

// 本体は @require の collector.js です。読み込まれると、トーク画面の右下に「talklog」ボタンが出ます。
// (ボタンを押すと保存パネルが開きます。パネルの使い方は talklog のページを見てください)
