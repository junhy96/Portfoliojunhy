/**
 * 타임라인 — 교육·인턴십·경력을 연도별로 가로로 길게 잇는 연혁
 * - 페이지에 들어오면 밝은 가로선이 왼쪽부터 그어지고, 선이 지나간 자리의 항목이 차례로 펴짐
 * - 휠·세로 스와이프·방향키를 가로 이동으로 바꿈. 끝까지 보면 다음 페이지로 넘어감 (main.js의 Deck이 wheel/page를 먼저 물어봄)
 * - 지금 보는 항목(화면 왼쪽 1/4 지점) 하나만 크게 펼쳐 주요 업무를 보여 주고, 나머지는 연도·제목만 간단히
 * - 보는 항목이 바뀌면 onFocus로 알려 줌 → main.js가 그 항목의 배경 사진으로 모핑
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
  const m = String(p || '').match(/(\d{4})(?:\D{1,3}(\d{1,2})(?!\d))?/);
  return m ? Number(m[1]) * 100 + Number(m[2] || 0) : 0;
};
// 끝 날짜: "2015 — 2022" → 202200
const endOf = (p) => {
  const all = [...String(p || '').matchAll(/(\d{4})(?:\D{1,3}(\d{1,2})(?!\d))?/g)];
  const m = all[all.length - 1];
  return m ? Number(m[1]) * 100 + Number(m[2] || 0) : 0;
};
// 졸업·수료는 기간의 끝(졸업한 해)에 놓음. 나머지는 시작한 때
const keyOf = (x) => (/졸업|수료/.test(String(x.title || '')) ? endOf(x.period) : startOf(x.period));
const tasksOf = (x) => (Array.isArray(x.tasks) ? x.tasks : String(x.tasks || '').split('\n')).map((t) => String(t).trim()).filter(Boolean);

/** 옛 데이터(about.experience: period/title/desc)도 그대로 받음 */
export function timelineItems(s) {
  const raw = Array.isArray(s.timeline) ? s.timeline : s.about?.experience || [];
  return raw
    .filter((x) => x && (x.title || x.period))
    .map((x, i) => ({ ...x, type: ICON[x.type] ? x.type : x.type ? '기타' : '', tasks: tasksOf(x), _k: keyOf(x), _i: i }))
    .sort((a, b) => a._k - b._k || a._i - b._i);
}

