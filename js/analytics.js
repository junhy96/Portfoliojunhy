/**
 * 접속 기록 (Supabase)
 * - 방문, 본 섹션, 클릭 위치(화면 비율), 연 PDF를 모아서 5초마다 한 번에 보냄
 * - 이름·IP 같은 개인정보는 보내지 않음. 브라우저마다 무작위 ID만 사용
 * - 관리자 본인 브라우저, 추적 거부(Do Not Track) 설정, 관리자 미리보기(?embed)는 기록하지 않음
 */
const COLUMNS = ['visitor', 'session', 'type', 'section', 'theme', 'x', 'y', 'target', 'device', 'vw', 'vh', 'referrer', 'lang', 'tz'];
const MAX_CLICKS = 300;
const TAG_KEY = 'pf-from';

/**
 * 지원처 꼬리표: 주소의 ?from=nexon (또는 utm_source)
 * 한 번 꼬리표 링크로 들어온 브라우저는 나중에 그냥 들어와도 같은 지원처로 집계
 */
export function cleanTag(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}
function sourceTag() {
  const q = new URLSearchParams(location.search);
  const now = cleanTag(q.get('from') || q.get('utm_source'));
  try {
    if (now) localStorage.setItem(TAG_KEY, now);
    return now || localStorage.getItem(TAG_KEY) || null;
  } catch {
    return now || null;
  }
}

function randomId() {
  return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
}
function storedId(key, storage) {
  try {
    let v = storage.getItem(key);
    if (!v) storage.setItem(key, (v = randomId()));
    return v;
  } catch {
    return randomId();
  }
}
const round = (n) => Math.round(Math.min(1, Math.max(0, n)) * 10000) / 10000;

// 무엇을 눌렀는지 사람이 읽을 수 있는 짧은 이름
function describe(target) {
  if (!(target instanceof Element)) return null;
  const card = target.closest('.work-card');
  if (card) return ('작업: ' + (card.querySelector('.card-title, .px-tile-name, .ed-post-head b')?.textContent || card.getAttribute('aria-label') || '')).slice(0, 120);
  const el = target.closest('a, button, [data-go], [role="button"]');
  if (!el) return null;
  const text = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim();
  return (text || el.tagName.toLowerCase()).slice(0, 120);
}

export function initAnalytics(cfg) {
  if (!cfg?.url || !cfg?.key) return;
  if (new URLSearchParams(location.search).has('embed')) return;
  try {
    if (localStorage.getItem('pf-notrack') === '1') return;
  } catch {}
  if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true) return;

  const endpoint = cfg.url.replace(/\/+$/, '') + '/rest/v1/events';
  const visitor = storedId('pf-vid', localStorage);
  const session = storedId('pf-sid', sessionStorage);
  const device = innerWidth < 640 ? 'mobile' : innerWidth < 1024 ? 'tablet' : 'desktop';
  const queue = [];

  const push = (row) => {
    const full = { visitor, session, device, theme: document.documentElement.dataset.theme || null, section: document.body.dataset.section || null, vw: innerWidth, vh: innerHeight, ...row };
    // 여러 줄을 한 번에 넣으려면 모든 줄의 항목이 같아야 함
    queue.push(Object.fromEntries(COLUMNS.map((c) => [c, full[c] ?? null])));
    if (queue.length >= 25) flush();
  };
  function flush() {
    if (!queue.length) return;
    const rows = queue.splice(0);
    fetch(endpoint, {
      method: 'POST',
      keepalive: true,
      headers: { apikey: cfg.key, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(rows),
    }).catch(() => {});
  }
  setInterval(flush, 5000);
  addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
  addEventListener('pagehide', flush);

  // 방문
  let referrer = null;
  try {
    const r = document.referrer && new URL(document.referrer);
    if (r && r.host !== location.host) referrer = r.host.replace(/^www\./, '');
  } catch {}
  // 방문 기록의 target 칸에 지원처 꼬리표를 담음 (방문 기록에서는 비어 있던 칸)
  push({ type: 'view', referrer, target: sourceTag(), lang: navigator.language || null, tz: Intl.DateTimeFormat().resolvedOptions().timeZone || null });

  // 본 섹션 (세션마다 섹션당 한 번)
  const seen = new Set();
  const onSection = () => {
    const s = document.body.dataset.section;
    if (s && !seen.has(s)) {
      seen.add(s);
      push({ type: 'section' });
    }
  };
  new MutationObserver(onSection).observe(document.body, { attributes: true, attributeFilter: ['data-section'] });

  // 클릭 위치 (PDF 뷰어 안의 클릭은 제외)
  // 누른 자리에서 거의 움직이지 않고 뗀 것만 클릭으로 셈 — 드래그·스와이프(페이지 넘기기, Works 가로 밀기)는 빼서 히트맵에 섞이지 않게
  let clicks = 0;
  let down = null;
  addEventListener(
    'pointerdown',
    (e) => {
      down = e.button > 0 || document.body.classList.contains('viewer-open') ? null : { x: e.clientX, y: e.clientY, target: e.target, section: document.body.dataset.section || null };
    },
    { capture: true, passive: true }
  );
  addEventListener('pointercancel', () => (down = null), { capture: true, passive: true }); // 휴대폰에서 스크롤·스와이프로 바뀐 터치
  addEventListener(
    'pointerup',
    (e) => {
      const d = down;
      down = null;
      if (!d || clicks >= MAX_CLICKS || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10) return;
      clicks++;
      push({ type: 'click', section: d.section, x: round(d.x / innerWidth), y: round(d.y / innerHeight), target: describe(d.target) });
    },
    { capture: true, passive: true }
  );

  // 연 PDF
  const viewer = document.getElementById('viewer');
  if (viewer) {
    new MutationObserver(() => {
      if (!viewer.hidden) push({ type: 'pdf', target: (document.getElementById('viewer-title')?.textContent || '').slice(0, 120) });
    }).observe(viewer, { attributes: true, attributeFilter: ['hidden'] });
    trackReading(viewer, cfg, endpoint, { visitor, session, device });
  }
}

