# 사이트를 고친 뒤 실행: CSS·JS 주소의 ?v= 버전을 바꿔 방문자 브라우저가 새 파일을 받게 함
# 사용법: python3 tools/bump-version.py
import re, time
import os
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..') + '/'
V = time.strftime('%Y%m%d%H%M', time.gmtime())

def bump(path, patterns):
    s = open(ROOT + path).read()
    n = 0
    for pat in patterns:
        # 파일 주소 뒤의 ?v=… 를 새 버전으로 (없으면 추가)
        s, k = re.subn(pat + r'(\?v=\w+)?(["\'])', lambda m: m.group(1) + '?v=' + V + m.group(3), s)
        n += k
    open(ROOT + path, 'w').write(s)
    print(path, n)

bump('index.html', [r'(href="css/style\.css)', r'(href="css/theme-editorial\.css)', r'(src="js/main\.js)', r'(src="js/icons\.js)'])
bump('js/main.js', [r"(from '\./morph\.js)", r"(from '\./pdf-viewer\.js)", r"(from '\./analytics\.js)", r"(from '\./skills\.js)"])
bump('studio/index.html', [r'(href="admin\.css)', r'(src="github\.js)', r'(src="admin\.js)', r'(src="stats\.js)', r'(src="\.\./js/icons\.js)'])
print('version', V)
