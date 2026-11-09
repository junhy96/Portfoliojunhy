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
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'close') this.close();
      if (act === 'zoom-in') this.setZoom(this.zoomIndex + 1);
      if (act === 'zoom-out') this.setZoom(this.zoomIndex - 1);
      if (act === 'fit') this.setZoom(2);
      if (act === 'desc') this.toggleDesc();
    });
    this.root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close();
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

  async open(project, opener) {
    this.opener = opener || document.activeElement;
    const session = ++this.session;
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

    this.zoomIndex = 2;
    $('viewer-zoom').textContent = '100%';
    this._clear();
    this.root.hidden = false;
    document.body.classList.add('viewer-open');
    requestAnimationFrame(() => this.root.classList.add('is-open'));
    this.root.querySelector('[data-act="close"]').focus({ preventScroll: true });
    this.onOpen?.();

    if (!project.pdf) {
      this._noPdf(project);
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
    this.statusEl.textContent = '등록된 PDF가 없습니다.';
    $('viewer-page').textContent = '– / –';
    this.descEl.hidden = false;
  }

  close() {
    if (!this.isOpen) return;
    this.session++;
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
