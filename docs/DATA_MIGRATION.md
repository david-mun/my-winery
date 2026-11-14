# 데이터 계약·최초 이관 명세

2026-11-03 갱신 · 원본 `data/`는 수정하지 않는다. CSV 검사기와 `scripts/import-snapshot.ts`의 dry-run/apply/verify를 구현했고 로컬 DB에서 반복 실행·충돌·rollback을 검증했다. 실제 원격 이관은 미실행이다. 실제 명령과 옵션은 [SETUP.md](SETUP.md), 검증 범위는 [TEST_REPORT.md](TEST_REPORT.md)를 기준으로 한다. 아래는 이관 데이터 계약이다.

## 1. 입력과 기대 산출물

UTF-8 BOM을 처리해 CSV를 읽고, 공란은 0이 아니라 NULL로 변환한다. 원본 행 번호·원문·URL을 추적 가능하게 보존한다. 온라인 시트를 다시 읽거나 사진을 다운로드할 필요가 없다.

| 산출물 | 기대 개수/금액 | 근거 |
|---|---:|---|
| 개인 와인 | 10 | 원본 정확한 이름 기준, 이관용 명시적 매핑 |
| 구매처 | 1 | 새마을구판장 (자양동) |
| 영수증 | 2 | 각 날짜에 영수증 1건인 이번 스냅샷에 한함 |
| 상품/묶음 줄 | 11 | 9월 일반 4+묶음 1, 10월 일반 6 |
| 할인 줄 | 1 | 10월 -18,000원 |
| 와인 연결 | 12행/12병 | 각 원본 행 1병 |
| 외부 평점 | 11 | 러시안 잭 동일 관측 중복만 제거; 조지 미쉘 범위 2개 보존 |
| 개인 후기 | 5 | 원본 6·8·10·14·16행에 점수, 16행 본문 없음 |
| 미디어 | 0 | 원본 이미지 미제공 |
| 결제 합계 | 293,900원 | 143,500 + 150,400 |

외부 평점 중복 키는 와인·출처·평점 범위·범위의 빈티지·확인일·URL·점수다. 러시안 잭 6/7행은 구매 빈티지는 달라도 평점 범위가 동일하므로 1관측에 연결한다. 조지 미쉘 16행은 전체 빈티지, 17행은 2025이므로 2관측이다. 와인 카드 수에 맞춰 관측을 강제로 10건으로 줄이지 않는다. 원본 행 각각에서 산출된 여러 엔터티 ID를 추적해야 한다.

## 2. 필드 정규화

| 원본 | 대상/규칙 |
|---|---|
| `wine_name` | `wines.name_ko`; 초기 10종 별도 매핑 키로 identity 고정 |
| `wine_type` | `wine_type`, `grape`; 스파클링 화이트는 sparkling; 크레망은 품종으로 단정하지 않고 설명에 보존 |
| `region` | 첫 구간 country, 나머지 region; 원문도 이관 감사에 보존 |
| `purchase_place` | 구매처 참조; 확인되지 않은 주소 추가 금지 |
| `unit_price_krw` | 일반 항목 1병의 줄 금액·allocated_amount; 빈칸은 묶음으로 연결 |
| `vintage` | `미표기`→UNKNOWN, NV→NV, 연도 그대로; 와인 identity에서 제외 |
| `vivino_rating_scope` | 전체 빈티지→ALL_VINTAGES/UNKNOWN, 연도→VINTAGE/해당 연도, NV→NV/NV |
| `vivino_rating_out_of_5` | score, checked_on=2026-10-11; 구매 빈티지로 평점 범위를 추정하지 않음 |
| `vivino_url` | 원본 URL 보존; 검증 상태는 조지 미쉘 needs_review, 나머지는 이번에 재검증하지 않았으므로 unverified |
| `notes`, `receipt_product_name` | 원문 보존; 필요한 항목 메모/외부 평점 메모에 연결 |
| `my_rating_out_of_5`, `my_review` | 둘 중 하나가 있을 때 후기 1건, tasted_on=NULL, 구매 행 빈티지 보존 |

외부 평점 원본 중복에 붙은 서로 다른 메모도 source row 연결을 통해 보존한다. `created_at`은 실제 이관 시각이며 역사적 시음일이 아니다. 원본의 링크가 있어도 검증 완료 상태를 자동 부여하지 않는다.

## 3. 금액 모델과 불변식

영수증 헤더는 항목의 집계이며 별도 추가 지출이 아니다. discount는 헤더에서 양수, 줄에서는 음수다.

