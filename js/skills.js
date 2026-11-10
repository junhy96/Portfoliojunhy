/**
 * 스킬 차트 — 눈금 격자 위의 부채꼴 차트 (rose chart)
 * - 조각 하나 = 스킬 하나. 가운데에서 바깥(100)까지 숙련도만큼 포인트 색으로 차오름
 * - 동심원 눈금(20·40·60·80·100)과 조각 경계선, 스킬 이름·아이콘은 원 바깥에
 * - 위쪽 탭(하드 스킬 · 소프트 스킬 · 전체)으로 묶음 전환. 묶음이 하나뿐이면 탭은 숨김
 * - 마우스를 올리면(휴대폰은 탭) 조각이 밝아지고 옆에 말풍선
 */
const NS = 'http://www.w3.org/2000/svg';
const R = 100; // 바깥 반지름 (viewBox 단위)
const R0 = 8; // 가운데 작은 구멍
const GAP = 1.2; // 조각 사이 간격 (각도 대신 바깥 둘레 기준 거리)
const LEVELS = [[90, '전문가'], [75, '능숙'], [55, '실무 가능'], [35, '기초'], [0, '입문']];
const GROUPS = [['hard', '하드 스킬'], ['soft', '소프트 스킬']];

export const levelLabel = (v) => LEVELS.find(([min]) => v >= min)[1];
const clamp = (v) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
const svg = (tag, attrs = {}) => {
  const n = document.createElementNS(NS, tag);
  Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
  return n;
};
const pt = (r, a) => `${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`;
const rOf = (level) => R0 + ((R - R0) * level) / 100;

// 각진 부채꼴 (안쪽 rIn ~ 바깥 rOut, 각도 a0 ~ a1). 바깥 둘레에서 GAP만큼 양옆을 띄움
function sector(rIn, rOut, a0, a1) {
  const g = GAP / 2 / Math.max(rOut, 1);
  const o0 = a0 + g, o1 = a1 - g;
  const gi = GAP / 2 / Math.max(rIn, 1);
  const i0 = a0 + gi, i1 = a1 - gi;
  const large = o1 - o0 > Math.PI ? 1 : 0;
  if (i1 <= i0 || rIn <= 0.5) return `M${pt(rOut, o0)}A${rOut} ${rOut} 0 ${large} 1 ${pt(rOut, o1)}L0 0Z`;
  return `M${pt(rOut, o0)}A${rOut} ${rOut} 0 ${large} 1 ${pt(rOut, o1)}L${pt(rIn, i1)}A${rIn} ${rIn} 0 ${large} 0 ${pt(rIn, i0)}Z`;
}

// 이름이 길면 두 줄로
function splitName(name) {
  const s = String(name).trim();
  if (s.length <= 8) return [s];
  const words = s.split(/\s+/);
  if (words.length === 1) return [s.slice(0, Math.ceil(s.length / 2)), s.slice(Math.ceil(s.length / 2))];
  let best = [s];
  let diff = Infinity;
  for (let k = 1; k < words.length; k++) {
    const a = words.slice(0, k).join(' '), b = words.slice(k).join(' ');
    if (Math.abs(a.length - b.length) < diff) {
      diff = Math.abs(a.length - b.length);
      best = [a, b];
    }
  }
  return best;
}

