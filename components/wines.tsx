/* Private images must bypass a shared image optimizer/cache. */
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { visibleDescription } from "@/lib/wine-description";
import {
  Wine as WineIcon,
  Plus,
  Search,
  Star,
  ArrowUpRight,
  SlidersHorizontal,
} from "lucide-react";
import {
  filteredWines,
  ratingMinimum,
  wineSummary,
  wineTypes,
  grapeNames,
  won,
  type Collection,
  type Filters,
  type Wine,
} from "@/lib/domain";
import { countryFlag } from "@/lib/country-flag";
import { WineSort } from "./wine-sort";
import { RatingFilter } from "./rating-filter";
import { Button } from "./ui/button";
export function Bottle({ type = "white" }: { type?: string }) {
  return (
    <div className={`bottle-art ${type}`} aria-hidden="true">
      <div className="bottle-neck" />
      <div className="bottle-body">
        <div className="bottle-label">
          <span>MW</span>
          <i>
            PRIVATE
            <br />
            SELECTION
          </i>
        </div>
      </div>
      <div className="bottle-shadow" />
    </div>
  );
}
function WineCover({
  wine,
  assets,
}: {
  wine: Wine;
  assets: Collection["assets"];
}) {
  const photo = assets.find((asset) => asset.wine_id === wine.id);
  return photo ? (
    <img
      className="wine-photo"
      src={`/api/media/${photo.id}`}
      alt={wine.name_ko}
    />
  ) : (
    <Bottle type={wine.wine_type} />
  );
}
export function WineList({
  data,
  filters = {},
  demo = false,
}: {
  data: Collection;
  filters?: Filters;
  demo?: boolean;
}) {
  const cards = filteredWines(data, filters),
    countries = [
      ...new Set(data.wines.map((w) => w.country).filter(Boolean)),
    ] as string[],
    regions = [
      ...new Set(data.wines.map((w) => w.region).filter(Boolean)),
    ] as string[],
    grapes = [
      ...new Map(
        data.wines
          .flatMap((wine) => grapeNames(wine.grape))
          .map((grape) => [grape.toLowerCase(), grape]),
      ).values(),
    ].sort((a, b) => a.localeCompare(b, "ko"));
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">MY PRIVATE COLLECTION</p>
          <h1>
            내 와인 컬렉션<span className="count">{data.wines.length}</span>
          </h1>
          <p className="subtitle">
            취향을 발견하고, 한 병의 기억을 남겨보세요.
          </p>
        </div>
        {!demo && (
          <Button asChild>
            <Link href="/wines/new">
              <Plus size={18} />
              와인 등록
            </Link>
          </Button>
        )}
      </div>
      <div className="stats-strip">
        <div>
          <span>함께한 와인</span>
          <strong>
            {data.wines.length}
            <small>종</small>
          </strong>
        </div>
        <div>
          <span>누적 구매</span>
          <strong>
            {data.links.reduce((s, l) => s + l.bottle_quantity, 0)}
            <small>병</small>
          </strong>
        </div>
        <div>
          <span>나의 시음 노트</span>
          <strong>
            {data.notes.length}
            <small>개</small>
          </strong>
        </div>
        <div>
          <span>현재 보유</span>
          <strong className="unknown">미확인</strong>
        </div>
      </div>
      <form
        key={JSON.stringify({ ...filters, sort: undefined })}
        className="filters"
        action={demo ? "/demo" : "/wines"}
      >
        <div className="search-field">
          <Search size={19} />
          <input
            name="q"
            aria-label="와인 검색"
            placeholder="와인 이름, 생산지, 품종 검색"
            defaultValue={filters.q}
          />
        </div>
        <div className="filter-row">
          <SlidersHorizontal size={18} />
          <select
            aria-label="품종"
            name="grape"
            defaultValue={filters.grape ?? ""}
          >
            <option value="">모든 품종</option>
            {grapes.map((grape) => (
              <option key={grape} value={grape}>
                {grape}
              </option>
            ))}
          </select>
          <select
            aria-label="와인 종류"
            name="type"
            defaultValue={filters.type?.[0] ?? ""}
          >
            <option value="">모든 종류</option>
            {Object.entries(wineTypes).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select
            aria-label="국가"
            name="country"
            defaultValue={filters.country ?? ""}
          >
            <option value="">모든 국가</option>
            {countries.map((c) => (
              <option key={c} value={c}>
                {countryFlag(c)} {c}
              </option>
            ))}
          </select>
          <select
            aria-label="지역"
            name="region"
            defaultValue={filters.region ?? ""}
          >
            <option value="">모든 지역</option>
            {regions.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <RatingFilter
            name="vivinoMin"
            label="Vivino 평점"
            initial={ratingMinimum(filters.vivinoMin)}
          />
          <RatingFilter
            name="myMin"
            label="내 평점"
            initial={ratingMinimum(filters.myMin)}
          />
          <Button variant="outline" type="submit">
            적용
          </Button>
          <Link className="reset-link" href={demo ? "/demo" : "/wines"}>
            초기화
          </Link>
        </div>
        <div className="result-bar">
          <span>
            와인 <strong>{cards.length}</strong>종
          </span>
          <WineSort
            key={filters.sort ?? "latest"}
            sort={filters.sort ?? "latest"}
          />
        </div>
      </form>
      {cards.length ? (
        <ul className="wine-list" aria-label="와인 목록">
          {cards.map((s) => (
            <li key={s.wine.id}>
              <Link
                className="wine-card"
                href={demo ? `/demo?wine=${s.wine.id}` : `/wines/${s.wine.id}`}
              >
                <div className={`wine-visual ${s.wine.wine_type}`}>
                  <WineCover wine={s.wine} assets={data.assets} />
                </div>
                <div className="wine-card-content">
                  <div className="wine-card-info">
                    <p className="wine-kind">{wineTypes[s.wine.wine_type]}</p>
                    {s.wine.producer && (
                      <p className="wine-producer">{s.wine.producer}</p>
                    )}
                    <h2>{s.wine.name_ko}</h2>
                    {s.wine.name_original?.trim() &&
                      s.wine.name_original !== s.wine.name_ko && (
                        <p className="wine-original">{s.wine.name_original}</p>
                      )}
                    <p className="origin">
                      <span aria-hidden="true">
                        {countryFlag(s.wine.country)}{" "}
                      </span>
                      {[s.wine.country, s.wine.region]
                        .filter(Boolean)
                        .join(" · ") || "생산지 미확인"}
                    </p>
                    <div className="wine-personal">
                      <span className="my-rating">
                        <Star size={14} aria-hidden="true" />내 평점{" "}
                        <strong>{s.myRating?.toFixed(1) ?? "—"}</strong>
                      </span>
                    </div>
                    <div className="wine-external-rating">
                      <span className="metric-label">
                        {demo ? "예시 점수" : "Vivino 기록"}
                      </span>
                      <div className="rating-value">
                        <strong>{s.rating?.score?.toFixed(1) ?? "—"}</strong>
                        {s.rating?.score != null && (
                          <span className="rating-stars" aria-hidden="true">
                            <span>★★★★★</span>
                            <span
                              className="rating-stars-fill"
                              style={{
                                width: `${(s.rating.score / 5) * 100}%`,
                              }}
                            >
                              ★★★★★
                            </span>
                          </span>
                        )}
                      </div>
                      <p className="rating-date">
                        {s.rating?.checked_on
                          ? `${s.rating.checked_on} 확인`
                          : "외부 평점 미등록"}
                        {s.rating?.verification_status === "needs_review" && (
                          <span className="rating-warning">매칭 확인 필요</span>
                        )}
                      </p>
                    </div>
                    {s.tastingNote && (
                      <p className="wine-tasting-note">
                        <strong>시음 노트</strong> {s.tastingNote}
                      </p>
                    )}
                  </div>
                  <div className="wine-card-metrics">
                    <div className="wine-purchases">
                      <span className="metric-label">구매 기록</span>
                      <strong>
                        {s.receipts.length}회 · {s.bottles}병
                      </strong>
                    </div>
                    <div className="wine-price">
                      <span className="metric-label">최근 구매 단가</span>
                      <strong>{won(s.price)}</strong>
                    </div>
                  </div>
                </div>
                <ArrowUpRight
                  className="card-open"
                  size={18}
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty-state">
          <WineIcon size={36} />
          <h2>
            {data.wines.length
              ? "검색 결과가 없습니다"
              : "첫 와인을 기록해 보세요"}
          </h2>
          <p>
            {data.wines.length
              ? "검색어와 필터를 바꿔보세요."
              : "와인을 등록하고 구매와 시음을 함께 남길 수 있습니다."}
          </p>
        </div>
      )}
    </>
  );
}
export function WineDetail({
  data,
  id,
  demo = false,
  children,
}: {
  data: Collection;
  id: string;
  demo?: boolean;
  children?: React.ReactNode;
}) {
  const wine = data.wines.find((w) => w.id === id);
  if (!wine) return null;
  const s = wineSummary(wine, data);
  return (
    <>
      <Link className="back-link" href={demo ? "/demo" : "/wines"}>
        ← 내 와인
      </Link>
      <div className="detail-hero">
        <div className={`detail-bottle ${wine.wine_type}`}>
          <WineCover wine={wine} assets={data.assets} />
        </div>
        <div>
          <p className="eyebrow">
            {wineTypes[wine.wine_type]} ·{" "}
            <span aria-hidden="true">{countryFlag(wine.country)} </span>
            {wine.country ?? "생산지 미확인"}
          </p>
          <h1>{wine.name_ko}</h1>
          <p className="subtitle">
            {[wine.producer, wine.region, wine.grape]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <div className="detail-numbers">
            <div>
              <span>구매</span>
              <strong>
                {s.receipts.length}회 · {s.bottles}병
              </strong>
            </div>
            <div>
              <span>최근 단가</span>
              <strong>{won(s.price)}</strong>
            </div>
            <div>
              <span>내 평점</span>
              <strong>{s.myRating?.toFixed(1) ?? "평점 없음"}</strong>
            </div>
          </div>
          <p>현재 보유량 미확인</p>
          {visibleDescription(wine.description) && (
            <p className="subtitle">{visibleDescription(wine.description)}</p>
          )}
          {!demo && (
            <Button asChild>
              <Link href={`/purchases/new?wine=${id}`}>
                <Plus size={18} />
                구매 기록 추가
              </Link>
            </Button>
          )}
        </div>
      </div>
      <section className="panel">
        <h2>외부 평점 기록</h2>
        {data.ratings
          .filter((r) => r.wine_id === id)
          .map((r) => (
            <div className="record-row" key={r.id}>
              <div>
                <strong>★ {r.score?.toFixed(1) ?? "미확인"}</strong>
                <p>
                  {r.checked_on ?? "확인일 미상"} ·{" "}
                  {r.verification_status === "needs_review"
                    ? "매칭 확인 필요"
                    : r.verification_status === "verified"
                      ? "매칭 확인됨"
                      : "매칭 미검증"}
                </p>
              </div>
              {!demo && (
                <a
                  className="text-link"
                  href={r.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Vivino에서 보기 ↗
                </a>
              )}
            </div>
          ))}
        {!data.ratings.some((r) => r.wine_id === id) && (
          <p className="muted">등록된 외부 평점이 없습니다.</p>
        )}
      </section>
      <section className="panel">
        <h2>구매 기록</h2>
        {s.receipts.map((r) => (
          <div className="record-row" key={r.id}>
            <div>
              <strong>{r.purchased_on}</strong>
              {s.links
                .filter((l) =>
                  data.lines.some(
                    (x) => x.id === l.receipt_line_id && x.receipt_id === r.id,
                  ),
                )
                .map((l) => (
                  <p key={l.id}>
                    {l.bottle_quantity}병 ·{" "}
                    {l.allocated_amount === null
                      ? "세트 · 병별 가격 미확인"
                      : won(l.allocated_amount)}
                  </p>
                ))}
            </div>
            <Link
              className="text-link"
              href={demo ? "/demo?view=purchases" : `/purchases/${r.id}`}
            >
              영수증 보기 →
            </Link>
          </div>
        ))}
        {!s.receipts.length && <p className="muted">구매 기록이 없습니다.</p>}
      </section>
      {children}
    </>
  );
}
