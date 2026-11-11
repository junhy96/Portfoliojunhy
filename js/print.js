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
import { timelineItems, careerTotal } from './timeline.js?v=202611110301';
import { cleanTag } from './analytics.js?v=202611110301';

const q = new URLSearchParams(location.search);
const part = q.get('part') || 'resume';
const doc = document.getElementById('doc');
// 사이트 주소: 실제 주소 기준 (내 컴퓨터에서 미리 볼 때도 localhost가 찍히지 않게)
const SITE = /^(localhost|127\.)/.test(location.hostname) ? 'https://junhy96.github.io/Portfoliojunhy/' : new URL('./', location.href).href;

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
  if (ov.careerTotal) data.settings._careerTotal = true;
  if (ov.coverLetter) data.settings.about = { ...(data.settings.about || {}), coverLetter: ov.coverLetter };
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
  // 긴 주소는 줄여서 보여 주고, PDF에서 누르면 원래 주소로
  const short = (u) => {
    const t = u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
    return t.length > 30 ? t.slice(0, 28) + '…' : t;
  };
  (c.links || []).filter((l) => l?.url && real(l.url)).forEach((l) => meta.append(add(el('li'), el('b', null, l.label || '링크'), Object.assign(el('a', 'd-link', short(l.url)), { href: l.url }))));
  return add(h, who, meta);
}
function footer(s) {
  return el('footer', 'd-foot', `${s.nameKo || ''} · ${s.role || ''} · ${SITE.replace(/^https?:\/\//, '').replace(/\/$/, '')} · ${today()} 출력`);
}
// 경력 제목 옆에 작은 회색 글씨로 총경력 (지원처 링크에서 켰을 때)
function withTotal(sec, total) {
  if (total) sec.querySelector('.d-h').append(el('small', 'd-total', total));
  return sec;
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
// 툴 아이콘 색 (각 브랜드 대표색)
const BRAND = { unreal: '#0e1128', unity: '#222c37', claude: '#d97757', mysql: '#4479a1', excel: '#217346', powerpoint: '#c43e1c', word: '#2b579a', lua: '#2c2d72', python: '#3776ab', confluence: '#0052cc', jira: '#0052cc', git: '#f05032', figma: '#f24e1e', blender: '#e87d0d', csharp: '#68217a' };
function toolBars(tools, withDesc) {
  const ul = el('ul', 'd-tools' + (withDesc ? ' is-wide' : ''));
  tools.forEach((t) => {
    const lv = Math.max(0, Math.min(100, Number(t.level) || 0));
    const icon = el('i', 'd-ic');
    icon.innerHTML = window.skillIconSvg ? window.skillIconSvg(t.icon, 16) : '';
    if (BRAND[t.icon]) icon.style.color = BRAND[t.icon]; // 툴 로고를 각 브랜드 색으로
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
  // 1쪽: 사진 · 간략 소개(Who?) · 경력 · 교육 · 툴
  const head = header(s, '이력서');
  const photo = Object.assign(el('img', 'd-photo'), { src: 'uploads/site/photo-resume-color.jpg', alt: '' });
  head.prepend(photo);
  head.classList.add('has-photo');
  add(
    doc,
    head,
    s.intro ? section('Who?', el('p', 'd-intro', s.intro)) : null,
    add(el('div', 'd-cols'), career.length ? withTotal(section('경력', rows(career)), s._careerTotal ? careerTotal(tl) : '') : null, edu.length ? section('교육', rows(edu)) : null),
    tools.length ? section('툴 숙련도', toolBars(tools, false)) : null,
    footer(s)
  );
  // 2쪽: 자기소개서
  const letter = (s.about?.coverLetter || s.about?.bio || '').trim();
  if (letter) {
    const doc2 = el('main', 'doc d-page2');
    const body = el('div', 'd-letter');
    letter.split('\n').map((t) => t.trim()).filter(Boolean).forEach((t) => {
      const m = t.match(/^[〈<]\s*(.+?)\s*[〉>]$/);
      body.append(m ? el('h3', 'd-letter-h', m[1]) : el('p', null, t));
    });
    add(doc2, header(s, '자기소개서'), section('자기소개서', body), footer(s));
    doc.after(doc2);
  }
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
