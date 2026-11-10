/**
 * 전체화면 PDF 뷰어 (pdf.js)
 * - 페이지를 화면에 맞춰 세로 스크롤로 표시, 보이는 페이지만 지연 렌더링
 * - 확대/축소, 맞춤, 현재 페이지 표시, 다운로드, 설명 토글
 */
const PDFJS = 'vendor/pdfjs/pdf.min.js';
const WORKER = new URL('vendor/pdfjs/pdf.worker.min.js', document.baseURI).href;
const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];

let pdfjsPromise;
function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  pdfjsPromise ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = PDFJS;
    s.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER;
      resolve(window.pdfjsLib);
    };
    s.onerror = () => reject(new Error('pdf.js를 불러오지 못했습니다.'));
    document.head.appendChild(s);
  });
  return pdfjsPromise;
}

const $ = (id) => document.getElementById(id);

export class PdfViewer {
  constructor({ onOpen, onClose } = {}) {
    this.root = $('viewer');
    this.scroller = $('viewer-scroll');
    this.pagesEl = $('viewer-pages');
    this.statusEl = $('viewer-status');
    this.descEl = $('viewer-desc');
    this.onOpen = onOpen;
    this.onClose = onClose;
    this.zoomIndex = 2;
    this.pages = [];
    this.doc = null;
    this.session = 0;

    this.root.addEventListener('click', (e) => {
      const g = e.target.closest('.vg-item');
      if (g) return this.showLight(Number(g.dataset.index));
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'close') this.close();
      if (act === 'zoom-in') this.setZoom(this.zoomIndex + 1);
      if (act === 'zoom-out') this.setZoom(this.zoomIndex - 1);
      if (act === 'fit') this.setZoom(2);
      if (act === 'desc') this.toggleDesc();
      if (act === 'tab-pdf') this.setMode('pdf');
      if (act === 'tab-video') this.setMode('video');
      if (act === 'plan') this.setMode(this.mode === 'pdf' ? 'video' : 'pdf');
      if (act === 'light-close') this.closeLight();
      if (act === 'light-prev') this.showLight(this.lightIndex - 1);
      if (act === 'light-next') this.showLight(this.lightIndex + 1);
    });
    $('viewer-light').addEventListener('click', (e) => {
      if (e.target.id === 'viewer-light') this.closeLight(); // 이미지 바깥(어두운 곳)을 누르면 닫힘
    });
    this.root.addEventListener('keydown', (e) => {
      // 크게 보기 중: Esc는 크게 보기만 닫고, ← →로 넘김
      if (!$('viewer-light').hidden) {
        if (e.key === 'Escape') this.closeLight();
        if (e.key === 'ArrowLeft') this.showLight(this.lightIndex - 1);
        if (e.key === 'ArrowRight') this.showLight(this.lightIndex + 1);
        e.stopPropagation();
        return;
      }
      if (e.key === 'Escape') this.close();
      if (this.mode === 'video') return e.key === 'Tab' && this._trapFocus(e);
      if (e.key === '+' || e.key === '=') this.setZoom(this.zoomIndex + 1);
      if (e.key === '-') this.setZoom(this.zoomIndex - 1);
      if (e.key === 'Tab') this._trapFocus(e);
    });
    this.scroller.addEventListener('scroll', () => this._schedulePageIndicator(), { passive: true });
    window.addEventListener('resize', () => {
      if (!this.isOpen) return;
      clearTimeout(this._rt);
      this._rt = setTimeout(() => this._layout(true), 150);
    });

