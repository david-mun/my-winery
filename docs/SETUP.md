# 로컬 실행 및 실제 Supabase 연결

2026-11-14 · 설정된 원격 프로젝트에 스키마 마이그레이션 6개를 적용하고 새 연결에서 이력·권한을 검증했다. 아래 명령은 재현 및 후속 운영 안내다. 프로젝트의 AGENTS.md에 따라 원격 DB 적용·Auth 계정 생성·초대 발송·데이터 업로드·배포는 대상 환경과 변경 범위에 대한 승인을 먼저 받는다.

## 1. 지금 화면 실행

Node.js 24 LTS 권장(이번 검증은 Node 26.9.0), npm과 lockfile을 사용한다.

```sh
cd /Users/ungzumun/projects/my-winery
npm ci
npm run dev
```

- `http://localhost:3000/demo`: 가상 데이터로 화면·검색·필터·구매 입력 검증 확인. 실제 스냅샷을 공개하지 않는다.
- `http://localhost:3000/login`: 실제 Supabase 인증. 환경변수뿐 아니라 아래 DB/초기 관리자 설정까지 필요하다.
- `npm run build && npm start`: 프로덕션 빌드로 실행.

`.env.local`의 네 변수는 `.env.example`을 기준으로 설정한다. 공개 변수도 서버에서 런타임에 읽으며 현재 앱은 브라우저에 Supabase client를 만들지 않는다. Secret 키는 server-only 모듈에서만 사용한다. `.env.local`은 Git 제외 대상이다.

## 2. DB 준비

원본 `database/schema_design_v1.sql`은 실행하지 않는다. 적용 대상은 `supabase/migrations/`의 다음 파일 여섯 개다.

1. `202611030001_core.sql`: 테이블, owner FK, RLS, private bucket, 최소 권한.
2. `202611030002_operations.sql`: 영수증 트랜잭션, 관리자 보호, 초대·감사·rate limit·파일 정리 큐.
3. `202611030003_import.sql`: 원자적 스냅샷 이관과 반복 검증.
4. `202611030004_bootstrap.sql`: 최초 관리자 일회 등록 함수(service 역할만 실행).
5. `202611140001_receipt_wine_names.sql`: 구매 저장 시 후보명 또는 영수증 상품명으로 개인 와인을 같은 트랜잭션에서 연결.
6. `202611140002_purchase_photos.sql`: 병별 연결 ID 반환 및 외부 사진 출처·라이선스 보관.

Supabase CLI와 Docker를 준비했다면 별도의 로컬 인스턴스에서 `npx supabase start`, `npx supabase db reset`으로 전체 스택을 검증할 수 있다. `db reset`은 **폐기 가능한 로컬 DB**에만 사용한다. 이번 환경에는 Docker가 없어 전체 Supabase CLI 스택은 실행하지 않았다.

승인된 **개발용 원격 프로젝트**에 적용하는 예:

```sh
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push --dry-run
# 대상·백업·변경 검토 및 사용자 승인 후:
npx supabase db push
```

DB 비밀번호와 CLI access token은 로컬 보안 입력으로 제공한다. 프롬프트·명령 인자·커밋에 값을 기록하지 않는다. 기존 public 테이블이 있는 프로젝트에는 충돌 검토 없이 적용하지 않는다. 앱 테스트가 원격 migration 완료를 의미하지 않는다.

### 기존 앱 키와 별도로 SQL 마이그레이션을 실행하는 방법

6번째 파일 `202611140002_purchase_photos.sql`은 사진 출처 필드와 구매별 병 사진 연결용 함수다. `SUPABASE_DB_URL` 하나만 추가하면 CLI 로그인 없이 이 저장소의 실행기를 사용할 수 있다. Supabase의 **Connect → Connection string → Method: Session pooler → URI**를 복사한다. **Install Agent Skills**는 필요하지 않다. DB 비밀번호를 로컬에서 넣어 완성한 URI를 프로젝트 `.env.local`에 보관한다. 비밀번호의 특수 문자는 URL 인코딩한다. Secret API 키는 SQL 연결 비밀번호가 아니다.

```sh
npm run db:migrate -- --plan
npm run db:migrate -- --apply
npm run db:migrate -- --verify
```

