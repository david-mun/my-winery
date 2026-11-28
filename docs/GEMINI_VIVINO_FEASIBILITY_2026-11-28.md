# Gemini Vivino 조회 조사 — 2026-11-28

결론: **공개 Vivino URL에서 평점 추출은 실제 성공했다. 와인명으로 URL을 찾는 Google 검색 단계는 현재 키의 429로 검증 미완료다.** 별도 와인 API 없이 보조 입력을 구성할 가능성은 있지만 사진→검색→저장 통합 성공을 확인한 것은 아니다.

현재 `lib/analysis/gemini.ts`는 검색 도구 없이 사진과 JSON 스키마를 보내며 외부 점수·링크 생성을 금지한다. 계약에도 이 필드가 없다. 프롬프트 변경만으로 기억에 의존한 평점을 추가해서는 안 된다.

## 공급자 실호출 4회

기본 모델 `gemini-3.1-flash-lite`와 로컬 키를 사용했다. 키를 출력하지 않았고 사진·영수증·소유자 정보는 전송하지 않았다. 검색에는 기존 사진 분석 문서의 공개 상품명 Marlborough Sun Sauvignon Blanc, Antinori Peppoli Chianti Classico, Georges Michel Sauvignon Blanc를 사용했다.

| 요청 | HTTP / 시간 | 결과 |
|---|---|---|
| Google Search + 작은 JSON 스키마 | 429 / 약 0.3초 | 한도·결제 상태 확인 메시지 |
| Google Search, 스키마 없음 | 429 / 약 0.3초 | 같은 오류 |
| 검색 없는 `OK` 대조 요청 | 200 / 약 1.1초 | OK, STOP |
| 공개 Vivino URL + URL Context | 200 / 약 2.1초 | 상품명과 평균 평점 3.9, STOP |

