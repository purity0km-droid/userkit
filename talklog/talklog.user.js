// ==UserScript==
// @name         talklog (zetaトーク保存)
// @namespace    https://purity0km-droid.github.io/userkit/
// @version      1.3.0
// @description  zetaのトーク画面に「talklog」ボタンを出し、トークを吹き出しのまま読めるHTMLファイルに保存します。内容はどこにも送信しません。
// @author       userkit
// @match        https://zeta-ai.io/*
// @match        https://*.zeta-ai.io/*
// @match        https://frame.pingpong.ai/*
// @require      https://purity0km-droid.github.io/userkit/talklog/collector.js?v=1.3.0
// @grant        none
// @run-at       document-idle
// @homepageURL  https://purity0km-droid.github.io/userkit/talklog/
// @updateURL    https://purity0km-droid.github.io/userkit/talklog/talklog.user.js
// @downloadURL  https://purity0km-droid.github.io/userkit/talklog/talklog.user.js
// ==/UserScript==

// 本体は @require の collector.js です。
// zeta のトーク画面は frame.pingpong.ai の枠(iframe)の中にあるので、その中でも動かします(@noframes は付けない)。
// 枠の中の右下に「talklog」ボタンが出ます。保存は zeta のページ(zeta-ai.io)側で動いている同じスクリプトが行います。
// (パネルの使い方は talklog のページを見てください)