기본 실행은 읽기 전용 계획이다. 실행기는 앱 URL과 DB 프로젝트 식별자를 대조하고 TLS 인증서를 검증한다. SQL 실행기는 Supabase 공식 대시보드가 배포하는 공개 루트 인증서(tooling/supabase-prod-ca-2021.crt)로 서버 인증서와 호스트 이름을 검증한다. 변경 전에 기존 migration 이력과 미추적 테이블·버킷·스토리지 정책 충돌을 확인한다. 새 이력 및 스키마를 한 트랜잭션에서 적용하고, 핵심 권한/RLS/버킷/함수 검증이 실패하면 롤백한다. 개인 데이터를 가져오거나 회원을 만드는 작업은 별개다. 임시 PostgreSQL의 두 세션에서 경쟁 조건까지 검증하려면 `npm run test:postgres`를 사용한다.

## 3. Auth와 이메일 설정

- Authentication에서 공개 signup을 OFF로 설정한다. 프로필 없는 계정은 앱 접근이 거부되지만, 공개 signup 차단도 별도로 필요하다.
- Site URL은 개발 시 `http://localhost:3000`, 운영 시 실제 HTTPS 주소로 지정한다.
- Redirect URLs에 실제 사용하는 callback URL을 등록한다. 로컬은 `/auth/callback`, `/auth/callback?type=invite`, `/auth/callback?type=recovery`를 각각 포함한다. 운영/Preview는 정확한 origin을 사용한다.
- SMTP를 설정하고 사용자가 받을 수 있는 발신자/도메인을 검증한다. SMTP 자격증명은 Supabase에 등록하며 이 앱 env에 추가하지 않는다.
- Invite와 Reset Password 이메일 템플릿을 각각 `supabase/templates/invite.html`, `supabase/templates/recovery.html` 내용으로 설정한다. **token_hash를 서버 callback으로 전달하는 템플릿이 필요하다.** 기본 fragment 기반 링크만으로는 이 서버 인증 흐름을 검증할 수 없다.
- callback은 링크를 검증한 뒤 사용자 ID/흐름/10분 만료를 서명한 HttpOnly 쿠키를 발급한다. 해당 증명 없이 welcome/reset-password 화면 또는 비밀번호 API를 호출할 수 없다.
- 초대 API는 기본 회원 역할만 부여한다. 재발송은 미수락 계정에 대해 invite API를 다시 호출하며 60초 간격을 제한한다. Auth/SMTP 제공자가 거부하면 실패를 표시하고 감사 상태를 보존한다. 실제 메일 전달·만료·재발송은 원격 통합 검수 항목이다.

## 4. 최초 관리자

현재 프로젝트에는 최초 관리자가 등록되어 있고 구매 이관까지 완료했다. 로컬 앱을 실행하고 `.local-private/first-login.txt`의 주소를 브라우저에서 열어 새 비밀번호를 정한다. 이 파일은 소유자만 읽을 수 있고 Git과 Vercel 업로드에서 제외한다.

다른 빈 프로젝트에서 계정 등록과 이관을 함께 수행하거나, 같은 컴퓨터에서 만료된 첫 로그인 링크를 재발급할 때 아래 명령을 사용한다. 재발급은 기록된 활성 관리자 계정만 대상으로 하며 구매 이관을 다시 실행하지 않는다.

```sh
npm run owner:setup -- --apply --email YOUR_EMAIL --project YOUR_PROJECT_REF
npm run owner:setup -- --apply --renew-link --email YOUR_EMAIL --project YOUR_PROJECT_REF
```

### 기존 Auth 계정을 최초 관리자로 등록하는 경우

승인 후 Supabase Dashboard의 Authentication → Users에서 **관리자로 사용할 이메일 계정**을 생성하고 이메일 확인 상태 및 비밀번호를 준비한다. 이는 Supabase 콘솔 로그인 계정과 별개다. 생성된 Auth UUID를 사용한다.

```sh
# 기본 실행은 안내만 출력하며 아무것도 변경하지 않는다.
npm run bootstrap:admin

# 대상 프로젝트와 Auth UUID 확인 및 승인 후:
npm run bootstrap:admin -- --apply --owner YOUR_AUTH_UUID --project YOUR_PROJECT_REF
```

이 도구는 이메일 확인이 완료된 기존 Auth 사용자만 대상으로 하고, 이미 관리자 역할이 있으면 중단한다. 임의 계정을 생성하거나 메일을 보내지 않는다. 마지막 관리자 비활성화·강등·Auth 삭제는 DB 잠금과 trigger로 차단한다.

