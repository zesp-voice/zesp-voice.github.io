---
title: 변화관리 의견 광장 — 운영 가이드
team: 안전기획팀
last_updated: 2026-05-18
tags: [project, change-management, web, firebase]
---

# 변화관리 의견 광장

이스타항공 전 임직원이 익명으로 변화관리 주제에 의견을 남기고, 본부별 키워드 분포를 분석해 변화관리 실행 자료로 활용하는 사내 웹사이트.

- **공식 디자인 시스템**: EastarJet Design System (Crimson Red `#D20015`, PANTONE 200C)
- **백엔드**: Firebase Firestore + Hosting
- **분석**: 클라이언트 사이드 한국어 키워드 추출 (stopword 사전 기반)
- **데이터 추출**: 관리자 페이지 CSV/XLSX 다운로드 + Apps Script로 Google Sheets 자동 동기화
- **접속**: Firebase Hosting 공개 URL + QR

---

## 1. 처음 한 번만 (배포 셋업)

QMS 포털과 동일한 패턴: **CLI 없이 웹 UI만으로 셋업**. 총 5단계.

### 1.1 Firebase 프로젝트 + Firestore 만들기
1. https://console.firebase.google.com 에서 **새 프로젝트** 생성 (이름: `eastar-change-mgmt`)
2. **Firestore Database** 만들기 → **Standard 버전** → 위치 `asia-northeast3 (서울)` → **프로덕션 모드**

### 1.2 웹 앱 등록 + `firebaseConfig` 받기
1. 콘솔 좌상단 ⚙️ → **프로젝트 설정** → **일반** 탭
2. "내 앱" 섹션에서 **`</>` 웹** 아이콘 클릭
3. 앱 닉네임 입력 (예: `change-mgmt-web`) → **앱 등록** (Hosting 설정은 체크 해제)
4. 표시되는 `firebaseConfig = { ... }` 6줄을 복사

### 1.3 `public/js/firebase-init.js` 편집
파일을 메모장 등으로 열어 상단의 `firebaseConfig` 객체를 1.2에서 복사한 값으로 통째로 교체.

```js
// 교체 전
const firebaseConfig = {
  apiKey: "REPLACE_WITH_YOUR_API_KEY",
  ...
};

// 교체 후 (예시)
const firebaseConfig = {
  apiKey: "AIzaSyAbc...",
  authDomain: "eastar-change-mgmt.firebaseapp.com",
  projectId: "eastar-change-mgmt",
  storageBucket: "eastar-change-mgmt.firebasestorage.app",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abc..."
};
```

### 1.4 Firestore Rules 콘솔에서 붙여넣기
1. Firebase 콘솔 → **Firestore Database** → **규칙** 탭
2. 본 프로젝트의 `firestore.rules` 파일 내용 전체 복사
3. 콘솔 편집기에 붙여넣기 → **게시**

### 1.5 GitHub Pages 배포 (CLI 0개)

#### 5.1 GitHub Organization + repo 만들기
1. https://github.com/organizations/new → Free → Organization 이름 정함 (예: `zesp-voice`)
2. 만든 org 안에서 **New repository** → 이름은 **org명과 동일하게 `<org>.github.io`** (예: `zesp-voice.github.io`)
3. **Public** + Initialize 옵션 전부 체크 해제 → **Create repository**

#### 5.2 파일 업로드
1. 새 repo 화면에서 **uploading an existing file** 링크 클릭
2. 본 프로젝트의 **`public/` 폴더 안 내용 전체**를 drag & drop으로 업로드:
   - `index.html` · `topic.html` · `admin.html`
   - `assets/` 폴더 (tokens.css · site.css · fonts/ · photos/)
   - `js/` 폴더 (모든 .js)
3. **Commit changes**

> ★ `public/` 폴더 자체가 아니라 **그 안의 내용**을 업로드해야 `/index.html`이 루트가 됨.

#### 5.3 GitHub Pages 켜기
1. repo의 **Settings** → 좌측 **Pages**
2. Source: **Deploy from a branch**
3. Branch: `main` / Folder: `/ (root)` → **Save**
4. 1~2분 후 상단에 표시되는 URL 확인: `https://<org>.github.io/` (현재 운영: `https://zesp-voice.github.io/`)

#### 5.4 Firebase에 도메인 허용
GitHub Pages 도메인에서 Firestore 접속하려면 허용 도메인에 추가:
1. Firebase 콘솔 → 인증 → 설정 → **승인된 도메인** (현재 익명이므로 자동 허용)
2. (필요 시) `<username>.github.io` 추가

### 1.6 관리자 계정 등록 (Firebase Auth)

Firebase Console에서 인증 활성화:

