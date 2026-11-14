# 보안 계약 및 SQL 초안 검토

2026-10-25 · [schema_design_v1.sql](../database/schema_design_v1.sql)을 정적으로 읽은 결과다. PostgreSQL/Supabase에서 실행하거나 정책을 통과시킨 결과가 아니다. 초안 자체는 보존하고 후속 버전형 migration에서 수리한다.

## 1. 유지할 설계

개인 테이블의 owner_id, `(id, owner_id)` 복합 FK, active 상태를 포함한 소유자 RLS, 역할 테이블의 사용자 쓰기 금지, private Storage, 서버 전용 관리자 자격증명 분리는 유지한다. 관리자에게 콘텐츠 RLS 예외를 추가하지 않는다.

## 2. 구현 전 수정 목록

| ID | 초안에서 확인한 상태 | 구현 계약 / 검증 |
|---|---|---|
| DB-01 | 헤더 안의 금액 CHECK만 있음 | 자식 줄 합계·헤더·할인·병 연결을 커밋 시 검증. 줄만 직접 수정하는 DB 요청도 우회 불가 |
| DB-02 | 마지막 관리자 제약 없음 | 역할 변경·비활성화·삭제를 공통 DB 잠금 하에 처리하고 active admin 최소 1명 보존. 동시 요청 테스트 |
| DB-03 | 초대/수락 상태 없음, profile 기본 active | 초대 작업 상태를 별도 관리. 수락 완료 전 active 전환 금지. 프로필 없는 계정은 접근 거부 |
| DB-04 | import_rows는 배치 내 유니크만 있음 | 배치 간 안정 원본 키 및 다중 엔터티 매핑 추가, checksum 변경 충돌 감지 |
| DB-05 | line_no nullable, 일반 항목 음수 허용 | line_no NOT NULL/양수, wine·bundle 금액 음수 금지, discount 연결 금지, 병 수 정수 검증 |
| DB-06 | rating_scope와 vintage의 조합 제약 없음 | ALL_VINTAGES/UNKNOWN, VINTAGE/연도, NV/NV, UNKNOWN/UNKNOWN 조합 검증 |
| DB-07 | media 메타데이터와 Storage path 연결이 약함 | bucket 고정, owner/path/연결 대상 검증, 존재하는 검증 완료 객체만 연결 |
| DB-08 | 브라우저가 Storage에 직접 insert/update 가능 | 검증 전 파일을 최종 위치에 직접 올리지 못하도록 쓰기 정책 축소. 서버 처리 경로 강제 |
| DB-09 | updated_at 기본값만 있음 | 수정 trigger 또는 공통 변경 경로로 갱신; 클라이언트 시간이 감사 기준이 되지 않음 |
| DB-10 | audit 인증 사용자 직접 읽기 권한 없음 | 의도대로 쓰기는 서버 전용 유지, 활성 관리자 전용 조회 API 제공 |
| DB-11 | CREATE POLICY 반복 실행 충돌 가능 | 일회 버전형 migration으로 관리, 빈 로컬 DB부터 전체 적용 검증 |
| DB-12 | bucket 충돌 갱신은 public=false만 반영 | migration에서 size/MIME 설정도 의도한 값으로 확인·갱신 |

금액 불변식은 [DATA_MIGRATION.md](DATA_MIGRATION.md)를 따른다. 구매 저장 RPC만 추가하고 테이블 직접 쓰기를 그대로 허용하면 검증 우회가 가능하다. 제안은 **트랜잭션 RPC + 커밋 시 지연 constraint trigger**로 직접 쓰기에도 불변식을 적용하는 방식이다. 같은 영수증 변경은 부모 행 잠금으로 직렬화한다. RPC 실행 권한·search_path·호출자 ownership을 명시하고 허용되지 않은 우회 경로를 테스트한다. 구현 시 더 단순한 동등 보장 방식으로 바꾸면 결정 기록을 갱신한다.

## 3. 접근권한 계약

| 주체 | 자기 콘텐츠 | 타인 콘텐츠 | 계정·역할 | 감사/이관 |
|---|---|---|---|---|
| 비로그인 | 거부 | 거부 | 거부 | 거부 |
| active member | CRUD | 거부 | 자기 상태 읽기만 | 거부 |
| disabled 또는 수락 전 | 거부 | 거부 | 앱 접근 거부 | 거부 |
| active admin | 자기 범위 CRUD | 거부 | 서버 경유 계정 관리 | 관리자 감사 조회만 |
| 신뢰된 이관 도구 | 명시한 owner 범위 적재 | 요청 범위 외 금지 | 첫 관리자 확인 | 지정 배치 기록 |

