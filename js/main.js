import { MorphStage, FallbackStage } from './morph.js?v=202611090805';
import { PdfViewer } from './pdf-viewer.js?v=202611090805';
import { renderSkillChart } from './skills.js?v=202611090805';
import { renderTimeline, timelineItems } from './timeline.js?v=202611090805';
import { initWorks, scatter } from './works.js?v=202611090805';
import { initAnalytics } from './analytics.js?v=202611090805';

// 관리자 대시보드의 클릭 히트맵 미리보기용 (?embed): 기록·전환 버튼 없이 화면만
const EMBED = new URLSearchParams(location.search).has('embed');
let onTimelineFocus = null; // 타임라인에서 보는 항목이 바뀔 때 (boot에서 채움)
const SPLASH_MIN = EMBED ? 0 : 1500; // 열리는 화면 최소 표시 시간 (PORTFOLIO 0.7초 + 잠깐 멈춤)
const bootAt = performance.now();
if (EMBED) document.documentElement.classList.add('is-embed');
// 스타일은 Editorial 하나 (예전 페이지가 캐시에 남아 다른 스타일을 고르더라도 덮어씀)
document.documentElement.dataset.theme = 'editorial';
try {
  localStorage.removeItem('pf-theme');
} catch {}

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const el = (tag, props = {}, ...children) => {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...children.filter((c) => c != null));
  return n;
};
const pad = (n) => String(n).padStart(2, '0');
const thumbOf = (p) => p?.thumb || p?.cover || null;
const metaOf = (p) => [p?.category, p?.year].filter(Boolean).join(' · ');

/* ------------------------------------------------------------------ */
/* 콘텐츠 렌더링 — 같은 데이터를 스타일마다 다른 모양으로 그림              */
/*   [data-bind]  글자 하나       [data-list] 목록 (data-variant로 모양 선택) */
/* ------------------------------------------------------------------ */
function workItem(p, i, variant) {
  const img = thumbOf(p);
  const pic = (cls) => (img ? el('img', { className: cls, src: img, alt: '', loading: 'lazy', decoding: 'async' }) : el('span', { className: cls + ' is-empty', textContent: p.title }));
  let btn;
  if (variant === 'latest') {
    // Editorial 첫 화면 유리 띠: 최근 작업 글
    btn = el(
      'button', { className: 'work-card ed-post', type: 'button' },
      el('span', { className: 'ed-post-head' }, el('b', { textContent: p.title }), el('span', { textContent: p.year || '' })),
      el('span', { className: 'ed-post-text', textContent: p.summary || p.subtitle || '' }),
      el('span', { className: 'ed-post-tags', textContent: (p.tags || []).slice(0, 3).map((t) => '#' + t.replace(/\s+/g, '')).join(' ') })
    );
  } else {
    // 썸네일 카드: 문서 종류 · 제목 · 한 줄 소개 · 장르·연도 (예시 작업물은 '예시' 표시)
    btn = el(
      'button', { className: 'work-card', type: 'button' },
      el(
        'span', { className: 'card-media' }, pic('card-img'),
        el('span', { className: 'card-no', textContent: pad(i + 1) }),
        p.docType || p.sample ? el('span', { className: 'card-doc' }, p.docType || '', p.sample ? el('em', { className: 'card-sample', textContent: '예시' }) : null) : null,
        el('span', { className: 'card-open', textContent: p.pdf ? 'PDF 보기 ↗' : '자세히 보기 ↗' })
      ),
      el('span', { className: 'card-meta' }, el('span', { className: 'card-title', textContent: p.title }), el('span', { className: 'card-info small', textContent: metaOf(p) }), el('span', { className: 'card-sub small', textContent: p.subtitle || p.summary || '' }))
    );
  }
  btn.dataset.index = i;
  btn.setAttribute('aria-label', `${p.title} 기획서 보기`);
  return el('li', {}, btn);
}

