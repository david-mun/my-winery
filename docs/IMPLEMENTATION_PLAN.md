# 구현 계획·인수 테스트·운영 준비

이 문서는 2026-10-25 수립한 구현·인수 계획이다. 2026-11-03 로컬 MVP와 자동 테스트를 구현했다. 아래 표는 인수 목표이며 전 항목 통과를 의미하지 않는다. 실제 완료 범위는 [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md), 실행 결과와 원격 검수 대기는 [TEST_REPORT.md](TEST_REPORT.md)를 기준으로 한다.

## 1. 수직 슬라이스와 완료 조건

| 단계 | 산출물 | 다음 단계 진입 조건 |
|---|---|---|
| S0 기반 | Next.js/TypeScript/Tailwind/shadcn, lint/typecheck/test/build scripts, env 검사 | 로컬 페이지·한국어 레이아웃 실행, 키 없음 상태 명시 |
| S1 DB | Supabase 버전형 migrations, owner FK/RLS, 영수증 불변식 | 빈 로컬 DB 적용 성공, RLS/원자성 테스트 통과 |
| S2 Auth | login/callback/welcome/reset-password, DAL 사용자 검증 | 초대 없는 접근 거부, 비활성 세션 거부 |
| S3 와인 | 목록·상세·등록·편집·필터, 대표값 집계 | 재구매 카드 통합, NULL·빈티지·평점 구분 |
| S4 구매/후기 | 트랜잭션 저장·수정·삭제, private 이미지 | 세트·할인 대조, 실패 rollback, 업로드 검증 |
| S5 Admin | 초대/재발송/상태/역할/감사, 안전한 비활성화 | 직접 API 거부, 마지막 admin 동시성 테스트 |
| S6 이관 | dry-run/apply/verify, 안정 원본 키·매핑 | 두 번 실행 같은 결과, 변경 원본 충돌·rollback 확인 |
| S7 PWA/반응형 | manifest·아이콘, 에러·빈 화면, 모바일 조작 | 360/390/768/1440px smoke, 실제 기기 설치 확인 |
| S8 인수 | 환경 가이드, CI, 결과 기록 | 필수 검증 통과·미검증 명시 후 승인된 배포만 수행 |

도메인 단위 테스트는 각 단계에서 작성한다. 끝에 몰아서 보안을 검증하지 않는다. 키 없이 쓰는 demo는 가상 데이터로 별도 표시하고 실제 개인 CSV를 공개 번들·빌드 프리렌더·배포 seed에 포함하지 않는다. 데모 성공은 실제 DB 연동 성공이 아니다.

## 2. 인수 테스트 매트릭스

| ID | 입력/행동 | 기대 결과 / 테스트 계층 |
|---|---|---|
| AUTH-01 | 비로그인 개인 URL/API | 로그인 이동/401, 정보 노출 없음 / 통합·E2E |
| AUTH-02 | 만료/재사용 초대·재설정, 임의 return URL | 세션 발급 실패·외부 이동 거부 / 통합 |
| RLS-01 | A, B, admin, disabled, anon으로 모든 개인 테이블 SELECT/INSERT/UPDATE/DELETE | 자기 active 범위만 허용, admin도 타인 거부 / 실제 DB |
| RLS-02 | 다른 owner FK 연결·owner_id 바꾸기 | 제약/RLS 거부, 원래 행 불변 / 실제 DB |
| RLS-03 | member 직접 role/profile 쓰기·admin API 호출 | 모두 거부 / DB·HTTP |
| ADM-01 | 마지막 admin 비활성화/강등/삭제 | 409, active admin 유지 / DB·통합 |
| ADM-02 | 두 admin을 동시에 강등·비활성화 | 적어도 1명 유지, 실패 요청 rollback / DB 동시성 |
| ADM-03 | 초대 성공 후 프로필 기록 실패·Auth ban 실패 | 복구 상태 기록, 재시도 중복 없음·DB 차단 유지 / 통합 |
| BUY-01 | 9월 묶음 1줄/2연결·10월 할인 | 143,500/150,400, allocation NULL, 총 293,900 / 단위·DB |
| BUY-02 | 헤더/줄 합계 불일치·할인에 와인 연결 | RPC 및 직접 DB 요청 모두 거부 / DB |
| BUY-03 | 구매 저장 중 오류·동일 영수증 동시 편집 | 부분 저장 없음, 합계 보존·충돌 안내 / DB·통합 |
| IMP-01 | 초기 스냅샷 이관 후 재실행 | 10와인/12병/2영수증/11평점/5후기/0미디어 유지 / 단위·DB |
| IMP-02 | 동일 원본 키의 checksum 변경·동시 apply | 충돌 중단/직렬화, 기존 자료 보존 / DB |
| IMP-03 | 평점/후기/빈티지와 원본 연결 비교 | NV≠UNKNOWN, 시음일 NULL, 조지 미쉘 needs_review / 단위·DB |
| UI-01 | 검색·종류·지역·평점 필터, 뒤로 가기 | URL/목록 일치; 초기 Vivino 4.0+ 7개, 내 4.0+ 2개 / E2E |
| UI-02 | 러시안 잭 상세·재구매 | 카드 1개, 2회/2병, 9월 가격 미확인 / E2E |
| UI-03 | 영수증 삭제·후기 작성/수정/삭제 | 집계 갱신, 독립 와인·후기 보존, 재고 자동 차감 없음 / E2E |
| FILE-01 | 타인 path·위조 MIME·과대 파일·직접 Storage 쓰기 | 차단, 공개 객체 없음 / 통합 |
| FILE-02 | EXIF 사진 업로드·DB 실패 | EXIF 제거 확인, 고아 객체 정리/재시도 / 통합 |
| FILE-03 | 다른 사용자·disabled 사용자 읽기 | 신규 서명 거부, 발급 URL 만료 확인 / 통합 |
| PWA-01 | 360/390/768/1440px, 키보드·iOS/Android 홈 실행 | overflow 없음, 44px 터치, 포커스·safe area·아이콘 정상 / E2E·실기기 |
| CACHE-01 | A 로그아웃 후 B 로그인·오프라인 이동 | A의 페이지·API·사진이 B에게 재노출되지 않음 / 통합·E2E |

