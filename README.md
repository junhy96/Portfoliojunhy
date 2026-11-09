# 게임 기획자 포트폴리오 (GitHub Pages)

모노톤 풀페이지 포트폴리오 사이트와 관리자 페이지. 서버 없이 **GitHub Pages**에서 무료로 동작합니다.

- **사이트** `/`: 스크롤하면 한 섹션씩 넘어갑니다(Home · About · Works · Contact). 섹션이 바뀔 때 배경 사진이 모핑되고, Works 썸네일을 누르면 PDF가 전체화면으로 열립니다.
- **관리자** `/studio/`: 게시판처럼 포트폴리오 PDF를 올리고, 썸네일을 고르고, 글을 수정·삭제·숨김·정렬합니다. 저장하면 GitHub 저장소에 바로 커밋되고 1~2분 뒤 사이트에 반영됩니다.

## 배포 방법 (처음 한 번)

1. **저장소 만들기**: GitHub에서 New repository를 누릅니다.
   - 이름을 `내아이디.github.io`로 하면 주소가 `https://내아이디.github.io/`가 됩니다.
   - 다른 이름(예: `portfolio`)으로 하면 `https://내아이디.github.io/portfolio/`가 됩니다.
   - **Public**으로 만드세요. 무료 계정의 GitHub Pages는 공개 저장소만 지원합니다.
2. **파일 올리기**: zip을 풀고 `game-portfolio` 폴더 **안의** 파일과 폴더를 모두 저장소에 올립니다. 웹에서 “Add file → Upload files”로 끌어다 놓아도 되고, git으로 push해도 됩니다. `index.html`이 저장소 맨 위에 있어야 합니다. 숨김 파일 `.nojekyll`은 빠져도 동작합니다.
3. **Pages 켜기**: 저장소 → Settings → Pages → Source를 **Deploy from a branch**, Branch를 **main / (root)**로 정하고 Save합니다.
4. 1~2분 뒤 사이트 주소로 접속되는지 확인합니다.

## 관리자 페이지 쓰기

1. `사이트주소/studio/`로 들어갑니다. 사이트 어디에도 링크가 없으니 주소를 따로 기억해 두세요.
2. **GitHub 토큰 만들기** (한 번만)
   - https://github.com/settings/personal-access-tokens/new 를 엽니다.
   - Repository access: **Only select repositories** → 이 사이트 저장소만 고릅니다.
   - Permissions → Repository permissions → **Contents: Read and write**로 바꿉니다.
   - 만료 기간을 정하고 생성한 뒤 토큰(`github_pat_…`)을 복사합니다.
3. 관리자 페이지에 저장소(`아이디/저장소이름`), 브랜치(`main`), 토큰을 넣고 **연결하기**를 누릅니다.

토큰은 그 브라우저에만 저장됩니다. 이 토큰은 저장소에 쓸 수 있는 열쇠이므로 남에게 보여주지 마세요. 공용 PC에서는 “기억하기”를 끄고, 다 쓰면 **연결 해제**를 누르세요. 토큰이 유출됐다면 GitHub 설정에서 바로 삭제하면 됩니다.

### 포트폴리오 올리기
- **새 글 쓰기** → PDF를 끌어다 놓습니다. PDF에서 페이지 3장(첫 장, 1/3 지점, 2/3 지점)이 썸네일 후보로 자동 생성됩니다.
- 그중 하나를 고르거나 **이미지 업로드**로 원하는 썸네일을 직접 올립니다. 이미지는 자동으로 적당한 크기로 줄여서 저장됩니다.
- 제목·역할·장르·연도·태그·요약·상세 설명을 쓰고 **게시하기**를 누릅니다.
- 오른쪽 위 상태 표시가 “사이트 반영 중” → **“사이트에 반영됨”**으로 바뀌면 끝입니다.
- 글을 지우거나 썸네일·PDF를 바꾸면, 더 이상 쓰이지 않는 이전 파일은 저장소에서 자동으로 지워집니다.

### 처음에 바꿀 것
- **사이트 설정**에서 이름, 소개 문구, 연락처, 섹션 배경 사진 4장을 바꿉니다. 지금 들어 있는 실루엣 사진과 샘플 글 3개는 예시입니다.

## 제한 사항

- **PDF 용량**: 파일당 최대 90MB입니다. 사이트에서 빨리 열리도록 40MB 이하를 권장합니다.
- **저장소 크기**: 1GB 이하를 권장합니다. 포트폴리오 PDF 수십 개 정도는 충분합니다.
- **반영 시간**: 저장 후 사이트에 보이기까지 1~2분 걸립니다.
- **비공개 글**: 사이트에서만 숨겨집니다. 공개 저장소라 GitHub에서는 파일이 보입니다.

## 내 컴퓨터에서 미리보기

```bash
python3 -m http.server 8000
```

그다음 http://localhost:8000 을 엽니다. 파일을 더블클릭해 `file://`로 열면 데이터를 불러오지 못하니 꼭 위 명령으로 여세요.

관리자 페이지에서 저장한 내용은 GitHub 저장소로 바로 들어갑니다. 내 컴퓨터에 받은 사본은 자동으로 바뀌지 않으니, git을 쓴다면 `git pull`로 받아오세요.

## 구조

```
index.html, css/, js/       공개 사이트
  js/morph.js               WebGL 모핑 (노이즈 변위 + 모노톤 보정)
  js/pdf-viewer.js          전체화면 PDF 뷰어 (pdf.js)
data/site.json              사이트 설정 + 포트폴리오 목록
uploads/                    PDF·썸네일·사진 (uploads/seed = 샘플)
studio/                     관리자 페이지 (github.js = 저장소 저장 로직)
vendor/                     pdf.js (폰트 Pretendard는 CDN에서 불러옴)
.nojekyll                   GitHub Pages가 파일을 그대로 쓰도록 하는 설정
```