URL Context에는 별도 웹 검색으로 확보한 [Georges Michel Golden Mile Sauvignon Blanc](https://www.vivino.com/en/georges-michel-golden-mile-sauvignon-blanc/w/1240182) 링크를 제공했다. Gemini가 스스로 찾은 링크가 아니다. 응답의 `urlContextMetadata`에 `URL_RETRIEVAL_STATUS_SUCCESS`가 있었고 `groundingSupports`가 상품명과 평점 모두를 같은 Vivino 페이지에 연결했다. 별도 웹 열람에서도 같은 상품과 3.9가 보였다. 전체/연도별 평점 범위는 검증하지 않아 UNKNOWN으로 취급한다. 한 상품의 단일 성공 표본으로 전체 커버리지·최신성을 보장하지 않는다.

일반 호출·URL Context는 성공하고 검색 요청만 429였다. 세부 quota 지표가 없어 정확한 원인을 확정하지 않는다. 검색 사용 권한·한도·결제 상태 확인이 필요하다. 공식 모델 문서는 Search·URL Context 지원을 명시하고 Search는 무료 티어에서 제공되지 않는다고 안내한다. 현재 키의 결제 상태를 조회하거나 변경하지 않았다. 검색+JSON 스키마 조합은 429 때문에 실검증하지 못했다.

## 제안과 한계

기존 사진 식별 → 별도 서버의 공개 Vivino 후보 검색 → URL Context로 상품 동일성·평균 점수·평점 범위와 출처 확인 → 사용자 검수 순서가 적합하다. 기존 링크가 있으면 검색은 생략할 수 있다. 다른 제품/빈티지/개별 리뷰 점수를 평균으로 쓰지 않고 실패·모호함은 NULL과 수동 링크 입력으로 처리한다.

공개 자료의 보조 입력이라면 별도 와인 API를 필수로 두지 않을 수 있다. 전체 와인 커버리지·실시간 동기화·전용 API 수준의 안정성은 보장할 수 없다. Google 검색/모델 비용은 별도이며 구현 시 검색 출처·Search Suggestions 표시 요건을 적용한다. 보호 페이지 차단 우회·비공개 API 수집은 제안하지 않는다.

근거: [모델 기능·가격](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite), [Search grounding](https://ai.google.dev/gemini-api/docs/google-search), [URL Context](https://ai.google.dev/gemini-api/docs/url-context), [Structured outputs with tools](https://ai.google.dev/gemini-api/docs/structured-output#tools).

검증은 위 공급자 요청과 공개 웹 검색·열람이다. 새 이미지 식별·앱 통합·저장은 시험하지 않았다. 문서만 변경해 lint/typecheck/단위/E2E/build는 실행하지 않았다. 앱·원본 스냅샷·DB·배포·결제 설정은 변경하지 않았다. 임시 실험 스크립트와 성공 응답은 `/private/tmp`에 두었으며 저장소에 포함하지 않는다.


## 후속: 검색 없이 프롬프트 + URL 스키마 실험

사용자 후속 요청으로 같은 세 상품명을 검색/URL Context 도구 없이 `vivino_url`·`vivino_rating`을 포함한 작은 JSON 스키마로 요청했다. 기존 지식에서 아는 값만 반환하고 ID를 지어내지 말며 미확인은 null로 하도록 지시했다. 새 사진/정답 URL은 제공하지 않았다. 공급자 1회 호출은 HTTP 200·STOP, 약 1.8초, JSON 파싱 성공이었다. 검색·페이지 조회 메타데이터는 없었다.

| 입력 | Gemini URL | 평점 후보 | 일반 HTTP 리디렉션·페이지 제목 확인 |
|---|---|---|---|
| Marlborough Sun Sauvignon Blanc | `https://www.vivino.com/wines/1569106` | 3.7 | HTTP 200이나 Roberto Sarotto Mevita Villa Aurora Bianco **2003**으로 연결, 다른 상품 |
| Antinori Peppoli Chianti Classico | `https://www.vivino.com/wines/113840` | 3.8 | HTTP 200이나 Alfona Ebenhaéser Cabernet Sauvignon **2004**로 연결, 다른 상품 |
| Georges Michel Sauvignon Blanc | null | null | 모델이 확신 부족으로 생략 |

첫 URL의 최종 주소는 `https://www.vivino.com/en/roberto-sarotto-mevita-villa-aurora-bianco/w/1208842?year=2003`, 두 번째는 `https://www.vivino.com/en/alfona-ebenhaeser-cabernet-sauvignon/w/94531?year=2004`였다. 일반 curl 요청의 리디렉션과 HTML title로 확인했으며 차단 우회는 하지 않았다. 웹 열람 도구는 원본 두 URL을 열지 못했으므로 이 도구의 실패를 404로 해석하지 않았다.

대조용 별도 웹 검색·열람에서는 [Marlborough Sun](https://www.vivino.com/en/marlborough-sun-sauvignon-blanc-marlborough/w/1624286)와 [Antinori Pèppoli](https://www.vivino.com/en/antinori-tuscany-peppoli-chianti-classico/w/1655)를 확인했다. 이 정답 링크는 공급자 요청 후에 확인했으며 Gemini의 성공으로 계산하지 않는다. 모델의 평점 후보는 출처가 없어 채택하지 않는다. 검색 도구가 없는데도 한 응답의 설명에는 ‘검색된 제품명’이 들어가 조회했다는 주장도 신뢰할 수 없었다.

이번 단일 표본에서는 반환 URL **2개 중 2개가 상품 불일치**, 한 항목은 null이었다. JSON 스키마와 ‘지어내지 말라’는 지시만으로 실제 상품 URL을 보장할 수 없다. URL 후보를 활용하더라도 페이지 조회 성공뿐 아니라 상품 동일성을 검증해야 한다. 프롬프트/스키마만으로 자동 등록할 수준의 검증을 통과하지 못했다. 공급자 1회·일반 HTTP 링크 확인 2회·별도 웹 대조를 실행했고 문서만 수정했다. 앱 테스트는 추가 실행하지 않았다.