/**
 * 기획서별 체류 시간 (type 'read')
 * - 뷰어를 연 동안 1초씩 셈. 탭이 가려져 있거나, 2분 넘게 아무 조작이 없으면 세지 않음 (영상 탭은 조작 없이 봐도 셈)
 * - 뷰어를 닫을 때·탭을 가릴 때·페이지를 떠날 때 그동안 센 시간을 한 줄로 보냄 (관리자 화면에서 합산)
 * - 어디까지 읽었는지(가장 뒤로 넘긴 쪽 / 전체 쪽)도 함께
 * - Supabase에 체류 시간 칸(dur·page·pages)이 아직 없으면 조용히 그만둠 (다른 기록에는 영향 없음)
 */
const READ_COLUMNS = [...COLUMNS, 'dur', 'page', 'pages'];
const IDLE_MS = 120000;
function trackReading(viewer, cfg, endpoint, base) {
  let off = false;
  let cur = null; // { title, sec, page, pages }
  let lastActive = Date.now();
  const outbox = [];

  const send = () => {
    if (off || !outbox.length) return;
    const rows = outbox.splice(0);
    fetch(endpoint, {
      method: 'POST',
      keepalive: true,
      headers: { apikey: cfg.key, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(rows),
    })
      .then((r) => {
        if (!r.ok) off = true; // 칸이 없거나 막힘 → 이번 방문에서는 그만
      })
      .catch(() => {});
  };
  const emit = () => {
    if (!cur || cur.sec < 1) return;
    const full = { ...base, type: 'read', theme: document.documentElement.dataset.theme || null, section: 'works', vw: innerWidth, vh: innerHeight, target: cur.title, dur: Math.min(cur.sec, 7200), page: cur.page || null, pages: cur.pages || null };
    outbox.push(Object.fromEntries(READ_COLUMNS.map((c) => [c, full[c] ?? null])));
    cur.sec = 0;
    send();
  };

  // 쪽 번호: 뷰어 위쪽 "3 / 16"
  const pageEl = document.getElementById('viewer-page');
  if (pageEl)
    new MutationObserver(() => {
      const m = pageEl.textContent.match(/(\d+)\s*\/\s*(\d+)/);
      if (cur && m) {
        cur.page = Math.max(cur.page || 0, Number(m[1]));
        cur.pages = Number(m[2]);
      }
    }).observe(pageEl, { childList: true, characterData: true, subtree: true });

  // 뷰어가 열려 있는 동안(is-open)만. 닫자마자 다른 기획서를 열어도 기획서마다 따로 셈
  new MutationObserver(() => {
    const open = !viewer.hidden && viewer.classList.contains('is-open');
    const title = (document.getElementById('viewer-title')?.textContent || '').slice(0, 120);
    if (open && (!cur || cur.title !== title)) {
      emit();
      cur = { title, sec: 0, page: 0, pages: 0 };
      lastActive = Date.now();
    } else if (!open && cur) {
      emit();
      cur = null;
    }
  }).observe(viewer, { attributes: true, attributeFilter: ['hidden', 'class'] });

  const active = () => (lastActive = Date.now());
  ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((t) => addEventListener(t, active, { capture: true, passive: true }));
  viewer.addEventListener('scroll', active, { capture: true, passive: true });

  setInterval(() => {
    if (!cur || document.visibilityState !== 'visible') return;
    const video = !document.getElementById('viewer-video')?.hidden;
    if (video || Date.now() - lastActive < IDLE_MS) cur.sec++;
  }, 1000);
  addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && emit());
  addEventListener('pagehide', emit);
}
