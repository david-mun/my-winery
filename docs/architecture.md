# My Wine List — 웹앱 상세 설계서

**문서 버전:** 1.1 (문서 인수 보강)  
**작성 기준일:** 2026-10-25  
**상태:** 구현 전 기술·제품 설계안  
**목표 플랫폼:** iPhone Safari/PWA · Android Chrome/PWA · PC Chrome/Safari/Edge  
**기술 스택:** Next.js · TypeScript · Supabase · GitHub · Vercel

> **설계 결정 요약**  
> Google Drive 와인 구매내역을 Supabase PostgreSQL로 이관한다. 공통 와인 상품 한 행에 모든 것을 넣지 않고 **와인 마스터 / 영수증 / 영수증 항목 / 항목-와인 연결 / 외부 평점 / 개인 시음 후기**를 분리한다. 개인 와인 데이터는 로그인 사용자별로 격리하고, 시스템 관리자는 별도 관리자 화면에서 사용자 초대·비활성화·역할을 관리한다. 웹앱은 모바일 우선의 반응형 PWA로 제공하며 GitHub→Vercel로 배포한다.

> **인수 안내:** 상세 동작·이관·보안·테스트 계약은 [문서 인덱스](README.md)를 참조한다. `architecture.docx`는 이번 수정이 반영되지 않은 v1.0 보관본이다. 아래 외부 출처 확인 기록은 기존 인수 자료에서 전달된 기록이며 이번 작업의 재확인을 의미하지 않는다.

## 1. 프로젝트 목표와 범위

### 1.1 목표

1. Google Sheets 기반 구매 목록을 검색과 필터가 쉬운 모바일·PC 웹앱으로 전환한다.
2. Vivino의 **이미지 중심 와인 카드, 와인 유형/생산지/평점 필터, 정렬** 경험을 참고한다. 웹앱은 판매 사이트가 아니라 개인 구매 및 시음 관리 서비스에 집중한다.
3. 동일 와인 재구매 시 목록에서 한 번만 표시하되 **구매별 가격·날짜·빈티지·영수증**은 모두 보존한다.
4. 개인 평점·개인 후기와 Vivino 평점을 분명하게 구분한다.
5. 관리자만 사용자를 초대·비활성화·관리할 수 있도록 하고, 일반 사용자는 자기 데이터만 볼 수 있게 한다.
6. 와인 사진, 영수증 이미지 등 원본 정보를 유지하며 백업과 데이터 내보내기를 지원한다.

### 1.2 범위 및 우선순위

| 우선순위 | 기능 | 인수 조건 |
|---|---|---|
| P0 | 이메일 로그인, 비밀번호 재설정, 로그아웃 | 로그인 전 개인 화면 접근 불가 |
| P0 | 관리자 사용자 초대/비활성화 | 일반 사용자 API 직접 호출도 거부 |
| P0 | 와인 목록·상세·검색·필터·정렬 | 종류/생산지/Vivino 4.0+/내 평점 기준 필터 |
| P0 | 구매 기록·영수증·개인 후기 CRUD | 재구매 이력을 잃지 않음 |
| P0 | 원본 Google Sheet 데이터 일회성 이관 | 10종·12병·영수증 2건·실결제 293,900원 대조 |
| P0 | RLS와 비밀키 분리 | 다른 사용자 데이터 조회·수정 불가 |
| P0 | 모바일/PC 반응형 | 360px부터 1440px까지 주요 화면 사용 가능 |
| P0 | PWA 홈 화면 설치 메타데이터 및 앱 아이콘 | iOS/Android 홈 화면 실행 |
| P0 | 기본 비공개 이미지 업로드·조회 | JPEG/PNG/WebP 검증·EXIF 제거; 고급 편집/HEIC/PDF는 후속 |
| P1 | 통계 대시보드·CSV/JSON 백업 | 구매 집계와 백업 가능 |
| P2 | 영수증 OCR·라벨 인식 보조 | 사용자 검수 후 저장 |
| P2 | 공유 셀러/가족 와인 리스트 | 별도 테넌트 권한 설계 이후 도입 |
| 제외(MVP) | 실시간 Vivino 평점 자동 크롤링, 와인 결제·판매, SNS, 모바일 네이티브 앱 | 필요 시 별도 프로젝트로 검토 |

### 1.3 기본 전제: 사용자 데이터 격리

- **v1.0의 기본 모드:** 가입자별 **독립적인 개인 와인 리스트**. 새 사용자를 초대해도 기존 사용자의 구매 내역이 자동 공유되지 않는다.
- **admin:** 계정과 권한을 관리하되, 일반 사용자의 개인 와인 구매·시음 내용은 기본적으로 열람하지 않는다. 운영상 조회가 필요한 경우 별도 감사·지원 권한 및 명시적 동의 절차를 추가한다.
- **첫 관리자:** Supabase Dashboard/안전한 일회성 SQL로 지정. 공개 회원가입은 기본적으로 비활성화하고 이메일 초대로만 가입한다.
- **기존 파일 데이터:** 최초 관리자의 계정으로 가져오는 것을 기본값으로 한다.
- 향후 가족 공유가 필요하면 `cellars`, `cellar_members` 테이블을 도입하는 v2 확장을 선택한다.

## 2. 확인한 Google Sheet 원본

### 2.1 확인한 실제 소스

- 파일명: **와인 구매내역**
- 링크: 로컬 `data/source_manifest.json` 참조
- 탭명: `와인 구매내역`
- 메타데이터 시각대: `Asia/Seoul`
- 데이터 위치: `A5:N17`의 헤더+12개 구매-와인 행 / `A19:F22`의 영수증 합계
- 파일 설명: 영수증 2건, 와인 10종, 구매 이력 12행. Google Drive 검색에서 **`my_wine_list_latest`라는 이름의 파일은 발견되지 않았으므로** 현재 확인된 위 파일을 이관 기준으로 사용한다.

### 2.2 초기 데이터 검증 기준

| 구분 | 확인된 값 | 비고 |
|---|---:|---|
| 와인 마스터 수 | 10종 | 중복 와인명은 그룹화 |
| 구매한 병 수 | 12병 | 9월 6병 + 10월 6병 |
| 영수증 수 | 2건 | 2026-09-13, 2026-10-10 |
| 9월 결제액 | 143,500원 | 개별 항목 103,600 + 세트 39,900 |
| 10월 결제액 | 150,400원 | 개별 항목 168,400 − 쿠폰 18,000 |
| 합계 결제액 | **293,900원** | 143,500 + 150,400 |
| 외부 평점 확인 기준일 | 2026-10-11 | 시간이 지나면 변경될 수 있음 |

### 2.3 10종 목록과 초기 식별 기준