거부 테스트는 단순 HTTP 200 여부가 아니라 결과 행과 저장 상태를 검증한다(RLS SELECT는 빈 결과일 수 있음). DB 테스트는 service client만으로 실행하지 말고 실제 anon/authenticated 역할과 각 사용자 JWT 맥락으로 수행한다. 관리 secret는 테스트 준비에만 제한한다.

## 3. 환경과 명령

현재 실행 가능:

```sh
cd /Users/ungzumun/projects/my-winery
python3 data/validate_snapshot.py
```

현재 실행 가능한 명령은 `npm run dev`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`, `npm run test:db`, `npm run test:postgres`, `npm run import:snapshot -- --dry-run`이다. 원격 스키마와 원본 이관의 재현 절차는 [설정 가이드](SETUP.md)에 있다.

| 설정 | 준비/확인할 값 |
|---|---|
| 로컬 | Node/npm 지원 버전·lockfile, Supabase CLI/로컬 DB 실행 환경 |
| 공개 환경변수 | NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, NEXT_PUBLIC_APP_URL |
| 서버 전용 | SUPABASE_SECRET_KEY; 실제 값은 로컬/배포 secret에만 등록 |
| Auth | 공개 signup 차단, 정확한 callback/redirect URL, SMTP·이메일 전달 검증 |
| 최초 관리자 | 승인 후 Auth 계정 생성, UUID 확인, 제한된 bootstrap 실행 |
| 환경 분리 | Preview/개발 DB와 운영 DB 분리, 잘못된 프로젝트 쓰기 방지 |
| 미디어 | private bucket·크기/MIME 정책, 이미지 처리 경로, 고아 객체 정리 |
| 데이터 | 원본 파일 checksum, apply 대상 UUID·프로젝트, 사용자 제공 원본 사진 여부 |

## 4. 출시·복구 기준

외부 자원 생성, 사용자 초대 발송, 실제 업로드, GitHub push, Vercel 배포, 운영 migration은 별도 명시적 승인을 받은 뒤 실행한다. 로컬 구현·테스트를 먼저 완료하고 승인 시 대상 환경·적용 변경·검증 결과를 제시한다.

운영 적용 전 복구 가능한 DB 백업과 Storage 보존 방법을 확인하고 복원 절차를 별도 환경에서 검수한다. 최초 이관 실패는 전체 트랜잭션 rollback한다. 적용 후 문제가 생기면 쓰기를 중지하고 배치 source key로 영향 범위를 확인한다. 사용자가 편집한 데이터를 원본 재적재로 덮어쓰거나 운영 DB를 reset하지 않는다. 코드 롤백만으로 DB 변경이 취소되지 않음을 운영 가이드에 명시한다.

SMTP 전달, 실제 Storage, PWA 설치, 외부 배포는 로컬 단위 테스트로 대체하지 않는다. 수행하지 못한 검증은 완료 기록에서 “미검증”으로 남긴다.
