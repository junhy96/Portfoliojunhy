/* Studio — 접속 통계 대시보드 (Supabase) */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const ROOT = '../';
  const AUTH_KEY = 'studio-supabase';
  const DAY = 864e5;
  const WEEK = ['월', '화', '수', '목', '금', '토', '일'];
  const SECTIONS = [['hero', 'Home', 'home'], ['about', 'About', 'about'], ['timeline', 'Timeline', 'timeline'], ['skills', 'Skills', 'skills'], ['works', 'Works', 'works'], ['contact', 'Contact', 'contact']];
  const DEVICES = [['desktop', 'PC'], ['tablet', '태블릿'], ['mobile', '모바일']];
  // 차트 색: 크기 = 사이트 강조 색(연두) 한 가지, 기기 비율만 구분용 3색 (어두운 배경용 단계)
  const C = { bar: '#90de93', grid: 'rgba(244,244,239,.08)', axis: '#85857f', cat: ['#90de93', '#d95926', '#3987e5'], zero: '#202020', lo: [34, 74, 40], hi: [168, 236, 171] }; // 사이트 강조 색 #90DE93 기준

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

  $('#dwell-sql-copy')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    try {
      const sql = await (await fetch(ROOT + 'supabase/analytics-dwell.sql', { cache: 'no-store' })).text();
      await navigator.clipboard.writeText(sql);
      btn.textContent = '복사됨';
    } catch {
      btn.textContent = '복사 실패 — supabase/analytics-dwell.sql 파일을 열어 복사해주세요';
    }
    setTimeout(() => (btn.textContent = 'SQL 복사'), 2500);
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
  // 체류 시간 칸(dur·page·pages)이 아직 없는 Supabase면 그 칸 없이 다시 받아옴
  let dwellReady = true;
  async function fetchSince(since) {
    const cols = 'created_at,visitor,session,type,section,theme,x,y,target,device,referrer';
    try {
      const rows = await fetchRows(since, cols + ',dur,page,pages');
      dwellReady = true;
      return rows;
    } catch (err) {
      if (!/\(400\)/.test(err.message)) throw err;
      dwellReady = false;
      return fetchRows(since, cols);
    }
  }
  async function fetchRows(since, cols) {
    const rows = [];
    for (let offset = 0; offset < 60000; offset += 1000) {
      const page = await api(`/rest/v1/events?select=${cols}&created_at=gte.${encodeURIComponent(since)}&order=created_at.asc&limit=1000&offset=${offset}`);
      rows.push(...page);
      if (page.length < 1000) break;
    }
    return rows.map((r) => ({ ...r, t: new Date(r.created_at) }));
  }

  /* ---------------- 로그인 없이 보는 예시 기록 ---------------- */
  let demo = false;
  async function demoRows() {
    let site = { projects: [] };
    try {
      site = await (await fetch(ROOT + 'data/site.json', { cache: 'no-store' })).json();
    } catch {}
    const titles = (site.projects || []).filter((p) => p.visible !== false).map((p) => p.title);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const now = Date.now();
    const rows = [];
    const tags = [null, null, null, 'A게임사', 'B게임사', 'C게임사', 'D게임사']; // 예시: 실제 회사 이름은 쓰지 않음
    const refs = [null, null, 'linkedin.com', 'notion.so', 'saramin.co.kr', 'wanted.co.kr'];
    const hero = [['05포트폴리오→', 0.5, 0.51], ['04툴 · 스킬→', 0.64, 0.51], ['03연혁→', 0.77, 0.51], ['PDF이력서↓', 0.9, 0.51], ['05Works', 0.76, 0.05]];
    for (let s = 0; s < 120; s++) {
      const t0 = now - rnd() * days * 2 * DAY;
      const session = 'demo-s' + s;
      const visitor = 'demo-v' + Math.floor(s * 0.8);
      const device = rnd() < 0.72 ? 'desktop' : rnd() < 0.8 ? 'mobile' : 'tablet';
      const base = { visitor, session, device, theme: 'editorial', x: null, y: null, target: null, referrer: null, dur: null, page: null, pages: null };
      let t = t0;
      const add = (o) => rows.push({ ...base, ...o, created_at: new Date((t += 2000 + rnd() * 20000)).toISOString() });
      add({ type: 'view', section: 'hero', target: pick(tags), referrer: pick(refs) });
      const depth = 1 + Math.floor(rnd() * 6);
      ['hero', 'about', 'timeline', 'skills', 'works', 'contact'].slice(0, depth).forEach((sec) => add({ type: 'section', section: sec }));
      for (let k = 0; k < 1 + Math.floor(rnd() * 3); k++) {
        const [target, x, y] = pick(hero);
        add({ type: 'click', section: 'hero', target, x: x + (rnd() - 0.5) * 0.06, y: y + (rnd() - 0.5) * 0.06 });
      }
      if (depth >= 5 && titles.length) {
        for (let k = 0; k < 1 + Math.floor(rnd() * 3); k++) {
          const ti = Math.min(titles.length - 1, Math.floor(Math.pow(rnd(), 1.8) * titles.length));
          add({ type: 'click', section: 'works', target: '작업: ' + titles[ti], x: 0.2 + (ti % 4) * 0.2 + (rnd() - 0.5) * 0.05, y: 0.45 + (rnd() - 0.5) * 0.2 });
          add({ type: 'pdf', section: 'works', target: titles[ti] });
          const pages = 10 + Math.floor(rnd() * 30);
          add({ type: 'read', section: 'works', target: titles[ti], dur: Math.round(20 + rnd() * rnd() * 400), page: Math.ceil(pages * (0.2 + rnd() * 0.8)), pages });
        }
      }
    }
    return rows.map((r) => ({ ...r, t: new Date(r.created_at) })).sort((a, b) => a.t - b.t);
  }
  $('#stats-demo').addEventListener('click', () => {
    demo = true;
    refresh();
  });
  $('#stats-demo-exit').addEventListener('click', () => {
    demo = false;
    $('#stats-demo-banner').hidden = true;
    show(cfg ? 'login' : 'setup');
  });

  async function refresh() {
    $('#stats-demo-banner').hidden = !demo;
    $('#stats-logout').hidden = demo;
    if (demo) {
      show('body');
      dwellReady = true;
      all = await demoRows();
      $('#stats-who').textContent = '';
      render();
      $('#stats-sub').textContent = `예시 데이터 · 최근 ${days}일. 실제 방문 기록이 아니에요.`;
      return;
    }
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
      if (pulseCfg) pulse(); // 방금 로그인했다면 위쪽 방문자 수도 바로 채움
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
  // 체류 시간: 61 → '1분 1초'
  const fmtDur = (sec) => {
    sec = Math.round(sec || 0);
    if (sec < 60) return `${sec}초`;
    if (sec < 3600) return `${Math.floor(sec / 60)}분${sec % 60 ? ` ${sec % 60}초` : ''}`;
    return `${Math.floor(sec / 3600)}시간${Math.floor((sec % 3600) / 60) ? ` ${Math.floor((sec % 3600) / 60)}분` : ''}`;
  };
  // 방문(세션) × 기획서마다 체류 시간 합 · 가장 뒤로 넘긴 쪽
  function readsOf(rows) {
    const m = new Map();
    rows.filter((e) => e.type === 'read' && e.target).forEach((e) => {
      const k = e.session + '\u0000' + e.target;
      if (!m.has(k)) m.set(k, { session: e.session, title: e.target, sec: 0, page: 0, pages: 0 });
      const r = m.get(k);
      r.sec += e.dur || 0;
      r.page = Math.max(r.page, e.page || 0);
      r.pages = Math.max(r.pages, e.pages || 0);
    });
    return [...m.values()];
  }
  const readKey = (session, title) => session + '\u0000' + title;

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
    renderDwell(cur);
    renderHeat();
    renderSources(cur);
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

  function renderDwell(cur) {
    const tbody = $('#table-dwell');
    const note = $('#dwell-setup');
    note.hidden = dwellReady;
    if (!dwellReady) return tbody.replaceChildren(h('tr', {}, h('td', { colSpan: 6, className: 'muted', textContent: '체류 시간 칸이 아직 없어요. 위 안내대로 SQL을 한 번 실행하면 그때부터 쌓여요' })));
    const reads = readsOf(cur);
    // 연 횟수는 'pdf'(연 기록) 기준, 체류는 'read' 기준
    const opens = new Map();
    cur.filter((e) => e.type === 'pdf' && e.target).forEach((e) => {
      if (!opens.has(e.target)) opens.set(e.target, new Set());
      opens.get(e.target).add(e.session);
    });
    const by = new Map();
    reads.forEach((r) => {
      if (!by.has(r.title)) by.set(r.title, { sessions: new Set(), readers: new Set(), sec: 0, depth: [], done: 0 });
      const g = by.get(r.title);
      g.sessions.add(r.session);
      g.readers.add(r.session);
      g.sec += r.sec;
      if (r.pages) {
        g.depth.push(Math.min(1, r.page / r.pages));
        if (r.page >= r.pages) g.done++;
      }
    });
    opens.forEach((set, title) => {
      if (!by.has(title)) by.set(title, { sessions: new Set(), readers: new Set(), sec: 0, depth: [], done: 0 });
      set.forEach((s) => by.get(title).sessions.add(s));
    });
    const rows = [...by.entries()].sort((a, b) => b[1].sec - a[1].sec || b[1].sessions.size - a[1].sessions.size);
    if (!rows.length) return tbody.replaceChildren(h('tr', {}, h('td', { colSpan: 6, className: 'muted', textContent: '아직 기록이 없어요. 사이트에서 기획서를 열어 보면 그때부터 쌓여요' })));
    const max = Math.max(1, ...rows.map(([, g]) => g.sec));
    tbody.replaceChildren(
      ...rows.map(([title, g]) => {
        const n = g.sessions.size;
        const depth = g.depth.length ? Math.round((g.depth.reduce((a, b) => a + b, 0) / g.depth.length) * 100) : null;
        const bar = h('i', { className: 'dwell-bar' });
        bar.style.setProperty('--w', (g.sec / max) * 100 + '%');
        return h(
          'tr', {},
          h('td', { className: 'dwell-title', textContent: title, title }),
          h('td', { className: 'num', textContent: fmt(n) }),
          // 평균은 체류 기록이 있는 방문만으로 (체류 기록을 모으기 전에 연 방문은 빼고)
          h('td', { className: 'num strong', textContent: g.readers.size && g.sec ? fmtDur(g.sec / g.readers.size) : '—' }),
          h('td', { className: 'dwell-total' }, h('span', { className: 'num', textContent: g.sec ? fmtDur(g.sec) : '—' }), bar),
          h('td', { className: 'num', textContent: depth == null ? '—' : `${depth}%` }),
          h('td', { className: 'num', textContent: g.depth.length ? `${fmt(g.done)} / ${fmt(g.depth.length)}` : '—' })
        );
      })
    );
  }

  function renderVisits(cur) {
    const readTime = new Map(readsOf(cur).map((r) => [readKey(r.session, r.title), r.sec]));
    const bySession = new Map();
    cur.forEach((e) => {
      if (!bySession.has(e.session)) bySession.set(e.session, { id: e.session, t: e.t, device: null, ref: null, tag: null, sections: [], pdfs: [], clicks: 0 });
      const s = bySession.get(e.session);
      if (e.type === 'view') Object.assign(s, { t: e.t, device: e.device, ref: e.referrer, tag: e.target });
      if (e.type === 'section' && !s.sections.includes(e.section)) s.sections.push(e.section);
      if (e.type === 'pdf' && e.target && !s.pdfs.includes(e.target)) s.pdfs.push(e.target);
      if (e.type === 'click') s.clicks++;
    });
    const rows = [...bySession.values()].sort((a, b) => b.t - a.t).slice(0, 30);
    const tbody = $('#table-visits');
    if (!rows.length) return tbody.replaceChildren(h('tr', {}, h('td', { colSpan: 7, className: 'muted', textContent: '아직 기록이 없어요' })));
    const label = Object.fromEntries(SECTIONS.map(([k, l]) => [k, l]));
    const dev = Object.fromEntries(DEVICES);
    tbody.replaceChildren(
      ...rows.map((s) =>
        h(
          'tr', {},
          h('td', { className: 'num', textContent: `${s.t.getMonth() + 1}.${s.t.getDate()} ${pad(s.t.getHours())}:${pad(s.t.getMinutes())}` }),
          h('td', { className: s.tag ? 'tag' : '', textContent: s.tag || '—' }),
          h('td', { textContent: dev[s.device] || '—' }),
          h('td', { textContent: s.ref || '직접 방문' }),
          h('td', { textContent: s.sections.map((k) => label[k] || k).join(' → ') || '—' }),
          h('td', { textContent: s.pdfs.map((t) => (readTime.get(readKey(s.id, t)) ? `${t} (${fmtDur(readTime.get(readKey(s.id, t)))})` : t)).join(', ') || '—' }),
          h('td', { className: 'num', textContent: fmt(s.clicks) })
        )
      )
    );
  }

  function renderSources(cur) {
    // 방문(세션)마다 꼬리표를 붙이고, 같은 방문에서 연 PDF를 모음
    const tagOf = new Map();
    cur.filter((e) => e.type === 'view' && e.target).forEach((e) => tagOf.set(e.session, e.target));
    const groups = new Map();
    tagOf.forEach((tag, session) => {
      if (!groups.has(tag)) groups.set(tag, { visitors: new Set(), sessions: new Set(), pdf: 0, pdfs: new Set(), sec: 0, read: new Map(), last: null });
      groups.get(tag).sessions.add(session);
    });
    cur.forEach((e) => {
      const tag = tagOf.get(e.session);
      if (!tag) return;
      const g = groups.get(tag);
      if (e.type === 'view') {
        g.visitors.add(e.visitor);
        if (!g.last || e.t > g.last) g.last = e.t;
      }
      if (e.type === 'pdf') {
        g.pdf++;
        if (e.target) g.pdfs.add(e.target);
      }
      if (e.type === 'read' && e.target) {
        g.sec += e.dur || 0;
        g.read.set(e.target, (g.read.get(e.target) || 0) + (e.dur || 0));
      }
    });
    const rows = [...groups.entries()].sort((a, b) => b[1].last - a[1].last);
    const tbody = $('#table-sources');
    if (!rows.length) return tbody.replaceChildren(h('tr', {}, h('td', { colSpan: 7, className: 'muted', textContent: '아직 꼬리표 링크로 들어온 방문이 없어요. 위 ‘지원처별 링크 만들기’로 링크를 만들어 지원서에 넣어보세요' })));
    tbody.replaceChildren(
      ...rows.map(([tag, g]) =>
        h(
          'tr', {},
          h('td', { className: 'tag', textContent: tag }),
          h('td', { className: 'num', textContent: fmt(g.visitors.size) }),
          h('td', { className: 'num', textContent: fmt(g.sessions.size) }),
          h('td', { className: 'num', textContent: fmt(g.pdf) }),
          h('td', { className: 'num', textContent: dwellReady && g.sec ? fmtDur(g.sec) : '—' }),
          h('td', { textContent: [...g.pdfs].map((t) => (g.read.get(t) ? `${t} (${fmtDur(g.read.get(t))})` : t)).join(', ') || '—' }),
          h('td', { className: 'num', textContent: `${g.last.getMonth() + 1}.${g.last.getDate()} ${pad(g.last.getHours())}:${pad(g.last.getMinutes())}` })
        )
      )
    );
  }

  /* ---------------- 지원처별 링크 만들기 ---------------- */
  const SITE_URL = new URL('../', location.href).href;
  const cleanTag = (raw) => String(raw || '').trim().toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  const tagName = $('#tag-name');
  const tagLink = $('#tag-link');
  const tagCopy = $('#tag-copy');
  const updateLink = () => {
    const tag = cleanTag(tagName.value);
    tagLink.value = tag ? `${SITE_URL}?from=${encodeURIComponent(tag)}` : '';
    tagLink.placeholder = `${SITE_URL}?from=…`;
    tagCopy.disabled = !tag;
  };
  tagName.addEventListener('input', updateLink);
  updateLink();
  tagCopy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(tagLink.value);
    } catch {
      tagLink.select();
      document.execCommand('copy');
    }
    tagCopy.textContent = '복사됨';
    setTimeout(() => (tagCopy.textContent = '복사'), 1500);
  });
  const memo = $('#tag-memo');
  try {
    memo.value = localStorage.getItem('studio-tag-memo') || '';
  } catch {}
  memo.addEventListener('input', () => {
    try {
      localStorage.setItem('studio-tag-memo', memo.value);
    } catch {}
  });

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
    paintHeat();
    rankList($('#list-targets'), countBy(clicks.filter((c) => c.target), 'target').slice(0, 8), 0, (v) => `${fmt(v)}회`);
  }

  /**
   * 점 찍을 자리
   * - 버튼·카드·링크를 누른 클릭: 미리보기(같은 사이트) 안에서 이름이 같은 요소를 찾아 그 위에 찍음
   *   → 방문자 화면 크기가 달라도 실제로 누른 버튼 위에 모임
   * - 빈 곳을 누른 클릭: 방문자 화면에서의 비율 그대로
   */
  function describeEl(el) {
    const card = el.closest('.work-card');
    if (card) return ('작업: ' + (card.querySelector('.card-title, .px-tile-name, .ed-post-head b')?.textContent || card.getAttribute('aria-label') || '')).slice(0, 120);
    const text = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim();
    return (text || el.tagName.toLowerCase()).slice(0, 120);
  }
  function targetBoxes(w, hgt) {
    const boxes = new Map();
    let doc;
    try {
      doc = $('#heat-frame').contentDocument;
    } catch {}
    if (!doc?.body) return boxes;
    doc.querySelectorAll('.work-card, a, button, [data-go], [role="button"]').forEach((el) => {
      const label = describeEl(el);
      if (boxes.has(label)) return;
      const r = el.getBoundingClientRect();
      const cs = doc.defaultView.getComputedStyle(el);
      if (r.width < 2 || r.height < 2 || cs.visibility === 'hidden' || cs.display === 'none') return;
      if (r.right < 0 || r.bottom < 0 || r.left > w || r.top > hgt) return; // 미리보기 화면 밖
      boxes.set(label, r);
    });
    return boxes;
  }
  // 같은 요소를 누른 클릭들이 한 점에 겹치지 않게 요소 안에서 조금씩 흩음 (클릭마다 늘 같은 자리)
  const spread = (seed) => {
    let h = 2166136261;
    for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return [((h >>> 0) % 1000) / 1000, ((h >>> 10) % 1000) / 1000];
  };
  function paintHeat() {
    const [w, hgt] = REF[heat.device];
    const boxes = targetBoxes(w, hgt);
    const pts = heatClicks().map((c, i) => {
      const b = c.target && boxes.get(c.target);
      if (!b) return { x: c.x * w, y: c.y * hgt };
      const [u, v] = spread(c.session + c.created_at + i);
      return { x: b.left + b.width * (0.3 + u * 0.4), y: b.top + b.height * (0.3 + v * 0.4) };
    });
    drawHeat($('#heat-canvas'), pts, w, hgt);
  }
  // 미리보기가 다 그려진 뒤(등장 애니메이션 포함) 버튼 위치에 맞춰 다시 찍음
  //   (미리보기는 불러온 뒤에 내용을 채우므로 몇 번 나눠서 다시 찍음)
  let paintTimers = [];
  $('#heat-frame').addEventListener('load', () => {
    paintTimers.forEach(clearTimeout);
    paintTimers = [700, 1600, 3000, 5000].map((ms) => setTimeout(paintHeat, ms));
  });

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
      const { x, y } = c;
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

  /* ---------------- 위쪽 막대: 서버 상태 · 오늘/누적 방문자 ---------------- */
  // 1분마다: 사이트(GitHub Pages)가 열리는지, 통계 서버(Supabase)가 답하는지, 방문자 수
  const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  function setDot(id, state, label) {
    const n = $('#' + id);
    if (!n) return;
    n.dataset.state = state;
    n.title = label;
  }
  async function ping(url, opts) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8000);
    try {
      const res = await fetch(url, { cache: 'no-store', signal: ctl.signal, ...opts });
      return res.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
  async function visitorCounts() {
    const seen = new Set();
    const today = new Set();
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    for (let offset = 0; offset < 200000; offset += 1000) {
      const page = await api(`/rest/v1/events?select=visitor,created_at&type=eq.view&order=created_at.asc&limit=1000&offset=${offset}`);
      page.forEach((r) => {
        seen.add(r.visitor);
        if (new Date(r.created_at) >= midnight) today.add(r.visitor);
      });
      if (page.length < 1000) break;
    }
    return { today: today.size, total: seen.size };
  }
  let pulseCfg = null;
  let pulseTimer = null;
  async function pulse() {
    const t = hhmm(new Date());
    const siteOk = await ping(ROOT + 'index.html?ping=' + Date.now(), { method: 'HEAD' });
    setDot('pulse-site', siteOk ? 'ok' : 'down', siteOk ? `사이트 정상 · ${t} 확인` : `사이트가 열리지 않아요 · ${t} 확인`);
    const c = pulseCfg;
    if (!c) {
      setDot('pulse-db', 'off', '통계 서버가 설정되지 않았어요 (사이트 설정 → 접속 통계)');
      return;
    }
    const dbOk = await ping(c.url.replace(/\/+$/, '') + '/auth/v1/health', { headers: { apikey: c.key } });
    setDot('pulse-db', dbOk ? 'ok' : 'down', dbOk ? `통계 서버(Supabase) 정상 · ${t} 확인` : `통계 서버(Supabase)가 답하지 않아요 · ${t} 확인`);
    const today = $('#pulse-today b');
    const total = $('#pulse-total b');
    if (!dbOk) return;
    cfg ||= c;
    auth ||= loadAuth();
    if (!auth) {
      today.textContent = total.textContent = '–';
      $('#pulse-today').title = $('#pulse-total').title = '접속 통계 탭에서 로그인하면 방문자 수가 보여요';
      return;
    }
    try {
      const n = await visitorCounts();
      today.textContent = fmt(n.today);
      total.textContent = fmt(n.total);
      $('#pulse-today').title = `오늘(자정 이후) 들어온 방문자 ${fmt(n.today)}명 · ${t} 기준`;
      $('#pulse-total').title = `지금까지 들어온 방문자 ${fmt(n.total)}명 · ${t} 기준`;
    } catch {}
  }

  /* ---------------- 시작 ---------------- */
  window.StudioStats = {
    // 운영툴에 들어오면 바로, 그 뒤 1분마다 (창이 보일 때만)
    pulse(c) {
      pulseCfg = c?.url && c?.key ? c : null;
      pulse();
      clearInterval(pulseTimer);
      pulseTimer = setInterval(() => document.visibilityState === 'visible' && pulse(), 60000);
    },
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
