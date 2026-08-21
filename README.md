# gtimeline

**내 기기들이 그린 지도.** 구글 타임라인 데이터를 넣으면 시간 범위를 지정해 **기기별 이동 경로**를 구글맵 위에 리본으로 그려주는 클라이언트-온리 웹앱.

- 라이브: https://2lab-ai.github.io/gtimeline/
- 모든 처리는 브라우저 안에서 끝난다 — 위치 데이터 서버 업로드 **0건**.

## 왜 "자동으로 계정에서 못 가져오나" (중요)

이 앱의 원래 이상형은 "gmail 로그인 → 계정 권한 → 타임라인 자동 조회"다. 그러나 **구글은 타임라인(위치 기록)을 읽는 공개 API를 제공하지 않는다**:

- 2024년 말 구글은 Timeline을 서버에서 **온디바이스 저장**으로 이관했고, 웹 타임라인(timeline.google.com)을 종료했다. 서버에 데이터 자체가 없다.
- OAuth로 데이터를 내보내는 [Data Portability API](https://developers.google.com/data-portability/user-guide/overview)의 [스코프 목록](https://developers.google.com/data-portability/user-guide/scopes)에도 Location History / Timeline 리소스는 없다 (Maps 검색활동·저장한 장소 등만 존재).
- 커뮤니티 확인: [Timeline API 없음 (Google 지원 스레드)](https://support.google.com/accounts/thread/10077759).

그래서 실제 데이터 경로는 **폰에서 내보낸 파일**이고, 이 앱은 그 파일을 넣는 순간부터를 전부 자동화한다: 포맷 자동 감지 → 기기 자동 분리 → 기간 필터 → 지도 렌더. Google 로그인은 세션 식별(어느 계정의 데이터인지 라벨링)에 쓰인다.

## 데이터 가져오는 법

**Android (새 포맷, 권장)** — 설정 → 위치 → 위치 서비스 → 타임라인 → **타임라인 데이터 내보내기** → `Timeline.json`. 또는 Google Maps 앱 → 프로필 → 내 타임라인 → ⋯ → 설정 → 타임라인 내보내기.

**iPhone** — Google Maps 앱 → 프로필 → 내 타임라인 → ⋯ → 개인 위치 정보 → 타임라인 내보내기 (JSON 배열 형식).

**구 Takeout 백업** — [takeout.google.com](https://takeout.google.com)의 위치 기록 아카이브가 있다면 `Records.json`(원시 좌표 + **deviceTag**)과 `Semantic Location History/YYYY_MONTH.json` 둘 다 지원.

여러 파일을 한 번에 떨어뜨려도 된다. 기기 구분 규칙:

| 포맷 | 기기 분리 |
|---|---|
| 폰 내보내기 `Timeline.json` | 파일 = 기기 1대 (기기마다 내보내서 함께 드롭) |
| Takeout `Records.json` | 레코드의 `deviceTag`로 자동 분리 → 기기 N대 |
| Semantic `YYYY_MONTH.json` | 파일 단위 트랙 |

## 설정

앱 우상단 ⚙에서 입력 (localStorage 저장, 선택사항):

1. **Google OAuth 클라이언트 ID** — [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → OAuth client ID (Web) → Authorized JavaScript origins에 `https://2lab-ai.github.io` (및 로컬 `http://localhost:5173`) 추가.
2. **Google Maps API 키** — Maps JavaScript API 활성화 후 발급. **키가 없으면 자동으로 오프라인 캔버스 미리보기**로 렌더되므로 없어도 동작한다.

## 개발

```bash
npm install
npm run dev     # http://localhost:5173
npm run check   # typecheck + unit tests + build
```

구조: `src/parsers/`(포맷 감지·파싱, 순수함수 + 테스트) · `src/geo.ts`(하버사인 거리·기간 필터·데시메이션) · `src/components/MapView.tsx`(Google Maps + 캔버스 폴백) · `main` 푸시 시 GitHub Pages 자동 배포.
