# My Wine List

사용자별 비공개 와인 컬렉션·구매·시음 기록을 관리하는 한국어 모바일 우선 PWA MVP입니다. Next.js App Router, TypeScript, Tailwind, shadcn 방식 UI 컴포넌트, Supabase Auth/PostgreSQL/Storage를 사용합니다.

## 로컬 실행

```sh
npm ci
npm run dev
```

[가상 데이터 미리보기](http://localhost:3000/demo) · [로그인](http://localhost:3000/login)

현재 연결한 Supabase 프로젝트에는 SQL 마이그레이션 6개를 적용했고, 최초 관리자의 비공개 컬렉션으로 와인 10종·12병·영수증 2건을 이관했습니다. 공개 가입은 꺼져 있습니다. 이 컴퓨터에서 첫 비밀번호를 정하려면 로컬 앱 실행 후 `.local-private/first-login.txt` 안의 일회용 주소를 여세요. 새 환경에 필요한 앱 변수 4개와 SQL 연결 변수, 초대 메일용 SMTP 설정은 [설정 가이드](docs/SETUP.md)에 있습니다.

## 제공 기능

- 초대 수락, 이메일/비밀번호 로그인, 비밀번호 복구, 비활성 계정 차단.
- 와인 통합 카드, 검색·종류/생산지/평점 필터·정렬, 상세·구매·시음 노트 CRUD.
- 영수증 전체 트랜잭션 저장, 개별/세트 구분, 할인·합계 대조, 수정 충돌 감지.
- 비공개 이미지 업로드·조회·삭제, EXIF 제거, 원본 없는 와인 자체 플레이스홀더.
- 관리자 초대·재발송·역할/상태 변경·감사, 마지막 활성 관리자 보호.
- 원본 CSV dry-run/apply/verify, 중복 방지·rollback·변경 감지.
- PWA manifest/아이콘, 360~1440px 반응형. 오프라인 개인 데이터 캐시는 하지 않습니다.

구매 화면에서 영수증 사진을 선택하거나 촬영하면 한국어·영어 OCR을 기기에서 수행합니다. 사진을 서버에 올리기 전 텍스트를 수정할 수 있습니다. 영수증 초안이나 직접 입력한 상품명으로 외부 와인 후보가 자동으로 나오며, 각 와인에 직접 찍은 병 사진 또는 출처가 확인된 공개 사진을 첨부할 수 있습니다. 사진 없는 상품도 구매 저장이 가능합니다. 영수증 OCR에 별도 API 키가 필요하지 않습니다.

## 검증

```sh
npm run lint
npm run typecheck
npm test
npm run import:snapshot -- --dry-run
npm run build
npx playwright install chromium
npm run test:e2e
```

[테스트 결과와 한계](docs/TEST_REPORT.md) · [진행 상태](docs/IMPLEMENTATION_STATUS.md) · [전체 설계 문서](docs/README.md)

## 주요 파일

- `app/`, `components/`, `lib/`: 앱 화면·서버 API·도메인·보안 처리.
- `supabase/migrations/`: 실행 대상 버전형 SQL. `database/schema_design_v1.sql`은 보관된 미검증 원본으로 직접 실행하지 않습니다.
- `scripts/`: 원본 이관과 최초 관리자 등록 도구(기본 dry-run).
- `tests/`: 도메인, PostgreSQL/RLS, 모바일·데스크톱 브라우저 테스트.
- `data/`: 변경하지 않는 개인 구매 스냅샷. 공개 데모에서는 사용하지 않습니다.

실제 구매 CSV·원본 매니페스트와 인수용 Word 원본은 로컬에 보관합니다. 새 체크아웃에서도 자동 테스트는 `tests/fixtures/data/`의 가상 구매 자료로 실행할 수 있습니다. 실제 이관이나 원본 dry-run을 실행하려면 본인의 원본 파일 세 개를 `data/`에 넣으세요.