export function renderTimeline(root, items, { onFocus } = {}) {
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

  const nodes = []; // 항목 li (items와 같은 순서)
  const yearOf = []; // 항목마다 속한 연도 li
  let year = null;
  let yearLi = null;
  items.forEach((x) => {
    const y = x._k ? String(Math.floor(x._k / 100)) : '';
    if (y && y !== year) {
      year = y;
      yearLi = el('li', 'tl-year');
      yearLi.setAttribute('aria-hidden', 'true');
      yearLi.append(el('i', 'tl-tick'), el('span', 'tl-year-num', y));
      list.append(yearLi);
    }
    const li = el('li', 'tl-item');
    const card = el('div', 'tl-card');
    // 항상 보이는 부분: 구분 · 기간 · 제목
    if (x.type) {
      const t = el('p', 'tl-type');
      t.innerHTML = icon(x.type);
      t.append(x.type);
      if (x.period) t.append(el('time', 'tl-period', x.period));
      card.append(t);
    } else if (x.period) card.append(el('time', 'tl-period', x.period));
    if (x.title) card.append(el('h3', 'tl-title', x.title));
    // 보고 있을 때만 펼쳐지는 부분: 기관 · 설명 · 주요 업무
    const more = el('div', 'tl-more');
    const inner = el('div', 'tl-more-inner');
    if (x.org) inner.append(el('p', 'tl-org', x.org));
    if (x.desc) inner.append(el('p', 'tl-desc', x.desc));
    const hasWork = !!(x.work?.pdf && x.work.thumbs?.length);
    if (x.tasks.length && !hasWork) {
      inner.append(el('p', 'tl-tasks-label', x.type === '교육' ? '배운 내용' : '주요 업무'));
      const ul = el('ul', 'tl-tasks');
      x.tasks.forEach((t, k) => {
        const tli = el('li', '', t);
        tli.style.setProperty('--k', k);
        ul.append(tli);
      });
      inner.append(ul);
    }
    // 업무 자료 (포트폴리오 PDF에서 그 회사 부분만): 쪽 미리보기를 누르면 그 쪽부터 크게
    if (x.work?.pdf && x.work.thumbs?.length) {
      card.classList.add('has-work');
      const n = x.work.thumbs.length;
      inner.append(el('p', 'tl-tasks-label tl-work-label', `업무 자료 · ${n}쪽 — 누르면 주요 업무와 함께 크게`));
      const row = el('div', 'tl-work');
      x.work.thumbs.forEach((src, k) => {
        const b = el('button', 'tl-work-page');
        b.type = 'button';
        b.setAttribute('aria-label', `${x.title} 업무 자료 ${k + 1}쪽 크게 보기`);
        const im = el('img');
        Object.assign(im, { src, alt: '', loading: 'lazy', decoding: 'async' });
        b.append(im);
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          window.dispatchEvent(new CustomEvent('pf-open-doc', { detail: { page: k + 1, opener: b, doc: { id: 'tl-' + (x.id || k), title: `${x.title} · 업무 자료`, summary: x.desc || x.org || '', category: x.period || '', docType: x.type || '', pdf: x.work.pdf, showDesc: true, description: x.tasks.length ? '주요 업무\n' + x.tasks.map((t) => '– ' + t).join('\n') : '', pdfName: `${x.title.replace(/\s*·\s*/g, '_')}_업무자료.pdf` } } }));
        });
        row.append(b);
      });
      inner.append(row);
    }
    if (inner.childElementCount) {
      more.append(inner);
      card.append(more);
    }
    li.append(el('i', 'tl-dot'), el('i', 'tl-stem'), card);
    list.append(li);
    nodes.push(li);
    yearOf.push(yearLi);
  });
  const marks = [...list.children];

  /* --- 움직임 --- */
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let active = false;
  let cur = 0; // 실제 scrollLeft (소수)
  let target = 0; // 가야 할 scrollLeft
  let reveal = 0; // 밝은 선이 그어진 길이(px)
  let raf = 0;
  let focus = -1;
  let snapTimer = 0;
  let lastDir = 1; // 마지막으로 굴린 방향
  // 휠·방향키·스와이프로 한 칸씩 넘길 때는 '지금 보는 연혁'을 위치가 아니라 순서로 정함.
  // 21:9처럼 넓은 화면에선 여러 연혁이 같은 스크롤 위치에 겹쳐서, 위치로 정하면 한 번에 끝(2025)까지 가 버림
  let pinned = false;
  const max = () => Math.max(0, root.scrollWidth - root.clientWidth);
  // 화면 안에서 '지금 보는 자리'. 휴대폰은 카드가 화면 안에 다 들어오게 조금 왼쪽
  const focusX = () => (root.clientWidth < 600 ? Math.min(root.clientWidth * 0.28, root.clientWidth - 270) : root.clientWidth * 0.28);
  const posOf = (n) => n.offsetLeft + list.offsetLeft; // 트랙 기준 x
  // 첫 항목은 맨 처음(0)에 맞춤 — 들어올 때 위치와 같아야 처음에서 뒤로 밀면 바로 이전 페이지로 감
  const snapOf = (i) => (i === 0 ? 0 : Math.max(0, Math.min(max(), posOf(nodes[i]) - focusX())));
  const hi = () => snapOf(nodes.length - 1); // 마지막 항목이 보는 자리에 오면 끝

  const setFocus = (i) => {
    if (i === focus) return;
    focus = i;
    nodes.forEach((n, k) => n.classList.toggle('is-focus', k === i));
    marks.forEach((n) => n.classList.remove('is-cur'));
    yearOf[i]?.classList.add('is-cur');
    onFocus?.(items[i], i);
  };
  const nearest = (x) => {
    let best = 0;
    nodes.forEach((n, k) => {
      if (Math.abs(snapOf(k) - x) < Math.abs(snapOf(best) - x)) best = k;
    });
    return best;
  };
  // 휠·스와이프가 멈추면 굴린 방향의 다음 항목에 맞춤 (조금만 굴려도 다음 항목으로 넘어감)
  const snapIndex = (x, dir) => {
    if (dir > 0) {
      const k = nodes.findIndex((_, i) => snapOf(i) >= x - 24);
      return k < 0 ? nodes.length - 1 : k;
    }
    for (let i = nodes.length - 1; i >= 0; i--) if (snapOf(i) <= x + 24) return i;
    return 0;
  };
  const snapSoon = () => {
    clearTimeout(snapTimer);
    snapTimer = setTimeout(() => {
      if (!active) return;
      target = snapOf(snapIndex(target, lastDir));
      kick();
    }, 140);
  };

  const frame = () => {
    raf = 0;
    if (!active) return;
    target = Math.max(0, Math.min(max(), target));
    if (Math.abs(target - cur) > 0.5) {
      cur += reduce ? target - cur : (target - cur) * 0.14;
      root.scrollLeft = cur;
    } else cur = target;
    // 밝은 선은 화면 오른쪽 끝(조금 안쪽)까지 그어짐. 처음 들어올 땐 왼쪽부터 쭉
    const want = Math.min(track.scrollWidth, cur + root.clientWidth * 0.86);
    if (reveal < want - 0.5) reveal += reduce ? want - reveal : Math.max(6, (want - reveal) * 0.075);
    if (reveal > want) reveal = want;
    lineDone.style.width = reveal + 'px';
    for (const n of marks) if (!n.classList.contains('is-in') && posOf(n) < reveal - 8) n.classList.add('is-in');
    if (!pinned) {
      const f = nearest(cur);
      if (nodes[f].classList.contains('is-in')) setFocus(f);
    }
    if (Math.abs(target - cur) > 0.5 || reveal < want - 0.5) raf = requestAnimationFrame(frame);
  };
  const kick = () => active && !raf && (raf = requestAnimationFrame(frame));

  // 손가락·트랙패드로 직접 옆으로 밀었을 때
  root.addEventListener('scroll', () => {
    if (Math.abs(root.scrollLeft - cur) > 2) {
      pinned = false;
      lastDir = Math.sign(root.scrollLeft - cur) || lastDir;
      cur = target = root.scrollLeft;
      snapSoon();
    }
    kick();
  }, { passive: true });
  window.addEventListener('resize', () => {
    if (!active || focus < 0) return;
    cur = target = snapOf(focus);
    root.scrollLeft = cur;
    kick();
  });
  // 접힌 항목을 누르면 그 항목으로
  // 한 연혁으로: 순서로 보는 연혁을 정하고, 그 연혁이 보는 자리에 오게 (넓은 화면이라 못 움직여도 보는 연혁은 바뀜)
  const goTo = (k) => {
    pinned = true;
    nodes[k].classList.add('is-in');
    setFocus(k);
    target = snapOf(k);
    kick();
  };
  nodes.forEach((n, k) =>
    n.addEventListener('click', () => {
      if (k === focus) return;
      goTo(k);
    })
  );

  const ctl = {
    debug: () => ({ cur: Math.round(cur), target: Math.round(target), hi: Math.round(hi()), real: root.scrollWidth - root.clientWidth, left: root.scrollLeft }),
    /** 휠: 옆으로 갈 수 있으면 먹고 true, 끝이면 false (→ 다음/이전 페이지) */
    wheel(dy) {
      const end = hi();
      // 끝에 닿았으면: 화면이 아직 따라오는 중일 때만 붙잡고, 다 따라왔으면 false (→ 바로 다음/이전 페이지)
      if ((dy > 0 && target >= end - 1) || (dy < 0 && target <= 1)) return Math.abs(target - cur) > 40;
      lastDir = Math.sign(dy);
      pinned = false;
      target = Math.max(0, Math.min(end, target + dy * 1.1));
      kick();
      snapSoon();
      return true;
    },
    /** 방향키·스와이프: 한 항목씩 */
    page(dir) {
      const now = focus < 0 ? nearest(target) : focus;
      const next = now + dir;
      // 첫/마지막 연혁이면 false (→ 이전/다음 페이지). 화면이 아직 따라오는 중이면 붙잡음
      if (next < 0 || next >= nodes.length) return Math.abs(target - cur) > 40;
      lastDir = dir;
      goTo(next);
      return true;
    },
    /** 페이지에 들어오고 나갈 때. 아래 페이지에서 올라오면 끝에서 시작 */
    /** 페이지에 들어오고 나갈 때. 아래 페이지(Skills)에서 휠로 올라오면 마지막 항목부터 */
    activate(on, fromEnd) {
      if (on === active) return;
      active = on;
      cancelAnimationFrame(raf);
      clearTimeout(snapTimer);
      raf = 0;
      if (on) {
        cur = target = fromEnd ? hi() : 0;
        root.scrollLeft = cur;
        reveal = fromEnd ? cur : 0;
        for (const n of marks) n.classList.toggle('is-in', posOf(n) < reveal);
        lineDone.style.width = reveal + 'px';
        focus = -1;
        pinned = !!fromEnd;
        if (fromEnd) {
          nodes[nodes.length - 1].classList.add('is-in');
          setFocus(nodes.length - 1);
        }
        // 페이지가 올라오는 동안 잠깐 기다렸다가 선을 그음
        setTimeout(kick, 350);
      } else {
        // 나가면 처음 상태로 (다시 들어오면 다시 펴짐)
        setTimeout(() => {
          if (active) return;
          marks.forEach((n) => n.classList.remove('is-in', 'is-focus', 'is-cur'));
          focus = -1;
          reveal = 0;
          lineDone.style.width = '0px';
        }, 700);
      }
    },
  };
  if (panel) panel._h = ctl;
  // 화살표 버튼: 한 항목씩
  panel?.querySelectorAll('.tl-arrow').forEach((b) => (b.onclick = () => ctl.page(Number(b.dataset.tl))));
  return ctl;
}
