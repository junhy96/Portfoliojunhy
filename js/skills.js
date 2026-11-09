/**
 * 스킬 차트 — 둥근 조각(rose chart)
 * - 조각 하나 = 스킬 하나. 바깥 어두운 칸은 100, 안쪽 회청색 부분이 숙련도만큼 차오름
 * - 조각마다 아이콘 + 이름. 마우스를 올리면(휴대폰은 탭) 조각이 살짝 커지고 옆에 말풍선
 */
const NS = 'http://www.w3.org/2000/svg';
const R = 100; // 바깥 반지름 (viewBox 단위)
const R0 = 20; // 가운데 구멍
const CORNER = 6; // 모서리 둥글기
const GAP = 4; // 조각 사이 간격
const LEVELS = [[90, '전문가'], [75, '능숙'], [55, '실무 가능'], [35, '기초'], [0, '입문']];

export const levelLabel = (v) => LEVELS.find(([min]) => v >= min)[1];
const clamp = (v) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
const svg = (tag, attrs = {}) => {
  const n = document.createElementNS(NS, tag);
  Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
  return n;
};
const pt = (r, a) => `${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`;

// 둥근 모서리 부채꼴: 모양을 모서리 반지름만큼 안쪽으로 줄여 그린 뒤, 같은 색의 굵은 선(둥근 이음)으로 감싸는 방식
function wedgePath(rIn, rOut, a0, a1) {
  const ri = rIn + CORNER;
  const ro = Math.max(ri + 0.5, rOut - CORNER);
  const inset = (r) => (GAP / 2 + CORNER) / r;
  const o0 = a0 + inset(ro), o1 = a1 - inset(ro);
  let i0 = a0 + inset(ri), i1 = a1 - inset(ri);
  const large = o1 - o0 > Math.PI ? 1 : 0;
  if (i1 <= i0) {
    // 안쪽이 너무 좁으면 한 점으로 모음
    const mid = (a0 + a1) / 2;
    return `M${pt(ro, o0)}A${ro} ${ro} 0 ${large} 1 ${pt(ro, o1)}L${pt(ri, mid)}Z`;
  }
  return `M${pt(ro, o0)}A${ro} ${ro} 0 ${large} 1 ${pt(ro, o1)}L${pt(ri, i1)}A${ri} ${ri} 0 0 0 ${pt(ri, i0)}Z`;
}

