/* 3D building of a property's rooms (floors pulled apart and seen from above, front row nearest the street, back row behind the corridor).
   Used by the Dashboard of a property that has BUILDING_VIEW = 1 (Clark Central, Main Stay): the property's card and its full dashboard.
   Ported from the "A · Floor plates" view of the hotel-layouts test bed (vanilla JS, no framework).

     Building3D.render(el, rooms, { name, code, mode: 'full' | 'card', onRoom(room) })
       rooms: [{ no, status ('1' clean, '2' occupied, '3' out of order, '4' dirty, '5' tenant), guest, bookingId, arriving, leaving }]
       code:  the property's CODE; a property listed in LAYOUTS (Main Stay) is drawn from its floor plan, any other one by placeOf (Clark Central)
     Building3D.counts(rooms, code) -> { occupied, vacant, dirty, ooo, arriving, leaving, ..., tenant }
     Building3D.unplaced(rooms, code) -> the rooms the building has no place for (they exist in the system but are not drawn)
     Building3D.swatches(code, dark) -> the colors of the legend that depend on the building (clean-empty tile, tenant unit)
   'card' draws it small and not clickable (the card opens the full dashboard), without the room numbers. */
(function () {
  var DX = 64, DY = 62, SLAB = 12, POD = 28, ROOM_H = 3, AIR = 15, FONT = 9, NUM_DY = 6, NUM_DX = 3;   // NUM_DY: the room number sits low on the tile, not in the middle
  var ROOM_W = 48, GAP_H = 36, OX = 58, TOP = 46;
  var ROWS = { front: [0.05, 0.45], back: [0.55, 0.95] };
  var LIT = { top: '#fff4d6', bottom: '#ffc65e', glow: '#ffd27a', edge: '#fff0c4' };   // occupied: lit warm gold against the orange building
  var FILL = { dirty: '#8a7433', ooo: '#b3aaa6' };   // dirty: a muddy olive-brown, like something that needs cleaning
  var INK = { occupied: '#3a2300', vacant: '#fff1e6', dirty: '#fff3d0', ooo: '#241b18' };   // vacant: white on the dark tile (the original; other colors were tried and dropped)
  var LABEL = { occupied: 'Occupied', vacant: 'Clean, empty', dirty: 'To be cleaned', ooo: 'Out of order', tenant: 'Tenant' };
  var LIT_RED = { top: '#ff8f8f', bottom: '#e8343a', glow: '#ff4d52', edge: '#ffb3b3' };   // occupied and the guest leaves today: the lit room turns red
  var LATE_BLUE = '#1aa3ea';   // the strip of a room whose guest checks out LATE today
  var BTB_BG = '#1d3f9e';   // the BTB badge (back-to-back), same navy as the calendar's
  var URGENT = '#f97316';   // housekeeping: dirty room with a guest arriving today
  var LATE_IN = '#f59a23';   // the dot of a guest who checks in LATE today (orange); a regular check-in is green
  var ARRIVE = '#34d399', LEAVE = '#e8343a';
  var VIP_GOLD = '#f5c542';
  var TENANT = { fill: '#d8b4fe', edge: '#f3e8ff', ink: '#3b0764' };   // a unit rented out to a tenant (Main Stay): not a room of the system, never booked
  var TILE_GAP = 4.4, DOOR_HALF = 24.75;   // floor-plan buildings: half the space between two tiles / half the entrance door, in drawing units
  // floor-plan buildings (narrower tiles): the bed dots sit BED_X from the tile's left edge and the room number starts NUM_X from it, after the dots
  // (left-aligned, so the dots and the number never touch, whatever the width of the font's digits)
  var BED_X = 5, NUM_X = 10.5, NUM_X2 = 1.6;   // NUM_X2: the extra space before the number of a room with two (stacked) bed dots
  var LEAVE_INK = { fill: '#ffffff', edge: '#8f1116' };   // floor-plan buildings: the number on a red room (the guest leaves today)
  var uidN = 0;

  function palette(dark, theme) {
    if (theme === 'blue') return dark ? BLUE.dark : BLUE.light;
    if (theme === 'teal') return dark ? TEAL.dark : TEAL.light;
    return dark
      ? { wallA: '#e0600f', wallB: '#b24509', roof: '#f47f36', edge: '#ffd0a8', empty: '#2c2430', emptyEdge: '#d98a5a', tileStroke: '#ffe3cf', label: '#fff0e4', faint: '#ffc9a0', ground: '#2a2120', shade: '#050304', sign: '#ff9a52', front: '#ffc9a0', back: '#ffc9a0', canvas: '#1d1a24' }
      : { wallA: '#f58a45', wallB: '#dd6a2c', roof: '#ffb27a', edge: '#a2400a', empty: '#5a3f4a', emptyEdge: '#7a3a14', tileStroke: '#9a5a3a', label: '#4a2410', faint: '#8a5030', ground: '#f6e6da', shade: '#7a3a14', sign: '#e8590c', front: '#a2400a', back: '#a2400a', canvas: '#fff8f3' };
  }
  // Main Stay's shell (walls, roof, edges, sign) in its own blue; the room colors stay the same as Clark Central's, so a tile means the same
  // thing in every hotel. core = the stairs / elevator column.
  var BLUE = {
    dark: { wallA: '#3f5fe6', wallB: '#2c44b8', roof: '#7b93fa', edge: '#cdd7ff', empty: '#2c2430', emptyEdge: '#8ea0f5', tileStroke: '#e3e9ff', label: '#eef2ff', faint: '#b4c2ff', ground: '#1d2130', shade: '#020306', sign: '#8aa0ff', front: '#b4c2ff', back: '#b4c2ff', canvas: '#181c2b', core: '#4a63d8', coreInk: '#eef2ff' },
    light: { wallA: '#6f8ff7', wallB: '#4f6fe6', roof: '#a9bcff', edge: '#233a9e', empty: '#5a3f4a', emptyEdge: '#2a3f9e', tileStroke: '#3a4f9a', label: '#16245e', faint: '#3550b8', ground: '#e4eafb', shade: '#1e2f80', sign: '#3b5bdb', front: '#233a9e', back: '#233a9e', canvas: '#f5f7ff', core: '#8aa2f5', coreInk: '#16245e' }
  };

  // Pool Villa's shell (walls, roof edge, sign) in its own teal; the room colors stay the same as everywhere, so a villa's roof means what a tile means
  var TEAL = {
    dark: { wallA: '#12a077', wallB: '#0b7a5b', roof: '#35c9a0', edge: '#c3fae8', empty: '#2c2430', emptyEdge: '#63e6be', tileStroke: '#d3f9ec', label: '#e6fcf5', faint: '#96f2d7', ground: '#12251f', shade: '#020807', sign: '#38d9a9', canvas: '#12251f' },
    light: { wallA: '#2fbf94', wallB: '#1a9a74', roof: '#8be8cb', edge: '#0b6e52', empty: '#5a3f4a', emptyEdge: '#0b6e52', tileStroke: '#2a7a62', label: '#073b2c', faint: '#1a8a68', ground: '#e0f5ee', shade: '#0b4a38', sign: '#0b8a63', canvas: '#f1fcf8' }
  };
  // Pool Villa: a few villas on the ground (no floors) - each one is drawn as a house on its own, side by side in front of the pool
  var VILLAS = { pool_villa: { rooms: ['13', '14', '15'], label: 'Villa' } };

  /* Floor plans, by property CODE. Each floor: the front row and the back row, both written LEFT TO RIGHT as seen from the street,
     the left half | the right half (the stairs / elevator column sits between them). A token is
       302        a room          302-307 / 331-324   a run of rooms (either direction)          302x2   a room 2 columns wide
       T2         a tenant unit 2 columns wide that is not a room of the system                   -       an empty column
     (a room whose status is Tenant is drawn as a tenant block wherever it is; Main Stay's tenant units are such rooms, e.g. 301x2)
     When a half holds fewer columns than it has (6F of Main Stay), its units are stretched to fill it.
     geo: the drawing's proportions (thinner tiles, deeper rows and more air between floors for the wide 18-column building). */
  var LAYOUTS = {
    main: {
      theme: 'blue', halves: [8, 9], core: { front: 'STAIRS', back: 'ELEVATOR', backShort: 'ELEV' },
      geo: { roomW: 40, dy: 74, air: 26 },
      // Room numbers run counter-clockwise from the lower left: the front row left to right, then the back row right to left.
      floors: {
        // the wide rooms at the ends (301x2, 317x3...) are the tenant rooms (status Tenant)
        3: { front: '301x2 302-307 | 308-316', back: '331-324 | 323-318 317x3' },
        4: { front: '401x2 402-407 | 408-416', back: '431-424 | 423-418 417x3' },
        5: { front: '501x2 502-507 | 508-516', back: '531-524 | 523 522 520-518 517x4' },   // 521 does not exist
        6: { front: '601 602-607 | 608 610-616', back: '630-624 | 623x2 622-619 617x2' }    // 609 / 631 do not exist (618: part of 617's unit for now); 6F has fewer, bigger rooms
      }
    }
  };

  // one half-row of a floor plan -> [{ kind: 'room' | 'tenant' | 'blank', no, w }]
  function tokens(s) {
    var out = [];
    String(s || '').trim().split(/\s+/).forEach(function (t) {
      var m;
      if (!t) return;
      if ((m = /^T(\d+(?:\.\d+)?)$/i.exec(t))) out.push({ kind: 'tenant', w: +m[1] });
      else if (t === '-') out.push({ kind: 'blank', w: 1 });
      else if ((m = /^(\d+)-(\d+)$/.exec(t))) { var a = +m[1], b = +m[2], d = a <= b ? 1 : -1; for (var n = a; n !== b + d; n += d) out.push({ kind: 'room', no: String(n), w: 1 }); }
      else if ((m = /^(\d+)x(\d+(?:\.\d+)?)$/i.exec(t))) out.push({ kind: 'room', no: m[1], w: +m[2] });
      else if (/^\d+$/.test(t)) out.push({ kind: 'room', no: t, w: 1 });
    });
    return out;
  }
  function planTokens(lay) {
    var all = [];
    Object.keys(lay.floors).forEach(function (f) { ['front', 'back'].forEach(function (s) { all = all.concat(tokens(String(lay.floors[f][s] || '').replace('|', ' '))); }); });
    return all;
  }

  // a floor plan -> the floors from the ground up, in the same shape as parts() (front / back rooms with pos + span, which may be fractional
  // where a half is stretched), plus `extras`: the tenant units, the stairs / elevator column and the plan's rooms the system doesn't have
  function layoutParts(rooms, lay) {
    var byNo = {}; rooms.forEach(function (r) { byNo[String(r.no)] = r; });
    var L = lay.halves[0], R = lay.halves[1], cols = L + 1 + R;
    return Object.keys(lay.floors).map(Number).sort(function (a, b) { return a - b; }).map(function (f) {
      var part = { kind: 'floor', floor: f, front: [], back: [], extras: [], cols: cols };
      ['back', 'front'].forEach(function (side) {
        var halves = String(lay.floors[f][side] || '').split('|');
        [[halves[0], 0, L], [halves[1], L + 1, R]].forEach(function (h) {
          var list = tokens(h[0]), sum = list.reduce(function (s, x) { return s + x.w; }, 0), at = h[1], k = sum ? h[2] / sum : 0;
          list.forEach(function (x) {
            var c0 = at, c1 = at + x.w * k; at = c1;
            if (x.kind === 'tenant') part.extras.push({ kind: 'tenant', side: side, c0: c0, c1: c1 });
            else if (x.kind === 'room') {
              if (byNo[x.no]) part[side].push({ r: byNo[x.no], side: side, pos: c0 + 1, span: c1 - c0 });
              else part.extras.push({ kind: 'missing', side: side, c0: c0, c1: c1, no: x.no });
            }
          });
        });
        if (lay.core) part.extras.push({ kind: 'core', side: side, c0: L, c1: L + 1 });
      });
      return part;
    });
  }

  // Clark Central's numbering: 401-411 are the front rooms (401 at the right end seen from the street, 411 at the left end),
  // 412-422 the back rooms (412 at the left end, behind 411). The only place that knows how a number becomes a place.
  // Floors with a plan of their own (the 11th floor): the floor is divided into `cols` equal columns; every room has its first column (pos) and
  // how many columns it covers (span). From the floor plan: the front rooms 1101-1106 are twice as wide as the back rooms and so is 1107 (left
  // end). The stairs / lift hall of the plan is not drawn as a space: the rooms are simply as wide as the floor needs, so it is filled.
  var PLANS = {
    11: {
      cols: 12,
      front: { 1: [11, 2], 2: [9, 2], 3: [7, 2], 4: [5, 2], 5: [3, 2], 6: [1, 2] },
      back: { 7: [1, 2], 8: [3, 1], 9: [4, 1], 10: [5, 1], 11: [6, 1], 12: [7, 1], 13: [8, 1], 14: [9, 1], 15: [10, 1], 16: [11, 1], 17: [12, 1] }
    }
  };

  function placeOf(no) {
    var n = parseInt(no, 10);
    if (!isFinite(n) || n < 100) return null;
    var floor = Math.floor(n / 100), idx = n % 100;
    var plan = PLANS[floor];
    if (plan) {
      var hit = plan.front[idx] ? { side: 'front', c: plan.front[idx] } : plan.back[idx] ? { side: 'back', c: plan.back[idx] } : null;
      return hit ? { floor: floor, side: hit.side, pos: hit.c[0], span: hit.c[1], cols: plan.cols } : null;
    }
    if (idx >= 1 && idx <= 11) return { floor: floor, side: 'front', pos: 12 - idx, span: 1 };
    if (idx >= 12 && idx <= 22) return { floor: floor, side: 'back', pos: idx - 11, span: 1 };
    return null;
  }

  // BACK-TO-BACK = a LATE check-out followed by a LATE check-in in the same room on the same day (a late check-out makes the next check-in late).
  // A regular check-out with a regular check-in is just a leaving room (red) with the green "arriving" dot.
  function btbOf(r) { return !!(r.arriving && r.leaving && r.late && r.arrivingLate); }
  function kind(r) { var s = String(r.status); return s === '2' ? 'occupied' : s === '3' ? 'ooo' : s === '4' ? 'dirty' : s === '5' ? 'tenant' : 'vacant'; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function pts(l) { return l.map(function (q) { return q[0].toFixed(1) + ',' + q[1].toFixed(1); }).join(' '); }

  // Housekeeping view: a tile of the dashboard "focuses" one kind of room - the others fade out
  function matchFocus(r, k, focus, reqs) {
    switch (focus) {
      case 'requests': return !!(reqs && reqs[r.no]);
      case 'dirty': return k === 'dirty';
      case 'leaving': return k === 'occupied' && !!r.leaving;
      case 'late': return k === 'occupied' && !!r.leaving && !!r.late;
      case 'stay': return k === 'occupied' && !r.leaving;
      case 'arriving': return !!r.arriving;
      case 'urgent': return !!r.arriving && k === 'dirty';
      case 'ooo': return k === 'ooo';
      default: return true;
    }
  }

  // (urgent = a DIRTY room where a guest arrives today; a leaving room with an arrival is the BTB badge)
  function counts(rooms, code) {
    var c = { occupied: 0, vacant: 0, dirty: 0, ooo: 0, arriving: 0, leaving: 0, late: 0, arrLate: 0, arrReg: 0, btb: 0, stay: 0, urgent: 0, tenant: 0 };
    (rooms || []).forEach(function (r) { c[kind(r)]++; if (r.arriving) c.arriving++; if (r.leaving) c.leaving++; if (r.leaving && r.late && !btbOf(r)) c.late++; if (btbOf(r)) c.btb++; if (kind(r) === 'occupied' && !r.leaving) c.stay++; if (r.arriving && kind(r) === 'dirty') c.urgent++; if (r.arriving && !btbOf(r)) { if (r.arrivingLate) c.arrLate++; else c.arrReg++; } });
    // (the rooms with the Tenant status are counted above; a floor plan may also have tenant units that are not rooms - T tokens)
    if (LAYOUTS[code]) c.tenant += planTokens(LAYOUTS[code]).filter(function (x) { return x.kind === 'tenant'; }).length;
    return c;
  }

  // the rooms of the system the building has no place for (not drawn): the dashboard names them instead of hiding them
  function unplaced(rooms, code) {
    if (VILLAS[code]) { var vs = {}; VILLAS[code].rooms.forEach(function (n) { vs[n] = true; }); return (rooms || []).filter(function (r) { return !vs[String(r.no)]; }); }
    var lay = LAYOUTS[code], set = {};
    if (lay) planTokens(lay).forEach(function (x) { if (x.kind === 'room') set[x.no] = true; });
    return (rooms || []).filter(function (r) { return lay ? !set[String(r.no)] : !placeOf(r.no); });
  }
  // legend colors that depend on the building: the clean-empty tile of the theme, the tenant unit (only a building with a floor plan has them)
  function swatches(code, dark) {
    var lay = LAYOUTS[code] || (VILLAS[code] ? { theme: 'teal' } : null), p = palette(dark == null ? document.documentElement.getAttribute('data-theme') !== 'white' : dark, lay && lay.theme);
    return { vacant: lay ? p.empty : '#2c2430', tenant: TENANT.fill };   // (Clark Central keeps the clean-empty swatch it always had)
  }

  // the building from the ground up: the floors that have rooms, with one break for each run of floors the hotel doesn't have
  function parts(rooms) {
    var by = {};
    rooms.forEach(function (r) { var pl = placeOf(r.no); if (!pl) return; (by[pl.floor] = by[pl.floor] || []).push({ r: r, side: pl.side, pos: pl.pos, span: pl.span || 1, cols: pl.cols || 0 }); });
    var floors = Object.keys(by).map(Number); if (!floors.length) return [];
    var top = Math.max.apply(null, floors), out = [];
    for (var f = 1; f <= top; f++) {
      if (by[f]) out.push({ kind: 'floor', floor: f, front: by[f].filter(function (x) { return x.side === 'front'; }), back: by[f].filter(function (x) { return x.side === 'back'; }), cols: Math.max.apply(null, by[f].map(function (x) { return x.cols || (x.pos + x.span - 1); })) });
      // floors the hotel doesn't have (e.g. 1F-3F of Clark) are simply not drawn: the building starts at its first floor
    }
    return out;
  }

  function injectCss() {
    if (document.getElementById('b3dCss')) return;
    var st = document.createElement('style'); st.id = 'b3dCss';
    st.textContent =
      '.b3d{display:block;width:100%;height:auto;overflow:visible}.b3d-room{outline:none}.b3d.is-full .b3d-room{cursor:pointer}.b3d.b3d-noclick .b3d-room{cursor:default}' +
      '.b3d.is-full .b3d-room:hover .b3d-face,.b3d.is-full .b3d-room:focus-visible .b3d-face{stroke-width:2.2;stroke-opacity:1}' +
      '.b3d-in .b3d-floor{animation:b3dRise .8s cubic-bezier(.16,.84,.3,1) both;animation-delay:calc(var(--f,0)*120ms + 150ms)}' +
      '@keyframes b3dRise{from{opacity:0;transform:translateY(34px)}to{opacity:1;transform:none}}' +
      '.b3d-lit{animation:b3dGlow 3.6s ease-in-out infinite;animation-delay:calc(var(--g,0)*160ms)}@keyframes b3dGlow{0%,100%{opacity:.55}50%{opacity:.9}}' +
      '@media (prefers-reduced-motion:reduce){.b3d-in .b3d-floor,.b3d-lit{animation:none}}';
    document.head.appendChild(st);
  }

  function build(rooms, opt) {
    var full = opt.mode === 'full', dark = opt.dark !== false, lay = LAYOUTS[opt.code] || null, p = palette(dark, lay && lay.theme), uid = 'b3d' + (++uidN) + '-';
    var P_ = lay ? layoutParts(rooms, lay) : parts(rooms); if (!P_.length) return '';
    // a floor-plan building has its own proportions (Main Stay: 18 thinner columns, deeper rows); Clark Central uses the defaults
    var geo = (lay && lay.geo) || {}, RW0 = geo.roomW || ROOM_W, Dy = geo.dy || DY, Air = geo.air || AIR;
    var widest = Math.max.apply(null, [10].concat(P_.map(function (x) { return x.kind === 'floor' ? x.cols : 0; })));
    // opt.fitRatio (width / height of the box the building is shown in): the rooms are drawn wider, so the building fills a wide box
    // instead of leaving empty bands at its sides (the height of the building does not change)
    var lift = opt.fitRatio > 0 ? 9 : 0;   // a little more room between the floors: the building is taller (stretched to the top) when it is shown big
    var top0 = opt.fitRatio > 0 ? 22 : TOP;   // when it is shown big the sign sits closer to the top (less empty space above the building)
    var H0 = top0 + P_.reduce(function (sum, x) { return sum + (x.kind === 'gap' ? GAP_H : SLAB + ROOM_H + Dy + Air + lift); }, 0) + Dy * 0.62 + 16 + POD;
    var rw = RW0;
    if (opt.fitRatio > 0) rw = Math.max(RW0, Math.min(RW0 * 1.9, ((opt.fitRatio * H0 - OX - DX - 70) * 0.96) / widest));
    var fs = FONT * (1 + (rw / RW0 - 1) * 0.45);   // the room numbers grow a little with the wider rooms
    var len = (widest * rw) / 0.96;
    var gu = lay ? TILE_GAP / len : 0.008;   // the space at each side of a tile
    var pitch = SLAB + ROOM_H + Dy + Air + lift;
    var heights = P_.map(function (x) { return x.kind === 'gap' ? GAP_H : pitch; });
    var totalH = heights.reduce(function (s, h) { return s + h; }, 0);
    var W = OX + len + DX + 70, H = top0 + totalH + Dy * 0.62 + 16 + POD, baseY = top0 + totalH, G = -POD;
    var SQ = 0.88, LEAN = (DX / Dy) * SQ * 0.3;
    // the entrance door: in the middle, or in front of the stairs when the building has a stairs / elevator column
    var d0 = 0.455, d1 = 0.545;
    if (lay && lay.core) { var dc = 0.02 + (lay.halves[0] + 0.5) / P_[0].cols * 0.96; d0 = dc - DOOR_HALF / len; d1 = dc + DOOR_HALF / len; }
    function P(u, v, h) { return [OX + u * len + v * DX, baseY - h - v * Dy]; }
    function quadTop(u0, u1, v0, v1, h) { return [P(u0, v0, h), P(u1, v0, h), P(u1, v1, h), P(u0, v1, h)]; }
    function quadFront(u0, u1, v, h0, h1) { return [P(u0, v, h0), P(u1, v, h0), P(u1, v, h1), P(u0, v, h1)]; }
    function quadRight(u, v0, v1, h0, h1) { return [P(u, v0, h0), P(u, v1, h0), P(u, v1, h1), P(u, v0, h1)]; }
    function ln(a, b, attrs) { return '<line x1="' + a[0].toFixed(1) + '" y1="' + a[1].toFixed(1) + '" x2="' + b[0].toFixed(1) + '" y2="' + b[1].toFixed(1) + '" ' + attrs + '/>'; }
    function poly(l, attrs) { return '<polygon points="' + pts(l) + '" ' + attrs + '/>'; }
    // text lying on a tile (skewed like the tile, sitting low on it like the room numbers); fitSize = the biggest size at which it fits the tile
    function tileText(face, txt, size, attrs) {
      var cx = face.reduce(function (s, q) { return s + q[0]; }, 0) / 4, cy = face.reduce(function (s, q) { return s + q[1]; }, 0) / 4;
      return '<text x="' + (-NUM_DX).toFixed(2) + '" y="' + (size * 0.36 + NUM_DY).toFixed(2) + '" transform="matrix(1 0 ' + (-LEAN).toFixed(3) + ' ' + SQ + ' ' + cx.toFixed(1) + ' ' + cy.toFixed(1) + ')" text-anchor="middle" font-size="' + size.toFixed(2) + '" pointer-events="none" ' + attrs + '>' + esc(txt) + '</text>';
    }
    function fitSize(wu, txt, max) { return Math.min(max, (wu - 6) / (String(txt).length * 0.7)); }
    // a unit rented out to a tenant: raised like a room, its own color, TENANT instead of a number
    function tenantBlock(u0, u1, v0, v1, t) {
      var top = t + ROOM_H, face = quadTop(u0, u1, v0, v1, top), wu = (u1 - u0) * len, out = [];
      out.push(ln(P(u0, v0, t), P(u1, v0, t), 'stroke="' + TENANT.fill + '" stroke-width="1.4" pointer-events="none"'));
      [quadRight(u1, v0, v1, t, top), quadFront(u0, u1, v0, t, top)].forEach(function (sd) { out.push('<g pointer-events="none">' + poly(sd, 'fill="' + TENANT.fill + '"') + poly(sd, 'fill="#000" opacity=".3"') + '</g>'); });
      out.push(poly(face, 'class="b3d-face" fill="' + TENANT.fill + '" stroke="' + TENANT.edge + '" stroke-opacity=".7" stroke-width=".7" stroke-linejoin="round"'));
      if (full && wu >= 28) out.push(tileText(face, 'TENANT', fitSize(wu, 'TENANT', 6.5 * fs / FONT), 'font-weight="700" letter-spacing="0.08em" fill="' + TENANT.ink + '"'));
      return out.join('');
    }
    // a tile of a floor plan that is not a room of the system (layoutParts' extras)
    function extraTile(ex, part, t, v0, v1) {
      var w = 0.96 / part.cols, u0 = 0.02 + ex.c0 * w + gu, u1 = 0.02 + ex.c1 * w - gu, wu = (u1 - u0) * len, top = t + ROOM_H, out = [];
      var faded = opt.focus ? ' style="opacity:.17"' : '';   // the housekeeping focus shows only the rooms it asks for
      // the stairs (front row) / elevator (back row): flat on the floor, drawn like a plan symbol (steps / a shaft with a cross)
      if (ex.kind === 'core') {
        var cf = quadTop(u0, u1, v0, v1, t + 0.6), stairs = ex.side === 'front', name = stairs ? lay.core.front : lay.core.back;
        out.push('<g pointer-events="none"><title>' + (stairs ? 'Stairs' : 'Elevator') + '</title>');
        out.push(poly(cf, 'fill="' + p.core + '" stroke="' + p.edge + '" stroke-opacity=".7" stroke-width=".7" stroke-linejoin="round"'));
        if (stairs) { for (var s = 1; s < 6; s++) { var vs = v0 + (v1 - v0) * s / 6; out.push(ln(P(u0 + gu * 0.6, vs, t + 0.6), P(u1 - gu * 0.6, vs, t + 0.6), 'stroke="' + p.coreInk + '" stroke-opacity=".3" stroke-width=".8"')); } }
        else out.push(ln(cf[0], cf[2], 'stroke="' + p.coreInk + '" stroke-opacity=".28" stroke-width=".8"') + ln(cf[1], cf[3], 'stroke="' + p.coreInk + '" stroke-opacity=".28" stroke-width=".8"'));
        if (full) {
          var fz = fitSize(wu, name, 6.5 * fs / FONT);
          if (fz < 5.5 && !stairs && lay.core.backShort) { name = lay.core.backShort; fz = fitSize(wu, name, 6.5 * fs / FONT); }
          out.push(tileText(cf, name, fz, 'font-weight="700" letter-spacing="0.06em" fill="' + p.coreInk + '" stroke="' + p.core + '" stroke-width="2.4" paint-order="stroke"'));
        }
        out.push('</g>');
        return out.join('');
      }
      var face = quadTop(u0, u1, v0, v1, top);
      // a unit rented out to a tenant: raised like a room, its own color, no number (tenants are not rooms of the system)
      if (ex.kind === 'tenant') return '<g pointer-events="none"' + faded + '><title>Tenant (not bookable)</title>' + tenantBlock(u0, u1, v0, v1, t) + '</g>';
      // a room of the floor plan the system doesn't have (deleted, or not created yet): only its outline
      out.push('<g pointer-events="none"' + faded + '><title>Room ' + esc(ex.no) + ' · not in the system</title>');
      out.push(poly(face, 'fill="none" stroke="' + p.faint + '" stroke-opacity=".7" stroke-width=".8" stroke-dasharray="3 2.5" stroke-linejoin="round"'));
      if (full) out.push(tileText(face, ex.no, fs, 'font-weight="400" letter-spacing="0.07em" fill="' + p.faint + '" fill-opacity=".7"'));
      out.push('</g>');
      return out.join('');
    }
    var o = [];

    o.push('<svg class="b3d ' + (full ? 'is-full' : 'is-card') + (opt.noClick ? ' b3d-noclick' : '') + (opt.animate ? ' b3d-in' : '') + '" viewBox="0 0 ' + W.toFixed(0) + ' ' + H.toFixed(0) + '" role="img" aria-label="' + esc(opt.name || 'Hotel') + ' building" style="' + (full ? '' : 'pointer-events:none') + '">');
    o.push('<defs>' +
      '<linearGradient id="' + uid + 'lit" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + LIT.top + '"/><stop offset="1" stop-color="' + LIT.bottom + '"/></linearGradient>' +
      '<linearGradient id="' + uid + 'litr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + LIT_RED.top + '"/><stop offset="1" stop-color="' + LIT_RED.bottom + '"/></linearGradient>' +
      '<linearGradient id="' + uid + 'wl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset="1" stop-color="#000" stop-opacity=".16"/></linearGradient>' +
      '<linearGradient id="' + uid + 'tl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".14"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
      '<filter id="' + uid + 'glow" x="-70%" y="-70%" width="240%" height="240%"><feGaussianBlur stdDeviation="2.4"/></filter>' +
      '<filter id="' + uid + 'shadow" x="-10%" y="-60%" width="120%" height="220%"><feGaussianBlur stdDeviation="5"/></filter>' +
      '<filter id="' + uid + 'sign" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="3"/></filter>' +
      '<pattern id="' + uid + 'hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="4" stroke="#4a3025" stroke-width="1.6" stroke-opacity=".55"/></pattern></defs>');

    // the ground, with the street in front of the building
    o.push(poly(quadTop(0, 1.03, -0.62, 1.12, G), 'fill="' + p.ground + '" opacity=".85"'));
    o.push(poly(quadTop(0, 1.03, -0.62, -0.28, G), 'fill="' + p.faint + '" opacity=".18"'));
    var st0 = P(0.02, -0.45, G), st1 = P(1.01, -0.45, G), stm = P(0.5, -0.45, G);
    o.push(ln(st0, st1, 'stroke="' + p.label + '" stroke-opacity=".35" stroke-dasharray="8 6"'));
    o.push('<text x="' + stm[0].toFixed(1) + '" y="' + (stm[1] - 5).toFixed(1) + '" text-anchor="middle" font-size="12" font-weight="700" letter-spacing="0.2em" fill="' + p.front + '">STREET · FRONT ENTRANCE</text>');


    // the lobby the first floor stands on: a solid base with the glowing entrance door and the path to the street
    o.push('<g pointer-events="none">' +
      poly(quadTop(d0, d1, -0.45, 0, G), 'fill="' + LIT.glow + '" opacity=".22"') +
      poly(quadFront(0, 1, 0, G, 0), 'fill="' + p.wallA + '" stroke="' + p.edge + '" stroke-width=".8"') +
      poly(quadRight(1, 0, 1, G, 0), 'fill="' + p.wallB + '" stroke="' + p.edge + '" stroke-width=".8"') +
      poly(quadFront(0, 1, 0, G, 0), 'fill="url(#' + uid + 'wl)"') + poly(quadRight(1, 0, 1, G, 0), 'fill="url(#' + uid + 'wl)"') +
      poly(quadFront(d0, d1, 0, G, -5), 'fill="' + LIT.glow + '" filter="url(#' + uid + 'glow)" opacity=".8"') +
      poly(quadFront(d0, d1, 0, G, -5), 'fill="url(#' + uid + 'lit)" stroke="' + LIT.edge + '" stroke-width=".8"') + '</g>');

    var placed = [], h = 0;
    P_.forEach(function (part, i) { placed.push({ part: part, at: h, i: i }); h += heights[i]; });
    var lastFloor = placed.slice().reverse().filter(function (x) { return x.part.kind === 'floor'; })[0];
    var roofH = lastFloor.at + SLAB;

    // thin columns at the four corners (dashed through the breaks)
    [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(function (uv) {
      placed.forEach(function (x) {
        var a = P(uv[0], uv[1], x.at), b = P(uv[0], uv[1], Math.min(x.at + heights[x.i], roofH));
        o.push(ln(a, [a[0], b[1]], 'stroke="' + p.edge + '" stroke-opacity="' + (x.part.kind === 'gap' ? 0.35 : 0.5) + '" stroke-width="1.2"' + (x.part.kind === 'gap' ? ' stroke-dasharray="3 3"' : '')));
      });
    });

    var floorNo = 0;
    placed.forEach(function (x) {
      var part = x.part, at = x.at;
      if (part.kind === 'gap') {
        var mid = at + GAP_H / 2, a = P(0, 0, mid), b = P(1, 0, mid), x0 = a[0] - 12, x1 = b[0] + 12, y = a[1];
        var label = (part.from === part.to ? part.from + 'F' : part.from + 'F–' + part.to + 'F'), txt = label + ' · NOT HOTEL', pw = txt.length * 11.5 * 0.74 + 22;
        [-7, 7].forEach(function (dy) {
          var n = Math.max(6, Math.round((x1 - x0) / 14)), l = [];
          for (var k = 0; k <= n; k++) l.push([x0 + (x1 - x0) * k / n, y + dy + (k % 2 ? -2.5 : 2.5)]);
          o.push('<polyline points="' + pts(l) + '" fill="none" stroke="' + p.faint + '" stroke-width="1" stroke-opacity=".75"/>');
        });
        var cx = (x0 + x1) / 2;
        o.push('<rect x="' + (cx - pw / 2).toFixed(1) + '" y="' + (y - 10.25).toFixed(1) + '" width="' + pw.toFixed(1) + '" height="20.5" rx="10.25" fill="' + p.canvas + '" stroke="' + p.faint + '" stroke-opacity=".55" stroke-width=".8"/>' +
          '<text x="' + cx.toFixed(1) + '" y="' + (y + 4.1).toFixed(1) + '" text-anchor="middle" font-size="11.5" font-weight="700" letter-spacing="0.08em"><tspan fill="' + p.label + '">' + label + '</tspan><tspan fill="' + p.faint + '"> · NOT HOTEL</tspan></text>');
        return;
      }
      var t = at + SLAB;
      o.push('<g class="b3d-floor" style="--f:' + (floorNo++) + '">');
      o.push(poly(quadTop(0.01, 0.99, 0.05, 1, at - 10), 'fill="' + p.shade + '" opacity="' + (dark ? 0.55 : 0.28) + '" filter="url(#' + uid + 'shadow)" pointer-events="none"'));
      o.push(poly(quadFront(0, 1, 0, at, t), 'fill="' + p.wallA + '" stroke="' + p.edge + '" stroke-width=".8"'));
      o.push(poly(quadRight(1, 0, 1, at, t), 'fill="' + p.wallB + '" stroke="' + p.edge + '" stroke-width=".8"'));
      o.push('<g pointer-events="none">' + poly(quadFront(0, 1, 0, at, t), 'fill="url(#' + uid + 'wl)"') + poly(quadRight(1, 0, 1, at, t), 'fill="url(#' + uid + 'wl)"') + '</g>');
      o.push(poly(quadTop(0, 1, 0, 1, t), 'fill="' + p.roof + '" fill-opacity=".95" stroke="' + p.edge + '" stroke-width=".8"'));
      o.push('<g pointer-events="none">' + poly(quadTop(0, 1, 0, 1, t), 'fill="url(#' + uid + 'tl)"') + ln(P(0, 0, t), P(1, 0, t), 'stroke="#fff" stroke-opacity="' + (dark ? 0.4 : 0.8) + '" stroke-width="1.2"') + '</g>');
      // the corridor between the two rows
      o.push(poly(quadTop(0.01, 0.99, 0.46, 0.54, t), 'fill="' + p.faint + '" opacity=".18"'));
      o.push(ln(P(0.02, 0.5, t), P(0.98, 0.5, t), 'stroke="' + p.faint + '" stroke-opacity=".5" stroke-dasharray="2 3" stroke-width=".7"'));
      var fl = P(0, 0.2, t);
      o.push('<text x="' + (OX - 10) + '" y="' + (fl[1] + 5).toFixed(1) + '" text-anchor="end" font-size="14" font-weight="700" fill="' + p.label + '">' + part.floor + 'F</text>');
      if (full && opt.view === 'housekeeping') {
        // rooms of this floor to clean or about to be left: a number, or a check when the floor has no work
        var work = part.front.concat(part.back).filter(function (it) { var kk = kind(it.r); return kk === 'dirty' || (kk === 'occupied' && it.r.leaving) || !!(opt.requests && opt.requests[it.r.no]); }).length;
        var bx = OX - 10, by2 = fl[1] + 11;
        o.push('<g><title>' + (work ? work + ' room' + (work === 1 ? '' : 's') + ' to clean, to check out or with a request on this floor' : 'nothing to do on this floor') + '</title>' +
          '<rect x="' + (bx - 26).toFixed(1) + '" y="' + by2.toFixed(1) + '" width="26" height="13" rx="6.5" fill="' + (work ? '#e0a316' : 'none') + '" stroke="' + (work ? '#e0a316' : '#3fbf8f') + '" stroke-width="1" opacity="' + (work ? 1 : 0.8) + '"/>' +
          '<text x="' + (bx - 13).toFixed(1) + '" y="' + (by2 + 9.6).toFixed(1) + '" text-anchor="middle" font-size="9.5" font-weight="800" fill="' + (work ? '#2b1c00' : '#3fbf8f') + '">' + (work ? work : '&#10003;') + '</text></g>');
      }

      ['back', 'front'].forEach(function (side) {
        var v0 = ROWS[side][0], v1 = ROWS[side][1], list = side === 'front' ? part.front : part.back, color = side === 'front' ? p.front : p.back;
        var tag = P(1, (v0 + v1) / 2, t);
        // (no BACK / FRONT text beside the floors: the rows speak for themselves)
        // a floor-plan building: its tenant units, the stairs / elevator column and the plan's rooms the system doesn't have
        (part.extras || []).forEach(function (ex) { if (ex.side === side) o.push(extraTile(ex, part, t, v0, v1)); });
        list.forEach(function (it) {
          var r = it.r, k = kind(r), j = it.pos - 1, w = 0.96 / part.cols;
          var a = 0.02 + j * w, b = 0.02 + (j + (it.span || 1)) * w, u0 = a + gu, u1 = b - gu, top = t + ROOM_H;
          var face = quadTop(u0, u1, v0, v1, top);
          var leave = k === 'occupied' && !!r.leaving, L = leave ? LIT_RED : LIT;   // leaving today (late or not): the lit room is red; a LATE check-out also gets the blue strip below   // the guest leaves today: the lit room is red instead of yellow
          var fill = k === 'occupied' ? 'url(#' + uid + (leave ? 'litr' : 'lit') + ')' : k === 'vacant' ? p.empty : FILL[k];
          var col = k === 'occupied' ? L.bottom : k === 'vacant' ? p.empty : FILL[k];
          var stroke = k === 'occupied' ? L.edge : k === 'vacant' ? p.emptyEdge : p.tileStroke;
          var vip = !!r.vip;
          var title = 'Room ' + r.no + ' (' + (side === 'front' ? 'Front' : 'Back') + ') · ' + LABEL[k].toLowerCase() + (r.guest && k === 'occupied' ? ' · ' + r.guest : '') + (r.arriving ? (btbOf(r) ? ' · back-to-back (BTB)' : r.arrivingLate ? ' · late check-in today' : ' · arriving today') : '') + (r.leaving ? (r.late ? ' · late check-out today' : ' · leaving today') : '') + (r.beds ? ' · ' + (r.beds >= 2 ? '2 beds' : '1 bed') : '') + (opt.view === 'housekeeping' && opt.requests && opt.requests[r.no] ? ' · request: ' + (opt.requests[r.no].mur ? 'MUR' : '') + (opt.requests[r.no].mur && opt.requests[r.no].custom ? ' + ' : '') + (opt.requests[r.no].custom ? 'custom' : '') : '');
          var cx = face.reduce(function (s, q) { return s + q[0]; }, 0) / 4, cy = face.reduce(function (s, q) { return s + q[1]; }, 0) / 4;
          var hit = side === 'front'
            ? [P(a, 0, at), P(b, 0, at), P(b, 0, top), P(b, 0.5, top), P(a, 0.5, top), P(a, 0, top)]
            : [P(a, 0.5, top), P(b, 0.5, top), P(b, 1, top), P(b, 1, top + Air), P(a, 1, top + Air), P(a, 1, top)];
          var faded = opt.focus && !matchFocus(r, k, opt.focus, opt.requests);
          if (k === 'tenant') {
            o.push('<g class="b3d-room" data-no="' + esc(r.no) + '"' + (full ? ' role="button" tabindex="0"' : '') + (faded ? ' style="opacity:.17"' : '') + '><title>' + esc('Room ' + r.no + ' · Tenant (not bookable)') + '</title>' +
              (full ? poly(hit, 'fill="transparent"') : '') + tenantBlock(u0, u1, v0, v1, t) + '</g>');
            return;
          }
          o.push('<g class="b3d-room" data-no="' + esc(r.no) + '"' + (full ? ' role="button" tabindex="0"' : '') + (faded ? ' style="opacity:.17"' : '') + '><title>' + esc(title) + '</title>');
          o.push(ln(P(u0, v0, t), P(u1, v0, t), 'stroke="' + color + '" stroke-width="1.4" pointer-events="none"'));
          if (full) o.push(poly(hit, 'fill="transparent"'));
          if (k === 'occupied') o.push(poly(face, 'class="b3d-lit" style="--g:' + (it.pos % 7) + '" fill="' + L.glow + '" filter="url(#' + uid + 'glow)" opacity=".7" pointer-events="none"'));
          [quadRight(u1, v0, v1, t, top), quadFront(u0, u1, v0, t, top)].forEach(function (sd) {
            o.push('<g pointer-events="none">' + poly(sd, 'fill="' + col + '"') + poly(sd, 'fill="#000" opacity="' + (k === 'vacant' ? 0.25 : 0.32) + '"') + '</g>');
          });
          o.push(poly(face, 'class="b3d-face" fill="' + fill + '" stroke="' + stroke + '" stroke-opacity=".6" stroke-width=".7" stroke-linejoin="round"'));
          if (k === 'ooo') o.push(poly(face, 'fill="url(#' + uid + 'hatch)" pointer-events="none"'));
          // late check-out today: a blue strip along the right side of the (red) room
          if (k === 'occupied' && r.leaving && r.late && !btbOf(r)) {   // (a back-to-back room is plain red with the BTB badge: no strip)
            o.push(poly(quadTop(u1 - (u1 - u0) * 0.15, u1, v0, v1, top), 'fill="' + LATE_BLUE + '" stroke="' + LIT_RED.edge + '" stroke-opacity=".8" stroke-width=".6" stroke-linejoin="round" pointer-events="none"'));
          }
          if (full) {
            // (a floor-plan building with bed dots: the number starts right after the dots instead of being centered)
            var afterDots = lay && r.beds && opt.view !== 'housekeeping';
            // (a floor-plan building: on a red room - the guest leaves today - the number is white with a dark red edge, readable on the whole red)
            var redInk = lay && leave;
            // (two stacked dots: the number moves a little further right, so the bold outlined number of a red room keeps clear of the lower dot)
            var numX = NUM_X + (r.beds >= 2 ? NUM_X2 : 0);
            o.push('<text x="' + (afterDots ? numX - (u1 - u0) * len / 2 : -NUM_DX).toFixed(2) + '" y="' + (fs * 0.36 + NUM_DY).toFixed(2) + '" transform="matrix(1 0 ' + (-LEAN).toFixed(3) + ' ' + SQ + ' ' + cx.toFixed(1) + ' ' + cy.toFixed(1) + ')" text-anchor="' + (afterDots ? 'start' : 'middle') + '" font-size="' + fs.toFixed(2) + '" font-weight="' + (redInk ? 600 : 400) + '" letter-spacing="0.07em" style="font-variant-numeric:tabular-nums" pointer-events="none" fill="' + (redInk ? LEAVE_INK.fill : INK[k]) + '"' +
              (k === 'ooo' ? ' stroke="' + FILL.ooo + '" stroke-width="2.4" paint-order="stroke"' : redInk ? ' stroke="' + LEAVE_INK.edge + '" stroke-width="2.2" stroke-linejoin="round" paint-order="stroke"' : '') + '>' + esc(r.no) + '</text>');
          }
          // VIP room: a gold "V" in a royal serif font at the top-left corner of the tile (dark edge so it shows on every colour)
          if (full && vip) {
            var vx = -(u1 - u0) * len / 2 + 9;
            o.push('<text x="' + vx.toFixed(1) + '" y="' + (-fs * 0.5).toFixed(2) + '" transform="matrix(1 0 ' + (-LEAN).toFixed(3) + ' ' + SQ + ' ' + cx.toFixed(1) + ' ' + cy.toFixed(1) + ')" text-anchor="middle" font-size="' + (fs * 0.85).toFixed(1) + '" font-weight="700" font-family="Cinzel, Algerian, Georgia, serif" pointer-events="none" fill="' + VIP_GOLD + '" stroke="#2a1a00" stroke-width="1.7" stroke-linejoin="round" paint-order="stroke">V</text>');
          }
          // beds: one small dot = a room with one bed, two dots = two beds - at the left end of the tile, level with the room number
          if (full && r.beds && opt.view !== 'housekeeping') {   // (housekeeping does not need the bed count)
            var nb = r.beds >= 2 ? 2 : 1, half = (u1 - u0) * len / 2, bx = -half + (lay ? BED_X : 9), by = fs * 0.36 + NUM_DY - fs * 0.34;
            var dots = '';
            // two beds: the dots are stacked (like a colon), so they never run into the room number
            for (var q = 0; q < nb; q++) dots += '<ellipse cx="' + bx.toFixed(1) + '" cy="' + (by + (nb === 2 ? (q ? 3.4 : -3.4) : 0)).toFixed(1) + '" rx="2.2" ry="2.2" fill="' + (lay && leave ? LEAVE_INK.fill : INK[k]) + '" opacity="' + (lay && leave ? '.9' : '.75') + '"/>';
            o.push('<g pointer-events="none" transform="matrix(1 0 ' + (-LEAN).toFixed(3) + ' ' + SQ + ' ' + cx.toFixed(1) + ' ' + cy.toFixed(1) + ')">' + dots + '</g>');
          }
          // housekeeping: a pending request for this room (MUR = make up room, REQ = a typed request) - a small pill on the tile's left corner
          if (full && opt.view === 'housekeeping' && opt.requests && opt.requests[r.no]) {
            var rq = opt.requests[r.no], rtxt = (rq.mur ? 'MUR' : 'REQ') + (rq.mur && rq.custom ? '+' : ''), rw2 = rtxt.length > 3 ? 34 : 29;
            var rx = face[3][0] + 18, ry = face[3][1] + 5.2;
            o.push('<g pointer-events="none"><rect x="' + (rx - rw2 / 2).toFixed(1) + '" y="' + (ry - 7).toFixed(1) + '" width="' + rw2 + '" height="14" rx="7" fill="' + (rq.mur ? '#0d9488' : '#7c3aed') + '" stroke="#fff" stroke-opacity=".85" stroke-width=".8"/>' +
              '<text x="' + rx.toFixed(1) + '" y="' + (ry + 3.2).toFixed(1) + '" text-anchor="middle" font-size="8.6" font-weight="800" fill="#fff">' + rtxt + '</text></g>');
          }
          // a guest arrives today (green): a small light on the tile's right corner (a guest who leaves today makes the room red)
          if (r.arriving) {
            var rr = full ? 3.4 : 4.6, gx = face[2][0] - 8, gy = face[2][1] + 4.5;   // the tile's back-right corner
            if (full && btbOf(r)) {
              // back-to-back: a guest leaves and another arrives in this room today - the room is red and the corner carries a small BTB badge
              o.push('<g pointer-events="none"><rect x="' + (gx - 10.5).toFixed(1) + '" y="' + (gy - 5.2).toFixed(1) + '" width="21" height="10.4" rx="5.2" fill="' + BTB_BG + '" stroke="#bcd0ff" stroke-width=".8"/>' +
                '<text x="' + gx.toFixed(1) + '" y="' + (gy + 2.4).toFixed(1) + '" text-anchor="middle" font-size="6.6" font-weight="800" letter-spacing=".02em" fill="#fff">BTB</text></g>');
            } else if (full && opt.view === 'housekeeping' && k === 'dirty') {
              // housekeeping: the room is still dirty and a guest arrives today - it has to be ready first
              o.push('<g pointer-events="none"><circle cx="' + gx.toFixed(1) + '" cy="' + gy.toFixed(1) + '" r="5.4" fill="' + URGENT + '" stroke="#fff" stroke-width="1"/>' +
                '<text x="' + gx.toFixed(1) + '" y="' + (gy + 2.6).toFixed(1) + '" text-anchor="middle" font-size="8" font-weight="900" fill="#fff">!</text></g>');
            } else {
              o.push('<circle cx="' + gx.toFixed(1) + '" cy="' + gy.toFixed(1) + '" r="' + rr + '" fill="' + (r.arrivingLate ? LATE_IN : ARRIVE) + '" stroke="#fff" stroke-width="1" pointer-events="none"/>');
            }
          }
          o.push('</g>');
        });
      });
      o.push('</g>');
    });

    // the sign on the roof
    var rs = P(0.5, 1, roofH), name = String(opt.name || '').toUpperCase(), fit = Math.max(7, Math.min(13, (len - 18) / (name.length * 0.72))), sw = name.length * fit * 0.72 + 18, sh = fit + 10, sx = rs[0], sy = rs[1];
    o.push('<g pointer-events="none">' + ln([sx - sw / 3, sy], [sx - sw / 3, sy - 6], 'stroke="' + p.sign + '" stroke-opacity=".7" stroke-width="1.4"') + ln([sx + sw / 3, sy], [sx + sw / 3, sy - 6], 'stroke="' + p.sign + '" stroke-opacity=".7" stroke-width="1.4"') +
      '<rect x="' + (sx - sw / 2).toFixed(1) + '" y="' + (sy - 6 - sh).toFixed(1) + '" width="' + sw.toFixed(1) + '" height="' + sh + '" rx="3" fill="' + p.sign + '" opacity=".35" filter="url(#' + uid + 'sign)"/>' +
      '<rect x="' + (sx - sw / 2).toFixed(1) + '" y="' + (sy - 6 - sh).toFixed(1) + '" width="' + sw.toFixed(1) + '" height="' + sh + '" rx="3" fill="#0b0f17" fill-opacity=".88" stroke="' + p.sign + '" stroke-width="1.2"/>' +
      '<text x="' + sx.toFixed(1) + '" y="' + (sy - 6 - sh + fit + 3).toFixed(1) + '" text-anchor="middle" font-size="' + fit.toFixed(1) + '" font-weight="800" letter-spacing="0.14em" fill="' + p.sign + '">' + esc(name) + '</text></g>');
    o.push('</svg>');
    return o.join('');
  }

  // ------------------------------------------------------------------------------------------------------------------------------
  // VILLAS (Pool Villa): the picture of the three villas (public/img/properties/pool_villa_scene.webp, 1672 x 696) is the scene; the live part is laid over it:
  // a label floating above each villa (number + what is going on, outlined in the status color, with an arrow), an LED strip on the roof in the status
  // color, and the same dots / badges as the building's tiles (green / orange arriving dot, BTB, urgent mark, MUR / REQ). The picture has NO labels of its own
  // (they were painted out of the file), so nothing old shows when a label is dimmed or moves. `spots` = where each villa is in the picture (label centre, arrow tip, LED strip, hit area).
  var VILLA_COLORS = { vacant: '#2dd4bf', dirty: '#fbbf24', occupied: '#ffc65e', leave: '#ef4444', ooo: '#9ca3af' };
  var VILLA_IMG = { src: '/img/properties/pool_villa_scene.webp?v=2', w: 1672, h: 696 };
  var VILLA_SPOTS = {
    '13': { lx: 398, ly: 105, tip: 192, led: [322, 195, 545], hit: [205, 30, 395, 470] },
    '14': { lx: 847, ly: 83, tip: 172, led: [760, 173, 1010], hit: [625, 10, 450, 510] },
    '15': { lx: 1318, ly: 93, tip: 182, led: [1232, 183, 1470], hit: [1100, 20, 420, 540] }
  };
  function buildVillas(rooms, opt) {
    var lay = VILLAS[opt.code], full = opt.mode === 'full', uid = 'b3d' + (++uidN) + '-', W = VILLA_IMG.w, H = VILLA_IMG.h;
    var byNo = {}; (rooms || []).forEach(function (r) { byNo[String(r.no)] = r; });
    var list = lay.rooms.filter(function (n) { return byNo[n] && VILLA_SPOTS[n]; }).map(function (n) { return byNo[n]; });
    if (!list.length) return '';
    var o = [];
    o.push('<svg class="b3d ' + (full ? 'is-full' : 'is-card') + (opt.noClick ? ' b3d-noclick' : '') + (opt.animate ? ' b3d-in' : '') + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(opt.name || 'Villas') + '" style="' + (full ? '' : 'pointer-events:none') + '">');
    o.push('<defs>' +
      '<linearGradient id="' + uid + 'fx" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".07" stop-color="#fff"/><stop offset=".93" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
      '<linearGradient id="' + uid + 'fy" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".08" stop-color="#fff"/><stop offset=".9" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
      '<mask id="' + uid + 'mx" maskUnits="userSpaceOnUse" x="0" y="0" width="' + W + '" height="' + H + '"><rect width="' + W + '" height="' + H + '" fill="url(#' + uid + 'fx)"/></mask>' +
      '<mask id="' + uid + 'my" maskUnits="userSpaceOnUse" x="0" y="0" width="' + W + '" height="' + H + '"><rect width="' + W + '" height="' + H + '" fill="url(#' + uid + 'fy)"/></mask>' +
      '<linearGradient id="' + uid + 'lit" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + LIT.top + '"/><stop offset="1" stop-color="' + LIT.bottom + '"/></linearGradient>' +
      '<linearGradient id="' + uid + 'litr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + LIT_RED.top + '"/><stop offset="1" stop-color="' + LIT_RED.bottom + '"/></linearGradient>' +
      '<pattern id="' + uid + 'hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="#4a3025" stroke-width="3" stroke-opacity=".55"/></pattern>' +
      '<filter id="' + uid + 'soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="26"/></filter>' +
      '<filter id="' + uid + 'glow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="7"/></filter></defs>');
    // the picture, its edges fading into the card
    o.push('<g mask="url(#' + uid + 'mx)"><image href="' + VILLA_IMG.src + '" x="0" y="0" width="' + W + '" height="' + H + '" mask="url(#' + uid + 'my)" preserveAspectRatio="xMidYMid slice"/></g>');
    list.forEach(function (r, j) {
      var sp = VILLA_SPOTS[String(r.no)], k = kind(r), leave = k === 'occupied' && !!r.leaving, btb = btbOf(r);
      var scol = k === 'occupied' ? (leave ? VILLA_COLORS.leave : VILLA_COLORS.occupied) : VILLA_COLORS[k];
      var faded = opt.focus && !matchFocus(r, k, opt.focus, opt.requests);
      var word = k === 'occupied' ? (r.arriving && btb ? 'Back-to-back' : r.leaving ? (r.late ? 'Late check-out' : 'Leaving today') : 'Staying') : k === 'dirty' ? 'To be cleaned' : k === 'ooo' ? 'Out of order' : r.arriving ? (r.arrivingLate ? 'Late check-in today' : 'Arriving today') : 'Clean, empty';
      var title = 'Villa ' + r.no + ' · ' + LABEL[k].toLowerCase() + (r.guest && k === 'occupied' ? ' · ' + r.guest : '') + (r.arriving ? (btb ? ' · back-to-back (BTB)' : r.arrivingLate ? ' · late check-in today' : ' · arriving today') : '') + (r.leaving ? (r.late ? ' · late check-out today' : ' · leaving today') : '') +
        (opt.view === 'housekeeping' && opt.requests && opt.requests[r.no] ? ' · request: ' + (opt.requests[r.no].mur ? 'MUR' : '') + (opt.requests[r.no].mur && opt.requests[r.no].custom ? ' + ' : '') + (opt.requests[r.no].custom ? 'custom' : '') : '');
      // the label is filled with the color of the legend (the same as the tiles of the buildings): gold = staying, red = leaving, olive = to clean, hatched = out of order, dark = clean and empty
      var lfill = k === 'occupied' ? 'url(#' + uid + (leave ? 'litr' : 'lit') + ')' : k === 'dirty' ? FILL.dirty : k === 'ooo' ? FILL.ooo : '#2c2430';
      var ink = leave ? '#ffffff' : INK[k], hasGuest = k === 'occupied' && r.guest, lw = Math.max(224, word.length * 12 + 90), lh = 100, lx = sp.lx - lw / 2, ly = sp.ly - lh / 2, bottom = ly + lh;
      // another view focuses on other villas: this one is dimmed in the picture
      if (faded) o.push('<rect x="' + (sp.hit[0] + 30) + '" y="' + (sp.hit[1] + 30) + '" width="' + (sp.hit[2] - 60) + '" height="' + (sp.hit[3] - 60) + '" rx="40" fill="#0a1a33" opacity=".92" filter="url(#' + uid + 'soft)" pointer-events="none"/>');
      o.push('<g class="b3d-floor" style="--f:' + j + '"><g class="b3d-room" data-no="' + esc(r.no) + '"' + (full ? ' role="button" tabindex="0"' : '') + (faded ? ' style="opacity:.17"' : '') + '><title>' + esc(title) + '</title>');
      if (full) o.push('<rect x="' + sp.hit[0] + '" y="' + sp.hit[1] + '" width="' + sp.hit[2] + '" height="' + sp.hit[3] + '" rx="24" fill="transparent"/>');
      // the label over the one of the picture; its arrow covers the picture's arrow and points to the roof
      var cx = sp.lx;
      o.push('<g pointer-events="none">' +
        '<rect x="' + lx.toFixed(1) + '" y="' + ly.toFixed(1) + '" width="' + lw.toFixed(1) + '" height="' + lh + '" rx="22" fill="' + scol + '" opacity=".3" filter="url(#' + uid + 'glow)"/>' +
        '<rect x="' + lx.toFixed(1) + '" y="' + ly.toFixed(1) + '" width="' + lw.toFixed(1) + '" height="' + lh + '" rx="22" fill="' + lfill + '" stroke="' + (k === 'vacant' ? scol : '#fff') + '" stroke-opacity="' + (k === 'vacant' ? 1 : 0.55) + '" stroke-width="3"/>' +
        (k === 'ooo' ? '<rect x="' + lx.toFixed(1) + '" y="' + ly.toFixed(1) + '" width="' + lw.toFixed(1) + '" height="' + lh + '" rx="22" fill="url(#' + uid + 'hatch)"/>' : '') +
        (leave && r.late && !btb ? '<path d="M' + (lx + lw - 30) + ' ' + (ly + 1.5) + ' H' + (lx + lw - 22) + ' A20.5 20.5 0 0 1 ' + (lx + lw - 1.5) + ' ' + (ly + 22) + ' V' + (ly + lh - 22) + ' A20.5 20.5 0 0 1 ' + (lx + lw - 22) + ' ' + (ly + lh - 1.5) + ' H' + (lx + lw - 30) + ' Z" fill="' + LATE_BLUE + '"/>' : '') +
        '<line x1="' + cx + '" y1="' + bottom.toFixed(1) + '" x2="' + cx + '" y2="' + (sp.tip - 6) + '" stroke="' + scol + '" stroke-width="3"/>' +
        '<path d="M' + (cx - 11) + ' ' + (sp.tip - 12) + ' L' + cx + ' ' + sp.tip + ' L' + (cx + 11) + ' ' + (sp.tip - 12) + ' Z" fill="' + scol + '"/>' +
        '<text x="' + cx + '" y="' + (ly + (hasGuest ? 36 : 44)).toFixed(1) + '" text-anchor="middle" font-size="' + (full ? 38 : 46) + '" font-weight="700" fill="' + ink + '">' + esc(r.no) + '</text>' +
        '<g transform="translate(' + (cx - word.length * 4.6 - 14).toFixed(1) + ' ' + (ly + (hasGuest ? 62 : 74)).toFixed(1) + ')" fill="none" stroke="' + ink + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">' +
          (k === 'dirty' ? '<path d="M0 -10 L3 -3 L10 0 L3 3 L0 10 L-3 3 L-10 0 L-3 -3 Z" fill="' + ink + '" stroke="none"/>' : k === 'ooo' ? '<circle r="8"/><path d="M-6 6 L6 -6"/>' : k === 'occupied' ? (leave ? '<path d="M-8 0 H6 M2 -5 L6 0 L2 5"/>' : '<path d="M-9 7 V-5 M-9 2 H9 V7 M-5 -1 H2 V2"/>') : '<path d="M-8 0 L-2 6 L8 -6"/>') +
        '</g>' +
        '<text x="' + (cx + 12).toFixed(1) + '" y="' + (ly + (hasGuest ? 68 : 80)).toFixed(1) + '" text-anchor="middle" font-size="19" font-weight="600" fill="' + ink + '" opacity=".95">' + esc(word) + '</text>' +
        (hasGuest ? '<text x="' + cx + '" y="' + (ly + 90).toFixed(1) + '" text-anchor="middle" font-size="15" font-weight="600" fill="' + ink + '" opacity=".78">' + esc(String(r.guest).slice(0, 26)) + '</text>' : '') +
        '</g>');
      // arriving today: the green / orange dot (BTB badge for a late check-out followed by a late check-in); a dirty villa with an arrival is URGENT (housekeeping)
      if (r.arriving) {
        var gp = [lx + lw - 10, ly + 4];
        if (full && btb) {
          o.push('<g pointer-events="none"><rect x="' + (gp[0] - 38).toFixed(1) + '" y="' + (gp[1] - 13).toFixed(1) + '" width="46" height="26" rx="13" fill="' + BTB_BG + '" stroke="#bcd0ff" stroke-width="1.6"/><text x="' + (gp[0] - 15).toFixed(1) + '" y="' + (gp[1] + 6).toFixed(1) + '" text-anchor="middle" font-size="14" font-weight="800" fill="#fff">BTB</text></g>');
        } else if (full && opt.view === 'housekeeping' && k === 'dirty') {
          o.push('<g pointer-events="none"><circle cx="' + gp[0].toFixed(1) + '" cy="' + gp[1].toFixed(1) + '" r="15" fill="' + URGENT + '" stroke="#fff" stroke-width="2.4"/><text x="' + gp[0].toFixed(1) + '" y="' + (gp[1] + 7).toFixed(1) + '" text-anchor="middle" font-size="20" font-weight="900" fill="#fff">!</text></g>');
        } else {
          o.push('<circle cx="' + gp[0].toFixed(1) + '" cy="' + gp[1].toFixed(1) + '" r="' + (full ? 11 : 14) + '" fill="' + (r.arrivingLate ? LATE_IN : ARRIVE) + '" stroke="#fff" stroke-width="2.4" pointer-events="none"/>');
        }
      }
      // housekeeping: a pending request (MUR / custom) on the label's top-left corner
      if (full && opt.view === 'housekeeping' && opt.requests && opt.requests[r.no]) {
        var rq = opt.requests[r.no], rtxt = (rq.mur ? 'MUR' : 'REQ') + (rq.mur && rq.custom ? '+' : ''), rw2 = rtxt.length > 3 ? 66 : 56, rp = [lx + 10 + rw2 / 2, ly + 2];
        o.push('<g pointer-events="none"><rect x="' + (rp[0] - rw2 / 2).toFixed(1) + '" y="' + (rp[1] - 15).toFixed(1) + '" width="' + rw2 + '" height="30" rx="15" fill="' + (rq.mur ? '#0d9488' : '#7c3aed') + '" stroke="#fff" stroke-opacity=".85" stroke-width="1.8"/><text x="' + rp[0].toFixed(1) + '" y="' + (rp[1] + 7).toFixed(1) + '" text-anchor="middle" font-size="17" font-weight="800" fill="#fff">' + rtxt + '</text></g>');
      }
      o.push('</g></g>');
    });
    o.push('</svg>');
    return o.join('');
  }

  function render(el, rooms, opt) {
    if (!el) return;
    opt = opt || {};
    injectCss();
    if (!opt.dark && opt.dark !== false) opt.dark = document.documentElement.getAttribute('data-theme') !== 'white';
    el.innerHTML = VILLAS[opt.code] ? buildVillas(rooms || [], opt) : build(rooms || [], opt);
    if (opt.mode === 'full' && opt.onRoom && !el.__b3d) {
      el.__b3d = true;
      var pick = function (e) {
        var g = e.target.closest && e.target.closest('.b3d-room'); if (!g) return;
        var no = g.getAttribute('data-no'), cur = el.__rooms || [];
        for (var i = 0; i < cur.length; i++) if (String(cur[i].no) === no) { el.__onRoom(cur[i]); return; }
      };
      el.addEventListener('click', pick);
      el.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(e); } });
    }
    el.__rooms = rooms || []; el.__onRoom = opt.onRoom;
  }

  window.Building3D = { render: render, isVillas: function (code) { return !!VILLAS[code]; }, counts: counts, unplaced: unplaced, swatches: swatches, placeOf: placeOf, LABEL: LABEL, ARRIVE: ARRIVE, LEAVE: LEAVE, LATE: LATE_BLUE, LATE_IN: LATE_IN, URGENT: URGENT };
})();