## 5. 실제 구매 스냅샷 이관

```sh
# 자격증명 없이 원본 검증. DB 연결 없음.
npm run import:snapshot -- --dry-run

# 대상/최초 관리자 검증 및 사용자 승인 후:
npm run import:snapshot -- --apply --owner YOUR_AUTH_UUID --project YOUR_PROJECT_REF

# 같은 대상에 대한 읽기 전용 대조:
npm run import:snapshot -- --verify --owner YOUR_AUTH_UUID --project YOUR_PROJECT_REF
```

정상 결과: 10와인/12병/2영수증/293,900원/11외부관측/5후기/0이미지. 소스 checksum과 원본별 엔터티 연결을 기록한다. 재실행은 원본과 적재 상태를 검증하며, 수정된 원본 또는 사용자가 편집한 대상이 있으면 덮어쓰지 않고 중단한다. 전체 배치 실패는 rollback한다. 사진이 없으므로 이미지 이관 완료라고 보고하지 않는다.

## 6. 이미지·데이터 운영

- 선택 원본은 JPEG/PNG/WebP, 10MiB/40MP 이하. 브라우저에서 긴 변 2,000px WebP로 줄여 전송하고, 서버에서 다시 signature/실제 디코딩/MIME를 검사하고 EXIF를 제거한다.
- 전송 결과는 4MB 이하로 제한해 [Vercel Functions의 4.5MB 요청 제한](https://vercel.com/docs/functions/limitations)에 맞춘다. 고해상도 원본 바이너리를 보존하는 아카이브 기능은 제공하지 않는다. 사용자 원본 파일은 별도 보관한다.
- Storage 직접 쓰기는 거부하며 서버에서 검증한 이미지에만 DB 메타데이터를 만든다. 이미지 조회 URL은 매번 owner/active를 확인한 후 60초 서명 URL로 연결한다.
- `asset_cleanup`에는 삭제 실패/고아 객체 정리 대상을 남긴다. 사용자별 삭제 작업 시 최대 25건을 재시도한다. 운영자는 큐 잔여와 Storage를 정기 점검해야 한다. 이미 발급된 서명 URL이나 내려받은 파일은 즉시 회수되지 않는다.
- MVP 계정 삭제는 비활성화로 제공한다. 영구 삭제·백업 보존 정책은 출시 전 별도 결정한다.

## 7. 테스트 명령과 범위

```sh
npm run lint
npm run typecheck
npm test
npm run test:db
npm run build
npx playwright install chromium
npm run test:e2e
```

`npm test`는 도메인 및 PGlite PostgreSQL 테스트다. `npm run test:e2e`는 loopback 54399의 가상 Auth/Storage 서버 + 실제 PGlite 마이그레이션/RLS와 3100의 Next 프로덕션 서버를 사용한다. cloud 키나 실제 메일이 필요하지 않으며 원격 Supabase에 쓰지 않는다. 테스트 어댑터는 `tests/support/`에만 있고 앱에서 import하지 않는다.

이 테스트는 실제 Supabase Auth 서버·PostgREST·Storage 서비스·SMTP·동시 다중 DB 연결·iPhone/Android 실기기 설치를 대체하지 않는다. 현재 결과와 출시 전 확인 항목은 [TEST_REPORT.md](TEST_REPORT.md)를 참조한다.

## Gemini 사진 분석 (2026-11-17)

기기 OCR 대신 로그인 사용자의 Gemini 분석 API를 사용한다. `.env.local`에 `GEMINI_API_KEY`를 보관하고 서버를 재시작한다. `GEMINI_MODEL` 기본값은 `gemini-3.1-flash-lite`다. `GEMINI_ANALYSIS_ENABLED=false`로 중지할 수 있다. 키 없는 상태에서도 수동 입력은 가능하다. 키는 `NEXT_PUBLIC_`에 넣지 않는다. Vercel 사용 시에도 서버 환경변수에 별도로 등록한 뒤 승인된 배포를 수행해야 한다.

무료 서비스에서는 개인정보를 보내지 않도록 미리보기에서 가린 후 전송한다. 세부 요청/응답과 설정은 [Gemini 구현](GEMINI_INTEGRATION.md)을 참조한다. 이번 변경에는 새 DB migration이 없으며 사용량 제한은 기존 `consume_rate_limit` RPC를 재사용한다.
