/**
 * Works — 문서 종류 필터 + 한 화면에 들어가는 만큼씩 넘기기
 * - 카드 비율(그림 16:10 + 아래 제목줄)은 그대로 두고, 화면 크기에 맞춰 한 묶음 개수를 정함 (보통 PC 4×2 = 8개)
 * - 카드(li)는 main.js가 모두 그려 두고, 여기서는 보일 카드만 고름 (data-index는 그대로라 클릭·모핑 동작 유지)
 * - 한 묶음보다 많으면 휠·방향키로 다음 묶음, 마지막 묶음에서 더 내리면 다음 페이지로 (main.js Deck이 wheel/page를 먼저 물어봄)
 * - 휴대폰은 묶음 없이 목록 전체를 위아래로 스크롤
 */
const META_H = 106; // 카드 아래 글 높이 기본값 (실제 카드로 다시 잼)
const mobile = () => matchMedia('(max-width: 820px)').matches;
const pad = (n) => String(n).padStart(2, '0');
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
  const pager = el('div', 'works-pager small');
  const prev = el('button', 'works-pager-btn', '‹');
  const next = el('button', 'works-pager-btn', '›');
  prev.type = next.type = 'button';
  prev.setAttribute('aria-label', '이전 묶음');
  next.setAttribute('aria-label', '다음 묶음');
  const label = el('span', 'works-pager-label');
  pager.append(label, prev, next);
  bar.replaceChildren(chips, pager);
  if (!items.length) bar.hidden = true;

  let filter = '';
  let page = 0;
  let lastFlip = 0;
  const shown = () => items.filter((li) => !filter || typeOf(li) === filter);
  // 한 묶음 개수: 열 수 × 화면 높이에 들어가는 줄 수
  // 넓은 화면은 4열과 5열 중 한 화면에 더 많이 들어가는 쪽을 고름 (높이가 낮은 노트북은 보통 5열)
  const perPage = () => {
    grid.style.gridTemplateColumns = '';
    const cs = getComputedStyle(grid);
    const colGap = parseFloat(cs.columnGap) || 0;
    const rowGap = parseFloat(cs.rowGap) || 0;
    // 카드 아래 글 높이: 보이는 카드 하나로 잼
    const probe = items.find((li) => li.offsetHeight > 0)?.querySelector('.card-meta');
    const metaH = probe ? probe.offsetHeight + parseFloat(getComputedStyle(probe).marginTop || 0) + 2 : META_H;
    const fit = (cols) => {
      const colW = (grid.clientWidth - (cols - 1) * colGap) / cols;
      return cols * Math.max(1, Math.floor((grid.clientHeight + rowGap) / ((colW * 10) / 16 + metaH + rowGap)));
    };
    const base = cs.gridTemplateColumns.split(' ').filter(Boolean).length || 1;
    if (base < 4) return fit(base);
    const four = fit(4), five = fit(5);
    if (five > four) {
      grid.style.gridTemplateColumns = 'repeat(5, minmax(0, 1fr))';
      return five;
    }
    return four;
  };
  let per = 8;
  const pages = () => (mobile() ? 1 : Math.max(1, Math.ceil(shown().length / per)));

  const draw = (dir = 0) => {
    if (!mobile()) {
      const first = page * per;
      per = perPage();
      page = Math.floor(first / per);
    }
    const list = shown();
    const n = pages();
    page = Math.max(0, Math.min(n - 1, page));
    const from = mobile() ? 0 : page * per;
    const to = mobile() ? list.length : from + per;
    items.forEach((li) => {
      li.hidden = true;
      li.classList.remove('is-show');
    });
    list.slice(from, to).forEach((li, k) => {
      li.hidden = false;
      li.style.setProperty('--k', k);
      scatter(li);
      void li.offsetWidth; // 다시 나타나는 애니메이션
      li.classList.add('is-show');
    });
    label.textContent = `${pad(page + 1)} / ${pad(n)}`;
    pager.hidden = n < 2;
    prev.disabled = page === 0;
    next.disabled = page >= n - 1;
    grid.scrollTop = 0;
  };
  const flip = (dir) => {
    const n = pages();
    if ((dir > 0 && page >= n - 1) || (dir < 0 && page <= 0)) return false;
    page += dir;
    lastFlip = performance.now();
    draw(dir);
    return true;
  };

  chips.addEventListener('click', (e) => {
    const b = e.target.closest('.works-chip');
    if (!b) return;
    filter = b.dataset.value;
    chips.querySelectorAll('.works-chip').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    page = 0;
    draw();
  });
  prev.addEventListener('click', () => flip(-1));
  next.addEventListener('click', () => flip(1));
  matchMedia('(max-width: 820px)').addEventListener('change', () => draw());
  let rt;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => draw(), 200);
  });
  draw();

  // Deck 연결: 휠·방향키로 묶음 넘기기
  panel._h = {
    wheel(dy) {
      if (mobile()) return false;
      if (performance.now() - lastFlip < 650) return true; // 한 번 굴림에 여러 묶음이 넘어가지 않게
      return flip(Math.sign(dy));
    },
    page(dir) {
      return mobile() ? false : flip(dir);
    },
    activate(on, fromEnd) {
      if (!on) return;
      page = fromEnd ? pages() - 1 : 0;
      draw();
    },
  };
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text) n.textContent = text;
  return n;
}
