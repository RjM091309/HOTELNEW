/* 3D building of a property's rooms (floors pulled apart and seen from above, front row nearest the street, back row behind the corridor).
   Used by the Dashboard of a property that has BUILDING_VIEW = 1 (Clark Central): the property's card and its full dashboard.
   Ported from the "A · Floor plates" view of the hotel-layouts test bed (vanilla JS, no framework).

     Building3D.render(el, rooms, { name, mode: 'full' | 'card', onRoom(room) })
       rooms: [{ no, status ('1' clean, '2' occupied, '3' out of order, '4' dirty), guest, bookingId, arriving, leaving }]
     Building3D.counts(rooms) -> { occupied, vacant, dirty, ooo, arriving, leaving }
   'card' draws it small and not clickable (the card opens the full dashboard), without the room numbers. */
(function () {
  var DX = 64, DY = 62, SLAB = 12, POD = 28, ROOM_H = 3, AIR = 15, FONT = 9, NUM_DY = 6, NUM_DX = 3;   // NUM_DY: the room number sits low on the tile, not in the middle
  var ROOM_W = 48, GAP_H = 36, OX = 58, TOP = 46;
  var ROWS = { front: [0.05, 0.45], back: [0.55, 0.95] };
  var LIT = { top: '#fff4d6', bottom: '#ffc65e', glow: '#ffd27a', edge: '#fff0c4' };   // occupied: lit warm gold against the orange building
  var FILL = { dirty: '#ffb59a', ooo: '#b3aaa6' };
  var INK = { occupied: '#3a2300', vacant: '#fff1e6', dirty: '#3d1606', ooo: '#241b18' };   // vacant: white on the dark tile (the original; other colors were tried and dropped)
  var LABEL = { occupied: 'Occupied', vacant: 'Clean, empty', dirty: 'To be cleaned', ooo: 'Out of order' };
  var ARRIVE = '#34d399', LEAVE = '#60a5fa';
  var uidN = 0;

  function palette(dark) {
    return dark
      ? { wallA: '#e0600f', wallB: '#b24509', roof: '#f47f36', edge: '#ffd0a8', empty: '#2c2430', emptyEdge: '#d98a5a', tileStroke: '#ffe3cf', label: '#fff0e4', faint: '#ffc9a0', ground: '#2a2120', shade: '#050304', sign: '#ff9a52', front: '#ffc9a0', back: '#ffc9a0', canvas: '#1d1a24' }
      : { wallA: '#f58a45', wallB: '#dd6a2c', roof: '#ffb27a', edge: '#a2400a', empty: '#5a3f4a', emptyEdge: '#7a3a14', tileStroke: '#9a5a3a', label: '#4a2410', faint: '#8a5030', ground: '#f6e6da', shade: '#7a3a14', sign: '#e8590c', front: '#a2400a', back: '#a2400a', canvas: '#fff8f3' };
  }

  // Clark Central's numbering: 401-411 are the front rooms (401 at the right end seen from the street, 411 at the left end),
  // 412-422 the back rooms (412 at the left end, behind 411). The only place that knows how a number becomes a place.
  function placeOf(no) {
    var n = parseInt(no, 10);
    if (!isFinite(n) || n < 100) return null;
    var floor = Math.floor(n / 100), idx = n % 100;
    if (idx >= 1 && idx <= 11) return { floor: floor, side: 'front', pos: 12 - idx };
    if (idx >= 12 && idx <= 22) return { floor: floor, side: 'back', pos: idx - 11 };
    return null;
  }

  function kind(r) { var s = String(r.status); return s === '2' ? 'occupied' : s === '3' ? 'ooo' : s === '4' ? 'dirty' : 'vacant'; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function pts(l) { return l.map(function (q) { return q[0].toFixed(1) + ',' + q[1].toFixed(1); }).join(' '); }

  function counts(rooms) {
    var c = { occupied: 0, vacant: 0, dirty: 0, ooo: 0, arriving: 0, leaving: 0 };
    (rooms || []).forEach(function (r) { c[kind(r)]++; if (r.arriving) c.arriving++; if (r.leaving) c.leaving++; });
    return c;
  }

  // the building from the ground up: the floors that have rooms, with one break for each run of floors the hotel doesn't have
  function parts(rooms) {
    var by = {};
    rooms.forEach(function (r) { var pl = placeOf(r.no); if (!pl) return; (by[pl.floor] = by[pl.floor] || []).push({ r: r, side: pl.side, pos: pl.pos }); });
    var floors = Object.keys(by).map(Number); if (!floors.length) return [];
    var top = Math.max.apply(null, floors), out = [];
    for (var f = 1; f <= top; f++) {
      if (by[f]) out.push({ kind: 'floor', floor: f, front: by[f].filter(function (x) { return x.side === 'front'; }), back: by[f].filter(function (x) { return x.side === 'back'; }), cols: Math.max.apply(null, by[f].map(function (x) { return x.pos; })) });
      // floors the hotel doesn't have (e.g. 1F-3F of Clark) are simply not drawn: the building starts at its first floor
    }
    return out;
  }

  function injectCss() {
    if (document.getElementById('b3dCss')) return;
    var st = document.createElement('style'); st.id = 'b3dCss';
    st.textContent =
      '.b3d{display:block;width:100%;height:auto;overflow:visible}.b3d-room{outline:none}.b3d.is-full .b3d-room{cursor:pointer}' +
      '.b3d.is-full .b3d-room:hover .b3d-face,.b3d.is-full .b3d-room:focus-visible .b3d-face{stroke-width:2.2;stroke-opacity:1}' +
      '.b3d-in .b3d-floor{animation:b3dRise .8s cubic-bezier(.16,.84,.3,1) both;animation-delay:calc(var(--f,0)*120ms + 150ms)}' +
      '@keyframes b3dRise{from{opacity:0;transform:translateY(34px)}to{opacity:1;transform:none}}' +
      '.b3d-lit{animation:b3dGlow 3.6s ease-in-out infinite;animation-delay:calc(var(--g,0)*160ms)}@keyframes b3dGlow{0%,100%{opacity:.55}50%{opacity:.9}}' +
      '@media (prefers-reduced-motion:reduce){.b3d-in .b3d-floor,.b3d-lit{animation:none}}';
    document.head.appendChild(st);
  }

  function build(rooms, opt) {
    var full = opt.mode === 'full', dark = opt.dark !== false, p = palette(dark), uid = 'b3d' + (++uidN) + '-';
    var P_ = parts(rooms); if (!P_.length) return '';
    var widest = Math.max.apply(null, [10].concat(P_.map(function (x) { return x.kind === 'floor' ? x.cols : 0; })));
    var len = (widest * ROOM_W) / 0.96;
    var pitch = SLAB + ROOM_H + DY + AIR;
    var heights = P_.map(function (x) { return x.kind === 'gap' ? GAP_H : pitch; });
    var totalH = heights.reduce(function (s, h) { return s + h; }, 0);
    var W = OX + len + DX + 70, H = TOP + totalH + DY * 0.62 + 16 + POD, baseY = TOP + totalH, G = -POD;
    var SQ = 0.88, LEAN = (DX / DY) * SQ * 0.3;
    function P(u, v, h) { return [OX + u * len + v * DX, baseY - h - v * DY]; }
    function quadTop(u0, u1, v0, v1, h) { return [P(u0, v0, h), P(u1, v0, h), P(u1, v1, h), P(u0, v1, h)]; }
    function quadFront(u0, u1, v, h0, h1) { return [P(u0, v, h0), P(u1, v, h0), P(u1, v, h1), P(u0, v, h1)]; }
    function quadRight(u, v0, v1, h0, h1) { return [P(u, v0, h0), P(u, v1, h0), P(u, v1, h1), P(u, v0, h1)]; }
    function ln(a, b, attrs) { return '<line x1="' + a[0].toFixed(1) + '" y1="' + a[1].toFixed(1) + '" x2="' + b[0].toFixed(1) + '" y2="' + b[1].toFixed(1) + '" ' + attrs + '/>'; }
    function poly(l, attrs) { return '<polygon points="' + pts(l) + '" ' + attrs + '/>'; }
    var o = [];

    o.push('<svg class="b3d ' + (full ? 'is-full' : 'is-card') + (opt.animate ? ' b3d-in' : '') + '" viewBox="0 0 ' + W.toFixed(0) + ' ' + H.toFixed(0) + '" role="img" aria-label="' + esc(opt.name || 'Hotel') + ' building" style="' + (full ? '' : 'pointer-events:none') + '">');
    o.push('<defs>' +
      '<linearGradient id="' + uid + 'lit" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + LIT.top + '"/><stop offset="1" stop-color="' + LIT.bottom + '"/></linearGradient>' +
      '<linearGradient id="' + uid + 'wl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset="1" stop-color="#000" stop-opacity=".16"/></linearGradient>' +
      '<linearGradient id="' + uid + 'tl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".14"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
      '<filter id="' + uid + 'glow" x="-70%" y="-70%" width="240%" height="240%"><feGaussianBlur stdDeviation="2.4"/></filter>' +
      '<filter id="' + uid + 'shadow" x="-10%" y="-60%" width="120%" height="220%"><feGaussianBlur stdDeviation="5"/></filter>' +
      '<filter id="' + uid + 'sign" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="3"/></filter>' +
      '<pattern id="' + uid + 'hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="4" stroke="#4a3025" stroke-width="1.6" stroke-opacity=".55"/></pattern></defs>');

    // the ground, with the street in front of the building
    o.push(poly(quadTop(-0.06, 1.06, -0.62, 1.12, G), 'fill="' + p.ground + '" opacity=".85"'));
    o.push(poly(quadTop(-0.06, 1.06, -0.62, -0.28, G), 'fill="' + p.faint + '" opacity=".18"'));
    var st0 = P(-0.06, -0.45, G), st1 = P(1.06, -0.45, G), stm = P(0.5, -0.45, G);
    o.push(ln(st0, st1, 'stroke="' + p.label + '" stroke-opacity=".35" stroke-dasharray="8 6"'));
    o.push('<text x="' + stm[0].toFixed(1) + '" y="' + (stm[1] - 5).toFixed(1) + '" text-anchor="middle" font-size="12" font-weight="700" letter-spacing="0.2em" fill="' + p.front + '">STREET · FRONT ENTRANCE</text>');


    // the lobby the first floor stands on: a solid base with the glowing entrance door and the path to the street
    o.push('<g pointer-events="none">' +
      poly(quadTop(0.455, 0.545, -0.45, 0, G), 'fill="' + LIT.glow + '" opacity=".22"') +
      poly(quadFront(0, 1, 0, G, 0), 'fill="' + p.wallA + '" stroke="' + p.edge + '" stroke-width=".8"') +
      poly(quadRight(1, 0, 1, G, 0), 'fill="' + p.wallB + '" stroke="' + p.edge + '" stroke-width=".8"') +
      poly(quadFront(0, 1, 0, G, 0), 'fill="url(#' + uid + 'wl)"') + poly(quadRight(1, 0, 1, G, 0), 'fill="url(#' + uid + 'wl)"') +
      poly(quadFront(0.455, 0.545, 0, G, -5), 'fill="' + LIT.glow + '" filter="url(#' + uid + 'glow)" opacity=".8"') +
      poly(quadFront(0.455, 0.545, 0, G, -5), 'fill="url(#' + uid + 'lit)" stroke="' + LIT.edge + '" stroke-width=".8"') + '</g>');

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

      ['back', 'front'].forEach(function (side) {
        var v0 = ROWS[side][0], v1 = ROWS[side][1], list = side === 'front' ? part.front : part.back, color = side === 'front' ? p.front : p.back;
        var tag = P(1, (v0 + v1) / 2, t);
        // (no BACK / FRONT text beside the floors: the rows speak for themselves)
        list.forEach(function (it) {
          var r = it.r, k = kind(r), j = it.pos - 1, w = 0.96 / part.cols;
          var a = 0.02 + j * w, b = 0.02 + (j + 1) * w, u0 = a + 0.008, u1 = b - 0.008, top = t + ROOM_H;
          var face = quadTop(u0, u1, v0, v1, top);
          var fill = k === 'occupied' ? 'url(#' + uid + 'lit)' : k === 'vacant' ? p.empty : FILL[k];
          var col = k === 'occupied' ? LIT.bottom : k === 'vacant' ? p.empty : FILL[k];
          var stroke = k === 'occupied' ? LIT.edge : k === 'vacant' ? p.emptyEdge : p.tileStroke;
          var title = 'Room ' + r.no + ' (' + (side === 'front' ? 'Front' : 'Back') + ') · ' + LABEL[k].toLowerCase() + (r.guest && k === 'occupied' ? ' · ' + r.guest : '') + (r.arriving ? ' · arriving today' : '') + (r.leaving ? ' · leaving today' : '');
          var cx = face.reduce(function (s, q) { return s + q[0]; }, 0) / 4, cy = face.reduce(function (s, q) { return s + q[1]; }, 0) / 4;
          var hit = side === 'front'
            ? [P(a, 0, at), P(b, 0, at), P(b, 0, top), P(b, 0.5, top), P(a, 0.5, top), P(a, 0, top)]
            : [P(a, 0.5, top), P(b, 0.5, top), P(b, 1, top), P(b, 1, top + AIR), P(a, 1, top + AIR), P(a, 1, top)];
          o.push('<g class="b3d-room" data-no="' + esc(r.no) + '"' + (full ? ' role="button" tabindex="0"' : '') + '><title>' + esc(title) + '</title>');
          o.push(ln(P(u0, v0, t), P(u1, v0, t), 'stroke="' + color + '" stroke-width="1.4" pointer-events="none"'));
          if (full) o.push(poly(hit, 'fill="transparent"'));
          if (k === 'occupied') o.push(poly(face, 'class="b3d-lit" style="--g:' + (it.pos % 7) + '" fill="' + LIT.glow + '" filter="url(#' + uid + 'glow)" opacity=".7" pointer-events="none"'));
          [quadRight(u1, v0, v1, t, top), quadFront(u0, u1, v0, t, top)].forEach(function (sd) {
            o.push('<g pointer-events="none">' + poly(sd, 'fill="' + col + '"') + poly(sd, 'fill="#000" opacity="' + (k === 'vacant' ? 0.25 : 0.32) + '"') + '</g>');
          });
          o.push(poly(face, 'class="b3d-face" fill="' + fill + '" stroke="' + stroke + '" stroke-opacity=".6" stroke-width=".7" stroke-linejoin="round"'));
          if (k === 'ooo') o.push(poly(face, 'fill="url(#' + uid + 'hatch)" pointer-events="none"'));
          if (full) {
            o.push('<text x="' + (-NUM_DX).toFixed(2) + '" y="' + (FONT * 0.36 + NUM_DY).toFixed(2) + '" transform="matrix(1 0 ' + (-LEAN).toFixed(3) + ' ' + SQ + ' ' + cx.toFixed(1) + ' ' + cy.toFixed(1) + ')" text-anchor="middle" font-size="' + FONT + '" font-weight="400" letter-spacing="0.07em" style="font-variant-numeric:tabular-nums" pointer-events="none" fill="' + INK[k] + '"' +
              (k === 'ooo' ? ' stroke="' + FILL.ooo + '" stroke-width="2.4" paint-order="stroke"' : '') + '>' + esc(r.no) + '</text>');
          }
          // a guest arrives (green) or leaves (blue) today: a small light on the tile's right corner
          if (r.arriving || r.leaving) {
            var rr = full ? 3.4 : 4.6, gx = face[2][0] - 8, gy = face[2][1] + 4.5;   // the tile's back-right corner
            if (r.arriving) o.push('<circle cx="' + gx.toFixed(1) + '" cy="' + gy.toFixed(1) + '" r="' + rr + '" fill="' + ARRIVE + '" stroke="#fff" stroke-width="1" pointer-events="none"/>');
            if (r.leaving) o.push('<circle cx="' + (gx - (r.arriving ? rr * 2 + 2 : 0)).toFixed(1) + '" cy="' + gy.toFixed(1) + '" r="' + rr + '" fill="' + LEAVE + '" stroke="#fff" stroke-width="1" pointer-events="none"/>');
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

  function render(el, rooms, opt) {
    if (!el) return;
    opt = opt || {};
    injectCss();
    if (!opt.dark && opt.dark !== false) opt.dark = document.documentElement.getAttribute('data-theme') !== 'white';
    el.innerHTML = build(rooms || [], opt);
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

  window.Building3D = { render: render, counts: counts, placeOf: placeOf, LABEL: LABEL, ARRIVE: ARRIVE, LEAVE: LEAVE };
})();