// 이름이 길면 두 줄로
function splitName(name) {
  const s = String(name).trim();
  if (s.length <= 7) return [s];
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
  const list = (skills || []).filter((s) => s && String(s.name || '').trim()).slice(0, 12).map((s) => ({ ...s, level: clamp(s.level) }));
  root.replaceChildren();
  root.hidden = !list.length;
  if (!list.length) return;

  const n = list.length;
  const step = (Math.PI * 2) / n;
  const chart = svg('svg', { viewBox: '-112 -112 224 224', role: 'list', 'aria-label': '스킬 숙련도 차트' });
  const defs = svg('defs');
  const grad = svg('linearGradient', { id: 'skill-fill', x1: '-100', y1: '-100', x2: '100', y2: '100', gradientUnits: 'userSpaceOnUse' });
  grad.append(svg('stop', { offset: '0', 'stop-color': '#55625f' }), svg('stop', { offset: '1', 'stop-color': '#323e3d' }));
  defs.append(grad);
  chart.append(defs);

  const labels = svg('g', { class: 'skill-labels' });
  const iconSize = n > 8 ? 9 : 11;
  const nameSize = n > 8 ? 4.6 : 5.4;
  list.forEach((s, i) => {
    const mid = -Math.PI / 2 + i * step;
    const a0 = mid - step / 2, a1 = mid + step / 2;
    const rFill = R0 + ((R - R0) * s.level) / 100;
    const g = svg('g', { class: 'skill-wedge', tabindex: '0', role: 'listitem', 'aria-label': `${s.name}, 숙련도 ${s.level} / 100, ${levelLabel(s.level)}${s.desc ? '. ' + s.desc : ''}` });
    g.style.setProperty('--i', i);
    g.append(svg('path', { class: 'track', d: wedgePath(R0, R, a0, a1) }));
    if (s.level > 0) g.append(svg('path', { class: 'fill', d: wedgePath(R0, Math.max(rFill, R0 + CORNER * 2 + 1), a0, a1) }));

    // 아이콘 + 이름: 밝은 부분과 회색 부분의 경계에 걸치지 않게, 둘 중 한 곳 안에 통째로 넣음
    // - 바깥 회색 칸이 넉넉하면(숙련도 낮음) 회색 칸 가운데에 밝은 글씨
    // - 아니면(숙련도 높음) 밝은 부분의 바깥쪽에 어두운 글씨
    const lines = splitName(s.name);
    const blockH = iconSize + 1.5 + lines.length * (nameSize + 0.6);
    const half = blockH / 2 + 3; // 블록 반높이 + 여유
    const trackSpace = R - rFill;
    const onFill = trackSpace < half * 2 + 4;
    const lr = onFill ? Math.max(R0 + half + 6, rFill - half - 2) : rFill + trackSpace / 2;
    const lx = lr * Math.cos(mid), ly = lr * Math.sin(mid);
    const wrap = svg('g', { class: 'skill-label-wrap' });
    const label = svg('g', { class: 'skill-label' + (onFill ? ' on-fill' : ''), transform: `translate(${lx.toFixed(2)} ${ly.toFixed(2)})` });
    wrap.append(label);
    const top = -blockH / 2;
    const ic = window.SKILL_ICONS?.[s.icon] || window.SKILL_ICONS?.idea || { body: '' };
    // 로고는 24칸을 꽉 채워 그려져 있어서 선 아이콘과 크기가 맞게 조금 줄임
    const k = ic.logo ? 0.84 : 1;
    const icon = svg('g', { transform: `translate(${-iconSize / 2 + (iconSize * (1 - k)) / 2} ${top + (iconSize * (1 - k)) / 2}) scale(${(iconSize / 24) * k})` });
    icon.innerHTML = ic.body;
    icon.setAttribute('class', 'skill-icon' + (ic.logo ? ' is-logo' : ''));
    label.append(icon);
    lines.forEach((line, k) => {
      const t = svg('text', { y: (top + iconSize + 1.5 + (nameSize + 0.6) * (k + 1) - 1).toFixed(2), 'font-size': nameSize, 'text-anchor': 'middle' });
      t.textContent = line;
      label.append(t);
    });
    labels.append(wrap);
    g.dataset.index = i;
    chart.append(g);
  });
  chart.append(labels);
  const labelOf = (g) => labels.children[Number(g.dataset.index)];

  const tip = document.createElement('div');
  tip.className = 'skill-tip';
  tip.setAttribute('role', 'tooltip');
  root.append(chart, tip);

  let current = null;
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
    // 조각 바깥 가장자리 옆에 말풍선 (오른쪽 조각은 오른쪽, 왼쪽 조각은 왼쪽)
    const i = Number(g.dataset.index);
    const mid = -Math.PI / 2 + i * step;
    const box = root.getBoundingClientRect();
    const scale = box.width / 224;
    const rEdge = R * 1.04 * scale;
    const cx = box.width / 2 + Math.cos(mid) * rEdge;
    const cy = box.height / 2 + Math.sin(mid) * rEdge;
    const right = Math.cos(mid) >= -0.05;
    tip.classList.toggle('to-left', !right);
    tip.classList.add('show');
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let x = right ? cx + 16 : cx - tw - 16;
    let y = cy - th / 2;
    // 화면 밖으로 나가지 않게
    const vw = document.documentElement.clientWidth;
    x = Math.max(8 - box.left, Math.min(x, vw - box.left - tw - 8));
    y = Math.max(-box.top + 72, Math.min(y, window.innerHeight - box.top - th - 16));
    tip.style.transform = `translate(${x}px, ${y}px)`;
    tip.style.setProperty('--tail-y', Math.max(16, Math.min(th - 16, cy - y)) + 'px');
  };
  const hide = () => {
    if (current) labelOf(current)?.classList.remove('is-on');
    current?.classList.remove('is-on');
    current = null;
    tip.classList.remove('show');
  };
  chart.querySelectorAll('.skill-wedge').forEach((g) => {
    g.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && show(g));
    g.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && hide());
    g.addEventListener('focus', () => show(g));
    g.addEventListener('blur', hide);
    // 휴대폰: 처음 탭하면 열고, 열린 조각을 다시 탭하면 닫기
    // (탭하면 포커스로 먼저 열리므로, 누르기 직전에 열려 있었는지로 판단)
    g.addEventListener('pointerdown', () => (g.wasOpen = current === g));
    g.addEventListener('click', (e) => {
      if (e.pointerType !== 'mouse' && g.wasOpen) hide();
      else show(g);
    });
  });
  document.addEventListener('pointerdown', (e) => {
    if (current && !root.contains(e.target)) hide();
  });
}