| 와인(마스터) | 유형 | Vivino 표시평점 | 2026-10-11 기준 확인 사항 |
|---|---|---:|---|
| 러시안 잭 소비뇽 블랑 | 화이트 | 4.1 | 2회 구매, 9월은 묶음 구성 |
| 마스카 델 타코 수수마니엘로 | 레드 | 4.2 | 빈티지 미확인 |
| 말보로 썬 소비뇽 블랑 | 화이트 | 4.1 | 2025 빈티지 |
| 무초 마스 스파클링 | 스파클링 | 3.9 | NV |
| 생 클레어 비카스 초이스 소비뇽 블랑 버블스 | 스파클링 | 4.0 | 2025 빈티지 |
| 시에르 다르크 블라송 루즈 브뤼 | 스파클링 | 4.0 | 레드가 아닌 화이트 스파클링 |
| 안티노리 페폴리 키안티 클라시코 | 레드 | 4.0 | 2023 빈티지 |
| 엘 에네미고 샤르도네 | 화이트 | 4.2 | 2022 빈티지 |
| 제트 알렉산더 브라운 언케이지드 샤르도네 | 화이트 | 3.7 | 2023 빈티지 |
| 조지 미쉘 소비뇽 블랑 | 화이트 | 3.9 | 2회 구매; Vivino 매칭 추가 확인 필요 |

**중요:** Vivino 평점은 원본에 기재된 과거 확인값이며, 2026-10-25 시점의 실시간 값으로 간주하지 않는다. 특히 조지 미쉘은 Golden Mile 항목을 참고한 것으로 라벨/병 동일성 검증 플래그가 필요하다. 원본 URL은 화면 텍스트가 아니라 Google Sheets 셀의 **하이퍼링크 메타데이터**에서 추출해야 한다.

### 2.4 원본의 회계적 특이사항

- 9월에는 `조지미쉘+러시안잭소비뇽블랑` **세트 한 줄 39,900원**이 두 병에 연결된다. 와인별 배분액은 `NULL`이어야 한다. 각 병에 39,900원을 기록하면 매출 합계가 두 배 계산된다.
- 10월 쿠폰 **18,000원**은 전체 영수증 할인으로 유지한다. 근거 없이 개별 와인 가격에서 차감하지 않는다.
- 와인 마스터의 최신 표시 가격은 `최근 구매 시 표시된 상품 단가`이고, 실제 현금 지출 합계는 **영수증 결제액**으로 별도로 표시한다.
- `NV`와 `UNKNOWN`은 다르다. NV는 정식 무빈티지, UNKNOWN은 영수증으로 특정 연도를 알 수 없음.
- 기존 개인 시음 날짜가 없으면 구매일로 자동 설정하지 않고 `NULL`로 보관한다.

## 3. 사용자 역할과 권한

| 기능 | 일반 사용자(member) | 관리자(admin) |
|---|---|---|
| 로그인/로그아웃 | 허용 | 허용 |
| 자기 와인/구매/후기 조회 | 허용 | 자기 데이터만 기본 허용 |
| 자기 와인/구매/후기 수정 | 허용 | 자기 데이터만 기본 허용 |
| 다른 사용자의 와인 조회 | 거부 | 기본 거부 |
| 사용자 목록·초대 상태 조회 | 거부 | 허용 |
| 새 사용자 초대 | 거부 | 허용 |
| 사용자 비활성화/재활성화 | 거부 | 허용 |
| 관리자 권한 부여·회수 | 거부 | 허용, 재인증 권장 |
| 최종 관리자 제거 | 거부 | 서버에서 차단 |
| 감사 로그 조회 | 거부 | 허용(최소 정보) |

**정책:** 이메일은 식별·로그인 정보이고 권한의 기준이 아니다. `auth.users.id`와 서버가 관리하는 `app_user_roles`/`profiles.status`를 기준으로 검증한다. UI에서 관리자 버튼을 숨기는 것만으로는 보호되지 않는다.

## 4. 화면 정보 구조(IA)와 사용자 흐름

### 4.1 라우트 목록

확장 포함 목표 라우트다. `/stats`와 데이터 내보내기는 후속 범위이며, MVP에는 인증 복구용 `/reset-password`를 추가한다.

| 경로 | 화면 | 주요 기능 |
|---|---|---|
| `/login` | 로그인 | 이메일/비밀번호, 비밀번호 재설정 |
| `/auth/callback` | 인증 콜백 | 초대·재설정 코드 검증, 보안 세션 처리 |
| `/welcome` | 초대 수락 | 최초 비밀번호 설정, 프로필 확인 |
| `/wines` | 내 와인 리스트(홈) | 사진/평점/검색/필터/정렬 |
| `/wines/[id]` | 와인 상세 | 기본 정보, Vivino 링크, 구매·평가 기록 |
| `/wines/new` | 와인 등록 | 사진/명칭/종류/지역/Vivino 링크 입력 |
| `/purchases` | 구매 내역 | 영수증 단위 목록, 결제 합계 |
| `/purchases/new` | 구매 입력 | 구매일/상점/품목/할인·세트/영수증 |
| `/purchases/[id]` | 영수증 상세 | 원본·품목 연결·합계 검증 |
| `/reviews` | 나의 시음 노트 | 내 평점/후기/시음일 관리 |
| `/stats` | 통계 | 총 구매액, 월별 추이, 유형·지역 분포 |
| `/settings` | 내 설정 | 프로필, 내 데이터 내보내기, 로그아웃 |
| `/admin` | 관리자 홈 | 전체 사용자 수, 초대 상태, 활동 이력 |
| `/admin/users` | 사용자 관리 | 검색, 초대, 권한, 비활성화 |
| `/admin/users/[id]` | 사용자 계정 상세 | 역할/상태/감사 이력(콘텐츠 미노출) |

### 4.2 데스크톱 홈 와이어프레임

```text
┌─────────────────────────────────────────────────────────────────┐
│ MY WINE LIST      [와인 검색..................]  + 와인   👤     │
├───────────────┬─────────────────────────────────────────────────┤
│ 필터          │ 내 와인 10종 · 구매한 와인 12병                 │
│ □ 레드        │ [최신 구매순 ▾] [Vivino 4.0+ ] [내 평점 4.0+] │
│ □ 화이트      │ ┌──────────────────┐ ┌──────────────────┐       │
│ □ 스파클링    │ │  [병 이미지]      │ │  [병 이미지]      │       │
│ 생산국/지역   │ │  와인 이름        │ │  와인 이름        │       │
│ 빈티지        │ │  🇳🇿 말보로      │ │  🇮🇹 풀리아      │       │
│ Vivino 평점   │ │  Vivino 4.1 ★    │ │  Vivino 4.2 ★    │       │
│ 내 평점       │ │  내 평점 3.5 ★   │ │  내 평점 3.5 ★   │       │
│ 가격 범위     │ │  2회 구매        │ │  1회 구매        │       │
│ 구매 상점     │ └──────────────────┘ └──────────────────┘       │
└───────────────┴─────────────────────────────────────────────────┘
```