서버는 매 요청 사용자·활성 상태·필요 역할을 확인한다. 클라이언트 owner_id, JWT의 오래된 role, 이메일 문자열을 권한 근거로 삼지 않는다. 일반 데이터 요청은 사용자 세션 client로 RLS를 적용한다. 관리자 secret client를 목록/상세 DAO에서 재사용하지 않는다. 자기 소유가 아닌 ID는 존재 여부를 노출하지 않는 404, 미인증 API는 401, 권한 부족은 403, 중복/상태 충돌은 409를 기본값으로 한다.

## 4. 관리자 상태 전이와 실패 복구

- 초대 작업: pending → sent → accepted; 외부 호출/DB 기록 실패는 failed 또는 reconciliation_required. 재시도 키로 중복 초대를 막는다. 앱 역할은 수락 시 member가 기본이며 관리자 부여는 별도 감사 액션이다.
- 활성화: 유효한 초대와 Auth 사용자 검증 후 profile/role 생성 및 active 전환. 공개 signup으로 만든 사용자가 자동 활성화되는 trigger 금지.
- 비활성화: 마지막 admin 검증과 DB disabled 전환·감사 기록을 원자 처리한 후 Auth ban/revoke를 시도한다. Auth 실패 시 DB disabled 유지, 재시도 대상 표시.
- 재활성화: Auth 상태 복구 확인 후 DB active로 전환한다. 중간 실패를 성공으로 표시하지 않는다.
- 역할 변경: 현재 호출자 admin 여부를 잠금 안에서 다시 확인하고, 모든 admin 수 감소 경로를 같은 잠금으로 직렬화한다. 자기 강등도 마지막 관리자 규칙 적용.
- 영구 삭제: MVP 운영 UI에서는 비활성화까지만 제공한다. 계정/DB/Storage 삭제와 백업 보존 정책·복구 책임이 정해져야 자동 삭제 기능을 연다. Auth 삭제를 먼저 호출해 고아 Storage를 만들지 않는다.
- 감사 정보: actor/target 식별자, action, request ID, 결과, 이전/이후 role/status, 발생 시각. 비밀번호·토큰·후기·영수증 내용은 저장하지 않는다. 외부 Auth 작업은 DB 트랜잭션과 분리되므로 시도/완료/실패를 구분한다.

목표 사용자는 10명 이하이나 강제 정원 여부는 미정이다. 이를 확정 요구로 가정한 hard limit을 먼저 넣지 않는다.

## 5. Storage와 세션

제안 업로드 흐름: 인증·active·연결 대상 소유 확인 → 크기 제한 → 실제 파일 signature/디코딩 검사 → 이미지 재인코딩 및 EXIF 제거 → 난수 경로 `<owner UUID>/wines|receipts/<asset UUID>.webp` 저장 → 검증된 media 메타데이터 기록. JPEG/PNG/WebP만 허용하고 PDF·HEIC는 변환 안내로 거절한다. 해상도 상한도 정해 압축 폭탄을 방지한다(초기 제안 40메가픽셀).

파일 저장 성공 후 DB 실패 시 객체 삭제를 시도하고 재시도 목록을 남긴다. 삭제 실패도 정리 대상으로 추적한다. signed upload만 발급하고 끝내는 방식은 EXIF 제거 보장을 충족하지 못한다. 이미지 처리 서버만 최종 저장을 허용한다. 부여된 서버 권한이 사용자 소유 검사를 대체하지 않는다.

조회는 매번 권한 확인 후 짧은 수명(제안 60초)의 signed read URL을 발급한다. URL 자체는 만료까지 재사용 가능한 접근권이므로 로그·공유 캐시·장기 DB 필드에 저장하지 않는다. 비활성화 후 신규 발급은 즉시 차단되지만 이미 발급된 URL의 남은 수명과 이미 받은 파일까지 회수되지는 않는다. 이 특성은 인수 테스트에 포함한다.

인증 콜백과 재설정 return URL은 정확한 허용 origin/내부 경로만 받는다. 관리자 변경 요청에는 Origin/CSRF 검증과 rate limit을 적용한다. 개인 SSR 결과/API는 사용자 간 공유 캐시를 금지한다. 서비스워커가 도입되더라도 인증된 응답을 캐시하지 않는다. 비밀키는 server-only 모듈, 환경변수 예시는 자리표시자만 사용한다.