1. Firebase 콘솔 → **Authentication** → **시작하기**
2. **Sign-in method** 탭 → **이메일/비밀번호** 클릭 → **사용 설정** → 저장
3. **Users** 탭 → **사용자 추가**
   - 이메일: `<사번>@eastarjet.com` (또는 운영자 이메일)
   - 비밀번호: 본인이 설정 (8자 이상)
4. 추가 관리자가 필요할 때마다 같은 화면에서 **사용자 추가**

### 1.7 첫 로그인

1. `https://zesp-voice.github.io/admin.html` 접속
2. 이메일: 사번/아이디만 입력 (`@eastarjet.com` 자동 추가) 또는 전체 이메일
3. 비밀번호 입력 → **로그인**
4. 비밀번호 잊으면 **비밀번호를 잊으셨나요?** → 등록 이메일로 재설정 메일 발송

### 1.8 관리자 추가·제거·비밀번호 변경

모두 Firebase 콘솔에서 수행:
- **추가**: Authentication → Users → 사용자 추가
- **제거**: Users 목록에서 행 끝 ⋮ → 사용자 삭제
- **비밀번호 변경**: 행 끝 ⋮ → 비밀번호 재설정 메일 보내기 (사용자 본인이 메일로 변경)

### 1.7 이후 수정 사항 반영
파일을 수정한 뒤 GitHub repo에서:
- 단일 파일: 웹 UI로 파일 클릭 → 연필 아이콘 → 편집 → Commit
- 여러 파일: repo 메인 화면 → **Add file → Upload files** → 덮어쓸 파일 drag & drop → Commit

배포는 1분 내 자동 반영. 별도 명령 불필요.

---

## (선택) Firebase Hosting CLI 방식
GitHub Pages 대신 `*.web.app` 도메인을 쓰고 싶거나 CI/CD를 붙이려면 [`firebase-hosting-advanced.md`](./firebase-hosting-advanced.md) 참고 (필요 시 별도 작성).

---

## 2. 주제 운영 흐름

### 2.1 새 주제 등록
1. `admin.html` 접속 → 인증
2. **+ 새 주제 등록** → 제목·설명·마감일·이모지 입력 → 저장
3. 즉시 홈(`index.html`)에 진행 중 카드로 노출됨

### 2.2 QR 코드 공유
1. 주제 행의 **QR** 버튼 클릭 → 256×256 QR 생성
2. **PNG 다운로드** 후 사내 공지·포스터·메신저에 첨부
3. QR 색상은 브랜드 Crimson Red (`#D20015`)로 설정됨

### 2.3 데이터 추출
- **개별 CSV**: 주제 행 → CSV 버튼 (UTF-8 BOM 적용 → Excel 한글 정상)
- **전체 CSV**: 운영 도구 → 전체 CSV 내보내기
- **Sheets 자동 동기화**: 운영 도구 → Sheets 동기화 (사전에 Apps Script 배포 + URL 등록 필요. 아래 4번 참고)

### 2.4 마감
- 마감일 자정이 지나면 자동으로 댓글 입력 disable, 종료 섹션으로 이동
- 수동으로 종료하려면 관리자에서 상태를 "종료"로 변경

---

## 3. 디자인 시스템

EastarJet 공식 디자인 시스템(Claude Design 번들)을 그대로 적용.

- 토큰: `public/assets/tokens.css`
- 사이트 전용 레이아웃: `public/assets/site.css` (Apple 톤 — 큰 여백·둥근 모서리·subtle shadow·smooth transition)
- 폰트: EastarJet (DemiLight 300 / Medium 500 / Heavy 800). 폰트 파일이 없으면 자동으로 `Noto Sans KR` 로 폴백.

### 폰트 파일 추가 (선택)
디자인 시스템 번들(`https://api.anthropic.com/v1/design/h/qwaIRNPOUGZiClT1vjHRvw`)을 받아 `eastarjet-design-system/project/assets/fonts/` 안의 `.otf`·`.ttf` 6개를 `public/assets/fonts/` 에 복사하면 브랜드 폰트가 자동 적용됨.

### 본부별 색 매핑
| 본부 | 색 토큰 | hex |
|---|---|---|
| 안전보안실 | `--ej-navy` | `#1B2A4E` |
| 운항본부 | `--ej-teal` | `#2E7E80` |
| 객실본부 | `--ej-coral` | `#F26A5A` |
| 운송본부 | `--ej-amber` | `#E8A33D` |
| 정비본부 | `--ej-gray-dark` | `#30383C` |
| 경영지원본부 | `--ej-plum` | `#5C2440` |
| 기타 | `--ej-gray` | `#9EA2A1` |

본부 추가·변경은 Firestore `config/departments.list` 도큐먼트 직접 편집.

---

## 4. Google Sheets 자동 동기화 (선택)

