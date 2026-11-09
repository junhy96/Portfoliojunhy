import { MorphStage, FallbackStage } from './morph.js';
import { PdfViewer } from './pdf-viewer.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const el = (tag, props = {}, ...children) => {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...children.filter((c) => c != null));
  return n;
};
const pad = (n) => String(n).padStart(2, '0');

/* ------------------------------------------------------------------ */
/* 콘텐츠 렌더링                                                         */
/* ------------------------------------------------------------------ */
function render({ settings: s, projects }) {
  document.title = s.siteTitle || `${s.nameKo} — Portfolio`;
  const binds = {
    nameKo: s.nameKo, nameEn: s.nameEn, role: s.role, eyebrow: s.eyebrow, intro: s.intro,
    aboutHeading: s.about?.heading, bio: s.about?.bio, worksIntro: s.worksIntro,
    contactHeading: s.contact?.heading, contactMessage: s.contact?.message, email: s.contact?.email,
  };
  $$('[data-bind]').forEach((n) => (n.textContent = binds[n.dataset.bind] ?? ''));
  $$('[data-bind-href="mailto"]').forEach((n) => {
    n.href = s.contact?.email ? `mailto:${s.contact.email}` : '#';
    n.hidden = !s.contact?.email;
  });

  $('#hero-meta').replaceChildren(
    ...(s.meta || []).map((m, i) => {
      const d = el('div', {}, el('dt', { textContent: m.label }), el('dd', { textContent: m.value }));
      d.style.setProperty('--d', i);
      return d;
    })
  );
  $('#skills').replaceChildren(...(s.about?.skills || []).map((t) => el('li', { textContent: t })));
  $('#tools').replaceChildren(...(s.about?.tools || []).map((t) => el('li', { textContent: t })));
  $('#experience').replaceChildren(
    ...(s.about?.experience || []).map((x) =>
      el('li', {}, el('time', { textContent: x.period }), el('div', {}, el('strong', { textContent: x.title }), el('span', { textContent: x.desc })))
    )
  );
  $('#links').replaceChildren(
    ...(s.contact?.links || [])
      .filter((l) => /^https?:\/\//i.test(l.url))
      .map((l) => el('li', {}, el('a', { href: l.url, target: '_blank', rel: 'noopener', textContent: l.label + ' ↗' })))
  );
  $('#year').textContent = new Date().getFullYear();

  // Works
  $('#works-count').textContent = `(${pad(projects.length)})`;
  const list = $('#works-list');
  if (!projects.length) {
    list.replaceChildren(el('li', { className: 'works-empty small', textContent: '아직 등록된 포트폴리오가 없습니다.' }));
  } else {
    list.replaceChildren(
      ...projects.map((p, i) => {
        const img = p.thumb || p.cover;
        const btn = el(
          'button',
          { className: 'work-card', type: 'button', ariaLabel: `${p.title} 기획서 보기` },
          el(
            'span', { className: 'card-media' },
            img ? el('img', { src: img, alt: '', loading: 'lazy', decoding: 'async' }) : el('span', { className: 'card-empty', textContent: p.title }),
            el('span', { className: 'card-no', textContent: pad(i + 1) }),
            el('span', { className: 'card-open', textContent: p.pdf ? 'PDF 보기 ↗' : '자세히 보기 ↗' })
          ),
          el(
            'span', { className: 'card-meta' },
            el('span', { className: 'card-title', textContent: p.title }),
            el('span', { className: 'card-info small', textContent: [p.category, p.year].filter(Boolean).join(' · ') }),
            el('span', { className: 'card-sub small', textContent: p.subtitle || '' })
          )
        );
        btn.dataset.index = i;
        const li = el('li', { className: 'reveal' }, btn);
        li.style.setProperty('--d', Math.min(i, 8) + 3);
        return el('li', {}, btn);
      })
    );
  }
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
      if (max > 2 && (dir > 0 ? n.scrollTop < max - 2 : n.scrollTop > 2)) return n;
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
  const imageFor = (key) => images[key] || {};
  stage.preload([...Object.values(images).map((i) => i.src), ...projects.map((p) => p.thumb || p.cover)]);

  const navLinks = $$('.nav a');
  const dots = $$('.dots button');
  const total = 4;
  $('.pager-total').textContent = pad(total);

  let sectionKey = 'hero';
  const deck = new Deck($('#deck'), (i, panel) => {
    sectionKey = panel.dataset.key;
    document.body.dataset.section = sectionKey;
    document.body.classList.remove('is-previewing');
    navLinks.forEach((a, k) => a.classList.toggle('is-active', k === i));
    dots.forEach((d, k) => d.classList.toggle('is-active', k === i));
    $('#pager-cur').textContent = pad(i + 1);
    $('#pager-fill').style.width = ((i + 1) / total) * 100 + '%';
    const img = imageFor(sectionKey);
    stage.show(img.src, img.focusX ?? 0.5);
  });

  $$('[data-go]').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      deck.go(Number(a.dataset.go));
    })
  );

  // Works: 호버 시 커버 이미지로 모핑, 클릭 시 PDF 뷰어
  const viewer = new PdfViewer({
    onOpen: () => (deck.enabled = false),
    onClose: () => (deck.enabled = true),
  });
  const list = $('#works-list');
  const previewText = $('#works-preview-text');
  const defaultPreview = '';
  let hoverTimer;
  const preview = (p) => {
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => {
      if (sectionKey !== 'works') return;
      if (p) {
        document.body.classList.add('is-previewing');
        stage.show(p.thumb || p.cover || imageFor('works').src, 0.5, { duration: 1200 });
        previewText.textContent = p.summary || p.subtitle || '';
      } else {
        document.body.classList.remove('is-previewing');
        const img = imageFor('works');
        stage.show(img.src, img.focusX ?? 0.5, { duration: 1200 });
        previewText.textContent = defaultPreview;
      }
    }, p ? 90 : 220);
  };
  list.addEventListener('pointerover', (e) => {
    const b = e.target.closest('.work-card');
    if (b && e.pointerType === 'mouse') preview(projects[b.dataset.index]);
  });
  list.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && preview(null));
  list.addEventListener('focusin', (e) => {
    const b = e.target.closest('.work-card');
    if (b) preview(projects[b.dataset.index]);
  });
  list.addEventListener('click', (e) => {
    const b = e.target.closest('.work-card');
    if (b) viewer.open(projects[b.dataset.index], b);
  });

  // 첫 화면
  const start = Math.max(0, $$('.panel').findIndex((p) => '#' + p.id === location.hash));
  const firstImg = imageFor($$('.panel')[start].dataset.key);
  await Promise.race([
    stage.load ? stage.load(firstImg.src) : Promise.resolve(),
    new Promise((r) => setTimeout(r, 4000)),
  ]);
  deck.go(start, { animate: false });
  requestAnimationFrame(() => document.body.classList.add('is-ready'));
}

boot();
