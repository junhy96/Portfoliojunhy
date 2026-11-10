/**
 * 인쇄 · PDF 저장 페이지 (print.html)
 *   ?part=resume   이력서: 1·2페이지 내용 (소개 · 경력 · 교육 · 자기소개 · 툴 숙련도)
 *   ?part=timeline 연혁 (주요 업무까지)
 *   ?part=skills   툴 숙련도 (설명까지)
 *   ?part=works    작업 목록
 *   ?part=work&id= 작업 하나 (설명 · 소개 이미지 · 링크)
 *   &from=태그     링크 프리셋에서 숨긴 기획서·연혁은 인쇄에서도 뺌
 * 사이트와 같은 data/site.json을 읽어 A4 문서로 그리고, 다 그려지면 인쇄 창을 엶
 */
import { timelineItems } from './timeline.js?v=202611101732';
import { cleanTag } from './analytics.js?v=202611101732';

const q = new URLSearchParams(location.search);
const part = q.get('part') || 'resume';
const doc = document.getElementById('doc');
const SITE = new URL('./', location.href).href;

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const add = (parent, ...kids) => (parent.append(...kids.filter(Boolean)), parent);
const ytId = (url) => (String(url || '').match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/|v\/)|youtu\.be\/)([\w-]{11})/) || [])[1] || '';
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
};
const levelLabel = (v) => (v >= 90 ? '능숙' : v >= 70 ? '숙련' : v >= 50 ? '실무 활용' : '기본');

function applyPreset(data) {
  const tag = cleanTag(q.get('from'));
  const preset = tag && (data.settings?.links || []).find((l) => cleanTag(l.tag) === tag);
  if (!preset) return;
  const hideW = new Set(preset.hide?.works || []);
  const hideT = new Set(preset.hide?.timeline || []);
  data.projects = data.projects.filter((p) => !hideW.has(p.id));
  // 지원처마다 바꾸는 문구 (비어 있으면 사이트 설정 그대로)
  const ov = preset.site || {};
  if (ov.title) data.settings.siteTitle = ov.title;
  if (ov.role) data.settings.role = ov.role;
  if (ov.intro) data.settings.intro = ov.intro;
  if (Array.isArray(data.settings.timeline)) data.settings.timeline = data.settings.timeline.filter((x) => !hideT.has(x.id));
}