### 4.3 모바일 홈 와이어프레임

```text
┌──────────────────────┐
│ MY WINE LIST     👤   │
│ [와인 검색.........] │
│ [화이트] [4.0+] [필터]│
│                      │
│ [병] 와인 이름       │
│      🇳🇿 말보로      │
│      Vivino 4.1 ★    │
│      내 평점 3.5 ★   │
│      2회 구매        │
│ ──────────────────── │
│ [병] 와인 이름       │
│      Vivino 4.2 ★    │
│      1회 구매        │
│                      │
│ [와인] [구매] [+] [내정보] │
└──────────────────────┘
```

### 4.4 와인 상세 화면 필수 정보

- 상단: 자체 촬영 병 이미지(없으면 플레이스홀더), 한글/원어 와인명, 생산자, 와인 유형, 국가/지역, 품종, 빈티지.
- 평점: **Vivino 평점**(확인 날짜·빈티지 기준·외부 링크 명시), **내 평점**(별도 시각 요소).
- 보유/구매: 현재 보유량은 원본에 없으므로 미확인으로 표시한다. 총 구매 병 수, 구매 횟수, 마지막 구매일, 최근 개별 상품 단가(미확인 시 `가격 미확인`), 영수증별 구매 내역.
- 시음 후기: 내 평점(1.0~5.0점, 0.1점 단위), 후기, 시음 날짜, 사진 선택 등록, 수정/삭제.
- 행동: `구매 기록 추가`, `시음 후기 작성`, `Vivino에서 보기`.
- 확인 필요 배지: 라벨 일치 불확실한 외부 링크/정보는 `매칭 확인 필요` 표시.

### 4.5 화면 동작 기준

- 데스크톱(≥1024px): 왼쪽 고정 필터 + 오른쪽 2~4열 카드. 리스트/그리드 선택 가능.
- 태블릿(768~1023px): 2열 카드, 필터 드로어.
- 모바일(360~767px): 한 열 카드, 하단 탭, 필터 Bottom Sheet, 고정 등록 버튼.
- 터치 요소 최소 44×44 CSS px, 입력 필드 16px 이상(iOS 확대 방지), 폼 validation과 저장 상태 표시.
- 검색 후 화면 URL에 필터 상태 유지(`/wines?type=white&vivinoMin=4.0&sort=latest`). 뒤로 가기 및 북마크 가능.
- 이미지 lazy loading, 화면 폭별 이미지 크기, skeleton 로딩, 네트워크 장애/데이터 없음 상태 제공.
- 다크 모드는 추후 지원 가능하지만 첫 버전은 따뜻한 아이보리 배경 + 차콜 텍스트 + 버건디 포인트. 별점과 등급은 색상만으로 의미 전달하지 않음.
- iOS/Android 설치 가능한 PWA `manifest`, 아이콘, 안전 영역(safe area) 지원. **오프라인 수정·자동 동기화는 MVP 비포함**.
- 디자인 참조는 Vivino의 정보 구조와 사용성에 한정. Vivino 상표/제품사진/리뷰/평점을 무단 복제하거나 크롤링하지 않는다.

## 5. 시스템 아키텍처

### 5.1 논리적 계층

```text
[Browser/PWA]
  │ HTTPS + cookie session
  ▼
[Vercel / Next.js App Router]
  ├─ Server Components: 목록/상세 초기 조회, 권한 확인
  ├─ Server Actions: 와인/후기/구매 데이터 변경, Zod 검증
  ├─ Route Handlers: /api/admin/*, 인증 콜백, 이미지 서명
  ├─ Data Access Layer: owner_id, user role, status 검사
  └─ Supabase SSR Client / (서버 전용 Admin Client)
               │
               ▼
[Supabase]
  ├─ Auth: 계정, 이메일 초대, 세션
  ├─ PostgreSQL: RLS, SQL constraints, 인덱스, 트랜잭션
  └─ Storage(private): 병 사진, 영수증 원본

[GitHub] ── PR/CI ──> [Vercel Preview] / [Vercel Production]
```

### 5.2 인증/인가의 경계

1. 클라이언트가 서버로 요청한다. 브라우저에는 **공개 가능한 Supabase URL과 publishable key**만 둔다.
2. Next.js의 서버 Supabase 클라이언트는 쿠키 세션을 읽는다. 신뢰성 높은 서버 검증(예: `auth.getUser`)과 활성 계정 검사를 수행한다.
3. 데이터 변경 시 Zod 등의 스키마 검증과 `owner_id` 검증을 거친다.
4. PostgreSQL RLS가 동일한 `auth.uid()` 소유 자료만 반환/변경하도록 다시 검증한다.
5. `SUPABASE_SECRET_KEY`는 서버 전용이며 **오직 `/api/admin/*` 등 인증·인가를 통과한 최소 경로**에서 사용한다. 브라우저 번들이나 `NEXT_PUBLIC_*`에 넣지 않는다.
6. 리스트별 서버 렌더 결과는 **사용자별 캐시 혼합을 막도록** 동적/비공개 처리한다.

### 5.3 권장 패키지

- Next.js App Router, React, TypeScript(strict)
- `@supabase/supabase-js`, `@supabase/ssr`(사용 시 현재 베타 API 주의)
- Tailwind CSS, shadcn/ui, lucide-react
- React Hook Form, Zod
- `date-fns` 또는 `dayjs`(화면 표시; DB 구매일은 DATE)
- Vitest + Testing Library / Playwright
- Sentry 또는 유사 오류 수집 도구(선택)

## 6. 데이터 모델(ERD)

### 6.1 관계

```text
auth.users (1) ─ (1) profiles
           (1) ─ (1) app_user_roles
           (1) ─ (N) wines
           (1) ─ (N) merchants
           (1) ─ (N) purchase_receipts
purchase_receipts (1) ─ (N) receipt_lines
receipt_lines (1) ─ (N) receipt_line_wines ─ (N) wines
wines (1) ─ (N) external_ratings
wines (1) ─ (N) tasting_notes
wines / purchase_receipts (1) ─ (N) media_assets
import_batches (1) ─ (N) import_rows
admin activities ─ (N) admin_audit_logs
```

### 6.2 핵심 테이블

