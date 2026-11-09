/* Studio — 접속 통계 대시보드 (Supabase) */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const ROOT = '../';
  const AUTH_KEY = 'studio-supabase';
  const DAY = 864e5;
  const WEEK = ['월', '화', '수', '목', '금', '토', '일'];
  const SECTIONS = [['hero', 'Home', 'home'], ['about', 'About', 'about'], ['works', 'Works', 'works'], ['contact', 'Contact', 'contact']];
  const DEVICES = [['desktop', 'PC'], ['tablet', '태블릿'], ['mobile', '모바일']];
  // 차트 색: 크기 = 파랑 한 가지, 기기 비율만 구분용 3색 (어두운 배경용 단계)
  const C = { bar: '#3987e5', grid: 'rgba(240,240,238,.08)', axis: '#85858b', cat: ['#3987e5', '#d95926', '#199e70'], zero: '#1c1c1c', lo: [24, 79, 149], hi: [134, 182, 239] };

  let cfg = null;
  let auth = null;
  let days = 7;
  let all = [];
  const heat = { section: 'hero', device: 'desktop' };

  const h = (tag, props = {}, ...kids) => {
    const n = Object.assign(document.createElement(tag), props);
    n.append(...kids.filter((k) => k != null && k !== false));
    return n;
  };
  const svgEl = (tag, attrs = {}) => {
    const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
    return n;
  };
  const fmt = (n) => Number(n).toLocaleString('ko-KR');
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const pad = (n) => String(n).padStart(2, '0');

  /* ---------------- 화면 상태 ---------------- */
  function show(which) {
    $('#stats-setup').hidden = which !== 'setup';
    $('#stats-login').hidden = which !== 'login';
    $('#stats-body').hidden = which !== 'body';
    $('#stats-toolbar').hidden = which !== 'body';
  }

  let sqlLoaded = false;
  async function loadSql() {
    if (sqlLoaded) return;
    try {
      $('#stats-sql').value = await (await fetch(ROOT + 'supabase/analytics.sql', { cache: 'no-store' })).text();
      sqlLoaded = true;
    } catch {
      $('#stats-sql').value = '-- 저장소의 supabase/analytics.sql 파일 내용을 붙여넣으세요.';
    }
  }
  $('#stats-sql-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('#stats-sql').value);
      $('#stats-sql-copy').textContent = '복사됨';
    } catch {
      $('#stats-sql').select();
      document.execCommand('copy');
      $('#stats-sql-copy').textContent = '복사됨';
    }
    setTimeout(() => ($('#stats-sql-copy').textContent = '복사'), 1500);
  });

  /* ---------------- Supabase 로그인 ---------------- */
  const base = () => cfg.url.replace(/\/+$/, '');
  function loadAuth() {
    try {
      const a = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null');
      return a && a.url === base() ? a : null;
    } catch {
      return null;
    }
  }
  function saveAuth(a) {
    auth = a;
    try {
      a ? localStorage.setItem(AUTH_KEY, JSON.stringify(a)) : localStorage.removeItem(AUTH_KEY);
    } catch {}
  }
  async function token(grant, body) {
    const res = await fetch(`${base()}/auth/v1/token?grant_type=${grant}`, {
      method: 'POST',
      headers: { apikey: cfg.key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error_description || data.msg || data.message || '로그인에 실패했습니다.');
    return { url: base(), access: data.access_token, refresh: data.refresh_token, exp: Date.now() + (data.expires_in || 3600) * 1000, email: data.user?.email || '' };
  }
  async function ensureToken() {
    if (!auth) return null;
    if (auth.exp - 60000 > Date.now()) return auth.access;
    try {
      saveAuth(await token('refresh_token', { refresh_token: auth.refresh }));
      return auth.access;
    } catch {
      saveAuth(null);
      return null;
    }
  }
  async function api(path) {
    const access = await ensureToken();
    if (!access) {
      show('login');
      throw new Error('다시 로그인해주세요.');
    }
    const res = await fetch(base() + path, { headers: { apikey: cfg.key, Authorization: `Bearer ${access}` }, cache: 'no-store' });
    if (res.status === 401) {
      saveAuth(null);
      show('login');
      throw new Error('로그인이 만료되었습니다.');
    }
    if (!res.ok) throw new Error(`통계를 불러오지 못했습니다 (${res.status}). SQL 설정을 확인해주세요.`);
    return res.json();
  }

  $('#stats-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const btn = $('button[type=submit]', f);
    btn.disabled = true;
    $('#stats-login-error').textContent = '';
    try {
      saveAuth(await token('password', { email: f.email.value.trim(), password: f.password.value }));
      f.password.value = '';
      await refresh();
    } catch (err) {
      $('#stats-login-error').textContent = /invalid/i.test(err.message) ? '이메일 또는 비밀번호가 올바르지 않습니다.' : err.message;
    } finally {
      btn.disabled = false;
    }
  });
  $('#stats-logout').addEventListener('click', () => {
    saveAuth(null);
    show('login');
  });

  /* ---------------- 데이터 ---------------- */
  async function fetchSince(since) {
    const rows = [];
    const cols = 'created_at,visitor,session,type,section,theme,x,y,target,device,referrer';
    for (let offset = 0; offset < 60000; offset += 1000) {
      const page = await api(`/rest/v1/events?select=${cols}&created_at=gte.${encodeURIComponent(since)}&order=created_at.asc&limit=1000&offset=${offset}`);
      rows.push(...page);
      if (page.length < 1000) break;
    }
    return rows.map((r) => ({ ...r, t: new Date(r.created_at) }));
  }

  async function refresh() {
    show('body');
    const btn = $('#stats-refresh');
    btn.disabled = true;
    btn.textContent = '불러오는 중…';
    $('#stats-who').textContent = auth?.email ? `${auth.email} 로그인됨` : '';
    try {
      // 이전 기간과 비교하려고 두 배 기간을 받아옴
      all = await fetchSince(new Date(Date.now() - days * 2 * DAY).toISOString());
      if (!all.length) {
        const admins = await api('/rest/v1/admins?select=email');
        if (!admins.length) {
          $('#stats-sub').textContent = `‘${auth.email}’ 계정이 관리자 목록(admins)에 없어서 기록을 볼 수 없어요. SQL 맨 아래 이메일을 확인해주세요.`;
        }
      }
      render();
    } catch (err) {
      $('#stats-sub').textContent = err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = '새로고침';
    }
  }
  $('#stats-refresh').addEventListener('click', refresh);
  $('#stats-range').addEventListener('click', (e) => {
    const b = e.target.closest('[data-days]');
    if (!b) return;
    days = Number(b.dataset.days);
    $$('#stats-range button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    refresh();
  });

  /* ---------------- 집계 ---------------- */
  function split() {
    const start = Date.now() - days * DAY;
    return { cur: all.filter((e) => +e.t >= start), prev: all.filter((e) => +e.t < start), start };
  }
  function metrics(rows) {
    const views = rows.filter((e) => e.type === 'view');
    return {
      visitors: new Set(views.map((e) => e.visitor)).size,
      sessions: new Set(views.map((e) => e.session)).size,
      views: views.length,
      pdf: rows.filter((e) => e.type === 'pdf').length,
    };
  }
  const countBy = (rows, key) => {
    const m = new Map();
    rows.forEach((r) => {
      const k = typeof key === 'function' ? key(r) : r[key];
      m.set(k, (m.get(k) || 0) + 1);
    });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };

  /* ---------------- 그리기 ---------------- */
  function render() {
    const { cur, prev, start } = split();
    $('#stats-sub').textContent = `최근 ${days}일 · 방문 기록 ${fmt(cur.length)}건. 시간은 이 컴퓨터의 시간대 기준입니다.`;
    renderTiles(metrics(cur), metrics(prev));
    renderDaily(cur, start);
    renderDevices(cur);
    renderReferrers(cur);
    renderHours(cur);
    renderSections(cur);
    renderPdfs(cur);
    renderHeat();
    renderVisits(cur);
  }

  function renderTiles(m, p) {
    const items = [
      ['방문자', m.visitors, p.visitors, '명'],
      ['방문', m.sessions, p.sessions, '회'],
      ['페이지뷰', m.views, p.views, '회'],
      ['PDF 열람', m.pdf, p.pdf, '회'],
    ];
    $('#stats-tiles').replaceChildren(
      ...items.map(([label, v, pv, unit]) => {
        let change;
        if (!pv) change = h('span', { className: 'chg', textContent: v ? `지난 ${days}일 기록 없음` : '' });
        else {
          const d = Math.round(((v - pv) / pv) * 100);
          change = h('span', { className: 'chg ' + (d > 0 ? 'up' : d < 0 ? 'down' : ''), textContent: `${d > 0 ? '+' : ''}${d}% · 지난 ${days}일 대비` });
        }
        return h('div', { className: 'tile' }, h('span', { className: 'tile-label', textContent: label }), h('span', { className: 'tile-value' }, fmt(v), h('small', { textContent: unit })), change);
      })
    );
  }

  function empty(el, msg = '아직 기록이 없어요') {
    el.replaceChildren(h('p', { className: 'empty muted sm', textContent: msg }));
  }
  const niceMax = (v) => {
    if (v <= 4) return 4;
    const p = 10 ** Math.floor(Math.log10(v));
    return [1, 2, 2.5, 5, 10].map((k) => k * p).find((k) => k >= v);
  };

  function renderDaily(cur, start) {
    const el = $('#chart-daily');
    const n = days;
    const day0 = new Date(start);
    day0.setHours(0, 0, 0, 0);
    const buckets = Array.from({ length: n + 1 }, (_, i) => ({ d: new Date(+day0 + i * DAY), v: new Set(), s: new Set() }));
    cur.filter((e) => e.type === 'view').forEach((e) => {
      const i = Math.floor((+e.t - +day0) / DAY);
      if (buckets[i]) {
        buckets[i].v.add(e.visitor);
        buckets[i].s.add(e.session);
      }
    });
    const data = buckets.slice(-n);
    const max = Math.max(...data.map((b) => b.v.size));
    if (!max) return empty(el);
    const W = el.clientWidth || 640;
    const H = 220;
    const m = { l: 32, r: 8, t: 12, b: 24 };
    const iw = W - m.l - m.r;
    const ih = H - m.t - m.b;
    const top = niceMax(max);
    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': `일별 방문자, 최대 ${max}명` });
    [0, top / 2, top].forEach((tv) => {
      const y = m.t + ih - (tv / top) * ih;
      svg.append(svgEl('line', { x1: m.l, x2: W - m.r, y1: y, y2: y, stroke: C.grid }));
      const t = svgEl('text', { x: m.l - 8, y: y + 4, 'text-anchor': 'end', class: 'axis' });
      t.textContent = fmt(tv);
      svg.append(t);
    });
    const band = iw / n;
    const bw = Math.max(2, Math.min(28, band - 2));
    const every = Math.ceil(n / 8);
    data.forEach((b, i) => {
      const v = b.v.size;
      const x = m.l + i * band + (band - bw) / 2;
      const bh = (v / top) * ih;
      const y = m.t + ih - bh;
      if (v) {
        const r = Math.min(4, bw / 2, bh);
        svg.append(svgEl('path', { d: `M${x},${y + bh}V${y + r}Q${x},${y} ${x + r},${y}H${x + bw - r}Q${x + bw},${y} ${x + bw},${y + r}V${y + bh}Z`, fill: C.bar }));
      }
      const label = `${b.d.getMonth() + 1}월 ${b.d.getDate()}일 (${WEEK[(b.d.getDay() + 6) % 7]}) · 방문자 ${v}명 · 방문 ${b.s.size}회`;
      svg.append(svgEl('rect', { x: m.l + i * band, y: m.t, width: band, height: ih, fill: 'transparent', 'data-tip': label }));
      if (i % every === 0 || i === n - 1) {
        const t = svgEl('text', { x: m.l + i * band + band / 2, y: H - 6, 'text-anchor': 'middle', class: 'axis' });
        t.textContent = `${b.d.getMonth() + 1}.${b.d.getDate()}`;
        svg.append(t);
      }
    });
    el.replaceChildren(svg);
    const best = data.reduce((a, b) => (b.v.size > a.v.size ? b : a));
    $('#daily-note').textContent = `가장 많았던 날 ${best.d.getMonth() + 1}월 ${best.d.getDate()}일 · ${best.v.size}명`;
  }

  function renderHours(cur) {
    const el = $('#chart-hours');
    const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
    cur.filter((e) => e.type === 'view').forEach((e) => grid[(e.t.getDay() + 6) % 7][e.t.getHours()]++);
    const max = Math.max(...grid.flat());
    if (!max) return empty(el);
    const W = el.clientWidth || 640;
    const lw = 24;
    const cell = Math.floor((W - lw) / 24);
    const ch = Math.min(cell, 24);
    const H = 7 * ch + 22 + 28;
    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': '요일과 시간대별 방문 수' });
    const mix = (t) => `rgb(${C.lo.map((lo, k) => Math.round(lo + (C.hi[k] - lo) * t)).join(',')})`;
    grid.forEach((row, r) => {
      const t = svgEl('text', { x: 0, y: r * ch + ch / 2 + 4, class: 'axis' });
      t.textContent = WEEK[r];
      svg.append(t);
      row.forEach((v, c) => {
        svg.append(svgEl('rect', {
          x: lw + c * cell + 1, y: r * ch + 1, width: cell - 2, height: ch - 2, rx: 3,
          fill: v ? mix(v / max) : C.zero,
          'data-tip': `${WEEK[r]}요일 ${c}시 · 방문 ${v}회`,
        }));
      });
    });
    [0, 3, 6, 9, 12, 15, 18, 21].forEach((hr) => {
      const t = svgEl('text', { x: lw + hr * cell + 1, y: 7 * ch + 16, class: 'axis' });
      t.textContent = `${hr}시`;
      svg.append(t);
    });
    // 범례: 적음 → 많음
    const ly = 7 * ch + 30;
    const lt = svgEl('text', { x: W - 5 * 18 - 40, y: ly + 10, 'text-anchor': 'end', class: 'axis' });
    lt.textContent = '적음';
    svg.append(lt);
    [0, 0.25, 0.5, 0.75, 1].forEach((t, i) => svg.append(svgEl('rect', { x: W - 5 * 18 - 34 + i * 18, y: ly, width: 16, height: 12, rx: 3, fill: mix(t) })));
    const ht = svgEl('text', { x: W - 30, y: ly + 10, class: 'axis' });
    ht.textContent = '많음';
    svg.append(ht);
    el.replaceChildren(svg);
  }

  function rankList(el, rows, total, fmtValue) {
    if (!rows.length) return empty(el);
    const max = Math.max(...rows.map((r) => r[1]));
    el.replaceChildren(
      ...rows.map(([label, v]) => {
        const li = h('li', {}, h('span', { className: 'rank-label', textContent: label, title: label }), h('span', { className: 'rank-value', textContent: fmtValue ? fmtValue(v) : fmt(v) }), h('i', { className: 'rank-bar' }));
        li.querySelector('.rank-bar').style.setProperty('--w', (v / (total || max)) * 100 + '%');
        return li;
      })
    );
  }

  function renderDevices(cur) {
    const el = $('#chart-device');
    const sessions = new Map();
    cur.filter((e) => e.type === 'view').forEach((e) => sessions.set(e.session, e.device || 'desktop'));
    const total = sessions.size;
    if (!total) return empty(el);
    const counts = DEVICES.map(([k, label], i) => ({ k, label, v: [...sessions.values()].filter((d) => d === k).length, color: C.cat[i] })).filter((d) => d.v);
    const bar = h('div', { className: 'segbar', role: 'img', ariaLabel: counts.map((d) => `${d.label} ${pct(d.v, total)}%`).join(', ') });
    counts.forEach((d) => {
      const s = h('i');
      s.style.flex = d.v;
      s.style.background = d.color;
      s.dataset.tip = `${d.label} · ${d.v}회 (${pct(d.v, total)}%)`;
      bar.append(s);
    });
    const legend = h('ul', { className: 'legend' }, ...counts.map((d) => {
      const sw = h('i');
      sw.style.background = d.color;
      return h('li', {}, sw, h('span', { textContent: d.label }), h('b', { textContent: `${pct(d.v, total)}%` }));
    }));
    el.replaceChildren(bar, legend);
  }

  function renderReferrers(cur) {
    const rows = countBy(cur.filter((e) => e.type === 'view'), (e) => e.referrer || '직접 방문 · 북마크').slice(0, 6);
    rankList($('#list-referrer'), rows);
  }

  function renderSections(cur) {
    const sessions = new Set(cur.filter((e) => e.type === 'view').map((e) => e.session));
    const reached = new Map(SECTIONS.map(([k]) => [k, new Set()]));
    cur.filter((e) => e.type === 'section' && reached.has(e.section)).forEach((e) => reached.get(e.section).add(e.session));
    const total = sessions.size;
    if (!total) return empty($('#list-sections'));
    rankList($('#list-sections'), SECTIONS.map(([k, label]) => [label, Math.min(reached.get(k).size, total)]), total, (v) => `${pct(v, total)}% · ${fmt(v)}회`);
  }

  function renderPdfs(cur) {
    rankList($('#list-pdfs'), countBy(cur.filter((e) => e.type === 'pdf' && e.target), 'target').slice(0, 8), 0, (v) => `${fmt(v)}회`);
  }

  function renderVisits(cur) {
    const bySession = new Map();
    cur.forEach((e) => {
      if (!bySession.has(e.session)) bySession.set(e.session, { t: e.t, device: null, ref: null, sections: [], pdfs: [], clicks: 0 });
      const s = bySession.get(e.session);
      if (e.type === 'view') Object.assign(s, { t: e.t, device: e.device, ref: e.referrer });
      if (e.type === 'section' && !s.sections.includes(e.section)) s.sections.push(e.section);
      if (e.type === 'pdf' && e.target && !s.pdfs.includes(e.target)) s.pdfs.push(e.target);
      if (e.type === 'click') s.clicks++;
    });
    const rows = [...bySession.values()].sort((a, b) => b.t - a.t).slice(0, 30);
    const tbody = $('#table-visits');
    if (!rows.length) return tbody.replaceChildren(h('tr', {}, h('td', { colSpan: 6, className: 'muted', textContent: '아직 기록이 없어요' })));
    const label = Object.fromEntries(SECTIONS.map(([k, l]) => [k, l]));
    const dev = Object.fromEntries(DEVICES);
    tbody.replaceChildren(
      ...rows.map((s) =>
        h(
          'tr', {},
          h('td', { className: 'num', textContent: `${s.t.getMonth() + 1}.${s.t.getDate()} ${pad(s.t.getHours())}:${pad(s.t.getMinutes())}` }),
          h('td', { textContent: dev[s.device] || '—' }),
          h('td', { textContent: s.ref || '직접 방문' }),
          h('td', { textContent: s.sections.map((k) => label[k] || k).join(' → ') || '—' }),
          h('td', { textContent: s.pdfs.join(', ') || '—' }),
          h('td', { className: 'num', textContent: fmt(s.clicks) })
        )
      )
    );
  }

  /* ---------------- 클릭 히트맵 ---------------- */
  const REF = { desktop: [1440, 900], mobile: [390, 844] };
  function heatClicks() {
    const { cur } = split();
    return cur.filter((e) => e.type === 'click' && e.section === heat.section && (heat.device === 'mobile' ? e.device === 'mobile' : e.device !== 'mobile') && e.x != null && e.y != null);
  }
  function setSeg(id, value) {
    $$(`#${id} button`).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === value)));
  }
  let lastSrc = '';
  function renderHeat() {
    setSeg('heat-section', heat.section);
    setSeg('heat-device', heat.device);
    const [rw, rh] = REF[heat.device];
    const stage = $('#heat-stage');
    const frame = $('#heat-frame');
    const canvas = $('#heat-canvas');
    const width = Math.min(stage.parentElement.clientWidth - (window.innerWidth > 1100 ? 280 : 0), heat.device === 'mobile' ? 320 : 9999);
    const scale = width / rw;
    stage.style.width = width + 'px';
    stage.style.height = rh * scale + 'px';
    [frame, canvas].forEach((n) => {
      n.style.width = rw + 'px';
      n.style.height = rh + 'px';
      n.style.transform = `scale(${scale})`;
    });
    const id = SECTIONS.find(([k]) => k === heat.section)[2];
    const src = `${ROOT}?embed=1#${id}`;
    if (src !== lastSrc) {
      frame.src = src;
      lastSrc = src;
    }
    canvas.width = rw;
    canvas.height = rh;
    const clicks = heatClicks();
    $('#heat-count').textContent = clicks.length ? `클릭 ${fmt(clicks.length)}회` : '이 화면의 클릭 기록이 아직 없어요';
    drawHeat(canvas, clicks, rw, rh);
    rankList($('#list-targets'), countBy(clicks.filter((c) => c.target), 'target').slice(0, 8), 0, (v) => `${fmt(v)}회`);
  }
  function drawHeat(canvas, clicks, w, hgt) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, hgt);
    if (!clicks.length) return;
    // 1) 밀도를 투명도로 쌓고  2) 투명도를 주황 한 가지 색의 진하기로 바꿈
    const off = document.createElement('canvas');
    off.width = w;
    off.height = hgt;
    const o = off.getContext('2d');
    const r = w > 1000 ? 40 : 28;
    const a = Math.max(0.06, Math.min(0.45, 8 / clicks.length));
    clicks.forEach((c) => {
      const x = c.x * w;
      const y = c.y * hgt;
      const g = o.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(0,0,0,${a})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      o.fillStyle = g;
      o.fillRect(x - r, y - r, r * 2, r * 2);
    });
    const img = o.getImageData(0, 0, w, hgt);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const t = d[i + 3] / 255;
      if (!t) continue;
      // 주황 #d95926 → 밝은 주황 #ffcfa3, 많을수록 밝고 진하게
      d[i] = 217 + (255 - 217) * t;
      d[i + 1] = 89 + (207 - 89) * t;
      d[i + 2] = 38 + (163 - 38) * t;
      d[i + 3] = Math.min(235, 60 + t * 300);
    }
    ctx.putImageData(img, 0, 0);
  }
  [['heat-section', 'section'], ['heat-device', 'device']].forEach(([id, key]) =>
    $('#' + id).addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]');
      if (!b) return;
      heat[key] = b.dataset.v;
      renderHeat();
    })
  );

  /* ---------------- 툴팁 · 크기 변경 ---------------- */
  const tip = $('#stats-tip');
  document.addEventListener('pointermove', (e) => {
    const t = e.target.closest?.('#stats-body [data-tip]');
    if (!t) return (tip.hidden = true);
    tip.textContent = t.getAttribute('data-tip');
    tip.hidden = false;
    const x = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
    tip.style.transform = `translate(${x}px, ${e.clientY + 14}px)`;
  });
  let rt;
  window.addEventListener('resize', () => {
    if ($('#stats-body').hidden || !all) return;
    clearTimeout(rt);
    rt = setTimeout(render, 200);
  });

  /* ---------------- 집계 제외 스위치 ---------------- */
  const notrack = $('#stats-notrack');
  notrack.addEventListener('change', () => {
    try {
      localStorage.setItem('pf-notrack', notrack.checked ? '1' : '0');
    } catch {}
  });

  /* ---------------- 시작 ---------------- */
  window.StudioStats = {
    open(c) {
      try {
        notrack.checked = localStorage.getItem('pf-notrack') === '1';
      } catch {}
      loadSql();
      cfg = c?.url && c?.key ? c : null;
      if (!cfg) return show('setup');
      auth = loadAuth();
      if (!auth) return show('login');
      refresh();
    },
  };
})();
