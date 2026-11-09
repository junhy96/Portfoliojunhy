/**
 * Works — 문서 종류 필터 + 가로로 이어지는 카드 목록
 * - 처음에는 카드가 화면 가득(보통 4열 × 2줄 + 오른쪽에 다음 열이 살짝) 보이고,
 *   휠을 내리거나 마우스로 끌면 타임라인처럼 옆으로 밀려남. 끝까지 가면 다음 페이지로 (main.js Deck이 wheel/page를 먼저 물어봄)
 * - 카드 비율은 초안 그대로(그림 16:10 + 아래 제목줄), 화면 높이에 들어가는 만큼 줄 수를 정함
 * - 카드(li)는 main.js가 모두 그려 두고, 여기서는 필터로 보일 카드만 고름 (data-index는 그대로라 클릭·모핑 동작 유지)
 * - 휴대폰은 위아래로 스크롤되는 한 줄 목록
 */
const META_H = 106; // 카드 아래 글 높이 기본값 (실제 카드로 다시 잼)
const PEEK = 0.35; // 오른쪽에 살짝 보이는 다음 열 (열 너비 대비)
const mobile = () => matchMedia('(max-width: 820px)').matches;
// slide-in-bck 9방향 (가운데·위·아래·왼쪽·오른쪽·대각선 4곳) 중 무작위
const DIRS = [[0, 0, 600], [0, -1, 700], [0, 1, 700], [-1, 0, 700], [1, 0, 700], [-1, -1, 700], [1, -1, 700], [-1, 1, 700], [1, 1, 700]];
export function scatter(n) {
  const [x, y, z] = DIRS[(Math.random() * DIRS.length) | 0];
  n.style.setProperty('--sx', x * 300 + 'px');
  n.style.setProperty('--sy', y * 220 + 'px');
  n.style.setProperty('--sz', z + 'px');
  n.style.setProperty('--j', Math.round(Math.random() * 180) + 'ms');
}