| 테이블 | 핵심 컬럼 | 설계 이유 |
|---|---|---|
| `profiles` | `id`, `display_name`, `status`, `created_at` | Auth 사용자와 앱 활성 상태 연결 |
| `app_user_roles` | `user_id`, `role` | 일반 사용자가 임의로 admin 역할 변경 불가 |
| `wines` | `id`, `owner_id`, `name_ko`, `name_original`, `producer`, `wine_type`, `grape`, `country`, `region`, `identity_key` | 동일 와인 구매를 묶을 개인별 마스터 |
| `merchants` | `id`, `owner_id`, `name`, `location_text` | 영수증 구매처를 재사용 |
| `purchase_receipts` | `id`, `owner_id`, `merchant_id`, `purchased_on`, `gross_items_amount`, `bundle_amount`, `discount_amount`, `paid_amount`, `source_key` | 실제 지출과 결제 검증의 기준 |
| `receipt_lines` | `id`, `owner_id`, `receipt_id`, `line_no`, `line_kind`, `raw_label`, `line_amount` | 개별/세트/할인 줄을 원본대로 보존 |
| `receipt_line_wines` | `id`, `owner_id`, `receipt_line_id`, `wine_id`, `vintage_label`, `bottle_quantity`, `allocated_amount` | 한 세트 줄에 여러 와인 연결 가능 |
| `external_ratings` | `id`, `owner_id`, `wine_id`, `source`, `score`, `rating_scope`, `vintage_label`, `checked_on`, `source_url`, `verification_status` | 외부 평점 이력과 URL 관리 |
| `tasting_notes` | `id`, `owner_id`, `wine_id`, `vintage_label`, `my_rating`, `review_text`, `tasted_on` | 내 평점/후기 기록 |
| `media_assets` | `id`, `owner_id`, `wine_id` 또는 `receipt_id`, `object_path`, `mime_type`, `origin` | 사설 스토리지 경로 관리 |
| `import_batches`/`import_rows` | `source_file_id`, `source_row`, `row_checksum`, `status` | 재실행해도 중복 적재 방지 |
| `admin_audit_logs` | `actor_id`, `target_user_id`, `action`, `created_at` | 관리자 작업 추적 |

### 6.3 데이터 무결성 원칙

- UUID를 모든 레코드 기본키로 사용한다.
- 개인 데이터에는 모두 `owner_id`를 저장하고 RLS로 필터링한다. **복합 외래키 `(id, owner_id)`**를 사용해 다른 사용자의 와인이나 영수증 항목을 연결하는 공격도 방지한다.
- `purchase_receipts.paid_amount`는 실제 결제액. 할인액은 별도 양수 컬럼으로 관리하고, `receipt_lines.line_kind = discount`의 금액은 음수로 기록한다.
- 금액은 최초 범위가 KRW이므로 정수 원 단위(`BIGINT` 또는 `INTEGER`)로 관리한다. 통화 확장 시 `currency`, 통화별 소수 자리 정책을 추가한다.
- Vintage는 `2025`, `2023`과 같은 연도뿐 아니라 `NV`, `UNKNOWN` 상태를 명시해 구분한다. 마스터는 빈티지를 포함하지 않으므로 다른 빈티지도 같은 와인에 묶인다.
- `external_ratings`는 덮어쓰기보다 이력 행을 누적하고 목록에서는 최근 확인된 유효 레코드만 노출한다.
- `tasting_notes`는 사용자가 반복 시음할 때 여러 건이 생길 수 있으며, 목록의 `내 평점`은 최신 생성 후기의 점수를 사용한다. 대표 지정 기능은 후속이다([세부 규칙](PRODUCT_SPEC.md)).
- 구매 항목 삭제는 전체 영수증 합계를 손상시킬 수 있으므로, 제품 UI에서 수정 후 **합계 재검증**을 의무화한다.
- 실제 영수증 원본과 직접 입력 데이터는 별도 스토리지·감사 정보로 유지한다.

### 6.4 같은 와인 두 번 구매한 경우

`wines`에 러시안 잭 와인 1건만 존재한다. `receipt_line_wines`에서는 9월의 `UNKNOWN`과 10월의 `2025` 구매를 서로 다른 항목으로 참조한다. 목록은 1개 카드와 `2회 구매`를 보여주고, 상세 페이지는 2개 영수증의 구매 내역을 보여준다. 가격이 미상인 9월 구매는 `NULL`로 표시한다.

## 7. Supabase RLS 및 관리자 보안

### 7.1 RLS 정책 요약

- 대상: `wines`, `merchants`, `purchase_receipts`, `receipt_lines`, `receipt_line_wines`, `external_ratings`, `tasting_notes`, `media_assets`.
- 모든 SELECT/INSERT/UPDATE/DELETE 정책에 `(select auth.uid()) = owner_id` 및 `private.is_active_member()`를 적용한다.
- 관리자도 해당 원칙을 우회하지 않는다. 관리자 기능은 **콘텐츠 데이터가 아닌 계정 관리 전용**이다.
- `profiles` 및 `app_user_roles`은 사용자 본인 또는 활성 관리자에게 읽기를 허용하되, **역할과 상태 변경 권한을 클라이언트에 절대 부여하지 않는다**.
- `anon` DB 권한을 회수하고 노출 스키마의 모든 테이블에 RLS를 켠다. `authenticated` 권한도 필요한 동작만 부여한다.
- `private.is_admin()`은 비노출 스키마의 `SECURITY DEFINER`, 고정된 빈 `search_path`, fully qualified table names로 구현한다.
- `service role/secret key`는 RLS를 우회할 수 있으므로 서버에서만 사용하고 호출 전 매번 역할을 확인한다.
- DB 정책마다 `anon`, 소유자, 타 사용자, inactive, admin 케이스를 테스트한다.

**미검증 SQL 초안:** [database/schema_design_v1.sql](../database/schema_design_v1.sql)을 참조한다. 실행 가능성을 보증하지 않는다. [정적 검토 및 보완 목록](SECURITY_AND_SCHEMA_REVIEW.md)을 반영한 버전형 migration과 실제 DB 테스트를 통과한 뒤 적용한다.

### 7.2 보안·프라이버시 강화

- 관리자 API에 서버 측 `getUser`/활성 계정/역할 재확인, Zod 검증, rate limit, CSRF와 Origin 정책, 감사 기록 적용.
- 마지막 활성 관리자는 삭제/비활성화/권한 제거를 거절한다.
- 사용자 삭제 기본은 **비활성화**: RLS 즉시 접근 차단, Auth 계정 ban 처리. Auth 단독 ban만으로 이미 발급된 access token 즉시 회수를 보장하지 않으므로 DB의 활성 상태도 확인한다.
- 계정의 영구 제거는 개인정보 삭제·백업·영수증 보존정책·관련 레코드 연쇄삭제 여부를 운영자가 명시적으로 검토한 뒤 별도 확인 절차로 진행한다.
- 세션 쿠키 `Secure`, `HttpOnly`(프레임워크 동작 범위), `SameSite` 권장, HTTPS 강제.
- 비밀번호를 자체 DB에 저장하지 않고 Supabase Auth에 위임. 최소 권한 원칙을 적용한다.
- 영수증에는 거래 내역이 포함되므로 `wine-assets` 스토리지 버킷은 **private**. 만료되는 서명 URL 또는 인증 요청을 통해서만 접근한다.

