/**
 * GitHubStore — 서버 없이 GitHub 저장소에 직접 저장
 *
 * 저장할 때마다 Git Data API로 "커밋 1개"를 만듭니다.
 *   1) 새 파일(PDF·이미지)을 blob으로 업로드
 *   2) 최신 data/site.json 을 읽어 변경 내용을 적용
 *   3) 더 이상 쓰이지 않는 uploads/ 파일은 같은 커밋에서 삭제
 *   4) 트리 → 커밋 → 브랜치 이동 (다른 저장과 겹치면 자동 재시도)
 * GitHub Pages가 커밋을 감지해 1~2분 뒤 사이트에 반영합니다.
 */
(() => {
  const API = 'https://api.github.com';
  const DATA_PATH = 'data/site.json';

  class GitHubError extends Error {
    constructor(status, message) {
      super(message);
      this.status = status;
    }
  }

  const friendly = (status, msg) =>
    ({
      401: '토큰이 올바르지 않거나 만료되었습니다. 다시 연결해주세요.',
      403: '토큰에 이 저장소의 쓰기 권한(Contents: Read and write)이 없습니다.',
      404: '저장소나 브랜치를 찾을 수 없습니다. 이름과 토큰의 저장소 접근 범위를 확인하세요.',
    })[status] || msg || `GitHub 요청 실패 (${status})`;

  function toBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1] || '');
      r.onerror = () => reject(new Error('파일을 읽지 못했습니다.'));
      r.readAsDataURL(blob);
    });
  }

  /** 데이터가 참조하는 uploads/ 파일 목록 */
  function referencedFiles(data) {
    const set = new Set();
    const add = (p) => typeof p === 'string' && p.startsWith('uploads/') && set.add(p);
    Object.values(data?.settings?.images || {}).forEach((i) => add(i?.src));
    (data?.projects || []).forEach((p) => {
      add(p.thumb);
      add(p.cover);
      add(p.pdf);
    });
    return set;
  }

  class GitHubStore {
    constructor({ owner, repo, branch, token }) {
      Object.assign(this, { owner, repo, branch, token });
    }

    get base() {
      return `${API}/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}`;
    }

    rawUrl(path) {
      return `https://raw.githubusercontent.com/${this.owner}/${this.repo}/${this.branch}/${path}`;
    }

    async request(path, { method = 'GET', body, accept = 'application/vnd.github+json' } = {}) {
      const res = await fetch(path.startsWith('http') ? path : this.base + path, {
        method,
        cache: 'no-store',
        headers: {
          Accept: accept,
          Authorization: `Bearer ${this.token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        let msg = '';
        try {
          msg = (await res.json()).message;
        } catch {}
        throw new GitHubError(res.status, friendly(res.status, msg));
      }
      return accept.includes('raw') ? res.text() : res.json();
    }

    /** 연결 확인 + 저장소 정보 */
    async verify() {
      const repo = await this.request('');
      await this.request(`/branches/${encodeURIComponent(this.branch)}`);
      return repo;
    }

    async readData(ref = this.branch) {
      const text = await this.request(`/contents/${DATA_PATH}?ref=${encodeURIComponent(ref)}`, {
        accept: 'application/vnd.github.raw+json',
      });
      return JSON.parse(text);
    }

    /** 파일 하나를 blob으로 업로드 (진행률 표시를 위해 XHR 사용) */
    async uploadBlob(blob, onProgress) {
      const content = await toBase64(blob);
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', this.base + '/git/blobs');
        xhr.setRequestHeader('Accept', 'application/vnd.github+json');
        xhr.setRequestHeader('Authorization', `Bearer ${this.token}`);
        xhr.setRequestHeader('X-GitHub-Api-Version', '2022-11-28');
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
        xhr.onload = () => {
          let data = {};
          try {
            data = JSON.parse(xhr.responseText);
          } catch {}
          if (xhr.status >= 200 && xhr.status < 300) resolve(data.sha);
          else reject(new GitHubError(xhr.status, friendly(xhr.status, data.message)));
        };
        xhr.onerror = () => reject(new Error('네트워크 오류로 업로드하지 못했습니다.'));
        xhr.send(JSON.stringify({ content, encoding: 'base64' }));
      });
    }

    /**
     * 커밋 1개로 저장
     * @param {string} message 커밋 메시지
     * @param {(data) => void} mutate 최신 데이터에 적용할 변경
     * @param {{path: string, blob: Blob}[]} files 새로 올릴 파일
     * @param {(ratio:number) => void} onProgress 업로드 진행률
     * @returns 저장된 최신 데이터
     */
    async commit(message, mutate, files = [], onProgress) {
      const total = files.reduce((a, f) => a + f.blob.size, 0) || 1;
      let done = 0;
      const entries = [];
      for (const f of files) {
        const sha = await this.uploadBlob(f.blob, (r) => onProgress?.((done + r * f.blob.size) / total));
        done += f.blob.size;
        entries.push({ path: f.path, mode: '100644', type: 'blob', sha });
      }
      onProgress?.(1);

      for (let attempt = 0; attempt < 4; attempt++) {
        const ref = await this.request(`/git/ref/heads/${encodeURIComponent(this.branch)}`);
        const head = ref.object.sha;
        const headCommit = await this.request(`/git/commits/${head}`);
        const current = await this.readData(head);
        const next = structuredClone(current);
        mutate(next);
        next.rev = Date.now();

        // 더 이상 참조되지 않는 업로드 파일은 삭제 (실제로 저장소에 있는 것만)
        const after = referencedFiles(next);
        let deletes = [...referencedFiles(current)].filter((p) => !after.has(p));
        if (deletes.length) {
          const tree = await this.request(`/git/trees/${headCommit.tree.sha}?recursive=1`);
          const existing = new Set(tree.tree.map((t) => t.path));
          deletes = deletes.filter((p) => existing.has(p));
        }

        const json = await this.request('/git/blobs', {
          method: 'POST',
          body: { content: JSON.stringify(next, null, 2) + '\n', encoding: 'utf-8' },
        });
        // AI 에이전트용 요약(llms.txt · llms-full.txt)도 같은 커밋으로 새로 만듦 (js/llms.js)
        const llms = [];
        if (window.buildLlms) {
          for (const [path, full] of [['llms.txt', false], ['llms-full.txt', true]]) {
            try {
              const b = await this.request('/git/blobs', { method: 'POST', body: { content: window.buildLlms(next, { full }), encoding: 'utf-8' } });
              llms.push({ path, mode: '100644', type: 'blob', sha: b.sha });
            } catch {}
          }
          // index.html 안의 텍스트 요약도 같은 커밋으로 (HTML만 읽는 AI용)
          if (window.injectBrief) {
            try {
              const f = await this.request(`/contents/index.html?ref=${head}`);
              const bytes = Uint8Array.from(atob(String(f.content).replace(/\s/g, '')), (c) => c.charCodeAt(0));
              const before = new TextDecoder().decode(bytes);
              const after = window.injectBrief(before, next);
              if (after !== before) {
                const b = await this.request('/git/blobs', { method: 'POST', body: { content: after, encoding: 'utf-8' } });
                llms.push({ path: 'index.html', mode: '100644', type: 'blob', sha: b.sha });
              }
            } catch {}
          }
        }
        const tree = await this.request('/git/trees', {
          method: 'POST',
          body: {
            base_tree: headCommit.tree.sha,
            tree: [
              ...entries,
              ...llms,
              { path: DATA_PATH, mode: '100644', type: 'blob', sha: json.sha },
              ...deletes.map((path) => ({ path, mode: '100644', type: 'blob', sha: null })),
            ],
          },
        });
        const commit = await this.request('/git/commits', {
          method: 'POST',
          body: { message, tree: tree.sha, parents: [head] },
        });
        try {
          await this.request(`/git/refs/heads/${encodeURIComponent(this.branch)}`, {
            method: 'PATCH',
            body: { sha: commit.sha, force: false },
          });
          return next;
        } catch (e) {
          // 그 사이 다른 커밋이 올라왔으면 최신 상태 기준으로 다시 시도
          if (e.status === 422 || e.status === 409) continue;
          throw e;
        }
      }
      throw new Error('다른 저장과 충돌했습니다. 잠시 후 다시 시도하세요.');
    }
  }

  window.GitHubStore = GitHubStore;
})();
