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
  /** 저장이 토큰 문제로 막혔을 때: 고치던 화면은 그대로 두고 새 토큰만 받음 */
  function askToken(reason) {
    let d = document.getElementById('token-ask');
    if (!d) {
      d = h('dialog', { id: 'token-ask', className: 'confirm' });
      d.innerHTML = `<form method="dialog" class="token-ask">
        <h3>GitHub 토큰을 바꿔 주세요</h3>
        <p class="muted sm" id="token-ask-why"></p>
        <p class="sm">고치던 내용은 그대로 있어요. 새 토큰을 넣으면 바로 다시 저장해요.<br>
        <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">새 토큰 만들기 ↗</a> · Repository access: 이 저장소 · Contents: <b>Read and write</b></p>
        <input type="password" id="token-ask-input" placeholder="github_pat_…" autocomplete="off" spellcheck="false" />
        <div class="confirm-actions"><button class="btn ghost" value="cancel">취소</button><button class="btn primary" value="ok">이 토큰으로 저장</button></div>
      </form>`;
      document.body.append(d);
    }
    $('#token-ask-why', d).textContent = reason || '';
    $('#token-ask-input', d).value = '';
    d.returnValue = '';
    d.showModal();
    setTimeout(() => $('#token-ask-input', d).focus(), 50);
    return new Promise((resolve) => d.addEventListener('close', () => resolve(d.returnValue === 'ok' ? $('#token-ask-input', d).value.trim() : ''), { once: true }));
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
        // 토큰 문제(만료 · 쓰기 권한 없음): 고치던 내용은 그대로 두고 새 토큰만 받아 한 번 더 저장
        if (err.readonly) {
          setSync('idle', '읽기 전용');
          throw err;
        }
        if (err.status === 401 || err.status === 403) {
          const t = await askToken(err.message);
          if (t) {
            store.token = t;
            try {
              const cfg = loadCfg();
              if (cfg) saveCfg({ ...cfg, token: t }, !!localStorage.getItem(CFG_KEY));
            } catch {}
            try {
              db = await store.commit(message, mutate, files, onProgress);
              watchDeploy(db.rev);
              toast('새 토큰으로 저장했어요.');
              return db;
            } catch (err2) {
              err = err2;
            }
          }
        }
        setSync('error', '저장 실패');
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
  /** 읽기 전용: 사이트에 올라가 있는 데이터를 그대로 읽고, 저장은 막음 */
  class ReadOnlyStore {
    constructor() {
      Object.assign(this, { owner: '읽기 전용', repo: '', branch: '', token: '', readonly: true });
    }
    rawUrl(p) {
      return ROOT + p;
    }
    async verify() {}
    async readData() {
      const res = await fetch(ROOT + 'data/site.json?t=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) throw new Error('사이트 데이터를 불러오지 못했어요.');
      return res.json();
    }
    async commit() {
      const e = new Error('읽기 전용으로 둘러보는 중이라 저장되지 않아요. 고치려면 오른쪽 위 ‘GitHub 연결’로 로그인하세요.');
      e.readonly = true;
      throw e;
    }
  }
  $('#readonly-enter')?.addEventListener('click', async () => {
    try {
      store = new ReadOnlyStore();
      db = await store.readData();
      db.projects ||= [];
      document.body.classList.add('is-readonly');
      $('#repo-label').textContent = '읽기 전용 · 저장 안 됨';
      $('#login').hidden = true;
      $('#app').hidden = false;
      setSync('idle', '읽기 전용');
      renderBoard();
      switchView('board', true);
      window.StudioStats?.pulse(db.settings?.analytics);
    } catch (err) {
      $('#login-error').textContent = err.message;
    }
  });
  async function connect(cfg) {
    document.body.classList.remove('is-readonly');
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
    window.StudioStats?.pulse(db.settings?.analytics);
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
    if (store?.readonly) {
      store = null;
      document.body.classList.remove('is-readonly');
      return showLogin();
    }
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
        // 왼쪽 손잡이를 끌어 순서 바꾸기 (검색 중에는 끔)
        const grip = h('button', { className: 'grip', type: 'button', title: q ? '검색 중에는 순서를 바꿀 수 없어요' : '끌어서 순서 바꾸기', ariaLabel: `${p.title} 순서 바꾸기`, disabled: !!q });
        grip.innerHTML = '<svg viewBox="0 0 12 18" width="10" height="16" aria-hidden="true"><g fill="currentColor"><circle cx="3" cy="3" r="1.5"/><circle cx="9" cy="3" r="1.5"/><circle cx="3" cy="9" r="1.5"/><circle cx="9" cy="9" r="1.5"/><circle cx="3" cy="15" r="1.5"/><circle cx="9" cy="15" r="1.5"/></g></svg>';
        grip.addEventListener('pointerdown', (e) => startDrag(e, grip.closest('tr')));
        const tr = h(
          'tr', {},
          h('td', { className: 'c-no' }, h('span', { className: 'no-cell' }, grip, h('span', { textContent: String(total - i) }))),
          h('td', {}, thumb ? img(thumb, { className: 'thumb' }) : h('span', { className: 'thumb empty', textContent: '없음' })),
          h('td', {}, title, h('div', { className: 'post-sub', textContent: [p.subtitle, p.year].filter(Boolean).join(' · ') })),
          h('td', {}, p.docType ? h('span', { className: 'badge', textContent: p.docType }) : null, p.sample ? h('span', { className: 'badge muted-badge', textContent: '예시' }) : null, p.category ? h('div', { className: 'post-sub', textContent: p.category }) : null),
          h(
            'td', {},
            p.pdf ? h('a', { className: 'pdf-link', href: assetUrl(p.pdf), target: '_blank', rel: 'noopener', textContent: `PDF ${fmtSize(p.pdfSize)}` }) : null,
            p.link ? h('a', { className: 'pdf-link', href: p.link, target: '_blank', rel: 'noopener', textContent: '↗ 사이트' }) : null,
            ytId(p.video) ? h('a', { className: 'pdf-link yt', href: p.video, target: '_blank', rel: 'noopener', textContent: '▶ 영상' }) : null,
            !p.pdf && !ytId(p.video) && !p.link ? h('span', { className: 'muted', textContent: '—' }) : null
          ),
          h('td', {}, h('label', { className: 'switch' }, vis, h('i'))),
          h('td', { className: 'c-date', textContent: fmtDate(p.updatedAt) }),
          h('td', {}, h('div', { className: 'acts' }, up, down, edit, del))
        );
        tr.dataset.id = p.id;
        return tr;
      })
    );
    $('#board-empty').hidden = db.projects.length > 0;
    $('#category-list').replaceChildren(...[...new Set(db.projects.map((p) => p.category).filter(Boolean))].map((c) => h('option', { value: c })));
  }
  $('#search').addEventListener('input', renderBoard);

  // 순서 변경은 연속 클릭·드래그를 모아서 한 번에 저장
  let reorderTimer;
  function move(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= db.projects.length) return;
    const list = [...db.projects];
    [list[i], list[j]] = [list[j], list[i]];
    db = { ...db, projects: list };
    renderBoard();
    saveOrder();
  }

  /* 드래그로 순서 바꾸기: 손잡이를 누른 채 위아래로 끌면 줄이 따라 움직이고, 놓으면 저장 */
  let drag = null;
  function startDrag(e, row) {
    if (e.button > 0 || !row || $('#search').value.trim()) return;
    e.preventDefault();
    const body = $('#board-body');
    drag = { row, body, startIds: $$('tr', body).map((r) => r.dataset.id) };
    row.classList.add('is-dragging');
    body.classList.add('is-sorting');
    document.body.classList.add('no-select');
    window.addEventListener('pointermove', onDrag, { passive: false });
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
  }
  function onDrag(e) {
    if (!drag) return;
    e.preventDefault();
    const { row, body } = drag;
    const y = e.clientY;
    // 손가락·마우스가 다른 줄의 가운데를 넘으면 그 자리로 옮김
    const others = $$('tr', body).filter((r) => r !== row);
    const after = others.find((r) => {
      const b = r.getBoundingClientRect();
      return y < b.top + b.height / 2;
    });
    if (after) {
      if (row.nextElementSibling !== after) body.insertBefore(row, after);
    } else if (body.lastElementChild !== row) body.append(row);
    // 화면 끝 가까이 끌면 저절로 스크롤
    if (y < 90) window.scrollBy(0, -14);
    else if (y > window.innerHeight - 60) window.scrollBy(0, 14);
  }
  function endDrag() {
    if (!drag) return;
    const { row, body, startIds } = drag;
    drag = null;
    row.classList.remove('is-dragging');
    body.classList.remove('is-sorting');
    document.body.classList.remove('no-select');
    window.removeEventListener('pointermove', onDrag);
    window.removeEventListener('pointerup', endDrag);
    window.removeEventListener('pointercancel', endDrag);
    const ids = $$('tr', body).map((r) => r.dataset.id);
    if (ids.join() === startIds.join()) return;
    const byId = new Map(db.projects.map((p) => [p.id, p]));
    db = { ...db, projects: [...ids.map((id) => byId.get(id)).filter(Boolean), ...db.projects.filter((p) => !ids.includes(p.id))] };
    const movedId = row.dataset.id;
    renderBoard();
    $(`#board-body tr[data-id="${CSS.escape(movedId)}"]`)?.classList.add('just-moved');
    saveOrder();
  }

  function saveOrder() {
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

  /* 소개 이미지 목록 (사이트 팝업의 영상 아래 이미지 줄) */
  function renderGal() {
    const list = $('#gal-list');
    const items = state.gallery || [];
    list.replaceChildren(
      ...items.map((g, i) => {
        const cap = h('input', { type: 'text', maxLength: 80, value: g.caption, placeholder: '한 줄 설명 (예: 벙 지도 · 벙이 열린 동네)' });
        cap.addEventListener('input', () => {
          g.caption = cap.value;
          dirty = true;
        });
        const mv = (d) => {
          const j = i + d;
          if (j < 0 || j >= items.length) return;
          [items[i], items[j]] = [items[j], items[i]];
          dirty = true;
          renderGal();
        };
        const up = h('button', { type: 'button', className: 'icon-btn', title: '앞으로', textContent: '▲', disabled: i === 0 });
        const down = h('button', { type: 'button', className: 'icon-btn', title: '뒤로', textContent: '▼', disabled: i === items.length - 1 });
        const del = h('button', { type: 'button', className: 'icon-btn danger', title: '빼기', textContent: '✕' });
        up.onclick = () => mv(-1);
        down.onclick = () => mv(1);
        del.onclick = () => {
          if (g.url) URL.revokeObjectURL(g.url);
          items.splice(i, 1);
          dirty = true;
          renderGal();
        };
        return h('li', { className: 'gal-row' }, g.blob ? h('img', { src: g.url, alt: '' }) : img(g.path), cap, h('div', { className: 'acts' }, up, down, del));
      })
    );
    list.hidden = !items.length;
  }
  $('#gal-add-btn').addEventListener('click', () => $('#gal-file').click());
  $('#gal-file').addEventListener('change', async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    for (const f of files) {
      if (!/^image\//.test(f.type)) continue;
      const blob = await resizeImage(f, 2000, 0.85);
      state.gallery.push({ blob, url: URL.createObjectURL(blob), caption: '' });
    }
    dirty = true;
    renderGal();
  });

  async function openEditor(p) {
    if (!(await switchView('editor'))) return;
    editing = p;
    form.reset();
    Object.assign(state, { pdfFile: null, removePdf: false, options: [], selected: null, loadingPages: false });
    // 소개 이미지: 이미 올린 것은 path, 새로 고른 것은 blob
    state.gallery = (p?.gallery || []).filter((g) => g?.src).map((g) => ({ path: g.src, caption: g.caption || '' }));
    renderGal();
    $('#editor-title').textContent = p ? '포트폴리오 수정' : '새 포트폴리오 등록';
    $('#save-post').textContent = p ? '수정 완료' : '게시하기';
    fillDocTypes('');
    ytPreview();
    if (p) {
      ['title', 'subtitle', 'category', 'year', 'summary', 'description'].forEach((k) => (form[k].value = p[k] || ''));
      form.tags.value = (p.tags || []).join(', ');
      form.video.value = p.video || '';
      form.link.value = p.link || '';
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
    const link = form.link.value.trim();
    if (link && !/^https?:\/\/[^\s]+\.[^\s]+/i.test(link)) {
      form.link.focus();
      return toast('사이트 주소는 https://로 시작하는 전체 주소로 넣어 주세요.', true);
    }
    const id = editing?.id || uid();
    const now = new Date().toISOString();
    const fields = {
      link: link || undefined,
      title: form.title.value.trim(),
      subtitle: form.subtitle.value.trim(),
      category: form.category.value.trim(),
      docType: form.docType.value,
      video: video ? (/\/shorts\//i.test(video) ? `https://www.youtube.com/shorts/${ytId(video)}` : `https://www.youtube.com/watch?v=${ytId(video)}`) : undefined,
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
    // 소개 이미지: 새로 고른 것만 올리고, 순서·설명은 그대로 저장
    const gallery = (state.gallery || []).map((g) => {
      if (!g.blob) return { src: g.path, caption: g.caption.trim() };
      const path = `uploads/${id}-${uid()}-g.${extOf(g.blob)}`;
      files.push({ path, blob: g.blob });
      return { src: path, caption: g.caption.trim() };
    });
    fields.gallery = gallery.length ? gallery : undefined;
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
      r._orig = it; // 편집 칸이 없는 값(업무 자료 work 등)은 저장할 때 그대로 둠
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
        const { image: _i, focusX: _f, ...keep } = r._orig || {};
        const x = { ...keep, ...Object.fromEntries($$('[data-key]', r).map((n) => [n.dataset.key, n.value.trim()])) };
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
  // 이 링크의 작업물 순서: 프리셋에 order가 있으면 그 순서, 없으면 사이트 순서
  const prOrdered = (works, order = []) => {
    if (!order.length) return works;
    const rank = (id) => (order.indexOf(id) < 0 ? 1e6 : order.indexOf(id));
    return works.map((p, k) => [p, k]).sort((a, b) => rank(a[0].id) - rank(b[0].id) || a[1] - b[1]).map((x) => x[0]);
  };
  function prTiles(hide = { works: [], timeline: [] }, show = [], order = []) {
    const { works: all, timeline } = prItems();
    const works = prOrdered(all, order);
    const hw = new Set(hide.works || []), ht = new Set(hide.timeline || []), sw = new Set(show || []);
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
        // 공개 작업물은 숨기지 않았으면 켜짐, 비공개 작업물은 이 링크에서 보이게 고른 것만 켜짐
        const on = p.visible === false ? sw.has(p.id) : !hw.has(p.id);
        const b = tile('works', p.id, on, t ? img(t, { className: 'pr-thumb' }) : h('span', { className: 'pr-thumb empty' }), h('b', { textContent: p.title }), h('small', { textContent: [p.docType, p.visible === false ? '비공개 · 켜면 이 링크에서만' : ''].filter(Boolean).join(' · ') }));
        b.dataset.private = p.visible === false ? '1' : '';
        const grip = h('span', { className: 'pr-grip', title: '끌어서 이 링크에서 보일 순서 바꾸기', textContent: '⠿' });
        grip.addEventListener('pointerdown', (e) => prStartDrag(e, b));
        b.prepend(grip);
        return b;
      })
    );
    $('#pr-timeline').replaceChildren(
      ...(timeline.length
        ? timeline.map((x) => tile('timeline', x.id, !ht.has(x.id), h('b', { textContent: x.title || x.period }), h('small', { textContent: [x.type, x.period].filter(Boolean).join(' · ') })))
        : [h('p', { className: 'muted sm', textContent: '사이트 설정에서 타임라인 경력을 저장하면 여기에 나와요.' })])
    );
    prCount();
  }
  let prDrag = null;
  function prStartDrag(e, tileEl) {
    if (e.button > 0) return;
    e.preventDefault();
    e.stopPropagation();
    prDrag = { tile: tileEl, box: $('#pr-works'), moved: false };
    tileEl.classList.add('is-dragging');
    document.body.classList.add('no-select');
    window.addEventListener('pointermove', prOnDrag, { passive: false });
    window.addEventListener('pointerup', prEndDrag);
    window.addEventListener('pointercancel', prEndDrag);
  }
  function prOnDrag(e) {
    if (!prDrag) return;
    e.preventDefault();
    const { tile: t, box } = prDrag;
    const others = $$('.pr-tile', box).filter((x) => x !== t);
    let best = null;
    let dist = Infinity;
    others.forEach((o) => {
      const r = o.getBoundingClientRect();
      const d = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
      if (d < dist) (dist = d), (best = o);
    });
    if (best) {
      const r = best.getBoundingClientRect();
      const before = e.clientX < r.left + r.width / 2;
      const ref = before ? best : best.nextElementSibling;
      if (ref !== t && t.nextElementSibling !== ref) {
        box.insertBefore(t, ref);
        prDrag.moved = true;
      }
    }
    if (e.clientY < 90) window.scrollBy(0, -14);
    else if (e.clientY > window.innerHeight - 60) window.scrollBy(0, 14);
  }
  function prEndDrag() {
    if (!prDrag) return;
    prDrag.tile.classList.remove('is-dragging');
    document.body.classList.remove('no-select');
    window.removeEventListener('pointermove', prOnDrag);
    window.removeEventListener('pointerup', prEndDrag);
    window.removeEventListener('pointercancel', prEndDrag);
    if (prDrag.moved) prOrderNote();
    prDrag = null;
  }
  // 사이트 순서와 다르면 안내 + '사이트 순서로' 버튼
  function prOrderNote() {
    const site = (db.projects || []).map((p) => p.id).join();
    const now = $$('#pr-works .pr-tile').map((b) => b.dataset.id).join();
    $('#pr-order-reset').hidden = site === now;
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
            const w = works.filter((p) => (p.visible === false ? (l.show || []).includes(p.id) : !(l.hide?.works || []).includes(p.id))).length;
            const t = timeline.filter((x) => !(l.hide?.timeline || []).includes(x.id)).length;
            const copy = h('button', { type: 'button', className: 'btn sm primary', textContent: '링크 복사' });
            copy.onclick = () => copyText(presetUrl(l.tag));
            const load = h('button', { type: 'button', className: 'btn sm', textContent: '불러오기' });
            load.onclick = () => prLoad(l);
            // 이 링크로 들어온 방문만 접속 통계에서 보기
            const stat = h('button', { type: 'button', className: 'btn sm', textContent: '통계 보기' });
            stat.onclick = () => {
              switchView('stats');
              window.studioStatsFor?.(String(l.tag).toLowerCase());
            };
            const del = h('button', { type: 'button', className: 'icon-btn danger', textContent: '✕', title: '삭제' });
            del.onclick = () => prDelete(l);
            return h(
              'div', { className: 'pr-slot' + (prEditing === l.tag ? ' is-editing' : '') },
              h('div', { className: 'pr-slot-head' }, h('b', { textContent: l.name || l.tag }), del),
              h('p', { className: 'pr-slot-tag', textContent: '?from=' + l.tag }),
              h('p', { className: 'pr-slot-stat', textContent: `기획서 ${w} · 경력 ${t}` }),
              l.site?.title ? h('p', { className: 'pr-slot-tag', textContent: '탭: ' + l.site.title }) : null,
              h('div', { className: 'pr-slot-acts' }, copy, load, stat)
            );
          })
        : [h('p', { className: 'muted sm pr-empty', textContent: '아직 프리셋이 없어요. 아래에서 첫 프리셋을 만들어 보세요.' })])
    );
  }
  // 이 링크에서만 바꿀 문구: 빈칸에는 지금 사이트 설정 값을 흐리게 보여 줌
  function prSite(site = {}) {
    const s = db.settings || {};
    const set = (id, v, ph) => {
      $(id).value = v || '';
      $(id).placeholder = ph ? `비우면 사이트 설정: ${String(ph).replace(/\n/g, ' ')}` : '비우면 사이트 설정 그대로';
    };
    set('#pr-site-title', site.title, s.siteTitle || `${s.nameKo || ''} — Portfolio`);
    set('#pr-site-role', site.role, s.role);
    set('#pr-site-intro', site.intro, s.intro);
    set('#pr-site-letter', site.coverLetter, s.about?.coverLetter ? '기본 자기소개서' : '');
    $('#pr-site-total').checked = !!site.careerTotal;
  }
  function prReset() {
    prEditing = null;
    prSite();
    $('#pr-title').textContent = '새 프리셋 만들기';
    $('#pr-create').textContent = '프리셋 생성';
    $('#pr-reset').hidden = true;
    $('#pr-name').value = '';
    $('#pr-tag').value = '';
    $('#pr-tag').dataset.touched = '';
    $('#pr-result').hidden = true;
    prTiles();
    prOrderNote();
    prSlots();
  }
  function prLoad(l) {
    prEditing = l.tag;
    prSite(l.site);
    $('#pr-title').textContent = `‘${l.name || l.tag}’ 고치기`;
    $('#pr-create').textContent = '프리셋 저장';
    $('#pr-reset').hidden = false;
    $('#pr-name').value = l.name || '';
    $('#pr-tag').value = l.tag;
    $('#pr-tag').dataset.touched = '1';
    $('#pr-url').value = presetUrl(l.tag);
    $('#pr-result').hidden = false;
    prTiles(l.hide, l.show, l.order);
    prOrderNote();
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
    if (e.target.closest('.pr-grip')) return;
    if (e.target.closest('#pr-order-reset')) {
      const box = $('#pr-works');
      const byId = new Map($$('.pr-tile', box).map((b) => [b.dataset.id, b]));
      (db.projects || []).forEach((p) => byId.get(p.id) && box.append(byId.get(p.id)));
      return prOrderNote();
    }
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
    const off = (kind) => $$(`#pr-builder .pr-tile[data-kind="${kind}"]`).filter((b) => b.getAttribute('aria-pressed') !== 'true' && !b.dataset.private).map((b) => b.dataset.id);
    const showIds = $$('#pr-works .pr-tile').filter((b) => b.dataset.private && b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.id);
    const orderIds = $$('#pr-works .pr-tile').map((b) => b.dataset.id);
    const sameOrder = orderIds.join() === (db.projects || []).map((p) => p.id).join();
    const site = { title: $('#pr-site-title').value.trim(), role: $('#pr-site-role').value.trim(), intro: $('#pr-site-intro').value.trim(), coverLetter: $('#pr-site-letter').value.trim(), careerTotal: $('#pr-site-total').checked };
    Object.keys(site).forEach((k) => !site[k] && delete site[k]);
    const preset = { name: name || tag, tag, hide: { works: off('works'), timeline: off('timeline') }, ...(Object.keys(site).length ? { site } : {}), ...(showIds.length ? { show: showIds } : {}), ...(sameOrder ? {} : { order: orderIds }) };
    const btn = $('#pr-create');
    btn.disabled = true;
    const old = prEditing;
    try {
      await save(`${old ? '링크 프리셋 수정' : '링크 프리셋 생성'}: ${preset.name}`, (d) => {
        const list = d.settings.links || [];
        const i = list.findIndex((x) => x.tag === (old || tag));
        // 편집 칸이 없는 값(show: 이 링크에서만 보일 작업물, order: 작업물 순서)은 그대로 둠
        if (i > -1) {
          const { name: _n, tag: _t, hide: _h, site: _s, show: _w, order: _o, ...keep } = list[i];
          list[i] = { ...keep, ...preset };
        }
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
    const row = (it = { name: '', level: 70, icon: 'idea', desc: '', group: 'plan' }) => {
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
      // 묶음: 사이트 스킬 차트 위 탭 (기획 스킬 / 툴 스킬 / 전체)
      const group = h('select', { className: 'skill-group-select', title: '묶음' }, h('option', { value: 'plan', textContent: '기획 스킬', selected: it.group !== 'tool' }), h('option', { value: 'tool', textContent: '툴 스킬', selected: it.group === 'tool' }));
      group.addEventListener('change', () => (dirty = true));
      r.append(h('span', { className: 'skill-icon-cell' }, preview, icon), name, group, h('span', { className: 'skill-level-cell' }, level, bar), desc, h('span', { className: 'acts' }, up, down, del));
      return r;
    };
    const head = h('div', { className: 'skill-row head muted sm' }, h('span', { textContent: '아이콘' }), h('span', { textContent: '스킬 이름' }), h('span', { textContent: '묶음' }), h('span', { textContent: '숙련도 (0~100)' }), h('span', { textContent: '설명' }), h('span'));
    const add = h('button', { type: 'button', className: 'btn sm rep-add', textContent: '+ 스킬 추가' });
    add.onclick = () => {
      if ($$('.skill-row:not(.head)', box).length >= 24) return toast('스킬은 24개까지 넣을 수 있어요. 묶음마다 6~12개가 보기 좋아요.', true);
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
    f.coverLetter.value = s.about?.coverLetter || '';
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
        coverLetter: f.coverLetter.value.trim(),
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