```text
gross_items_amount = SUM(line_amount WHERE line_kind='wine')
bundle_amount      = SUM(line_amount WHERE line_kind='bundle')
discount_amount    = -SUM(line_amount WHERE line_kind='discount')
adjustment_amount  = SUM(line_amount WHERE line_kind IN ('fee','other'))
paid_amount        = gross_items_amount + bundle_amount - discount_amount + adjustment_amount
                   = SUM(모든 line_amount)
```

MVP 입력에서는 fee/other를 비활성화하고 adjustment=0으로 제한한다. 오차를 맞추기 위해 자동 조정액을 만들지 않는다. 결제액과 항목합이 다르면 차액을 보여주고 저장을 거부한다.

| 영수증 | 일반 항목 | 묶음 | 할인(양수) | 조정 | 결제 |
|---|---:|---:|---:|---:|---:|
| 2026-09-13 | 103,600 | 39,900 | 0 | 0 | 143,500 |
| 2026-10-10 | 168,400 | 0 | 18,000 | 0 | 150,400 |

9월의 원본 6행과 16행은 **같은 묶음 줄 1개**를 가리키며 각 `bottle_quantity=1`, `allocated_amount=NULL`이다. 일반 항목의 allocated_amount는 해당 연결의 **총액**으로 정의한다(여러 병이면 단가가 아님). 10월 일반 항목 가격은 할인 전 금액이다. 줄 합계에 이미 -18,000원이 있으면 다시 할인하지 않는다. discount 줄에는 와인 연결을 허용하지 않는다.

## 4. 식별과 반복 실행

- 와인: 이관용 10종 매핑표에서 안정적인 identity를 부여한다. 신규 사용자 입력에서는 이름으로 자동 병합하지 않고 기존 후보 선택/새 와인 생성을 구분한다.
- 영수증: `source_file_id + receipt_totals.csv + 고정 스냅샷 데이터 행 번호(1/2)`를 키로 쓴다. CSV에는 시트 원본 행 번호가 없으므로 이를 추정해서 기록하지 않는다. 날짜만으로 일반 구매를 식별하지 않는다. 이 매핑은 고정 스냅샷 전용이며 새 파일의 행 재정렬은 자동 재이관 대상이 아니다.
- 원본 구매행: `source_file_id + tab + source_row`를 안정 키로 하고 정규화한 원본 내용의 checksum을 별도로 저장한다.
- 배치 checksum: 고정된 파일 순서와 파일명·바이트를 포함해 계산한다. 같은 owner+source+checksum은 재적재 없이 verify한다.
- 같은 안정 키의 원본 내용이 달라지면 자동 덮어쓰기하지 않고 충돌로 중단한다. 기존 UI 편집 자료도 이관 재실행으로 덮어쓰지 않는다. 변경 스냅샷 재이관은 별도 diff·승인 절차다.
- 원본 행→와인/항목/평점/후기의 다중 연결을 저장할 별도 매핑이 필요하다. 현재 `import_rows.target_id` 하나만으로는 부족하다.
- 동일 owner/source의 동시 이관을 잠금과 유니크 제약으로 직렬화한다. DB 쓰기는 배치 전체 트랜잭션으로 묶고, 실패 보고는 롤백 후 따로 남긴다.

## 5. 예정 실행 계약

1. 기본 실행/`--dry-run`: 자격증명 없이 파일 파싱, 정규화, 10종/12병/2건/금액/평점/후기 검증. DB 접속·파일 업로드 없음.
2. `--apply --owner <UUID>`: 명시한 대상 프로젝트와 최초 관리자 UUID를 검증한다. 이메일·첫 번째 사용자로 추정하지 않는다. 로컬/승인된 환경에서만 실행한다.
3. `--verify --owner <UUID>`: 읽기 전용으로 해당 이관 source key의 레코드·링크·합계·NULL을 대조한다. 사용자가 이후 입력한 다른 구매를 전체 이관 합계에 섞지 않는다.
4. 성공 보고: 생성/기존/충돌 수, 항목별 대조, 이미지 0건, 링크 확인 필요 목록. 개인 후기 전문·키는 콘솔에 출력하지 않는다.
5. 검증 실패는 non-zero 종료. 일부 성공을 전체 성공으로 보고하지 않는다.

현재 validator는 CSV 개수·금액·URL 접두어 등을 검증한다. DB FK/RLS, 평점 11건, 후기 5건, rollback, idempotency는 검사하지 않는다. 후속 이관 테스트로 별도 구현해야 한다.
