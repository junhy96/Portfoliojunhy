/**
 * 접속 기록 (Supabase)
 * - 방문, 본 섹션, 클릭 위치(화면 비율), 연 PDF를 모아서 5초마다 한 번에 보냄
 * - 이름·IP 같은 개인정보는 보내지 않음. 브라우저마다 무작위 ID만 사용
 * - 관리자 본인 브라우저, 추적 거부(Do Not Track) 설정, 관리자 미리보기(?embed)는 기록하지 않음
 */
const COLUMNS = ['visitor', 'session', 'type', 'section', 'theme', 'x', 'y', 'target', 'device', 'vw', 'vh', 'referrer', 'lang', 'tz'];
const MAX_CLICKS = 300;

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
  push({ type: 'view', referrer, lang: navigator.language || null, tz: Intl.DateTimeFormat().resolvedOptions().timeZone || null });

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
  let clicks = 0;
  addEventListener(
    'pointerdown',
    (e) => {
      if (clicks >= MAX_CLICKS || e.button > 0 || document.body.classList.contains('viewer-open')) return;
      clicks++;
      push({ type: 'click', x: round(e.clientX / innerWidth), y: round(e.clientY / innerHeight), target: describe(e.target) });
    },
    { capture: true, passive: true }
  );

  // 연 PDF
  const viewer = document.getElementById('viewer');
  if (viewer) {
    new MutationObserver(() => {
      if (!viewer.hidden) push({ type: 'pdf', target: (document.getElementById('viewer-title')?.textContent || '').slice(0, 120) });
    }).observe(viewer, { attributes: true, attributeFilter: ['hidden'] });
  }
}
