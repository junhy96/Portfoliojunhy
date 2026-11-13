/**
 * Works — 문서 종류 필터 + 위아래로 스크롤되는 4열 카드 격자
 * - 카드를 4열(좁은 창은 3열)로 놓고, 한 화면에 다 안 들어가면 격자 안에서 휠로 아래로 내림. 끝에 닿으면 다음 페이지로 (main.js가 data-scroll로 처리)
 *   (예전엔 옆으로 이어져서 버튼·끌기로 넘겨야 했고, 처음 보이는 4열 × 2줄 뒤는 잘 안 봤음)
 * - 다음 줄이 화면 아래에 살짝 걸쳐 보이게 카드 크기를 맞춰, 아래에 더 있다는 걸 알림
 * - 카드 비율은 그대로(그림 16:10 + 아래 제목줄). 좁은 창에서는 글을 줄이고 그림을 16:9로 (is-compact)
 * - 카드(li)는 main.js가 모두 그려 두고, 여기서는 필터로 보일 카드만 고름 (data-index는 그대로라 클릭·모핑 동작 유지)
 * - 휴대폰은 위아래로 스크롤되는 2열 목록 (CSS)
 */
const META_H = 106; // 카드 아래 글 높이 기본값 (실제 카드로 다시 잼)
const COMPACT_W = 250; // 카드가 이보다 좁아지면 글을 줄인 작은 카드(is-compact)로
const PEEK = 0.3; // 화면 아래에 걸쳐 보이는 다음 줄 (그림 높이 대비)
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
  bar.replaceChildren(chips);
  if (!items.length) bar.hidden = true;

  let filter = '';
  const shown = () => items.filter((li) => !filter || typeOf(li) === filter);

  // 카드 아래 글 높이 (작은 카드일 때는 글이 줄어 더 낮음)
  const metaH = () => {
    const probe = items.find((li) => li.offsetHeight > 0)?.querySelector('.card-meta');
    return probe ? probe.offsetHeight + parseFloat(getComputedStyle(probe).marginTop || 0) + 2 : META_H;
  };
  // 아래에 더 있으면 격자 아래쪽을 흐리게, 끝까지 내리면 흐림을 뺌
  const fade = () => grid.classList.toggle('at-end', grid.scrollTop >= grid.scrollHeight - grid.clientHeight - 2);

  // 4열(좁은 창은 3열) 큰 카드. 한 화면에 다 안 들어가면 격자 안에서 위아래로 스크롤하고, 다음 줄이 살짝 걸쳐 보이게 함
  const layout = () => {
    grid.classList.remove('is-scroll', 'is-compact', 'no-sub');
    grid.style.removeProperty('--thumb-ar');
    if (mobile()) {
      grid.style.removeProperty('--cols');
      return;
    }
    const n = shown().length;
    if (!n) return;
    const W = grid.clientWidth;
    const H = grid.clientHeight;
    const cols = W >= 1000 ? 4 : 3;
    const gaps = () => {
      const cs = getComputedStyle(grid);
      return [parseFloat(cs.columnGap) || 0, parseFloat(cs.rowGap) || 0];
    };
    let [colGap, rowGap] = gaps();
    let colW = (W - (cols - 1) * colGap) / cols;
    const compact = colW < COMPACT_W; // 좁은 창: 글을 줄인 작은 카드
    if (compact) {
      grid.classList.add('is-compact');
      [colGap, rowGap] = gaps();
      colW = (W - (cols - 1) * colGap) / cols;
    }
    grid.style.setProperty('--cols', cols);
    const rows = Math.ceil(n / cols);
    const MAX_R = compact ? 9 / 16 : 10 / 16; // 그림 높이 ÷ 너비: 기본 비율
    const MIN_R = 0.47; // 이보다 납작하게는 자르지 않음
    // 그림 높이를 화면에 맞춤: 전부 들어가면 그대로, 아니면 k줄이 온전히 보이고 다음 줄 그림이 PEEK만큼 걸치게
    // (줄이 화면 아래에 딱 맞게 끝나면 아래에 더 있는 줄 모르고 지나감)
    // 돌려주는 값: r = 그림 비율, scroll = 스크롤 여부, peek = 화면 아래 끝이 다음 줄 그림에 걸치는지
    const solve = (mh) => {
      const all = ((H - (rows - 1) * rowGap) / rows - mh) / colW;
      if (all >= MIN_R) return { r: Math.min(MAX_R, all), scroll: false, peek: true };
      let best = null;
      for (const p of [PEEK, 0.2]) {
        for (let k = rows - 1; k >= 1; k--) {
          const want = (H - k * (mh + rowGap)) / ((k + p) * colW);
          if (want < MIN_R) continue;
          const r = Math.min(MAX_R, want);
          const cut = (H - k * (r * colW + mh + rowGap)) / (r * colW); // 다음 줄 그림이 보이는 비율
          if (cut <= 1 && (!best || r > best.r)) best = { r, scroll: true, peek: true };
        }
        if (best) return best;
      }
      return { r: MAX_R, scroll: true, peek: false };
    };
    let best = solve(metaH());
    if (!compact && best.scroll && (!best.peek || best.r < 9 / 16)) {
      // 다음 줄이 안 걸치거나 그림이 너무 납작해지면: 카드의 한 줄 소개를 숨겨 그림 자리를 확보
      grid.classList.add('no-sub');
      const alt = solve(metaH());
      if (!alt.scroll || (alt.peek && !best.peek) || (alt.peek === best.peek && alt.r > best.r)) best = alt;
      else grid.classList.remove('no-sub');
    }
    grid.style.setProperty('--thumb-ar', `1 / ${best.r.toFixed(4)}`);
    grid.classList.toggle('is-scroll', best.scroll);
    fade();
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
    grid.scrollTop = 0;
    fade();
  };
  grid.addEventListener('scroll', fade, { passive: true });

  chips.addEventListener('click', (e) => {
    const b = e.target.closest('.works-chip');
    if (!b) return;
    filter = b.dataset.value;
    chips.querySelectorAll('.works-chip').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    show();
  });

  let rt;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(layout, 200);
  });
  matchMedia('(max-width: 820px)').addEventListener('change', () => show(false));
  show(false);

  // Deck 연결: 옆으로 넘길 게 없으니 방향키는 그대로 이전·다음 페이지로 (격자 안 스크롤은 main.js가 data-scroll로 처리)
  panel._h = {
    page: () => false,
    activate(on) {
      if (!on) return;
      show();
    },
  };
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text) n.textContent = text;
  return n;
}
