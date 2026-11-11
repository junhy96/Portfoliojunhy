// AI 에이전트용 요약 llms.txt · llms-full.txt 를 data/site.json에서 다시 만듦
// 사용법: node tools/build-llms.js
// (관리자 툴에서 저장하면 자동으로 같이 갱신되므로, 직접 site.json을 고쳤을 때만 실행)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { buildLlms, injectBrief } = require(path.join(ROOT, 'js/llms.js'));
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/site.json'), 'utf8'));
fs.writeFileSync(path.join(ROOT, 'llms.txt'), buildLlms(data, { full: false }));
fs.writeFileSync(path.join(ROOT, 'llms-full.txt'), buildLlms(data, { full: true }));
// index.html 안의 텍스트 요약도 (HTML만 읽는 AI용)
const idx = path.join(ROOT, 'index.html');
fs.writeFileSync(idx, injectBrief(fs.readFileSync(idx, 'utf8'), data));
console.log('llms.txt, llms-full.txt, index.html 요약 갱신');
