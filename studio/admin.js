/* Studio — 포트폴리오 관리자 (GitHub Pages 버전) */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const ROOT = '../'; // studio/ 기준 사이트 루트
  const CFG_KEY = 'studio-github';
  const MB = 1024 * 1024;

  if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = ROOT + 'vendor/pdfjs/pdf.worker.min.js';

  let store = null; // GitHubStore
  let db = { settings: {}, projects: [] };
  let editing = null;
  let dirty = false;

  /* ---------------- 공통 ---------------- */
  let toastTimer;
  function toast(msg, isError = false) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.toggle('error', isError);
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), isError ? 5000 : 2800);
  }
  function confirmBox(msg, okLabel = '확인') {
    const d = $('#confirm');
    $('#confirm-msg').textContent = msg;
    $('#confirm-ok').textContent = okLabel;
    d.returnValue = '';
    d.showModal();
    return new Promise((resolve) => d.addEventListener('close', () => resolve(d.returnValue === 'ok'), { once: true }));
  }
  const fmtDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  };
  const fmtSize = (b) => (b == null ? '' : b > MB ? (b / MB).toFixed(1) + 'MB' : Math.round(b / 1024) + 'KB');
  const h = (tag, props = {}, ...kids) => {
    const n = Object.assign(document.createElement(tag), props);
    n.append(...kids.filter((k) => k != null && k !== false));
    return n;
  };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  /** 저장소 경로 → 미리보기 URL (사이트 반영 전이면 raw.githubusercontent 로 대체) */
  const assetUrl = (p) => (!p ? '' : /^(https?:|blob:|data:)/.test(p) ? p : ROOT + p);
  function img(path, props = {}) {
    const el = h('img', { alt: '', loading: 'lazy', ...props, src: assetUrl(path) });
    if (path && !/^(https?:|blob:|data:)/.test(path)) {
      el.addEventListener('error', () => {
        if (store && !el.dataset.fallback) {
          el.dataset.fallback = '1';
          el.src = store.rawUrl(path);
        }
      });
    }
    return el;
  }

  /** 이미지 축소 + JPEG 변환 (저장소 용량 절약) */
  async function resizeImage(file, max = 1920, quality = 0.86) {
    if (file.type === 'image/gif') return file;
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close?.();
    return new Promise((r) => c.toBlob(r, 'image/jpeg', quality));
  }
  const extOf = (blob) => ({ 'image/gif': 'gif', 'image/png': 'png', 'image/webp': 'webp' })[blob.type] || 'jpg';

  /* ---------------- 저장 상태 표시 & 커밋 큐 ---------------- */
  const sync = $('#sync');
  function setSync(state, text) {
    sync.dataset.state = state;
    $('span', sync).textContent = text;
  }
  let chain = Promise.resolve();
  function save(message, mutate, files = [], onProgress) {
    const run = chain.then(async () => {
      setSync('saving', '저장 중…');
      try {
        db = await store.commit(message, mutate, files, onProgress);
        watchDeploy(db.rev);
        return db;
      } catch (err) {
        setSync('error', '저장 실패');
        if (err.status === 401) showLogin(err.message);
        throw err;
      }
    });
    chain = run.catch(() => {});
    return run;
  }
  // 사이트(GitHub Pages)에 반영됐는지 확인
  let deployTimer;
  function watchDeploy(rev) {
    clearTimeout(deployTimer);
    setSync('deploying', '사이트 반영 중 (1~2분)');
    const started = Date.now();
    const poll = async () => {
      try {
        const res = await fetch(ROOT + 'data/site.json?t=' + Date.now(), { cache: 'no-store' });
        const live = await res.json();
        if ((live.rev || 0) >= rev) return setSync('live', '사이트에 반영됨');
      } catch {}
      if (Date.now() - started > 4 * 60 * 1000) return setSync('idle', 'GitHub에 저장됨');
      deployTimer = setTimeout(poll, 8000);
    };
    deployTimer = setTimeout(poll, 6000);
  }

  /* ---------------- GitHub 연결 ---------------- */
  function loadCfg() {
    try {
      return JSON.parse(localStorage.getItem(CFG_KEY) || sessionStorage.getItem(CFG_KEY) || 'null');
    } catch {
      return null;
    }
  }
  function saveCfg(cfg, remember) {
    try {
      localStorage.removeItem(CFG_KEY);
      sessionStorage.removeItem(CFG_KEY);
      (remember ? localStorage : sessionStorage).setItem(CFG_KEY, JSON.stringify(cfg));
    } catch {}
  }
  function guessRepo() {
    // 아이디.github.io/저장소/studio/ 형태의 주소에서 저장소를 추측
    const host = location.hostname;
    if (!host.endsWith('.github.io')) return '';
    const owner = host.split('.')[0];
    const seg = location.pathname.split('/').filter(Boolean);
    return seg.length > 1 ? `${owner}/${seg[0]}` : `${owner}/${host}`;
  }

  function showLogin(error = '') {
    $('#app').hidden = true;
    $('#login').hidden = false;
    const f = $('#login-form');
    const cfg = loadCfg();
    f.repo.value = cfg ? `${cfg.owner}/${cfg.repo}` : guessRepo();
    f.branch.value = cfg?.branch || 'main';
    f.token.value = '';
    $('#login-error').textContent = error;
    (f.repo.value ? f.token : f.repo).focus();
  }
  async function connect(cfg) {
    try {
      if (localStorage.getItem('pf-notrack') === null) localStorage.setItem('pf-notrack', '1');
    } catch {}
    store = new GitHubStore(cfg);
    await store.verify();
    db = await store.readData();
    db.projects ||= [];
    $('#repo-label').textContent = `${cfg.owner}/${cfg.repo} · ${cfg.branch}`;
    $('#login').hidden = true;
    $('#app').hidden = false;
    setSync('idle', '저장됨');
    renderBoard();
    switchView('board', true);
  }
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const [owner, repo] = f.repo.value.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').split('/');
    if (!owner || !repo) return ($('#login-error').textContent = '저장소를 ‘아이디/저장소이름’ 형식으로 입력하세요.');
    const cfg = { owner, repo, branch: f.branch.value.trim() || 'main', token: f.token.value.trim() };
    const btn = f.querySelector('button[type=submit]');
    btn.disabled = true;
    $('#login-error').textContent = '';
    try {
      await connect(cfg);
      saveCfg(cfg, f.remember.checked);
    } catch (err) {
      $('#login-error').textContent =
        err instanceof SyntaxError ? 'data/site.json 파일을 읽지 못했습니다. 저장소에 사이트 파일을 먼저 올렸는지 확인하세요.' : err.message;
    } finally {
      btn.disabled = false;
    }
  });
  $('#logout').addEventListener('click', async () => {
    if (!(await confirmBox('이 브라우저에서 GitHub 연결을 해제할까요?\n저장된 토큰이 삭제됩니다.', '연결 해제'))) return;
    const cfg = loadCfg();
    try {
      localStorage.removeItem(CFG_KEY);
      sessionStorage.removeItem(CFG_KEY);
      if (cfg) localStorage.setItem(CFG_KEY, JSON.stringify({ ...cfg, token: '' })); // 저장소 이름만 기억
    } catch {}
    store = null;
    showLogin();
  });

  /* ---------------- 뷰 전환 ---------------- */
  async function switchView(name, force = false) {
    if (!force && dirty && !(await confirmBox('저장하지 않은 변경사항이 있습니다.\n나가시겠어요?', '나가기'))) return false;
    dirty = false;
    $$('.view').forEach((v) => (v.hidden = v.id !== 'view-' + name));
    $$('.tab').forEach((t) => t.classList.toggle('is-active', t.dataset.view === name || (name === 'editor' && t.dataset.view === 'board')));
    if (name === 'settings') fillSettings();
    if (name === 'board') renderBoard();
    if (name === 'stats') window.StudioStats?.open(db.settings?.analytics);
    if (name === 'presets') openPresets();
    window.scrollTo(0, 0);
    return true;
  }
  $$('.tab').forEach((t) => t.addEventListener('click', () => switchView(t.dataset.view)));
  document.addEventListener('click', (e) => {
    const g = e.target.closest('[data-goto]');
    if (g) switchView(g.dataset.goto);
  });
  window.addEventListener('beforeunload', (e) => {
    if (dirty || sync.dataset.state === 'saving') {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  /* ---------------- 게시판 ---------------- */
  function renderBoard() {
    const q = $('#search').value.trim().toLowerCase();
    const total = db.projects.length;
    const rows = db.projects
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => !q || [p.title, p.category, p.docType, p.subtitle, ...(p.tags || [])].join(' ').toLowerCase().includes(q));
    $('#board-body').replaceChildren(
      ...rows.map(({ p, i }) => {
        const thumb = p.thumb || p.cover;
        const vis = h('input', { type: 'checkbox', checked: p.visible !== false });
        vis.addEventListener('change', async () => {
          const v = vis.checked;
          try {
            await save(`${v ? '공개' : '비공개'}: ${p.title}`, (d) => {
              const x = d.projects.find((y) => y.id === p.id);
              if (x) x.visible = v;
            });
            toast(v ? '공개로 바꿨습니다.' : '비공개로 바꿨습니다.');
          } catch (err) {
            vis.checked = !v;
            toast(err.message, true);
          }
        });
        const up = h('button', { className: 'icon-btn', title: '위로', textContent: '▲', disabled: i === 0 || !!q });
        const down = h('button', { className: 'icon-btn', title: '아래로', textContent: '▼', disabled: i === total - 1 || !!q });
        up.onclick = () => move(i, -1);
        down.onclick = () => move(i, 1);
        const edit = h('button', { className: 'btn sm', textContent: '수정' });
        edit.onclick = () => openEditor(p);
        const del = h('button', { className: 'icon-btn danger', title: '삭제', textContent: '✕' });
        del.onclick = () => removePost(p);
        const title = h('button', { className: 'post-title', textContent: p.title });
        title.onclick = () => openEditor(p);
        return h(
          'tr', {},
          h('td', { className: 'c-no', textContent: String(total - i) }),
          h('td', {}, thumb ? img(thumb, { className: 'thumb' }) : h('span', { className: 'thumb empty', textContent: '없음' })),
          h('td', {}, title, h('div', { className: 'post-sub', textContent: [p.subtitle, p.year].filter(Boolean).join(' · ') })),
          h('td', {}, p.docType ? h('span', { className: 'badge', textContent: p.docType }) : null, p.sample ? h('span', { className: 'badge muted-badge', textContent: '예시' }) : null, p.category ? h('div', { className: 'post-sub', textContent: p.category }) : null),
          h(
            'td', {},
            p.pdf ? h('a', { className: 'pdf-link', href: assetUrl(p.pdf), target: '_blank', rel: 'noopener', textContent: `PDF ${fmtSize(p.pdfSize)}` }) : null,
            ytId(p.video) ? h('a', { className: 'pdf-link yt', href: p.video, target: '_blank', rel: 'noopener', textContent: '▶ 영상' }) : null,
            !p.pdf && !ytId(p.video) ? h('span', { className: 'muted', textContent: '—' }) : null
          ),
          h('td', {}, h('label', { className: 'switch' }, vis, h('i'))),
          h('td', { className: 'c-date', textContent: fmtDate(p.updatedAt) }),
          h('td', {}, h('div', { className: 'acts' }, up, down, edit, del))
        );
      })
    );
    $('#board-empty').hidden = db.projects.length > 0;
    $('#category-list').replaceChildren(...[...new Set(db.projects.map((p) => p.category).filter(Boolean))].map((c) => h('option', { value: c })));
  }
  $('#search').addEventListener('input', renderBoard);

  // 순서 변경은 연속 클릭을 모아서 한 번에 저장
  let reorderTimer;
  function move(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= db.projects.length) return;
    const list = [...db.projects];
    [list[i], list[j]] = [list[j], list[i]];
    db = { ...db, projects: list };
    renderBoard();
    setSync('pending', '순서 저장 대기…');
    clearTimeout(reorderTimer);
    reorderTimer = setTimeout(async () => {
      const ids = db.projects.map((p) => p.id);
      try {
        await save('포트폴리오 순서 변경', (d) => {
          const byId = new Map(d.projects.map((p) => [p.id, p]));
          d.projects = [...ids.map((id) => byId.get(id)).filter(Boolean), ...d.projects.filter((p) => !ids.includes(p.id))];
        });
        renderBoard();
      } catch (err) {
        toast(err.message, true);
      }
    }, 1200);
  }

  async function removePost(p) {
    if (!(await confirmBox(`‘${p.title}’ 게시글을 삭제할까요?\n첨부된 PDF와 썸네일도 저장소에서 함께 삭제됩니다.`, '삭제'))) return;
    try {
      await save(`포트폴리오 삭제: ${p.title}`, (d) => {
        d.projects = d.projects.filter((x) => x.id !== p.id);
      });
      toast('삭제했습니다.');
      renderBoard();
    } catch (err) {
      toast(err.message, true);
    }
  }

  /* ---------------- 글쓰기 / 수정 ---------------- */
  const form = $('#editor-form');
  const state = {
    pdfFile: null, // 새로 고른 PDF
    removePdf: false,
    options: [], // 썸네일 후보 [{key, kind: current|page|custom, url, blob, label}]
    selected: null,
    loadingPages: false,
  };

  $('#new-post').addEventListener('click', () => openEditor(null));
  $('#back-to-board').addEventListener('click', () => switchView('board'));
  $('#cancel-edit').addEventListener('click', () => switchView('board'));
  form.addEventListener('input', () => (dirty = true));

  // 유튜브 링크 → 영상 ID (사이트 main.js와 같은 규칙)
  const ytId = (url) => {
    const m = String(url || '').match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/|v\/)|youtu\.be\/)([\w-]{11})/);
    return m ? m[1] : '';
  };
  function ytPreview() {
    const box = $('#yt-preview');
    const v = form.video.value.trim();
    const id = ytId(v);
    box.hidden = !v;
    if (!v) return box.replaceChildren();
    if (!id) return box.replaceChildren(h('p', { className: 'muted sm warn', textContent: '유튜브 영상 주소가 아닌 것 같아요. 영상 페이지 주소를 그대로 붙여 넣어 주세요.' }));
    box.replaceChildren(
      h('img', { src: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`, alt: '' }),
      h('div', {}, h('b', { textContent: '연결된 영상' }), h('a', { href: `https://www.youtube.com/watch?v=${id}`, target: '_blank', rel: 'noopener', textContent: `youtu.be/${id} ↗` }))
    );
  }
  form.video?.addEventListener('input', ytPreview);

  const DEFAULT_DOC_TYPES = ['시스템 기획서', '콘텐츠 기획서', '레벨 디자인', '밸런싱·데이터', 'UI·UX 기획서', '역기획서', '기타'];
  const docTypeList = () => (db.settings?.docTypes?.length ? db.settings.docTypes : DEFAULT_DOC_TYPES);
  function fillDocTypes(cur = '') {
    const list = docTypeList();
    const opts = [h('option', { value: '', textContent: '선택 안 함' }), ...list.map((t) => h('option', { value: t, textContent: t }))];
    if (cur && !list.includes(cur)) opts.push(h('option', { value: cur, textContent: cur + ' (목록에 없음)' }));
    form.docType.replaceChildren(...opts);
    form.docType.value = cur;
  }

  async function openEditor(p) {
    if (!(await switchView('editor'))) return;
    editing = p;
    form.reset();
    Object.assign(state, { pdfFile: null, removePdf: false, options: [], selected: null, loadingPages: false });
    $('#editor-title').textContent = p ? '포트폴리오 수정' : '새 포트폴리오 등록';
    $('#save-post').textContent = p ? '수정 완료' : '게시하기';
    fillDocTypes('');
    ytPreview();
    if (p) {
      ['title', 'subtitle', 'category', 'year', 'summary', 'description'].forEach((k) => (form[k].value = p[k] || ''));
      form.tags.value = (p.tags || []).join(', ');
      form.video.value = p.video || '';
      form.visible.checked = p.visible !== false;
      fillDocTypes(p.docType || '');
      const cur = p.thumb || p.cover;
      if (cur) {
        state.options.push({ key: 'current', kind: 'current', url: cur, label: '현재 썸네일' });
        state.selected = 'current';
      }
    } else {
      form.visible.checked = true;
    }
    setPdfUi(p?.pdf ? { name: p.pdfName || 'portfolio.pdf', size: p.pdfSize } : null);
    renderThumbs();
    $('#upload-progress').hidden = true;
    dirty = false;
    form.title.focus();
  }

  function setPdfUi(info) {
    const drop = $('#drop-pdf');
    $('.drop-empty', drop).hidden = !!info;
    $('.drop-file', drop).hidden = !info;
    $('.drop-file', drop).textContent = info ? `📄 ${info.name}${info.size ? ' · ' + fmtSize(info.size) : ''}\n(클릭해서 교체)` : '';
    $('#remove-pdf').hidden = !info;
  }

  /* --- 썸네일 선택 (유튜브 스타일) --- */
  function renderThumbs() {
    const picker = $('#thumb-picker');
    const tiles = state.options.map((o) => {
      const b = h(
        'button',
        { type: 'button', className: 'thumb-opt' + (state.selected === o.key ? ' is-selected' : ''), role: 'radio' },
        img(o.url),
        h('span', { className: 'thumb-label', textContent: o.label })
      );
      b.setAttribute('aria-checked', String(state.selected === o.key));
      b.onclick = () => {
        state.selected = o.key;
        dirty = true;
        renderThumbs();
      };
      return b;
    });
    const upload = h('button', { type: 'button', className: 'thumb-opt add' }, h('span', { textContent: '＋' }), h('span', { className: 'thumb-label', textContent: '이미지 업로드' }));
    upload.onclick = () => $('#thumb-file').click();
    const hasExistingPdf = editing?.pdf && !state.pdfFile && !state.removePdf;
    const hasPageOpts = state.options.some((o) => o.kind === 'page');
    const fromPdf =
      hasExistingPdf && !hasPageOpts
        ? Object.assign(h('button', { type: 'button', className: 'thumb-opt add' }, h('span', { textContent: '▤' }), h('span', { className: 'thumb-label', textContent: 'PDF에서 고르기' })), {
            onclick: () => pagesFromPdf(assetUrl(editing.pdf), store.rawUrl(editing.pdf)),
            disabled: state.loadingPages,
          })
        : null;
    picker.replaceChildren(...tiles, ...(fromPdf ? [fromPdf] : []), upload);
    $('#thumb-status').textContent = state.loadingPages
      ? 'PDF에서 썸네일 후보를 만드는 중…'
      : !state.options.length
        ? 'PDF를 올리면 썸네일 후보가 자동으로 만들어집니다.'
        : '';
  }

  // PDF에서 페이지 3장을 뽑아 썸네일 후보로 (첫 장, 1/3, 2/3 지점)
  async function pagesFromPdf(source, fallbackUrl) {
    if (!window.pdfjsLib) return;
    state.loadingPages = true;
    renderThumbs();
    let doc;
    try {
      let data = source;
      if (typeof source === 'string') {
        let res = await fetch(source).catch(() => null);
        if (!res?.ok && fallbackUrl) res = await fetch(fallbackUrl);
        data = await res.arrayBuffer();
      }
      doc = await pdfjsLib.getDocument({ data: new Uint8Array(data) }).promise;
      const n = doc.numPages;
      const pages = [...new Set([1, Math.round(n * 0.35), Math.round(n * 0.7)])].filter((x) => x >= 1 && x <= n);
      state.options = state.options.filter((o) => o.kind !== 'page');
      const firstNew = !state.selected || state.selected.startsWith('page');
      for (const num of pages) {
        const page = await doc.getPage(num);
        const base = page.getViewport({ scale: 1 });
        const vp = page.getViewport({ scale: Math.min(3, 1280 / base.width) });
        const c = document.createElement('canvas');
        c.width = Math.round(vp.width);
        c.height = Math.round(vp.height);
        await page.render({ canvasContext: c.getContext('2d', { alpha: false }), viewport: vp }).promise;
        const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.84));
        const insertAt = state.options.findIndex((o) => o.kind === 'custom');
        const opt = { key: 'page' + num, kind: 'page', blob, url: URL.createObjectURL(blob), label: `${num}쪽` };
        insertAt > -1 ? state.options.splice(insertAt, 0, opt) : state.options.push(opt);
      }
      if (firstNew) state.selected = 'page' + pages[0];
      return n;
    } catch (err) {
      console.warn(err);
      toast('PDF에서 썸네일을 만들지 못했습니다. 이미지를 직접 올려주세요.', true);
    } finally {
      doc?.destroy();
      state.loadingPages = false;
      renderThumbs();
    }
  }

  $('#thumb-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) return toast('JPG/PNG/WEBP/GIF 이미지만 올릴 수 있습니다.', true);
    const blob = await resizeImage(file, 1920);
    state.options = state.options.filter((o) => o.kind !== 'custom');
    state.options.push({ key: 'custom', kind: 'custom', blob, url: URL.createObjectURL(blob), label: '직접 올림' });
    state.selected = 'custom';
    dirty = true;
    renderThumbs();
  });

  async function acceptPdf(file) {
    if (!file) return;
    if (file.type !== 'application/pdf') return toast('PDF 파일만 올릴 수 있습니다.', true);
    if (file.size > 90 * MB) return toast('PDF가 90MB를 넘어서 GitHub에 올릴 수 없습니다. 용량을 줄여주세요.', true);
    if (file.size > 40 * MB) toast('40MB가 넘는 PDF는 사이트에서 열리는 데 오래 걸릴 수 있어요. 가능하면 압축을 권장합니다.');
    state.pdfFile = file;
    state.removePdf = false;
    dirty = true;
    setPdfUi({ name: file.name, size: file.size });
    const pages = await pagesFromPdf(await file.arrayBuffer());
    if (state.pdfFile === file && pages) setPdfUi({ name: `${file.name} · ${pages}쪽`, size: file.size });
  }

  function bindDrop(drop, onFile) {
    const input = $('input[type=file]', drop);
    input.addEventListener('change', () => {
      onFile(input.files[0]);
      input.value = '';
    });
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('is-over'); }));
    drop.addEventListener('drop', (e) => onFile(e.dataTransfer.files[0]));
  }
  bindDrop($('#drop-pdf'), acceptPdf);

  $('#remove-pdf').addEventListener('click', () => {
    state.pdfFile = null;
    state.removePdf = true;
    state.options = state.options.filter((o) => o.kind !== 'page');
    if (state.selected?.startsWith('page')) state.selected = state.options[0]?.key || null;
    dirty = true;
    setPdfUi(null);
    renderThumbs();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.title.value.trim()) {
      form.title.focus();
      return toast('제목을 입력하세요.', true);
    }
    if (state.loadingPages) return toast('썸네일을 만드는 중입니다. 잠시만 기다려주세요.');
    const video = form.video.value.trim();
    if (video && !ytId(video)) {
      form.video.focus();
      return toast('유튜브 링크를 확인해 주세요. 영상 페이지 주소를 그대로 붙여 넣으면 돼요.', true);
    }
    const id = editing?.id || uid();
    const now = new Date().toISOString();
    const fields = {
      title: form.title.value.trim(),
      subtitle: form.subtitle.value.trim(),
      category: form.category.value.trim(),
      docType: form.docType.value,
      video: video ? `https://www.youtube.com/watch?v=${ytId(video)}` : undefined,
      sample: undefined, // 직접 수정해 저장하면 더 이상 '예시'가 아님
      year: form.year.value.trim(),
      tags: form.tags.value.split(',').map((t) => t.trim()).filter(Boolean),
      summary: form.summary.value.trim(),
      description: form.description.value.trim(),
      visible: form.visible.checked,
      updatedAt: now,
    };
    const files = [];
    const fileFields = {};
    if (state.pdfFile) {
      const path = `uploads/${id}-${uid()}.pdf`;
      files.push({ path, blob: state.pdfFile });
      Object.assign(fileFields, { pdf: path, pdfName: state.pdfFile.name, pdfSize: state.pdfFile.size });
    } else if (state.removePdf) {
      Object.assign(fileFields, { pdf: null, pdfName: null, pdfSize: null });
    }
    const sel = state.options.find((o) => o.key === state.selected);
    if (sel && sel.kind !== 'current') {
      const path = `uploads/${id}-${uid()}-thumb.${extOf(sel.blob)}`;
      files.push({ path, blob: sel.blob });
      Object.assign(fileFields, { thumb: path, cover: null });
    } else if (!sel) {
      Object.assign(fileFields, { thumb: null, cover: null });
    }

    const btn = $('#save-post');
    const prog = $('#upload-progress');
    btn.disabled = true;
    prog.hidden = false;
    const setProg = (r) => {
      $('i', prog).style.width = r * 100 + '%';
      $('span', prog).textContent = r < 1 ? `GitHub에 업로드 중 ${Math.round(r * 100)}%` : '커밋 중…';
    };
    setProg(files.length ? 0 : 1);
    try {
      await save(
        `${editing ? '포트폴리오 수정' : '포트폴리오 추가'}: ${fields.title}`,
        (d) => {
          let x = d.projects.find((y) => y.id === id);
          if (!x) {
            x = { id, createdAt: now };
            d.projects.unshift(x);
          }
          Object.assign(x, fields, fileFields);
        },
        files,
        setProg
      );
      dirty = false;
      toast(editing ? '수정했습니다. 1~2분 뒤 사이트에 반영됩니다.' : '게시했습니다. 1~2분 뒤 사이트에 반영됩니다.');
      switchView('board', true);
    } catch (err) {
      toast(err.message, true);
    } finally {
      btn.disabled = false;
      prog.hidden = true;
    }
  });

  /* ---------------- 사이트 설정 ---------------- */
  const sForm = $('#settings-form');
  const slotFiles = {};
  const SLOTS = [
    ['hero', '01 Home'],
    ['about', '02 About'],
    ['timeline', '03 Timeline'],
    ['skills', '04 Skills'],
    ['works', '05 Works'],
    ['contact', '06 Contact'],
  ];
  sForm.addEventListener('input', () => (dirty = true));

  function repeater(el, items, fields, cls, addLabel) {
    const row = (item = {}) => {
      const r = h('div', { className: 'rep-row ' + cls });
      fields.forEach(([key, ph]) => {
        const inp = h('input', { value: item[key] || '', placeholder: ph });
        inp.dataset.key = key;
        r.append(inp);
      });
      const x = h('button', { type: 'button', className: 'icon-btn danger', textContent: '✕', title: '삭제' });
      x.onclick = () => {
        r.remove();
        dirty = true;
      };
      r.append(x);
      return r;
    };
    const add = h('button', { type: 'button', className: 'btn sm rep-add', textContent: '+ ' + addLabel });
    add.onclick = () => {
      el.insertBefore(row(), add);
      dirty = true;
    };
    el.replaceChildren(...items.map(row), add);
  }
  const readRepeater = (el) =>
    $$('.rep-row', el)
      .map((r) => Object.fromEntries($$('input', r).map((i) => [i.dataset.key, i.value.trim()])))
      .filter((o) => Object.values(o).some(Boolean));

  /* --- 타임라인(연혁) 편집기 --- */
  const TL_TYPES = ['교육', '인턴십', '경력', '프로젝트', '수상', '자격증', '활동', '기타'];
  function tlEditor(items) {
    const box = $('#tl-editor');
    const row = (it = {}) => {
      const r = h('div', { className: 'tl-row' });
      const type = h('select', { title: '구분' }, ...TL_TYPES.map((t) => h('option', { value: t, textContent: t, selected: t === (it.type || '교육') })));
      const period = h('input', { value: it.period || '', placeholder: '기간 (예: 2023.07 — 2023.12)', maxLength: 40 });
      const title = h('input', { value: it.title || '', placeholder: '제목 (예: ○○게임즈 기획 인턴)', maxLength: 60 });
      const org = h('input', { value: it.org || '', placeholder: '기관 · 소속 (선택)', maxLength: 60 });
      const desc = h('textarea', { value: it.desc || '', placeholder: '한두 줄 설명 (선택)', maxLength: 200, rows: 3 });
      const tasks = h('textarea', { value: (Array.isArray(it.tasks) ? it.tasks : []).join('\n'), placeholder: '주요 업무 — 한 줄에 하나씩 (선택)\n예: 이벤트 기획서 작성\n예: 보상 테이블 정리', rows: 3 });
      const del = h('button', { type: 'button', className: 'icon-btn danger', textContent: '✕', title: '삭제' });
      del.onclick = () => { r.remove(); dirty = true; };
      [type, period, title, org, desc].forEach((n, k) => (n.dataset.key = ['type', 'period', 'title', 'org', 'desc'][k]));
      tasks.dataset.tasks = '1';
      type.addEventListener('change', () => (dirty = true));
      // 배경 사진: 사이트에서 이 항목을 보고 있을 때 뒷배경이 이 사진으로 바뀜
      r._id = it.id || 't' + uid(); // 지원처별 링크에서 이 경력을 켜고 끌 때 쓰는 고정 ID
      r._image = it.image || '';
      r._focusX = it.focusX ?? 0.5;
      const drop = h(
        'label', { className: 'drop tl-drop', title: '배경 사진 — 이 항목을 볼 때 뒷배경이 이 사진으로 바뀌어요' },
        h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/gif', hidden: true }),
        h('span', { className: 'drop-empty', textContent: '+ 배경 사진', hidden: !!r._image }),
        r._image ? img(r._image) : null
      );
      const clear = h('button', { type: 'button', className: 'tl-drop-clear', textContent: '사진 빼기', hidden: !r._image });
      clear.onclick = () => {
        r._image = '';
        r._blob = null;
        $('img', drop)?.remove();
        $('.drop-empty', drop).hidden = false;
        clear.hidden = true;
        dirty = true;
      };
      bindDrop(drop, async (file) => {
        if (!file || !/^image\//.test(file.type)) return toast('이미지 파일만 올릴 수 있습니다.', true);
        r._blob = await resizeImage(file, 2400, 0.88);
        dirty = true;
        let el = $('img', drop);
        if (!el) drop.append((el = h('img', { alt: '' })));
        el.src = URL.createObjectURL(r._blob);
        $('.drop-empty', drop).hidden = true;
        clear.hidden = false;
      });
      r.append(h('div', { className: 'tl-photo-cell' }, drop, clear), type, period, title, org, desc, tasks, del);
      return r;
    };
    const add = h('button', { type: 'button', className: 'btn sm rep-add', textContent: '+ 연혁 추가' });
    add.onclick = () => {
      if ($$('.tl-row', box).length >= 30) return toast('연혁은 30개까지 넣을 수 있어요.', true);
      box.insertBefore(row(), add);
      dirty = true;
    };
    box.replaceChildren(...items.map(row), add);
  }
  /** 연혁 읽기. 새로 고른 배경 사진은 files에 넣어 함께 커밋 */
  function readTimeline(files = []) {
    return $$('#tl-editor .tl-row')
      .map((r) => {
        const x = Object.fromEntries($$('[data-key]', r).map((n) => [n.dataset.key, n.value.trim()]));
        x.id = r._id;
        x.tasks = $('[data-tasks]', r).value.split('\n').map((t) => t.trim()).filter(Boolean);
        if (r._blob) {
          const path = `uploads/timeline-${uid()}.${extOf(r._blob)}`;
          files.push({ slot: 'timeline-item', path, blob: r._blob });
          x.image = path;
        } else if (r._image) x.image = r._image;
        if (x.image) x.focusX = r._focusX;
        return x;
      })
      .filter((x) => x.title || x.period);
  }

  /* --- 링크 프리셋: 고르기 → 이름 → 프리셋 생성(바로 저장) → 링크 복사 --- */
  const SITE_ROOT = new URL('../', location.href).href;
  const cleanTag = (raw) =>
    String(raw || '').trim().toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  const presetUrl = (tag) => `${SITE_ROOT}?from=${encodeURIComponent(tag)}`;
  let prEditing = null; // 불러와서 고치는 중인 프리셋의 이름표
  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast('링크를 복사했어요. 지원서에 붙여 넣으세요.');
    } catch {
      toast('복사하지 못했어요. 링크를 길게 눌러 직접 복사해 주세요.', true);
    }
  };
  const prItems = () => ({
    works: db.projects || [],
    timeline: (Array.isArray(db.settings?.timeline) ? db.settings.timeline : []).filter((x) => x.id),
  });
  function prTiles(hide = { works: [], timeline: [] }) {
    const { works, timeline } = prItems();
    const hw = new Set(hide.works || []), ht = new Set(hide.timeline || []);
    const tile = (kind, id, on, ...kids) => {
      const b = h('button', { type: 'button', className: 'pr-tile' }, h('i', { className: 'pr-check', ariaHidden: 'true' }), ...kids);
      b.dataset.kind = kind;
      b.dataset.id = id;
      b.setAttribute('aria-pressed', String(on));
      return b;
    };
    $('#pr-works').replaceChildren(
      ...works.map((p) => {
        const t = p.thumb || p.cover;
        return tile('works', p.id, !hw.has(p.id), t ? img(t, { className: 'pr-thumb' }) : h('span', { className: 'pr-thumb empty' }), h('b', { textContent: p.title }), h('small', { textContent: [p.docType, p.visible === false ? '비공개' : ''].filter(Boolean).join(' · ') }));
      })
    );
    $('#pr-timeline').replaceChildren(
      ...(timeline.length
        ? timeline.map((x) => tile('timeline', x.id, !ht.has(x.id), h('b', { textContent: x.title || x.period }), h('small', { textContent: [x.type, x.period].filter(Boolean).join(' · ') })))
        : [h('p', { className: 'muted sm', textContent: '사이트 설정에서 타임라인 경력을 저장하면 여기에 나와요.' })])
    );
    prCount();
  }
  function prCount() {
    const n = (kind, on) => $$(`#pr-builder .pr-tile[data-kind="${kind}"]`).filter((b) => on === undefined || (b.getAttribute('aria-pressed') === 'true') === on).length;
    $('#pr-picked').textContent = `기획서 ${n('works', true)}/${n('works')} · 경력 ${n('timeline', true)}/${n('timeline')}`;
  }
  function prSlots() {
    const links = db.settings?.links || [];
    const { works, timeline } = prItems();
    $('#pr-count').textContent = links.length ? `${links.length}개` : '';
    $('#pr-slots').replaceChildren(
      ...(links.length
        ? links.map((l) => {
            const w = works.filter((p) => !(l.hide?.works || []).includes(p.id)).length;
            const t = timeline.filter((x) => !(l.hide?.timeline || []).includes(x.id)).length;
            const copy = h('button', { type: 'button', className: 'btn sm primary', textContent: '링크 복사' });
            copy.onclick = () => copyText(presetUrl(l.tag));
            const load = h('button', { type: 'button', className: 'btn sm', textContent: '불러오기' });
            load.onclick = () => prLoad(l);
            const del = h('button', { type: 'button', className: 'icon-btn danger', textContent: '✕', title: '삭제' });
            del.onclick = () => prDelete(l);
            return h(
              'div', { className: 'pr-slot' + (prEditing === l.tag ? ' is-editing' : '') },
              h('div', { className: 'pr-slot-head' }, h('b', { textContent: l.name || l.tag }), del),
              h('p', { className: 'pr-slot-tag', textContent: '?from=' + l.tag }),
              h('p', { className: 'pr-slot-stat', textContent: `기획서 ${w} · 경력 ${t}` }),
              h('div', { className: 'pr-slot-acts' }, copy, load)
            );
          })
        : [h('p', { className: 'muted sm pr-empty', textContent: '아직 프리셋이 없어요. 아래에서 첫 프리셋을 만들어 보세요.' })])
    );
  }
  function prReset() {
    prEditing = null;
    $('#pr-title').textContent = '새 프리셋 만들기';
    $('#pr-create').textContent = '프리셋 생성';
    $('#pr-reset').hidden = true;
    $('#pr-name').value = '';
    $('#pr-tag').value = '';
    $('#pr-tag').dataset.touched = '';
    $('#pr-result').hidden = true;
    prTiles();
    prSlots();
  }
  function prLoad(l) {
    prEditing = l.tag;
    $('#pr-title').textContent = `‘${l.name || l.tag}’ 고치기`;
    $('#pr-create').textContent = '프리셋 저장';
    $('#pr-reset').hidden = false;
    $('#pr-name').value = l.name || '';
    $('#pr-tag').value = l.tag;
    $('#pr-tag').dataset.touched = '1';
    $('#pr-url').value = presetUrl(l.tag);
    $('#pr-result').hidden = false;
    prTiles(l.hide);
    prSlots();
    $('#pr-builder').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  async function prDelete(l) {
    if (!(await confirmBox(`‘${l.name || l.tag}’ 프리셋을 지울까요?\n이 링크로 들어오면 전부 보이게 돼요.`, '삭제'))) return;
    try {
      await save(`링크 프리셋 삭제: ${l.name || l.tag}`, (d) => {
        d.settings.links = (d.settings.links || []).filter((x) => x.tag !== l.tag);
      });
      toast('프리셋을 지웠어요.');
      if (prEditing === l.tag) prReset();
      else prSlots();
    } catch (err) {
      toast(err.message, true);
    }
  }
  function openPresets() {
    prReset();
  }
  $('#pr-builder')?.addEventListener('click', (e) => {
    const t = e.target.closest('.pr-tile');
    if (t) {
      t.setAttribute('aria-pressed', String(t.getAttribute('aria-pressed') !== 'true'));
      return prCount();
    }
    const all = e.target.closest('[data-all]');
    if (all) {
      $$(`#pr-builder .pr-tile[data-kind="${all.dataset.all}"]`).forEach((b) => b.setAttribute('aria-pressed', String(all.dataset.on === '1')));
      prCount();
    }
  });
  // 이름을 쓰면 이름표를 자동으로 (직접 고친 뒤에는 그대로)
  $('#pr-name')?.addEventListener('input', () => {
    if ($('#pr-tag').dataset.touched) return;
    // 주소에 한글이 들어가면 길게 깨져 보여서, 영문·숫자만 남기고 없으면 link-1, link-2 …
    const latin = cleanTag($('#pr-name').value).replace(/[^a-z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    const used = new Set((db.settings?.links || []).map((l) => l.tag));
    let auto = latin;
    for (let k = 1; !auto || used.has(auto); k++) auto = latin && k === 1 ? latin : `${latin || 'link'}-${k}`;
    $('#pr-tag').value = $('#pr-name').value.trim() ? auto : '';
  });
  $('#pr-tag')?.addEventListener('input', () => ($('#pr-tag').dataset.touched = '1'));
  $('#pr-tag')?.addEventListener('blur', () => ($('#pr-tag').value = cleanTag($('#pr-tag').value)));
  $('#pr-reset')?.addEventListener('click', prReset);
  $('#pr-copy')?.addEventListener('click', () => copyText($('#pr-url').value));
  $('#pr-create')?.addEventListener('click', async () => {
    const name = $('#pr-name').value.trim();
    const tag = cleanTag($('#pr-tag').value || name);
    if (!name && !tag) return $('#pr-name').focus(), toast('프리셋 이름을 정해 주세요.', true);
    if (!tag) return $('#pr-tag').focus(), toast('링크 이름표를 정해 주세요.', true);
    if ((db.settings?.links || []).some((l) => l.tag === tag && l.tag !== prEditing)) return $('#pr-tag').focus(), toast(`이름표 ‘${tag}’는 이미 다른 프리셋이 쓰고 있어요.`, true);
    const off = (kind) => $$(`#pr-builder .pr-tile[data-kind="${kind}"]`).filter((b) => b.getAttribute('aria-pressed') !== 'true').map((b) => b.dataset.id);
    const preset = { name: name || tag, tag, hide: { works: off('works'), timeline: off('timeline') } };
    const btn = $('#pr-create');
    btn.disabled = true;
    const old = prEditing;
    try {
      await save(`${old ? '링크 프리셋 수정' : '링크 프리셋 생성'}: ${preset.name}`, (d) => {
        const list = d.settings.links || [];
        const i = list.findIndex((x) => x.tag === (old || tag));
        if (i > -1) list[i] = preset;
        else list.push(preset);
        d.settings.links = list;
      });
      prEditing = tag;
      $('#pr-title').textContent = `‘${preset.name}’ 고치기`;
      btn.textContent = '프리셋 저장';
      $('#pr-reset').hidden = false;
      $('#pr-tag').value = tag;
      $('#pr-url').value = presetUrl(tag);
      $('#pr-result').hidden = false;
      $('#pr-result').classList.remove('is-new');
      void $('#pr-result').offsetWidth;
      $('#pr-result').classList.add('is-new');
      toast(old ? '프리셋을 저장했어요. 1~2분 뒤 링크에 반영돼요.' : '프리셋을 만들었어요. 링크를 복사하세요.');
      prSlots();
    } catch (err) {
      toast(err.message, true);
    } finally {
      btn.disabled = false;
    }
  });

  /* --- 스킬 차트 편집기 --- */
  const ICONS = window.SKILL_ICONS || {};
  function skillEditor(items) {
    const box = $('#skill-editor');
    const row = (it = { name: '', level: 70, icon: 'idea', desc: '', group: 'hard' }) => {
      const r = h('div', { className: 'skill-row' });
      const preview = h('span', { className: 'skill-icon-preview' });
      const opts = (logo) => Object.entries(ICONS).filter(([, v]) => !!(v.logo || v.made) === logo).sort((a, b) => (logo ? a[1].label.localeCompare(b[1].label, 'en', { sensitivity: 'base' }) : 0)).map(([k, v]) => h('option', { value: k, textContent: v.label, selected: k === it.icon }));
      const icon = h('select', { className: 'skill-icon-select', title: '아이콘' }, h('optgroup', { label: '툴 로고' }, ...opts(true)), h('optgroup', { label: '아이콘' }, ...opts(false)));
      const setPreview = () => (preview.innerHTML = window.skillIconSvg ? window.skillIconSvg(icon.value, 18) : '');
      icon.addEventListener('change', () => { setPreview(); dirty = true; });
      setPreview();
      const name = h('input', { value: it.name || '', placeholder: '스킬 이름 (예: 시스템 기획)', maxLength: 30 });
      const level = h('input', { type: 'number', min: 0, max: 100, step: 5, value: it.level ?? 70, title: '숙련도 (0~100)' });
      const bar = h('i', { className: 'skill-level-bar' });
      const setBar = () => bar.style.setProperty('--w', Math.max(0, Math.min(100, Number(level.value) || 0)) + '%');
      level.addEventListener('input', setBar);
      setBar();
      const desc = h('input', { value: it.desc || '', placeholder: '말풍선 설명: 이 스킬로 무엇을 할 수 있는지', maxLength: 160 });
      const up = h('button', { type: 'button', className: 'icon-btn', textContent: '▲', title: '위로' });
      const down = h('button', { type: 'button', className: 'icon-btn', textContent: '▼', title: '아래로' });
      const del = h('button', { type: 'button', className: 'icon-btn danger', textContent: '✕', title: '삭제' });
      up.onclick = () => { r.previousElementSibling?.classList.contains('skill-row') && box.insertBefore(r, r.previousElementSibling); dirty = true; };
      down.onclick = () => { r.nextElementSibling?.classList.contains('skill-row') && box.insertBefore(r.nextElementSibling, r); dirty = true; };
      del.onclick = () => { r.remove(); dirty = true; };
      // 묶음: 사이트 스킬 차트 위 탭 (하드 스킬 / 소프트 스킬 / 전체)
      const group = h('select', { className: 'skill-group-select', title: '묶음' }, h('option', { value: 'hard', textContent: '하드 스킬', selected: it.group !== 'soft' }), h('option', { value: 'soft', textContent: '소프트 스킬', selected: it.group === 'soft' }));
      group.addEventListener('change', () => (dirty = true));
      r.append(h('span', { className: 'skill-icon-cell' }, preview, icon), name, group, h('span', { className: 'skill-level-cell' }, level, bar), desc, h('span', { className: 'acts' }, up, down, del));
      return r;
    };
    const head = h('div', { className: 'skill-row head muted sm' }, h('span', { textContent: '아이콘' }), h('span', { textContent: '스킬 이름' }), h('span', { textContent: '묶음' }), h('span', { textContent: '숙련도 (0~100)' }), h('span', { textContent: '설명' }), h('span'));
    const add = h('button', { type: 'button', className: 'btn sm rep-add', textContent: '+ 스킬 추가' });
    add.onclick = () => {
      if ($$('.skill-row:not(.head)', box).length >= 12) return toast('스킬은 12개까지 넣을 수 있어요.', true);
      box.insertBefore(row(), add);
      dirty = true;
    };
    box.replaceChildren(head, ...items.map(row), add);
  }
  function readSkills() {
    return $$('#skill-editor .skill-row:not(.head)')
      .map((r) => {
        const [name, level, desc] = $$('input', r);
        return { name: name.value.trim(), level: Math.max(0, Math.min(100, Math.round(Number(level.value) || 0))), icon: $('.skill-icon-select', r).value, group: $('.skill-group-select', r).value, desc: desc.value.trim() };
      })
      .filter((s) => s.name);
  }

  function fillSettings() {
    const s = db.settings || {};
    const f = sForm;
    f.nameKo.value = s.nameKo || '';
    f.nameEn.value = s.nameEn || '';
    f.role.value = s.role || '';
    f.eyebrow.value = s.eyebrow || '';
    f.intro.value = s.intro || '';
    f.siteTitle.value = s.siteTitle || '';
    f.aboutHeading.value = s.about?.heading || '';
    f.bio.value = s.about?.bio || '';
    f.skills.value = (s.about?.skills || []).join(', ');
    f.tools.value = (s.about?.tools || []).join(', ');
    f.worksIntro.value = s.worksIntro || '';
    f.docTypes.value = docTypeList().join(', ');
    f.contactHeading.value = s.contact?.heading || '';
    f.email.value = s.contact?.email || '';
    f.contactMessage.value = s.contact?.message || '';
    f.anaUrl.value = s.analytics?.url || '';
    f.anaKey.value = s.analytics?.key || '';
    f.forceDesktop.checked = !!s.forceDesktop;
    sForm.querySelector(`[name="tone"][value="${s.tone === 'mono' ? 'mono' : 'teal'}"]`).checked = true;
    $('#tone-preview-teal').href = SITE_ROOT + '?tone=teal';
    $('#tone-preview-mono').href = SITE_ROOT + '?tone=mono';
    repeater($('#rep-meta'), s.meta || [], [['label', '항목 (예: Focus)'], ['value', '내용']], 'meta', '정보 추가');
    f.skillsHeading.value = s.skillsHeading || 'Skills';
    f.skillsIntro.value = s.skillsIntro || '';
    skillEditor(s.skillChart || []);
    f.timelineHeading.value = s.timelineHeading || 'Timeline';
    f.timelineIntro.value = s.timelineIntro || '';
    tlEditor(Array.isArray(s.timeline) ? s.timeline : s.about?.experience || []);
    repeater($('#rep-links'), s.contact?.links || [], [['label', '이름 (예: Notion)'], ['url', 'https://']], 'links', '링크 추가');

    Object.keys(slotFiles).forEach((k) => delete slotFiles[k]);
    $('#image-slots').replaceChildren(
      ...SLOTS.map(([key, label]) => {
        const im = s.images?.[key] || {};
        const drop = h(
          'label', { className: 'drop' },
          h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/gif', hidden: true }),
          h('span', { className: 'drop-empty', textContent: '사진 선택', hidden: !!im.src }),
          im.src ? img(im.src) : null
        );
        const range = h('input', { type: 'range', min: 0, max: 1, step: 0.01, value: im.focusX ?? 0.5 });
        range.dataset.slot = key;
        const setPreview = () => {
          const el = $('img', drop);
          if (el) el.style.objectPosition = `${range.value * 100}% 50%`;
        };
        range.addEventListener('input', setPreview);
        bindDrop(drop, async (file) => {
          if (!file || !/^image\//.test(file.type)) return toast('이미지 파일만 올릴 수 있습니다.', true);
          const blob = await resizeImage(file, 2400, 0.88);
          slotFiles[key] = blob;
          dirty = true;
          let el = $('img', drop);
          if (!el) drop.append((el = h('img', { alt: '' })));
          el.src = URL.createObjectURL(blob);
          $('.drop-empty', drop).hidden = true;
          setPreview();
        });
        requestAnimationFrame(setPreview);
        return h(
          'div', { className: 'slot' },
          h('span', { className: 'slot-name', textContent: label }),
          drop,
          h('label', { className: 'slot-focus' }, h('span', { textContent: '피사체 위치' }), range, h('span', { className: 'scale' }, h('span', { textContent: '왼쪽' }), h('span', { textContent: '오른쪽' })))
        );
      })
    );
    dirty = false;
  }

  $('#save-settings').addEventListener('click', async () => {
    const f = sForm;
    const list = (v) => v.split(',').map((x) => x.trim()).filter(Boolean);
    const focus = {};
    $$('#image-slots input[type=range]').forEach((r) => (focus[r.dataset.slot] = Number(r.value)));
    const files = Object.entries(slotFiles).map(([slot, blob]) => ({ slot, path: `uploads/site-${slot}-${uid()}.${extOf(blob)}`, blob }));
    const values = {
      analytics: { url: f.anaUrl.value.trim().replace(/\/+$/, ''), key: f.anaKey.value.trim() },
      forceDesktop: f.forceDesktop.checked,
      tone: sForm.querySelector('[name="tone"]:checked')?.value === 'mono' ? 'mono' : 'teal',
      siteTitle: f.siteTitle.value.trim(),
      nameKo: f.nameKo.value.trim(),
      nameEn: f.nameEn.value.trim(),
      role: f.role.value.trim(),
      eyebrow: f.eyebrow.value.trim(),
      intro: f.intro.value.trim(),
      meta: readRepeater($('#rep-meta')),
      about: {
        heading: f.aboutHeading.value.trim(),
        bio: f.bio.value.trim(),
        skills: list(f.skills.value),
        tools: list(f.tools.value),
      },
      worksIntro: f.worksIntro.value.trim(),
      docTypes: list(f.docTypes.value),
      timelineHeading: f.timelineHeading.value.trim() || 'Timeline',
      timelineIntro: f.timelineIntro.value.trim(),
      timeline: readTimeline(files),
      skillsHeading: f.skillsHeading.value.trim() || 'Skills',
      skillsIntro: f.skillsIntro.value.trim(),
      skillChart: readSkills(),
      contact: {
        heading: f.contactHeading.value.trim(),
        message: f.contactMessage.value.trim(),
        email: f.email.value.trim(),
        links: readRepeater($('#rep-links')),
      },
    };
    const btn = $('#save-settings');
    btn.disabled = true;
    try {
      await save(
        '사이트 설정 수정',
        (d) => {
          const prev = d.settings?.images || {};
          const images = {};
          SLOTS.forEach(([slot]) => {
            const nf = files.find((x) => x.slot === slot);
            images[slot] = { src: nf ? nf.path : prev[slot]?.src || null, focusX: focus[slot] ?? prev[slot]?.focusX ?? 0.5 };
          });
          d.settings = { ...values, links: d.settings?.links || [], images }; // 링크 프리셋은 그 탭에서만 바꿈
        },
        files,
        (r) => (btn.textContent = r < 1 ? `업로드 ${Math.round(r * 100)}%` : '커밋 중…')
      );
      dirty = false;
      toast('설정을 저장했습니다. 1~2분 뒤 사이트에 반영됩니다.');
      fillSettings();
    } catch (err) {
      toast(err.message, true);
    } finally {
      btn.disabled = false;
      btn.textContent = '설정 저장';
    }
  });

  /* ---------------- 시작 ---------------- */
  const cfg = loadCfg();
  if (cfg?.token) {
    connect(cfg).catch((err) => showLogin(err.message));
  } else {
    showLogin();
  }
})();
