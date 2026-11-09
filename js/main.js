import { MorphStage, FallbackStage } from './morph.js';
import { PdfViewer } from './pdf-viewer.js';
import { paintPixelArt } from './pixel-art.js';

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
  if (variant === 'tiles') {
    // Pixel: 썸네일 타일
    btn = el('button', { className: 'work-card px-tile', type: 'button' }, el('span', { className: 'px-tile-media' }, pic('px-tile-img')), el('span', { className: 'px-tile-name', textContent: p.title }));
  } else if (variant === 'latest') {
    // Editorial 첫 화면 유리 띠: 최근 작업 글
    btn = el(
      'button', { className: 'work-card ed-post', type: 'button' },
      el('span', { className: 'ed-post-head' }, el('b', { textContent: p.title }), el('span', { textContent: p.year || '' })),
      el('span', { className: 'ed-post-text', textContent: p.summary || p.subtitle || '' }),
      el('span', { className: 'ed-post-tags', textContent: (p.tags || []).slice(0, 3).map((t) => '#' + t.replace(/\s+/g, '')).join(' ') })
    );
  } else if (variant === 'reel') {
    // Editorial Works 유리 띠
    btn = el('button', { className: 'work-card ed-reel-item', type: 'button' }, pic('ed-reel-img'), el('span', { className: 'ed-reel-no', textContent: pad(i + 1) }), el('b', { textContent: p.title }), el('small', { textContent: p.category || '' }));
  } else {
    // Mono: 썸네일 그리드 카드
    btn = el(
      'button', { className: 'work-card', type: 'button' },
      el('span', { className: 'card-media' }, pic('card-img'), el('span', { className: 'card-no', textContent: pad(i + 1) }), el('span', { className: 'card-open', textContent: p.pdf ? 'PDF 보기 ↗' : '자세히 보기 ↗' })),
      el('span', { className: 'card-meta' }, el('span', { className: 'card-title', textContent: p.title }), el('span', { className: 'card-info small', textContent: metaOf(p) }), el('span', { className: 'card-sub small', textContent: p.subtitle || '' }))
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
  };
  $$('[data-bind]').forEach((n) => (n.textContent = binds[n.dataset.bind] ?? ''));
  $$('[data-bind-href="mailto"]').forEach((n) => {
    n.href = s.contact?.email ? `mailto:${s.contact.email}` : '#';
    n.hidden = !s.contact?.email;
  });

  const links = (s.contact?.links || []).filter((l) => /^https?:\/\//i.test(l.url));
  const skills = s.about?.skills || [];
  const tools = s.about?.tools || [];
  const exp = s.about?.experience || [];
  const lists = {
    meta: (v) =>
      (s.meta || []).map((m, i) => {
        if (v === 'pixel') {
          // Pixel 정보 바: 항목마다 픽셀 아이콘 하나
          const icon = ['star', 'wrench', 'pin', 'flag'][i % 4];
          const i_ = el('i', { className: 'px-icon' });
          i_.dataset.icon = icon;
          i_.setAttribute('aria-hidden', 'true');
          return el('div', { className: 'px-meta' }, i_, el('dt', { textContent: m.label }), el('dd', { textContent: m.value }));
        }
        const d = el('div', {}, el('dt', { textContent: m.label }), el('dd', { textContent: m.value }));
        d.style.setProperty('--d', i);
        return d;
      }),
    skills: (v) => (v === 'inline' ? [skills.join(' · ')] : skills.map((t) => el('li', { textContent: t }))),
    tools: (v) =>
      v === 'inline'
        ? [tools.join(' · ')]
        : v === 'inventory'
          ? tools.map((t) => el('li', { textContent: t }))
          : tools.map((t) => el('li', { textContent: t })),
    experience: (v) =>
      v === 'short'
        ? exp.slice(0, 3).map((x) => el('li', {}, el('b', { textContent: x.period }), ' ', x.title))
        : exp.map((x) => el('li', {}, el('time', { textContent: x.period }), el('div', {}, el('strong', { textContent: x.title }), el('span', { textContent: x.desc })))),
    links: () => links.map((l) => el('li', {}, el('a', { href: l.url, target: '_blank', rel: 'noopener', textContent: l.label + ' ↗' }))),
    'links-plain': () => links.map((l) => el('li', {}, el('a', { href: l.url, target: '_blank', rel: 'noopener', textContent: l.label }))),
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

  // 박스 안의 정지 이미지 (Pixel 스타일에서 캔버스가 없는 섹션에 보임)
  $$('img.slot-img[data-img]').forEach((img) => {
    const im = s.images?.[img.dataset.img];
    if (im?.src) {
      img.src = im.src;
      img.style.objectPosition = `${(im.focusX ?? 0.5) * 100}% 50%`;
    }
  });
  paintPixelArt();
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
  go(i, { animate = true } = {}) {
    i = Math.max(0, Math.min(this.panels.length - 1, i));
    if (i === this.index && animate) return;
    this.index = i;
    this.navTime = performance.now();
    this.lockUntil = this.navTime + 1000;
    this._apply(animate);
    const panel = this.panels[i];
    this.panels.forEach((p, k) => p.classList.toggle('is-active', k === i));
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
    if (now - this.innerScrollAt < 450) {
      // 목록 끝에 닿은 뒤에도 계속 굴리는 중이면 넘어가지 않음 → 잠깐 멈췄다가 다시 굴리면 다음 섹션
      this.innerScrollAt = now;
      return;
    }
    if (now < this.lockUntil) return;
    if (!strong && now - this.navTime < 1600) return; // 트랙패드 관성 무시
    if (Math.abs(dy) < 4) return;
    this.go(this.index + dir);
  }
  _onKey(e) {
    if (!this.enabled || e.altKey || e.metaKey || e.ctrlKey) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    const map = { ArrowDown: 1, PageDown: 1, ' ': 1, ArrowUp: -1, PageUp: -1 };
    if (e.key === 'Home') return e.preventDefault(), this.go(0);
    if (e.key === 'End') return e.preventDefault(), this.go(this.panels.length - 1);
    const dir = map[e.key];
    if (!dir) return;
    if (e.key === ' ' && e.shiftKey) return e.preventDefault(), this.go(this.index - 1);
    if (this._scrollable(document.activeElement, dir) && document.activeElement !== document.body) return;
    e.preventDefault();
    if (performance.now() < this.lockUntil - 400) return;
    this.go(this.index + dir);
  }
  _bindTouch() {
    let y0 = 0, t0 = 0, inner = false, target = null;
    window.addEventListener('touchstart', (e) => {
      if (!this.enabled) return;
      y0 = e.touches[0].clientY;
      t0 = performance.now();
      target = e.target;
      inner = false;
    }, { passive: true });
    window.addEventListener('touchmove', (e) => {
      if (!this.enabled) return;
      const dy = y0 - e.touches[0].clientY;
      const dir = Math.sign(dy);
      if (!inner && dir && this._scrollable(target, dir)) inner = true;
      if (!inner && e.cancelable) e.preventDefault();
    }, { passive: false });
    window.addEventListener('touchend', (e) => {
      if (!this.enabled || inner) return;
      const dy = y0 - e.changedTouches[0].clientY;
      const fast = performance.now() - t0 < 400;
      if (Math.abs(dy) > (fast ? 30 : 70) && performance.now() > this.lockUntil - 300) this.go(this.index + Math.sign(dy));
    }, { passive: true });
  }
}

/* ------------------------------------------------------------------ */
/* 시작                                                                 */
/* ------------------------------------------------------------------ */
const THEMES = { mono: 0, pixel: 1, editorial: 2 };

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
    return;
  }
  render(data);
  const { settings, projects } = data;
  const images = settings.images || {};
  const root = document.documentElement;
  const state = { theme: 'mono', section: 'hero', active: 0 };

  // 모핑 스테이지
  const canvas = $('#stage');
  let stage;
  try {
    if (!MorphStage.supported(canvas)) throw new Error('no webgl');
    stage = new MorphStage(canvas);
  } catch {
    canvas.remove();
    const box = el('div', { className: 'stage-fallback' });
    document.body.prepend(box);
    stage = new FallbackStage(box);
  }
  stage.preload([...Object.values(images).map((i) => i.src), ...projects.map(thumbOf)]);

  // 섹션마다 보여줄 이미지. Pixel·Editorial의 Works는 선택된 작업의 썸네일
  const sectionImage = (key) => {
    if (key === 'works' && state.theme !== 'mono' && projects.length) {
      return { src: thumbOf(projects[state.active]) || images.works?.src, focusX: 0.5 };
    }
    return images[key] || {};
  };
  const showSection = (opts) => {
    const im = sectionImage(state.section);
    stage.show(im.src, im.focusX ?? 0.5, opts);
  };

  // Pixel 스타일은 캔버스를 현재 섹션의 이미지 박스 안으로 옮김
  const hostCanvas = () => {
    if (!(stage instanceof MorphStage)) return;
    if (state.theme === 'pixel') {
      const slot = $('.panel.is-active .layout-pixel .morph-slot');
      if (slot && canvas.parentElement !== slot) slot.appendChild(canvas);
    } else if (canvas.parentElement !== document.body) {
      document.body.prepend(canvas);
    }
  };

  // 선택된 작업 (Pixel 큰 카드 · Editorial 대형 타이틀)
  const setActive = (i, { morph = true } = {}) => {
    const p = projects[i];
    if (!p) return;
    state.active = i;
    const fields = { title: p.title, meta: metaOf(p), summary: p.summary || p.subtitle || '', no: 'No. ' + pad(i + 1) };
    $$('[data-work]').forEach((n) => (n.textContent = fields[n.dataset.work] ?? ''));
    $$('.work-card[data-index]').forEach((c) => c.classList.toggle('is-current', Number(c.dataset.index) === i));
    $$('img.slot-img[data-img="active-work"]').forEach((img) => thumbOf(p) && (img.src = thumbOf(p)));
    if (morph && state.section === 'works' && state.theme !== 'mono') showSection({ duration: 1100 });
  };
  setActive(0, { morph: false });

  // 스타일 전환
  const switcher = $('#theme-switch');
  const canSwitch = settings.themeSwitcher !== false;
  const fromUrl = new URLSearchParams(location.search).get('theme');
  let saved = null;
  try {
    saved = localStorage.getItem('pf-theme');
  } catch {}
  const applyTheme = (theme, animate) => {
    state.theme = theme;
    root.dataset.theme = theme;
    stage.flip = theme === 'editorial';
    stage.setMode(THEMES[theme], { instant: !animate });
    $$('button', switcher).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeSet === theme)));
    hostCanvas();
  };
  applyTheme([fromUrl, canSwitch ? saved : null, settings.theme, 'mono'].find((t) => t in THEMES), false);
  switcher.hidden = !canSwitch && !(fromUrl in THEMES);
  switcher.addEventListener('click', (e) => {
    const b = e.target.closest('[data-theme-set]');
    if (!b || b.dataset.themeSet === state.theme) return;
    try {
      localStorage.setItem('pf-theme', b.dataset.themeSet);
    } catch {}
    // 화면을 잠깐 덮고 레이아웃을 바꾼 뒤 걷어냄
    root.classList.add('theme-swapping');
    setTimeout(() => {
      applyTheme(b.dataset.themeSet, true);
      window.dispatchEvent(new Event('resize'));
      showSection({ instant: true });
      requestAnimationFrame(() => setTimeout(() => root.classList.remove('theme-swapping'), 80));
    }, 280);
  });

  // 풀페이지 덱
  const navLinks = $$('.nav a');
  const dots = $$('.dots button');
  const total = 4;
  $('.pager-total').textContent = pad(total);
  const deck = new Deck($('#deck'), (i, panel) => {
    state.section = panel.dataset.key;
    document.body.dataset.section = state.section;
    document.body.classList.remove('is-previewing');
    navLinks.forEach((a, k) => a.classList.toggle('is-active', k === i));
    dots.forEach((d, k) => d.classList.toggle('is-active', k === i));
    $('#pager-cur').textContent = pad(i + 1);
    $('#pager-fill').style.width = ((i + 1) / total) * 100 + '%';
    hostCanvas();
    showSection();
  });
  $$('.pager-btn').forEach((b) => b.addEventListener('click', () => deck.go(deck.index + Number(b.dataset.step))));
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
      if (state.section !== 'works' && state.theme === 'mono') return;
      if (state.theme !== 'mono') {
        if (i != null && i !== state.active) setActive(i);
        return;
      }
      // Mono: 배경 전체가 커버로 모핑되고, 목록에서 벗어나면 원래 사진으로
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
    if (b) {
      // Editorial 첫 화면의 최근 작업은 Works로 이동하며 선택
      if (b.closest('.panel-hero')) {
        setActive(Number(b.dataset.index), { morph: false });
        deck.go(2);
        return;
      }
      return viewer.open(projects[b.dataset.index], b);
    }
    const open = e.target.closest('[data-open-active]');
    if (open && projects[state.active]) viewer.open(projects[state.active], open);
  });

  // 첫 화면
  const start = Math.max(0, $$('.panel').findIndex((p) => '#' + p.id === location.hash));
  state.section = $$('.panel')[start].dataset.key;
  await Promise.race([stage.load ? stage.load(sectionImage(state.section).src) : Promise.resolve(), new Promise((r) => setTimeout(r, 4000))]);
  deck.go(start, { animate: false });
  requestAnimationFrame(() => document.body.classList.add('is-ready'));
}

boot();
