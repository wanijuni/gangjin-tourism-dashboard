(() => {
  'use strict';
  const fmt = d3.format(',');
  const compact = new Intl.NumberFormat('ko', { notation: 'compact', maximumFractionDigits: 1 });
  const C0 = 'var(--c0)', C1 = 'var(--c1)', C2 = 'var(--c2)', CM = 'var(--cm)';
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  let D = null;
  const state = { tab: 'overview', month: null, unit: 'month', a: null, b: null, ca: null, cb: null, fest: null, bAuto: null, align: true, metric: 'outsider' };

  // ---------- helpers ----------
  const mLabel = (m) => `${m.slice(0, 4)}년 ${+m.slice(4)}월`;
  const prevM = (m) => { const y = +m.slice(0, 4), mo = +m.slice(4); return mo === 1 ? `${y - 1}12` : `${y}${String(mo - 1).padStart(2, '0')}`; };
  const yoyM = (m) => `${+m.slice(0, 4) - 1}${m.slice(4)}`;
  const dayLabel = (d) => `${+d.slice(4, 6)}/${+d.slice(6, 8)}`;
  const dayFull = (d) => {
    const dt = new Date(Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8)));
    return `${d.slice(0, 4)}년 ${+d.slice(4, 6)}월 ${+d.slice(6, 8)}일 (${'일월화수목금토'[dt.getUTCDay()]})`;
  };
  const of = (key, m) => (D[key] || []).filter((r) => r.month === m);

  const tipEl = $('#tip');
  const tip = {
    show(ev, title, lines) {
      tipEl.replaceChildren(el('div', 'tip-h', title));
      for (const [c, name, val] of lines) {
        const row = el('div');
        if (c) { const s = el('i', 'sw'); s.style.background = c; row.append(s); }
        row.append(document.createTextNode(name), el('b', null, val));
        tipEl.append(row);
      }
      tipEl.hidden = false;
      let x = ev.clientX + 14, y = ev.clientY + 14;
      if (x + tipEl.offsetWidth > window.innerWidth - 8) x = ev.clientX - tipEl.offsetWidth - 14;
      if (y + tipEl.offsetHeight > window.innerHeight - 8) y = ev.clientY - tipEl.offsetHeight - 14;
      tipEl.style.left = Math.max(4, x) + 'px'; tipEl.style.top = Math.max(4, y) + 'px';
    },
    hide() { tipEl.hidden = true; },
  };

  function textW(svg, strs, cls) {
    const t = svg.append('text').attr('class', cls || null);
    let w = 0; for (const s of strs) { t.text(s); w = Math.max(w, t.node().getComputedTextLength()); }
    t.remove(); return w;
  }
  function noData(box, msg) { box.replaceChildren(el('div', 'nodata', msg || '이 달의 자료가 없습니다')); }

  // ---------- 휴일 ----------
  const HOL = window.HOLIDAYS || {};
  const DAY_TYPES = [
    ['토', '토요일', 'var(--day-sat)'], ['일', '일요일', 'var(--day-sun)'], ['명절', '명절', 'var(--day-hol)'],
    ['국경일', '국경일', 'var(--day-nat)'], ['공휴일', '공휴일', 'var(--day-pub)'], ['대체', '대체공휴일', 'var(--day-sub)'],
  ];
  const DAY_COLOR = Object.fromEntries(DAY_TYPES.map(([k, , c]) => [k, c]));
  function dayInfo(key) {
    const dow = new Date(Date.UTC(+key.slice(0, 4), +key.slice(4, 6) - 1, +key.slice(6, 8))).getUTCDay();
    const h = HOL[key];
    if (h) return { type: h[0], name: h[1], sat: dow === 6 };
    if (dow === 6) return { type: '토', name: null, sat: true };
    if (dow === 0) return { type: '일', name: null, sat: false };
    return null;
  }
  function dayLegend(box, keys) {
    const present = new Set(keys.map(dayInfo).filter(Boolean).map((i) => i.type));
    const lg = el('div', 'daylegend');
    lg.append(el('span', 'dl-h', '휴일'));
    for (const [k, name, c] of DAY_TYPES) {
      if (!present.has(k)) continue;
      const it = el('span'); const sw = el('i', 'dl-sw'); sw.style.background = c; it.append(sw, document.createTextNode(name)); lg.append(it);
    }
    box.append(lg);
  }

  // ---------- charts ----------
  function dailyBars(box, days, series, unit) {
    box.replaceChildren();
    if (!days.length) return noData(box);
    dayLegend(box, days.map((d) => d.key));
    const W = Math.max(300, box.clientWidth), H = 240;
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
    const totals = days.map((d) => d3.sum(d.vals));
    const y0 = d3.scaleLinear([0, d3.max(totals) || 1], [0, 1]).nice();
    const ticks = y0.ticks(4);
    const m = { t: 40, r: 6, b: 30, l: textW(svg, ticks.map((v) => compact.format(v))) + 10 };
    const x = d3.scaleBand(days.map((d) => d.key), [m.l, W - m.r]).paddingInner(0.25).paddingOuter(0.1);
    const y = d3.scaleLinear(y0.domain(), [H - m.b, m.t]);
    const info = new Map(days.map((d) => [d.key, dayInfo(d.key)]));
    // 쉬는 날 배경과 축 아래 색 띠
    const rest = days.filter((d) => info.get(d.key));
    svg.append('g').selectAll('rect').data(rest).join('rect')
      .attr('x', (d) => x(d.key) - (x.step() - x.bandwidth()) / 2).attr('width', x.step())
      .attr('y', m.t - 4).attr('height', H - m.b - m.t + 4).style('fill', 'var(--rest-bg)');
    svg.append('g').selectAll('rect').data(rest).join('rect')
      .attr('x', (d) => x(d.key)).attr('width', x.bandwidth()).attr('y', H - m.b + 3).attr('height', 5).attr('rx', 1.5)
      .style('fill', (d) => DAY_COLOR[info.get(d.key).type]);
    svg.append('g').selectAll('line').data(ticks).join('line')
      .attr('x1', m.l).attr('x2', W - m.r).attr('y1', y).attr('y2', y)
      .style('stroke', (v) => (v === 0 ? 'var(--axis)' : 'var(--grid)'));
    svg.append('g').selectAll('text').data(ticks).join('text')
      .attr('x', m.l - 8).attr('y', y).attr('dy', '0.32em').attr('text-anchor', 'end').text((v) => compact.format(v));
    const step = Math.max(1, Math.ceil(days.length / Math.max(1, Math.floor((W - m.l) / 46))));
    svg.append('g').selectAll('text').data(days.filter((d, i) => i % step === 0)).join('text')
      .attr('x', (d) => x(d.key) + x.bandwidth() / 2).attr('y', H - 4).attr('text-anchor', 'middle').text((d) => d.label)
      .style('fill', (d) => { const i = info.get(d.key); return !i ? null : i.type === '토' ? 'var(--day-sat)' : 'var(--day-sun)'; });
    const rx = Math.min(3, x.bandwidth() / 2);
    const g = svg.append('g');
    days.forEach((d) => {
      let acc = 0;
      d.vals.forEach((v, si) => {
        g.append('rect').attr('class', 'bar').attr('data-k', d.key)
          .attr('x', x(d.key)).attr('width', x.bandwidth())
          .attr('y', y(acc + v)).attr('height', Math.max(0, y(acc) - y(acc + v)))
          .attr('rx', si === d.vals.length - 1 ? rx : 0).style('fill', series[si].color);
        acc += v;
      });
    });
    const pi = d3.maxIndex(totals);
    if (pi >= 0) {
      const pd = days[pi], px = x(pd.key) + x.bandwidth() / 2;
      const lab = `최대 ${pd.label} · ${fmt(totals[pi])}${unit}`;
      // 최대치: 막대 테두리 강조 + 진한 말풍선
      const top = y(totals[pi]);
      svg.append('rect').attr('x', x(pd.key) - 2).attr('width', x.bandwidth() + 4).attr('y', top - 2)
        .attr('height', y(0) - top + 2).attr('rx', rx + 1).style('fill', 'none')
        .style('stroke', 'var(--peak-bg)').attr('stroke-width', 2).attr('pointer-events', 'none');
      const g2 = svg.append('g').attr('class', 'peak').attr('pointer-events', 'none');
      const t = g2.append('text').attr('class', 'peak-t').attr('text-anchor', 'middle').attr('dy', '0.35em').text(lab);
      const tw = t.node().getComputedTextLength(), bw = tw + 18, bh = 22;
      const cx = Math.min(Math.max(px, m.l + bw / 2), W - m.r - bw / 2), cy = top - 8 - bh / 2;
      g2.insert('rect', 'text').attr('x', cx - bw / 2).attr('y', cy - bh / 2).attr('width', bw).attr('height', bh).attr('rx', bh / 2)
        .style('fill', 'var(--peak-bg)');
      g2.insert('path', 'text').attr('d', `M${px - 5},${cy + bh / 2 - 0.5} L${px + 5},${cy + bh / 2 - 0.5} L${px},${cy + bh / 2 + 5} Z`)
        .style('fill', 'var(--peak-bg)');
      t.attr('x', cx).attr('y', cy);
    }
    svg.append('g').selectAll('rect').data(days).join('rect')
      .attr('x', (d) => x(d.key) - (x.step() - x.bandwidth()) / 2).attr('width', x.step())
      .attr('y', m.t).attr('height', H - m.t - m.b).style('fill', 'transparent')
      .on('mousemove', (ev, d) => {
        g.selectAll('rect.bar').attr('opacity', function () { return this.dataset.k === d.key ? 1 : 0.45; });
        const lines = series.length > 1
          ? [...series.map((s, i) => [s.color, s.name, fmt(d.vals[i]) + unit]).reverse(), [null, '합계', fmt(d3.sum(d.vals)) + unit]]
          : [[null, series[0].name, fmt(d.vals[0]) + unit]];
        const i = info.get(d.key);
        tip.show(ev, d.full + (i && i.name ? ` · ${i.name}` : ''), lines);
      })
      .on('mouseleave', () => { g.selectAll('rect.bar').attr('opacity', 1); tip.hide(); });
  }

  function hbars(box, rows, o) {
    box.replaceChildren();
    if (!rows.length) return noData(box);
    const W = Math.max(260, box.clientWidth), rowH = 26, H = rows.length * rowH + 4;
    box.style.minHeight = H + 'px';
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
    const left = textW(svg, rows.map((r) => r.label), 'lab') + 10;
    const right = textW(svg, rows.map((r) => o.fmt(r.value))) + 10;
    const x = d3.scaleLinear([0, d3.max(rows, (r) => r.value) || 1], [0, Math.max(10, W - left - right)]);
    const gs = svg.selectAll('g.r').data(rows).join('g').attr('class', 'r').attr('transform', (d, i) => `translate(0,${i * rowH})`);
    gs.append('text').attr('class', 'lab').attr('x', left - 10).attr('y', rowH / 2).attr('dy', '0.32em').attr('text-anchor', 'end').text((d) => d.label);
    gs.append('rect').attr('class', 'bar').attr('x', left).attr('y', 5).attr('height', rowH - 10).attr('rx', 4)
      .attr('width', (d) => Math.max(d.value > 0 ? 2 : 0, x(d.value))).style('fill', (d, i) => (o.color ? o.color(d, i) : C0));
    gs.append('text').attr('x', (d) => left + x(d.value) + 6).attr('y', rowH / 2).attr('dy', '0.32em').text((d) => o.fmt(d.value));
    gs.append('rect').attr('width', W).attr('height', rowH).style('fill', 'transparent')
      .on('mousemove', (ev, d) => { gs.selectAll('rect.bar').attr('opacity', (e) => (e === d ? 1 : 0.5)); tip.show(ev, d.label, [[null, o.name, o.fmt(d.value)]]); })
      .on('mouseleave', () => { gs.selectAll('rect.bar').attr('opacity', 1); tip.hide(); });
  }

  function hbars2(box, rows, o) {
    box.replaceChildren();
    if (!rows.length) return noData(box, '두 달 모두 자료가 없습니다');
    const W = Math.max(260, box.clientWidth), rowH = 36, H = rows.length * rowH + 4;
    box.style.minHeight = H + 'px';
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
    const left = textW(svg, rows.map((r) => r.label), 'lab') + 10;
    const right = textW(svg, rows.flatMap((r) => [r.a, r.b]).filter((v) => v != null).map(o.fmt).concat(['없음'])) + 10;
    const x = d3.scaleLinear([0, d3.max(rows, (r) => Math.max(r.a || 0, r.b || 0)) || 1], [0, Math.max(10, W - left - right)]);
    const gs = svg.selectAll('g.r').data(rows).join('g').attr('class', 'r').attr('transform', (d, i) => `translate(0,${i * rowH})`);
    gs.append('text').attr('class', 'lab').attr('x', left - 10).attr('y', rowH / 2).attr('dy', '0.32em').attr('text-anchor', 'end').text((d) => d.label);
    [['a', C0, 5], ['b', CM, 19]].forEach(([k, c, yy]) => {
      gs.append('rect').attr('x', left).attr('y', yy).attr('height', 12).attr('rx', 4)
        .attr('width', (d) => (d[k] ? Math.max(2, x(d[k])) : 0)).style('fill', c);
      gs.append('text').attr('x', (d) => left + x(d[k] || 0) + 6).attr('y', yy + 6).attr('dy', '0.32em')
        .text((d) => (d[k] == null ? '없음' : o.fmt(d[k])));
    });
    gs.append('rect').attr('width', W).attr('height', rowH).style('fill', 'transparent')
      .on('mousemove', (ev, d) => tip.show(ev, d.label, [[C0, o.la, d.a == null ? '없음' : o.fmt(d.a)], [CM, o.lb, d.b == null ? '없음' : o.fmt(d.b)]]))
      .on('mouseleave', () => tip.hide());
  }

  // 읍면 지도 (색 = 방문자 수, sqrt 눈금으로 작은 면도 구분되게)
  let GEO = null;
  function choropleth(box, rows, o) {
    box.replaceChildren();
    if (!GEO) return noData(box, '지도 파일을 불러오지 못했습니다');
    if (!rows.length) return noData(box);
    const val = new Map(rows.map((r) => [r.label, r]));
    const W = Math.max(280, box.clientWidth), H = Math.round(Math.min(560, Math.max(320, W * 0.95)));
    box.style.minHeight = H + 40 + 'px';
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
    const proj = d3.geoMercator().fitExtent([[10, 10], [W - 10, H - 10]], GEO);
    const path = d3.geoPath(proj);
    // 노랑 → 초록 → 청록 → 파랑 → 남색 (적음 → 많음): 단계가 뚜렷하게 보이는 색
    const RAMP = ['#fff4b8', '#c7e9a0', '#6fcf9f', '#25a5b8', '#1f6fb5', '#173f8a'];
    const ramp = d3.interpolateRgbBasis(RAMP);
    const max = o.max || d3.max(rows, (r) => r.value) || 1;
    const t = (v) => Math.sqrt(v / max);
    const color = (v) => ramp(t(v));
    // 군 외곽선(그림자) → 읍면 면 → 읍면 경계선
    svg.append('g').selectAll('path').data(GEO.features).join('path').attr('d', path)
      .style('fill', 'none').style('stroke', 'var(--map-edge)').attr('stroke-width', 5).attr('stroke-linejoin', 'round');
    const g = svg.append('g');
    const shapes = g.selectAll('path').data(GEO.features).join('path').attr('d', path)
      .style('fill', (f) => (val.has(f.properties.name) ? color(val.get(f.properties.name).value) : 'var(--grid)'))
      .style('stroke', '#ffffff').attr('stroke-width', 1.6).attr('stroke-linejoin', 'round')
      .on('mousemove', function (ev, f) {
        shapes.attr('opacity', (x) => (x === f ? 1 : 0.6)); d3.select(this).raise().style('stroke', '#111').attr('stroke-width', 2.5);
        const r = val.get(f.properties.name);
        tip.show(ev, f.properties.name, r ? o.lines(r) : [[null, '자료', '없음']]);
      })
      .on('mouseleave', function () { shapes.attr('opacity', 1).style('stroke', '#ffffff').attr('stroke-width', 1.6); tip.hide(); });
    // 라벨: 각 읍면에서 가장 큰 조각의 중심
    const anchor = (f) => {
      const polys = f.geometry.coordinates.map((c) => ({ type: 'Polygon', coordinates: c }));
      const big = polys.reduce((a, b) => (path.area(b) > path.area(a) ? b : a));
      return path.centroid(big);
    };
    const lab = svg.append('g').attr('pointer-events', 'none');
    GEO.features.forEach((f) => {
      const r = val.get(f.properties.name); if (!r) return;
      const [cx, cy] = anchor(f), dark = t(r.value) > 0.62;
      const tx = lab.append('text').attr('class', 'map-lab' + (dark ? ' on-dark' : '')).attr('x', cx).attr('y', cy).attr('text-anchor', 'middle');
      const narrow = W < 520;
      tx.append('tspan').attr('x', cx).attr('dy', narrow ? '0.35em' : '-0.2em').attr('class', 'n').text(f.properties.name);
      if (!narrow) tx.append('tspan').attr('x', cx).attr('dy', '1.25em').attr('class', 'v').text(o.short(r));
      const sub = o.sub && o.sub(r);
      if (sub && !narrow) tx.append('tspan').attr('x', cx).attr('dy', '1.2em').attr('class', 'd ' + sub[1]).text(sub[0]);
    });
    // 범례
    const lg = el('div', 'map-legend');
    const bar = el('span', 'map-ramp'); bar.style.background = `linear-gradient(90deg, ${RAMP.join(', ')})`;
    lg.append(el('span', null, '적음'), bar, el('span', null, '많음'), el('span', 'map-max', `최대 ${o.short({ value: max })}`));
    box.append(lg);
  }

  function heat(box, rows, typeOrder) {
    box.replaceChildren();
    if (!rows.length) return noData(box);
    const areas = d3.groups(rows, (r) => r.area)
      .map(([a, rs]) => ({ a, n: rs[0].area_n, cells: new Map(rs.map((r) => [r.type, r])) }))
      .sort((p, q) => q.n - p.n);
    const W = Math.max(300, box.clientWidth), rowH = 26;
    const svg = d3.select(box).append('svg').attr('width', '100%');
    const left = textW(svg, areas.map((d) => `${d.a} (${fmt(d.n)})`), 'lab') + 10;
    const colW = (W - left) / typeOrder.length;
    const typeW = textW(svg, typeOrder);
    const rotate = colW < typeW + 6;
    const top = rotate ? typeW * 0.9 + 12 : 22;
    const H = top + areas.length * rowH;
    svg.attr('viewBox', `0 0 ${W} ${H}`); box.style.minHeight = H + 'px';
    typeOrder.forEach((t, i) => {
      const cx = left + colW * i + colW / 2;
      const tx = svg.append('text').text(t);
      if (rotate) tx.attr('transform', `translate(${cx},${top - 6}) rotate(-65)`).attr('text-anchor', 'start');
      else tx.attr('x', cx).attr('y', top - 8).attr('text-anchor', 'middle');
    });
    areas.forEach((d, ri) => {
      const y = top + ri * rowH;
      svg.append('text').attr('class', 'lab').attr('x', left - 10).attr('y', y + rowH / 2).attr('dy', '0.32em').attr('text-anchor', 'end').text(`${d.a} (${fmt(d.n)})`);
      typeOrder.forEach((t, ci) => {
        const r = d.cells.get(t), v = r ? r.pct : 0, x = left + ci * colW;
        svg.append('rect').attr('x', x + 1).attr('y', y + 1).attr('width', colW - 2).attr('height', rowH - 2).attr('rx', 3)
          .style('fill', r ? C0 : 'var(--grid)').attr('fill-opacity', r ? 0.08 + 0.92 * Math.min(1, v / 80) : 0.6)
          .on('mousemove', (ev) => tip.show(ev, `${d.a} · ${t}`, r ? [[null, '검색건수', fmt(r.n) + '건'], [null, '읍면 내 비율', v + '%']] : [[null, '검색', '없음']]))
          .on('mouseleave', () => tip.hide());
        if (r && colW >= 30) svg.append('text').attr('x', x + colW / 2).attr('y', y + rowH / 2).attr('dy', '0.32em').attr('text-anchor', 'middle')
          .attr('pointer-events', 'none').style('fill', v >= 45 ? 'var(--panel)' : 'var(--fg)').text(v >= 1 ? Math.round(v) : '·');
      });
    });
  }

  // ---------- overview ----------
  // 증감 기호: 증가 ▲, 감소 ▼, 변화 없음은 기호 없이
  const tri = (v) => (v > 0 ? '▲' : v < 0 ? '▼' : '');
  function deltaText(box, v, pp) {
    box.replaceChildren();
    if (v == null) { box.textContent = '전월 데이터 추가 시 비교'; return; }
    const s = el('span', v > 0 ? 'up' : v < 0 ? 'down' : '', tri(v) + Math.abs(v) + (pp ? '%p' : '%'));
    box.append(s, document.createTextNode(' 전월 대비'));
  }

  function renderOverview() {
    const M = state.month;
    const row = D.monthly.find((r) => r.month === M);
    $$('[data-k]').forEach((e) => {
      const v = row ? row[e.dataset.k] : null;
      e.textContent = v == null ? '—' : ['spend_eok', 'outsider_share_pct'].includes(e.dataset.k) ? String(v) : fmt(v);
    });
    $$('[data-d]').forEach((e) => (row ? deltaText(e, row[e.dataset.d], e.dataset.d === 'share_pp') : e.replaceChildren()));

    const tk = $('#takeaway'); tk.replaceChildren();
    const pk = D.peak.find((r) => r.month === M);
    if (row && pk) {
      const T = (s) => document.createTextNode(s), B = (s) => el('b', null, s);
      tk.append(T(`${+M.slice(4)}월 외지인 방문은 일별 합계 `), B(fmt(row.outsider)), T('명으로 전체 방문의 '), B(row.outsider_share_pct + '%'),
        T('였습니다.'), el('br'), T('가장 붐빈 날은 '), B(pk.day_label), T('로 외지인 '), B(fmt(pk.outsider)), T('명이 찾았고, 한 달 관광소비는 '),
        B(row.spend_eok + '억원'), T('입니다.'));
    }

    const days = of('daily', M);
    dailyBars($('#ch-visit-daily'), days.map((d) => ({ key: d.date, label: dayLabel(d.date), full: dayFull(d.date), vals: [d.local, d.outsider] })),
      [{ name: '현지인', color: CM }, { name: '외지인', color: C0 }], '명');
    dailyBars($('#ch-spend-daily'), days.map((d) => ({ key: d.date, label: dayLabel(d.date), full: dayFull(d.date), vals: [d.spend_k] })),
      [{ name: '관광총소비', color: C1 }], '천원');
    dailyBars($('#ch-search-daily'), days.map((d) => ({ key: d.date, label: dayLabel(d.date), full: dayFull(d.date), vals: [d.search] })),
      [{ name: '검색건수', color: C2 }], '건');

    const desc = (a, b) => b.value - a.value;
    const areaRows = of('visitors_by_area', M);
    const totalArea = d3.sum(areaRows, (r) => r.visitors);
    choropleth($('#ch-visit-map'), areaRows.map((r) => ({ label: r.area, value: r.visitors, pct: r.pct })), {
      short: (r) => (r.value >= 10000 ? (Math.round(r.value / 1000) / 10) + '만' : fmt(r.value)) + '명',
      lines: (r) => [[null, '방문자 수', fmt(r.value) + '명'], [null, '비율', (r.pct ?? Math.round(r.value / totalArea * 1000) / 10) + '%']],
    });
    hbars($('#ch-visit-area'), of('visitors_by_area', M).map((r) => ({ label: r.area, value: r.visitors })).sort(desc), { name: '방문자 수', fmt: (v) => fmt(v) + '명' });
    hbars($('#ch-origin-sido'), of('origin_sido', M).map((r) => ({ label: r.sido, value: r.pct })).sort(desc), { name: '비율', fmt: (v) => v + '%', color: (d, i) => (i === 0 ? C0 : CM) });
    hbars($('#ch-spend-major'), of('industry_major', M).map((r) => ({ label: r.major, value: r.pct })).sort(desc), { name: '지출 비중', fmt: (v) => v + '%', color: () => C1 });
    hbars($('#ch-spend-cat'), of('spend_cat', M).map((r) => ({ label: r.cat, value: r.mw })).sort(desc), { name: '소비액', fmt: (v) => fmt(v) + '백만원', color: () => C1 });
    const types = of('search_type', M).sort((a, b) => b.n - a.n);
    hbars($('#ch-search-type'), types.map((r) => ({ label: r.type, value: r.n })), { name: '검색건수', fmt: (v) => fmt(v) + '건', color: () => C2 });
    heat($('#ch-search-area'), of('search_area', M), types.map((r) => r.type));

    const tb = $('#tbl-origin tbody'); tb.replaceChildren();
    of('origin', M).sort((a, b) => b.pct - a.pct).slice(0, 15).forEach((r) => {
      const tr = el('tr'); tr.append(el('td', null, r.sido), el('td', null, r.sgg), el('td', 'num', String(r.pct))); tb.append(tr);
    });
  }

  // ---------- compare: periods ----------
  const toDate = (s) => new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));
  const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
  const iso = (s) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  const dot = (s) => `${s.slice(0, 4)}.${s.slice(4, 6)}.${s.slice(6, 8)}`;
  const addDays = (s, n) => { const d = toDate(s); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };
  const spanDays = (s, e) => Math.round((toDate(e) - toDate(s)) / 864e5) + 1;
  const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  const pad = (n) => String(n).padStart(2, '0');
  const UNIT_LEN = { month: 1, quarter: 3, half: 6, year: 12 };
  const UNIT_WORD = { month: '전월', quarter: '전분기', half: '전반기', year: '전년', custom: '직전 같은 기간', festival: '직전 회차' };

  // ---------- 축제 ----------
  const FEST = window.FESTIVALS || [];
  const edHasData = (e) => D && D.daily.length && e.s <= D.daily[D.daily.length - 1].date && e.e >= D.daily[0].date;
  const festList = () => FEST.filter((f) => f.editions.filter(edHasData).length >= 2);
  const festYears = (f) => f.editions.filter(edHasData).map((e) => String(e.year));
  const priorEdition = (f, y) => festYears(f).filter((x) => x < y).pop();
  function festPeriod(f, y) {
    const e = f.editions.find((x) => String(x.year) === y);
    return { key: y, start: e.s, end: e.e, label: `${y}년${e.nth ? `(제${e.nth}회)` : ''}`, place: e.place };
  }

  function keyOf(unit, y, m) {
    if (unit === 'month') return `${y}${pad(m)}`;
    if (unit === 'quarter') return `${y}Q${Math.floor((m - 1) / 3) + 1}`;
    if (unit === 'half') return `${y}H${m <= 6 ? 1 : 2}`;
    return `${y}`;
  }
  function periodOf(unit, key) {
    const y = +key.slice(0, 4);
    let sm, label;
    if (unit === 'month') { sm = +key.slice(4); label = `${y}년 ${sm}월`; }
    else if (unit === 'quarter') { const q = +key.slice(5); sm = (q - 1) * 3 + 1; label = `${y}년 ${q}분기`; }
    else if (unit === 'half') { const h = +key.slice(5); sm = h === 1 ? 1 : 7; label = `${y}년 ${h === 1 ? '상' : '하'}반기`; }
    else { sm = 1; label = `${y}년`; }
    const em = sm + UNIT_LEN[unit] - 1;
    return { key, label, start: `${y}${pad(sm)}01`, end: `${y}${pad(em)}${lastDay(y, em)}` };
  }
  const periodKeys = (unit) => [...new Set(D.months.map((m) => keyOf(unit, +m.slice(0, 4), +m.slice(4))))].sort();
  function shiftKey(unit, key, kind) {
    const p = periodOf(unit, key), y = +p.start.slice(0, 4), m = +p.start.slice(4, 6);
    if (kind === 'yoy') return keyOf(unit, y - 1, m);
    let mm = m - UNIT_LEN[unit], yy = y;
    while (mm < 1) { mm += 12; yy -= 1; }
    return keyOf(unit, yy, mm);
  }
  function shiftRange(r, kind) {
    if (kind === 'yoy') {
      const back = (s) => { const y = +s.slice(0, 4) - 1, m = +s.slice(4, 6), d = Math.min(+s.slice(6, 8), lastDay(y, m)); return `${y}${pad(m)}${pad(d)}`; };
      return { s: back(r.s), e: back(r.e) };
    }
    const e = addDays(r.s, -1);
    return { s: addDays(e, -(spanDays(r.s, r.e) - 1)), e };
  }
  const customPeriod = (r) => ({ key: `${r.s}-${r.e}`, start: r.s, end: r.e, label: `${dot(r.s)}~${dot(r.e)}` });

  // ---------- compare: aggregation ----------
  let dayMap = null;
  function daysIn(p) {
    dayMap = dayMap || new Map(D.daily.map((d) => [d.date, d]));
    const out = [];
    for (let s = p.start; s <= p.end; s = addDays(s, 1)) { const d = dayMap.get(s); if (d) out.push(d); }
    return out;
  }
  function agg(p) {
    const days = daysIn(p), n = days.length;
    const t = { total: 0, outsider: 0, local: 0, spend_k: 0, search: 0 };
    for (const d of days) for (const k in t) t[k] += d[k];
    const avg = (v) => (n ? Math.round(v / n) : null);
    return {
      days, n, cal: spanDays(p.start, p.end),
      spend_eok: n ? Math.round(t.spend_k / 1e4) / 10 : null, spend_avg_k: avg(t.spend_k),
      outsider: n ? t.outsider : null, outsider_avg: avg(t.outsider), local: n ? t.local : null, total: n ? t.total : null,
      outsider_share_pct: t.total ? Math.round((t.outsider / t.total) * 1000) / 10 : null,
      search: n ? t.search : null, search_avg: avg(t.search),
    };
  }
  function sumCols(table, p) {
    const out = new Map(table.cols.map((c) => [c, 0]));
    for (let s = p.start; s <= p.end; s = addDays(s, 1)) {
      const r = table.rows[s]; if (r) r.forEach((v, i) => out.set(table.cols[i], out.get(table.cols[i]) + v));
    }
    return out;
  }
  function sidoWeighted(a) {
    const w = new Map();
    for (const d of a.days) w.set(d.month, (w.get(d.month) || 0) + d.outsider);
    const acc = new Map(); let W = 0;
    for (const [m, wt] of w) {
      const rows = of('origin_sido', m); if (!rows.length) continue;
      W += wt; for (const r of rows) acc.set(r.sido, (acc.get(r.sido) || 0) + r.pct * wt);
    }
    return new Map([...acc].map(([k, v]) => [k, W ? Math.round((v / W) * 10) / 10 : null]));
  }
  function trendSeries(p, a, monthly) {
    const wd = (k) => { const i = dayInfo(k); const w = '일월화수목금토'[toDate(k).getUTCDay()]; return ` (${w}${i && i.name ? ' · ' + i.name : ''})`; };
    if (!monthly) return a.days.map((d) => ({ i: spanDays(p.start, d.date), v: d[state.metric], label: dot(d.date) + wd(d.date) }));
    const g = d3.groups(a.days, (d) => d.month);
    return g.map(([m, ds], idx) => ({ i: idx + 1, v: d3.sum(ds, (d) => d[state.metric]), label: `${m.slice(0, 4)}.${m.slice(4)}` + (ds.length < lastDay(+m.slice(0, 4), +m.slice(4)) ? ` (${ds.length}일)` : '') }));
  }

  function lines2(box, A, B, o) {
    box.replaceChildren();
    if (!A.length && !B.length) return noData(box, '두 기간 모두 자료가 없습니다');
    const n = Math.max(2, d3.max([...A, ...B], (d) => d.i));
    const daily = !o.monthly && o.startA && o.startB;
    const keyA = (i) => addDays(o.startA, i - 1), keyB = (i) => addDays(o.startB, i - 1);
    if (daily) dayLegend(box, d3.range(1, n + 1).flatMap((i) => [keyA(i), keyB(i)]));
    const W = Math.max(300, box.clientWidth), H = daily ? 278 : 240;
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
    const y0 = d3.scaleLinear([0, d3.max([...A, ...B], (d) => d.v) || 1], [0, 1]).nice();
    const ticks = y0.ticks(4);
    const m = { t: 12, r: 14, b: daily ? 60 : 22, l: Math.max(textW(svg, ticks.map((v) => compact.format(v))), daily ? textW(svg, ['기준', '비교']) + 8 : 0) + 10 };
    const x = d3.scaleLinear([1, n], [m.l, W - m.r]);
    const y = d3.scaleLinear(y0.domain(), [H - m.b, m.t]);
    if (daily) {
      // 기준·비교 기간 각각의 쉬는 날을 축 아래 두 줄 색 띠로 표시
      const cw = Math.max(2, Math.min(14, (x(2) - x(1)) * 0.75));
      const rowsY = [[keyA, H - m.b + 12, '기준', C0], [keyB, H - m.b + 29, '비교', 'var(--muted)']];
      // 기준 기간 쉬는 날은 배경도 옅게 칠함
      svg.append('g').selectAll('rect').data(d3.range(1, n + 1).filter((i) => dayInfo(keyA(i)))).join('rect')
        .attr('x', (i) => Math.max(m.l, x(i) - (x(2) - x(1)) / 2))
        .attr('width', (i) => Math.min(W - m.r, x(i) + (x(2) - x(1)) / 2) - Math.max(m.l, x(i) - (x(2) - x(1)) / 2))
        .attr('y', m.t).attr('height', H - m.b - m.t)
        .style('fill', 'var(--rest-bg)');
      for (const [kf, yy, lab, col] of rowsY) {
        svg.append('text').attr('x', m.l - 14).attr('y', yy + 2.5).attr('dy', '0.32em').attr('text-anchor', 'end')
          .style('font-size', '11px').style('fill', col).style('font-weight', 600).text(lab);
        svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', yy + 2.5).attr('y2', yy + 2.5).style('stroke', 'var(--grid)');
        svg.append('g').selectAll('rect').data(d3.range(1, n + 1).filter((i) => dayInfo(kf(i)))).join('rect')
          .attr('x', (i) => x(i) - cw / 2).attr('width', cw).attr('y', yy).attr('height', 5).attr('rx', 1.5)
          .style('fill', (i) => DAY_COLOR[dayInfo(kf(i)).type]);
      }
    }
    svg.append('g').selectAll('line').data(ticks).join('line').attr('x1', m.l).attr('x2', W - m.r)
      .attr('y1', y).attr('y2', y).style('stroke', (v) => (v === 0 ? 'var(--axis)' : 'var(--grid)'));
    svg.append('g').selectAll('text').data(ticks).join('text').attr('x', m.l - 8).attr('y', y).attr('dy', '0.32em').attr('text-anchor', 'end').text((v) => compact.format(v));
    const tickLab = (i) => o.tick(i);
    const maxT = Math.max(2, Math.floor((W - m.l - m.r) / 64));
    const step = Math.max(1, Math.ceil((n - 1) / (maxT - 1)));
    const xt = d3.range(1, n + 1, step); if (xt[xt.length - 1] !== n && n - xt[xt.length - 1] >= step / 2) xt.push(n);
    svg.append('g').selectAll('text').data(xt).join('text').attr('x', x).attr('y', H - (daily ? 3 : 6))
      .attr('text-anchor', (d) => (d === 1 ? 'start' : d === n ? 'end' : 'middle')).text(tickLab)
      .style('fill', (i) => { if (!daily) return null; const f = dayInfo(keyA(i)); return !f ? null : f.type === '토' ? 'var(--day-sat)' : 'var(--day-sun)'; });
    const line = d3.line().defined((d) => d.v != null).x((d) => x(d.i)).y((d) => y(d.v));
    [[B, CM], [A, C0]].forEach(([s, c]) => {
      svg.append('path').datum(s).attr('d', line).style('fill', 'none').style('stroke', c).attr('stroke-width', 2).attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round');
      if (o.monthly) svg.append('g').selectAll('circle').data(s).join('circle').attr('cx', (d) => x(d.i)).attr('cy', (d) => y(d.v)).attr('r', 3).style('fill', c);
    });
    const rule = svg.append('line').attr('y1', m.t).attr('y2', H - m.b).style('stroke', 'var(--axis)').attr('visibility', 'hidden');
    const dA = svg.append('circle').attr('r', 4.5).style('fill', C0).attr('visibility', 'hidden');
    const dB = svg.append('circle').attr('r', 4.5).style('fill', CM).attr('visibility', 'hidden');
    const ia = new Map(A.map((d) => [d.i, d])), ib = new Map(B.map((d) => [d.i, d]));
    svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', W - m.l - m.r).attr('height', H - m.t - m.b).style('fill', 'transparent')
      .on('mousemove', (ev) => {
        const i = Math.max(1, Math.min(n, Math.round(x.invert(d3.pointer(ev)[0]))));
        const a = ia.get(i), b = ib.get(i);
        rule.attr('x1', x(i)).attr('x2', x(i)).attr('visibility', 'visible');
        dA.attr('cx', x(i)).attr('cy', a ? y(a.v) : 0).attr('visibility', a ? 'visible' : 'hidden');
        dB.attr('cx', x(i)).attr('cy', b ? y(b.v) : 0).attr('visibility', b ? 'visible' : 'hidden');
        tip.show(ev, o.monthly ? `${i}번째 달` : `${i}일째`, [
          [C0, a ? a.label : o.la, a ? fmt(a.v) + o.unit : '자료 없음'],
          [CM, b ? b.label : o.lb, b ? fmt(b.v) + o.unit : '자료 없음']]);
      })
      .on('mouseleave', () => { rule.attr('visibility', 'hidden'); dA.attr('visibility', 'hidden'); dB.attr('visibility', 'hidden'); tip.hide(); });
  }

  // ---------- compare: render ----------
  const METRICS = [
    ['spend_eok', '관광소비 총액', '억원'],
    ['outsider', '외지인 방문자', '명'],
    ['local', '현지인 방문자', '명'], ['total', '전체 방문자', '명'],
    ['outsider_share_pct', '외지인 비중', '%'], ['search', '관광 검색건수', '건'],
  ];
  const dataMin = () => D.daily[0].date, dataMax = () => D.daily[D.daily.length - 1].date;
  const clampR = (r) => ({ s: r.s < dataMin() ? dataMin() : r.s, e: r.e > dataMax() ? dataMax() : r.e });

  function resolvePeriods() {
    const u = state.unit;
    if (u === 'festival') {
      const list = festList();
      if (!list.find((f) => f.id === state.fest)) state.fest = list.length ? list[0].id : null;
      const f = FEST.find((x) => x.id === state.fest);
      if (!f) return [null, null];
      const ys = festYears(f);
      if (!ys.includes(state.a)) state.a = ys[ys.length - 1];
      const others = ys.filter((y) => y !== state.a);
      if (state.bAuto && priorEdition(f, state.a)) state.b = priorEdition(f, state.a);
      if (!others.includes(state.b)) state.b = priorEdition(f, state.a) || others[others.length - 1];
      return [festPeriod(f, state.a), festPeriod(f, state.b)];
    }
    if (u === 'custom') {
      if (!state.ca) state.ca = { s: addDays(dataMax(), -29), e: dataMax() };
      if (!state.cb || state.bAuto) state.cb = clampR(shiftRange(state.ca, state.bAuto || 'yoy'));
      return [customPeriod(state.ca), customPeriod(state.cb)];
    }
    const keys = periodKeys(u);
    if (!keys.includes(state.a)) state.a = keys[keys.length - 1];
    const others = keys.filter((k) => k !== state.a);
    if (state.bAuto && others.includes(shiftKey(u, state.a, state.bAuto))) state.b = shiftKey(u, state.a, state.bAuto);
    if (!others.includes(state.b)) {
      const pv = shiftKey(u, state.a, 'prev'), yy = shiftKey(u, state.a, 'yoy');
      state.b = others.includes(pv) ? pv : others.includes(yy) ? yy : others[others.length - 1];
    }
    return [periodOf(u, state.a), periodOf(u, state.b)];
  }

  function renderCompare() {
    const u = state.unit;
    $$('.seg.unit button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.u === u)));
    if (D.months.length < 2) {
      $('#cmp-empty').hidden = false; $('#cmp-body').hidden = true;
      $('#only-month').textContent = D.months.length ? mLabel(D.months[0]) : '어느 달의';
      return;
    }
    $('#cmp-empty').hidden = true; $('#cmp-body').hidden = false;
    const [PA, PB] = resolvePeriods();
    if (!PA) { $('#cmp-body').hidden = true; return; }
    const custom = u === 'custom', fest = u === 'festival';
    $('#cmp-a').hidden = custom; $('#cmp-b').hidden = custom; $('#rng-a').hidden = !custom; $('#rng-b').hidden = !custom;
    $('#fest-row').hidden = !fest;
    if (fest) {
      const f = FEST.find((x) => x.id === state.fest);
      const sel = $('#fest'); sel.replaceChildren();
      festList().forEach((x) => sel.append(new Option(x.name, x.id)));
      sel.value = state.fest;
      const optLab = (y) => { const e = f.editions.find((x) => String(x.year) === y); return `${y}년${e.nth ? ` 제${e.nth}회` : ''} (${+e.s.slice(4, 6)}/${+e.s.slice(6)}~${+e.e.slice(4, 6)}/${+e.e.slice(6)})`; };
      const ys = festYears(f);
      $('#cmp-a').replaceChildren(...ys.slice().reverse().map((y) => new Option(optLab(y), y))); $('#cmp-a').value = state.a;
      $('#cmp-b').replaceChildren(...ys.filter((y) => y !== state.a).reverse().map((y) => new Option(optLab(y), y))); $('#cmp-b').value = state.b;
      $('.pre[data-pre=prev]').disabled = !priorEdition(f, state.a);
      const noData = f.editions.filter((e) => !edHasData(e)).map((e) => `${e.year}년`);
      $('#fest-info').textContent = `장소: ${PA.place}` + (noData.length ? ` · 자료 기간 밖: ${noData.join(', ')}` : '');
    } else if (custom) {
      for (const [id, v] of [['#a-s', state.ca.s], ['#a-e', state.ca.e], ['#b-s', state.cb.s], ['#b-e', state.cb.e]]) {
        const inp = $(id); inp.min = iso(dataMin()); inp.max = iso(dataMax());
        if (inp !== document.activeElement) inp.value = iso(v);
      }
      $('.pre[data-pre=prev]').disabled = false; $('.pre[data-pre=yoy]').disabled = false;
    } else {
      const keys = periodKeys(u);
      $('#cmp-a').replaceChildren(...keys.slice().reverse().map((k) => new Option(periodOf(u, k).label, k))); $('#cmp-a').value = state.a;
      $('#cmp-b').replaceChildren(...keys.filter((k) => k !== state.a).reverse().map((k) => new Option(periodOf(u, k).label, k))); $('#cmp-b').value = state.b;
      $('.pre[data-pre=prev]').disabled = !keys.includes(shiftKey(u, state.a, 'prev'));
      $('.pre[data-pre=yoy]').disabled = !keys.includes(shiftKey(u, state.a, 'yoy'));
    }
    $('.pre[data-pre=prev]').textContent = UNIT_WORD[u] + ' 대비';
    $('.pre[data-pre=yoy]').hidden = u === 'year' || fest;

    const A = agg(PA);
    // 기준 기간 자료가 도중에 끝나면(예: 올해는 9월까지) 비교 기간도 같은 길이까지만 합산
    let PBx = PB, cutNote = null;
    const lastA = A.n ? A.days[A.n - 1].date : null;
    if (lastA && lastA < PA.end && lastA === dataMax()) {
      const len = spanDays(PA.start, lastA), endB = addDays(PB.start, len - 1);
      if (state.align && endB < PB.end) { PBx = { ...PB, end: endB, label: `${PB.label}(${+endB.slice(4, 6)}/${+endB.slice(6, 8)}까지)` }; }
      cutNote = { lastA, endB, on: state.align && endB < PB.end, possible: endB < PB.end };
    }
    const B = agg(PBx);
    const la = PA.label + (cutNote ? `(${+lastA.slice(4, 6)}/${+lastA.slice(6, 8)}까지)` : ''), lb = PBx.label;
    $('#th-a').textContent = la; $('#th-b').textContent = lb; $('#lg-a').textContent = la; $('#lg-b').textContent = lb;

    // coverage line
    const cov = $('#coverage'); cov.replaceChildren();
    const part = (p, a, name) => {
      const s = el('span', null, `${name} ${dot(p.start)} ~ ${dot(p.end)} · ${a.cal}일`);
      if (a.n < a.cal) s.append(el('span', 'warn', a.n ? `자료 있는 ${a.n}일만 합산` : '자료 없음'));
      return s;
    };
    cov.append(part(PA, A, '기준'), el('span', 'sep', '|'), part(PBx, B, '비교'));
    if (A.n && B.n && Math.abs(A.n - B.n) / Math.max(A.n, B.n) > 0.05) cov.append(el('span', 'warn', '두 기간의 길이가 달라 합계 비교에 유의하세요'));
    if (cutNote && cutNote.possible) {
      const line = el('span', 'cut');
      line.append(document.createTextNode(cutNote.on
        ? `기준 기간 자료가 ${dot(cutNote.lastA)}까지라 비교 기간도 같은 길이(${dot(cutNote.endB)}까지)로 맞췄습니다. `
        : '비교 기간 전체를 합산 중입니다. '));
      const btn = el('button', 'linkbtn', cutNote.on ? '비교 기간 전체 보기' : '같은 길이로 맞추기');
      btn.addEventListener('click', () => { state.align = !state.align; render(); });
      line.append(btn); cov.append(line);
    }

    // KPI table
    const tb = $('#tbl-pairs tbody'); tb.replaceChildren();
    const nf = (v, unit) => (v == null ? '—' : (unit === '억원' || unit === '%' ? String(v) : fmt(v)).replace('\u2212', '-') + unit);
    for (const [k, label, unit] of METRICS) {
      const av = A[k], bv = B[k];
      const diff = av != null && bv != null ? Math.round((av - bv) * 10) / 10 : null;
      const pct = unit !== '%' && av != null && bv ? Math.round((av / bv - 1) * 1000) / 10 : null;
      const sign = tri;
      const tr = el('tr');
      tr.append(el('td', null, label), el('td', 'num', nf(av, unit)), el('td', 'num', nf(bv, unit)));
      const cls = diff > 0 ? 'num up' : diff < 0 ? 'num down' : 'num';
      tr.append(el('td', cls, diff == null ? '—' : sign(diff) + (unit === '%' ? Math.abs(diff) + '%p' : nf(Math.abs(diff), unit))));
      tr.append(el('td', pct == null ? 'num' : pct > 0 ? 'num up' : pct < 0 ? 'num down' : 'num', pct == null ? '—' : sign(pct) + Math.abs(pct) + '%'));
      tb.append(tr);
    }

    // trend
    const monthly = Math.max(A.cal, B.cal) > 62;
    $('#trend-title').textContent = monthly ? '월별 추이 겹쳐보기' : '일별 추이 겹쳐보기';
    $('#trend-note').textContent = monthly
      ? '각 기간의 1번째 달, 2번째 달…끼리 겹쳐 비교합니다. 일부만 포함된 달은 괄호에 일수를 표시합니다.'
      : '각 기간의 1일째, 2일째…끼리 겹쳐 비교합니다. 요일이 달라질 수 있어 주말 효과에 유의하세요.';
    const sa = trendSeries(PA, A, monthly), sb = trendSeries(PBx, B, monthly);
    const unitTxt = { outsider: '명', total: '명', spend_k: '천원', search: '건' }[state.metric];
    const aLab = new Map(sa.map((d) => [d.i, d.label]));
    const tick = monthly
      ? (i) => { const l = aLab.get(i); return l ? `${+l.slice(5, 7)}월` : `${i}번째`; }
      : (i) => { const s = addDays(PA.start, i - 1); return `${+s.slice(4, 6)}/${+s.slice(6, 8)}`; };
    lines2($('#ch-cmp-daily'), sa, sb, { la, lb, unit: unitTxt, monthly, tick, startA: PA.start, startB: PBx.start });

    // distributions
    const pairMaps = (ma, mb, scale) => [...new Set([...ma.keys(), ...mb.keys()])]
      .map((k) => ({ label: k, a: ma.get(k) ? scale(ma.get(k)) : (ma.has(k) && A.n ? 0 : null), b: mb.get(k) ? scale(mb.get(k)) : (mb.has(k) && B.n ? 0 : null) }))
      .filter((r) => (r.a || 0) + (r.b || 0) > 0)
      .sort((p, q) => (q.a ?? -1) - (p.a ?? -1));
    // 읍면별 방문자 수: 월 자료를 기간에 포함된 일수 비율만큼 더함(달 전체면 그대로)
    const areaOf = (p) => {
      const acc = new Map(); let partial = false, missing = false;
      const ms = [...new Set(d3.range(spanDays(p.start, p.end)).map((i) => addDays(p.start, i).slice(0, 6)))];
      for (const m of ms) {
        const y = +m.slice(0, 4), mo = +m.slice(4), ml = lastDay(y, mo);
        const s0 = p.start > `${m}01` ? p.start : `${m}01`, e0 = p.end < `${m}${ml}` ? p.end : `${m}${ml}`;
        const frac = spanDays(s0, e0) / ml; if (frac < 1) partial = true;
        const rows = of('visitors_by_area', m); if (!rows.length) { missing = true; continue; }
        for (const r of rows) acc.set(r.area, (acc.get(r.area) || 0) + r.visitors * frac);
      }
      return { map: new Map([...acc].map(([k, v]) => [k, Math.round(v)])), partial, missing };
    };
    const ar = areaOf(PA), br = areaOf(PBx);
    const amax = Math.max(1, ...ar.map.values());
    const short = (r) => (r.value >= 10000 ? (Math.round(r.value / 1000) / 10) + '만' : fmt(r.value)) + '명';
    const chg = (a, b) => (b ? Math.round((a / b - 1) * 1000) / 10 : null);
    const mk = (mine, other, isA) => [...mine.map].map(([k, v]) => ({ label: k, value: v, other: other.map.get(k) }));
    $('#cmp-map-a-t').textContent = `기준 · ${la} (▲▼: ${lb} 대비)`;
    choropleth($('#ch-cmp-map-a'), mk(ar, br), { max: amax, short,
      sub: (r) => { const c = chg(r.value, r.other); return c == null ? null : [tri(c) + Math.abs(c) + '%', c > 0 ? 'up' : c < 0 ? 'down' : '']; },
      lines: (r) => { const c = chg(r.value, r.other); return [[C0, la, fmt(r.value) + '명'], [CM, lb, r.other == null ? '없음' : fmt(r.other) + '명'], [null, '증감률', c == null ? '—' : tri(c) + Math.abs(c) + '%']]; } });
    $('#cmp-map-note').textContent = '색은 기준 기간의 방문자 수, ▲▼는 비교 기간 대비 증감률입니다. 읍면에 올리면 두 기간 수치가 보입니다.'
      + (ar.partial || br.partial ? ' 달의 일부만 포함된 기간은 월 자료를 일수 비율로 나눈 추정치입니다.' : '')
      + (ar.missing || br.missing ? ' 일부 달은 읍면 자료가 없어 빠졌습니다.' : '');
    hbars2($('#ch-cmp-cat'), pairMaps(sumCols(D.daily_cat, PA), sumCols(D.daily_cat, PBx), (v) => Math.round(v / 1000)), { la, lb, fmt: (v) => fmt(v) });
    hbars2($('#ch-cmp-sido'), pairMaps(sidoWeighted(A), sidoWeighted(B), (v) => v), { la, lb, fmt: (v) => v + '%' });
    hbars2($('#ch-cmp-type'), pairMaps(sumCols(D.daily_type, PA), sumCols(D.daily_type, PBx), (v) => v), { la, lb, fmt: (v) => fmt(v) });
  }

  // ---------- footer ----------
  function renderFooter() {
    $('.gen').textContent = `· 데이터 갱신 ${D.generated.replace('T', ' ').slice(0, 16)}`;
    const wl = $('#warn-list'); wl.replaceChildren(...D.warnings.map((w) => el('li', null, w)));
    $('#checks').hidden = !D.warnings.length;
    const tb = $('#tbl-files tbody');
    tb.replaceChildren(...D.files.map((f) => { const tr = el('tr'); tr.append(el('td', null, f.name), el('td', 'num', f.rows == null ? '' : fmt(f.rows)), el('td', null, f.status)); return tr; }));
  }

  // ---------- wiring ----------
  function render() {
    if (!D) return;
    $('#overview').hidden = state.tab !== 'overview';
    $('#compare').hidden = state.tab !== 'compare';
    $('#ov-ctrl').style.visibility = state.tab === 'overview' ? 'visible' : 'hidden';
    $$('.tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === state.tab)));
    if (state.tab === 'overview') renderOverview(); else renderCompare();
  }

  $$('.tab').forEach((b) => b.addEventListener('click', () => { state.tab = b.dataset.tab; history.replaceState(null, '', '#' + state.tab); render(); }));
  $('#month').addEventListener('change', (e) => { state.month = e.target.value; render(); });
  $('#cmp-a').addEventListener('change', (e) => { state.a = e.target.value; state.b = null; render(); });
  $('#cmp-b').addEventListener('change', (e) => { state.b = e.target.value; state.bAuto = null; render(); });
  $('#fest').addEventListener('change', (e) => { state.fest = e.target.value; state.a = null; state.b = null; render(); });
  $$('.seg.unit button').forEach((b) => b.addEventListener('click', () => {
    if (state.unit === b.dataset.u) return;
    state.unit = b.dataset.u; state.a = null; state.b = null; render();
  }));
  $$('.pre').forEach((b) => b.addEventListener('click', () => {
    state.bAuto = b.dataset.pre;
    if (state.unit === 'festival') { const f = FEST.find((x) => x.id === state.fest); state.b = f && priorEdition(f, state.a); render(); return; }
    if (state.unit === 'custom') state.cb = clampR(shiftRange(state.ca, b.dataset.pre));
    else state.b = shiftKey(state.unit, state.a, b.dataset.pre);
    render();
  }));
  // 날짜 입력: 완성된 날짜이고 시작<=종료일 때만 반영, 포커스를 잃으면 사용 중인 값으로 되돌림
  [['a', '#a-s', '#a-e'], ['b', '#b-s', '#b-e']].forEach(([w, si, ei]) => {
    const onChange = () => {
      const s = $(si).value.replace(/-/g, ''), e = $(ei).value.replace(/-/g, '');
      if (!/^\d{8}$/.test(s) || !/^\d{8}$/.test(e) || !$(si).validity.valid || !$(ei).validity.valid || s > e) return;
      const r = clampR({ s, e });
      if (w === 'a') state.ca = r; else { state.cb = r; state.bAuto = null; }
      render();
    };
    [si, ei].forEach((id) => { $(id).addEventListener('change', onChange); $(id).addEventListener('blur', () => setTimeout(render, 0)); });
  });
  $$('.seg.metric button').forEach((b) => b.addEventListener('click', () => {
    state.metric = b.dataset.m;
    $$('.seg.metric button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    render();
  }));
  $$('.more-btn').forEach((b) => b.addEventListener('click', () => {
    const open = b.getAttribute('aria-expanded') !== 'true';
    b.setAttribute('aria-expanded', String(open));
    b.firstChild.textContent = open ? '접기 ' : '자세히 보기 ';
    document.getElementById(b.dataset.more).hidden = !open;
    if (open) render();
  }));
  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(render, 150); });

  fetch('gangjin_emd.geojson').then((r) => (r.ok ? r.json() : null)).then((g) => { GEO = g; if (D) render(); }).catch(() => {});
  fetch('data/data.json', { cache: 'no-cache' })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((data) => {
      D = data;
      const ms = D.months;
      $('#month').replaceChildren(...ms.slice().reverse().map((m) => new Option(mLabel(m), m)));
      state.month = ms[ms.length - 1] || null;
      if (state.month) $('#month').value = state.month;
      if (location.hash === '#compare') state.tab = 'compare';
      renderFooter();
      render();
    })
    .catch(() => { $('#load-error').hidden = false; });
})();