### 4.1 Apps Script 배포
1. https://script.google.com → 새 프로젝트
2. `apps-script/sync-to-sheets.gs` 내용 복사 → 붙여넣기
3. **프로젝트 설정 → 스크립트 속성**에 추가:
   - `FIREBASE_PROJECT_ID` = `eastar-change-mgmt`
   - `SHEET_ID` = (대상 Sheets 문서 ID — URL의 `/d/...` 부분)
4. **트리거**:
   - 함수: `syncAll`
   - 이벤트 유형: 시간 기반 → 시간 트리거 → 매시간
5. **배포 → 새 배포**:
   - 유형: 웹 앱
   - 액세스 권한: 누구나
   - 배포 후 출력되는 **웹앱 URL** 복사

### 4.2 Firestore에 URL 등록
관리자 화면의 "Sheets 동기화" 버튼이 이 URL을 호출하도록 다음 도큐먼트 생성:

```
config/sheets
└─ webhookUrl: "https://script.google.com/macros/s/.../exec"
```

(Firestore 콘솔 → 데이터 → `config` 컬렉션 → `sheets` 도큐먼트 신규 추가)

이후 관리자 화면에서 **Sheets 동기화** 버튼 클릭 시 즉시 Sheets에 반영됨.

---

## 5. 키워드 분석 정확도

클라이언트 사이드 한국어 stopword 사전 기반 — 형태소 분석기 미사용.

- **장점**: 비용 0, 실시간, 외부 의존성 없음
- **단점**:
  - 동사·형용사 어간 추출이 어림셈
  - 신조어·고유명사 처리 약함
  - 빈도 1~2회 토큰은 노이즈가 많아 **임계값 3 이상**으로 필터링
- **향상 옵션 (v2)**: 한국어 경량 morphological JS 라이브러리(`hangul-js` 등) 도입, 또는 관리자 export CSV를 Voyant Tools 같은 무료 분석기에 입력

stopword 추가는 `public/js/stopwords-ko.js` 또는 Firestore `config/stopwords.ko` 배열에 단어를 추가.

---

## 6. 보안 정책

- **공개 읽기**: 누구나 주제·댓글·설정값을 조회할 수 있음 (URL만 알면 접속 가능)
- **익명 쓰기**: 댓글 작성만 가능. Rules로 `content`(1~1500자) · `department`(1~40자) · `createdAt` 필드 + 마감 전 시점 검증
- **관리자 쓰기**: Firebase Auth 로그인 사용자만 주제·설정·댓글 삭제 가능
- **회원가입 페이지 없음**: 따라서 Firebase 콘솔에 등록된 계정만 관리자가 됨
- **API Key 노출**: 클라이언트 코드에 firebase config가 노출되지만, 실제 보안은 Firestore Rules가 담당. apiKey는 비밀이 아님 (Firebase 공식 정책)

추가 강화 옵션 (v2):
- App Check 도입 — 인증되지 않은 클라이언트(curl·봇) 차단
- Cloud Functions로 비정상 쓰기 패턴 감지

---

## 7. 파일 구조

```
변화관리 의견 종합 사이트 제작/
├── 변화관리 업로드 양식_20260518144742.xls
├── 변화관리 필요노선/2026년 신규 취항노선.pptx
├── firebase.json
├── firestore.rules
├── firestore.indexes.json
├── public/
│   ├── index.html       # 홈
│   ├── topic.html       # 주제 상세
│   ├── admin.html       # 관리자
│   ├── assets/
│   │   ├── tokens.css   # EastarJet 공식 토큰
│   │   ├── site.css     # Apple-tone 레이아웃
│   │   ├── fonts/       # (선택) 브랜드 폰트
│   │   └── photos/      # (선택) hero 사진
│   └── js/
│       ├── firebase-init.js
│       ├── utils.js
│       ├── home.js
│       ├── topic.js
│       ├── admin.js
│       ├── keywords.js
│       └── stopwords-ko.js
├── apps-script/
│   └── sync-to-sheets.gs
└── README.md (이 파일)
```

---

## 8. 검증 체크리스트 (배포 직전)

- [ ] PC Chrome/Edge + iPhone Safari + Android Chrome 3종 접속 정상
- [ ] QR로 모바일에서 댓글 작성 → 즉시 본부별 차트에 반영 (실시간 listener)
- [ ] 마감 시각(자정) 직전 댓글 입력 가능 / 직후 disable + 안내문
- [ ] 시드 댓글 30개 + 5개 본부로 키워드 워드클라우드 시각적 가독성 확인
- [ ] 관리자 비밀번호 게이트 통과 → 주제 등록 → 즉시 홈에 노출
- [ ] Sheets 동기화 트리거 후 컬럼 매핑(주제ID/본부/내용/시각) 일치
- [ ] CSV export → Excel에서 한글 깨짐 없음 (UTF-8 BOM)
- [ ] 만료 주제는 종료 섹션으로 자동 이동, 댓글 입력란 비활성

---

## 9. 작성자

이스타항공 안전기획팀 강동욱 · 2026-05-18