## 8. 사용자 로그인과 관리자의 사용자 추가/삭제

### 8.1 초대 기반 가입 플로우

```text
ADMIN 로그인 → /admin/users → 이메일 입력 / Member 선택
      → Next.js POST /api/admin/users/invite
      → 현재 유저 인증 + active admin 체크
      → 서버 전용 Supabase Admin inviteUserByEmail()
      → profile/role upsert + 감사 로그
      → 초대 이메일 수신
      → /welcome 에서 비밀번호 설정 및 인증 확정
      → /wines 로 이동
```

- Supabase Redirect URLs에 Production URL 및 필요한 Preview URL을 허용한다. Preview의 임의 도메인을 넓은 와일드카드로 전면 개방하지 않는다.
- 서비스용 SMTP 구성과 초대 메일 도달률 테스트 필요. 비밀번호 재설정은 인증 제공 기능을 이용한다.
- 이미 가입한 이메일 초대 요청은 충돌 안내, 중복 초대를 재발송할지에 대한 정책을 별도 구현한다.
- Auth 초대 호출과 DB 프로필 추가는 별도 시스템 간 작업이므로 실패 시 orphan 계정 탐지/보정 로그를 남긴다.

### 8.2 사용자 삭제(비활성화) 플로우

```text
ADMIN → 사용자 상세 → 비활성화 → 확인 모달
→ admin API → 마지막 admin 여부 검사
→ profiles.status='disabled' (앱 DB 접근 즉시 차단)
→ Auth ban/revoke 관련 작업 → 관리자 감사 로그
→ 사용자 세션에서 다음 DB 요청부터 RLS 거부
```

### 8.3 관리자 페이지 컴포넌트

- KPI: 전체 계정, 활성 계정, 초대 중, 비활성 계정.
- 사용자 테이블: 표시 이름, 이메일(필요 최소), 역할, 상태, 생성일, 마지막 활동(가능한 경우).
- 기능: 초대, 초대 재발송, 역할 변경, 일시 중지/해제, 영구 삭제(이중 확인·v1에서는 제한 가능).
- 관리자 액션마다 확인 모달·서버 로그, 민감한 작업에는 관리자 재인증 권장.
- 일반 사용자에게 `/admin` 라우트는 서버에서 403 또는 리다이렉트 처리; API는 별도 403 응답.

## 9. 와인·구매·후기 기능 상세

### 9.1 와인 목록

아래는 확장 포함 목표다. MVP 필터와 동작의 정확한 범위는 [PRODUCT_SPEC.md](PRODUCT_SPEC.md)를 따른다.

- 검색: 한글 와인명, 원어명, 생산자, 국가, 지역, 품종.
- 필터: 색상(레드/화이트/로제/스파클링 등), 국가/지역, 빈티지, Vivino 최소평점, 나의 최소평점, 구매일, 구매 장소.
- 정렬: 최근 구매순(기본), 이름순, Vivino 평점 높은순, 내 평점 높은순, 최근 단가 높은/낮은순.
- 카드: 자체 이미지, 명칭, 산지, Vivino 점수(원본 기준 날짜 표시), 내 점수, 구입 횟수, 최근 구매일.
- **`4.0점 이상` 필터는 Vivino 기준인지 내 평점 기준인지 명시적으로 분리**한다.
- 필터에 해당하는 값이 없는 와인은 `평점 없음`으로 분류되며, 4.0+ 조건에서 제외한다.

### 9.2 구매·영수증

- 영수증 단위 데이터: 매장, 날짜, 품목 단가 총합, 세트 합계, 쿠폰, 실제 결제액, 메모, 원본 이미지.
- 일반 품목: 와인 1종(병 수 지정)과 한 줄 결제액을 연결.
- 세트: **한 줄에 복수 와인 연결**; 총 세트가와 병별 가격 미배분 상태 보존.
- 할인: 음수 할인 줄과 양수 영수증 할인 집계를 함께 유지한다. 초기 10월은 줄 -18,000원/헤더 18,000원이며 결제 계산에서 중복 차감하지 않는다.
- 합계 오류 검출: 영수증 항목을 입력한 뒤 `전체 양수 줄 합계 - 할인 + 조정 = paid_amount` 일치 여부 표시. 차이가 있으면 제출을 차단한다. 자동 조정액으로 차이를 감추지 않는다.
- 가격 통계: `최근 명시된 상품 단가`와 `할인 후 실제 결제액`을 구분한다. 세트 속 개별 와인의 유효 단가는 임의 계산 금지.

### 9.3 나의 시음 기록

- `내 평점`은 1.0~5.0점, 0.1점 간격 입력 기본. 점수 미기재도 허용.
- 후기 텍스트, 시음일(선택), 재시음 기록 작성 가능.
- 초기 데이터의 `3.5`, `4.0`과 후기는 최초 계정에 연결하되, 시음일은 비워둔다.
- 와인 상세에서 각 개인 후기의 생성/수정 시각을 구분한다. 전체 버전 이력은 후속 범위다. 다른 사용자 후기는 MVP에 표시하지 않는다.

### 9.4 외부 링크와 사진

- Vivino URL은 원본 하이퍼링크에서 정확하게 추출하고 `https://www.vivino.com/...` 등의 허용 도메인 검증을 통과한 경우에만 링크를 연다.
- 원본과 매칭이 불분명한 조지 미쉘 항목에는 `verification_status='needs_review'`를 지정한다.
- 외부 점수 갱신은 각 소유자가 자기 와인의 URL을 열어 수동 확인 후 관측 행을 추가한다. 운영 관리자 권한으로 다른 사람의 콘텐츠를 수정하지 않는다.
- 이미지 정책: 사용자 직접 촬영·사용권 확보 이미지만 저장. Vivino 사진 URL 핫링크·스크래핑을 기본 기능으로 구현하지 않는다.
- 업로드: JPEG/PNG/WebP를 기본 지원하고 iPhone HEIC/HEIF 변환은 후속 범위로 두며 MVP에서는 지원 형식 안내를 제공한다. 파일 크기, MIME 검증, 메타데이터(EXIF) 제거, 난수 파일명, 보존정책 적용.

## 10. 웹 API와 데이터 접근 계층