export function renderSkillChart(root, skills) {
  if (!root) return;
  const all = (skills || []).filter((s) => s && String(s.name || '').trim()).slice(0, 12).map((s) => ({ ...s, level: clamp(s.level), group: s.group === 'soft' ? 'soft' : 'hard' }));
  root.replaceChildren();
  root.hidden = !all.length;
  if (!all.length) return;

  // 탭: 두 묶음 모두 있을 때만
  const groups = GROUPS.filter(([k]) => all.some((s) => s.group === k));
  const tabs = document.createElement('div');
  tabs.className = 'skill-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', '스킬 묶음');
  const tabDefs = groups.length > 1 ? [...groups, ['all', '전체']] : [];
  tabDefs.forEach(([k, label]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'skill-tab';
    b.dataset.group = k;
    b.setAttribute('role', 'tab');
    b.textContent = label;
    tabs.append(b);
  });
  const stage = document.createElement('div');
  stage.className = 'skill-stage';
  const tip = document.createElement('div');
  tip.className = 'skill-tip';
  tip.setAttribute('role', 'tooltip');
  stage.append(tip);
  root.append(...(tabDefs.length ? [tabs] : []), stage);

  let current = null;
  let list = [];
  let step = 1;
  let chart = null;

  const draw = (group) => {
    list = group === 'all' ? all : all.filter((s) => s.group === group);
    tabs.querySelectorAll('.skill-tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.group === group)));
    hide();
    chart?.remove();
    const n = list.length;
    step = (Math.PI * 2) / n;
    chart = svg('svg', { viewBox: '-150 -138 300 276', role: 'list', 'aria-label': '스킬 숙련도 차트' });

    // 눈금: 바탕 원 + 동심원 20·40·60·80·100 + 조각 경계선
    const grid = svg('g', { class: 'skill-grid' });
    grid.append(svg('circle', { class: 'grid-bg', r: R }));
    [20, 40, 60, 80, 100].forEach((v) => grid.append(svg('circle', { class: 'grid-ring' + (v === 100 ? ' is-outer' : ''), r: rOf(v).toFixed(2) })));
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i - 0.5) * step;
      grid.append(svg('line', { class: 'grid-spoke', x1: 0, y1: 0, x2: (R * Math.cos(a)).toFixed(2), y2: (R * Math.sin(a)).toFixed(2) }));
    }
    // 눈금 숫자 (위쪽 경계선 옆, 작게)
    const axisA = -Math.PI / 2 - step / 2;
    [50, 100].forEach((v) => {
      const t = svg('text', { class: 'grid-num', x: (rOf(v) * Math.cos(axisA) - 2).toFixed(2), y: (rOf(v) * Math.sin(axisA) + 1.5).toFixed(2), 'text-anchor': 'end' });
      t.textContent = v;
      grid.append(t);
    });
    chart.append(grid);
    // 채움 위에 한 번 더 그리는 어두운 눈금 (레퍼런스처럼 채운 조각 안에도 눈금이 보이게)
    const gridTop = svg('g', { class: 'skill-grid-top' });
    [20, 40, 60, 80].forEach((v) => gridTop.append(svg('circle', { r: rOf(v).toFixed(2) })));
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i - 0.5) * step;
      gridTop.append(svg('line', { x1: 0, y1: 0, x2: (R * Math.cos(a)).toFixed(2), y2: (R * Math.sin(a)).toFixed(2) }));
    }

    const labels = svg('g', { class: 'skill-labels' });
    const nameSize = n > 9 ? 7.4 : 8.4;
    const iconSize = n > 9 ? 9 : 10;
    list.forEach((s, i) => {
      const mid = -Math.PI / 2 + i * step;
      const a0 = mid - step / 2, a1 = mid + step / 2;
      const g = svg('g', { class: 'skill-wedge', tabindex: '0', role: 'listitem', 'aria-label': `${s.name}, 숙련도 ${s.level} / 100, ${levelLabel(s.level)}${s.desc ? '. ' + s.desc : ''}` });
      g.style.setProperty('--i', i);
      g.append(svg('path', { class: 'hit', d: sector(R0, R, a0, a1) })); // 마우스가 닿는 영역 (조각 전체)
      if (s.level > 0) g.append(svg('path', { class: 'fill', d: sector(R0, rOf(s.level), a0, a1) }));
      g.dataset.index = i;
      chart.append(g);

      // 이름·아이콘: 원 바깥, 방향에 맞춰 왼쪽/가운데/오른쪽 정렬
      const lr = R + 13;
      const cx = lr * Math.cos(mid), cy = lr * Math.sin(mid);
      const c = Math.cos(mid);
      const anchor = Math.abs(c) < 0.25 ? 'middle' : c > 0 ? 'start' : 'end';
      const lines = splitName(s.name);
      const lh = nameSize * 1.15;
      const blockH = lines.length * lh;
      const ys = Math.sin(mid);
      // 위·아래 끝에 있는 이름은 원에서 조금 더 떨어지게
      const top = cy - blockH / 2 + (Math.abs(ys) > 0.9 ? ys * (blockH / 2 + 2) : 0);
      const wrap = svg('g', { class: 'skill-label' });
      const icon = svg('g', { class: 'skill-icon' });
      const ic = window.SKILL_ICONS?.[s.icon] || window.SKILL_ICONS?.idea || { body: '' };
      icon.innerHTML = ic.body;
      if (ic.logo) icon.classList.add('is-logo');
      const ix = anchor === 'start' ? cx : anchor === 'end' ? cx - iconSize : cx - iconSize / 2;
      // 아이콘은 이름 앞(가운데 정렬이면 위)에
      if (anchor === 'middle') {
        icon.setAttribute('transform', `translate(${ix.toFixed(2)} ${(top - iconSize - 2).toFixed(2)}) scale(${(iconSize / 24).toFixed(3)})`);
      } else {
        const iy = top + blockH / 2 - iconSize / 2;
        icon.setAttribute('transform', `translate(${ix.toFixed(2)} ${iy.toFixed(2)}) scale(${(iconSize / 24).toFixed(3)})`);
      }
      wrap.append(icon);
      const tx = anchor === 'start' ? cx + iconSize + 3 : anchor === 'end' ? cx - iconSize - 3 : cx;
      lines.forEach((line, k) => {
        const t = svg('text', { x: tx.toFixed(2), y: (top + lh * (k + 1) - lh * 0.22).toFixed(2), 'font-size': nameSize, 'text-anchor': anchor });
        t.textContent = line;
        wrap.append(t);
      });
      labels.append(wrap);
    });
    chart.append(gridTop, labels);
    stage.prepend(chart);

    chart.querySelectorAll('.skill-wedge').forEach((g) => {
      g.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && show(g));
      g.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && hide());
      g.addEventListener('focus', () => show(g));
      g.addEventListener('blur', hide);
      // 휴대폰: 처음 탭하면 열고, 열린 조각을 다시 탭하면 닫기 (탭하면 포커스로 먼저 열리므로, 누르기 직전 상태로 판단)
      g.addEventListener('pointerdown', () => (g.wasOpen = current === g));
      g.addEventListener('click', (e) => {
        if (e.pointerType !== 'mouse' && g.wasOpen) hide();
        else show(g);
      });
    });
  };

  const labelOf = (g) => chart?.querySelector('.skill-labels')?.children[Number(g.dataset.index)];
  const show = (g) => {
    if (current === g) return;
    hide();
    current = g;
    g.classList.add('is-on');
    labelOf(g)?.classList.add('is-on');
    const s = list[g.dataset.index];
    tip.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'tip-head';
    head.innerHTML = window.skillIconSvg ? window.skillIconSvg(s.icon, 18) : '';
    const name = document.createElement('b');
    name.textContent = s.name;
    head.append(name);
    const score = document.createElement('p');
    score.className = 'tip-score';
    score.innerHTML = `<span>${s.level}</span> / 100 · ${levelLabel(s.level)}`;
    const meter = document.createElement('i');
    meter.className = 'tip-meter';
    meter.style.setProperty('--w', s.level + '%');
    tip.append(head, score, meter);
    if (s.desc) {
      const d = document.createElement('p');
      d.className = 'tip-desc';
      d.textContent = s.desc;
      tip.append(d);
    }
    // 조각의 숙련도 끝 지점 옆에 말풍선 (오른쪽 조각은 오른쪽, 왼쪽 조각은 왼쪽)
    const i = Number(g.dataset.index);
    const mid = -Math.PI / 2 + i * step;
    const box = chart.getBoundingClientRect();
    const sbox = stage.getBoundingClientRect();
    const scale = box.width / 300;
    const rEdge = rOf(Math.max(s.level, 40)) * scale;
    const cx = box.left - sbox.left + box.width / 2 + Math.cos(mid) * rEdge;
    const cy = box.top - sbox.top + box.height / 2 + Math.sin(mid) * rEdge;
    const right = Math.cos(mid) >= -0.05;
    tip.classList.toggle('to-left', !right);
    tip.classList.add('show');
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let x = right ? cx + 16 : cx - tw - 16;
    let y = cy - th / 2;
    // 화면 밖으로 나가지 않게
    const vw = document.documentElement.clientWidth;
    x = Math.max(8 - sbox.left, Math.min(x, vw - sbox.left - tw - 8));
    y = Math.max(-sbox.top + 72, Math.min(y, window.innerHeight - sbox.top - th - 16));
    tip.style.transform = `translate(${x}px, ${y}px)`;
    tip.style.setProperty('--tail-y', Math.max(16, Math.min(th - 16, cy - y)) + 'px');
  };
  const hide = () => {
    if (current) labelOf(current)?.classList.remove('is-on');
    current?.classList.remove('is-on');
    current = null;
    tip.classList.remove('show');
  };
  tabs.addEventListener('click', (e) => {
    const b = e.target.closest('.skill-tab');
    if (b) draw(b.dataset.group);
  });
  document.addEventListener('pointerdown', (e) => {
    if (current && !root.contains(e.target)) hide();
  });
  draw(tabDefs.length ? tabDefs[0][0] : groups[0]?.[0] || 'all');
}
