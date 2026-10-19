(() => {
  'use strict';
  const fmt = d3.format(',');
  const compact = new Intl.NumberFormat('ko', { notation: 'compact', maximumFractionDigits: 1 });
  const C0 = 'var(--c0)', C1 = 'var(--c1)', C2 = 'var(--c2)', CM = 'var(--cm)';
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  let D = null;
  const state = { tab: 'overview', month: null, a: null, b: null, metric: 'outsider' };

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

  // ---------- charts ----------
  function dailyBars(box, days, series, unit) {
    box.replaceChildren();
    if (!days.length) return noData(box);
    const W = Math.max(300, box.clientWidth), H = 240;
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
    const totals = days.map((d) => d3.sum(d.vals));
    const y0 = d3.scaleLinear([0, d3.max(totals) || 1], [0, 1]).nice();
    const ticks = y0.ticks(4);
    const m = { t: 22, r: 6, b: 22, l: textW(svg, ticks.map((v) => compact.format(v))) + 10 };
    const x = d3.scaleBand(days.map((d) => d.key), [m.l, W - m.r]).paddingInner(0.25).paddingOuter(0.1);
    const y = d3.scaleLinear(y0.domain(), [H - m.b, m.t]);
    svg.append('g').selectAll('line').data(ticks).join('line')
      .attr('x1', m.l).attr('x2', W - m.r).attr('y1', y).attr('y2', y)
      .style('stroke', (v) => (v === 0 ? 'var(--axis)' : 'var(--grid)'));
    svg.append('g').selectAll('text').data(ticks).join('text')
      .attr('x', m.l - 8).attr('y', y).attr('dy', '0.32em').attr('text-anchor', 'end').text((v) => compact.format(v));
    const step = Math.max(1, Math.ceil(days.length / Math.max(1, Math.floor((W - m.l) / 46))));
    svg.append('g').selectAll('text').data(days.filter((d, i) => i % step === 0)).join('text')
      .attr('x', (d) => x(d.key) + x.bandwidth() / 2).attr('y', H - 6).attr('text-anchor', 'middle').text((d) => d.label);
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
      const lw = textW(svg, [lab], 'lab');
      svg.append('text').attr('class', 'lab').attr('x', Math.min(Math.max(px, m.l + lw / 2), W - m.r - lw / 2))
        .attr('y', y(totals[pi]) - 7).attr('text-anchor', 'middle').text(lab);
    }
    svg.append('g').selectAll('rect').data(days).join('rect')
      .attr('x', (d) => x(d.key) - (x.step() - x.bandwidth()) / 2).attr('width', x.step())
      .attr('y', m.t).attr('height', H - m.t - m.b).style('fill', 'transparent')
      .on('mousemove', (ev, d) => {
        g.selectAll('rect.bar').attr('opacity', function () { return this.dataset.k === d.key ? 1 : 0.45; });
        const lines = series.length > 1
          ? [...series.map((s, i) => [s.color, s.name, fmt(d.vals[i]) + unit]).reverse(), [null, '합계', fmt(d3.sum(d.vals)) + unit]]
          : [[null, series[0].name, fmt(d.vals[0]) + unit]];
        tip.show(ev, d.full, lines);
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

  function lines2(box, A, B, o) {
    box.replaceChildren();
    const W = Math.max(300, box.clientWidth), H = 240;
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
    const y0 = d3.scaleLinear([0, d3.max([...A, ...B], (d) => d.v) || 1], [0, 1]).nice();
    const ticks = y0.ticks(4);
    const m = { t: 12, r: 10, b: 22, l: textW(svg, ticks.map((v) => compact.format(v))) + 10 };
    const x = d3.scaleLinear([1, 31], [m.l, W - m.r]);
    const y = d3.scaleLinear(y0.domain(), [H - m.b, m.t]);
    svg.append('g').selectAll('line').data(ticks).join('line').attr('x1', m.l).attr('x2', W - m.r)
      .attr('y1', y).attr('y2', y).style('stroke', (v) => (v === 0 ? 'var(--axis)' : 'var(--grid)'));
    svg.append('g').selectAll('text').data(ticks).join('text').attr('x', m.l - 8).attr('y', y).attr('dy', '0.32em').attr('text-anchor', 'end').text((v) => compact.format(v));
    svg.append('g').selectAll('text').data([1, 5, 10, 15, 20, 25, 31]).join('text').attr('x', x).attr('y', H - 6).attr('text-anchor', 'middle').text((d) => d + '일');
    const line = d3.line().x((d) => x(d.d)).y((d) => y(d.v));
    [[B, CM], [A, C0]].forEach(([s, c]) => svg.append('path').datum(s).attr('d', line).style('fill', 'none')
      .style('stroke', c).attr('stroke-width', 2).attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round'));
    const rule = svg.append('line').attr('y1', m.t).attr('y2', H - m.b).style('stroke', 'var(--axis)').attr('visibility', 'hidden');
    const dA = svg.append('circle').attr('r', 4).style('fill', C0).attr('visibility', 'hidden');
    const dB = svg.append('circle').attr('r', 4).style('fill', CM).attr('visibility', 'hidden');
    svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', W - m.l - m.r).attr('height', H - m.t - m.b).style('fill', 'transparent')
      .on('mousemove', (ev) => {
        const d = Math.max(1, Math.min(31, Math.round(x.invert(d3.pointer(ev)[0]))));
        const a = A.find((p) => p.d === d), b = B.find((p) => p.d === d);
        rule.attr('x1', x(d)).attr('x2', x(d)).attr('visibility', 'visible');
        dA.attr('cx', x(d)).attr('cy', a ? y(a.v) : 0).attr('visibility', a ? 'visible' : 'hidden');
        dB.attr('cx', x(d)).attr('cy', b ? y(b.v) : 0).attr('visibility', b ? 'visible' : 'hidden');
        tip.show(ev, `${d}일`, [[C0, o.la, a ? fmt(a.v) + o.unit : '없음'], [CM, o.lb, b ? fmt(b.v) + o.unit : '없음']]);
      })
      .on('mouseleave', () => { rule.attr('visibility', 'hidden'); dA.attr('visibility', 'hidden'); dB.attr('visibility', 'hidden'); tip.hide(); });
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
  function deltaText(box, v, pp) {
    box.replaceChildren();
    if (v == null) { box.textContent = '전월 데이터 추가 시 비교'; return; }
    const s = el('span', v > 0 ? 'up' : v < 0 ? 'down' : '', (v > 0 ? '+' : '') + v + (pp ? '%p' : '%'));
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
        T('였습니다. 가장 붐빈 날은 '), B(pk.day_label), T('로 외지인 '), B(fmt(pk.outsider)), T('명이 찾았고, 한 달 관광소비는 '),
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

  // ---------- compare ----------
  const METRICS = [
    ['spend_eok', '관광소비 총액', '억원'], ['spend_avg_k', '관광소비 일평균', '천원'],
    ['outsider', '외지인 방문자', '명'], ['outsider_avg', '외지인 일평균', '명'],
    ['local', '현지인 방문자', '명'], ['total', '전체 방문자', '명'],
    ['outsider_share_pct', '외지인 비중', '%'], ['search', '관광 검색건수', '건'], ['search_avg', '검색 일평균', '건'],
  ];

  function renderCompare() {
    const months = D.months;
    if (months.length < 2) {
      $('#cmp-empty').hidden = false; $('#cmp-body').hidden = true;
      $('#only-month').textContent = months.length ? mLabel(months[0]) : '어느 달의';
      $('#cmp-a').replaceChildren(...months.map((m) => new Option(mLabel(m), m)));
      $('#cmp-b').replaceChildren(new Option('—', '')); $('#cmp-b').disabled = true;
      $$('.pre').forEach((b) => (b.disabled = true));
      return;
    }
    $('#cmp-empty').hidden = true; $('#cmp-body').hidden = false; $('#cmp-b').disabled = false;
    const A = months.includes(state.a) ? state.a : months[months.length - 1];
    const others = months.filter((m) => m !== A);
    const B = others.includes(state.b) ? state.b : others.includes(prevM(A)) ? prevM(A) : others.includes(yoyM(A)) ? yoyM(A) : others[others.length - 1];
    state.a = A; state.b = B;
    $('#cmp-a').replaceChildren(...months.map((m) => new Option(mLabel(m), m))); $('#cmp-a').value = A;
    $('#cmp-b').replaceChildren(...others.map((m) => new Option(mLabel(m), m))); $('#cmp-b').value = B;
    $('.pre[data-pre=prev]').disabled = !others.includes(prevM(A));
    $('.pre[data-pre=yoy]').disabled = !others.includes(yoyM(A));
    const la = mLabel(A), lb = mLabel(B);
    $('#th-a').textContent = la; $('#th-b').textContent = lb; $('#lg-a').textContent = la; $('#lg-b').textContent = lb;

    const ra = D.monthly.find((r) => r.month === A), rb = D.monthly.find((r) => r.month === B);
    const tb = $('#tbl-pairs tbody'); tb.replaceChildren();
    const nf = (v, u) => (v == null ? '—' : (u === '억원' || u === '%' ? String(v) : fmt(v)) + u);
    for (const [k, label, unit] of METRICS) {
      const av = ra[k], bv = rb[k];
      const diff = av != null && bv != null ? Math.round((av - bv) * 10) / 10 : null;
      const pct = unit !== '%' && bv ? Math.round((av / bv - 1) * 1000) / 10 : null;
      const sign = (v) => (v > 0 ? '+' : '');
      const tr = el('tr');
      tr.append(el('td', null, label), el('td', 'num', nf(av, unit)), el('td', 'num', nf(bv, unit)));
      const cls = diff > 0 ? 'num up' : diff < 0 ? 'num down' : 'num';
      tr.append(el('td', cls, diff == null ? '—' : sign(diff) + (unit === '%' ? diff + '%p' : nf(diff, unit))));
      tr.append(el('td', cls, pct == null ? '—' : sign(pct) + pct + '%'));
      tb.append(tr);
    }

    const unit = { outsider: '명', total: '명', spend_k: '천원', search: '건' }[state.metric];
    const series = (m) => of('daily', m).map((d) => ({ d: +d.date.slice(6, 8), v: d[state.metric] }));
    lines2($('#ch-cmp-daily'), series(A), series(B), { la, lb, unit });

    const pair = (key, labelKey, valKey) => {
      const get = (m) => new Map(of(key, m).map((r) => [r[labelKey], r[valKey]]));
      const a = get(A), b = get(B);
      return [...new Set([...a.keys(), ...b.keys()])].map((k) => ({ label: k, a: a.get(k) ?? null, b: b.get(k) ?? null }))
        .sort((p, q) => (q.a ?? -1) - (p.a ?? -1));
    };
    hbars2($('#ch-cmp-cat'), pair('spend_cat', 'cat', 'mw'), { la, lb, fmt: (v) => fmt(v) });
    hbars2($('#ch-cmp-sido'), pair('origin_sido', 'sido', 'pct'), { la, lb, fmt: (v) => v + '%' });
    hbars2($('#ch-cmp-type'), pair('search_type', 'type', 'n'), { la, lb, fmt: (v) => fmt(v) });
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
  $('#cmp-a').addEventListener('change', (e) => { state.a = e.target.value; render(); });
  $('#cmp-b').addEventListener('change', (e) => { state.b = e.target.value; render(); });
  $$('.pre').forEach((b) => b.addEventListener('click', () => { state.b = b.dataset.pre === 'prev' ? prevM(state.a) : yoyM(state.a); render(); }));
  $$('.seg button').forEach((b) => b.addEventListener('click', () => {
    state.metric = b.dataset.m;
    $$('.seg button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
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