| 메서드/경로 | 역할 | 보안 방식 |
|---|---|---|
| `GET /wines` (Server Component) | 내 목록 조회 | SSR 세션+RLS |
| `GET /wines/[id]` | 와인 상세/구매/평점 | SSR 세션+RLS |
| `POST /api/wines` | 와인 생성 | 세션/활성상태/Zod/RLS |
| `PATCH /api/wines/[id]` | 와인 수정 | 소유자 검증+RLS |
| `GET /api/purchases` | 내 영수증 | RLS |
| `POST /api/purchases` | 영수증/품목 트랜잭션 | 서버 검증+DB transaction 또는 안전한 RPC |
| `POST /api/reviews` | 시음 노트 생성 | RLS |
| `POST /api/media/sign-upload` | 업로드 경로/권한 | 세션+파일 정책+Storage RLS |
| `GET /api/me/export` | 데이터 내보내기 | 개인 소유 범위 |
| `GET /api/admin/users` | 계정 목록 | 관리자 권한+서버 전용 client |
| `POST /api/admin/users/invite` | 초대 메일 | 관리자 권한+Admin Auth API |
| `PATCH /api/admin/users/[id]` | 역할/상태 관리 | 관리자 권한+감사로그 |

단순 폼 저장은 Next.js Server Actions로도 구현 가능하다. 중요한 것은 URL 수보다 **모든 변경 지점에서 인증/소유권 검증을 일관되게 적용**하는 것이다. 다중 테이블을 함께 변경하는 구매 저장에는 DB의 단일 트랜잭션 또는 안전한 RPC를 활용하여 부분 저장을 방지한다.

## 11. Google Sheets → Supabase 이관 설계

### 11.1 단계

1. **원본 고정:** Drive의 현재 파일 수정 없이 복제 또는 XLSX/CSV+메타데이터 백업. 2026-10-25 기준 파일 ID/변경 시각 기록.
2. **정확한 추출:** 값만이 아니라 K열 셀 하이퍼링크, 수식, 빈 값, 줄 번호, 영수증 합계 및 부가 메모 추출.
3. **중간 데이터(JSON):** 원본 행 전체를 `import_rows.raw_json`에 보관. 각 행에 `source_file_id`, `source_tab`, `source_row`, `checksum` 부여.
4. **정규화:** 와인명/생산자/종류/산지 분리, 빈티지 변환, 이름 정규화 키 생성(자동 판단이 애매하면 review 목록 생성).
5. **적재:** 마스터 10종 → 구매처 → 영수증 2건 → 12개 와인 할당 → 범위별 외부 평점 11개 → 개인 후기 5개([산출 근거](DATA_MIGRATION.md)).
6. **회계 대조:** 9월/10월 영수증별 금액, 그룹별 구매 횟수, 중복 제거, 세트/할인 무배분 확인.
7. **검수:** 사용자 UI에서 모든 카드/링크/개인 후기를 점검하고, 원본과 비교하는 감사용 CSV 생성.
8. **전환:** 웹앱을 읽기 전용 검증한 뒤 쓰기 허용. 원본 Google Sheet는 일정 기간 **읽기 전용 백업**으로 유지.

### 11.2 구글 시트 컬럼 매핑

| 원본 컬럼 | Supabase 대상 | 처리 |
|---|---|---|
| A 와인이름 | `wines.name_ko` | 이름 중복 그룹화 |
| B 구매장소 | `merchants.name` / `purchase_receipts.merchant_id` | 주소는 참고 메모에서 추출 가능 |
| C 구매가격(원) | 일반 줄 금액 및 와인 연결 배분액 | 세트는 줄 전체 39,900원, 구성 병 allocated_amount=NULL |
| D 와인종류 | `wines.wine_type` + `wines.grape` | `화이트 · 소비뇽 블랑` 분리 |
| E 생산지 | `wines.country`, `wines.region` | 구분자·국가 표기 표준화 |
| F 비비노평점 | `external_ratings.score` | 2026-10-11 확인값, 빈티지 범위 보존 |
| G 구매일 | `purchase_receipts.purchased_on` | YYYY-MM-DD, 타임존과 구분 |
| H 빈티지 | `receipt_line_wines.vintage_label` | `미표기→UNKNOWN`, `NV→NV` |
| I 평점 기준 | `external_ratings.rating_scope` | 전체/특정 빈티지 구분 |
| J 가격·확인 메모 | `receipt_lines.notes` / `external_ratings.notes` | 텍스트 원본 유실 방지 |
| K 비비노 출처 URL | `external_ratings.source_url` | 표시값 아닌 셀 hyperlink 추출 |
| L 영수증 상품명 | `receipt_lines.raw_label` | OCR/매칭 감사 근거 |
| M 나의 평점 | `tasting_notes.my_rating` | 미기재는 NULL |
| N 나의 후기 | `tasting_notes.review_text` | 빈 값 보존 |
| 영수증 결제 표 | `purchase_receipts` | 영수증별 결제액·쿠폰·세트액 |

### 11.3 중복 제거 / idempotency

- `wines`는 계정 범위에서 `identity_key`로 중복 방지하되, 자동 병합 시 **라벨/생산자/브랜드가 달라지는 경우 수동 검토**.
- 원본 안정 키 `(source_file_id, source_tab, source_row)`와 checksum을 분리해 출처를 기록한다. 같은 소스 재실행은 검증만 하며 변경 checksum은 충돌로 중단한다. 현재 SQL 초안에는 배치 간 안정 키·다중 엔터티 매핑 보완이 필요하다([이관 계약](DATA_MIGRATION.md)).
- 영수증은 `(owner_id, source_key)` 유니크 제약 사용. 같은 날짜·매장이라도 실제 서로 다른 영수증은 다른 키여야 한다.
- 마이그레이션은 `--dry-run`, `--apply`, `--verify` 단계로 나누고, 실패 시 배치 전체 트랜잭션 롤백 또는 명시적인 배치별 재시도만 허용한다.
- 향후 새 영수증은 **Google Drive가 아니라 웹앱에서 등록**하도록 운영 전환. 복수 입력 경로 동시 운영은 동기화 설계 이전에 금지한다.

### 11.4 성공 기준

- 마스터 10종, 구매 와인 12병, 영수증 2건.
- 2026-09-13: 143,500원, 2026-10-10: 150,400원, 총 293,900원.
- 러시안 잭/조지 미쉘 구매 횟수 각각 2회.
- 세트 39,900원과 할인 18,000원은 영수증 수준에서만 한 번 집계.
- 기존 개인 평점/후기·Vivino 링크·외부 평점 기준을 누락 없이 표시.
- 복수 번 마이그레이션 실행해도 유효 레코드 수와 총액이 달라지지 않음.

## 12. GitHub 저장소 설계

