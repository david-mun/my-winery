# 문서 인수 안내

기준일: 2026-10-25 · 작업 폴더: `/Users/ungzumun/projects/my-winery` · 제품명: **My Wine List**

2026-11-03 MVP 앱·버전형 SQL·이관 도구·로컬 테스트를 구현했다. 실행은 [SETUP.md](SETUP.md), 검증 결과와 서비스 통합 한계는 [TEST_REPORT.md](TEST_REPORT.md), 실제 진행 상태는 [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md)를 참조한다. 아래 설계 문서는 구현 전 계약의 이력도 포함한다. Git 저장소 초기화와 원격 배포는 하지 않았다.

## 읽는 순서

| 문서 | 역할 |
|---|---|
| [SETUP.md](SETUP.md) | 로컬 실행, DB/Auth 설정, 최초 관리자, 승인 후 이관 명령 |
| [TEST_REPORT.md](TEST_REPORT.md) | 실제 실행한 검증과 통합 검수 한계 |
| [architecture.md](architecture.md) | 제품 개요, 기존 와이어프레임, 전체 아키텍처 |
| [PRODUCT_SPEC.md](PRODUCT_SPEC.md) | MVP 범위, 화면별 행동, 값의 표시·입력 규칙 |
| [DATA_MIGRATION.md](DATA_MIGRATION.md) | CSV 매핑, 영수증 계산, 중복 방지, 이관 검수 |
| [SECURITY_AND_SCHEMA_REVIEW.md](SECURITY_AND_SCHEMA_REVIEW.md) | SQL 초안의 미완성 항목, 권한·Storage·관리자 설계 |
| [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) | 구현 순서, 테스트 인수 기준, 환경·출시 준비 |
| [DECISIONS.md](DECISIONS.md) | 확정 요구사항과 구현용 제안 기본값, 남은 결정 |
| [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) | 실제 완료 작업·검증 결과·미구현 항목 |

## 문서 적용 원칙

- 사용자 지시와 [AGENTS.md](../AGENTS.md)의 불변 규칙을 우선한다. 구매 사실의 기준은 `data/` 원본 스냅샷이다.
- 상세 문서는 architecture의 모호한 표현을 구체화한다. 새 정책은 결정 기록에서 **제안 기본값**으로 표시하며, 기존 확정 요구로 둔갑시키지 않는다.
- [SQL 초안](../database/schema_design_v1.sql)은 미검증 설계 참고 자료다. 상세 문서의 개선 항목이 SQL에 적용되어 있다고 가정하지 않는다.
- [architecture.docx](architecture.docx)는 인수받은 v1.0 보관본이다. 이번 Markdown 상세화가 반영되지 않았다. 이후 개발 기준은 Markdown 문서 묶음이다.
- 원본 Google Sheets와 Vivino 링크는 출처 정보다. 이번 인수에서 외부 페이지·실시간 평점·클라우드 계정 상태를 재확인하지 않았다.
- [최초 구현 프롬프트](../codex/START_PROMPT.md)는 후속 앱 개발용이다. 이번 요청은 문서 구체화로 해석했다.

## 인수 중 바로잡은 내용

1. 외부 평점 관측은 와인 카드 수와 다르다. 현재 스냅샷을 범위별로 보존하면 **11건**이다.
2. 구매 12병은 누적 구매 수다. 소비·잔여 수량 정보가 없으므로 현재 보유량은 미확인이다.
3. 영수증 합계 자체의 CHECK만으로는 자식 항목 합계가 보장되지 않는다. DB 수준 원자 저장·대조가 필요하다.
4. 마지막 관리자 보호, 초대 상태, 이관 행별 연결, 업로드 처리에는 추가 구현이 필요하다.
5. 기본 영수증 이미지 업로드와 PWA 메타데이터는 제공된 프롬프트에 따라 MVP에 포함한다. 고급 편집·오프라인 수정은 제외한다.