function render({ settings: s, projects }) {
  document.title = s.siteTitle || `${s.nameKo} — Portfolio`;
  const binds = {
    nameKo: s.nameKo, nameEn: s.nameEn, role: s.role, eyebrow: s.eyebrow, intro: s.intro,
    aboutHeading: s.about?.heading, bio: s.about?.bio, worksIntro: s.worksIntro,
    contactHeading: s.contact?.heading, contactMessage: s.contact?.message, email: s.contact?.email,
    nameEnLines: (s.nameEn || '').trim().split(/\s+/).join('\n'),
    initials: (s.nameEn || s.nameKo || '').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase(),
    year: new Date().getFullYear(),
    skillsHeading: s.skillsHeading || 'Skills',
    skillsIntro: s.skillsIntro || '',
    timelineHeading: s.timelineHeading || 'Timeline',
    timelineIntro: s.timelineIntro || '',
    timelineRange: '',
  };
  const tl = timelineItems(s);
  const years = tl.map((x) => Math.floor(x._k / 100)).filter(Boolean);
  if (years.length) binds.timelineRange = years[0] === years[years.length - 1] ? String(years[0]) : `${years[0]} — ${years[years.length - 1]}`;
  $$('[data-bind]').forEach((n) => (n.textContent = binds[n.dataset.bind] ?? ''));
  $$('[data-bind-href="mailto"]').forEach((n) => {
    n.href = s.contact?.email ? `mailto:${s.contact.email}` : '#';
    n.hidden = !s.contact?.email;
  });

  const links = (s.contact?.links || []).filter((l) => /^https?:\/\//i.test(l.url));
  const skills = s.about?.skills || [];
  const tools = s.about?.tools || [];
  const lists = {
    meta: () =>
      (s.meta || []).map((m, i) => {
        const d = el('div', {}, el('dt', { textContent: m.label }), el('dd', { textContent: m.value }));
        d.style.setProperty('--d', i);
        return d;
      }),
    skills: () => skills.map((t) => el('li', { textContent: t })),
    tools: () => tools.map((t) => el('li', { textContent: t })),
    links: () => links.map((l) => el('li', {}, el('a', { href: l.url, target: '_blank', rel: 'noopener', textContent: l.label + ' ↗' }))),
    'links-plain': () => links.map((l) => el('li', {}, el('a', { href: l.url, target: '_blank', rel: 'noopener', textContent: l.label }))),
    // 왼쪽 레일: 링크를 로고 아이콘으로
    'links-icons': () =>
      links.map((l) => {
        const a = el('a', { href: l.url, target: '_blank', rel: 'noopener', title: l.label });
        a.setAttribute('aria-label', l.label);
        a.innerHTML = window.linkIconSvg ? window.linkIconSvg(l.label, l.url, 18) : '';
        if (!a.innerHTML) a.textContent = l.label;
        return el('li', {}, a);
      }),
    'works-count': (v, node) => [node.tagName === 'SUP' ? `(${pad(projects.length)})` : pad(projects.length)],
    works: (v) => {
      if (!projects.length) return [el('li', { className: 'works-empty small', textContent: '아직 등록된 포트폴리오가 없습니다.' })];
      return (v === 'latest' ? projects.slice(0, 2) : projects).map((p, i) => workItem(p, i, v));
    },
  };
  $$('[data-list]').forEach((node) => {
    const fn = lists[node.dataset.list];
    if (fn) node.replaceChildren(...fn(node.dataset.variant, node));
  });

  renderSkillChart($('#skill-chart'), s.skillChart);
  initWorks($('#works'), projects, s.docTypes || []);
  renderTimeline($('#timeline-track'), tl, { onFocus: (it) => onTimelineFocus?.(it) });

  // 박스 안의 정지 이미지 (Pixel 스타일에서 캔버스가 없는 섹션에 보임)
  $$('img.slot-img[data-img]').forEach((img) => {
    const im = s.images?.[img.dataset.img];
    if (im?.src) {
      img.src = im.src;
      img.style.objectPosition = `${(im.focusX ?? 0.5) * 100}% 50%`;
    }
  });
}

/* ------------------------------------------------------------------ */
/* 풀페이지 스크롤 컨트롤러                                               */
/* ------------------------------------------------------------------ */
class Deck {
  constructor(deckEl, onChange) {
    this.el = deckEl;
    this.panels = $$('.panel', deckEl);
    this.index = 0;
    this.onChange = onChange;
    this.enabled = true;
    this.lockUntil = 0;
    this.navTime = 0;
    this.lastWheel = 0;
    this.lastDelta = 0;
    this.innerScrollAt = 0;

    this._setVh();
    window.addEventListener('resize', () => {
      this._setVh();
      this._apply(false);
    });
    window.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });
    window.addEventListener('keydown', (e) => this._onKey(e));
    this._bindTouch();
    window.addEventListener('hashchange', () => this.goToHash());
    // 앵커 이동·포커스 등으로 생기는 브라우저 기본 스크롤을 막고, 덱 위치만 사용
    const resetScroll = () => {
      if (window.scrollY || window.scrollX) window.scrollTo(0, 0);
      this.panels.forEach((p) => p.scrollTop && (p.scrollTop = 0));
    };
    window.addEventListener('scroll', resetScroll);
    this.panels.forEach((p) => p.addEventListener('scroll', resetScroll));
    // 키보드 Tab으로 다른 섹션의 요소에 포커스가 가면 그 섹션으로 이동
    deckEl.addEventListener('focusin', (e) => {
      const i = this.panels.indexOf(e.target.closest('.panel'));
      if (i > -1 && i !== this.index && this.enabled) this.go(i);
      resetScroll();
    });
  }

  _setVh() {
    this.vh = window.innerHeight;
    document.documentElement.style.setProperty('--vh', this.vh + 'px');
  }
  _apply(animate = true) {
    this.el.classList.toggle('no-anim', !animate);
    this.el.style.transform = `translate3d(0, ${-this.index * this.vh}px, 0)`;
    if (!animate) requestAnimationFrame(() => this.el.classList.remove('no-anim'));
  }
  go(i, { animate = true, step = false } = {}) {
    i = Math.max(0, Math.min(this.panels.length - 1, i));
    if (i === this.index && animate) return;
    const prev = this.index;
    this.index = i;
    this.navTime = performance.now();
    this.lockUntil = this.navTime + 1000;
    this._apply(animate);
    const panel = this.panels[i];
    this.panels.forEach((p, k) => {
      p.classList.toggle('is-active', k === i);
      p._h?.activate(k === i, step && i < prev); // 가로 타임라인: 아래 페이지에서 한 칸 올라오면 끝에서, 메뉴로 오면 처음부터
    });
    panel.querySelectorAll('[data-scroll]').forEach((s) => (s.scrollTop = 0));
    history.replaceState(null, '', '#' + panel.id);
    this.onChange?.(i, panel);
  }
  goToHash() {
    const i = this.panels.findIndex((p) => '#' + p.id === location.hash);
    if (i > -1 && i !== this.index) this.go(i);
    window.scrollTo(0, 0);
  }

  _scrollable(target, dir) {
    let n = target instanceof Element ? target.closest('[data-scroll]') : null;
    while (n) {
      const max = n.scrollHeight - n.clientHeight;
      const oy = getComputedStyle(n).overflowY;
      const canScroll = (oy === 'auto' || oy === 'scroll') && n.offsetParent !== null;
      if (canScroll && max > 2 && (dir > 0 ? n.scrollTop < max - 2 : n.scrollTop > 2)) return n;
      n = n.parentElement?.closest('[data-scroll]');
    }
    return null;
  }
  _onWheel(e) {
    if (!this.enabled || e.ctrlKey) return;
    const dy = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : 0;
    const dir = Math.sign(dy);
    if (!dir) return;
    const now = performance.now();
    if (this._scrollable(e.target, dir)) {
      this.innerScrollAt = now; // 내부 목록 스크롤은 그대로 둠
      return;
    }
    e.preventDefault();
    const strong = Math.abs(dy) > this.lastDelta * 1.25 || now - this.lastWheel > 180;
    this.lastDelta = Math.abs(dy);
    this.lastWheel = now;
    if (now < this.lockUntil) return;
    if (!strong && now - this.navTime < 1600) return; // 트랙패드 관성 무시
    // 가로 타임라인: 끝에 닿기 전까지는 휠을 옆으로 이동하는 데 씀. 끝에 닿으면 계속 굴려도 바로 다음 페이지로
    const h = this.panels[this.index]._h;
    if (h) {
      if (!h.wheel(dy)) this.go(this.index + dir, { step: true });
      return;
    }
    if (now - this.innerScrollAt < 450) {
      // 목록 끝에 닿은 뒤에도 계속 굴리는 중이면 넘어가지 않음 → 잠깐 멈췄다가 다시 굴리면 다음 섹션
      this.innerScrollAt = now;
      return;
    }
    if (Math.abs(dy) < 4) return;
    this.go(this.index + dir, { step: true });
  }
  _onKey(e) {
    if (!this.enabled || e.altKey || e.metaKey || e.ctrlKey) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    const map = { ArrowDown: 1, PageDown: 1, ' ': 1, ArrowUp: -1, PageUp: -1 };
    if (e.key === 'Home') return e.preventDefault(), this.go(0);
    if (e.key === 'End') return e.preventDefault(), this.go(this.panels.length - 1);
    const dir = map[e.key];
    const h = this.panels[this.index]._h;
    const hd = { ArrowRight: 1, ArrowLeft: -1 }[e.key] || (e.shiftKey ? 0 : dir);
    if (h && hd && performance.now() > this.lockUntil - 400 && h.page(hd)) return e.preventDefault();
    if (!dir) return;
    if (e.key === ' ' && e.shiftKey) return e.preventDefault(), this.go(this.index - 1, { step: true });
    if (this._scrollable(document.activeElement, dir) && document.activeElement !== document.body) return;
    e.preventDefault();
    if (performance.now() < this.lockUntil - 400) return;
    this.go(this.index + dir, { step: true });
  }
  _bindTouch() {
    let x0 = 0, y0 = 0, t0 = 0, inner = false, hs = false, target = null;
    window.addEventListener('touchstart', (e) => {
      if (!this.enabled) return;
      x0 = e.touches[0].clientX;
      y0 = e.touches[0].clientY;
      t0 = performance.now();
      target = e.target;
      inner = false;
      hs = !!target.closest?.('[data-hscroll]'); // 가로 타임라인 위: 옆으로 미는 건 브라우저에 맡김
    }, { passive: true });
    window.addEventListener('touchmove', (e) => {
      if (!this.enabled) return;
      const dy = y0 - e.touches[0].clientY;
      const dir = Math.sign(dy);
      if (!inner && dir && this._scrollable(target, dir)) inner = true;
      if (!inner && !hs && e.cancelable) e.preventDefault();
    }, { passive: false });
    window.addEventListener('touchend', (e) => {
      if (!this.enabled || inner) return;
      const dy = y0 - e.changedTouches[0].clientY;
      const dx = x0 - e.changedTouches[0].clientX;
      if (hs && Math.abs(dx) > Math.abs(dy)) return;
      const fast = performance.now() - t0 < 400;
      if (Math.abs(dy) > (fast ? 30 : 70) && performance.now() > this.lockUntil - 300) {
        // 타임라인 페이지에서는 위아래로 밀어도 먼저 옆으로 넘기고, 끝이면 다음 페이지
        const h = this.panels[this.index]._h;
        if (h && h.page(Math.sign(dy))) return;
        this.go(this.index + Math.sign(dy), { step: true });
      }
    }, { passive: true });
  }
}

