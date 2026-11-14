/* Private images must bypass a shared image optimizer/cache. */
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import {
  Wine as WineIcon,
  Plus,
  Search,
  Grape,
  MapPin,
  CalendarDays,
  ShoppingCart,
  SlidersHorizontal,
} from "lucide-react";
import {
  filteredWines,
  wineSummary,
  wineTypes,
  won,
  vintageLabel,
  type Collection,
  type Filters,
} from "@/lib/domain";
import { Button } from "./ui/button";
const countryFlags: Record<string, string> = {
  뉴질랜드: "🇳🇿",
  프랑스: "🇫🇷",
  이탈리아: "🇮🇹",
  스페인: "🇪🇸",
  미국: "🇺🇸",
  호주: "🇦🇺",
  칠레: "🇨🇱",
  아르헨티나: "🇦🇷",
  독일: "🇩🇪",
  포르투갈: "🇵🇹",
  남아프리카공화국: "🇿🇦",
  한국: "🇰🇷",
};
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
    ] as string[];
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
        key={JSON.stringify(filters)}
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
              <option key={c}>{c}</option>
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
          <label className="filter-check">
            <input
              type="checkbox"
              name="vivinoMin"
              value="4"
              defaultChecked={!!filters.vivinoMin}
            />
            Vivino 4.0+
          </label>
          <label className="filter-check">
            <input
              type="checkbox"
              name="myMin"
              value="4"
              defaultChecked={!!filters.myMin}
            />
            내 평점 4.0+
          </label>
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
          <select
            aria-label="정렬"
            name="sort"
            defaultValue={filters.sort ?? "latest"}
          >
            <option value="latest">최근 구매순</option>
            <option value="name">이름순</option>
            <option value="vivino">Vivino 높은순</option>
            <option value="mine">내 평점 높은순</option>
            <option value="priceAsc">최근 단가 낮은순</option>
            <option value="priceDesc">최근 단가 높은순</option>
          </select>
        </div>
      </form>
      {cards.length ? (
        <ul className="wine-list" aria-label="와인 목록">
          {cards.map((summary, index) => {
            const { wine, rating, myRating, receipts, bottles, price, latest } =
              summary;
            const cover = data.assets.find(
              (asset) => asset.wine_id === wine.id,
            );
            const region = [wine.country, wine.region]
              .filter(Boolean)
              .join(" · ");
            const flag = countryFlags[wine.country ?? ""];
            return (
              <li key={wine.id}>
                <Link
                  className="wine-card"
                  href={demo ? `/demo?wine=${wine.id}` : `/wines/${wine.id}`}
                >
                  <div className={`wine-visual ${wine.wine_type}`}>
                    {cover ? (
                      <img
                        className="wine-photo"
                        src={`/api/media/${cover.id}`}
                        alt=""
                        loading={index === 0 ? "eager" : "lazy"}
                      />
                    ) : (
                      <div className="cellar-label" aria-hidden="true">
                        <Grape strokeWidth={1.15} />
                        <strong>{wine.name_original || wine.name_ko}</strong>
                        <span>{wine.grape || wineTypes[wine.wine_type]}</span>
                      </div>
                    )}
                  </div>
                  <div className="wine-card-content">
                    <div className="wine-card-heading">
                      <div>
                        <h2>{wine.name_ko}</h2>
                        {(wine.name_original || wine.producer) && (
                          <p>
                            {[wine.name_original, wine.producer]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        )}
                      </div>
                      {rating && (
                        <span className="wine-source">
                          <Grape size={16} aria-hidden="true" />
                          {demo ? "예시 기록" : "Vivino 기록"}
                        </span>
                      )}
                    </div>
                    <p className="wine-origin">
                      {flag ? (
                        <span aria-hidden="true">{flag}</span>
                      ) : (
                        <MapPin size={16} aria-hidden="true" />
                      )}
                      {region || "생산지 미확인"}
                      <span className="wine-type-name">
                        {wineTypes[wine.wine_type]}
                      </span>
                    </p>
                    <dl className="wine-card-metrics">
                      <div className="wine-external-rating">
                        <dt>{demo ? "예시 평점" : "Vivino 평점"}</dt>
                        <dd>
                          <strong>{rating?.score?.toFixed(1) ?? "—"}</strong>
                          {rating?.score != null && (
                            <span className="rating-stars" aria-hidden="true">
                              ★★★★★
                              <span style={{ width: `${rating.score * 20}%` }}>
                                ★★★★★
                              </span>
                            </span>
                          )}
                        </dd>
                        {rating?.checked_on && (
                          <small>평점 확인 {rating.checked_on}</small>
                        )}
                        {rating?.verification_status === "needs_review" && (
                          <small className="rating-warning">
                            매칭 확인 필요
                          </small>
                        )}
                      </div>
                      <div>
                        <dt>내 평점</dt>
                        <dd className="wine-accent">
                          {myRating?.toFixed(1) ?? "—"}
                        </dd>
                      </div>
                      <div>
                        <dt>구매 횟수</dt>
                        <dd>{receipts.length}회</dd>
                      </div>
                      <div>
                        <dt>구매 수량</dt>
                        <dd>{bottles}병</dd>
                      </div>
                    </dl>
                    <div className="wine-card-footer">
                      <span>
                        <ShoppingCart size={17} aria-hidden="true" />
                        최근 구매 단가{" "}
                        <strong className="wine-accent">{won(price)}</strong>
                      </span>
                      <span>
                        <CalendarDays size={17} aria-hidden="true" />
                        최근 구매일 <b>{latest ?? "—"}</b>
                      </span>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
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
          <Bottle type={wine.wine_type} />
        </div>
        <div>
          <p className="eyebrow">
            {wineTypes[wine.wine_type]} · {wine.country ?? "생산지 미확인"}
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
          {wine.description && <p className="subtitle">{wine.description}</p>}
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
                  {r.rating_scope === "ALL_VINTAGES"
                    ? "전체 빈티지"
                    : vintageLabel(r.vintage_label)}{" "}
                  ·{" "}
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
                    {vintageLabel(l.vintage_label)} · {l.bottle_quantity}병 ·{" "}
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
