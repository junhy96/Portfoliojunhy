/**
 * AI 에이전트·LLM이 읽는 요약 (llms.txt 형식의 마크다운)
 * - 사이트는 자바스크립트로 data/site.json을 읽어 그려서, AI가 주소만 읽으면 내용이 비어 보임 → 같은 내용을 마크다운으로
 * - 쓰는 곳: 메인 화면 「AI 요약」 팝업(지금 링크 기준), 관리자 저장 때 llms.txt · llms-full.txt 갱신, tools/build-llms.js
 * - 공개 파일이므로 사이트에 이미 공개한 정보만 씀 (전화번호·생년월일 없음)
 * 일반 스크립트(window.buildLlms)이자 Node 모듈(module.exports)
 */
(function (root) {
  var SITE = 'https://junhy96.github.io/Portfoliojunhy/';

  function str(v) {
    return String(v == null ? '' : v).trim();
  }
  function oneLine(v) {
    return str(v).replace(/\s*\n+\s*/g, ' ');
  }
  // 상대 주소 → 사이트 기준 절대 주소
  function abs(base, p) {
    p = str(p);
    if (!p) return '';
    if (/^https?:\/\//i.test(p)) return p;
    return base + p.replace(/^\.?\//, '');
  }
  // 'YYYY.MM' → 정렬용 숫자 (졸업·수료는 끝 해 기준)
  function ymList(period) {
    var out = [];
    String(period || '').replace(/(\d{4})(?:\D{1,3}(\d{1,2})(?!\d))?/g, function (_, y, m) {
      out.push(Number(y) * 100 + Number(m || 0));
    });
    return out;
  }
  function keyOf(x) {
    var l = ymList(x.period);
    if (!l.length) return 0;
    return /졸업|수료/.test(str(x.title)) ? l[l.length - 1] : l[0];
  }
  function tasksOf(x) {
    return (Array.isArray(x.tasks) ? x.tasks : String(x.tasks || '').split('\n')).map(str).filter(Boolean);
  }
  // 총경력: '경력' 항목을 달 단위로 합침 (시작·끝 달 포함, 겹친 달 한 번, '현재'는 이번 달까지)
  function careerTotal(items, now) {
    now = now || new Date();
    var months = {};
    items.forEach(function (x) {
      if (x.type !== '경력') return;
      var all = [];
      String(x.period || '').replace(/(\d{4})(?:\D{1,3}(\d{1,2})(?!\d))?/g, function (_, y, m) {
        all.push(Number(y) * 12 + (Number(m || 1) - 1));
      });
      if (!all.length) return;
      var a = all[0];
      var b = /현재|재직|ing|진행/i.test(x.period) ? now.getFullYear() * 12 + now.getMonth() : all[all.length - 1];
      for (var k = a; k <= b; k++) months[k] = 1;
    });
    var n = Object.keys(months).length;
    if (!n) return '';
    var y = Math.floor(n / 12);
    var m = n % 12;
    return [y ? y + '년' : '', m ? m + '개월' : ''].filter(Boolean).join(' ');
  }

  /**
   * @param data site.json 내용 (지원처 링크 프리셋을 적용한 뒤여도 됨)
   * @param opts { full: 전체판 여부, base: 사이트 주소, now: 기준 날짜, linkNote: 맨 위 안내에 덧붙일 말 }
   * @returns 마크다운 문자열
   */
  function buildLlms(data, opts) {
    opts = opts || {};
    var full = !!opts.full;
    var base = opts.base || SITE;
    var s = (data && data.settings) || {};
    var about = s.about || {};
    var contact = s.contact || {};
    var L = [];
    var push = function (t) {
      L.push(t == null ? '' : t);
    };

    var nameKo = str(s.nameKo);
    var nameEn = str(s.nameEn);
    push('# ' + nameKo + (nameEn ? ' (' + nameEn + ')' : '') + (s.role ? ' · ' + str(s.role) : ''));
    push('');
    if (s.intro) push('> ' + oneLine(s.intro));
    push('');
    push(
      (full ? nameKo + ' 포트폴리오 사이트의 전체 내용입니다.' : nameKo + ' 포트폴리오 사이트의 요약입니다.') +
        ' 사이트 화면은 자바스크립트로 그려지므로, AI 에이전트는 이 마크다운을 읽으면 됩니다.' +
        (opts.linkNote ? ' ' + opts.linkNote : '')
    );
    push('');

    // 타임라인
    var tl = (Array.isArray(s.timeline) ? s.timeline : about.experience || [])
      .filter(function (x) {
        return x && (x.title || x.period);
      })
      .map(function (x) {
        return Object.assign({}, x, { _k: keyOf(x), _t: tasksOf(x) });
      })
      .sort(function (a, b) {
        return b._k - a._k; // 최근 것부터
      });
    var career = tl.filter(function (x) {
      return x.type !== '교육';
    });
    var edu = tl.filter(function (x) {
      return x.type === '교육';
    });
    var total = careerTotal(tl, opts.now);

    // 연락
    push('- 사이트: ' + base);
    if (contact.email) push('- 이메일: ' + str(contact.email));
    (contact.links || []).forEach(function (l) {
      if (l && /^https?:\/\//i.test(l.url)) push('- ' + str(l.label) + ': ' + str(l.url));
    });
    if (total) push('- 총 경력: ' + total);
    push('');

    if (full && about.bio) {
      push('## 소개');
      push('');
      push(str(about.bio));
      push('');
    }

    if (career.length) {
      push('## 경력');
      push('');
      career.forEach(function (x) {
        var org = x.org && str(x.title).indexOf(str(x.org)) < 0 ? ' (' + str(x.org) + ')' : '';
        var head = '- ' + [str(x.period), str(x.title)].filter(Boolean).join(' · ') + org;
        var tail = full ? [oneLine(x.desc), x._t.join('; ')].filter(Boolean).join(' / ') : x._t.join('; ');
        push(head + (tail ? ': ' + tail : ''));
      });
      push('');
    }
    if (edu.length) {
      push('## 교육');
      push('');
      edu.forEach(function (x) {
        push('- ' + [str(x.period), str(x.title)].filter(Boolean).join(' · ') + (x.org ? ' (' + str(x.org) + ')' : ''));
      });
      push('');
    }

    var tools = (s.skillChart || []).filter(function (x) {
      return x && x.name;
    });
    if (tools.length) {
      push('## 툴 · 숙련도 (100점 만점)');
      push('');
      tools
        .slice()
        .sort(function (a, b) {
          return (Number(b.level) || 0) - (Number(a.level) || 0);
        })
        .forEach(function (t) {
          push('- ' + str(t.name) + ' ' + (Number(t.level) || 0) + (full && t.desc ? ': ' + oneLine(t.desc) : ''));
        });
      push('');
    }

    var works = (data.projects || []).filter(function (p) {
      return p && (p.visible !== false || p._shown);
    });
    if (works.length) {
      push('## 작업물');
      push('');
      works.forEach(function (p) {
        var url = abs(base, p.pdf) || abs(base, p.link) || base + '#works';
        var meta = [str(p.docType), str(p.category), str(p.year)].filter(Boolean).join(' · ');
        var more = [];
        if (p.video) more.push('영상 ' + str(p.video));
        if (p.link) more.push('사이트 ' + str(p.link));
        push('- [' + str(p.title) + '](' + url + '): ' + [meta, oneLine(p.summary || p.subtitle)].filter(Boolean).join('. ') + (more.length ? ' (' + more.join(', ') + ')' : ''));
        if (full) {
          if (p.subtitle && p.summary) push('  - ' + oneLine(p.subtitle));
          if (p.description) push('  - ' + oneLine(p.description));
          var tags = Array.isArray(p.tags) ? p.tags : [];
          if (tags.length) push('  - 키워드: ' + tags.join(', '));
        }
      });
      push('');
    }

    if (full) {
      var letter = str(about.coverLetter);
      if (letter) {
        push('## 자기소개서');
        push('');
        letter.split('\n').forEach(function (line) {
          var m = line.match(/^\s*〈(.+)〉\s*$/);
          push(m ? '### ' + m[1] : line);
        });
        push('');
      }
    }

    push('## 더 보기');
    push('');
    if (!full) push('- [전체 내용](' + base + 'llms-full.txt): 작업물 설명, 툴 설명, 경력 설명, 자기소개서');
    push('- [이력서 인쇄 페이지](' + base + 'print.html?part=resume): A4 이력서 · 자기소개서 PDF');
    push('- [작업 목록 인쇄 페이지](' + base + 'print.html?part=works)');
    push('');
    return L.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }

  /**
   * index.html 안에 넣는 텍스트 요약: 자바스크립트를 돌리지 않고 HTML만 읽는 AI(링크 요약 등)도 내용을 보게.
   * 화면에는 안 보이고, 사이트가 그려지면 main.js가 지움 (화면 낭독기가 두 번 읽지 않게)
   */
  var START = '<!-- ai-brief:start -->';
  var END = '<!-- ai-brief:end -->';
  function esc(t) {
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function injectBrief(indexHtml, data, opts) {
    var i = indexHtml.indexOf(START);
    var j = indexHtml.indexOf(END);
    if (i < 0 || j < i) return indexHtml;
    var md = buildLlms(data, Object.assign({ full: false }, opts || {}));
    var block =
      START +
      '\n  <section class="ai-brief" id="ai-brief" aria-label="텍스트 요약">\n' +
      '    <p>이 페이지는 자바스크립트로 그려집니다. 아래는 같은 내용의 텍스트 요약이고, 전체 내용은 ' + (opts && opts.base ? opts.base : SITE) + 'llms-full.txt 에 있습니다.</p>\n' +
      '    <pre>' + esc(md) + '</pre>\n  </section>\n  ' +
      END;
    return indexHtml.slice(0, i) + block + indexHtml.slice(j + END.length);
  }

  root.buildLlms = buildLlms;
  root.injectBrief = injectBrief;
  if (typeof module !== 'undefined' && module.exports) module.exports = { buildLlms: buildLlms, injectBrief: injectBrief, careerTotal: careerTotal, SITE: SITE };
})(typeof window !== 'undefined' ? window : globalThis);
