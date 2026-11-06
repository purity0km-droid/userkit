/* userhome — 間取り図(見本)。
   設定文を語の辞書と決まりで読み取り(AI には送らない)、階ごとの部屋の表にする。表から、階段とエレベーターを全階で同じ位置に置き、
   水回りをなるべく上下に寄せて、部屋を指定の広さで割り付けた案を 3 つ作る。図は canvas で描く(階ごと・全階・断面、物件チラシ風と手帳の手描き風)。
   大きさの単位は半間(0.91 m)のます目。1 畳 = ます目 2 つ。保存は Ed(IndexedDB の userkit-editor、キー userhome) */
(function () {
  'use strict';
  const { h, icon } = U;
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const GRID_M = 0.91;   // ます目 1 つの長さ(m)
  const TSUBO = 3.30579; // 1 坪(㎡)

  /* ================================================================ 辞書 */
  // 部屋の種類: [見出しの名前, 分類, 初めの畳数, 書き方(長いものから探す)]
  const ROOMS = {
    entry: ['玄関', 'entry', 2, ['玄関ホール', 'エントランスホール', '玄関', 'エントランス']],
    living: ['リビング', 'living', 14, ['リビングダイニング', 'リビング', '居間', 'LDK', 'ラウンジ']],
    family: ['ファミリールーム', 'living', 10, ['ファミリールーム']],
    sun: ['サンルーム', 'living', 8, ['サンルーム']],
    dining: ['ダイニング', 'living', 6, ['ダイニングキッチン', 'ダイニング', '食堂']],
    kitchen: ['キッチン', 'kitchen', 5, ['アイランドキッチン', 'キッチン', '台所', '厨房']],
    master: ['主寝室', 'bed', 10, ['主寝室', 'マスターベッドルーム']],
    bed: ['寝室', 'bed', 7, ['子ども部屋', '子供部屋', 'ベッドルーム', '寝室']],
    room: ['洋室', 'living', 7, ['洋室', '居室']],
    study: ['書斎', 'study', 5, ['書斎', '仕事部屋', 'ワークスペース', 'アトリエ']],
    library: ['書庫', 'study', 5, ['書庫', '図書室']],
    bath: ['浴室', 'wet', 3, ['ユニットバス', 'バスルーム', '浴室', '風呂場', 'お風呂', '風呂']],
    onsen: ['露天風呂', 'wet', 4, ['露天風呂', 'ジャグジー']],
    wash: ['洗面所', 'wet', 2, ['パウダールーム', 'ランドリールーム', '洗面脱衣所', '洗面脱衣室', '洗面所', '脱衣所', '脱衣室', '洗面']],
    toilet: ['トイレ', 'wet', 1, ['トイレ', '化粧室', 'お手洗い']],
    guest: ['客間', 'living', 6, ['ゲストルーム', '応接間', '応接室', '客間', '来客用の部屋']],
    washitsu: ['和室', 'living', 6, ['和室', '畳の部屋', '茶室']],
    closet: ['クローゼット', 'service', 3, ['ウォークインクローゼット', 'ドレッシングルーム', 'ウォークイン', 'クローゼット', '衣装部屋']],
    shoes: ['シューズクローク', 'service', 2, ['シューズインクローゼット', 'シューズクローゼット', 'シューズクローク']],
    pantry: ['パントリー', 'service', 2, ['パントリー', '食品庫']],
    utility: ['ユーティリティ', 'service', 3, ['ユーティリティルーム', 'ユーティリティ', '家事室']],
    storage: ['納戸', 'service', 2, ['納戸', '倉庫', '物置']],
    garage: ['ガレージ', 'parking', 16, ['ガレージ', '駐車場', '車庫']],
    studio: ['スタジオ', 'hobby', 10, ['レコーディングスタジオ', 'スタジオ']],
    sound: ['防音室', 'hobby', 8, ['防音室']],
    gym: ['ジム', 'hobby', 8, ['トレーニングルーム', 'ジム']],
    theater: ['シアター', 'hobby', 10, ['ホームシアタールーム', 'ホームシアター', 'シアタールーム', 'シアター', '映画室']],
    pool: ['プール', 'wet', 12, ['プール']],
    cellar: ['ワインセラー', 'service', 3, ['ワインセラー', 'セラー']],
    basement: ['地下室', 'hobby', 10, ['地下室']],
    terrace: ['テラス', 'outdoor', 8, ['ルーフバルコニー', 'ウッドデッキ', 'バルコニー', 'ベランダ', 'テラス', 'デッキ']],
    garden: ['庭', 'outdoor', 12, ['中庭', 'ガーデン', '庭']],
    pet: ['猫部屋', 'service', 2, ['猫部屋', 'ペットの部屋', 'キャットウォーク']]
  };
  // 決まった置き場所の物(階段・エレベーター・収納・廊下・屋上の床・部屋のない階)
  const FIXED = { stairs: ['階段', 'core'], ev: ['EV', 'core'], store: ['収納', 'service'], hall: ['廊下', 'hall'], deck: ['屋上', 'outdoor'], empty: ['空き', 'empty'] };
  // 空き・屋上の床は、部屋を置いていない所。重なりを数えず、つかめないようにする
  const isFill = (id) => /^(empty|deck)/.test(id);
  // 床の色(分類ごと)。物件のチラシに多い淡い色にそろえる
  const CAT_COLOR = {
    entry: '#e8e3d9', living: '#fcefd0', kitchen: '#fcefd0', bed: '#fbe4d5', study: '#e2ebf7', wet: '#d9ecf5', service: '#f0eee8',
    parking: '#e5e5e5', hobby: '#ebe4f5', outdoor: '#e7e9e1', core: '#f2f2f0', hall: '#f6efe1', empty: '#f1f1ee'
  };
  // 分類の色と違う床にする種類(畳・テラス・庭・プール・屋上の床)
  const TYPE_COLOR = { washitsu: '#e3e7c1', terrace: '#ead9bd', garden: '#d7eacb', pool: '#d9ecf5', deck: '#e7e9e1' };
  // 部屋の名前の前につく言葉(「メイン浴室」「地下浴室」のように、名前に含めて残す)
  const PREFIX_RE = /(メイン|サブ|ゲスト|地下|屋上|来客用|子ども用|専用)$/;
  // 部屋や階の様子を表す言葉
  const ATTRS = ['完全防音', '防音', '独立排水', '大理石', '猫足', '檜', 'ヒノキ', '吹き抜け', '天窓', '床暖房', '暖炉', 'ガラス張り', '鍵付き', '窓のない', '螺旋階段'];
  // 建物の種類 [見出し, 書き方, 足もとの縦横比の目安(ます目の幅, 奥行き)]。上から順に探す。実際の大きさは部屋の広さから決める(footCandidates)
  const BUILDINGS = [
    ['ワンルーム', ['ワンルーム', '1R', '1K'], [4, 8]],
    ['タワーマンション', ['タワーマンション', 'タワマン'], [10, 8]],
    ['ペントハウス', ['ペントハウス'], [12, 9]],
    ['マンション一棟', ['マンション一棟', '一棟'], [9, 13]],
    ['洋館', ['洋館'], [14, 11]],
    ['屋敷', ['屋敷', '邸宅'], [14, 11]],
    ['別荘', ['別荘'], [12, 9]],
    ['ビル', ['ビル'], [9, 13]],
    ['一軒家', ['一軒家', '一戸建て', '戸建て', '平屋'], [10, 9]],
    ['アパート', ['アパート'], [10, 8]],
    ['マンション', ['マンション'], [10, 8]]
  ];
  const PETS_RE = /(黒猫|白猫|三毛猫|子猫|猫|柴犬|子犬|犬|うさぎ|ウサギ|インコ|ハムスター|フェレット)(?:の)?([ァ-ヶー]{2,8}|「[^」]{1,10}」)?/;

  /* ================================================================ 読み取り */
  const KANJI_NUM = { 〇: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  /** 「十二」「三」などの漢数字を数字にする(百以上は扱わない) */
  function kanjiToNum(t) {
    return t.replace(/[一二三四五六七八九十〇]+(?=\s*(階|台|部屋|畳|帖|つ|室))/g, (m) => {
      if (m === '十') return '10';
      const ten = m.indexOf('十');
      if (ten < 0) return String([...m].reduce((v, c) => v * 10 + KANJI_NUM[c], 0));
      const a = ten === 0 ? 1 : KANJI_NUM[m[0]], b = ten === m.length - 1 ? 0 : KANJI_NUM[m[m.length - 1]];
      return String(a * 10 + b);
    });
  }
  // 「1・2階」は「1階・2階」と同じに読む
  const normText = (t) => kanjiToNum(String(t || '').normalize('NFKC')).replace(/(地下\s*)?(\d+)\s*[・,]\s*(?=\d+\s*(?:階|F))/g, (m, b, n) => `${b || ''}${n}階・${b || ''}`);
  // 部屋の書き方を、長いものから順に並べた一覧 [書き方, 種類]
  const ROOM_WORDS = Object.entries(ROOMS).flatMap(([type, r]) => r[3].map((w) => [w, type])).sort((a, b) => b[0].length - a[0].length);
  const floorKeyOf = (n) => (n > 0 ? String(n) : 'B' + -n);
  /**
   * 設定文 → { bld: 建物, rooms: 部屋, unread: 読み取れなかった言葉 [{ word, floor }] }。
   * 文を「。」「／」と改行で区切り、その中を「、」で区切る。階の言葉が出たら、文をまたいで次の階の言葉が出るまで、その階の部屋とみなす
   * (「2階：」の下に部屋を並べる書き方のため。階を書き忘れた文は前の階に寄るが、表で直せる)。
   * 同じ部屋に何度も触れる文章でも部屋が増えないよう、最後に mergeMentions で言及をまとめる
   */
  function parseSetting(src) {
    const text = normText(src);
    // footW・footD: 足もとの幅と奥行きを手で決めたときの値(0 = 部屋の広さから自動)
    const bld = { type: '', note: '', place: '', above: 0, below: 0, roof: false, ev: false, features: [], people: '', pets: '', floorAttrs: {}, footW: 0, footD: 0 };
    let rooms = [];
    const unread = new Map();
    const b = BUILDINGS.find(([, ws]) => ws.some((w) => text.includes(w)));
    if (b) bld.type = b[0];
    const note = text.match(/(フルリノベーション|フルリノベ|リノベーション|リノベ|改装|ヴィンテージ|築\d+年|新築)/);
    if (note) bld.note = note[1];
    const place = text.match(/([一-龥ァ-ヶ]{1,5}(?:区|市|町|村))/);
    if (place) bld.place = place[1];
    const m1 = text.match(/(?:地上\s*)?(\d+)\s*階建て/) || text.match(/地上\s*(\d+)\s*階/);
    if (m1) bld.above = Number(m1[1]);
    if (/平屋/.test(text)) bld.above = Math.max(bld.above, 1);
    const m2 = text.match(/地下\s*(\d+)\s*階/g);
    if (m2) bld.below = Math.max(...m2.map((x) => Number(x.match(/\d+/)[0])));
    if (/地下/.test(text)) bld.below = Math.max(bld.below, 1);
    bld.roof = /屋上/.test(text);
    bld.ev = /エレベーター/.test(text);
    const cam = text.match(/(外壁に)?\s*防犯カメラ\s*(\d+)?\s*台?/);
    if (cam) bld.features.push(`${cam[1] ? '外壁に' : ''}防犯カメラ${cam[2] ? ` ${cam[2]} 台` : ''}`);
    const ppl = text.match(/([^\s、。／]{1,8}?)と(?:同居|暮らし|住ん|二人暮らし)/);
    if (ppl) bld.people = `${ppl[1]}と同居`;
    // 「保護猫カフェ」の「猫」などを拾わないよう、名前のつくものを先に選ぶ
    const pets = Array.from(text.matchAll(new RegExp(PETS_RE.source, 'g'))).filter((m) => !/^(カフェ|ショップ|フード|トイレ|ハウス|タワー)/.test(m[2] || ''));
    const pet = pets.find((m) => m[2]) || pets[0];
    if (pet) {
      const sex = text.match(/(雌|雄|メス|オス)/);
      bld.pets = `${pet[1]}${pet[2] ? pet[2].replace(/[「」]/g, '') : ''}${sex ? `（${sex[1]}）` : ''}`;
    }
    // 文ごと・区切りごとに、階と部屋を拾う
    let maxAbove = 0, ctx = [], prevSize = false;   // ctx = いま有効な階(「1階と2階：」なら 2 つ)。prevSize = 前の区切りが建物の大きさの言葉だった
    let listNo = 0, prevBare = false, topic = null;   // listNo = 列挙の番号(同じ番号の部屋は別の部屋)。topic = 寸法だけの文が指す部屋
    text.split(/[。\n／/;；]+/).forEach((sent) => {
      const parts = clausesOf(sent).map((clause) => ({ clause, found: roomsIn(clause) }));
      const inSent = parts.flatMap((p) => p.found);
      // 部屋だけの行が続くときは、行をまたいで 1 つの列挙にする(「・洋室 6帖」の箇条書き)
      const bare = isBareLine(parts);
      if (!bare || !prevBare) listNo++;
      prevBare = bare;
      listNo = numberLists(parts, listNo, bare);
      parts.forEach(({ clause, found }) => {
        // 部屋の名前に含まれる「地下」「屋上」(地下室・地下浴室など)は、階の言葉として読まない
        const groups = floorGroups(found.filter((f) => /^(地下|屋上)/.test(f.label)).reduce((t, f) => t.slice(0, f.start) + '□'.repeat(f.end - f.start) + t.slice(f.end), clause));
        groups.forEach((gr) => gr.keys.forEach((k) => { if (/^\d+$/.test(k)) maxAbove = Math.max(maxAbove, Number(k)); }));
        // 「地上3階」「地下2階の建物」のような建物の大きさの言葉は、階の文脈にしない
        const sizeOnly = !found.length && groups.length > 0 && SIZE_ONLY.test(clause) && (/地上|建|まで/.test(clause) || prevSize);
        prevSize = sizeOnly;
        const attrs = ATTRS.filter((a) => clause.includes(a) && !(a === '防音' && clause.includes('完全防音')));
        const lastKeys = groups.length ? groups[groups.length - 1].keys : ctx;
        // 階の話でも部屋の話でもない文(家具の説明など)からは、部屋らしい終わり方の言葉だけを拾う
        unreadIn(clause, found, lastKeys.length > 0 || inSent.length > 0).forEach((word) => { if (!unread.has(word)) unread.set(word, lastKeys.length === 1 && lastKeys[0] !== 'ALL' ? lastKeys[0] : ''); });
        if (!found.length) {
          // 部屋の名前がなく様子だけの区切り(「地下は完全防音仕様」など)は、その階の様子にする
          if (attrs.length) groups.forEach((gr) => gr.keys.forEach((k) => { bld.floorAttrs[k] = Array.from(new Set([...(bld.floorAttrs[k] || []), ...attrs])); }));
          if (groups.length && !sizeOnly) ctx = lastKeys;
          return;
        }
        // 「1階に玄関」のように階が先なら直前の階の言葉、「玄関は1階」のように部屋が先ならすぐ後の階の言葉
        const floorFirst = groups.length > 0 && groups[0].pos < found[0].start;
        const keysOf = (f) => {
          if (!groups.length) return ctx;
          const gr = floorFirst ? groups.filter((x) => x.pos < f.start).pop() : groups.find((x) => x.pos > f.start) || groups[groups.length - 1];
          return gr.keys;
        };
        found.forEach((f, i) => {
          const floors = f.label.startsWith('地下') ? ['B'] : f.label.startsWith('屋上') ? ['R'] : keysOf(f);
          const own = f.paren ? f.paren.split(/[、・,]/).map((x) => x.trim()).filter(Boolean) : [];
          // 様子の言葉は、括弧の中のものはその部屋に、区切りの中のものは最後の部屋に付ける
          const more = i === found.length - 1 ? attrs.filter((a) => !own.some((o) => o.includes(a))) : [];
          // 同じ部屋への言及をまとめるときの覚え(mergeMentions が読んで外す)
          f.mention = { word: f.word, list: f.list, tag: f.tag, size: f.size, dim: 0, apart: !!f.apart, many: f.count > 1 || floors.length > 1 || floors[0] === 'ALL' };
          // 「洋室×2」は個数だけ、「1階と2階にトイレ」は階ごとに置く
          (floors.length ? floors : ['']).forEach((floor) => {
            for (let n = 0; n < clamp(f.count, 1, MAX_COUNT); n++) rooms.push({ id: U.uid(), floor, name: f.label, type: f.type, tatami: f.size || ROOMS[f.type][2], attrs: own.concat(more), cand: false, mention: f.mention });
          });
        });
        // 複数の階にまとめて置く言葉は、後の文に引き継がない
        if (groups.length && lastKeys.length === 1 && lastKeys[0] !== 'ALL') ctx = lastKeys;
      });
      // 「横幅3m、奥行き2m」は、その文の部屋の広さにする。文に部屋がなければ前の文の部屋。部屋が多くてどれか分からなければ使わない
      const labelled = inSent.find((f) => f.labelled);
      const target = inSent.length ? (inSent.length === 1 ? inSent[0] : labelled) : topic;
      const dim = dimsIn(sent);
      if (dim && target) target.mention.dim = dim;
      if (inSent.length) topic = labelled || inSent[inSent.length - 1];
    });
    bld.above = Math.max(bld.above, maxAbove, 1);
    // 「各階に〜」は地上のすべての階に置く(地下は含めない)。階の数が決まってから広げる
    rooms = rooms.flatMap((r) => (r.floor === 'ALL' ? Array.from({ length: bld.above }, (_, i) => Object.assign({}, r, { id: U.uid(), floor: String(i + 1), attrs: r.attrs.slice() })) : [r]));
    if (rooms.some((r) => r.floor === 'R')) bld.roof = true;
    if (rooms.some((r) => r.floor.startsWith('B'))) bld.below = Math.max(bld.below, 1);
    rooms = mergeMentions(rooms, bld);
    // 書いていなくても、地上と地下を合わせて 4 階以上ならエレベーターを置く(表で外せる)
    if (bld.above + bld.below >= 4) bld.ev = true;
    // 書いていない部屋は勝手に足さず、「候補」として薄く出す(玄関・防音の階の防音室)
    if (!rooms.some((r) => r.type === 'entry')) rooms.push({ id: U.uid(), floor: '1', name: '玄関', type: 'entry', tatami: 2, attrs: [], cand: true });
    Object.entries(bld.floorAttrs).forEach(([k, a]) => {
      const keys = k === 'B' ? basementKeys(bld) : k === 'ALL' ? [] : [k];
      if (a.some((x) => /防音/.test(x))) keys.forEach((key) => { if (!rooms.some((r) => effFloor(r, bld) === key)) rooms.push({ id: U.uid(), floor: key, name: '防音室', type: 'sound', tatami: 8, attrs: [], cand: true }); });
    });
    return { bld, rooms, unread: Array.from(unread, ([word, floor]) => ({ word, floor })) };
  }
  const basementKeys = (bld) => Array.from({ length: bld.below }, (_, i) => 'B' + (i + 1));
  const MAX_COUNT = 20;   // 「洋室×2」の個数の上限
  // この字だけで隔たった部屋どうしは、同じ列挙の別の部屋
  const LIST_GAP = /^(?:[\s、,・&+とや]|および|及び)*$/;
  // 部屋だけの行に、部屋のほかにあってよい字(行頭の記号と「2階に」の「に」)
  const BARE_LINE = /^[\s、,・&+とやに:\-*•●○◎◆◇■□★☆※[\]【】]*$/;
  /** 文に部屋があり、階の言葉と部屋のほかに何も書いていないか */
  function isBareLine(parts) {
    return parts.some((p) => p.found.length) && parts.every(({ clause, found }) => {
      let pos = 0, t = '';
      found.forEach((f) => { t += clause.slice(pos, f.head); pos = f.tail; });
      return BARE_LINE.test((t + clause.slice(pos)).replace(FLOOR_RE, ''));
    });
  }
  /** 文の中の部屋に列挙の番号を振り、最後の番号を返す。bare は部屋だけの行で、先頭の記号を列挙の切れ目にしない */
  function numberLists(parts, start, bare) {
    let no = start, gap = '', first = true;
    parts.forEach(({ clause, found }) => {
      let pos = 0;
      found.forEach((f) => {
        gap += clause.slice(pos, f.head);
        if (!(first && bare) && !LIST_GAP.test(gap)) no++;
        f.list = no;
        first = false;
        // 「1LDK」は間取りの言葉なので、次の部屋と列挙にしない
        gap = /\d$/.test(clause.slice(0, f.head)) ? '×' : '';
        pos = f.tail;
      });
      gap += clause.slice(pos) + '、';
    });
    return no;
  }
  const LENGTH_RE = /(\d+(?:\.\d+)?)\s*(?:[~〜-]\s*(\d+(?:\.\d+)?)\s*)?(?:m|メートル)(?![A-Za-z0-9])/g;
  const SQM_PER_JO = 1.62;
  // 家具や廊下の寸法は、部屋の広さにしない
  const NOT_ROOM_SIZE = /廊下|階段|エレベーター|ソファ|ベッド|テーブル|カーテン|カウンター|デスク|本棚|ラグ|テレビ|浴槽|バスタブ/;
  /** 文の中の「3m×2m」「横幅3〜4m、奥行き1.5〜1.8m」を帖数にする(範囲は真ん中の値。0.5 帖刻み)。なければ 0 */
  function dimsIn(sent) {
    if (NOT_ROOM_SIZE.test(sent) || !/[×xX*]|幅|奥行|間口|縦|横/.test(sent)) return 0;
    const len = Array.from(sent.matchAll(LENGTH_RE), (m) => (m[2] ? (Number(m[1]) + Number(m[2])) / 2 : Number(m[1])));
    return len.length < 2 ? 0 : clamp(Math.round((len[0] * len[1] / SQM_PER_JO) * 2) / 2, 1, 60);
  }
  // LDK がある階では、リビングとダイニングは LDK の一部
  const LDK_PART = new Set(['リビングダイニング', 'リビング', '居間', 'ダイニングキッチン', 'ダイニング', '食堂']);
  // 同じ種類でも別の部屋を指す言葉(ここにない書き方は、同じ種類なら同じ部屋の言い換えとみなす)
  const OWN_ROOM = {
    子ども部屋: '子供部屋', 子供部屋: '子供部屋', ラウンジ: 'ラウンジ', アトリエ: 'アトリエ', ワークスペース: 'ワークスペース', ジャグジー: 'ジャグジー',
    パウダールーム: 'パウダールーム', ランドリールーム: 'ランドリールーム', 応接間: '応接', 応接室: '応接', 茶室: '茶室',
    ウォークインクローゼット: 'ウォークイン', ウォークイン: 'ウォークイン', ドレッシングルーム: '衣装部屋', 衣装部屋: '衣装部屋',
    ルーフバルコニー: 'ルーフバルコニー', ウッドデッキ: 'デッキ', デッキ: 'デッキ', テラス: 'テラス', 中庭: '中庭'
  };
  /**
   * 同じ部屋への言及を 1 つにまとめる。同じ階・同じ部屋の言葉なら、畳数は書いてある値、名前は最初の書き方、様子は合わせたものにする。
   * 迷うときは別の部屋のままにする。別のまま: 同じ列挙の中(個数で増やした分も) / 畳数が互いに違う / 印が違う(メイン浴室とサブ浴室、洋室Aと洋室B) / 「もう一つの」。
   * LDK がある階のリビングとダイニングは列挙でも畳数が違っても LDK にまとめ、畳数は LDK に書いてある値を先に使う
   */
  function mergeMentions(rooms, bld) {
    const floorOf = (r) => effFloor(r, bld);
    const ldkFloors = new Set(rooms.filter((r) => r.mention.word === 'LDK').map(floorOf));
    const out = [];
    rooms.forEach((r) => {
      const m = r.mention, part = !m.apart && !m.many && LDK_PART.has(m.word) && ldkFloors.has(floorOf(r));
      const key = part || m.word === 'LDK' ? 'LDK' : OWN_ROOM[m.word] || r.type;
      const g = m.apart ? null : out.find((x) => x.key === key
        && (!x.room.floor || !r.floor || floorOf(x.room) === floorOf(r))
        && (!x.tag || !m.tag || x.tag === m.tag)
        && (part || (!x.lists.has(m.list) && (!x.size || !m.size || x.size === m.size))));
      if (!g) {
        if (part) Object.assign(r, { name: 'LDK', type: 'living' });
        out.push({ key, room: r, tag: m.tag, lists: new Set([m.list]), size: part ? 0 : m.size, partSize: part ? m.size : 0, dim: m.dim });
        return;
      }
      g.lists.add(m.list);
      if (part) g.partSize = g.partSize || m.size;
      else g.size = m.size || g.size;
      g.tag = g.tag || m.tag;
      g.dim = g.dim || m.dim;
      if (!g.room.floor) g.room.floor = r.floor;
      g.room.attrs = Array.from(new Set([...g.room.attrs, ...r.attrs]));
    });
    return out.map(({ room, size, partSize, dim }) => {
      const { mention, ...clean } = room;
      return Object.assign(clean, { tatami: size || partSize || dim || ROOMS[room.type][2] });
    });
  }
  /** 文を「、」で区切る。括弧の中では切らず、「1階、2階にトイレ」は 1 つの区切りにする */
  function clausesOf(sent) {
    const out = [];
    let depth = 0, cur = '';
    for (const c of sent) {
      if (c === '（' || c === '(') depth++;
      else if (c === '）' || c === ')') depth = Math.max(0, depth - 1);
      if (!depth && (c === '、' || c === ',')) { out.push(cur); cur = ''; } else cur += c;
    }
    out.push(cur);
    for (let i = out.length - 2; i >= 0; i--) {
      const m = out[i].match(/^\s*(地下\s*)?(\d+)\s*(?:階|F)?\s*$/);
      if (m && /^\s*(?:地下\s*)?\d+\s*(?:階|F)/.test(out[i + 1])) out.splice(i, 2, `${m[1] || ''}${m[2]}階・${out[i + 1]}`);
    }
    return out;
  }
  // 階の言葉: 地下N階 / BN / N階・NF / 屋上 / 地下(地下の階のどこか) / 最上階 / 各階。「N階建て」は階の言葉にしない
  const FLOOR_RE = /地下\s*(\d+)\s*(?:階|F)(?!建)|B(\d+)F?|(?:地上\s*)?(\d+)\s*(?:階|F)(?!建)|(屋上|屋根の上)|(地下)(?!\s*\d+\s*階建)|(最上階)|(各階|全階|各フロア|全フロア|どの階にも|すべての階|全ての階)/g;
  const FLOOR_JOIN = /^(?:\s|と|・|&|\+|及び|および|や|にも|も)*$/;
  const SIZE_ONLY = /^\s*(?:地上\s*\d+\s*階\s*[・と]?\s*)?(?:地下\s*\d+\s*階)?\s*(?:建て?|まで|の建物)?\s*$/;
  /**
   * 区切りの中の階の言葉を、前から順の組 [{ pos, keys }] にする。「1階と2階」は 1 つの組に階が 2 つ。
   * 階は '2'・'B1'、地下だけなら 'B'(地下の階のどこか)、屋上は 'R'、最上階は 'TOP'、各階は 'ALL'
   */
  function floorGroups(clause) {
    const groups = [];
    for (const m of clause.matchAll(FLOOR_RE)) {
      const key = m[1] ? 'B' + m[1] : m[2] ? 'B' + m[2] : m[3] || (m[4] ? 'R' : m[5] ? 'B' : m[6] ? 'TOP' : 'ALL');
      const last = groups[groups.length - 1], end = m.index + m[0].length;
      if (last && FLOOR_JOIN.test(clause.slice(last.end, m.index))) { last.keys.push(key); last.end = end; }
      else groups.push({ pos: m.index, end, keys: [key] });
    }
    return groups;
  }
  // 部屋の後ろに続く書き方: 括弧 / 広さ(「20帖」「は約20帖」) / 個数(「×2」「が2部屋」)
  const AFTER_PAREN = /^\s*[（(]([^）)]{1,40})[）)]/;
  const AFTER_AREA = /^\s*(?:の広さ)?(?:[はがも:=]\s*)?(?:約|およそ)?\s*(\d+(?:\.\d+)?)\s*(?:帖|畳)/;
  const AFTER_COUNT = /^\s*(?:[はがをも]\s*)?(?:[×xX*]\s*(\d+)|(\d+)\s*(?:つ|部屋|室|個))/;
  // 部屋の前に置く書き方(「20帖のリビング」「2部屋の洋室」)
  const BEFORE_AREA = /(?:約|およそ)?\s*(\d+(?:\.\d+)?)\s*(?:帖|畳)\s*(?:ほど|くらい|ぐらい)?\s*の?\s*$/;
  const BEFORE_COUNT = /(\d+)\s*(?:つ|部屋|室|個)\s*の?\s*$/;
  // 「もう一つの寝室」「別の寝室」は、前に出た部屋とは別の部屋
  const APART_BEFORE = /(?:もう\s*(?:1\s*つ|ひとつ)の?|(?:別|他|ほか)の|\d+\s*(?:つ目|番目)の?)\s*$/;
  // 「洋室A」「寝室2」の印。「寝室2階」「洋室2つ」のような数は印にしない
  const AFTER_MARK = /^(?:[A-Z]|\d)(?![A-Za-z0-9.]|\s*(?:帖|畳|つ|部屋|室|個|階|台|人|m))/;
  // 部屋の言葉に続くと、部屋でなく物の名前になる言葉(洗面台・ダイニングテーブル・トイレットペーパーなど)
  const THING_AFTER = /^(?:テーブル|チェア|セット|カウンター|ボード|マット|ペーパー|ットペーパー|ブラシ|台|器|ボウル|用具|道具|家電|ツール|用品|上がり|乾燥機|桶|敷)/;
  // 総称。「全室洋室」「各部屋にクローゼット」の部屋の言葉は、部屋として数えない
  const GENERIC = '(?:全室|全居室|全部屋|各室|各部屋|全部の部屋|すべての部屋|全ての部屋|どの部屋)(?:とも|が|は|に|にも|も)?';
  const GENERIC_BEFORE = new RegExp(`${GENERIC}\\s*$`);
  const GENERIC_WORDS = new RegExp(`${GENERIC}\\s*(?:${ROOM_WORDS.map((w) => w[0]).join('|')})?`, 'g');
  /**
   * 区切りの中の部屋 [{ start, end, head, tail, type, word, tag, label, paren, size, count, apart, labelled }]。長い書き方から探し、見つけた所は塗りつぶして重ねて拾わない。
   * start・end は名前の範囲(前に付く語も含む)、head・tail は前に置いた広さや後ろの括弧まで含めた範囲。広さと個数は、前に置く書き方を先に、次に後ろに続く書き方を読む
   */
  function roomsIn(clause) {
    let rest = clause;
    const out = [];
    ROOM_WORDS.forEach(([w, type]) => {
      let i = rest.indexOf(w);
      while (i >= 0) {
        const pre = rest.slice(Math.max(0, i - 4), i).match(PREFIX_RE);
        const start = i - (pre ? pre[1].length : 0);
        if (!THING_AFTER.test(clause.slice(i + w.length)) && !GENERIC_BEFORE.test(clause.slice(0, start))) {
          out.push({ start, end: i + w.length, head: start, tail: i + w.length, type, word: w, tag: pre ? pre[1] : '', label: (pre ? pre[1] : '') + w, paren: '', size: 0, count: 0 });
        }
        rest = rest.slice(0, i) + '□'.repeat(w.length) + rest.slice(i + w.length);
        i = rest.indexOf(w);
      }
    });
    out.sort((a, b) => a.start - b.start);
    let done = 0;   // ここまでの字は、前の部屋の広さや個数として読んだ
    out.forEach((f, n) => {
      const next = n + 1 < out.length ? out[n + 1].start : clause.length;
      let head = clause.slice(done, f.start), m;
      f.apart = APART_BEFORE.test(head);
      if ((m = head.match(BEFORE_COUNT))) { f.count = Number(m[1]); f.head = done + m.index; head = head.slice(0, m.index); }
      if ((m = head.match(BEFORE_AREA))) { f.size = Number(m[1]); f.head = done + m.index; }
      let tail = clause.slice(f.end, next), pos = f.end;
      if ((m = tail.match(AFTER_MARK))) { f.tag = f.tag || m[0]; tail = tail.slice(m[0].length); pos += m[0].length; }
      for (;;) {
        if (!f.paren && (m = tail.match(AFTER_PAREN))) {
          // 括弧の中の広さと個数を読み、残りを様子にする(「洋室（6帖×2）」「書斎（約5帖・防音）」)
          let inner = m[1], k;
          if ((k = inner.match(/(?:約|およそ|各)*\s*(\d+(?:\.\d+)?)\s*(?:帖|畳)/))) { if (!f.size) f.size = Number(k[1]); inner = inner.replace(k[0], ''); }
          if ((k = inner.match(/[×xX*]\s*(\d+)|(\d+)\s*(?:つ|部屋|室|個)/))) { if (!f.count) f.count = Number(k[1] || k[2]); inner = inner.replace(k[0], ''); }
          f.paren = inner.replace(/^[\s、・,]+|[\s、・,]+$/g, '');
        } else if (!f.size && (m = tail.match(AFTER_AREA))) f.size = Number(m[1]);
        else if (!f.count && (m = tail.match(AFTER_COUNT))) f.count = Number(m[1] || m[2]);
        else break;
        tail = tail.slice(m[0].length);
        pos += m[0].length;
      }
      done = pos;
      f.tail = pos;
      f.labelled = /^\s*:/.test(clause.slice(pos));   // 「ベランダ：…」の見出しの形
    });
    return out;
  }
  // 部屋らしい言葉の終わり方。文の途中にあっても拾う
  const ROOM_LIKE = /(?:室|部屋|ルーム|ホール|スペース|コーナー|クローク|サロン|ロフト|座敷|ギャラリー|サウナ|場|間|所)$/;
  // 読み取れなかった言葉に出さない語(建物や設定の話、家具や設備、向き、ふつうの言葉で、部屋ではないもの)。クローゼットなど辞書にある部屋は入れない
  const NOT_ROOM = new Set([
    '部屋', '角部屋', '全部屋', '各部屋', '全室', '各室', '同室', '教室', '研究室', '病室', '職場', '現場', '工場', '市場', '会場', '劇場', '立場', '登場', '本場', '近場', '場所', '居場所', '間取', '設備', '構成', '詳細', '概要', '基本', '情報', '設定', '備考', 'メモ', '自宅', '住居', '全体', '家族', '夫婦', '立地', '住所', '近所', '長所', '短所', '箇所', '個所', '役所', '外観', '内装', '階数', '建築', '鉄筋', 'コンクリート', '木造', '鉄骨', '仕様', '徒歩', '眺望', '高層階', '低層階', '上層階', '和風', '洋風', 'フロア', '防犯', 'カメラ',
    '時間', '空間', '期間', '仲間', '人間', '夜間', '週間', '年間', '月間', '日間', '昼間', '瞬間', '世間', '手間', '隙間', '中間', '合間', '区間', '民間',
    'ソファ', 'ソファー', 'テレビ', 'ラグ', 'カーペット', '絨毯', 'クッション', '椅子', 'デスク', 'ドレッサー', 'タンス', '箪笥', '照明', 'シャンデリア', '冷蔵庫', 'レンジ', '電子レンジ', 'コンロ', 'シンク', 'カウンター', '食器', '調理器具', '浴槽', 'バスタブ', 'シャワー', '便器', 'エアコン', '下駄箱', '靴箱', '傘立て', '観葉植物', 'ピアノ', '家具', '家電', '洗濯物',
    '天板', '天井', '手すり', 'フローリング', '木目', 'ダークブラウン', '夜景', '景色', '自然光', '光景',
    '左手', '右手', '正面', '背後', '背面', '手前', '奥側', '突き当たり', '南向き', '北向き', '東向き', '西向き', '中央', '真ん中', '両側', '反対', '上下', '左右', '前後', '横幅', '奥行',
    '二人', '一人', '生活', '中心', '食事', '料理', '家事', '日常', '距離', '相手', '様子', '気配', '会話', '恋人'
  ]);
  // 物や向きを指す言葉の終わり方(ダブルベッド・シューズボックス・洗濯機・洗面台・左側・楕円形・別個室など)
  const THING_WORD = /(?:テーブル|ベッド|ソファ|ソファー|チェア|ボックス|カーテン|ライト|個室|機|器|台|棚|窓|戸|扉|ドア|形|側|際)$/;
  const FLOOR_THEN_NO = new RegExp(`(?:${FLOOR_RE.source})の?`, 'g');   // 階の言葉と、続く「の」(「1階のバー」)
  const KNOWN_WORDS = new RegExp([...BUILDINGS.flatMap(([, ws]) => ws), ...ATTRS, 'フルリノベーション', 'フルリノベ', 'リノベーション', 'リノベ', '改装', 'ヴィンテージ', '新築', '一棟', '建物', '階建て?', '地上', '地下', '外壁', '防犯カメラ', 'エレベーター', 'EV', '階段', '廊下', '収納'].sort((a, b) => b.length - a.length).join('|'), 'g');
  /**
   * 区切りの中で読み取れなかった部屋らしい言葉。読めた言葉を消して残った漢字・カタカナの連なりのうち、
   * 部屋らしい終わり方のものと、階や部屋の話(inRoomTalk)で区切りが名詞の列だけのとき(「1階にサウナと温室」)のものを返す
   */
  function unreadIn(clause, found, inRoomTalk) {
    let t = clause;
    // 読めた部屋は、すぐ前につながる字ごと消す(「音楽スタジオ」の「音楽」を別の言葉にしない)
    found.slice().sort((a, b) => b.start - a.start).forEach((f) => {
      let a = f.start;
      while (a > 0 && /[一-龥々ァ-ヶー]/.test(t[a - 1])) a--;
      t = t.slice(0, a) + ' '.repeat(f.end - a) + t.slice(f.end);
    });
    t = t.replace(GENERIC_WORDS, ' ').replace(/[（(][^）)]*[）)]?/g, ' ').replace(FLOOR_THEN_NO, ' ').replace(/[×xX*]\s*\d+/g, ' ')
      .replace(/(?:約|およそ|築)?\s*\d+(?:\.\d+)?\s*(?:階建て?|階|帖|畳|つ|部屋|室|個|台|坪|m2|平米|年|人|匹|歳|分|棟|F)?/g, ' ')
      .replace(new RegExp(PETS_RE.source, 'g'), ' ').replace(/[^\s、。]{1,8}?と(?:同居|暮らし|住ん|二人暮らし)/g, ' ')
      .replace(/[一-龥ァ-ヶ]{1,5}(?:区|市|町|村)/g, ' ').replace(KNOWN_WORDS, ' ');
    // 「娘の部屋」は「の」を挟むので、先に 1 つの言葉として拾う
    const owned = [];
    t = t.replace(/[一-龥々ァ-ヶー]{1,6}の部屋/g, (m) => { owned.push(m); return ' '; });
    const words = t.match(/[一-龥々ァ-ヶーA-Za-z]{2,}/g) || [];
    // 「家賃は8万円」のように、言葉のあとに帖数でない数が続く区切りは、部屋の列とみなさない
    const listLike = !(/[はが]\s*(?:約|およそ)?\d/.test(clause) && !/帖|畳/.test(clause))
      && /^[\s・にはがともやをでへ:\-~〜→■□◆◇●○◎★☆※[\]【】<>「」『』]*$/.test(t.replace(/[一-龥々ァ-ヶーA-Za-z]{2,}/g, ' '));
    const isNoise = (w) => NOT_ROOM.has(w) || THING_WORD.test(w);
    return owned.filter((w) => !NOT_ROOM.has(w.replace(/の部屋$/, ''))).concat(words.filter((w) => !isNoise(w) && w.length <= 14 && ((listLike && inRoomTalk) || ROOM_LIKE.test(w))));
  }

  /* ================================================================ 階 */
  /** 上から順の階の一覧(屋上・地上・地下) */
  function floorKeys(bld) {
    const keys = [];
    if (bld.roof) keys.push('R');
    for (let n = Math.max(1, bld.above); n >= 1; n--) keys.push(String(n));
    for (let n = 1; n <= bld.below; n++) keys.push('B' + n);
    return keys;
  }
  const floorLabel = (k) => (k === 'R' ? '屋上' : k.startsWith('B') ? k : k + 'F');
  const floorLong = (k) => (k === 'R' ? '屋上' : k.startsWith('B') ? `地下 ${k.slice(1)} 階` : `${k} 階`);
  /** 階が書いていない部屋の置き場所を、種類から決める(推定) */
  function guessFloor(r, bld) {
    const keys = floorKeys(bld), top = String(Math.max(1, bld.above)), low = bld.below ? 'B' + bld.below : '';
    switch (r.type) {
      case 'onsen': case 'terrace': return bld.roof ? 'R' : top;
      case 'garden': case 'entry': case 'garage': case 'shoes': return '1';
      case 'studio': case 'sound': case 'theater': case 'cellar': case 'basement': case 'gym': return bld.below ? 'B1' : '1';
      case 'master': case 'bed': case 'study': case 'library': case 'closet': case 'pet': return top;
      case 'storage': return low || top;
      default: return keys.includes('1') ? '1' : keys[0];
    }
  }
  /** 部屋の実際の階。'B'(地下のどこか)・'TOP'(最上階)・空欄は、建物に合わせて決める */
  function effFloor(r, bld) {
    if (r.floor === 'B') return bld.below ? 'B1' : '1';
    if (r.floor === 'TOP') return String(Math.max(1, bld.above));
    if (r.floor && floorKeys(bld).includes(r.floor)) return r.floor;
    return guessFloor(r, bld);
  }
  // 廊下に接していなくてよい部屋(ほかの部屋の奥にあってよいもの)
  const INNER = new Set(['closet', 'shoes', 'pantry', 'bath', 'storage', 'pet', 'cellar', 'onsen', 'pool', 'terrace', 'garden', 'kitchen', 'dining', 'sun']);
  // 水回りは上下の階で同じ所に寄せたいので、まとめて先に置く
  const WET_FIRST = (r) => (ROOMS[r.type][1] === 'wet' ? 0 : 1);

  /* ================================================================ 案(部屋の割り付け) */
  const VARIANTS = [
    { id: 'A', label: '案 A', desc: '階段が左、水回りを奥に', core: 'left', order: (a, b) => WET_FIRST(a) - WET_FIRST(b) },
    { id: 'B', label: '案 B', desc: '階段が右、広い部屋を奥に', core: 'right', order: (a, b) => b.tatami - a.tatami },
    { id: 'C', label: '案 C', desc: '階段が北で、部屋を南に並べる', core: 'top', order: (a, b) => WET_FIRST(a) - WET_FIRST(b) || b.tatami - a.tatami }
  ];
  // 足もとの歯止め(ます目)。階段のある建物は、階段・エレベーターと廊下が入るだけの大きさが要る
  const FOOT_MAX = 40;
  const footMin = (bld) => (floorKeys(bld).length > 1 ? 6 : 4);
  const FOOT_TRIES = 6;   // 実際に部屋を割り付けて比べる足もとの数
  const roomsOn = (s, key) => s.rooms.filter((r) => effFloor(r, s.bld) === key);
  const cellsOf = (r) => (r.tatami || ROOMS[r.type][2]) * 2;
  /**
   * 足もとの候補 [{ W, D, score }]。いちばん広い階の部屋(指定の畳数 ×2 ます)が、階段・EV・廊下を除いた所にちょうど収まる大きさを、
   * 建物の種類の縦横比に近い順に選ぶ(階段などの分は実際の列の大きさで引く。おおよそ合計の 25% になる)。
   * 手で決めた幅や奥行きがあれば、それを使う
   */
  function footCandidates(s, v) {
    const bld = s.bld, keys = floorKeys(bld), multi = keys.length > 1, min = footMin(bld);
    const base = (BUILDINGS.find(([name]) => name === bld.type) || [0, 0, [10, 9]])[2], ratio = base[0] / base[1];
    const need = Math.max(4, ...keys.map((k) => roomsOn(s, k).reduce((sum, r) => sum + cellsOf(r), 0)));
    const coreW = multi && v.core !== 'top' ? 3 : 0, coreD = multi && v.core === 'top' ? 3 : 0;
    const out = [];
    const range = (fixed) => (fixed ? [clamp(fixed, min, FOOT_MAX)] : Array.from({ length: FOOT_MAX - min + 1 }, (_, i) => min + i));
    range(bld.footW).forEach((W) => range(bld.footD).forEach((D) => {
      const spare = (W - coreW) * (D - coreD) - need;
      if (spare < -2 && !(bld.footW && bld.footD)) return;
      out.push({ W, D, score: Math.max(spare, -spare * 3) + Math.abs(Math.log(W / D / ratio)) * need * 0.6 });
    }));
    if (!out.length) out.push({ W: bld.footW || FOOT_MAX, D: bld.footD || FOOT_MAX, score: 0 });
    return out.sort((p, q) => p.score - q.score).slice(0, FOOT_TRIES);
  }
  /**
   * 重みに合わせて長方形を 2 つずつに分け、ます目にそろえる。部屋が少ないときは分け方をすべて試し、
   * 細長い部屋・指定の広さとのずれ・廊下に接しない部屋・玄関が南(下)の端から離れることが少ないものを選ぶ。
   * pref: { bottom: 南の端の y, edgeX: 廊下に接する x, edgeY: 廊下に接する y }。戻り値は { out: 置き場所, cost }
   */
  function slice(rect, items, pref, wide) {
    if (!items.length) return { out: [], cost: 0 };
    const total = items.reduce((s, x) => s + x.weight, 0);
    // 1 畳 = 2 ます。範囲全体に入りきらないときだけ(pref に scale がないとき)、同じ割合で縮める
    return split(rect, items, Object.assign({ scale: Math.min(2, (rect.w * rect.h) / total), memo: new Map(), regW: rect.w, nodes: 0, wide: wide || 1 }, pref));
  }
  const DEV_FREE = 2;     // 指定の広さとのずれをここまでは許す(ます目。2 つで 1 畳)
  const DEV_OVER = 150;   // それを超えたずれ 1 ます分の重さ。形や廊下より先に広さを守る
  // 部屋の数ごとに、先まで確かめる分け方の数(3 部屋まではすべて)
  const BEAM = { 4: 12, 5: 8, 6: 6 }, BEAM_MANY = 4;
  const NODE_LIMIT = 300; // 確かめる回数の上限(超えたら一番よさそうな分け方だけ見る)
  const STACK = new Set(['bath', 'wash', 'toilet']), STACK_COST = 4;   // 上下の階でそろえる水回りと、離れた 1 ます分の重さ
  const touchesHall = (r, ctx) => (ctx.edgeX === undefined || r.x === ctx.edgeX || r.x + r.w === ctx.edgeX) && (ctx.edgeY === undefined || r.y === ctx.edgeY);
  function leafCost(r, x, ctx) {
    const a = r.w * r.h, asp = Math.max(r.w / r.h, r.h / r.w), dev = Math.abs(a - x.weight * ctx.scale);
    // 1 : 1.5 までの形は部屋としてふつうなので軽く、それより細長いものを重く数える
    // バルコニーやテラスは細長くてよい
    let c = (x.outdoor ? Math.max(0, asp - 4) * a * 0.5 : (asp - 1) * a * 0.1 + Math.max(0, asp - 1.5) * a * 0.5) + dev * 2 + Math.max(0, dev - DEV_FREE) * DEV_OVER;
    // 幅が 1 ます(0.91 m)の部屋は通れるだけなので避ける(1 畳ほどのトイレなどはこの幅でよい)
    if (Math.min(r.w, r.h) < 2) c += x.weight <= 1.5 || x.outdoor ? 4 : 30;
    // バルコニーやテラスは、玄関の反対(上の端)に、幅いっぱいに
    if (x.far) c += (r.y !== 0 ? 60 + a * 3 : 0) + (ctx.regW - r.w) * 6;
    // バルコニーや庭は外に面する(部屋を寄せた残りの空きの中に置かない)
    if (x.outdoor && r.x > 0 && r.y > 0 && r.x + r.w < ctx.W && r.y + r.h < ctx.D) c += 40;
    // 階段のない 1 階だけの住まいでは、水回りとキッチンを玄関の側(下の半分)に寄せる
    if (x.wetNear && r.y + r.h / 2 < ctx.bottom / 2) c += a * 2;
    // 寝室や水回りなど、廊下から入る部屋は廊下に接していてほしい(クローゼットや浴室は奥でもよい)
    if ((x.hall || x.south) && !touchesHall(r, ctx)) c += x.south ? 60 : 25;
    if (x.south && r.y + r.h !== ctx.bottom) c += a * 4;
    // 浴室・洗面所・トイレは、先に決めた階の水回りの真上や真下に寄せる
    if (x.stack && ctx.anchors && ctx.anchors.length) {
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      c += Math.min(...ctx.anchors.map((p) => Math.abs(p.x - cx) + Math.abs(p.y - cy))) * STACK_COST;
    }
    return c;
  }
  /** 部屋の組を長方形 r に入れたときの、おおよその重さ(分け方を先まで確かめる前に比べる) */
  function roughCost(r, list, ctx) {
    if (list.length === 1) return leafCost(r, list[0], ctx);
    const a = r.w * r.h, asp = Math.max(r.w / r.h, r.h / r.w);
    const dev = Math.abs(a - list.reduce((sum, x) => sum + x.weight, 0) * ctx.scale);
    let c = dev + Math.max(0, dev - DEV_FREE * list.length) * DEV_OVER + Math.max(0, asp - list.length) * a * 0.5;
    if (!touchesHall(r, ctx)) c += list.filter((x) => x.hall || x.south).length * 25;
    if (r.y + r.h !== ctx.bottom && list.some((x) => x.south)) c += 40;
    if (r.y !== 0 && list.some((x) => x.far)) c += 60;
    return c;
  }
  function split(rect, items, ctx) {
    if (items.length === 1) return { out: [Object.assign({ id: items[0].id }, rect)], cost: leafCost(rect, items[0], ctx) };
    const key = `${rect.x},${rect.y},${rect.w},${rect.h}|${items.map((x) => x.id).join(',')}`;
    if (ctx.memo.has(key)) return ctx.memo.get(key);
    const n = items.length, sum = (list) => list.reduce((s, x) => s + x.weight, 0);
    // 2 つの組への分け方。どちらを前(左・上)にするかも試す(玄関を廊下の側の角に置けるように)。
    // 10 部屋を超えたら、初めの部屋を前の組に入れる分け方だけ、12 部屋を超えたら並びの順に切るだけにする
    const masks = [];
    if (n <= 10) for (let m = 1; m < (1 << n) - 1; m++) masks.push(m);
    else if (n <= 12) for (let m = 1; m < (1 << n) - 1; m += 2) masks.push(m);
    else for (let k = 1; k < n; k++) masks.push((1 << k) - 1);
    const tries = [];
    masks.forEach((m) => {
      const A = items.filter((_, i) => (m >> i) & 1), B = items.filter((_, i) => !((m >> i) & 1));
      ['w', 'h'].forEach((dir) => {
        const L = rect[dir], other = dir === 'w' ? rect.h : rect.w;
        if (L < 2) return;
        // 切る位置: 前の組の広さがちょうど入る所の両隣
        const want = (sum(A) * ctx.scale) / other;
        new Set([Math.floor(want), Math.ceil(want)].map((a) => clamp(a, 1, L - 1))).forEach((a) => {
          const r1 = dir === 'w' ? { x: rect.x, y: rect.y, w: a, h: rect.h } : { x: rect.x, y: rect.y, w: rect.w, h: a };
          const r2 = dir === 'w' ? { x: rect.x + a, y: rect.y, w: rect.w - a, h: rect.h } : { x: rect.x, y: rect.y + a, w: rect.w, h: rect.h - a };
          tries.push({ cost: roughCost(r1, A, ctx) + roughCost(r2, B, ctx), r1, r2, A, B });
        });
      });
    });
    tries.sort((p, q) => p.cost - q.cost);
    const width = ctx.nodes++ >= NODE_LIMIT * ctx.wide ? 1 : n <= 3 ? tries.length : (BEAM[n] || BEAM_MANY) * ctx.wide;
    let best = null;
    tries.slice(0, width).forEach((t) => {
      const c1 = split(t.r1, t.A, ctx), c2 = split(t.r2, t.B, ctx), cost = c1.cost + c2.cost;
      if (!best || cost < best.cost) best = { cost, c1, c2 };
    });
    // 1 ます目しかないときは、残りを重ねて置く(重なりは画面で赤く知らせる)
    const res = best ? { out: best.c1.out.concat(best.c2.out), cost: best.cost } : { out: items.map((x) => Object.assign({ id: x.id }, rect)), cost: 1e6 };
    ctx.memo.set(key, res);
    return res;
  }
  const STRIP_COST = 6;   // 余りが 1 ます幅の帯になるときの、帯 1 ます分の重さ
  /**
   * 範囲 reg に部屋を置く。部屋は指定の広さのまま廊下の側(right なら右)にまとめ、残りは空き(屋上なら屋上の床)にして膨らませない。
   * まとめる所の形は、広さがちょうど入るものをいくつか実際に割り付けて比べる。玄関のある組は南(下)の端に置く
   */
  function fill(reg, items, pref, right, fillId, wide) {
    if (!items.length) return { out: [Object.assign({ id: fillId }, reg)], cost: 0 };
    const used = items.reduce((sum, x) => sum + x.weight * 2, 0), n = items.length;
    // 少し足りないだけなら指定の広さのまま比べ、大きく足りないときだけ同じ割合で縮める
    if (used >= reg.w * reg.h) return slice(reg, items, used - reg.w * reg.h <= DEV_FREE * n ? Object.assign({ scale: 2 }, pref) : pref, wide);
    // 廊下から入る部屋 1 つ分を正方形に近くした辺の長さ。廊下と直角の向きは、この長さくらいがよい
    const side = Math.sqrt(used / Math.max(1, items.filter((x) => x.hall || x.south).length));
    const shapes = new Map();
    const add = (bw, bh) => {
      if (bw < 1 || bh < 1 || bw > reg.w || bh > reg.h) return;
      const over = bw * bh - used;
      // 余りが 1 ます幅の帯になる形は、なるべく避ける
      const strip = (reg.w - bw === 1 ? reg.h : 0) + (reg.h - bh === 1 ? bw : 0);
      const across = pref.edgeX !== undefined ? bw : pref.edgeY !== undefined ? bh : Math.max(bw, bh);
      shapes.set(`${bw},${bh}`, { bw, bh, strip, score: Math.abs(over) * 3 + strip + Math.abs(across - side) });
    };
    for (let bw = 1; bw <= reg.w; bw++) [Math.floor(used / bw), Math.ceil(used / bw)].forEach((bh) => { if (Math.abs(bw * bh - used) <= DEV_FREE * n) add(bw, bh); });
    const list = [...shapes.values()].sort((p, q) => p.score - q.score).slice(0, 4);
    // 奥行きいっぱい・幅いっぱいの形も比べる(玄関を南に置きながら廊下にも接するには、奥行きいっぱいがよい)
    [[Math.ceil(used / reg.h), reg.h], [reg.w, Math.ceil(used / reg.w)]].forEach(([bw, bh]) => {
      add(bw, bh);
      const e = shapes.get(`${bw},${bh}`);
      if (e && !list.includes(e)) list.push(e);
    });
    const south = items.some((x) => x.south);
    let best = null;
    list.forEach(({ bw, bh, strip }) => {
      const bx = right ? reg.x + reg.w - bw : reg.x, by = south ? reg.y + reg.h - bh : reg.y;
      const res = slice({ x: bx, y: by, w: bw, h: bh }, items, Object.assign({ scale: 2 }, pref), wide), cost = res.cost + strip * STRIP_COST;
      if (!best || cost < best.cost) best = { cost, out: res.out, bx, bw, bh };
    });
    if (!best) return slice(reg, items, pref, wide);
    const { out, bx, bw, bh } = best;
    if (bw < reg.w) out.push({ id: fillId, x: right ? reg.x : bx + bw, y: reg.y, w: reg.w - bw, h: reg.h });
    if (bh < reg.h) out.push({ id: fillId + '-b', x: bx, y: south ? reg.y : reg.y + bh, w: bw, h: reg.h - bh });
    return { out, cost: best.cost };
  }
  const STORE_LEN = 4;   // 階段の列の余りを収納にする長さ(ます目)。列の幅は 2 ますなので 4 帖まで
  /** 階段の列の start から end までの余り。屋上は屋上の床、ほかは STORE_LEN まで収納にして、その先は空き。place(id, 位置, 長さ) で置き場所を作る */
  function coreRest(roof, start, end, place) {
    if (start >= end) return [];
    if (roof) return [place('deck-core', start, end - start)];
    const len = Math.min(end - start, STORE_LEN), rest = [place('store', start, len)];
    if (start + len < end) rest.push(place('empty-core', start + len, end - start - len));
    return rest;
  }
  /** 1 つの階の割り付け { out: [{ id, x, y, w, h }], cost } */
  function layoutFloor(s, v, key, W, D, wide, anchors) {
    const bld = s.bld, multi = floorKeys(bld).length > 1, ev = multi && bld.ev;
    const out = [];
    const list = roomsOn(s, key).sort(v.order);
    // 玄関は南(下)の端に寄せたいので、並びの最後にする
    list.sort((a, b) => (a.type === 'entry') - (b.type === 'entry'));
    let region = { x: 0, y: 0, w: W, h: D };
    const pref = { bottom: D, anchors, W, D };
    const roof = key === 'R';
    if (multi && v.core === 'top') {
      // 北(上)の端に、階段・エレベーター・収納を横に並べ、その下に廊下。屋上は階段室だけ
      out.push({ id: 'stairs', x: 0, y: 0, w: 4, h: 2 });
      let x = 4;
      if (ev) { out.push({ id: 'ev', x, y: 0, w: 2, h: 2 }); x += 2; }
      out.push(...coreRest(roof, x, W, (id, p, len) => ({ id, x: p, y: 0, w: len, h: 2 })));
      if (!roof) out.push({ id: 'hall', x: 0, y: 2, w: W, h: 1 });
      const top = roof ? 2 : 3;
      region = { x: 0, y: top, w: W, h: D - top };
      if (!roof) pref.edgeY = top;
    } else if (multi) {
      // 階段・エレベーター・収納の列と、その横の廊下。屋上は階段室だけにして、残りは屋上の床にする
      const cw = roof ? 2 : 3, cx = v.core === 'left' ? 0 : W - 2;
      out.push({ id: 'stairs', x: cx, y: 0, w: 2, h: 4 });
      let y = 4;
      if (ev) { out.push({ id: 'ev', x: cx, y, w: 2, h: 2 }); y += 2; }
      out.push(...coreRest(roof, y, D, (id, p, len) => ({ id, x: cx, y: p, w: 2, h: len })));
      if (!roof) out.push({ id: 'hall', x: v.core === 'right' ? cx - 1 : cx + 2, y: 0, w: 1, h: D });
      if (v.core === 'left') { region = { x: cw, y: 0, w: W - cw, h: D }; pref.edgeX = cw; }
      else { region = { x: 0, y: 0, w: W - cw, h: D }; pref.edgeX = W - cw; }
    }
    const hasEntry = list.some((r) => r.type === 'entry');
    const items = list.map((r) => ({
      id: r.id, weight: r.tatami || ROOMS[r.type][2], south: r.type === 'entry', hall: !INNER.has(r.type),
      outdoor: r.type === 'terrace' || r.type === 'garden', far: hasEntry && (r.type === 'terrace' || r.type === 'garden'),
      wetNear: hasEntry && !multi && (ROOMS[r.type][1] === 'wet' || r.type === 'kitchen'), stack: STACK.has(r.type)
    }));
    // 部屋は書いた広さのまま置き、残りを空き(屋上は屋上の床)にする
    const res = fill(region, items, pref, v.core === 'right', roof ? 'deck' : 'empty', wide);
    return { out: out.concat(res.out), cost: res.cost };
  }
  /**
   * 案を作る: 階ごとに { id, x, y, w, h } の並び。id は部屋の id か、決まった物の名前(stairs など)。
   * 足もとは候補を実際に割り付けて選ぶ。指定の広さから 1 畳を超えてずれる部屋が残ったら、もっと広く探し直す
   */
  function makePlan(s, vi) {
    const v = VARIANTS[vi] || VARIANTS[0], feet = footCandidates(s, v);
    // 広い階から順に決め、水回りの位置を次の階へ渡す
    const areaOf = (key) => roomsOn(s, key).reduce((sum, r) => sum + cellsOf(r), 0);
    const keys = floorKeys(s.bld).sort((a, b) => areaOf(b) - areaOf(a));
    const search = (wide) => {
      let best = null;
      feet.forEach(({ W, D, score }) => {
        const floors = {}, anchors = [];
        let cost = score * 0.3;
        keys.forEach((key) => {
          const res = layoutFloor(s, v, key, W, D, wide, anchors);
          floors[key] = res.out;
          cost += res.cost;
          res.out.forEach((it) => { const r = s.rooms.find((x) => x.id === it.id); if (r && STACK.has(r.type)) anchors.push({ x: it.x + it.w / 2, y: it.y + it.h / 2 }); });
        });
        if (!best || cost < best.cost) best = { W, D, floors, cost };
      });
      return best;
    };
    let best = search(1);
    if (offRooms(s, best.floors).length) { const more = search(WIDE); if (more.cost < best.cost) best = more; }
    return { variant: vi, foot: [best.W, best.D], floors: best.floors };
  }
  const WIDE = 4;   // 探し直すときに、確かめる分け方を何倍にするか
  /** 指定の広さから 1 畳を超えてずれた部屋 [{ room, jo }] */
  function offRooms(s, floors) {
    const out = [];
    Object.values(floors).forEach((items) => items.forEach((it) => {
      const r = s.rooms.find((x) => x.id === it.id);
      if (r && Math.abs(it.w * it.h - cellsOf(r)) > DEV_FREE) out.push({ room: r, jo: (it.w * it.h) / 2 });
    }));
    return out;
  }

  /* ================================================================ 状態 */
  // 見本の設定文。だれの住まいとも読めないよう、よくあるワンルームにする(広さの書き方の例も兼ねる)
  const SAMPLE = 'ワンルームのアパート。玄関（1帖）、キッチン（2帖）、ユニットバス（2帖）、洋室（7.5帖）、クローゼット（1帖）、バルコニー（2帖）。';
  function defaults() {
    const p = parseSetting(SAMPLE);
    const s = { text: SAMPLE, bld: p.bld, rooms: p.rooms, unread: p.unread, plan: null, view: 'floor', floor: '1', style: 'flyer', unit: 'jo', north: 2, furn: false, memoFmt: 'md', memoRule: true, edited: false };
    s.plan = makePlan(s, 0);
    return s;
  }
  function migrate(st) {
    const s = Object.assign(defaults(), st || {});
    if (!Array.isArray(s.rooms)) s.rooms = [];
    if (!Array.isArray(s.unread)) s.unread = [];
    s.rooms = s.rooms.filter((r) => r && ROOMS[r.type]);
    s.bld = Object.assign(defaults().bld, s.bld || {});
    if (!s.plan || !s.plan.floors) s.plan = makePlan(s, 0);
    return s;
  }
  const roomOf = (id) => ed.state.rooms.find((r) => r.id === id) || null;
  /** 図の 1 つの物の見え方 { name, cat, cand, room } */
  function infoOf(it) {
    // 屋上の床は何か所かに分かれる(deck-core など)ので、- の前で引く
    const fx = FIXED[it.id] || FIXED[it.id.split('-')[0]];
    if (fx) return { name: fx[0], cat: fx[1], cand: false, room: null };
    const r = roomOf(it.id);
    if (!r) return { name: '', cat: 'empty', cand: false, room: null };
    return { name: r.name, cat: ROOMS[r.type][1], cand: !!r.cand, room: r };
  }
  const tatamiOf = (it) => (it.w * it.h) / 2;
  const m2Of = (it) => it.w * it.h * GRID_M * GRID_M;
  /** 広さの字。fixed なら物件のチラシのように帖を小数 1 桁でそろえる(6.0帖) */
  function areaText(it, unit, fixed) {
    const jo = tatamiOf(it), m2 = m2Of(it);
    const j = `${fixed || !Number.isInteger(jo) ? jo.toFixed(1) : jo}帖`, m = `${m2.toFixed(1)}㎡`;
    return unit === 'm2' ? m : unit === 'both' ? `${j}・${m}` : j;
  }
  /** 階の様子(「地下」「最上階」としてまとめて書いたものも含める) */
  function floorAttrsOf(bld, key) {
    const fa = bld.floorAttrs || {};
    return Array.from(new Set([...(fa[key] || []), ...(key.startsWith('B') ? fa.B || [] : []), ...(key === String(bld.above) ? fa.TOP || [] : []), ...(/^\d+$/.test(key) ? fa.ALL || [] : [])]));
  }

  /* ================================================================ 描く */
  const FONT = { flyer: '"Noto Sans JP", "Hiragino Sans", "Yu Gothic UI", sans-serif', note: '"Zen Kurenaido", "Klee One", "Hiragino Maru Gothic ProN", sans-serif' };
  const INK = { flyer: '#23232b', note: '#34324a' };
  const WALL_COLOR = { flyer: '#3a3a42', note: '#34324a' };
  const PAPER = { flyer: '#ffffff', note: '#fbfaf4' };
  // 手描き風の線: 点を少しずつ揺らした折れ線(種で毎回同じ揺れ)
  function rng(seed) { let a = (seed >>> 0) || 1; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function wobble(g, x1, y1, x2, y2, amp, seed) {
    const r = rng(seed), len = Math.hypot(x2 - x1, y2 - y1), n = Math.max(2, Math.round(len / 14));
    const nx = -(y2 - y1) / (len || 1), ny = (x2 - x1) / (len || 1);
    g.moveTo(x1 + (r() - 0.5) * amp, y1 + (r() - 0.5) * amp);
    for (let i = 1; i <= n; i++) {
      const t = i / n, d = (r() - 0.5) * amp;
      g.lineTo(x1 + (x2 - x1) * t + nx * d, y1 + (y2 - y1) * t + ny * d);
    }
  }
  function rectPath(g, style, x, y, w, hh, seed) {
    g.beginPath();
    if (style === 'note') {
      const a = Math.max(0.8, Math.min(w, hh) * 0.02);
      wobble(g, x, y, x + w, y, a, seed); wobble(g, x + w, y, x + w, y + hh, a, seed + 1);
      wobble(g, x + w, y + hh, x, y + hh, a, seed + 2); wobble(g, x, y + hh, x, y, a, seed + 3);
    } else g.rect(x, y, w, hh);
  }
  /** 斜めの線で塗る(手帳の色鉛筆) */
  function hatch(g, x, y, w, hh, color, gap, alpha, width) {
    g.save();
    g.beginPath();
    g.rect(x, y, w, hh);
    g.clip();
    g.strokeStyle = color;
    g.globalAlpha = alpha;
    g.lineWidth = width;
    g.beginPath();
    for (let t = -hh; t < w; t += gap) { g.moveTo(x + t, y + hh); g.lineTo(x + t + hh, y); }
    g.stroke();
    g.restore();
  }
  const deepen = (hex, t) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) * (1 - t));
    return '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  };
  let HALO = '';   // 字の縁取りの色(部屋の名前を設備や家具の上でも読めるように)。空なら縁取りしない
  /** 幅に収まるまで字を小さくして描く。maxH があり 1 行で入らないときは、2 行に折る。描いた行の数を返す(0 = 描けない) */
  function fitText(g, text, cx, cy, maxW, size, weight, font, color, maxH) {
    if (!text) return 0;
    const fit = (lines, min) => {
      let px = size;
      const wid = () => Math.max(...lines.map((t) => g.measureText(t).width));
      g.font = `${weight} ${px}px ${font}`;
      while (px > min && wid() > maxW) { px -= 1; g.font = `${weight} ${px}px ${font}`; }
      return wid() <= maxW + 2 && (!maxH || px * 1.2 * lines.length <= maxH) ? px : 0;
    };
    let lines = [text], px = fit(lines, maxH ? 9 : 7);
    if (!px && maxH && text.length >= 4) {
      const k = Math.ceil(text.length / 2);
      lines = [text.slice(0, k), text.slice(k)];
      px = fit(lines, 7);
    }
    if (!px && maxH) { lines = [text]; px = fit(lines, 7); }
    if (!px) return 0;
    lines.forEach((t, i) => {
      const ty = cy + (i - (lines.length - 1) / 2) * px * 1.15;
      if (HALO) { g.save(); g.strokeStyle = HALO; g.lineWidth = Math.max(2, px * 0.3); g.lineJoin = 'round'; g.globalAlpha = Math.min(1, g.globalAlpha * 1.2); g.strokeText(t, cx, ty); g.restore(); }
      g.fillStyle = color;
      g.fillText(t, cx, ty);
    });
    return lines.length;
  }

  /* ---------- 床の模様(物件チラシ風) ---------- */
  /** 部屋の床の種類。大理石と書いた部屋は大理石 */
  function floorKind(t, key, attrs) {
    if ((attrs || []).some((a) => a === '大理石')) return 'marble';
    if (t === 'washitsu') return 'tatami';
    if (t === 'entry') return 'doma';
    if (t === 'terrace') return 'deckwood';
    if (t === 'garden') return 'grass';
    if (t === 'deck' || (t === 'onsen' && key === 'R')) return 'roof';
    if (t === 'garage') return 'concrete';
    if (['bath', 'wash', 'toilet', 'pool', 'onsen'].includes(t)) return 'tile';
    if (['stairs', 'ev', 'empty', 'void', 'store'].includes(t)) return '';
    return 'wood';
  }
  function floorTexture(g, kind, x, y, w, hh, u, seed) {
    if (!kind) return;
    const m = u / GRID_M, r = rng(seed);
    g.save();
    g.beginPath(); g.rect(x, y, w, hh); g.clip();
    g.lineWidth = 1;
    const grid = (step, color, alpha) => {
      g.strokeStyle = color; g.globalAlpha = alpha;
      g.beginPath();
      for (let t = x + step; t < x + w; t += step) { g.moveTo(t, y); g.lineTo(t, y + hh); }
      for (let t = y + step; t < y + hh; t += step) { g.moveTo(x, t); g.lineTo(x + w, t); }
      g.stroke();
    };
    if (kind === 'wood') {
      // フローリングの板目(幅 0.15 m の板と、ずらした継ぎ目)
      const step = Math.max(4, m * 0.15), run = m * 1.8;
      g.strokeStyle = '#8a6a3c'; g.globalAlpha = 0.08;
      g.beginPath();
      for (let t = x + step; t < x + w; t += step) { g.moveTo(t, y); g.lineTo(t, y + hh); }
      for (let t = x; t < x + w; t += step) for (let yy = y + r() * run; yy < y + hh; yy += run) { g.moveTo(t, yy); g.lineTo(t + step, yy); }
      g.stroke();
    } else if (kind === 'tile') grid(Math.max(4, m * 0.2), '#4f86a8', 0.16);
    else if (kind === 'doma') grid(Math.max(5, m * 0.3), '#6f685c', 0.18);
    else if (kind === 'roof') grid(Math.max(6, m * 0.45), '#6f735f', 0.14);
    else if (kind === 'deckwood') {
      const step = Math.max(4, m * 0.14);
      g.strokeStyle = '#7b5a35'; g.globalAlpha = 0.22;
      g.beginPath(); for (let t = y + step; t < y + hh; t += step) { g.moveTo(x, t); g.lineTo(x + w, t); } g.stroke();
    } else if (kind === 'tatami') {
      // 畳 1 枚 = ます目 1 つ × 2 つ。段ごとに半分ずらして敷く
      g.strokeStyle = '#8f9867'; g.globalAlpha = 0.75;
      g.beginPath();
      for (let row = 0, yy = y; yy < y + hh - 1; row++, yy += u) {
        if (row) { g.moveTo(x, yy); g.lineTo(x + w, yy); }
        for (let xx = x + (row % 2 ? u : 2 * u); xx < x + w - 1; xx += 2 * u) { g.moveTo(xx, yy); g.lineTo(xx, Math.min(y + hh, yy + u)); }
      }
      g.stroke();
    } else if (kind === 'marble') {
      // 大理石: 白い石の地に灰色の筋と、目地
      g.strokeStyle = '#8f8f96';
      const n = 3 + Math.round((w * hh) / (u * u * 2.5));
      for (let i = 0; i < n; i++) {
        g.globalAlpha = 0.18 + r() * 0.2;
        g.lineWidth = 0.5 + r() * 0.9;
        let px = x + r() * w, py = y + r() * hh;
        g.beginPath(); g.moveTo(px, py);
        for (let j = 0; j < 4; j++) {
          const nx = px + (r() - 0.25) * u * 1.3, ny = py + (r() - 0.5) * u;
          g.quadraticCurveTo((px + nx) / 2 + (r() - 0.5) * u * 0.5, (py + ny) / 2 + (r() - 0.5) * u * 0.5, nx, ny);
          px = nx; py = ny;
        }
        g.stroke();
      }
      g.lineWidth = 1;
      grid(Math.max(8, m * 0.6), '#a7a7ad', 0.35);
    } else if (kind === 'grass') {
      g.fillStyle = '#5f8f4c'; g.globalAlpha = 0.35;
      for (let i = 0; i < (w * hh) / 70; i++) g.fillRect(x + r() * w, y + r() * hh, 1.5, 1.5);
    } else if (kind === 'concrete') {
      g.fillStyle = '#5b5b62'; g.globalAlpha = 0.16;
      for (let i = 0; i < (w * hh) / 55; i++) g.fillRect(x + r() * w, y + r() * hh, 1.2, 1.2);
    }
    g.restore();
  }

  /* ================================================================ 壁・建具 */
  // 壁の厚み(ます目に対する割合)。外壁は約 18 cm、間仕切りは約 8 cm
  const WALL = { ext: 0.2, int: 0.09 };
  // 広さ(帖)を書く部屋。玄関・廊下・水回り・収納などは、物件の図面でも書かない
  const SHOW_AREA = new Set(['room', 'living', 'family', 'sun', 'dining', 'kitchen', 'master', 'bed', 'study', 'library', 'guest', 'washitsu', 'closet', 'shoes', 'pantry', 'utility', 'storage', 'studio', 'sound', 'gym', 'theater', 'basement', 'pet']);
  // 物件チラシ風の略し方(名前がこの言葉そのもののときだけ)
  const SHORT = { ウォークインクローゼット: 'WIC', ウォークイン: 'WIC', シューズインクローゼット: 'SIC', ダイニングキッチン: 'DK', リビングダイニング: 'LD', キッチン: 'K', クローゼット: 'CL', ユニットバス: 'UB' };
  // 鉄筋コンクリートの建物(外壁の角と途中に柱を描く)
  const RC_RE = /マンション|ビル|ペントハウス/;
  const LDK = new Set(['living', 'dining', 'kitchen']);
  const SIDES = ['t', 'r', 'b', 'l'];
  /** 物の種類。部屋なら部屋の種類、決まった物なら id の頭(stairs など)、建物の外は 'out'、何も置いていない所は 'void' */
  const typeOf = (it) => (it === undefined ? 'out' : it === null ? 'void' : (roomOf(it.id) || { type: it.id.split('-')[0] }).type);
  const isOutdoor = (t, key) => t === 'deck' || t === 'terrace' || t === 'garden' || (t === 'onsen' && key === 'R');
  const isVoid = (t) => t === 'void' || t === 'empty';
  /** ます目ごとに、そこにある物を引く関数 at(x, y)。建物の外は undefined、何もない所は null。部屋は空き・屋上の床より上 */
  function cellMap(items, W, D) {
    const m = new Array(W * D).fill(null);
    items.slice().sort((a, b) => isFill(b.id) - isFill(a.id)).forEach((it) => {
      for (let y = Math.max(0, it.y); y < Math.min(D, it.y + it.h); y++) for (let x = Math.max(0, it.x); x < Math.min(W, it.x + it.w); x++) m[y * W + x] = it;
    });
    return (x, y) => (x < 0 || y < 0 || x >= W || y >= D ? undefined : m[y * W + x]);
  }
  /**
   * 2 つのます目の境の壁。ext = 外壁、int = 間仕切り、rail = 屋上やテラスの手すり、step = 玄関の上がり框、'' = 壁なし
   * (同じ物の中・空きどうし・外どうし・LDK の部屋どうし・廊下と階段)
   */
  function wallKind(a, b, key, oneRoom) {
    if (a === b) return '';
    const ta = typeOf(a), tb = typeOf(b);
    if (ta === 'out' || tb === 'out') {
      const t = ta === 'out' ? tb : ta;
      return isOutdoor(t, key) ? 'rail' : 'ext';
    }
    const va = isVoid(ta), vb = isVoid(tb), oa = isOutdoor(ta, key), ob = isOutdoor(tb, key);
    if ((va && vb) || (oa && ob)) return '';
    if (oa || ob) return va || vb ? '' : 'ext';
    if (LDK.has(ta) && LDK.has(tb)) return '';
    const pair = (p, q) => (ta === p && tb === q) || (ta === q && tb === p);
    if (pair('hall', 'stairs')) return '';
    if (pair('hall', 'entry') || pair('kitchen', 'entry') || (oneRoom && pair('room', 'entry'))) return 'step';
    if (oneRoom && pair('room', 'kitchen')) return '';
    return 'int';
  }
  /** 物の外周の辺。e = 辺の名前(h<x>,<y> は横、v<x>,<y> は縦)、other = 向こうの物、into = 物の側(横なら +1 が下、縦なら +1 が右) */
  function edgesOf(it, at) {
    const out = [];
    for (let x = it.x; x < it.x + it.w; x++) {
      if (at(x, it.y) === it) out.push({ e: `h${x},${it.y}`, side: 't', other: at(x, it.y - 1), into: 1, pos: x });
      if (at(x, it.y + it.h - 1) === it) out.push({ e: `h${x},${it.y + it.h}`, side: 'b', other: at(x, it.y + it.h), into: -1, pos: x });
    }
    for (let y = it.y; y < it.y + it.h; y++) {
      if (at(it.x, y) === it) out.push({ e: `v${it.x},${y}`, side: 'l', other: at(it.x - 1, y), into: 1, pos: y });
      if (at(it.x + it.w - 1, y) === it) out.push({ e: `v${it.x + it.w},${y}`, side: 'r', other: at(it.x + it.w, y), into: -1, pos: y });
    }
    return out;
  }
  /** 図の上の辺の向き(北の向きを入れて、東西南北) */
  const dirOf = (side, north) => ['N', 'E', 'S', 'W'][(SIDES.indexOf(side) - (north || 0) + 4) % 4];
  const DIR_SCORE = { S: 4, E: 3, W: 2, N: 1 };
  const DIR_JA = { N: '北', E: '東', S: '南', W: '西' };
  // ドアの種類(書いていない種類は開き戸)と、どこから入るか(上から順に探し、なければ隣のどれかの部屋)
  const DOOR_KIND = { closet: 'fold', shoes: 'slide', pantry: 'slide', bath: 'fold', storage: 'slide', washitsu: 'slide', pet: 'slide', cellar: 'swing' };
  const ACCESS = {
    closet: ['master', 'bed', 'guest', 'room', 'hall'], bath: ['wash', 'master', 'bed', 'hall', 'kitchen'], toilet: ['hall', 'wash', 'entry'],
    wash: ['hall', 'master', 'bed', 'living', 'dining', 'kitchen'], shoes: ['entry', 'hall'], pantry: ['kitchen', 'dining', 'hall'], utility: ['wash', 'kitchen', 'hall'], sun: ['living', 'family', 'dining', 'hall']
  };
  const ACCESS_DEFAULT = ['hall', 'living', 'dining', 'kitchen', 'entry'];
  // 窓: 2 = 大きい窓(辺の半分ほど)と、角の部屋ならもう 1 つ。1 = 小さい窓を 1 つ
  const WINDOW = { room: 2, living: 2, family: 2, sun: 2, dining: 2, kitchen: 1, master: 2, bed: 2, study: 2, guest: 2, washitsu: 2, library: 1, gym: 2, bath: 1, wash: 1, toilet: 1, pet: 1, utility: 1 };
  /**
   * 1 つの階の壁と建具を決める。{ at, walls: Map(辺 → 壁), open: Map(辺 → 建具), real }。
   * 建具 { k: swing 開き戸・slide 引き戸・fold 折れ戸・window 窓・entrance 玄関ドア・evdoor・shutter・open, into, hinge }。
   * 自動で付けたあと、図で直した分(s.plan.edits)を重ねる。候補の部屋は壁を作らない
   */
  function analyze(s, key) {
    const [W, D] = s.plan.foot, all = s.plan.floors[key] || [];
    const real = all.filter((it) => { const r = roomOf(it.id); return !(r && r.cand); });
    const at = cellMap(real, W, D), oneRoom = /ワンルーム/.test(s.bld.type || '');
    const walls = new Map(), open = new Map();
    for (let y = 0; y <= D; y++) for (let x = 0; x < W; x++) { const k = wallKind(at(x, y - 1), at(x, y), key, oneRoom); if (k) walls.set(`h${x},${y}`, k); }
    for (let x = 0; x <= W; x++) for (let y = 0; y < D; y++) { const k = wallKind(at(x - 1, y), at(x, y), key, oneRoom); if (k) walls.set(`v${x},${y}`, k); }
    // 壁のない所や上がり框で、ほかの部屋・廊下・玄関とつながっているか(LDK の組の中どうしは数えない)
    const linked = (it) => edgesOf(it, at).some((ed) => {
      const t = typeOf(ed.other), wk = walls.get(ed.e);
      if (t === 'out' || isVoid(t) || isOutdoor(t, key) || (LDK.has(typeOf(it)) && LDK.has(t))) return false;
      return !wk || wk === 'step';
    });
    const put = (ed, op) => { if (open.has(ed.e) || !walls.has(ed.e) || walls.get(ed.e) === 'step') return false; open.set(ed.e, op); return true; };
    // 物の辺を、向こうの物と向きごとにまとめた並び(test に合う物だけ)
    const runsOf = (it, test) => {
      const groups = new Map();
      edgesOf(it, at).forEach((ed) => {
        if (!walls.has(ed.e) || !test(ed.other)) return;
        const gk = ed.side + '|' + (ed.other ? ed.other.id : typeOf(ed.other));
        if (!groups.has(gk)) groups.set(gk, []);
        groups.get(gk).push(ed);
      });
      return [...groups.values()].map((list) => list.sort((a, b) => a.pos - b.pos)).sort((a, b) => b.length - a.length);
    };
    const mid = (run) => run[Math.floor((run.length - 1) / 2)];
    // ドアは部屋の角に近い端に付け、部屋の中へ開く(蝶番は角の側)
    const door = (run, k) => {
      const ed = run.find((x) => !open.has(x.e));
      return ed && put(ed, { k, into: ed.into, hinge: ed === run[0] ? 0 : 1 });
    };
    // prefs の順に入り口を探す。strict でなければ、次に水回り・収納でない隣の部屋、最後にどれかの部屋。
    // 向こうからもう建具が付いていれば、それを入り口とみなす
    const reach = (it, prefs, strict) => {
      for (const want of strict ? prefs : prefs.concat('*main', '*')) {
        const runs = runsOf(it, (o) => {
          const t = typeOf(o);
          if (t === 'out' || isVoid(t) || isOutdoor(t, key) || t === 'stairs' || t === 'ev') return false;
          if (want === '*main') return t === 'hall' || (!!roomOf(o.id) && !['wet', 'service'].includes(ROOMS[t][1]));
          return want === '*' ? t === 'hall' || !!roomOf(o.id) : t === want;
        });
        if (runs.some((run) => run.some((ed) => open.has(ed.e)))) return true;
        // 浴室は脱衣所や寝室からは折れ戸、廊下からは開き戸
        for (const run of runs) if (door(run, typeOf(it) === 'bath' && typeOf(run[0].other) === 'hall' ? 'swing' : DOOR_KIND[typeOf(it)] || 'swing')) return true;
      }
      return false;
    };
    const rooms = real.filter((it) => roomOf(it.id));
    rooms.forEach((it) => {
      const t = typeOf(it);
      if (LDK.has(t)) return;
      if (t === 'entry') {
        // 玄関ドアは外へ開く。南(下)の辺を先に
        const run = runsOf(it, (o) => o === undefined).sort((a, b) => (b[0].side === 'b') - (a[0].side === 'b'))[0];
        if (run) { const ed = mid(run); put(ed, { k: 'entrance', into: -ed.into, hinge: 0 }); }
        // 廊下に接していなければ(上がり框がなければ)、隣の部屋へのドア
        if (!linked(it)) reach(it, ['living', 'dining', 'kitchen']);
        return;
      }
      if (isOutdoor(t, key)) {
        // テラス・庭は隣の部屋の窓から出る。廊下にしか接していなければ、廊下からドアで出る
        const run = runsOf(it, (o) => typeOf(o) === 'hall')[0];
        if (run && !rooms.some((x) => x !== it && runsOf(x, (o) => o === it).length)) door(run, 'swing');
        return;
      }
      if (t === 'garage') {
        const run = runsOf(it, (o) => o === undefined).sort((a, b) => (b[0].side === 'b') - (a[0].side === 'b'))[0];
        if (run) { const n = Math.min(run.length, 3), a = Math.floor((run.length - n) / 2); run.slice(a, a + n).forEach((ed) => put(ed, { k: 'shutter' })); }
      }
      if (!linked(it)) reach(it, ACCESS[t] || ACCESS_DEFAULT);
    });
    // LDK: 仕切りのない部屋どうしを 1 つの組にして、組ごとにドアを 1 つ
    const groups = [];
    rooms.filter((it) => LDK.has(typeOf(it))).forEach((it) => {
      const linked = groups.filter((gr) => gr.some((x) => edgesOf(it, at).some((ed) => ed.other === x && !walls.has(ed.e))));
      linked.forEach((gr) => groups.splice(groups.indexOf(gr), 1));
      groups.push([it].concat(...linked));
    });
    groups.forEach((gr) => {
      gr.sort((a, b) => b.w * b.h - a.w * a.h);
      if (gr.some(linked)) return;
      for (const want of ['hall', 'entry']) if (gr.some((it) => reach(it, [want], true))) return;
      gr.some((it) => reach(it, []));
    });
    // 収納・エレベーター・屋上の階段室の出入り口
    real.forEach((it) => {
      const t = typeOf(it);
      if (t === 'store') { const run = runsOf(it, (o) => typeOf(o) === 'hall')[0]; if (run) { const ed = mid(run); put(ed, { k: 'slide', into: ed.into, hinge: 0 }); } }
      if (t === 'ev') { const run = runsOf(it, (o) => typeOf(o) === 'hall' || isOutdoor(typeOf(o), key))[0]; if (run) { const ed = mid(run); put(ed, { k: 'evdoor', into: ed.into, hinge: 0 }); } }
      if (t === 'stairs' && key === 'R') { const run = runsOf(it, (o) => isOutdoor(typeOf(o), key))[0]; if (run) { const ed = run[run.length - 1]; put(ed, { k: 'swing', into: -ed.into, hinge: 0 }); } }
    });
    // 窓: 地下と、窓のないと書いた部屋は付けない。南の外壁と、テラスに面した辺を先に
    if (!key.startsWith('B')) rooms.forEach((it) => {
      const t = typeOf(it), r = roomOf(it.id), n = WINDOW[t] || 0;
      if (!n || (r.attrs || []).some((a) => /窓のない/.test(a))) return;
      const score = (run) => DIR_SCORE[dirOf(run[0].side, s.north)] + (run[0].other ? 3 : 0);
      const runs = runsOf(it, (o) => o === undefined || isOutdoor(typeOf(o), key)).sort((a, b) => score(b) - score(a));
      runs.slice(0, n).forEach((run, i) => {
        if (i && run.length < 2) return;
        const len = n === 2 && !i ? Math.max(1, Math.min(run.length - (run.length > 2 ? 1 : 0), Math.ceil(run.length * 0.6))) : 1;
        const a = Math.floor((run.length - len) / 2);
        run.slice(a, a + len).forEach((ed) => put(ed, { k: 'window' }));
      });
    });
    // 図で直した分。f の 1 の位 = 開く側を逆に、2 の位 = 蝶番を逆に
    Object.entries((s.plan.edits || {})[key] || {}).forEach(([e, v]) => {
      if (!walls.has(e) || walls.get(e) === 'step') return;
      if (v.k === 'wall') open.delete(e);
      else open.set(e, { k: v.k, into: v.f & 1 ? -1 : 1, hinge: v.f & 2 ? 1 : 0, user: true });
    });
    return { W, D, real, at, walls, open, ldk: groups };
  }
  /** 辺の両端(px)。横の辺 h<x>,<y> は (x, y)〜(x+1, y)、縦の辺 v<x>,<y> は (x, y)〜(x, y+1) */
  function edgePts(e, ox, oy, u) {
    const [x, y] = e.slice(1).split(',').map(Number);
    return e[0] === 'h' ? [ox + x * u, oy + y * u, ox + (x + 1) * u, oy + y * u] : [ox + x * u, oy + y * u, ox + x * u, oy + (y + 1) * u];
  }
  /** 辺の両側のます目にある物 [into が -1 の側, +1 の側] */
  function sidesOf(e, at) {
    const [x, y] = e.slice(1).split(',').map(Number);
    return e[0] === 'h' ? [at(x, y - 1), at(x, y)] : [at(x - 1, y), at(x, y)];
  }
  /** 壁を描く。同じ種類で建具のない辺をつないで 1 本ずつ引き、外壁を後に描いて角を覆う */
  function drawWalls(g, A, ox, oy, u, style, key) {
    const T = { ext: WALL.ext * u, int: WALL.int * u, rail: Math.max(1.2, u * 0.06), step: Math.max(1, u * 0.035) };
    const lines = [];
    const walk = (o, nA, nB) => {
      for (let a = 0; a <= nA; a++) {
        let cur = null;
        for (let b = 0; b <= nB; b++) {
          const e = b < nB ? (o === 'h' ? `h${b},${a}` : `v${a},${b}`) : '';
          const op = e ? A.open.get(e) : null, k = e && !op ? A.walls.get(e) || '' : '';
          if (cur && cur.k !== k) { cur.b1 = b; cur.openEnd = !!op; lines.push(cur); cur = null; }
          if (!cur && k) {
            const prev = b > 0 ? (o === 'h' ? `h${b - 1},${a}` : `v${a},${b - 1}`) : '';
            cur = { o, a, b0: b, k, openStart: !!(prev && A.open.get(prev)) };
          }
        }
      }
    };
    walk('h', A.D, A.W);
    walk('v', A.W, A.D);
    const color = WALL_COLOR[style];
    ['step', 'rail', 'int', 'ext'].forEach((kind) => lines.filter((l) => l.k === kind).forEach((l, i) => {
      const t = T[kind], grow = kind === 'ext' || kind === 'int' ? T.ext / 2 : 0;
      const e0 = l.openStart ? 0 : grow, e1 = l.openEnd ? 0 : grow;
      const p = l.a * u, q0 = l.b0 * u - e0, q1 = l.b1 * u + e1;
      const [x1, y1, x2, y2] = l.o === 'h' ? [ox + q0, oy + p, ox + q1, oy + p] : [ox + p, oy + q0, ox + p, oy + q1];
      g.save();
      if (kind === 'step' || kind === 'rail') {
        g.strokeStyle = color;
        g.globalAlpha = kind === 'step' ? 0.75 : 0.6;
        g.lineWidth = t;
        g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
        if (kind === 'rail') {
          // 手すりは二重の細い線
          const d = u * 0.09, [dx, dy] = l.o === 'h' ? [0, d] : [d, 0];
          g.lineWidth = Math.max(0.8, t * 0.5);
          g.beginPath(); g.moveTo(x1 + dx, y1 + dy); g.lineTo(x2 + dx, y2 + dy); g.stroke();
        }
      } else if (style === 'note') {
        g.strokeStyle = color;
        g.lineWidth = t * 0.75;
        g.lineCap = 'round';
        g.beginPath(); wobble(g, x1, y1, x2, y2, Math.max(0.8, u * 0.03), i * 13 + kind.length + key.length); g.stroke();
      } else {
        g.fillStyle = color;
        if (l.o === 'h') g.fillRect(x1, y1 - t / 2, x2 - x1, t);
        else g.fillRect(x1 - t / 2, y1, t, y2 - y1);
      }
      g.restore();
    }));
  }
  /** 建具の記号(開き戸の弧・引き戸の 2 枚・折れ戸・窓・シャッター) */
  function drawOpenings(g, A, ox, oy, u, style) {
    const ink = INK[style], paper = PAPER[style], lw = Math.max(1, u * 0.04);
    // 窓は並んだ辺をつないで 1 つにする
    const wins = new Set([...A.open.entries()].filter(([, op]) => op.k === 'window').map(([e]) => e)), done = new Set();
    wins.forEach((e) => {
      if (done.has(e)) return;
      const [x, y] = e.slice(1).split(',').map(Number), hor = e[0] === 'h', fixed = hor ? y : x;
      const name = (p) => (hor ? `h${p},${fixed}` : `v${fixed},${p}`);
      let a = hor ? x : y, b = a;
      while (wins.has(name(a - 1))) a--;
      while (wins.has(name(b + 1))) b++;
      for (let p = a; p <= b; p++) done.add(name(p));
      const t = (A.walls.get(e) === 'int' ? WALL.int : WALL.ext) * u;
      const [sx, sy] = edgePts(name(a), ox, oy, u), [, , ex, ey] = edgePts(name(b), ox, oy, u);
      g.save();
      g.fillStyle = paper; g.strokeStyle = ink; g.lineWidth = Math.max(0.8, u * 0.025);
      const [rx, ry, rw, rh] = hor ? [sx, sy - t / 2, ex - sx, t] : [sx - t / 2, sy, t, ey - sy];
      g.fillRect(rx, ry, rw, rh); g.strokeRect(rx, ry, rw, rh);
      g.beginPath();
      if (hor) { g.moveTo(sx, sy); g.lineTo(ex, sy); } else { g.moveTo(sx, sy); g.lineTo(sx, ey); }
      g.stroke();
      g.restore();
    });
    A.open.forEach((op, e) => {
      const [x1, y1, x2, y2] = edgePts(e, ox, oy, u), hor = e[0] === 'h';
      g.save();
      g.strokeStyle = ink; g.fillStyle = paper; g.lineCap = 'butt';
      if (op.k === 'swing' || op.k === 'entrance') {
        // 開き戸: 蝶番から部屋の側へ開いた戸の板と、閉じるまでの弧。蝶番の側に小さな袖壁を残し、戸の板が隣の壁に隠れないようにする
        const [ex0, ey0, fx, fy] = op.hinge ? [x2, y2, x1, y1] : [x1, y1, x2, y2], dx = (fx - ex0) / u, dy = (fy - ey0) / u;
        const inset = u * 0.14, wt = (A.walls.get(e) === 'ext' ? WALL.ext : WALL.int) * u, hx = ex0 + dx * inset, hy = ey0 + dy * inset, L = u - inset;
        g.fillStyle = WALL_COLOR[style];
        if (hor) g.fillRect(Math.min(ex0, hx), ey0 - wt / 2, inset, wt); else g.fillRect(ex0 - wt / 2, Math.min(ey0, hy), wt, inset);
        const tx = hx + (hor ? 0 : op.into * L), ty = hy + (hor ? op.into * L : 0);
        g.lineWidth = op.k === 'entrance' ? lw * 1.8 : lw * 1.3;
        g.beginPath(); g.moveTo(hx, hy); g.lineTo(tx, ty); g.stroke();
        const a1 = Math.atan2(ty - hy, tx - hx);
        let d = Math.atan2(fy - hy, fx - hx) - a1;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        g.lineWidth = Math.max(0.7, lw * 0.4); g.globalAlpha = 0.85;
        g.beginPath(); g.arc(hx, hy, L, a1, a1 + d, d < 0); g.stroke();
      } else if (op.k === 'slide') {
        // 引き戸(引き違い): 少しずらして重ねた 2 枚
        const pw = Math.max(1.4, u * 0.05), off = WALL.int * u * 0.3;
        g.lineWidth = Math.max(0.7, u * 0.02);
        [[0, 0.56, -1], [0.44, 1, 1]].forEach(([a, b, sg]) => {
          const sx = x1 + (x2 - x1) * a, sy = y1 + (y2 - y1) * a, ex = x1 + (x2 - x1) * b, ey = y1 + (y2 - y1) * b;
          const [rx, ry, rw, rh] = hor ? [sx, sy + sg * off - pw / 2, ex - sx, pw] : [sx + sg * off - pw / 2, sy, pw, ey - sy];
          g.fillRect(rx, ry, rw, rh); g.strokeRect(rx, ry, rw, rh);
        });
      } else if (op.k === 'fold') {
        // 折れ戸: 部屋の側へ折れたじぐざぐ
        const bend = u * 0.2 * op.into;
        g.lineWidth = lw; g.lineJoin = 'round';
        g.beginPath();
        [0, 0.25, 0.5, 0.75, 1].forEach((t, i) => {
          const px = x1 + (x2 - x1) * t + (hor ? 0 : (i % 2) * bend), py = y1 + (y2 - y1) * t + (hor ? (i % 2) * bend : 0);
          if (i) g.lineTo(px, py); else g.moveTo(px, py);
        });
        g.stroke();
      } else if (op.k === 'shutter') {
        g.lineWidth = lw * 1.4; g.setLineDash([u * 0.12, u * 0.08]);
        g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      } else if (op.k === 'evdoor') {
        // エレベーターの扉: 開口の両脇に短い線
        const t = WALL.int * u * 0.9;
        g.lineWidth = Math.max(1, u * 0.05);
        g.beginPath();
        if (hor) { g.moveTo(x1 + u * 0.15, y1 - t); g.lineTo(x1 + u * 0.15, y1 + t); g.moveTo(x2 - u * 0.15, y1 - t); g.lineTo(x2 - u * 0.15, y1 + t); }
        else { g.moveTo(x1 - t, y1 + u * 0.15); g.lineTo(x1 + t, y1 + u * 0.15); g.moveTo(x1 - t, y2 - u * 0.15); g.lineTo(x1 + t, y2 - u * 0.15); }
        g.stroke();
      }
      g.restore();
    });
  }

  /* ---------- 設備と家具 ---------- */
  /** 部屋の辺 side を上にした向きで描く。f(壁の長さ, 奥行き, 回した角度) の戻り値を返す */
  function inFrame(g, x, y, w, hh, side, f) {
    g.save();
    let L = w, Dp = hh, ang = 0;
    if (side === 'b') { g.translate(x + w, y + hh); ang = Math.PI; }
    else if (side === 'l') { g.translate(x, y + hh); ang = -Math.PI / 2; L = hh; Dp = w; }
    else if (side === 'r') { g.translate(x + w, y); ang = Math.PI / 2; L = hh; Dp = w; }
    else g.translate(x, y);
    g.rotate(ang);
    const res = f(L, Dp, ang);
    g.restore();
    return res;
  }
  /** 辺 side から奥行き d を使ったあとの、部屋の残り [x, y, w, h] */
  const restOf = (x, y, w, hh, side, d) => (side === 't' ? [x, y + d, w, hh - d] : side === 'b' ? [x, y, w, hh - d] : side === 'l' ? [x + d, y, w - d, hh] : [x, y, w - d, hh]);
  /** 設備を置く壁。ドアや開口のない辺から、ドアの向かいを先に、長い辺(short なら短い辺)を選ぶ */
  function backSide(it, A, pref) {
    const busy = new Set();
    edgesOf(it, A.at).forEach((ed) => {
      const op = A.open.get(ed.e), wk = A.walls.get(ed.e);
      if ((op && op.k !== 'window') || !wk || wk === 'step') busy.add(ed.side);
    });
    const len = { t: it.w, b: it.w, l: it.h, r: it.h }, opp = { t: 'b', b: 't', l: 'r', r: 'l' };
    const cand = SIDES.filter((sd) => !busy.has(sd));
    cand.sort((a, b) => (busy.has(opp[b]) - busy.has(opp[a])) || (pref === 'short' ? len[a] - len[b] : len[b] - len[a]));
    return cand[0] || (pref === 'short' ? (it.w < it.h ? 't' : 'l') : (it.w >= it.h ? 't' : 'l'));
  }
  /**
   * 部屋の設備(浴槽・便器・洗面台・キッチン・収納の棒など)と、furn のときは家具を描く。
   * 名前を書くのに向いた残りの所 [x, y, w, h] を返す
   */
  function drawFixtures(g, s, key, it, A, x, y, w, hh, u, style) {
    const r = roomOf(it.id), t = r ? r.type : typeOf(it), m = u / GRID_M, attrs = r ? r.attrs || [] : [], name = r ? r.name : '';
    const ink = INK[style], furn = !!s.furn;
    let rest = [x, y, w, hh];
    g.save();
    g.strokeStyle = ink;
    g.lineWidth = Math.max(0.8, u * 0.025);
    g.fillStyle = style === 'note' ? 'rgba(251,250,244,.9)' : 'rgba(255,255,255,.94)';
    const box = (bx, by, bw, bh, rad) => { g.beginPath(); if (rad) g.roundRect(bx, by, bw, bh, rad); else g.rect(bx, by, bw, bh); g.fill(); g.stroke(); };
    const circle = (cx, cy, rr, fill) => { g.beginPath(); g.arc(cx, cy, rr, 0, Math.PI * 2); if (fill) g.fill(); g.stroke(); };
    // 回した向きのままでも字はまっすぐ書く
    const upText = (txt, lx, ly, size, ang) => {
      g.save(); g.translate(lx, ly); g.rotate(-ang);
      g.fillStyle = ink; g.font = `500 ${Math.max(7, size)}px ${FONT[style]}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(txt, 0, 0); g.restore();
    };
    const place = (side, f) => { const d = inFrame(g, x, y, w, hh, side, f); if (d > 0) rest = restOf(x, y, w, hh, side, d); };
    const kitchenLike = t === 'kitchen' || /キッチン|LDK|台所/.test(name);
    if (t === 'stairs') {
      // 段と、上る向きの矢印
      const vert = hh >= w;
      g.globalAlpha = 0.6;
      g.beginPath();
      if (vert) for (let p = y + u * 0.4; p < y + hh - 2; p += u * 0.36) { g.moveTo(x + 2, p); g.lineTo(x + w - 2, p); }
      else for (let p = x + u * 0.4; p < x + w - 2; p += u * 0.36) { g.moveTo(p, y + 2); g.lineTo(p, y + hh - 2); }
      g.stroke();
      g.globalAlpha = 0.85;
      const [ax, ay, bx, by] = vert ? [x + w / 2, y + hh - u * 0.3, x + w / 2, y + u * 0.35] : [x + w - u * 0.3, y + hh / 2, x + u * 0.35, y + hh / 2];
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
      circle(ax, ay, u * 0.06, false);
      const ah = u * 0.16;
      g.beginPath();
      if (vert) { g.moveTo(bx - ah * 0.6, by + ah); g.lineTo(bx, by); g.lineTo(bx + ah * 0.6, by + ah); }
      else { g.moveTo(bx + ah, by - ah * 0.6); g.lineTo(bx, by); g.lineTo(bx + ah, by + ah * 0.6); }
      g.stroke();
      // 上の階があれば矢印の先に UP、下の階があれば根元に DN
      const keys = floorKeys(s.bld), i = keys.indexOf(key), fs = Math.max(7, u * 0.24);
      g.globalAlpha = 1;
      g.fillStyle = ink; g.font = `700 ${fs}px ${FONT[style]}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      const side = vert ? [x + w * 0.76, 0] : [0, y + hh * 0.76];
      if (i > 0) g.fillText('UP', vert ? side[0] : bx + u * 0.25, vert ? by + u * 0.25 : side[1]);
      if (i < keys.length - 1) g.fillText('DN', vert ? side[0] : ax - u * 0.25, vert ? ay - u * 0.25 : side[1]);
    } else if (t === 'ev') {
      g.globalAlpha = 0.55;
      g.beginPath(); g.moveTo(x + u * 0.25, y + u * 0.25); g.lineTo(x + w - u * 0.25, y + hh - u * 0.25); g.moveTo(x + w - u * 0.25, y + u * 0.25); g.lineTo(x + u * 0.25, y + hh - u * 0.25); g.stroke();
    } else if (t === 'store' || t === 'closet' || t === 'shoes') {
      // ハンガーパイプ(点線)と枕棚。広いクローゼットは両側に
      place(backSide(it, A, 'long'), (L, Dp) => {
        g.save(); g.globalAlpha = 0.7; g.setLineDash([Math.max(3, m * 0.1), Math.max(2, m * 0.06)]);
        g.beginPath(); g.moveTo(m * 0.06, m * 0.3); g.lineTo(L - m * 0.06, m * 0.3);
        if (t === 'closet' && Dp > m * 1.5) { g.moveTo(m * 0.06, Dp - m * 0.3); g.lineTo(L - m * 0.06, Dp - m * 0.3); }
        g.stroke(); g.restore();
        g.save(); g.globalAlpha = 0.45; g.beginPath(); g.moveTo(0, m * 0.5); g.lineTo(L, m * 0.5); g.stroke(); g.restore();
        return 0;
      });
    } else if (t === 'bath') {
      place(backSide(it, A, 'long'), (L, Dp) => {
        const big = L > m * 2.2, tl = Math.min(L - m * 0.16, (big ? 1.9 : 1.6) * m), td = Math.min(Dp * 0.6, (big ? 0.95 : 0.8) * m), tx = m * 0.08;
        if (attrs.some((a) => /猫足/.test(a))) {
          // 猫足のバスタブ: 壁から離した楕円の湯船と、4 本の脚
          const cx = L / 2, cy = m * 0.14 + td / 2;
          g.beginPath(); g.ellipse(cx, cy, tl / 2, td / 2, 0, 0, Math.PI * 2); g.fill(); g.stroke();
          g.beginPath(); g.ellipse(cx, cy, tl / 2 - m * 0.08, td / 2 - m * 0.08, 0, 0, Math.PI * 2); g.stroke();
          [0.62, 2.52, 3.76, 5.66].forEach((a) => circle(cx + Math.cos(a) * tl * 0.47, cy + Math.sin(a) * td * 0.5, m * 0.04, true));
          return m * 0.24 + td;
        }
        box(tx, m * 0.06, tl, td, m * 0.1);
        g.beginPath(); g.roundRect(tx + m * 0.08, m * 0.14, tl - m * 0.16, td - m * 0.16, m * 0.16); g.stroke();
        circle(tx + tl - m * 0.26, m * 0.06 + td / 2, m * 0.04, false);
        // ユニットバス(3 点): 向かいの壁に便器と洗面台も
        if (/ユニット/.test(name) && Dp > td + m * 0.9) {
          const by = Dp - m * 0.04;
          box(m * 0.12, by - m * 0.2, m * 0.4, m * 0.2, m * 0.03);
          g.beginPath(); g.ellipse(m * 0.32, by - m * 0.2 - m * 0.24, m * 0.17, m * 0.23, 0, 0, Math.PI * 2); g.fill(); g.stroke();
          if (L > m * 1.3) {
            box(L - m * 0.62, by - m * 0.42, m * 0.5, m * 0.42, m * 0.05);
            g.beginPath(); g.ellipse(L - m * 0.37, by - m * 0.24, m * 0.14, m * 0.1, 0, 0, Math.PI * 2); g.stroke();
          }
        }
        return m * 0.12 + td;
      });
    } else if (t === 'onsen') {
      // 露天風呂: 檜なら四角い木の湯船、ほかは石で囲んだ湯船
      const bw = Math.min(w * 0.8, m * 3), bh = Math.min(hh * 0.58, m * 2.2), cx = x + w / 2, cy = y + hh * 0.42;
      if (attrs.some((a) => /檜|ヒノキ/.test(a))) {
        g.fillStyle = '#e8cf9e'; box(cx - bw / 2, cy - bh / 2, bw, bh, m * 0.05);
        g.fillStyle = '#cfe6ef'; box(cx - bw / 2 + m * 0.12, cy - bh / 2 + m * 0.12, bw - m * 0.24, bh - m * 0.24, 0);
      } else {
        g.fillStyle = '#cfe6ef'; box(cx - bw / 2, cy - bh / 2, bw, bh, Math.min(bw, bh) * 0.45);
        g.fillStyle = '#d9d6cf';
        const rr = rng(it.x * 31 + it.y), per = 2 * (bw + bh), n = Math.max(10, Math.round(per / (m * 0.32)));
        for (let i = 0; i < n; i++) {
          const p = (i / n) * per, [sx, sy] = p < bw ? [cx - bw / 2 + p, cy - bh / 2] : p < bw + bh ? [cx + bw / 2, cy - bh / 2 + p - bw] : p < 2 * bw + bh ? [cx + bw / 2 - (p - bw - bh), cy + bh / 2] : [cx - bw / 2, cy + bh / 2 - (p - 2 * bw - bh)];
          circle(sx, sy, m * (0.1 + rr() * 0.07), true);
        }
      }
      rest = [x, cy + bh / 2 + m * 0.1, w, y + hh - (cy + bh / 2 + m * 0.1)];
    } else if (t === 'toilet') {
      place(backSide(it, A, 'short'), (L) => {
        const cx = L / 2, tw = Math.min(L * 0.7, m * 0.42), td = m * 0.2;
        box(cx - tw / 2, m * 0.04, tw, td, m * 0.03);
        g.beginPath(); g.ellipse(cx, m * 0.3 + m * 0.24, Math.min(L * 0.3, m * 0.19), m * 0.25, 0, 0, Math.PI * 2); g.fill(); g.stroke();
        return m * 0.84;
      });
    } else if (t === 'wash') {
      place(backSide(it, A, 'long'), (L, Dp, ang) => {
        const vw = Math.min(L * 0.5, m * 0.9), vd = Math.min(Dp * 0.5, m * 0.55);
        box(m * 0.04, m * 0.04, vw, vd, m * 0.02);
        g.beginPath(); g.ellipse(m * 0.04 + vw / 2, m * 0.04 + vd * 0.55, vw * 0.3, vd * 0.28, 0, 0, Math.PI * 2); g.stroke();
        // 洗濯機の置き場
        if (L - vw > m * 0.8) {
          const ps = Math.min(m * 0.64, Dp * 0.6), px = L - ps - m * 0.04;
          g.save(); g.setLineDash([3, 2]); box(px, m * 0.04, ps, ps, m * 0.04); g.restore();
          upText('洗', px + ps / 2, m * 0.04 + ps / 2, ps * 0.5, ang);
        }
        return m * 0.72;
      });
    } else if (t === 'entry') {
      // 下足入れ(斜めの線は収納の印)
      place(backSide(it, A, 'short'), (L, Dp) => {
        const bl = Math.min(L - m * 0.1, m * 1.2), bd = Math.min(Dp * 0.35, m * 0.38);
        box(m * 0.03, m * 0.03, bl, bd);
        g.save(); g.globalAlpha = 0.45; g.beginPath(); g.moveTo(m * 0.03, m * 0.03); g.lineTo(m * 0.03 + bl, m * 0.03 + bd); g.stroke(); g.restore();
        return bd + m * 0.05;
      });
    } else if (t === 'library' || t === 'cellar' || t === 'pantry') {
      // 本棚(ワインセラーは棚の丸)を壁に沿って。奥行きがあれば向かいの壁にも
      place(backSide(it, A, 'long'), (L, Dp) => {
        const sd = m * (t === 'cellar' ? 0.4 : 0.35), both = Dp > m * 1.8;
        [0, both ? Dp - sd - m * 0.04 : -1].filter((v) => v >= 0).forEach((sy) => {
          box(m * 0.04, sy + m * 0.02, L - m * 0.08, sd);
          g.beginPath();
          for (let p = m * 0.9; p < L - m * 0.1; p += m * 0.9) { g.moveTo(p, sy + m * 0.02); g.lineTo(p, sy + m * 0.02 + sd); }
          g.stroke();
          if (t === 'cellar') for (let p = m * 0.15; p < L - m * 0.1; p += m * 0.18) circle(p, sy + m * 0.02 + sd / 2, m * 0.05, false);
        });
        return sd + m * 0.08;
      });
    } else if (t === 'pool') {
      const pad = m * 0.35;
      g.fillStyle = '#bfe0f2'; box(x + pad, y + pad, w - pad * 2, hh - pad * 2, m * 0.1);
      g.save(); g.setLineDash([m * 0.2, m * 0.15]); g.globalAlpha = 0.6; g.beginPath();
      const lanes = Math.max(1, Math.floor((hh - pad * 2) / (m * 1.6)));
      for (let i = 1; i < lanes; i++) { const ly = y + pad + ((hh - pad * 2) * i) / lanes; g.moveTo(x + pad * 2, ly); g.lineTo(x + w - pad * 2, ly); }
      g.stroke(); g.restore();
    }
    if (kitchenLike) {
      // キッチン: 壁付けの台(シンクと 3 口のコンロ)と冷蔵庫の置き場。アイランドと書いたら島の台
      place(backSide(it, A, 'long'), (L, Dp, ang) => {
        const island = /アイランド/.test(name) && Dp > m * 3, cd = m * 0.65;
        const fr = L > m * 2.6, cl = Math.min(L - m * 0.1 - (fr ? m * 0.75 : 0), m * 3.2), y0 = island ? m * 1.5 : m * 0.03;
        box(m * 0.03, y0, cl, cd);
        g.beginPath(); g.roundRect(m * 0.03 + cl * 0.16, y0 + m * 0.12, Math.min(m * 0.75, cl * 0.32), cd - m * 0.24, m * 0.05); g.stroke();
        const hx = m * 0.03 + cl * 0.74;
        [[-0.17, 0.2], [0.17, 0.2], [0, 0.45]].forEach(([dx, dy]) => circle(hx + dx * m, y0 + dy * m, m * 0.09, false));
        if (island) box(m * 0.03, m * 0.03, cl, m * 0.45);
        if (fr) { const fx = L - m * 0.72; box(fx, m * 0.03, m * 0.68, m * 0.68); upText('冷', fx + m * 0.34, m * 0.37, m * 0.32, ang); }
        return y0 + cd + m * 0.12;
      });
    }
    if (furn) drawFurniture(g, t, it, A, rest, x, y, w, hh, m, ink, box, circle, place, name, kitchenLike);
    g.restore();
    return rest;
  }
  /** 家具(選んだときだけ)。寝具・ソファ・机など、部屋の種類ごとに 1 組 */
  function drawFurniture(g, t, it, A, rest, x, y, w, hh, m, ink, box, circle, place, name, kitchenLike) {
    const [fx, fy, fw, fh] = rest, cx = fx + fw / 2, cy = fy + fh / 2;
    const bed = (bx, by, bw, bl) => { box(bx, by, bw, bl, m * 0.05); box(bx + m * 0.08, by + m * 0.08, bw - m * 0.16, m * 0.32, m * 0.06); g.beginPath(); g.moveTo(bx, by + bl * 0.45); g.lineTo(bx + bw, by + bl * 0.45); g.stroke(); };
    const table = (tw, td, chairs) => {
      if (tw > fw - m * 0.4 || td > fh - m * 0.4) return;
      box(cx - tw / 2, cy - td / 2, tw, td, m * 0.04);
      const cs = m * 0.42;
      if (chairs) [-0.25, 0.25].forEach((k) => { box(cx + k * tw - cs / 2, cy - td / 2 - cs - m * 0.05, cs, cs, m * 0.06); box(cx + k * tw - cs / 2, cy + td / 2 + m * 0.05, cs, cs, m * 0.06); });
    };
    const fits = (L, Dp, a, b) => L > a && Dp > b;
    if (t === 'master' || t === 'bed' || t === 'guest' || t === 'room') {
      place(backSide(it, A, 'long'), (L, Dp) => {
        const twin = t === 'guest' && L > m * 2.8, bw = t === 'master' ? m * 1.6 : m * 1.0, bl = m * 2.0;
        if (!fits(L, Dp, bw + m * 0.2, bl + m * 0.3)) return 0;
        if (twin) { bed(L / 2 - bw - m * 0.15, m * 0.05, bw, bl); bed(L / 2 + m * 0.15, m * 0.05, bw, bl); }
        else if (t === 'master') {
          bed(L / 2 - bw / 2, m * 0.05, bw, bl);
          if (L > bw + m * 1.2) [-1, 1].forEach((k) => box(L / 2 + k * (bw / 2 + m * 0.3) - m * 0.22, m * 0.05, m * 0.44, m * 0.4));
        } else bed(m * 0.12, m * 0.05, bw, bl);
        return 0;
      });
    } else if ((t === 'living' || t === 'family') && !kitchenLike) {
      place(backSide(it, A, 'long'), (L, Dp) => {
        if (!fits(L, Dp, m * 2.4, m * 2.6)) return 0;
        box(L / 2 - m * 1.05, m * 0.06, m * 2.1, m * 0.85, m * 0.12);
        box(L / 2 - m * 0.95, m * 0.06, m * 1.9, m * 0.25, m * 0.08);
        box(L / 2 - m * 0.55, m * 1.3, m * 1.1, m * 0.55, m * 0.06);
        return 0;
      });
    } else if (t === 'dining' || (t === 'living' && kitchenLike)) table(m * 1.4, m * 0.85, true);
    else if (t === 'washitsu') { table(m * 1.2, m * 0.8, false); }
    else if (t === 'study') {
      place(backSide(it, A, 'long'), (L, Dp) => {
        if (!fits(L, Dp, m * 1.3, m * 1.4)) return 0;
        box(L / 2 - m * 0.6, m * 0.05, m * 1.2, m * 0.6, m * 0.03);
        circle(L / 2, m * 0.95, m * 0.24, true);
        return 0;
      });
    } else if (t === 'gym') {
      if (fw > m * 1.2 && fh > m * 2.1) { box(cx - m * 0.4, cy - m * 0.95, m * 0.8, m * 1.9, m * 0.1); g.beginPath(); g.moveTo(cx - m * 0.3, cy - m * 0.6); g.lineTo(cx + m * 0.3, cy - m * 0.6); g.stroke(); }
    } else if (t === 'theater') {
      place(backSide(it, A, 'long'), (L, Dp) => {
        g.save(); g.lineWidth *= 2.5; g.beginPath(); g.moveTo(L * 0.15, m * 0.12); g.lineTo(L * 0.85, m * 0.12); g.stroke(); g.restore();
        if (fits(L, Dp, m * 2.4, m * 3.2)) box(L / 2 - m * 1.1, Dp * 0.62, m * 2.2, m * 0.85, m * 0.12);
        return 0;
      });
    } else if (t === 'studio' || t === 'sound') {
      place(backSide(it, A, 'long'), (L, Dp) => {
        if (!fits(L, Dp, m * 2.2, m * 1.6)) return 0;
        box(L / 2 - m * 0.9, m * 0.5, m * 1.8, m * 0.75, m * 0.05);
        for (let k = 0; k < 6; k++) circle(L / 2 - m * 0.65 + k * m * 0.26, m * 0.75, m * 0.05, false);
        [-1, 1].forEach((k) => box(L / 2 + k * m * 1.25 - m * 0.2, m * 0.08, m * 0.4, m * 0.4, m * 0.04));
        return 0;
      });
    } else if (t === 'garage') {
      const cw = m * 1.8, cl = m * 4.6, vert = fh >= fw;
      if ((vert ? fw : fh) > cw + m * 0.2 && (vert ? fh : fw) > cl + m * 0.2) {
        const [bx, by, bw, bh] = vert ? [cx - cw / 2, cy - cl / 2, cw, cl] : [cx - cl / 2, cy - cw / 2, cl, cw];
        box(bx, by, bw, bh, m * 0.4);
        g.beginPath(); if (vert) g.roundRect(bx + m * 0.25, by + cl * 0.3, bw - m * 0.5, cl * 0.35, m * 0.2); else g.roundRect(bx + cl * 0.35, by + m * 0.25, cl * 0.35, bh - m * 0.5, m * 0.2); g.stroke();
      }
    } else if (t === 'pet') {
      if (fw > m * 0.9 && fh > m * 0.9) { box(cx - m * 0.3, cy - m * 0.3, m * 0.6, m * 0.6, m * 0.05); circle(cx - m * 0.12, cy - m * 0.1, m * 0.16, true); circle(cx + m * 0.14, cy + m * 0.12, m * 0.13, true); }
    }
  }

  /** 仕切りのない LDK の組の呼び方(リビング → L、ダイニング → D、キッチン → K) */
  function ldkName(gr) {
    const has = (re, type) => gr.some((x) => typeOf(x) === type || re.test(roomOf(x.id).name));
    const L = has(/リビング|居間|LDK/, 'living'), K = has(/キッチン|台所|LDK/, 'kitchen'), D = has(/ダイニング|食堂/, 'dining') || (L && K);
    return (L ? 'L' : '') + (D ? 'D' : '') + (K ? 'K' : '') || gr.map((x) => roomOf(x.id).name).join('・');
  }
  /**
   * 1 つの階を描く。ox・oy = 左上(px)、u = ます目 1 つの px。
   * 床の色と模様 → 設備と家具 → 候補の部屋 → 壁 → 建具 → 名前の順。o.screen のときは、選んだ部屋の枠・重なり・直せる壁の印も描く
   */
  function drawFloor(g, s, key, ox, oy, u, o) {
    o = o || {};
    const style = s.style, font = FONT[style], ink = INK[style], [W, D] = s.plan.foot;
    const A = analyze(s, key);
    if (o.screen) view.A = A;
    const items = (s.plan.floors[key] || []).slice().sort((a, b) => isFill(b.id) - isFill(a.id));
    g.save();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    // 床の地は空きの色(部屋を動かして空いた所も空きに見える)。書き出しと全階の図では、空きは紙の白のままにする
    const emptyColor = o.screen ? CAT_COLOR.empty : PAPER[style];
    g.fillStyle = emptyColor;
    if (style === 'note' && o.screen) g.globalAlpha = 0.45;
    g.fillRect(ox, oy, W * u, D * u);
    g.globalAlpha = 1;
    const colorOf = (it) => { const t = typeOf(it), inf = infoOf(it); return t === 'empty' ? emptyColor : TYPE_COLOR[t === 'onsen' && key === 'R' ? 'deck' : t] || CAT_COLOR[inf.cat] || '#eee'; };
    // 床
    const labels = new Map();
    items.forEach((it) => {
      const inf = infoOf(it);
      if (inf.cand) return;
      const x = ox + it.x * u, y = oy + it.y * u, w = it.w * u, hh = it.h * u, col = colorOf(it), t = typeOf(it);
      g.save();
      g.fillStyle = col;
      if (style === 'note') {
        g.globalAlpha = 0.45;
        g.fillRect(x, y, w, hh);
        g.globalAlpha = 1;
        if (!['hall', 'empty'].includes(inf.cat)) hatch(g, x, y, w, hh, deepen(col, 0.25), Math.max(4, u * 0.2), 0.55, Math.max(1, u * 0.035));
      } else {
        g.fillRect(x, y, w, hh);
        floorTexture(g, floorKind(t, key, inf.room && inf.room.attrs), x, y, w, hh, u, it.x * 7 + it.y * 13 + key.length);
      }
      g.restore();
    });
    // 設備と家具(名前は残りの所に書く)
    items.forEach((it) => {
      const inf = infoOf(it);
      if (inf.cand || isFill(it.id)) return;
      labels.set(it, drawFixtures(g, s, key, it, A, ox + it.x * u, oy + it.y * u, it.w * u, it.h * u, u, style));
    });
    // 候補の部屋: 薄い面と点線の枠
    items.forEach((it, i) => {
      const inf = infoOf(it);
      if (!inf.cand) return;
      const x = ox + it.x * u, y = oy + it.y * u, w = it.w * u, hh = it.h * u;
      g.save();
      g.globalAlpha = 0.4;
      g.fillStyle = colorOf(it);
      g.fillRect(x, y, w, hh);
      g.globalAlpha = 0.7;
      g.strokeStyle = ink;
      g.lineWidth = Math.max(1, u * 0.04);
      g.setLineDash([u * 0.18, u * 0.12]);
      rectPath(g, style, x + 1, y + 1, w - 2, hh - 2, i * 7 + key.length);
      g.stroke();
      g.restore();
    });
    drawWalls(g, A, ox, oy, u, style, key);
    drawOpenings(g, A, ox, oy, u, style);
    // 鉄筋コンクリートの建物は、外壁の角と、長い外壁の途中(約 5 m ごと)に柱
    if (RC_RE.test(s.bld.type || '') && key !== 'R') {
      const cs = u * 0.5, pts = [];
      [[0, W, (p) => [p, 0]], [0, W, (p) => [p, D]], [0, D, (p) => [0, p]], [0, D, (p) => [W, p]]].forEach(([a, b, at]) => {
        const n = Math.max(1, Math.round((b - a) / 6));
        for (let i = 0; i <= n; i++) pts.push(at(Math.round(a + ((b - a) * i) / n)));
      });
      g.save();
      g.fillStyle = WALL_COLOR[style];
      pts.forEach(([px, py]) => g.fillRect(ox + px * u - cs / 2 + (px === 0 ? cs * 0.3 : px === W ? -cs * 0.3 : 0), oy + py * u - cs / 2 + (py === 0 ? cs * 0.3 : py === D ? -cs * 0.3 : 0), cs, cs));
      g.restore();
    }
    // 名前と広さ。屋上の床は、いちばん広い所にだけ書く
    const biggest = (pre) => items.filter((it) => it.id.startsWith(pre)).sort((a, b) => b.w * b.h - a.w * a.h)[0];
    // 空きの名前は画面だけ、部屋を重ねていないときだけ出す
    const over = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    const bare = (e) => !items.some((it) => !isFill(it.id) && over(it, e));
    const emptyBig = o.screen ? biggest('empty') : null;
    const deckMain = biggest('deck'), emptyMain = emptyBig && bare(emptyBig) ? emptyBig : null;
    const size = clamp(u * 0.36, 8, 24), wt = style === 'note' ? 400 : 700;
    HALO = style === 'note' ? 'rgba(251,250,244,.85)' : 'rgba(255,255,255,.85)';
    // 物件チラシ風: 仕切りのない LDK は、いちばん広い部屋の所に 1 つの名前(LDK・LD・DK)と合わせた広さで書く
    const merged = new Map();
    if (style === 'flyer') A.ldk.filter((gr) => gr.length > 1).forEach((gr) => {
      const name = ldkName(gr), cells = gr.reduce((sum, x) => sum + x.w * x.h, 0);
      gr.forEach((x, i) => merged.set(x, i ? null : { name, area: { w: cells, h: 1 } }));
    });
    items.forEach((it) => {
      const inf = infoOf(it), t = typeOf(it);
      if (merged.get(it) === null) return;
      if (t === 'stairs') return;
      if (t === 'ev') { fitText(g, 'EV', ox + (it.x + it.w / 2) * u, oy + (it.y + it.h / 2) * u, it.w * u - 6, Math.max(8, u * 0.34), 700, font, ink); return; }
      // 階段の列の空きは廊下で隔たっているので、ほかの空きとは別に名前を書く
      const coreEmpty = o.screen && it.id === 'empty-core' && bare(it);
      if ((it.id.startsWith('deck') && it !== deckMain) || (it.id.startsWith('empty') && it !== emptyMain && !coreEmpty)) return;
      // 名前は設備を避けた残りの所に。狭すぎるときは部屋の真ん中
      let [lx, ly, lw, lh] = labels.get(it) || [ox + it.x * u, oy + it.y * u, it.w * u, it.h * u];
      if (lw < size * 2.2 || lh < size * 1.5) [lx, ly, lw, lh] = [ox + it.x * u, oy + it.y * u, it.w * u, it.h * u];
      const cx = lx + lw / 2, cy = ly + lh / 2, w = lw - 6;
      const mg = merged.get(it);
      const name = mg ? mg.name : (style === 'flyer' && SHORT[inf.name]) || inf.name + (inf.cand ? '（候補）' : '');
      const showArea = inf.room && SHOW_AREA.has(t) && lh > size * 2.6;
      g.save();
      if (inf.cand) g.globalAlpha = 0.6;
      // 名前が 1 行で入るときは下に広さを添え、入らないときは名前だけを 2 行で描く
      if (showArea && fitText(g, name, cx, cy - size * 0.55, w, size, wt, font, ink)) {
        g.globalAlpha *= 0.8;
        fitText(g, areaText(mg ? mg.area : it, s.unit, true), cx, cy + size * 0.6, w, Math.round(size * 0.78), style === 'note' ? 400 : 500, font, ink);
      } else {
        if (inf.cat === 'empty') g.globalAlpha = 0.4;
        fitText(g, name, cx, cy, w, size, inf.cat === 'empty' ? 400 : wt, font, ink, lh - 4);
      }
      g.restore();
    });
    HALO = '';
    // 玄関の入口の印: 玄関ドアの外に、ドアを指す三角
    A.open.forEach((op, e) => {
      if (op.k !== 'entrance') return;
      const [x1, y1, x2, y2] = edgePts(e, ox, oy, u), hor = e[0] === 'h';
      const dx = hor ? 0 : op.into, dy = hor ? op.into : 0, cx = (x1 + x2) / 2 + dx * u * 1.3, cy = (y1 + y2) / 2 + dy * u * 1.3;
      g.save();
      g.fillStyle = ink;
      g.beginPath();
      g.moveTo(cx - dx * u * 0.22, cy - dy * u * 0.22);
      g.lineTo(cx + dx * u * 0.2 + dy * u * 0.24, cy + dy * u * 0.2 + dx * u * 0.24);
      g.lineTo(cx + dx * u * 0.2 - dy * u * 0.24, cy + dy * u * 0.2 - dx * u * 0.24);
      g.closePath(); g.fill();
      g.restore();
    });
    // 画面だけ: 重なった部屋の赤い縁、選んでいる部屋の枠と角の丸、ドアや窓を直すときの壁の印
    if (o.screen) {
      items.forEach((a, i) => items.forEach((b, j) => {
        if (j <= i || a.id === 'hall' || b.id === 'hall' || isFill(a.id) || isFill(b.id)) return;
        if (over(a, b)) {
          g.save(); g.strokeStyle = '#e0335a'; g.lineWidth = 2; g.setLineDash([5, 4]);
          [a, b].forEach((c) => g.strokeRect(ox + c.x * u + 2, oy + c.y * u + 2, c.w * u - 4, c.h * u - 4));
          g.restore();
        }
      }));
      if (view.tool !== 'move') {
        g.save();
        g.fillStyle = '#6d5dfc';
        A.walls.forEach((k, e) => {
          if (k === 'step' || k === 'rail' || (view.tool === 'window' && k !== 'ext')) return;
          const [x1, y1, x2, y2] = edgePts(e, ox, oy, u);
          g.globalAlpha = A.open.has(e) ? 0.9 : 0.35;
          g.beginPath(); g.arc((x1 + x2) / 2, (y1 + y2) / 2, Math.max(2.5, u * 0.08), 0, Math.PI * 2); g.fill();
        });
        g.restore();
      }
      const sel = items.find((it) => it.id === view.sel);
      if (sel && view.tool === 'move') {
        g.save();
        g.strokeStyle = '#6d5dfc';
        g.lineWidth = 3;
        g.strokeRect(ox + sel.x * u + 1.5, oy + sel.y * u + 1.5, sel.w * u - 3, sel.h * u - 3);
        g.fillStyle = '#fff';
        g.beginPath(); g.arc(ox + (sel.x + sel.w) * u - 2, oy + (sel.y + sel.h) * u - 2, 7, 0, Math.PI * 2); g.fill(); g.stroke();
        g.restore();
      }
    }
    g.restore();
  }
  /** 階の見出し(「2F」と、その階の様子) */
  function drawFloorHead(g, s, key, x, y, size) {
    const font = FONT[s.style], ink = INK[s.style], attrs = floorAttrsOf(s.bld, key);
    g.save();
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    g.fillStyle = ink;
    g.font = `700 ${size}px ${font}`;
    // 1 階だけの住まい(ワンルームなど)は、階の名前を出さない
    const label = floorKeys(s.bld).length > 1 ? floorLabel(key) : '';
    g.fillText(label, x, y);
    // 床面積と、その階の様子
    const area = floorArea(s, key), sub = [key === 'R' ? '' : `床面積 ${area.toFixed(1)}㎡（${(area / TSUBO).toFixed(1)}坪）`, ...attrs].filter(Boolean).join('　');
    if (sub) {
      const w = g.measureText(label).width;
      g.font = `500 ${Math.round(size * 0.48)}px ${font}`;
      g.globalAlpha = 0.75;
      g.fillText(sub, x + w + size * 0.4, y);
    }
    g.restore();
  }
  /** 階の床面積(㎡)。屋上の床・テラス・庭は数えない */
  function floorArea(s, key) {
    const [W, D] = s.plan.foot, at = cellMap((s.plan.floors[key] || []).filter((it) => { const r = roomOf(it.id); return !(r && r.cand); }), W, D);
    let n = 0;
    for (let y = 0; y < D; y++) for (let x = 0; x < W; x++) if (!isOutdoor(typeOf(at(x, y)), key)) n++;
    return n * GRID_M * GRID_M;
  }
  /** 全階の見出し(建物と、延床面積) */
  function drawSheetHead(g, s, x, y, size) {
    const b = s.bld, keys = floorKeys(b).filter((k) => k !== 'R'), font = FONT[s.style];
    const title = `${b.place ? b.place + 'の' : ''}${b.note || ''}${b.type || '住まい'}`;
    const total = keys.reduce((sum, k) => sum + floorArea(s, k), 0);
    const spec = [floorKeys(b).length > 1 ? `地上${b.above}階${b.below ? `・地下${b.below}階` : ''}${b.roof ? '・屋上' : ''}` : '', `延床面積 ${total.toFixed(1)}㎡（${(total / TSUBO).toFixed(1)}坪）`].join('　');
    g.save();
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    g.fillStyle = INK[s.style];
    g.font = `700 ${size}px ${font}`;
    g.fillText(title, x, y);
    const w = g.measureText(title).width;
    g.font = `500 ${Math.round(size * 0.72)}px ${font}`;
    g.globalAlpha = 0.75;
    g.fillText(spec, x + w + size * 0.7, y);
    g.restore();
  }
  /** 方位(N)と縮尺(0〜2 m) */
  function drawCompass(g, s, cx, cy, r) {
    const ink = INK[s.style];
    g.save();
    g.translate(cx, cy);
    g.strokeStyle = ink;
    g.fillStyle = ink;
    g.lineWidth = Math.max(1, r * 0.08);
    g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke();
    g.rotate((s.north || 0) * Math.PI / 2);
    g.beginPath(); g.moveTo(0, -r * 0.85); g.lineTo(r * 0.32, r * 0.35); g.lineTo(0, r * 0.15); g.lineTo(-r * 0.32, r * 0.35); g.closePath(); g.fill();
    g.font = `700 ${Math.round(r * 0.62)}px ${FONT[s.style]}`;
    g.textAlign = 'center';
    g.textBaseline = 'bottom';
    g.fillText('N', 0, -r * 1.05);
    g.restore();
  }
  function drawScale(g, s, x, y, u) {
    const ink = INK[s.style], m = u / GRID_M;
    g.save();
    g.strokeStyle = ink;
    g.fillStyle = ink;
    g.lineWidth = Math.max(1, u * 0.04);
    g.beginPath();
    g.moveTo(x, y); g.lineTo(x + m * 2, y);
    [0, 1, 2].forEach((i) => { g.moveTo(x + m * i, y - 4); g.lineTo(x + m * i, y + 4); });
    g.stroke();
    g.font = `500 ${Math.round(clamp(u * 0.3, 9, 14))}px ${FONT[s.style]}`;
    g.textAlign = 'center';
    g.textBaseline = 'top';
    ['0', '1', '2 m'].forEach((t, i) => g.fillText(t, x + m * i, y + 6));
    g.restore();
  }
  /** 手帳の方眼の地 */
  function drawPaper(g, s, w, hh, u) {
    g.fillStyle = s.style === 'note' ? '#fbfaf4' : '#ffffff';
    g.fillRect(0, 0, w, hh);
    if (s.style !== 'note') return;
    const step = Math.max(6, u / 2);
    g.save();
    g.strokeStyle = '#a9c6e6';
    g.lineWidth = 1;
    g.globalAlpha = 0.35;
    g.beginPath();
    for (let x = 0.5; x < w; x += step) { g.moveTo(x, 0); g.lineTo(x, hh); }
    for (let y = 0.5; y < hh; y += step) { g.moveTo(0, y); g.lineTo(w, y); }
    g.stroke();
    g.restore();
  }
  /**
   * 断面: 階を上から帯で重ね、奥行きの真ん中で切った所にある部屋を、幅のとおりに並べる。
   * 地面の線を 1F と地下の間に引く
   */
  function drawSection(g, s, x0, y0, u) {
    const keys = floorKeys(s.bld), [W, D] = s.plan.foot, cut = D / 2, font = FONT[s.style], ink = INK[s.style];
    const FH = 3.2, RH = 1.4;
    let y = y0;
    g.save();
    keys.forEach((key) => {
      const fh = (key === 'R' ? RH : FH) * u;
      const items = (s.plan.floors[key] || []).filter((it) => it.y <= cut && cut < it.y + it.h);
      const deckMain = items.filter((it) => it.id.startsWith('deck')).sort((a, b) => b.w - a.w)[0];
      items.forEach((it, i) => {
        const inf = infoOf(it), x = x0 + it.x * u, w = it.w * u, col = CAT_COLOR[inf.cat] || '#eee';
        g.save();
        if (inf.cand) g.globalAlpha = 0.45;
        g.fillStyle = col;
        g.fillRect(x, y, w, fh);
        if (inf.cat === 'outdoor' || s.style === 'note') hatch(g, x, y, w, fh, deepen(col, 0.3), Math.max(5, u * 0.25), 0.4, 1);
        // 空き・屋上の床どうしは仕切らない
        if (!isFill(it.id)) {
          g.strokeStyle = ink;
          g.lineWidth = Math.max(1, u * 0.05);
          rectPath(g, s.style, x, y, w, fh, i + key.length * 11);
          g.stroke();
        }
        g.restore();
        if ((it.id.startsWith('deck') && it !== deckMain) || it.id.startsWith('empty')) return;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        fitText(g, inf.name + (inf.cand ? '（候補）' : ''), x + w / 2, y + fh / 2, w - 6, clamp(u * 0.34, 8, 20), s.style === 'note' ? 400 : 700, font, ink, fh - 4);
      });
      // 床の板と、階の名前
      g.fillStyle = ink;
      g.fillRect(x0 - u * 0.2, y + fh - Math.max(2, u * 0.12), W * u + u * 0.4, Math.max(2, u * 0.12));
      g.textAlign = 'right';
      g.textBaseline = 'middle';
      g.font = `700 ${Math.round(clamp(u * 0.42, 10, 22))}px ${font}`;
      g.fillText(floorLabel(key), x0 - u * 0.5, y + fh / 2);
      y += fh;
      if (key === '1' && s.bld.below) {
        // 地面
        g.save();
        g.strokeStyle = '#8a6a44';
        g.lineWidth = Math.max(2, u * 0.08);
        g.beginPath(); g.moveTo(x0 - u * 1.6, y); g.lineTo(x0 + W * u + u * 1.6, y); g.stroke();
        hatch(g, x0 - u * 1.6, y, u * 1.4, keys.filter((k) => k.startsWith('B')).length * FH * u, '#b08a5a', Math.max(5, u * 0.3), 0.35, 1);
        hatch(g, x0 + W * u + u * 0.2, y, u * 1.4, keys.filter((k) => k.startsWith('B')).length * FH * u, '#b08a5a', Math.max(5, u * 0.3), 0.35, 1);
        g.restore();
      }
    });
    g.restore();
    return y;
  }

  /* ================================================================ Ed(保存・ファイル) */
  // 描くのは canvas なので、Ed の描き直し(render)と縮小は使わない。mount は画面に出さない
  const cfg = { app: 'userhome', version: 1, width: 1, defaults, migrate, render: () => h('div'), mount: h('div') };
  const ed = Ed.create(cfg);
  const baseSet = ed.set;
  ed.set = (p, v) => { baseSet(p, v); requestPaint(); };
  ed.rerender = () => { view.sel = null; renderTools(); renderPanel(); fitStage(); };
  const touch = () => { ed.dirty(); requestPaint(); };

  /* ================================================================ 作業台 */
  // tool: move = 部屋を動かす、swing・slide・window・wall = 壁を押してドアや窓を直す。A = いま描いた階の壁と建具
  const view = { sel: null, geo: null, log: null, tool: 'move', A: null };
  const cv = $('plan'), paperEl = $('paper'), mount = $('mount'), stage = $('stage'), toolsEl = $('tools'), tipEl = $('tip');
  let raf = 0;
  function requestPaint() { if (!raf) raf = requestAnimationFrame(paint); }
  /**
   * いまの見え方を、幅 cw・高さ ch(px)の中に描く。screen のときは選んでいる部屋の枠なども描き、
   * 当たり判定のための位置(view.geo)を残す
   */
  function renderView(g, s, cw, ch, screen) {
    const [W, D] = s.plan.foot, keys = floorKeys(s.bld);
    if (!keys.includes(s.floor)) s.floor = keys.includes('1') ? '1' : keys[0];
    // 初めに方眼の細かさを決めるため、仮の u で地を塗る(手帳の方眼は描く大きさに合わせる)
    let u;
    if (s.view === 'all') {
      const n = keys.length, cols = n <= 3 ? n : Math.ceil(n / 2), rows = Math.ceil(n / cols), head = 34, gx = 34, gy = 22, pad = 28;
      // 上に方位、下に縮尺の分をあける
      u = Math.min((cw - pad * 2 - (cols - 1) * gx) / (cols * W), (ch - pad * 2 - 64 - rows * head - (rows - 1) * gy) / (rows * D));
      drawPaper(g, s, cw, ch, u);
      const gw = cols * W * u + (cols - 1) * gx, x0 = (cw - gw) / 2, y0 = pad + 30;
      drawSheetHead(g, s, x0, pad + 6, clamp(u * 0.5, 12, 18));
      keys.forEach((key, i) => {
        const c = i % cols, r = Math.floor(i / cols), ox = x0 + c * (W * u + gx), oy = y0 + r * (D * u + head + gy) + head;
        drawFloorHead(g, s, key, ox, oy - 10, clamp(u * 0.62, 12, 26));
        drawFloor(g, s, key, ox, oy, u, {});
      });
      drawCompass(g, s, cw - 30, 34, 13);
      drawScale(g, s, x0, ch - 26, u);
      if (screen) view.geo = null;
    } else if (s.view === 'section') {
      const units = keys.reduce((sum, k) => sum + (k === 'R' ? 1.4 : 3.2), 0);
      u = Math.min((cw - 200) / W, (ch - 110) / units);
      drawPaper(g, s, cw, ch, u);
      const x0 = (cw - W * u) / 2 + 20, y0 = (ch - units * u) / 2 + 10;
      g.save();
      g.fillStyle = INK[s.style];
      g.font = `700 ${Math.round(clamp(u * 0.42, 12, 20))}px ${FONT[s.style]}`;
      g.textAlign = 'left';
      g.textBaseline = 'alphabetic';
      g.fillText('断面（奥行きの真ん中で切った所）', 24, 32);
      g.restore();
      drawSection(g, s, x0, y0, u);
      drawScale(g, s, x0, ch - 28, u);
      if (screen) view.geo = null;
    } else {
      u = Math.min((cw - 70) / W, (ch - 120) / D);
      drawPaper(g, s, cw, ch, u);
      const ox = (cw - W * u) / 2, oy = 66;
      drawFloorHead(g, s, s.floor, ox, 46, clamp(u * 0.7, 16, 30));
      drawFloor(g, s, s.floor, ox, oy, u, { screen });
      drawCompass(g, s, cw - 34, 40, 15);
      drawScale(g, s, ox, oy + D * u + 30, u);
      if (screen) view.geo = { ox, oy, u, key: s.floor };
    }
  }
  function paint() {
    raf = 0;
    const s = ed.state, dpr = Math.min(2, window.devicePixelRatio || 1), g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderView(g, s, cv.width / dpr, cv.height / dpr, true);
  }
  /** 作業台の大きさに canvas を合わせる(狭い画面では幅に合わせて高さを決める) */
  function fitStage() {
    const narrow = matchMedia('(max-width: 920px)').matches;
    const w = Math.max(280, mount.clientWidth - 24), hh = narrow ? Math.round(Math.min(w * 1.1, window.innerHeight * 0.75)) : Math.max(320, mount.clientHeight - 20);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    paperEl.style.width = w + 'px';
    paperEl.style.height = hh + 'px';
    const cw = Math.round(w * dpr), ch = Math.round(hh * dpr);
    if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
    paint();
  }
  new ResizeObserver(() => fitStage()).observe(mount);

  /* ---------- 部屋を動かす・大きさを変える(階ごとの見え方だけ) ---------- */
  let gest = null;
  const itemsNow = () => (ed.state.plan.floors[ed.state.floor] || []);
  function toGrid(e) {
    const r = cv.getBoundingClientRect(), geo = view.geo;
    return { px: e.clientX - r.left, py: e.clientY - r.top, gx: (e.clientX - r.left - geo.ox) / geo.u, gy: (e.clientY - r.top - geo.oy) / geo.u };
  }
  cv.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || !view.geo || ed.state.view !== 'floor') return;
    if (view.tool !== 'move') { editEdge(toGrid(e)); e.preventDefault(); return; }
    const p = toGrid(e), u = view.geo.u, items = itemsNow();
    const sel = items.find((it) => it.id === view.sel);
    // 選んでいる部屋の右下の角の丸 → 大きさを変える
    if (sel && Math.hypot(p.gx - (sel.x + sel.w), p.gy - (sel.y + sel.h)) * u < 12) {
      gest = { type: 'size', id: e.pointerId, it: sel, w0: sel.w, h0: sel.h, sx: p.gx, sy: p.gy };
    } else {
      const hit = items.slice().reverse().find((it) => p.gx >= it.x && p.gx <= it.x + it.w && p.gy >= it.y && p.gy <= it.y + it.h && it.id !== 'hall' && !isFill(it.id));
      if (!hit) { selectItem(null); return; }
      selectItem(hit.id);
      gest = { type: 'move', id: e.pointerId, it: hit, x0: hit.x, y0: hit.y, sx: p.gx, sy: p.gy, moved: false };
    }
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 合成イベントなど */ }
    e.preventDefault();
  });
  cv.addEventListener('pointermove', (e) => {
    if (!gest || e.pointerId !== gest.id) return;
    const p = toGrid(e), [W, D] = ed.state.plan.foot, it = gest.it;
    if (gest.type === 'move') {
      const nx = clamp(Math.round(gest.x0 + p.gx - gest.sx), 0, W - it.w), ny = clamp(Math.round(gest.y0 + p.gy - gest.sy), 0, D - it.h);
      if (nx !== it.x || ny !== it.y) { it.x = nx; it.y = ny; gest.moved = true; requestPaint(); }
    } else {
      const nw = clamp(Math.round(gest.w0 + p.gx - gest.sx), 1, W - it.x), nh = clamp(Math.round(gest.h0 + p.gy - gest.sy), 1, D - it.y);
      if (nw !== it.w || nh !== it.h) { it.w = nw; it.h = nh; gest.moved = true; requestPaint(); }
    }
  });
  const endGest = (e) => {
    if (!gest || e.pointerId !== gest.id) return;
    const moved = gest.moved;
    gest = null;
    if (moved) { ed.state.edited = true; ed.dirty(); renderSelInfo(); renderMemo(); }
  };
  cv.addEventListener('pointerup', endGest);
  cv.addEventListener('pointercancel', endGest);
  /**
   * 押した所にいちばん近い壁の辺に、選んでいる建具を付ける。
   * 同じ物をもう一度押すと、ドアは開く向き(4 通り)、引き戸は寄せる側を変え、窓は外す。壁は建具を外し、もう一度で自動に戻す
   */
  function editEdge(p) {
    const A = view.A, s = ed.state, tool = view.tool;
    if (!A) return;
    const fx = Math.round(p.gx), fy = Math.round(p.gy);
    const pick = [{ e: `h${Math.floor(p.gx)},${fy}`, d: Math.abs(p.gy - fy) }, { e: `v${fx},${Math.floor(p.gy)}`, d: Math.abs(p.gx - fx) }]
      .filter((c) => A.walls.has(c.e) && c.d < 0.34).sort((a, b) => a.d - b.d)[0];
    if (!pick) { U.toast('壁の上を押してください'); return; }
    const e = pick.e, wk = A.walls.get(e), cur = A.open.get(e);
    if (wk === 'step' || wk === 'rail') { U.toast('ここには付けられません'); return; }
    if (tool === 'window' && wk !== 'ext') { U.toast('窓は外壁に付けます'); return; }
    const edits = s.plan.edits || (s.plan.edits = {}), fl = edits[s.floor] || (edits[s.floor] = {});
    const f0 = cur ? (cur.into < 0 ? 1 : 0) + (cur.hinge ? 2 : 0) : 0;
    if (tool === 'wall') { if (cur) fl[e] = { k: 'wall' }; else if (fl[e]) delete fl[e]; else return; }
    else if (tool === 'window') fl[e] = cur && cur.k === 'window' ? { k: 'wall' } : { k: 'window' };
    else if (cur && cur.k === tool) fl[e] = { k: tool, f: tool === 'swing' ? (f0 + 1) % 4 : f0 ^ 1 };
    else fl[e] = { k: tool, f: f0 };
    s.edited = true;
    ed.dirty();
    requestPaint();
    renderMemo();
    renderPlanReset();
  }
  function selectItem(id) {
    view.sel = id;
    renderSelInfo();
    requestPaint();
  }
  document.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t && t.closest && t.closest('input,textarea,select,[contenteditable]')) return;
    if (e.key === 'Escape') selectItem(null);
  });

  /* ================================================================ 作業台の上の帯(見え方・階・直す物) */
  const TOOLS = [['move', '部屋', '部屋を動かす・大きさを変える'], ['swing', 'ドア', '開き戸を付ける・開く向きを変える'], ['slide', '引き戸', '引き戸を付ける'], ['window', '窓', '外壁に窓を付ける・外す'], ['wall', '壁', 'ドアや窓を外して壁にする']];
  const TOOL_TIPS = {
    move: '部屋はドラッグで動かし、選んだ部屋の右下の丸で大きさを変えます。ます目は半間（0.91 m）で、2 つで 1 畳です。',
    swing: '壁を押すとドアを付けます。ドアをもう一度押すと、開く向きが変わります。',
    slide: '壁を押すと引き戸を付けます。もう一度押すと、戸を寄せる側が変わります。',
    window: '外壁を押すと窓を付けます。窓をもう一度押すと外します。',
    wall: 'ドアや窓を押すと外して壁にします。もう一度押すと、自動で付けた形に戻します。'
  };
  function setTool(id) {
    view.tool = id;
    view.sel = null;
    renderTools();
    renderSelInfo();
    requestPaint();
  }
  function renderTools() {
    const s = ed.state, keys = floorKeys(s.bld);
    const btn = (label, on, fn, title) => h('button.uh-tbtn', { type: 'button', 'aria-pressed': String(on), title, onclick: fn }, label);
    const setView = (v) => { ed.set('view', v); selectItem(null); renderTools(); };
    toolsEl.replaceChildren(
      h('div.uh-group', { role: 'group', 'aria-label': '見え方' },
        btn('階ごと', s.view === 'floor', () => setView('floor')),
        btn('全階', s.view === 'all', () => setView('all')),
        btn('断面', s.view === 'section', () => setView('section'), '階を上から重ねて、奥行きの真ん中で切った図')),
      s.view === 'floor' && keys.length > 1 ? h('div.uh-group', { role: 'group', 'aria-label': '階' },
        keys.map((k) => btn(floorLabel(k), s.floor === k, () => { ed.set('floor', k); selectItem(null); renderTools(); }))) : '',
      s.view === 'floor' ? h('div.uh-group', { role: 'group', 'aria-label': '直す物' },
        TOOLS.map(([id, label, title]) => btn(label, view.tool === id, () => setTool(id), title))) : '');
    cv.style.cursor = s.view === 'floor' && view.tool !== 'move' ? 'crosshair' : '';
    tipEl.textContent = s.view === 'floor'
      ? TOOL_TIPS[view.tool]
      : s.view === 'all' ? 'すべての階を 1 枚に並べています。部屋やドアを直すときは「階ごと」に切り替えます。'
        : '階を上から重ね、奥行きの真ん中で切った所にある部屋を並べています。';
  }

  /* ================================================================ 設定の欄 */
  const side = $('side');
  const sideTop = h('div.uh-side-top', ed.statusEl, h('span.kit-spacer'), ed.fileMenu({ resetLabel: '最初に戻す', resetHint: '設定文と図を、見本の状態に戻します' }));
  const sideBody = h('div.uh-side-body');
  const actions = h('div.uh-actions');
  side.append(sideTop, sideBody, actions);
  const sec = (title, ...kids) => h('section.uh-sec', h('h2', title), ...kids);
  const field = (label, control, hint) => h('div.field', h('label', label, hint && h('small', hint)), control);
  function seg(label, opts, cur, onPick) {
    const box = h('div.seg', { role: 'group', 'aria-label': label });
    opts.forEach(([v, t]) => {
      const b = h('button', { type: 'button', 'aria-pressed': String(v === cur) }, t);
      b.addEventListener('click', () => { box.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); onPick(v); });
      box.append(b);
    });
    return box;
  }
  const selInfo = h('div.uh-selinfo');
  const memoBox = h('div.uh-col');
  const logBox = h('div.uh-col');
  const notesBox = h('div.uh-col');
  /** 表や建物を直したあと、いまの案の形で図を作り直す */
  function replan(msg) {
    const s = ed.state;
    s.plan = makePlan(s, s.plan.variant || 0);
    s.edited = false;
    view.sel = null;
    ed.dirty();
    renderTools();
    renderPanel();
    requestPaint();
    if (msg) U.toast(msg);
  }
  function renderPanel() {
    const s = ed.state;
    sideBody.replaceChildren(secText(s), secParsed(s), secPlan(s), secLook(s), secLog(), secMemo(s));
    renderNotes();
    renderSelInfo();
    renderPlanReset();
    renderMemo();
    renderLog();
    renderActions();
  }

  /* ---------- 設定文 ---------- */
  function secText(s) {
    const ta = h('textarea.uh-src', { rows: 7, 'aria-label': '住まいの設定文', placeholder: '住まいの設定を貼ります。例: 2 階建ての一軒家。1 階に玄関とリビング、2 階に寝室と書斎…', oninput: (e) => { s.text = e.target.value; ed.dirty(); } });
    ta.value = s.text || '';
    const read = async () => {
      if (s.edited && !(await U.confirmDialog({ title: '読み取り直す', message: '図で動かした部屋の位置、直したドアや窓、表で直した中身は消えて、設定文から作り直します。読み取り直しますか？', okLabel: '読み取り直す' }))) return;
      const p = parseSetting(s.text);
      s.bld = p.bld;
      s.rooms = p.rooms;
      s.unread = p.unread;
      s.floor = '1';
      replan(`${p.rooms.filter((r) => !r.cand).length} 部屋を読み取りました${p.unread.length ? `。読み取れなかった言葉が ${p.unread.length} つあります` : ''}`);
    };
    return sec('住まいの設定文',
      ta,
      h('div.uh-row', h('button.btn.btn-primary.btn-sm', { type: 'button', onclick: read }, icon('sparkle', 15), '読み取って図にする')),
      h('p.hint', 'AI には送らず、このブラウザの中で建物・階・部屋・様子の言葉を拾って読み取ります。読み取った結果は、下の表で直せます。'));
  }

  /* ---------- 読み取った結果(建物と部屋の表) ---------- */
  function secParsed(s) {
    const b = s.bld;
    const text = (key, label, ph) => field(label, h('input', { type: 'text', value: b[key] || '', placeholder: ph, oninput: (e) => { b[key] = e.target.value; ed.dirty(); renderMemo(); } }));
    const num = (key, label, min, max) => field(label, h('input', { type: 'number', min, max, value: b[key], onchange: (e) => { b[key] = clamp(Math.round(Number(e.target.value) || 0), min, max); replan(); } }));
    const check = (key, label) => h('label.check', h('input', { type: 'checkbox', checked: !!b[key], onchange: (e) => { b[key] = e.target.checked; replan(); } }), label);
    // 足もとの大きさ。空なら部屋の広さから自動で決める
    const foot = (key, label, i) => field(label, h('input', { type: 'number', min: footMin(b), max: FOOT_MAX, value: b[key] || '', placeholder: `自動（${s.plan.foot[i]}）`, onchange: (e) => { const v = Number(e.target.value) || 0; b[key] = v ? clamp(Math.round(v), footMin(b), FOOT_MAX) : 0; replan(); } }));
    const keys = floorKeys(b);
    const rows = s.rooms.map((r) => {
      const fl = h('select', { 'aria-label': `${r.name}の階`, onchange: (e) => { r.floor = e.target.value; replan(); } },
        h('option', { value: '' }, `自動（${floorLabel(effFloor(Object.assign({}, r, { floor: '' }), b))}）`),
        keys.map((k) => h('option', { value: k, selected: effFloor(r, b) === k && !!r.floor }, floorLabel(k))));
      const type = h('select', { 'aria-label': `${r.name}の種類`, onchange: (e) => { r.type = e.target.value; replan(); } },
        Object.entries(ROOMS).map(([k, v]) => h('option', { value: k, selected: r.type === k }, v[0])));
      return h('tr', { class: r.cand ? 'is-cand' : null },
        h('td', fl),
        h('td', h('input', { type: 'text', value: r.name, 'aria-label': '部屋の名前', oninput: (e) => { r.name = e.target.value; touch(); renderMemo(); } })),
        h('td', type),
        h('td', h('input', { type: 'number', min: 1, max: 60, step: 0.5, value: r.tatami, 'aria-label': `${r.name}の畳数`, onchange: (e) => { r.tatami = clamp(Number(e.target.value) || 1, 1, 60); replan(); } })),
        h('td', h('input', { type: 'text', value: (r.attrs || []).join('・'), placeholder: '床暖房・吹き抜けなど', 'aria-label': `${r.name}の様子`, oninput: (e) => { r.attrs = e.target.value.split(/[・、,]/).map((x) => x.trim()).filter(Boolean); ed.dirty(); renderMemo(); } })),
        h('td.uh-c', h('input', { type: 'checkbox', checked: !!r.cand, title: '候補(設定文に書いていない部屋)', 'aria-label': `${r.name}は候補`, onchange: (e) => { r.cand = e.target.checked; e.target.closest('tr').classList.toggle('is-cand', r.cand); touch(); renderMemo(); renderNotes(); } })),
        h('td.uh-c', h('button.btn.btn-icon.btn-ghost.danger', { type: 'button', title: '外す', 'aria-label': `${r.name}を外す`, onclick: () => { s.rooms.splice(s.rooms.indexOf(r), 1); replan(); } }, icon('close', 14))));
    });
    return sec('読み取った結果',
      h('div.grid-2', text('type', '建物', '一軒家・アパートなど'), text('place', '場所', '区・市など')),
      h('div.grid-2', num('above', '地上の階', 1, 12), num('below', '地下の階', 0, 4)),
      h('div.uh-row', check('roof', '屋上がある'), check('ev', 'エレベーターがある')),
      h('div.grid-2', foot('footW', '建物の幅（ます）', 0), foot('footD', '建物の奥行き（ます）', 1)),
      h('p.hint', '空欄なら、幅と奥行きを部屋の広さから自動で決めます。ます目は半間（0.91 m）で、2 つで 1 畳です。'),
      field('建物の様子', h('input', { type: 'text', value: (b.features || []).join('・'), placeholder: '建物の外観など', oninput: (e) => { b.features = e.target.value.split(/[・、,]/).map((x) => x.trim()).filter(Boolean); ed.dirty(); renderMemo(); } })),
      h('div.grid-2', text('people', '住む人', '〇〇と同居'), text('pets', 'ペット', '犬・猫など')),
      h('div.uh-tablewrap', h('table.uh-rooms',
        h('thead', h('tr', ['階', '名前', '種類', '畳', '様子', '候補', ''].map((t) => h('th', t)))),
        h('tbody', rows))),
      h('div.uh-row', h('button.btn.btn-outline.btn-sm', { type: 'button', onclick: () => { s.rooms.push({ id: U.uid(), floor: '', name: '部屋', type: 'bed', tatami: 6, attrs: [], cand: false }); replan(); } }, icon('plus', 15), '部屋を足す')),
      notesBox,
      h('p.hint', '「候補」は設定文に書いていない部屋で、図では薄く出します。階・種類・畳数を変えると、いまの案の形で図を作り直します。階を「自動」にすると、種類から置く階を決めます。'));
  }
  /** 読み取った結果の下の知らせ(部屋のない階・指定と違う広さになった部屋・読み取れなかった言葉) */
  function renderNotes() {
    const s = ed.state, b = s.bld;
    const empty = floorKeys(b).filter((k) => k !== 'R' && !s.rooms.some((r) => !r.cand && effFloor(r, b) === k));
    // 図で手直ししたあとは、利用者が決めた大きさなので知らせない
    const off = s.edited ? [] : offRooms(s, s.plan.floors);
    const addRoom = (u) => {
      s.rooms.push({ id: U.uid(), floor: u.floor, name: u.word, type: 'room', tatami: ROOMS.room[2], attrs: [], cand: false });
      s.unread = s.unread.filter((x) => x !== u);
      replan(`${u.word}を表に足しました`);
    };
    notesBox.replaceChildren(
      empty.length ? h('p.uh-note', `${empty.map(floorLong).join('・')}に部屋がありません。`) : '',
      off.length ? h('p.uh-note', `${off.map((o) => `${o.room.name}（${o.room.tatami}帖→${o.jo}帖）`).join('、')}は指定と違う広さになっています。建物の幅と奥行きを広げるか、案を選び直してください。`) : '',
      s.unread.length ? h('div.uh-col',
        h('h3', '読み取れなかった言葉'),
        h('div.uh-row', s.unread.map((u) => h('button.btn.btn-outline.btn-sm', { type: 'button', title: `${u.word}を部屋として表に足す`, onclick: () => addRoom(u) }, icon('plus', 13), u.word))),
        h('p.hint', '部屋の名前なら、その言葉を押すと表に足します。部屋の種類と畳数は表で直せます。')) : '');
  }

  /* ---------- 案 ---------- */
  function secPlan(s) {
    const pick = (i) => { s.plan = makePlan(s, i); s.edited = false; view.sel = null; ed.dirty(); renderPanel(); requestPaint(); };
    return sec('案',
      h('div.uh-variants', VARIANTS.map((v, i) => h('button', { type: 'button', 'aria-pressed': String((s.plan.variant || 0) === i), onclick: async () => {
        if (s.edited && !(await U.confirmDialog({ title: '案を変える', message: '図で動かした部屋の位置と、直したドアや窓は消えます。案を変えますか？', okLabel: '変える' }))) return;
        pick(i);
      } }, h('b', v.label), h('small', v.desc)))),
      selInfo,
      planReset,
      h('p.hint', '階段とエレベーターはどの階も同じ所に置き、水回りはなるべく上下にそろえます。ドアと窓は部屋の種類から自動で付けます。図は「階ごと」で、部屋を動かしたり、ドアや窓を直したりできます。'));
  }
  const planReset = h('div.uh-row');
  /** 直したドアや窓があれば、自動に戻すボタンを出す */
  function renderPlanReset() {
    const s = ed.state, n = Object.values(s.plan.edits || {}).reduce((sum, fl) => sum + Object.keys(fl).length, 0);
    planReset.replaceChildren(n ? h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => { s.plan.edits = {}; ed.dirty(); requestPaint(); renderMemo(); renderPlanReset(); U.toast('ドアと窓を自動に戻しました'); } }, icon('refresh', 14), `直したドアと窓（${n} か所）を自動に戻す`) : '');
  }
  function renderSelInfo() {
    const s = ed.state, it = (s.plan.floors[s.floor] || []).find((x) => x.id === view.sel);
    if (!it) { selInfo.replaceChildren(); return; }
    const inf = infoOf(it);
    selInfo.replaceChildren(h('p', h('b', inf.name || ''), `（${floorLabel(s.floor)}）`, h('span', areaText(it, 'both'))));
  }

  /* ---------- 見た目 ---------- */
  function secLook(s) {
    return sec('見た目',
      field('描き方', seg('描き方', [['flyer', '物件チラシ風'], ['note', '手帳の手描き風']], s.style, (v) => ed.set('style', v))),
      field('広さの書き方', seg('広さの書き方', [['jo', '帖'], ['m2', '㎡'], ['both', '両方']], s.unit, (v) => { ed.set('unit', v); renderSelInfo(); })),
      field('家具', seg('家具', [[false, '描かない'], [true, '描く']], !!s.furn, (v) => ed.set('furn', v)), '浴槽やキッチンなどの設備は、いつも描きます'),
      field('北の向き', seg('北の向き', [[0, '上'], [1, '右'], [2, '下'], [3, '左']], s.north, (v) => { ed.set('north', v); renderMemo(); }), '窓を付ける辺と、覚え書きの窓の向きが変わります'));
  }

  /* ---------- ログと照らし合わせる ---------- */
  const logIn = $('logIn');
  logIn.addEventListener('change', async () => {
    const f = logIn.files[0];
    logIn.value = '';
    if (!f) return;
    try {
      U.toast('ログを読んでいます…');
      const html = await f.text();
      const m = html.match(/<script[^>]*id="talklog-data"[^>]*>([\s\S]*?)<\/script>/);
      if (!m) throw new Error('talklog で書き出した HTML ではないようです');
      view.log = analyzeLog(JSON.parse(m[1]), ed.state);
      renderLog();
      U.toast(`${view.log.total.toLocaleString()} 件の発言を照らし合わせました`);
    } catch (e) { U.toast(e.message || 'ログを読めませんでした', 'error'); }
  });
  function secLog() {
    return sec('ログと照らし合わせる',
      h('p.hint', 'talklog で書き出したトークの HTML を読み込むと、ログに出てくる住まいの言葉を数え、設定と食い違う言葉を発言と一緒に並べます。ログはこのブラウザの中で読むだけで、保存もしません。'),
      h('div.uh-row', h('button.btn.btn-outline.btn-sm', { type: 'button', onclick: () => logIn.click() }, icon('upload', 15), 'talklog の HTML を読み込む')),
      logBox);
  }
  // 建物の種類のうち、並んで出てきても食い違いとみなさない組
  const COMPAT = { ワンルーム: ['アパート', 'マンション'], マンション一棟: ['マンション', 'ビル'], ビル: ['マンション一棟'], マンション: ['マンション一棟', 'タワーマンション', 'ペントハウス'], タワーマンション: ['マンション', 'ペントハウス'], ペントハウス: ['マンション', 'タワーマンション'], 洋館: ['屋敷'], 屋敷: ['洋館'], 一軒家: [], アパート: [], 別荘: [] };
  function analyzeLog(data, s) {
    const items = (data.items || []).filter((x) => x && x.body);
    const bld = {}, rooms = {}, above = {}, below = {};
    const note = (bag, key, it, t, i, w) => {
      const e = bag[key] || (bag[key] = { count: 0, ex: [] });
      e.count++;
      if (e.ex.length < 3) e.ex.push({ who: it.name || (it.kind === 'narration' ? '地の文' : ''), text: (i > 24 ? '…' : '') + t.slice(Math.max(0, i - 24), i + w.length + 24).replace(/\s+/g, ' ') + (i + w.length + 24 < t.length ? '…' : '') });
    };
    // 長い書き方から探して塗りつぶす(「タワーマンション」を「マンション」に数え直さない)
    const scan = (t, it, list, bag) => {
      let rest = t;
      list.forEach(([w, key]) => {
        let i = rest.indexOf(w);
        while (i >= 0) {
          note(bag, key, it, t, i, w);
          rest = rest.slice(0, i) + '□'.repeat(w.length) + rest.slice(i + w.length);
          i = rest.indexOf(w, i + w.length);
        }
      });
    };
    const bldWords = BUILDINGS.flatMap(([name, ws]) => ws.map((w) => [w, name])).sort((a, b) => b[0].length - a[0].length);
    items.forEach((it) => {
      const t = normText(it.body);
      scan(t, it, bldWords, bld);
      scan(t, it, ROOM_WORDS, rooms);
      for (const m of t.matchAll(/(地下)?\s*(\d+)\s*階(?!建)/g)) {
        const n = Number(m[2]);
        if (n < 1 || n > 99) continue;
        if (m[1]) { if (n > s.bld.below) note(below, String(n), it, t, m.index, m[0]); }
        else if (n > s.bld.above) note(above, String(n), it, t, m.index, m[0]);
      }
    });
    const type = s.bld.type, ok = new Set([type, ...(COMPAT[type] || [])]);
    const conflicts = Object.entries(bld).filter(([k]) => type && !ok.has(k)).map(([k, v]) => ({ label: k, count: v.count, ex: v.ex }))
      .concat(Object.entries(above).map(([n, v]) => ({ label: `${n} 階（設定は地上 ${s.bld.above} 階まで）`, count: v.count, ex: v.ex })))
      .concat(Object.entries(below).map(([n, v]) => ({ label: `地下 ${n} 階（設定は地下 ${s.bld.below} 階まで）`, count: v.count, ex: v.ex })))
      .sort((a, b) => b.count - a.count);
    const have = new Set(s.rooms.map((r) => r.type));
    const missing = Object.entries(rooms).filter(([k, v]) => !have.has(k) && v.count >= 3).map(([k, v]) => ({ type: k, label: ROOMS[k][0], count: v.count, ex: v.ex })).sort((a, b) => b.count - a.count).slice(0, 12);
    const quiet = s.rooms.filter((r) => !r.cand && !rooms[r.type]).map((r) => r.name);
    return { total: items.length, title: data.title || '', conflicts, missing, quiet };
  }
  function renderLog() {
    const L = view.log;
    if (!L) { logBox.replaceChildren(); return; }
    const exList = (ex) => h('ul.uh-ex', ex.map((x) => h('li', x.who && h('b', x.who), x.text)));
    const item = (label, count, ex, extra) => h('details.uh-hit', h('summary', h('span', label), h('small', `${count.toLocaleString()} 回`), extra), exList(ex));
    logBox.replaceChildren(
      h('p.uh-logsum', `${L.title ? `「${L.title}」の ` : ''}${L.total.toLocaleString()} 件の発言を照らし合わせました。`),
      h('h3', '設定と食い違う言葉'),
      L.conflicts.length ? h('p.hint', '店やホテルなど、ほかの建物の話も数えています。開いて発言を確かめてください。') : '',
      L.conflicts.length ? h('div.uh-col', L.conflicts.map((c) => item(c.label, c.count, c.ex))) : h('p.hint', '見つかりませんでした。'),
      h('h3', '設定にない場所'),
      L.missing.length ? h('div.uh-col', L.missing.map((m) => item(m.label, m.count, m.ex, h('button.btn.btn-ghost.btn-sm', {
        type: 'button', onclick: (e) => { e.preventDefault(); ed.state.rooms.push({ id: U.uid(), floor: '', name: m.label, type: m.type, tatami: ROOMS[m.type][2], attrs: [], cand: false }); view.log.missing = view.log.missing.filter((x) => x !== m); replan(`${m.label}を表に足しました`); }
      }, icon('plus', 13), '表に足す')))) : h('p.hint', '見つかりませんでした。'),
      L.quiet.length ? h('p.hint', `設定の部屋のうち、ログに出てこないもの: ${L.quiet.join('・')}`) : '');
  }

  /* ---------- zeta に貼る覚え書き ---------- */
  // 数字の前後の空きを詰める(zeta に読ませる文は「地下1階」「12台」のように書く)
  const tight = (t) => String(t || '').replace(/\s*(\d+)\s*/g, '$1').trim();
  const joinJa = (list) => (list.length <= 2 ? list.join('と') : list.join('、'));
  const DOOR_JA = { swing: '開き戸', slide: '引き戸', fold: '折れ戸', open: '開口', entrance: '玄関ドア', shutter: 'シャッター' };
  // AI への約束の一文。書いたことは守らせ、書いていない部屋は話に必要なときだけ足してよいとする(キッチンなどを書いていない設定もあるため)
  const MEMO_RULE = 'この住まいの設定は会話の中で変えない。書いた部屋・出入り口・窓は守り、書いていない部屋や設備は、話に必要なときだけ、ここに書いたことと矛盾しないように足す。用途が未定の階は会話で決めてよい。';
  /** ドアの向こうの呼び方 */
  function sideName(o) {
    const t = typeOf(o);
    if (t === 'out') return '外';
    if (o && roomOf(o.id)) return roomOf(o.id).name;
    return { hall: '廊下', stairs: '階段', ev: 'エレベーター', store: '収納', deck: '屋上' }[t] || '用途が未定の所';
  }
  /** 物が建物のどのあたりにあるか(北西の角・南側・中ほど) */
  function placeOf(it, W, D, north) {
    const cx = it.x + it.w / 2 - W / 2, cy = it.y + it.h / 2 - D / 2, parts = [];
    if (Math.abs(cy) > D * 0.15) parts.push(dirOf(cy < 0 ? 't' : 'b', north));
    if (Math.abs(cx) > W * 0.15) parts.push(dirOf(cx < 0 ? 'l' : 'r', north));
    parts.sort((a, b) => 'NSEW'.indexOf(a) - 'NSEW'.indexOf(b));
    return parts.length ? parts.map((d) => DIR_JA[d]).join('') + (parts.length === 2 ? 'の角' : '側') : '中ほど';
  }
  /**
   * 覚え書きの中身を図から集める。候補の部屋は入れない。全ての階を並べ、部屋ごとに広さ・窓・出入り口を書く
   * (出入り口を全部書くことで、ほかからは入れないことも伝わる)
   */
  function memoData(s) {
    const b = s.bld, keys = floorKeys(b), floors = [], notes = [];
    let core = '';
    keys.forEach((key) => {
      // 1 階だけの住まいは、階ではなく「間取り」として書く
      const A = analyze(s, key), label = keys.length > 1 ? tight(floorLong(key)) : '間取り';
      const rooms = A.real.filter((it) => roomOf(it.id)).sort((p, q) => p.y - q.y || p.x - q.x);
      const st = A.real.find((it) => typeOf(it) === 'stairs');
      if (!core && st) core = placeOf(st, A.W, A.D, s.north);
      const list = rooms.map((it) => {
        const r = roomOf(it.id), t = r.type, wins = new Set(), doors = [];
        edgesOf(it, A.at).forEach((ed) => {
          const op = A.open.get(ed.e);
          if (op && op.k === 'window') wins.add(dirOf(ed.side, s.north));
          else if (op && DOOR_JA[op.k]) {
            doors.push(`${sideName(ed.other)}（${DOOR_JA[op.k]}）`);
            if (op.k === 'entrance') notes.push(`玄関は${keys.length > 1 ? label + 'の' : ''}${DIR_JA[dirOf(ed.side, s.north)]}側`);
          } else if (A.walls.get(ed.e) === 'step') doors.push(`${sideName(ed.other)}（上がり框）`);
          // 壁のない所でつながる部屋(LDK・ワンルームの洋室とキッチン)
          else if (!A.walls.has(ed.e) && ed.other && roomOf(ed.other.id) && !isOutdoor(typeOf(ed.other), key)) doors.push(`${roomOf(ed.other.id).name}（仕切りなし）`);
        });
        return {
          name: r.name, outdoor: isOutdoor(t, key),
          // 様子と広さは名前のあとの 1 つの括弧に(「スタジオ（完全防音・18.0帖）」)
          info: [...(r.attrs || []), SHOW_AREA.has(t) ? `${tatamiOf(it).toFixed(1)}帖` : ''].filter(Boolean),
          wins: ['S', 'E', 'W', 'N'].filter((d) => wins.has(d)).map((d) => DIR_JA[d]), doors: Array.from(new Set(doors))
        };
      });
      const open = A.ldk.filter((gr) => gr.length > 1).map((gr) => `${joinJa(gr.map((x) => roomOf(x.id).name))}は仕切りのないひと続き（${ldkName(gr)} ${(gr.reduce((sum, x) => sum + x.w * x.h, 0) / 2).toFixed(1)}帖）`);
      floors.push({ label, attrs: floorAttrsOf(b, key), rooms: list, open });
    });
    if (keys.length > 1) notes.unshift(`${b.ev ? '階段とエレベーター' : '階段'}は全ての階で同じ位置（${core}）にあり、各階の廊下に面している`);
    return {
      bld: {
        type: `${b.place ? b.place + 'の' : ''}${b.note || ''}${b.type || '住まい'}`,
        floors: keys.length > 1 ? `地上${b.above}階${b.below ? `・地下${b.below}階` : ''}${b.roof ? '・屋上あり' : ''}` : '',
        equip: [b.ev && 'エレベーター', ...(b.features || []).map(tight)].filter(Boolean),
        people: tight(b.people), pets: tight(b.pets)
      },
      floors, notes
    };
  }
  /** 部屋 1 つの説明。md は「窓は東、出入り口は…」、plain は「東に窓があり、出入り口は…」 */
  function roomLine(r, fmt) {
    const head = r.name + (r.info.length ? `（${r.info.join('・')}）` : '');
    if (r.outdoor) return fmt === 'md' ? `${head}: 屋外` : `${head}は屋外`;
    const win = r.wins.length ? (fmt === 'md' ? `窓は${r.wins.join('・')}` : `${r.wins.join('・')}に窓があり`) : (fmt === 'md' ? '窓なし' : '窓がなく');
    const door = r.doors.length ? `出入り口は${fmt === 'md' ? r.doors.join('・') : joinJa(r.doors)}` : '';
    return fmt === 'md' ? `${head}: ${[win, door].filter(Boolean).join('、')}` : `${head}は${win}${door ? `、${door}` : ''}`;
  }
  /** 覚え書きの文。memoFmt = md(見出しと箇条書き)・plain(短い文)。memoRule が false でなければ約束の一文を先に */
  function memoText(s) {
    const d = memoData(s), b = d.bld, rule = s.memoRule !== false;
    if (s.memoFmt === 'plain') {
      const head = [b.type, b.floors, b.equip.length && `設備は${b.equip.join('、')}`, b.people, b.pets && `${b.pets}を飼っている`, ...d.notes].filter(Boolean).map((x) => x + '。').join('');
      const fl = d.floors.map((f) => {
        const parts = [f.attrs.length ? f.attrs.join('・') : '', ...f.rooms.map((r) => roomLine(r, 'plain')), ...f.open].filter(Boolean);
        if (!f.rooms.length) parts.push('用途は未定');
        return `【${f.label}】${parts.map((x) => x + '。').join('')}`;
      });
      return [rule ? MEMO_RULE : '', `【住まい】${head}`, ...fl].filter(Boolean).join('\n');
    }
    const lines = ['## 住まい'];
    if (rule) lines.push(MEMO_RULE);
    lines.push('### 建物', `- 種類: ${b.type}`);
    if (b.floors) lines.push(`- 階数: ${b.floors}`);
    if (b.equip.length) lines.push(`- 設備: ${b.equip.join('、')}`);
    if (b.people) lines.push(`- 住む人: ${b.people}`);
    if (b.pets) lines.push(`- ペット: ${b.pets}`);
    d.notes.forEach((n) => lines.push(`- ${n}`));
    // 1 階だけの住まいは、階の段を作らずに部屋を並べる
    if (d.floors.length === 1) {
      lines.push('### 部屋');
      const f = d.floors[0];
      if (f.attrs.length) lines.push(`- 部屋全体: ${f.attrs.join('・')}`);
      f.rooms.forEach((r) => lines.push(`- ${roomLine(r, 'md')}`));
      f.open.forEach((o) => lines.push(`- ${o}`));
      return lines.join('\n');
    }
    lines.push('### 階ごとの部屋');
    d.floors.forEach((f) => {
      const head = `- ${f.label}${f.attrs.length ? `（${f.attrs.join('・')}）` : ''}`;
      if (!f.rooms.length) { lines.push(`${head}: 用途は未定`); return; }
      lines.push(head);
      f.rooms.forEach((r) => lines.push(`  - ${roomLine(r, 'md')}`));
      f.open.forEach((o) => lines.push(`  - ${o}`));
    });
    return lines.join('\n');
  }
  function secMemo(s) {
    return sec('zeta に貼る覚え書き',
      h('div.grid-2',
        field('書き方', seg('書き方', [['md', 'マークダウン'], ['plain', 'ふつうの文']], s.memoFmt === 'plain' ? 'plain' : 'md', (v) => { ed.set('memoFmt', v); renderMemo(); })),
        field('約束の一文', seg('約束の一文', [[true, '入れる'], [false, '入れない']], s.memoRule !== false, (v) => { ed.set('memoRule', v); renderMemo(); }))),
      memoBox,
      h('p.hint', 'zeta の AI が読む前提で、建物と、全ての階の部屋ごとの広さ・窓・出入り口を図からまとめます。出入り口をすべて書くので、ほかからは入れないことも伝わります。約束の一文は、書いたことを会話で変えず、書いていない部屋は矛盾しない範囲で足すよう AI に頼む文です。'));
  }
  function renderMemo() {
    const t = memoText(ed.state);
    const ta = h('textarea.uh-memo', { rows: 12, readonly: true, 'aria-label': 'zeta に貼る覚え書き' });
    ta.value = t;
    memoBox.replaceChildren(ta, h('div.uh-row', h('span.uh-count', `${t.length} 字`), h('span.kit-spacer'),
      h('button.btn.btn-outline.btn-sm', { type: 'button', onclick: () => U.copyText(ta.value, '覚え書きをコピーしました') }, icon('copy', 15), 'コピー')));
  }

  /* ---------- 保存 ---------- */
  function renderActions() {
    const b = h('button.btn.btn-primary', { type: 'button' }, icon('download', 17), 'いまの見え方を PNG で保存');
    b.addEventListener('click', async () => {
      b.disabled = true;
      try {
        // 画面と同じ割り付けのまま、幅 2400 px に拡大して描く(字や線の太さの比率を画面とそろえる)
        const s = ed.state, r = cv.getBoundingClientRect(), W = 2400, k = W / r.width, H = Math.round(r.height * k);
        if (document.fonts) await Promise.all([document.fonts.load(`700 20px ${FONT.flyer}`, '間取り'), document.fonts.load(`20px ${FONT.note}`, '間取り')]).catch(() => null);
        const c = document.createElement('canvas');
        c.width = W;
        c.height = H;
        const g = c.getContext('2d');
        g.scale(k, k);
        renderView(g, s, r.width, r.height, false);
        const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
        if (!blob) throw new Error('画像を作れませんでした');
        const name = s.view === 'floor' ? floorLabel(s.floor) : s.view === 'all' ? 'all' : 'section';
        await U.saveImage(blob, `userhome-${name}-${U.stamp()}.png`);
      } catch (e) { console.error(e); U.toast(e.message || '画像にできませんでした', 'error'); }
      finally { b.disabled = false; }
    });
    actions.replaceChildren(b);
  }

  /* ================================================================ 始め */
  Kit.mountBar('userhome');
  $('help').append(Ed.help('userhome', [
    '住まいの設定文を貼って「読み取って図にする」を押すと、建物・階・部屋を拾って表と図にします。',
    '表で階・名前・畳数を直せます。書いていない部屋は「候補」として薄く出し、勝手には足しません。',
    '案は 3 つあり、どれも階段とエレベーターをすべての階で同じ所に置きます。壁・ドア・窓・浴槽やキッチンなどの設備は、部屋の種類から自動で描きます。',
    '「階ごと」の見え方では、部屋をドラッグして動かせます。上の帯の「ドア」「引き戸」「窓」「壁」を選ぶと、壁を押してドアや窓を直せます。',
    'talklog で保存したトークを読み込むと、設定と食い違う言葉を見つけられます。覚え書きはマークダウンかふつうの文を選び、zeta にそのまま貼れます。'
  ]));
  document.body.append(Kit.footer());
  (async () => {
    await ed.load();   // 読み終える前に組むと、見本の中身で保存を上書きしてしまうので先に読む
    renderTools();
    renderPanel();
    fitStage();
    if (document.fonts) document.fonts.addEventListener('loadingdone', () => requestPaint());
  })();
})();