/* ---------- 공통: 머리 · 꼬리 ---------- */
function header(s, title) {
  const h = el('header', 'd-head');
  const who = add(el('div', 'd-who'), el('p', 'd-kicker', title), add(el('h1', 'd-name'), s.nameKo || '', el('span', 'd-name-en', s.nameEn ? '  ' + s.nameEn : '')), el('p', 'd-role', s.role || ''));
  const c = s.contact || {};
  const meta = el('ul', 'd-contact');
  if (c.email) meta.append(add(el('li'), el('b', null, 'Email'), el('span', null, c.email)));
  meta.append(add(el('li'), el('b', null, 'Web'), el('span', null, SITE.replace(/^https?:\/\//, '').replace(/\/$/, ''))));
  // 주소가 첫 화면뿐인 링크(예: https://github.com)는 아직 채우지 않은 자리라 인쇄하지 않음
  const real = (u) => {
    try {
      return new URL(u).pathname.replace(/\/+$/, '').length > 0;
    } catch {
      return false;
    }
  };
  (c.links || []).filter((l) => l?.url && real(l.url)).forEach((l) => meta.append(add(el('li'), el('b', null, l.label || '링크'), el('span', null, l.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')))));
  return add(h, who, meta);
}
function footer(s) {
  return el('footer', 'd-foot', `${s.nameKo || ''} · ${s.role || ''} · ${SITE.replace(/^https?:\/\//, '').replace(/\/$/, '')} · ${today()} 출력`);
}
function section(title, ...kids) {
  return add(el('section', 'd-sec'), el('h2', 'd-h', title), ...kids);
}

/* ---------- 이력서 (1·2페이지) ---------- */
function rows(items) {
  const ol = el('ol', 'd-rows');
  items.forEach((x) => ol.append(add(el('li'), el('time', null, x.period || ''), add(el('div'), el('b', null, x.title || ''), x.org ? el('span', null, x.org) : null))));
  return ol;
}
function toolBars(tools, withDesc) {
  const ul = el('ul', 'd-tools' + (withDesc ? ' is-wide' : ''));
  tools.forEach((t) => {
    const lv = Math.max(0, Math.min(100, Number(t.level) || 0));
    const icon = el('i', 'd-ic');
    icon.innerHTML = window.skillIconSvg ? window.skillIconSvg(t.icon, 16) : '';
    const bar = el('span', 'd-bar');
    bar.append(el('i'));
    bar.firstChild.style.width = lv + '%';
    const li = add(el('li'), icon, el('b', null, t.name), bar, el('em', null, String(lv)));
    if (withDesc) li.append(el('p', 'd-tool-desc', `${levelLabel(lv)}${t.desc ? ' · ' + t.desc : ''}`));
    ul.append(li);
  });
  return ul;
}
function resume(data) {
  const s = data.settings;
  const tl = timelineItems(s);
  const career = tl.filter((x) => x.type !== '교육').slice().reverse();
  const edu = tl.filter((x) => x.type === '교육').slice().reverse();
  const tools = (s.skillChart || []).filter((x) => x && x.group === 'tool' && x.name);
  add(
    doc,
    header(s, '이력서'),
    s.intro ? add(el('section', 'd-sec d-lead'), el('p', 'd-intro', s.intro)) : null,
    add(el('div', 'd-cols'), career.length ? section('경력', rows(career)) : null, edu.length ? section('교육', rows(edu)) : null),
    s.about?.bio ? section('자기소개', el('p', 'd-text', s.about.bio)) : null,
    tools.length ? section('툴 숙련도', toolBars(tools, false)) : null,
    footer(s)
  );
  return '이력서';
}

/* ---------- 연혁 ---------- */
function timeline(data) {
  const s = data.settings;
  const ol = el('ol', 'd-tl');
  timelineItems(s).forEach((x) => {
    const li = add(el('li'), add(el('p', 'd-tl-meta'), el('time', null, x.period || ''), x.type ? el('span', 'd-tag', x.type) : null), el('h3', null, x.title || ''), x.org ? el('p', 'd-tl-org', x.org) : null, x.desc ? el('p', 'd-text', x.desc) : null);
    if (x.tasks?.length) {
      li.append(el('p', 'd-tl-label', x.type === '교육' ? '배운 내용' : '주요 업무'));
      const ul = el('ul', 'd-bul');
      x.tasks.forEach((t) => ul.append(el('li', null, t)));
      li.append(ul);
    }
    ol.append(li);
  });
  add(doc, header(s, '연혁'), s.timelineIntro ? el('p', 'd-intro small', s.timelineIntro) : null, ol, footer(s));
  return '연혁';
}

/* ---------- 스킬 ---------- */
function skills(data) {
  const s = data.settings;
  const tools = (s.skillChart || []).filter((x) => x && x.group === 'tool' && x.name);
  add(doc, header(s, '툴 숙련도'), s.skillsIntro ? el('p', 'd-intro small', s.skillsIntro) : null, toolBars(tools, true), footer(s));
  return '툴 숙련도';
}

/* ---------- 작업 ---------- */
function links(p, full) {
  const ul = el('ul', 'd-links');
  const item = (label, url) => url && ul.append(add(el('li'), el('b', null, label), el('span', null, full ? url : url.replace(/^https?:\/\/(www\.)?/, ''))));
  if (/^https?:\/\//i.test(p.link || '')) item('사이트', p.link);
  if (ytId(p.video)) item('영상', p.video);
  if (p.pdf) item('기획서 PDF', new URL(p.pdf, SITE).href);
  return ul.childElementCount ? ul : null;
}
const metaOf = (p) => [p.docType, p.category, p.year].filter(Boolean).join(' · ');
function works(data) {
  const s = data.settings;
  const grid = el('ol', 'd-works');
  data.projects.forEach((p, i) => {
    const img = p.thumb || p.cover;
    grid.append(
      add(
        el('li'),
        img ? Object.assign(el('img'), { src: img, alt: '' }) : el('div', 'd-noimg'),
        add(el('div', 'd-work-tx'), el('p', 'd-work-meta', `${String(i + 1).padStart(2, '0')}  ${metaOf(p)}`), el('h3', null, p.title), p.subtitle ? el('p', 'd-work-sub', p.subtitle) : null, el('p', 'd-text', p.summary || ''), links(p, false))
      )
    );
  });
  add(doc, header(s, `작업 목록 · ${data.projects.length}건`), grid, footer(s));
  return '작업 목록';
}
function work(data) {
  const s = data.settings;
  const p = data.projects.find((x) => x.id === q.get('id'));
  if (!p) {
    doc.append(el('p', 'd-empty', '찾는 작업이 없어요. 사이트에서 다시 눌러 주세요.'));
    return null;
  }
  const img = p.thumb || p.cover;
  const gallery = (p.gallery || []).filter((g) => g?.src);
  const gal = el('ol', 'd-gal');
  gallery.forEach((g) => gal.append(add(el('li'), Object.assign(el('img'), { src: g.src, alt: '' }), g.caption ? el('p', null, g.caption) : null)));
  add(
    doc,
    header(s, '포트폴리오'),
    add(el('section', 'd-sec d-work-head'), el('p', 'd-kicker', metaOf(p)), el('h2', 'd-work-title', p.title), p.subtitle ? el('p', 'd-work-sub', p.subtitle) : null, p.summary ? el('p', 'd-intro', p.summary) : null),
    img ? add(el('figure', 'd-cover'), Object.assign(el('img'), { src: img, alt: '' })) : null,
    p.description ? section('설명', el('p', 'd-text', p.description)) : null,
    p.tags?.length ? add(el('ul', 'd-tags'), ...p.tags.map((t) => el('li', null, '#' + t.replace(/\s+/g, '')))) : null,
    links(p, true) ? section('링크', links(p, true)) : null,
    gallery.length ? section('소개 이미지', gal) : null,
    footer(s)
  );
  return p.title;
}

/* ---------- 시작 ---------- */
const PARTS = { resume, timeline, skills, works, work };
document.getElementById('do-print').addEventListener('click', () => window.print());
document.getElementById('do-close').addEventListener('click', () => (history.length > 1 ? history.back() : window.close()));

(async () => {
  try {
    const data = await (await fetch('data/site.json', { cache: 'no-store' })).json();
    data.projects = (data.projects || []).filter((p) => p.visible !== false);
    applyPreset(data);
    document.documentElement.dataset.part = part;
    const name = (PARTS[part] || resume)(data);
    if (!name) return;
    document.title = `${data.settings.nameKo || ''} · ${name}`;
    document.getElementById('pbar-hint').textContent = `${name} · A4로 맞춰져 있어요. 인쇄 창에서 ‘PDF로 저장’을 고르면 파일로 받을 수 있어요.`;
    // 글꼴·이미지가 다 들어온 뒤 인쇄 창을 엶 (?print=0 이면 열지 않음)
    await document.fonts?.ready;
    await Promise.all([...doc.querySelectorAll('img')].map((i) => (i.complete ? 0 : new Promise((r) => ((i.onload = r), (i.onerror = r))))));
    if (q.get('print') !== '0') setTimeout(() => window.print(), 300);
  } catch (err) {
    console.error(err);
    doc.append(el('p', 'd-empty', '내용을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.'));
  }
})();
