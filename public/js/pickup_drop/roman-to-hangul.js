/* ============================================================
 * roman-to-hangul.js  —  BEST-EFFORT romanized Korean -> Hangul
 * ------------------------------------------------------------
 * Reverse Revised Romanization + common passport-syllable and
 * name-part maps. Converts each whitespace token IN THE SAME
 * ORDER it is stored - no surname/given-name guessing, no
 * reordering.
 *
 * This is an APPROXIMATION. Passport spellings are ambiguous and
 * a rule-based parser cannot match a native reading for every
 * name. The English line underneath stays authoritative; to force
 * an exact Korean name, store it in the guest name field, e.g.
 * "황티나 TINA HWANG".
 * ============================================================ */
(function (global) {
  'use strict';

  // roman -> index in the Unicode Hangul composition tables (try longer first)
  var ONSETS = [
    ['kk', 1], ['pp', 8], ['tt', 4], ['ss', 10], ['jj', 13], ['ch', 14],
    ['g', 0], ['n', 2], ['d', 3], ['r', 5], ['l', 5], ['m', 6], ['b', 7],
    ['s', 9], ['j', 12], ['k', 15], ['t', 16], ['p', 17], ['h', 18]
  ];
  var VOWELS = [
    ['yeo', 6], ['yae', 3], ['wae', 10], ['weo', 14], ['woo', 13],
    ['wa', 9], ['oe', 11], ['eui', 19], ['ui', 19], ['yu', 17], ['yo', 12], ['ya', 2], ['ye', 7],
    ['eu', 18], ['eo', 4], ['ae', 1], ['wo', 14], ['wi', 16], ['we', 15], ['oo', 13],
    ['a', 0], ['e', 5], ['i', 20], ['o', 8], ['u', 13]
  ];
  // Final consonants as written in passport-style romanization
  // (final ㄱ = "k", final ㅂ = "p", final ㄷ/ㅅ/ㅈ = "t"/"s", etc.)
  var CODA_ONE = {
    k: 1, g: 1, n: 4, t: 7, d: 7, l: 8, r: 8, m: 16, p: 17, b: 17, s: 19
  };

  // Fixed romanization -> Hangul for common Korean name-parts that the plain
  // syllable parser would get wrong (e.g. Kim = 김, not 킴). Applied per token
  // wherever it appears - no surname/position logic.
  var KNOWN = {
    kim: '김', gim: '김',
    lee: '이', yi: '이', rhee: '이', ri: '이', i: '이',
    park: '박', pak: '박', bak: '박',
    choi: '최', choe: '최',
    jung: '정', jeong: '정', chung: '정', jong: '정',
    kang: '강', gang: '강',
    cho: '조', jo: '조',
    yoon: '윤', yun: '윤',
    jang: '장', chang: '장',
    lim: '임', im: '임', rim: '임',
    han: '한',
    oh: '오', o: '오',
    seo: '서', suh: '서',
    shin: '신', sin: '신',
    kwon: '권', gwon: '권',
    hwang: '황',
    ahn: '안', an: '안',
    song: '송',
    jeon: '전', jun: '전', chun: '전',
    hong: '홍',
    yoo: '유', yu: '유', you: '유', ryu: '류',
    ha: '하',
    moon: '문', mun: '문',
    yang: '양',
    son: '손', sohn: '손',
    bae: '배',
    baek: '백', paek: '백', baik: '백',
    heo: '허', hur: '허', huh: '허',
    nam: '남',
    noh: '노', no: '노', roh: '노',
    koo: '구', ku: '구', gu: '구',
    min: '민',
    woo: '우', wu: '우',
    joo: '주', ju: '주',
    chu: '추', choo: '추',
    na: '나', ra: '나',
    shim: '심', sim: '심',
    ko: '고', go: '고', koh: '고',
    cha: '차',
    jin: '진', chin: '진',
    sung: '성', seong: '성',
    kwak: '곽', gwak: '곽',
    do: '도', doh: '도',
    wi: '위',
    ma: '마',
    bang: '방', pang: '방',
    gil: '길', kil: '길'
  };

  function matchFrom(list, str, pos) {
    for (var k = 0; k < list.length; k++) {
      var r = list[k][0];
      if (str.substr(pos, r.length) === r) return { rom: r, idx: list[k][1], len: r.length };
    }
    return null;
  }

  function isVowelStart(str, pos) {
    return pos < str.length && !!matchFrom(VOWELS, str, pos);
  }

  // Common Korean given-name syllables as written in passport spelling, where a
  // pure Revised-Romanization parse would be wrong. Longest match wins.
  var SYLLABLE = [
    ['hyeong', '형'], ['byeong', '병'], ['kyeong', '경'], ['gyeong', '경'], ['myeong', '명'],
    ['ryeong', '령'], ['young', '영'], ['yeong', '영'], ['kwang', '광'], ['gwang', '광'], ['hwang', '황'],
    ['cheol', '철'], ['cheul', '철'], ['chul', '철'], ['chol', '철'], ['chel', '철'],
    ['hyun', '현'], ['hyeon', '현'], ['kwan', '관'], ['gwan', '관'], ['hyung', '형'], ['ryung', '령'],
    ['byung', '병'], ['kyung', '경'], ['sung', '성'], ['seong', '성'], ['jung', '정'], ['jeong', '정'],
    ['seok', '석'], ['sok', '석'], ['suk', '석'], ['hwan', '환'], ['kwon', '권'], ['gwon', '권'],
    ['hoon', '훈'], ['hun', '훈'], ['joon', '준'], ['yoon', '윤'], ['geun', '근'], ['keun', '큰'],
    ['hee', '희'], ['hui', '희'], ['hye', '혜'], ['gyu', '규'], ['kyu', '규'], ['tae', '태'], ['dae', '대'],
    ['woo', '우'], ['soo', '수'], ['dong', '동'], ['sang', '상'], ['jin', '진'], ['min', '민'],
    ['eun', '은'], ['won', '원'], ['yeon', '연'], ['jae', '재'], ['bin', '빈'], ['rin', '린'], ['lin', '린'],
    ['sook', '숙'], ['hyo', '효'], ['jun', '준'], ['ho', '호'], ['ah', '아']
  ];

  // One romanized name-part -> Hangul (best effort).
  function syllablesToHangul(word) {
    word = String(word || '').toLowerCase().replace(/[^a-z]/g, '');
    var out = '';
    var i = 0;
    var guard = 0;

    while (i < word.length && guard++ < 60) {
      // Known passport-style syllable here? Use it only when what follows is
      // end-of-word or a consonant (a following vowel means a different split).
      var hit = matchFrom(SYLLABLE, word, i);
      if (hit && !isVowelStart(word, i + hit.len)) {
        out += hit.idx;   // for SYLLABLE, idx is the Hangul string
        i += hit.len;
        continue;
      }

      var p = i;

      // onset — only if it is directly followed by a vowel
      var onsetIdx = 11; // ㅇ (no consonant)
      var onset = matchFrom(ONSETS, word, p);
      if (onset && isVowelStart(word, p + onset.len)) {
        onsetIdx = onset.idx;
        p += onset.len;
      }

      // vowel — required for a syllable
      var vowel = matchFrom(VOWELS, word, p);
      if (!vowel) {
        out += word[i];   // give up on this char
        i += 1;
        continue;
      }
      var vowelIdx = vowel.idx;
      p += vowel.len;

      // coda — 'ng' is always final; a single consonant is a coda only when it
      // is NOT the onset of the next syllable (i.e. not directly before a vowel)
      var codaIdx = 0;
      if (word.substr(p, 2) === 'ng') {
        codaIdx = 21; p += 2;
      } else {
        var c1 = word[p];
        if (c1 && CODA_ONE.hasOwnProperty(c1) && !isVowelStart(word, p + 1)) {
          codaIdx = CODA_ONE[c1];
          p += 1;
        }
      }

      out += String.fromCharCode(0xAC00 + (onsetIdx * 21 * 28) + (vowelIdx * 28) + codaIdx);
      i = p;
    }
    return out;
  }

  // Romanized name -> Hangul, token by token, IN THE SAME ORDER as stored.
  // No surname/given-name guessing, no reordering. '' if not usable.
  function romanNameToHangul(fullName) {
    var raw = String(fullName || '').trim();
    if (!raw) return '';
    var tokens = raw.split(/\s+/).filter(Boolean);
    if (!tokens.length) return '';

    var out = tokens.map(function (tok) {
      var key = tok.toLowerCase().replace(/[^a-z]/g, '');
      return (key && KNOWN[key]) || syllablesToHangul(tok);
    }).join(' ');

    if (!out || /[a-z]/i.test(out)) return '';           // parse failed
    return out;
  }

  global.RomanToHangul = { name: romanNameToHangul, syllables: syllablesToHangul };
})(window);