```text
my-winery/
├── .github/workflows/
│   ├── ci.yml                 # lint/typecheck/test/build
│   └── dependency-check.yml
├── app/
│   ├── (auth)/login/page.tsx
│   ├── (auth)/welcome/page.tsx
│   ├── (app)/wines/page.tsx
│   ├── (app)/wines/[id]/page.tsx
│   ├── (app)/purchases/page.tsx
│   ├── (app)/reviews/page.tsx
│   ├── (app)/stats/page.tsx
│   ├── (app)/settings/page.tsx
│   ├── (admin)/admin/users/page.tsx
│   ├── api/admin/users/invite/route.ts
│   ├── auth/callback/route.ts
│   ├── layout.tsx
│   └── manifest.ts
├── components/
│   ├── wine/wine-card.tsx
│   ├── wine/wine-filters.tsx
│   ├── purchases/receipt-form.tsx
│   ├── admin/user-table.tsx
│   └── ui/
├── lib/
│   ├── supabase/client.ts
│   ├── supabase/server.ts
│   ├── supabase/admin.ts      # server-only, secret key
│   ├── auth/require-user.ts
│   ├── auth/require-admin.ts
│   ├── data/wines.ts
│   ├── data/purchases.ts
│   └── validation/
├── supabase/
│   ├── migrations/
│   ├── seed.sql
│   └── tests/rls.test.sql
├── scripts/migrate-google-sheet/
│   ├── extract.ts
│   ├── transform.ts
│   ├── load.ts
│   ├── verify.ts
│   └── README.md
├── tests/e2e/
├── public/icons/
├── .env.example
├── .gitignore
├── next.config.ts
├── package.json
└── README.md
```

### 12.1 브랜치/PR 정책

- `main`: 운영 배포. 직접 push 제한, PR+필수 CI 통과 후 merge.
- `feature/*`, `fix/*`: 개발 브랜치.
- PR에서 lint/typecheck/unit/RLS 검증, Playwright 기본 smoke test 실행.
- GitHub Secrets/Environments와 Vercel 환경변수 구분. 어떤 키도 README, `.env.example`, 로그, client bundle에 실제 값을 저장하지 않는다.

### 12.2 `.env.example` 예시

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<public-key>
SUPABASE_SECRET_KEY=<server-only-secret-key>
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

`SUPABASE_SECRET_KEY`는 Next.js 서버 런타임의 관리자 모듈에서만 읽도록 `server-only` 패턴을 적용한다. GitHub에 `.env.local`을 커밋하지 않는다.

## 13. Vercel 배포 및 운영 환경

1. GitHub private repository 연결 → Vercel 프로젝트 생성.
2. Vercel `Preview`는 **스테이징 Supabase 프로젝트**, `Production`은 **운영 Supabase 프로젝트**를 사용. Preview가 운영 DB에 접속하지 못하도록 설정.
3. Supabase Auth Site URL/Redirect URLs를 각 환경 도메인에 맞춰 설정.
4. Supabase CLI migration은 **버전 관리**, 스테이징 적용 및 테스트 통과 후 승인된 파이프라인으로 운영 반영. 무조건 모든 Preview 배포에서 production migration을 실행하지 않는다.
5. `main` merge → 운영 배포, PR → Preview 배포. 사용자 데이터 화면의 캐시 제어와 로그 민감정보 마스킹 검사.
6. 자체 도메인(예: `wine.example.com`)은 실제 도메인 확보 후 연결. DNS, HTTPS, 사용자 초대 메일 도메인을 점검한다.
7. 배포 후 `/login`, 사용자·관리자 권한, 이미지 접근, 최초 목록, 293,900원 집계, 모바일 실제 기기 smoke test 수행.

## 14. 품질 속성 및 운영 기준

| 항목 | 목표/정책(설계 목표) | 검증 |
|---|---|---|
| 반응형 | 360~1440px 주요 화면 가로 스크롤 최소화 | iPhone/Android/PC 실기기 QA |
| 성능 | 목록 초기 10~100개 아이템에서도 빠른 응답, 이미지는 lazy load | Lighthouse 및 실제 망 계측 |
| 접근성 | 키보드 탐색, 스크린리더 이름, 충분한 명도 대비 | axe/수동 QA |
| 보안 | cross-user 차단·서비스 비밀키 노출 0 | RLS/Route 부정테스트 |
| 가용성 | 배포 실패 시 이전 Vercel 배포로 되돌릴 수 있음 | 배포 롤백 훈련 |
| 백업 | Supabase 요금제 지원 범위에 맞는 DB 백업, 별도 데이터 export | 백업·복원 리허설 |
| 저장소 | private bucket, 콘텐츠 타입·크기 제한 | 익명 접근 테스트 |
| 기록 | 관리자 변경 이력, 오류 로그(민감정보 제외) | 로그/감사 확인 |
| 국제화 | 초기 ko-KR, KRW, 날짜는 Asia/Seoul | 날짜·금액 UI 테스트 |
| 데이터 삭제 | 기본은 soft disable, 영구삭제 시 정책·승인 필요 | 관리자 시나리오 테스트 |

- 적은 데이터에서는 단순한 Supabase 인덱스와 서버 렌더링이면 충분하다. 외부 Elasticsearch, 별도 API 서버, Kubernetes는 MVP에서 불필요하다.
- 백업은 데이터베이스와 Storage 객체를 **별도로** 고려한다. DB만 복구하면 스토리지 파일이 복원되지 않을 수 있다.
- PostgreSQL `EXPLAIN`과 쿼리 로그를 사용해 초기 운영 이후 인덱스 최적화. `owner_id`, `receipt_id`, `wine_id`, `purchased_on` 중심 인덱스를 기본 제공.
- 사용자가 작성한 시음 후기 삭제는 사용자 권한 하에 처리하고, 관리자 감사 로그는 데이터 최소 수집·보존기간 설정.

## 15. 테스트 케이스 및 인수 체크리스트

### 15.1 인증·보안

- [ ] 비로그인 상태에서 `/wines`와 `/admin` 접근 차단.
- [ ] 일반 사용자로 `/api/admin/users/invite` 호출 시 403.
- [ ] 일반 사용자가 DB client에서 `app_user_roles.role` 업데이트 불가.
- [ ] 사용자 A가 사용자 B의 `wine_id`/`receipt_id`를 URL·API로 지정해도 조회/수정 불가.
- [ ] 사용자 A가 `receipt_line_wines`에 사용자 B의 wine id를 연결할 수 없음(복합 FK).
- [ ] 비활성 사용자 기존 access token으로 데이터 접근 차단.
- [ ] 최종 활성 admin 비활성화 및 권한 제거 거부.
- [ ] secret key가 클라이언트 번들·로그에 나타나지 않음.
- [ ] Storage 파일의 다른 사용자 경로 접근 불가.

### 15.2 와인/금액/마이그레이션