    this.io = new IntersectionObserver(
      (entries) => entries.forEach((en) => en.isIntersecting && this._renderPage(Number(en.target.dataset.page))),
      { root: this.scroller, rootMargin: '120% 0px' }
    );
  }

  get isOpen() {
    return !this.root.hidden;
  }

  async open(project, opener, startPage = 1) {
    this._planShown = false;
    this.opener = opener || document.activeElement;
    const session = ++this.session;
    this.project = project;
    $('viewer-kicker').textContent = [project.docType, project.category, project.year].filter(Boolean).join(' · ');
    $('viewer-title').textContent = project.title;
    $('viewer-summary').textContent = project.summary || project.subtitle || '';
    $('viewer-description').textContent = project.description || project.summary || '';
    const tags = $('viewer-tags');
    tags.replaceChildren(...(project.tags || []).map((t) => Object.assign(document.createElement('li'), { textContent: t })));
    const dl = $('viewer-download');
    dl.hidden = !project.pdf;
    if (project.pdf) {
      dl.href = project.pdf;
      dl.setAttribute('download', project.pdfName || project.title + '.pdf');
    }
    this.descEl.hidden = true;
    this.root.querySelector('[data-act="desc"]').setAttribute('aria-expanded', 'false');
    this.root.querySelector('[data-act="desc"]').hidden = !(project.description || project.tags?.length);
    if (project.showDesc && project.description) {
      this.descEl.hidden = false;
      this.root.querySelector('[data-act="desc"]').setAttribute('aria-expanded', 'true');
    }

    this.zoomIndex = 2;
    $('viewer-zoom').textContent = '100%';
    this._clear();
    this.root.hidden = false;
    document.body.classList.add('viewer-open');
    requestAnimationFrame(() => this.root.classList.add('is-open'));
    this.root.querySelector('[data-act="close"]').focus({ preventScroll: true });
    this.onOpen?.();

    // 유튜브 영상: PDF와 둘 다 있으면 위쪽 탭으로 오감 (기획서 먼저), 영상만 있으면 바로 재생
    const yt = project._yt;
    // 소개 이미지: 영상 아래(쇼츠면 옆)에 작은 이미지 줄, 누르면 크게
    this.gallery = (Array.isArray(project.gallery) ? project.gallery : []).filter((g) => g && g.src);
    this._renderGallery();
    const media = yt || this.gallery.length;
    // 영상·화면과 기획서가 둘 다 있으면: 처음엔 영상 + 화면 미리보기(기획 워크벤치와 같은 구성), 기획서는 위쪽 버튼으로
    // (화면 미리보기가 없는 카드는 예전처럼 위쪽 '기획서 / 영상' 탭, 기획서 먼저)
    const showcase = this.gallery.length > 0;
    $('viewer-tabs').hidden = showcase || !(media && project.pdf);
    $('viewer-plan').hidden = !(showcase && project.pdf);
    this.root.querySelector('.vtab[data-act="tab-video"]').textContent = yt ? '영상' : '화면';
    // 인쇄 · PDF: 기획서가 있으면 그 PDF를, 없으면 이 작업 요약(설명 · 소개 이미지 · 링크)을 새 창에서
    const pr = $('viewer-print');
    if (project.pdf) {
      pr.href = project.pdf;
      pr.textContent = '인쇄용 PDF ↗';
    } else {
      const q = new URLSearchParams({ part: 'work', id: project.id || '' });
      if (document.documentElement.dataset.link) q.set('from', document.documentElement.dataset.link);
      pr.href = 'print.html?' + q;
      pr.textContent = '인쇄 · PDF';
    }
    pr.hidden = !project.pdf && !project.id;
    // 직접 만든 툴·사이트: 위쪽에 '사이트 열기' (새 탭)
    const site = $('viewer-site');
    const link = /^https?:\/\//i.test(project.link || '') ? project.link : '';
    site.hidden = !link;
    if (link) site.href = link;
    const ytLink = $('viewer-yt');
    ytLink.hidden = !yt;
    if (yt) ytLink.href = `https://www.youtube.com/watch?v=${yt}`;
    this.setMode(showcase || (media && !project.pdf) ? 'video' : 'pdf');
    if (!project.pdf) {
      if (!media) this._noPdf(project);
      return;
    }
    this.statusEl.textContent = '기획서를 불러오는 중…';
    try {
      const pdfjs = await loadPdfJs();
      const doc = await pdfjs.getDocument({ url: project.pdf }).promise;
      if (session !== this.session) return doc.destroy();
      this.doc = doc;
      const first = await doc.getPage(1);
      const vp = first.getViewport({ scale: 1 });
      this.ratio = vp.height / vp.width;
      this.pages = Array.from({ length: doc.numPages }, (_, i) => {
        const el = document.createElement('div');
        el.className = 'pdf-page is-placeholder';
        el.dataset.page = i + 1;
        el.style.aspectRatio = `${vp.width} / ${vp.height}`;
        this.pagesEl.appendChild(el);
        return { el, rendered: 0, task: null, page: i === 0 ? first : null };
      });
      this.statusEl.textContent = '';
      this._layout(false);
      this.pages.forEach((p) => this.io.observe(p.el));
      this._updatePageIndicator();
      if (startPage > 1 && this.pages[startPage - 1]) requestAnimationFrame(() => this.pages[startPage - 1].el.scrollIntoView({ block: 'start' }));
      this.scroller.focus({ preventScroll: true });
    } catch (err) {
      if (session !== this.session) return;
      console.error(err);
      this.statusEl.innerHTML = '';
      const a = Object.assign(document.createElement('a'), { href: project.pdf, target: '_blank', rel: 'noopener', textContent: '새 창에서 PDF 열기 ↗' });
      this.statusEl.append('PDF를 표시하지 못했습니다. ', a);
    }
  }

  _noPdf(project) {
    const src = project.thumb || project.cover;
    if (src) {
      const img = Object.assign(document.createElement('img'), { src, alt: project.title, className: 'viewer-cover' });
      this.pagesEl.appendChild(img);
      this.pagesEl.style.width = `min(100%, 1200px)`;
    }
    this.statusEl.textContent = /^https?:\/\//i.test(project.link || '') ? '위쪽 ‘사이트 열기’로 직접 써 볼 수 있어요.' : '등록된 PDF가 없습니다.';
    $('viewer-page').textContent = '– / –';
    this.descEl.hidden = false;
  }

  _renderGallery() {
    const box = $('viewer-gallery');
    box.replaceChildren(
      ...this.gallery.map((g, i) => {
        const b = Object.assign(document.createElement('button'), { type: 'button', className: 'vg-item' });
        b.dataset.index = i;
        b.setAttribute('role', 'listitem');
        b.setAttribute('aria-label', `${g.caption || '소개 이미지 ' + (i + 1)} 크게 보기`);
        // 원래 화면에서의 폭(w)으로 보여 줘서 누르지 않아도 글자가 읽히게 (모르면 900px)
        b.style.setProperty('--w', `${Math.max(320, Math.min(1400, Number(g.w) || 900))}px`);
        b.append(Object.assign(document.createElement('img'), { src: g.src, alt: g.caption || '', loading: i < 2 ? 'eager' : 'lazy', decoding: 'async' }));
        if (g.caption) b.append(Object.assign(document.createElement('span'), { textContent: g.caption }));
        return b;
      })
    );
    box.hidden = !this.gallery.length;
    $('viewer-video').scrollTop = 0; // 다른 카드에서 내려 둔 위치가 남지 않게
    box.scrollTop = 0;
    const shorts = /youtube\.com\/shorts\//i.test(this.project?.video || '');
    $('viewer-video').classList.toggle('has-gallery', !!this.gallery.length);
    $('viewer-video').classList.toggle('is-shorts', shorts && !!this.gallery.length);
    $('viewer-video').classList.toggle('no-video', !this.project?._yt);
    this.closeLight();
  }

  showLight(i) {
    const n = this.gallery?.length || 0;
    if (!n) return;
    this.lightIndex = (i + n) % n;
    const g = this.gallery[this.lightIndex];
    const box = $('viewer-light');
    $('viewer-light-img').src = g.src;
    $('viewer-light-img').alt = g.caption || '';
    $('viewer-light-cap').textContent = `${this.lightIndex + 1} / ${n}${g.caption ? '  ·  ' + g.caption : ''}`;
    box.querySelectorAll('.prev, .next').forEach((b) => (b.hidden = n < 2));
    if (box.hidden) {
      this.lightOpener = document.activeElement;
      box.hidden = false;
      box.querySelector('.shut').focus({ preventScroll: true });
    }
  }

  closeLight() {
    const box = $('viewer-light');
    if (box.hidden) return;
    box.hidden = true;
    $('viewer-light-img').removeAttribute('src');
    this.lightOpener?.focus?.({ preventScroll: true });
  }

  /** 'pdf' | 'video' — 영상 칸은 열 때만 iframe을 넣고, 닫거나 탭을 바꾸면 빼서 소리가 멈추게 */
  setMode(mode) {
    this.mode = mode;
    const yt = this.project?._yt;
    const video = mode === 'video' && (yt || this.gallery?.length);
    this.root.classList.toggle('is-video', !!video);
    $('viewer-video').hidden = !video;
    this.scroller.hidden = !!video;
    this.root.querySelectorAll('.vtab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.act === 'tab-' + mode)));
    const plan = $('viewer-plan');
    if (plan) {
      plan.textContent = mode === 'pdf' ? (this.project?._yt ? '← 영상 · 화면으로' : '← 화면으로') : '기획서 보기';
      plan.classList.toggle('is-back', mode === 'pdf');
    }
    // 숨겨져 있던 기획서를 처음 펼치면 크기를 다시 재고 1쪽부터
    if (mode === 'pdf' && this.doc)
      requestAnimationFrame(() => {
        this._layout(true);
        if (!this._planShown) this.scroller.scrollTop = 0;
        this._planShown = true;
        this._updatePageIndicator();
      });
    const frame = $('viewer-frame');
    frame.classList.toggle('is-shorts', /youtube\.com\/shorts\//i.test(this.project?.video || ''));
    frame.hidden = !yt;
    if (video && yt) {
      if (!frame.firstChild) {
        const f = document.createElement('iframe');
        f.src = `https://www.youtube-nocookie.com/embed/${yt}?autoplay=1&rel=0&playsinline=1&modestbranding=1`;
        f.title = (this.project.title || '') + ' 영상';
        f.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen';
        f.allowFullscreen = true;
        f.referrerPolicy = 'strict-origin-when-cross-origin';
        frame.append(f);
      }
    } else frame.replaceChildren();
  }

  close() {
    if (!this.isOpen) return;
    this.session++;
    this.closeLight();
    $('viewer-frame').replaceChildren();
    this.root.classList.remove('is-open');
    document.body.classList.remove('viewer-open');
    setTimeout(() => {
      if (this.root.classList.contains('is-open')) return;
      this.root.hidden = true;
      this._clear();
    }, 450);
    this.onClose?.();
    this.opener?.focus?.({ preventScroll: true });
  }

  _clear() {
    this.io.disconnect();
    this.pages.forEach((p) => p.task?.cancel());
    this.pages = [];
    this.doc?.destroy();
    this.doc = null;
    this.pagesEl.replaceChildren();
    this.pagesEl.style.width = '';
    this.statusEl.textContent = '';
    this.scroller.scrollTop = 0;
    $('viewer-page').textContent = '– / –';
  }

  toggleDesc() {
    const btn = this.root.querySelector('[data-act="desc"]');
    const open = this.descEl.hidden;
    this.descEl.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (this.doc) this._layout(true);
  }

  /** 기본(100%) = 한 페이지가 화면 안에 통째로 들어오는 크기 */
  _baseWidth() {
    const cs = getComputedStyle(this.scroller);
    const w = this.scroller.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const h = this.scroller.clientHeight - parseFloat(cs.paddingTop) - 28;
    return Math.max(200, Math.min(w, h / (this.ratio || 0.5625), 1800));
  }

  _layout(rerender) {
    if (!this.pages.length) return;
    const current = this._currentPage();
    const w = Math.round(this._baseWidth() * ZOOMS[this.zoomIndex]);
    this.pagesEl.style.width = w + 'px';
    if (rerender) {
      this.pages.forEach((p) => (p.rendered = 0));
      this._scrollToPage(current);
      // 보이는 페이지 다시 그리기
      const top = this.scroller.scrollTop, bottom = top + this.scroller.clientHeight * 2;
      this.pages.forEach((p, i) => {
        const y = p.el.offsetTop;
        if (y + p.el.offsetHeight > top - this.scroller.clientHeight && y < bottom) this._renderPage(i + 1);
      });
    }
  }

  setZoom(i) {
    if (!this.doc) return;
    const next = Math.max(0, Math.min(ZOOMS.length - 1, i));
    if (next === this.zoomIndex) return;
    this.zoomIndex = next;
    $('viewer-zoom').textContent = Math.round(ZOOMS[next] * 100) + '%';
    this._layout(true);
  }

  async _renderPage(n) {
    const p = this.pages[n - 1];
    if (!p || !this.doc) return;
    const cssW = p.el.clientWidth;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const target = Math.round(cssW * dpr);
    if (p.rendered === target) return;
    p.rendered = target;
    const session = this.session;
    try {
      p.page ||= await this.doc.getPage(n);
      if (session !== this.session) return;
      const base = p.page.getViewport({ scale: 1 });
      p.el.style.aspectRatio = `${base.width} / ${base.height}`;
      const vp = p.page.getViewport({ scale: target / base.width });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(vp.width);
      canvas.height = Math.round(vp.height);
      p.task?.cancel();
      p.task = p.page.render({ canvasContext: canvas.getContext('2d', { alpha: false }), viewport: vp });
      await p.task.promise;
      if (session !== this.session || p.rendered !== target) return;
      p.el.replaceChildren(canvas);
      p.el.classList.remove('is-placeholder');
      requestAnimationFrame(() => p.el.classList.add('is-rendered'));
    } catch (err) {
      if (err?.name !== 'RenderingCancelledException') console.warn(err);
    }
  }

  _currentPage() {
    const mid = this.scroller.scrollTop + this.scroller.clientHeight / 2;
    let best = 1;
    this.pages.forEach((p, i) => {
      if (p.el.offsetTop <= mid) best = i + 1;
    });
    return best;
  }
  _scrollToPage(n) {
    const p = this.pages[n - 1];
    if (p) this.scroller.scrollTop = p.el.offsetTop - 20;
  }
  _schedulePageIndicator() {
    if (this._pi) return;
    this._pi = requestAnimationFrame(() => {
      this._pi = null;
      this._updatePageIndicator();
    });
  }
  _updatePageIndicator() {
    if (!this.pages.length) return;
    $('viewer-page').textContent = `${this._currentPage()} / ${this.pages.length}`;
  }
  _trapFocus(e) {
    const f = [...this.root.querySelectorAll('button:not([hidden]), a[href]:not([hidden]), [tabindex="0"]')].filter((el) => el.offsetParent);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
}