/* ------------------------------------------------------------------ */
/* 시작                                                                 */
/* ------------------------------------------------------------------ */

async function boot() {
  let data;
  try {
    // GitHub Pages는 CDN 캐시가 있으므로 매번 새로 받아옴
    const res = await fetch('data/site.json?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    data = await res.json();
    data.projects = (data.projects || []).filter((p) => p.visible !== false);
  } catch (e) {
    $('.loader-name').textContent = '데이터를 불러오지 못했습니다.';
    $('.loader-bar').hidden = true;
    return;
  }
  render(data);
  const { settings, projects } = data;
  const images = settings.images || {};
  const state = { section: 'hero' };

  // 모핑 스테이지 — 화면이 정말 느릴 때만 가벼운 사진 전환으로 바꿈
  const canvas = $('#stage');
  const lightStage = () => {
    const box = el('div', { className: 'stage-fallback' });
    document.body.prepend(box);
    const fb = new FallbackStage(box);
    fb.setMode(2);
    return fb;
  };
  let stage;
  try {
    if (!MorphStage.supported(canvas)) throw new Error('no webgl');
    stage = new MorphStage(canvas, {
      onSlow: () => {
        stage.destroy();
        stage = lightStage();
        showSection();
      },
    });
  } catch {
    canvas.remove();
    stage = lightStage();
  }
  stage.preload([...Object.values(images).map((i) => i.src), ...projects.map(thumbOf), ...timelineItems(settings).map((x) => x.image).filter(Boolean)]);

  stage.setMode(2, { instant: true }); // Editorial 색보정 (청록 회색)

  // Timeline·Skills 사진이 없으면 About 사진을 씀
  const sectionImage = (key) => (images[key]?.src ? images[key] : key === 'skills' || key === 'timeline' ? images.about || {} : images[key] || {});
  const showSection = (opts) => {
    // 첫 화면은 이름이 오른쪽에 오도록 사진을 좌우 반전
    stage.flip = state.section === 'hero';
    const im = sectionImage(state.section);
    stage.show(im.src, im.focusX ?? 0.5, opts);
  };

  // 타임라인: 보고 있는 항목에 배경 사진이 있으면 그 사진으로 모핑, 없으면 기본 배경
  let tlTimer;
  let tlShown = null;
  onTimelineFocus = (it) => {
    clearTimeout(tlTimer);
    tlTimer = setTimeout(() => {
      if (state.section !== 'timeline') return;
      const src = it?.image || null;
      document.body.classList.toggle('tl-photo', !!src);
      if (src === tlShown) return;
      tlShown = src;
      if (src) stage.show(src, it.focusX ?? 0.5, { duration: 1200 });
      else showSection({ duration: 1200 });
    }, 260);
  };

  // 풀페이지 덱
  const navLinks = $$('.nav a');
  const dots = $$('.dots button');
  const total = $$('.panel').length;
  $('.pager-total').textContent = pad(total);
  // 왼쪽 레일: 페이지 번호 목록 + 진행 막대 + 지금 페이지 이름
  const railPages = $('.rail-pages');
  const railSteps = navLinks.map((a, k) => {
    const name = a.lastChild?.textContent?.trim() || '';
    const b = el('button', { type: 'button', className: 'rail-step', title: name, textContent: pad(k + 1) });
    b.dataset.go = k;
    b.setAttribute('aria-label', `${pad(k + 1)} ${name}`);
    b._name = name;
    return b;
  });
  const railName = el('p', { className: 'rail-name' });
  if (railPages) {
    railPages.replaceChildren(el('i', { className: 'rail-track' }, el('i', { className: 'rail-fill' })), el('div', { className: 'rail-steps' }, ...railSteps), railName);
    railPages.style.setProperty('--n', total);
  }
  const deck = new Deck($('#deck'), (i, panel) => {
    state.section = panel.dataset.key;
    document.body.dataset.section = state.section;
    // 이번에 들어온 섹션의 내용마다 날아올 방향·시간차를 새로 뽑음
    panel.querySelectorAll('.reveal').forEach(scatter);
    document.body.classList.remove('is-previewing', 'tl-photo');
    tlShown = null;
    navLinks.forEach((a, k) => a.classList.toggle('is-active', k === i));
    dots.forEach((d, k) => d.classList.toggle('is-active', k === i));
    $('#pager-cur').textContent = pad(i + 1);
    $('#pager-fill').style.width = ((i + 1) / total) * 100 + '%';
    railSteps.forEach((b, k) => {
      b.classList.toggle('is-active', k === i);
      b.classList.toggle('is-past', k < i);
      if (k === i) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    railPages?.style.setProperty('--p', total > 1 ? i / (total - 1) : 1);
    railName.textContent = railSteps[i]?._name || '';
    railName.classList.remove('swap');
    void railName.offsetWidth; // 이름이 바뀔 때마다 등장 애니메이션 다시
    railName.classList.add('swap');
    showSection();
  });
  $$('.pager-btn').forEach((b) => b.addEventListener('click', () => deck.go(deck.index + Number(b.dataset.step), { step: true })));
  $$('[data-go]').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      deck.go(Number(a.dataset.go));
    })
  );

  // 작업 카드: 마우스를 올리면 모핑, 클릭하면 PDF
  const viewer = new PdfViewer({
    onOpen: () => (deck.enabled = false),
    onClose: () => (deck.enabled = true),
  });
  const previewText = $('[data-preview]');
  let hoverTimer;
  const hover = (i) => {
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => {
      if (state.section !== 'works') return;
      // 배경 전체가 커버로 모핑되고, 목록에서 벗어나면 원래 사진으로
      const p = projects[i];
      document.body.classList.toggle('is-previewing', !!p);
      if (p) stage.show(thumbOf(p) || images.works?.src, 0.5, { duration: 1200 });
      else showSection({ duration: 1200 });
      if (previewText) previewText.textContent = p ? p.summary || p.subtitle || '' : '';
    }, i != null ? 90 : 220);
  };
  document.addEventListener('pointerover', (e) => {
    const b = e.target.closest?.('.work-card[data-index]');
    if (b && e.pointerType === 'mouse') hover(Number(b.dataset.index));
  });
  $$('.layout-mono [data-list="works"]').forEach((list) => list.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && hover(null)));
  document.addEventListener('focusin', (e) => {
    const b = e.target.closest?.('.work-card[data-index]');
    if (b) hover(Number(b.dataset.index));
  });
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.work-card[data-index]');
    if (b) viewer.open(projects[b.dataset.index], b);
  });

  // 첫 화면
  // 새로 들어오면 항상 첫 페이지부터 (주소에 #about 등이 남아 있어도 무시).
  // 관리자 클릭 히트맵 미리보기(?embed)만 주소의 섹션으로 바로 감
  const start = EMBED ? Math.max(0, $$('.panel').findIndex((p) => '#' + p.id === location.hash)) : 0;
  if (!EMBED && location.hash) history.replaceState(null, '', location.pathname + location.search);
  state.section = $$('.panel')[start].dataset.key;
  await Promise.race([stage.load ? stage.load(sectionImage(state.section).src) : Promise.resolve(), new Promise((r) => setTimeout(r, 4000))]);
  initAnalytics(settings.analytics);
  deck.go(start, { animate: false });
  const wait = Math.max(0, SPLASH_MIN - (performance.now() - bootAt));
  setTimeout(() => requestAnimationFrame(() => document.body.classList.add('is-ready')), wait);
}

boot();