export function initWorks(panel, projects, docTypes = []) {
  const grid = panel?.querySelector('.works-grid');
  const bar = panel?.querySelector('.works-filter');
  if (!grid || !bar) return;
  const items = [...grid.children].filter((li) => li.querySelector('.work-card[data-index]'));
  const typeOf = (li) => projects[li.querySelector('.work-card').dataset.index]?.docType || '';

  // 필터 버튼: 전체 + 작업물이 있는 문서 종류만 (관리자에서 정한 순서대로, 목록에 없는 종류는 뒤에)
  const counts = new Map();
  items.forEach((li) => {
    const t = typeOf(li);
    if (t) counts.set(t, (counts.get(t) || 0) + 1);
  });
  const order = [...docTypes.filter((t) => counts.has(t)), ...[...counts.keys()].filter((t) => !docTypes.includes(t))];
  const chips = el('div', 'works-chips');
  chips.setAttribute('role', 'group');
  chips.setAttribute('aria-label', '문서 종류로 거르기');
  const chip = (label, value, n) => {
    const b = el('button', 'works-chip');
    b.type = 'button';
    b.dataset.value = value;
    b.append(el('span', '', label), el('em', '', String(n)));
    b.setAttribute('aria-pressed', value === '' ? 'true' : 'false');
    return b;
  };
  chips.append(chip('전체', '', items.length), ...order.map((t) => chip(t, t, counts.get(t))));
  // 오른쪽: 진행 막대 + 좌우 버튼 (넘칠 때만)
  const nav = el('div', 'works-pager small');
  const prog = el('span', 'works-progress');
  const fill = el('i');
  prog.append(fill);
  const prev = el('button', 'works-pager-btn', '‹');
  const next = el('button', 'works-pager-btn', '›');
  prev.type = next.type = 'button';
  prev.setAttribute('aria-label', '왼쪽으로');
  next.setAttribute('aria-label', '오른쪽으로');
  nav.append(prog, prev, next);
  bar.replaceChildren(chips, nav);
  if (!items.length) bar.hidden = true;

  let filter = '';
  let step = 300; // 열 하나 폭 + 간격
  let cur = 0;
  let target = 0;
  let raf = 0;
  let snapTimer = 0;
  let lastDir = 1;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // 가로로 갈 수 있는 끝: 카드 배치로 계산 (날아오는 애니메이션 중엔 scrollWidth가 잠깐 커지므로 쓰지 않음)
  let contentW = 0;
  const max = () => (mobile() ? 0 : Math.max(0, contentW - grid.clientWidth));
  const shown = () => items.filter((li) => !filter || typeOf(li) === filter);

  // 열 너비·줄 수: 4열(좁으면 3열) + 다음 열이 살짝, 줄 수는 높이에 맞춤
  const layout = () => {
    if (mobile()) {
      grid.style.removeProperty('--colw');
      grid.style.removeProperty('--rows');
      return;
    }
    const cs = getComputedStyle(grid);
    const colGap = parseFloat(cs.columnGap) || 0;
    const rowGap = parseFloat(cs.rowGap) || 0;
    const probe = items.find((li) => li.offsetHeight > 0)?.querySelector('.card-meta');
    const metaH = probe ? probe.offsetHeight + parseFloat(getComputedStyle(probe).marginTop || 0) + 2 : META_H;
    const W = grid.clientWidth;
    const cols = W >= 1000 ? 4 : 3;
    const n = shown().length;
    const H = grid.clientHeight;
    let colW = (W - cols * colGap) / (cols + PEEK);
    let rows = Math.max(1, Math.floor((H + rowGap) / ((colW * 10) / 16 + metaH + rowGap)));
    // 카드를 조금(최대 18%)만 줄이면 한 줄 더 들어가면 그렇게 함
    const more = rows + 1;
    const colW2 = ((H - (more - 1) * rowGap) / more - metaH) * 1.6;
    if (n > cols * rows && colW2 >= colW * 0.82) {
      rows = more;
      colW = colW2;
    }
    // 다 들어가면 오른쪽 여백 없이 꽉 채움
    if (n <= cols * rows) colW = (W - (cols - 1) * colGap - parseFloat(cs.paddingRight || 0)) / cols;
    rows = Math.max(1, Math.min(rows, Math.ceil(n / cols)));
    grid.style.setProperty('--colw', colW + 'px');
    grid.style.setProperty('--rows', rows);
    step = colW + colGap;
    const colsTotal = Math.ceil(n / rows);
    contentW = colsTotal * colW + Math.max(0, colsTotal - 1) * colGap + (parseFloat(cs.paddingRight) || 0);
  };

  const paint = () => {
    const m = max();
    grid.classList.toggle('fade-l', cur > 2);
    grid.classList.toggle('fade-r', cur < m - 2);
    nav.hidden = m < 2 || mobile();
    fill.style.width = (m ? ((cur + grid.clientWidth) / contentW) * 100 : 100) + '%';
    prev.disabled = cur <= 2;
    next.disabled = cur >= m - 2;
  };
  const frame = () => {
    raf = 0;
    target = Math.max(0, Math.min(max(), target));
    if (Math.abs(target - cur) > 0.5) {
      cur += reduce ? target - cur : (target - cur) * 0.14;
      grid.scrollLeft = cur;
      raf = requestAnimationFrame(frame);
    } else {
      cur = target;
      grid.scrollLeft = cur;
    }
    paint();
  };
  const kick = () => !raf && (raf = requestAnimationFrame(frame));
  // 멈추면 굴린 방향의 다음 열에 맞춤
  const snapSoon = () => {
    clearTimeout(snapTimer);
    snapTimer = setTimeout(() => {
      const k = lastDir > 0 ? Math.ceil((target - 24) / step) : Math.floor((target + 24) / step);
      target = Math.max(0, Math.min(max(), k * step));
      kick();
    }, 140);
  };
  const go = (x) => {
    target = Math.max(0, Math.min(max(), x));
    kick();
  };

  // animate: Works 페이지에 들어올 때·필터를 바꿀 때만 카드가 날아옴 (처음 준비할 때는 그냥 둠)
  const show = (animate = true) => {
    const list = shown();
    items.forEach((li) => {
      li.hidden = !list.includes(li);
      li.classList.remove('is-show');
    });
    layout();
    if (animate)
      list.forEach((li, k) => {
        li.style.setProperty('--k', Math.min(k, 10));
        scatter(li);
        void li.offsetWidth; // 다시 날아오는 애니메이션
        li.classList.add('is-show');
      });
    cur = target = 0;
    grid.scrollLeft = 0;
    paint();
  };

  chips.addEventListener('click', (e) => {
    const b = e.target.closest('.works-chip');
    if (!b) return;
    filter = b.dataset.value;
    chips.querySelectorAll('.works-chip').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    show();
  });
  const pageW = () => Math.max(step, Math.floor(grid.clientWidth / step) * step);
  prev.addEventListener('click', () => go(target - pageW()));
  next.addEventListener('click', () => go(target + pageW()));

  // 손가락·트랙패드로 직접 옆으로 밀었을 때
  grid.addEventListener('scroll', () => {
    if (grid.scrollLeft > max() + 1) {
      grid.scrollLeft = max(); // 애니메이션 중 늘어난 영역으로는 못 가게
      return;
    }
    if (Math.abs(grid.scrollLeft - cur) > 2) {
      lastDir = Math.sign(grid.scrollLeft - cur) || lastDir;
      cur = target = grid.scrollLeft;
      if (!mobile()) snapSoon();
    }
    paint();
  }, { passive: true });

  // 마우스로 끌어서 옆으로 (조금이라도 끌었으면 카드 클릭은 무시)
  let drag = null;
  grid.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || mobile() || max() < 2) return;
    drag = { x: e.clientX, start: target, moved: false };
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) < 6) return;
    if (!drag.moved) grid.classList.add('is-dragging');
    drag.moved = true;
    lastDir = dx < 0 ? 1 : -1;
    cur = target = Math.max(0, Math.min(max(), drag.start - dx));
    grid.scrollLeft = cur;
    paint();
  });
  window.addEventListener('pointerup', () => {
    if (!drag) return;
    if (drag.moved) {
      grid.classList.remove('is-dragging');
      // 끌고 난 직후의 클릭(카드 열기)은 막음
      const stop = (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      window.addEventListener('click', stop, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 0);
      snapSoon();
    }
    drag = null;
  });

  let rt;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      layout();
      go(target);
      paint();
    }, 200);
  });
  matchMedia('(max-width: 820px)').addEventListener('change', () => show(false));
  show(false);

  // Deck 연결: 휠·방향키를 옆으로 미는 데 씀. 끝에 닿았고 화면도 다 따라왔으면 false → 이전/다음 페이지
  panel._h = {
    debug: () => ({ cur: Math.round(cur), target: Math.round(target), max: Math.round(max()), real: grid.scrollWidth - grid.clientWidth, left: grid.scrollLeft }),
    wheel(dy) {
      if (mobile()) return false;
      const m = max();
      if ((dy > 0 && target >= m - 1) || (dy < 0 && target <= 1)) return Math.abs(target - cur) > 40;
      lastDir = Math.sign(dy);
      go(target + dy * 1.1);
      snapSoon();
      return true;
    },
    page(dir) {
      if (mobile()) return false;
      const m = max();
      if ((dir > 0 && target >= m - 1) || (dir < 0 && target <= 1)) return Math.abs(target - cur) > 40;
      lastDir = dir;
      go(target + dir * step);
      return true;
    },
    activate(on, fromEnd) {
      if (!on) return;
      show();
      if (fromEnd) {
        cur = target = max();
        grid.scrollLeft = cur;
        paint();
      }
    },
  };
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text) n.textContent = text;
  return n;
}
