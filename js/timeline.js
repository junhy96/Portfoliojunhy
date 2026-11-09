/**
 * 타임라인 — 교육·인턴십·경력을 연도별로 가로로 길게 잇는 연혁
 * - 페이지에 들어오면 밝은 가로선이 왼쪽부터 그어지고, 선이 지나간 자리의 항목이 차례로 펴짐
 * - 휠·세로 스와이프·방향키를 가로 이동으로 바꿈. 끝까지 보면 다음 페이지로 넘어감 (main.js의 Deck이 wheel/page를 먼저 물어봄)
 * - 휴대폰은 손가락으로 옆으로 밀어도 됨
 */
const ICON = {
  교육: '<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>',
  인턴십: '<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>',
  경력: '<path d="M10 12h4"/><path d="M10 8h4"/><path d="M14 21v-3a2 2 0 0 0-4 0v3"/><path d="M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2"/><path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"/>',
  프로젝트: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/><path d="M8 10v4"/><path d="M12 10v2"/><path d="M16 10v6"/>',
  수상: '<path d="m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526"/><circle cx="12" cy="8" r="6"/>',
  자격증: '<path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/><path d="m16 9-5.5 5.5L8 12"/>',
  활동: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><path d="M16 3.128a4 4 0 0 1 0 7.744"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/>',
  기타: '<circle cx="12" cy="12" r="1"/><circle cx="12" cy="12" r="10"/>',
};
export const TIMELINE_TYPES = Object.keys(ICON);

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text) n.textContent = text;
  return n;
};
const icon = (type) =>
  `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[type] || ICON.기타}</svg>`;

// "2024.03 — 2024.08" → 정렬용 202403, 연도 2024
const startOf = (p) => {
  const m = String(p || '').match(/(\d{4})(?:\D{1,3}(\d{1,2}))?/);
  return m ? Number(m[1]) * 100 + Number(m[2] || 0) : 0;
};

/** 옛 데이터(about.experience: period/title/desc)도 그대로 받음 */
export function timelineItems(s) {
  const raw = Array.isArray(s.timeline) ? s.timeline : s.about?.experience || [];
  return raw
    .filter((x) => x && (x.title || x.period))
    .map((x, i) => ({ ...x, type: ICON[x.type] ? x.type : x.type ? '기타' : '', _k: startOf(x.period), _i: i }))
    .sort((a, b) => a._k - b._k || a._i - b._i);
}

export function renderTimeline(root, items) {
  if (!root) return null;
  const panel = root.closest('.panel');
  root.replaceChildren();
  if (!items.length) {
    root.append(el('p', 'tl-empty small', '아직 등록된 연혁이 없습니다.'));
    if (panel) panel._h = null;
    return null;
  }

  const track = el('div', 'tl-track');
  const lineBase = el('i', 'tl-line');
  const lineDone = el('i', 'tl-line tl-line-done');
  const list = el('ol', 'tl-list');
  track.append(lineBase, lineDone, list);
  root.append(track);

  let year = null;
  let side = 0; // 연도마다 위쪽부터 번갈아
  let prevDown = false;
  items.forEach((x) => {
    const y = x._k ? String(Math.floor(x._k / 100)) : '';
    if (y && y !== year) {
      year = y;
      side = 0;
      const yi = el('li', 'tl-year' + (prevDown ? ' after-down' : ''));
      yi.setAttribute('aria-hidden', 'true');
      yi.append(el('i', 'tl-tick'), el('span', 'tl-year-num', y));
      list.append(yi);
    }
    const up = side++ % 2 === 0;
    prevDown = !up;
    const li = el('li', 'tl-item ' + (up ? 'is-up' : 'is-down'));
    const card = el('div', 'tl-card');
    if (x.type) {
      const t = el('p', 'tl-type');
      t.innerHTML = icon(x.type);
      t.append(x.type);
      card.append(t);
    }
    if (x.period) card.append(el('time', 'tl-period', x.period));
    if (x.title) card.append(el('h3', 'tl-title', x.title));
    if (x.org) card.append(el('p', 'tl-org', x.org));
    if (x.desc) card.append(el('p', 'tl-desc', x.desc));
    li.append(el('i', 'tl-dot'), el('i', 'tl-stem'), card);
    list.append(li);
  });
  const marks = [...list.children];

  /* --- 움직임 --- */
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let active = false;
  let cur = 0; // 실제 scrollLeft (소수)
  let target = 0; // 가야 할 scrollLeft
  let reveal = 0; // 밝은 선이 그어진 길이(px)
  let raf = 0;
  const max = () => Math.max(0, root.scrollWidth - root.clientWidth);

  const frame = () => {
    raf = 0;
    if (!active) return;
    const m = max();
    target = Math.max(0, Math.min(m, target));
    if (Math.abs(target - cur) > 0.5) {
      cur += reduce ? target - cur : (target - cur) * 0.14;
      root.scrollLeft = cur;
    } else cur = target;
    // 밝은 선은 화면 오른쪽 끝(조금 안쪽)까지 그어짐. 처음 들어올 땐 왼쪽부터 쭉
    const want = Math.min(track.scrollWidth, cur + root.clientWidth * 0.86);
    if (reveal < want - 0.5) reveal += reduce ? want - reveal : Math.max(6, (want - reveal) * 0.075);
    if (reveal > want) reveal = want;
    lineDone.style.width = reveal + 'px';
    for (const n of marks) if (!n.classList.contains('is-in') && n.offsetLeft < reveal - 8) n.classList.add('is-in');
    if (Math.abs(target - cur) > 0.5 || reveal < want - 0.5) raf = requestAnimationFrame(frame);
  };
  const kick = () => active && !raf && (raf = requestAnimationFrame(frame));

  // 손가락·트랙패드로 직접 옆으로 밀었을 때
  root.addEventListener('scroll', () => {
    if (Math.abs(root.scrollLeft - cur) > 2) cur = target = root.scrollLeft;
    kick();
  }, { passive: true });
  window.addEventListener('resize', kick);

  const ctl = {
    /** 휠: 옆으로 갈 수 있으면 먹고 true, 끝이면 false (→ 다음/이전 페이지) */
    wheel(dy) {
      const m = max();
      if ((dy > 0 && target >= m - 1) || (dy < 0 && target <= 1)) return false;
      target = Math.max(0, Math.min(m, target + dy * 1.1));
      kick();
      return true;
    },
    /** 방향키·스와이프: 한 화면의 70%씩 */
    page(dir) {
      return this.wheel(dir * root.clientWidth * 0.7 / 1.1);
    },
    /** 페이지에 들어오고 나갈 때. 아래 페이지에서 올라오면 끝에서 시작 */
    activate(on, fromEnd) {
      if (on === active) return;
      active = on;
      cancelAnimationFrame(raf);
      raf = 0;
      if (on) {
        cur = target = fromEnd ? max() : 0;
        root.scrollLeft = cur;
        reveal = fromEnd ? cur : 0;
        for (const n of marks) n.classList.toggle('is-in', n.offsetLeft < reveal);
        lineDone.style.width = reveal + 'px';
        // 페이지가 올라오는 동안 잠깐 기다렸다가 선을 그음
        setTimeout(kick, 350);
      } else {
        // 나가면 처음 상태로 (다시 들어오면 다시 펴짐)
        setTimeout(() => {
          if (active) return;
          marks.forEach((n) => n.classList.remove('is-in'));
          reveal = 0;
          lineDone.style.width = '0px';
        }, 700);
      }
    },
  };
  if (panel) panel._h = ctl;
  return ctl;
}