- [ ] 최초 와인 10종이 한 번씩만 목록에 표시.
- [ ] 구매 와인 12병, 영수증 2건 확인.
- [ ] 9월 143,500원, 10월 150,400원, 합계 293,900원.
- [ ] 39,900원 세트 줄이 2배 합산되지 않음.
- [ ] 18,000원 쿠폰을 와인별로 임의 배분하지 않음.
- [ ] 러시안 잭 2회, 조지 미쉘 2회 구매 이력과 다른 빈티지 표시.
- [ ] `UNKNOWN`과 `NV`가 정확히 구분됨.
- [ ] Vivino 4.0+ 필터와 내 평점 4.0+ 필터가 서로 다르게 동작.
- [ ] K열 하이퍼링크가 동일하게 유지되고 새 창으로 열림.
- [ ] 원본 후기의 공백/줄바꿈 및 3.5/4.0 점수 보존.
- [ ] 마이그레이션을 동일 소스로 2회 재실행해도 중복 없음.

### 15.3 모바일/UX/배포

- [ ] iPhone Safari와 홈 화면 PWA에서 로그인/세션/파일 업로드 가능.
- [ ] Android Chrome에서 필터 Bottom Sheet와 이미지 업로드 가능.
- [ ] PC Safari/Chrome/Edge에서 리스트/그리드/키보드 사용 가능.
- [ ] 사진 미설정·평점 미설정·가격 미확인 상태 처리.
- [ ] API 실패/오프라인/세션 만료 시 적절한 안내.
- [ ] Preview는 운영 DB에 접속 불가.
- [ ] Production 배포 후 관리자 초대 메일 및 redirect 검증.

## 16. 구현 순서와 출시 게이트

| 단계 | 구현물 | 다음 단계로 넘어가는 조건 |
|---|---|---|
| 0. 준비 | 저장소, Supabase 환경, 최초 관리자, 비밀키 정책 | 서버·클라이언트 분리 확인 |
| 1. 데이터 | SQL migration, RLS 테스트, 마이그레이션 리허설 | 10종·12병·2건·293,900원 대조 |
| 2. 핵심 앱 | 로그인, 내 와인 목록/상세, 검색/필터 | 모바일/PC 읽기 흐름 검증 |
| 3. 편집 기능 | 와인/구매/후기 CRUD, 사진 | 세트/쿠폰 합계와 데이터 무결성 확인 |
| 4. 운영 | 관리자 사용자 초대/차단, 감사, CI/CD, 백업 | 인가 부정테스트 및 실제 기기 테스트 |
| 5. 확장 | PWA 개선, 통계, 영수증 인식 보조 | 실제 사용 피드백 기반 우선순위 결정 |

### 16.1 출시 전 결정할 선택지

1. **회원 데이터**: 기본안은 모든 사용자의 개인 리스트 분리. 가족 공용 리스트가 필요하면 테넌트 모델 조기 변경.
2. **관리자 권한**: 사용자 계정만 관리할지, 사용자의 와인 내용도 관리할지. 기본안은 계정만 관리.
3. **신규 영수증 입력**: 첫 버전은 수동 입력+사진 보관. OCR은 후속 기능.
4. **사진 확보**: 직접 업로드 또는 라이선스 있는 이미지. 무단 Vivino 이미지 복제는 제외.
5. **데이터 이관 시점**: 이관 후 Google Sheet를 읽기 전용으로 유지하고, 실사용 입력은 웹앱으로 단일화.

## 17. 예상 리스크와 대응

| 리스크 | 영향 | 대응 |
|---|---|---|
| 와인명·빈티지 오식별 | 서로 다른 와인이 합쳐짐 | 이름/생산자/라벨 교차검증, 수동 매칭 대기 |
| Vivino 평점 변동 | 실제 점수와 저장 점수 불일치 | 관측 날짜·빈티지 기준을 함께 표시 |
| Vivino 콘텐츠 저작권/약관 | 외부 이미지·리뷰 활용 제한 | 자가 촬영 이미지 사용, 공식 URL 링크 중심 |
| 세트/할인 귀속 오류 | 총액 과대계상 | 원본 영수증 단위 보존, nullable allocation |
| 키 유출/RLS 누락 | 개인정보 노출 | 별도 서버 admin client, 모든 테이블 RLS 테스트 |
| 관리자 단독 계정 분실 | 운영 불가 | 안전한 최초 복구 절차, 다중 관리자 정책 |
| 이메일 초대 실패 | 신규 사용자 등록 불가 | SMTP 설정, 초대 상태/재시도/오류 로그 |
| 운영 Preview DB 연결 | 테스트가 실데이터 수정 | 별도 Supabase 프로젝트·환경변수 확인 |
| 이미지 HEIC/PWA 차이 | 모바일 사진 첨부 실패 | 포맷 변환과 실기기 업로드 테스트 |
| Supabase/호스팅 과금 | 예상 밖 이용 요금 | DB/Storage/이미지/함수 사용량 경고 설정 |

## 18. 설계상 최종 권장사항

1. **새 앱용 기본 DB는 PostgreSQL 단일 DB**로 충분하다. 독립 Node 서버, Elastic, Redis를 시작부터 추가하지 않는다.
2. **개인 와인 보유·구매 이력을 핵심 도메인**으로 삼는다. Vivino의 쇼핑 UI는 편리한 탐색 패턴만 참고한다.
3. **영수증 총액을 재무적 기준으로 사용**한다. 병별 가격 미확인·전체 할인 미배분 상태를 보존한다.
4. **private-by-default + invite-only**로 인증·데이터 접근을 설계한다. RLS는 필수이며 UI 권한 체크만으로 끝내지 않는다.
5. 첫 출시는 **데이터 이관 검증과 모바일 UX**를 우선한다. OCR, 외부 평점 자동 업데이트, 공유 리스트는 이후 확장한다.

## 19. 참고 자료(2026-10-25 확인)

- 원본 Google Sheet: 로컬 `data/source_manifest.json` 참조
- Vivino Cabernet Sauvignon 탐색 화면: https://www.vivino.com/en/explore/grapes/cabernet-sauvignon
- Supabase Next.js Auth: https://supabase.com/docs/guides/auth/quickstarts/nextjs
- Supabase SSR/쿠키: https://supabase.com/docs/guides/auth/server-side
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase 초대형 계정 관리: https://supabase.com/docs/guides/auth/users
- Supabase Storage private bucket: https://supabase.com/docs/guides/storage/buckets/fundamentals
- Next.js Authentication: https://nextjs.org/docs/app/guides/authentication
- Vercel Environment: https://vercel.com/docs/deployments/environments

---

*이 문서는 개발 착수를 위한 상세 제품/아키텍처 설계안입니다. 실제 GitHub 리포지토리·Supabase 프로젝트·Vercel 배포는 아직 생성하지 않았으며, 별도 SQL 파일 역시 운영 DB에 실행되지 않았습니다.*
