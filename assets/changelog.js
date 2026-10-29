/* userkit の更新履歴。トップ(最近の更新)と changelog/ が読む。kit.js の後に読み込む。
   [日付, ツールの id の配列(全体のことは空), 文]。新しいものを上に足す。
   不具合を直した項目は「〜を修正」、機能を足した項目は「〜を追加」「〜できるように」で結ぶ */
(function () {
  'use strict';
  Kit.CHANGELOG = [
    ['2026-10-29', ['usercard'], 'ホロカードを追加。user のプロフィールをホロ箔や単色の箔押しのトレーディングカード風にして、画像（PNG）と短い動画（MP4）で保存できる'],
    ['2026-10-29', [], 'トップページと、各ツール共通のメニューのデザインを変更。ツールを目的別に並べた'],
    ['2026-10-29', [], '更新履歴のページを追加'],
    ['2026-10-28', ['talklog'], '「3. 書き出したログを見る」に、Talklog Viewer（別のページ）へのリンクを追加'],
    ['2026-10-12', ['talklog'], '1.1.1: 自動でさかのぼって集めたとき、まれに途中の発言がひとまとまりずつ別の位置（先頭など）にずれて並ぶのを修正'],
    ['2026-10-09', ['usersns'], 'LINE 風のトーク画面、Twitter 風のプロフィール画面とリプ画面を追加'],
    ['2026-10-09', ['usersns'], 'Twitter 風のプロフィールで、場所・リンク・誕生日・利用開始日を出すかどうか選べるように'],
    ['2026-10-08', ['usersns'], 'SNS 風画面を追加。セットログ風の Vlog 画面（2〜4 人）、インスタ風の投稿とストーリーを作って画像で保存できる'],
    ['2026-10-07', ['talklog'], '1.1.0: トーク名を取り込むように。読み飛ばした所があれば、書き出した後に知らせるように'],
    ['2026-10-07', ['talklog'], 'zeta のトーク画面の、下から積んでいくスクロールに対応'],
    ['2026-10-07', ['userpair', 'userline'], '色を画像からスポイトで拾ったり、自分で決めたりできるように'],
    ['2026-10-07', ['userprof'], '目印の色を自由に選べるように。zeta のユーザープロフィール（1000 字）を保存して、字数を数えながら 1000 字に収める「zetaプロフ」を追加'],
    ['2026-10-07', [], 'userkit を公開（userprof・usermask・talklog・userpair・userline）']
  ];

  /** 1 項目を <li> に。札はツール名(全体のことは userkit)、ツールの札はそのページへのリンク */
  Kit.changeItem = function (entry) {
    const [, tools, text] = entry, h = U.h;
    const tags = tools.length
      ? tools.map((id) => h('a.ch-tag', { href: Kit.toolUrl(id), style: { '--tint': Kit.tintOf(id) } }, id))
      : [h('span.ch-tag.all', 'userkit')];
    return h('li.ch-item', h('span.ch-tags', tags), h('span.ch-text', text));
  };
  /** 日付ごとに束ねる → [[日付, [項目…]], …] */
  Kit.changeDays = function (list) {
    const days = [];
    for (const e of list) {
      const last = days[days.length - 1];
      if (last && last[0] === e[0]) last[1].push(e); else days.push([e[0], [e]]);
    }
    return days;
  };
  /** 2026-10-29 → 2026年10月29日 */
  Kit.fmtDay = function (d) {
    const [y, m, dd] = d.split('-').map(Number);
    return `${y}年${m}月${dd}日`;
  };
})();
