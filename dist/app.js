(() => {
  "use strict";

  const data = window.MARKET_DATA;
  if (!data || !Array.isArray(data.products)) throw new Error("가격 데이터 형식이 올바르지 않습니다.");

  const $ = (selector) => document.querySelector(selector);
  const refs = {
    headerSnapshot: $("#headerSnapshot"),
    brandSubtitle: $("#brandSubtitle"),
    pageTitle: $("#pageTitle"),
    heroSummary: $("#heroSummary"),
    winCount: $("#winCount"),
    totalCount: $("#totalCount"),
    overviewEyebrow: $("#overviewEyebrow"),
    minAdvantage: $("#minAdvantage"),
    sellerCount: $("#sellerCount"),
    productGrid: $("#productGrid"),
    productMeta: $("#productMeta"),
    referenceCount: $("#referenceCount"),
    priceSignal: $("#priceSignal"),
    offerRows: $("#offerRows"),
    evidenceDialog: $("#evidenceDialog"),
    evidenceTitle: $("#evidenceTitle"),
    evidenceContent: $("#evidenceContent"),
    sourceLink: $("#sourceLink"),
    methodDialog: $("#methodDialog"),
    exportExcel: $("#exportExcel")
  };

  if (!data.products.length) {
    refs.totalCount.textContent = "0";
    refs.winCount.textContent = "0";
    refs.overviewEyebrow.textContent = "0 MTM OVERVIEW";
    refs.pageTitle.innerHTML = '등록 상품<br /><em>없음.</em>';
    refs.heroSummary.textContent = "관리 화면에서 활성 상품을 등록하면 이 브랜드 대시보드가 자동으로 채워집니다.";
    refs.productGrid.innerHTML = '<div class="empty-state">현재 활성화된 상품이 없습니다.</div>';
    refs.priceSignal.innerHTML = '<div class="signal signal--reference"><span class="signal__copy"><span class="signal__icon">i</span><span><strong>비교할 상품이 없습니다.</strong><span>상품을 등록하고 다음 수집을 완료하면 가격 비교가 시작됩니다.</span></span></span></div>';
    refs.exportExcel.disabled = true;
    return;
  }

  const hashMtm = decodeURIComponent(location.hash.replace(/^#/, ""));
  let activeMtm = data.products.some((product) => product.mtm === hashMtm)
    ? hashMtm
    : data.products[0].mtm;
  let activeView = "current";

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'\"]/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
    })[char]);
  }

  function safeUrl(value) {
    try {
      const parsed = new URL(String(value || ""));
      return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "#";
    } catch {
      return "#";
    }
  }

  function formatWon(value) {
    return Number.isFinite(value) ? `${Math.round(value).toLocaleString("ko-KR")}원` : "—";
  }

  function discountText(value) {
    if (value === null || value === undefined) return '<span class="unknown">미확인</span>';
    if (value === 0) return '<span class="unknown">없음</span>';
    return `−${value.toLocaleString("ko-KR")}원`;
  }

  function cardDiscountText(offer) {
    if (offer?.cardBenefitStatus === "none") return "0원";
    return discountText(offer?.cardDiscount);
  }

  function formatDiff(value) {
    if (!Number.isFinite(value)) return "—";
    if (value === 0) return "동일";
    return `${value > 0 ? "+" : "−"}${Math.abs(value).toLocaleString("ko-KR")}원`;
  }

  function priceBreakdown(offer) {
    const srp = Number.isFinite(offer?.srp) ? offer.srp : null;
    const basisPrice = Number.isFinite(offer?.observedListPrice) ? offer.observedListPrice : null;
    const preCardPrice = Number.isFinite(offer?.preCardPrice)
      ? offer.preCardPrice
      : Number.isFinite(offer?.finalPrice) && Number.isFinite(offer?.cardDiscount)
        ? offer.finalPrice + offer.cardDiscount
        : offer?.finalPrice;
    const matchingDifference = Number.isFinite(srp) && Number.isFinite(basisPrice)
      ? basisPrice - srp : null;
    const shipping = Number.isFinite(offer?.shipping) ? offer.shipping : 0;
    const preCardItemPrice = Number.isFinite(preCardPrice) ? preCardPrice - shipping : null;
    const couponDiscount = Number.isFinite(basisPrice) && Number.isFinite(preCardItemPrice) && basisPrice >= preCardItemPrice
      ? basisPrice - preCardItemPrice
      : Number.isFinite(offer?.couponDiscount) ? offer.couponDiscount : null;
    return { srp, basisPrice, preCardPrice, matchingDifference, couponDiscount };
  }

  function checkoutDiscounts(offer, couponTotal) {
    const regular = Number.isFinite(offer?.checkoutCouponDiscount) ? offer.checkoutCouponDiscount : null;
    const instant = Number.isFinite(offer?.wowInstantDiscount) ? offer.wowInstantDiscount : null;
    const coupon = Number.isFinite(offer?.wowCouponDiscount) ? offer.wowCouponDiscount : null;
    const fieldStatus = offer?.checkoutDiscountFieldStatus || {};
    const captured = offer?.checkoutDiscountStatus === "captured"
      && Number.isFinite(regular) && Number.isFinite(instant) && Number.isFinite(coupon)
      && Number.isFinite(couponTotal) && regular + instant + coupon === couponTotal;
    const detailStatus = isSoldOut(offer)
      ? "soldout"
      : captured ? "captured" : offer?.checkoutDiscountStatus === "unverified" ? "unverified"
        : offer?.checkoutDiscountStatus === "summary" ? "summary" : "missing";
    const statusFor=(name,value)=>{
      if(detailStatus==="soldout") return "soldout";
      if(captured) return "captured";
      if(Number.isFinite(value)) return fieldStatus[name]||"captured";
      return fieldStatus[name]||detailStatus;
    };
    return {
      regular, instant, coupon, total:couponTotal, captured, detailStatus,
      regularStatus:statusFor("regular",regular),
      instantStatus:statusFor("wowInstant",instant),
      couponStatus:statusFor("wowCoupon",coupon)
    };
  }

  function checkoutDiscountText(value, detailStatus = "missing") {
    if (Number.isFinite(value)) return discountText(value);
    if (detailStatus === "soldout") return '<span class="unknown">품절로 미적용</span>';
    if (detailStatus === "unverified") return '<span class="unknown">금액 판독 실패</span>';
    return detailStatus === "summary"
      ? '<span class="unknown">상세 구분 미확인</span>'
      : '<span class="unknown">미수집</span>';
  }

  function checkoutDiscountExportValue(value, detailStatus = "missing") {
    if (Number.isFinite(value)) return value;
    if (detailStatus === "soldout") return "품절로 미적용";
    if (detailStatus === "unverified") return "금액 판독 실패";
    if (detailStatus === "summary") return "상세 구분 미확인";
    return "미수집";
  }

  function basisTypeText(value) {
    if (value === "crossed-out") return "취소선 가격";
    if (value === "top-visible") return "최상단 표시가격";
    return "미확인";
  }

  function cardStatusText(value) {
    if (value === "captured") return "수집 완료";
    if (value === "none") return "혜택 없음";
    if (value === "partial") return "상세정보 미수집";
    return "미확인";
  }

  function effectiveFinalPrice(offer) {
    if (!offer || !Number.isFinite(offer.finalPrice)) return null;
    if (isSoldOut(offer)) return null;
    // Current comparisons are opt-in. Missing eligibility on legacy or
    // server-refreshed offers must never be interpreted as verified.
    if (offer.alertEligible !== true) return null;
    if (offer.role === "mine" && !["captured", "none"].includes(offer.cardBenefitStatus)) return null;
    return offer.finalPrice;
  }

  function collectionDay(offer) {
    const value = offer?.priceCheckedAt || offer?.checkedAt;
    const match = String(value || "").match(/^\d{4}-\d{2}-\d{2}/);
    return match?.[0] || null;
  }

  function effectiveCompetitorPrice(offer, mine) {
    const price = effectiveFinalPrice(offer);
    const competitorDay = collectionDay(offer);
    const mineDay = collectionDay(mine);
    if (!Number.isFinite(price) || !competitorDay || !mineDay || competitorDay !== mineDay) return null;
    return price;
  }

  function isSoldOut(offer) {
    return ["buy-now-button-not-found", "buy-now-button-sold-out"].includes(offer?.checkoutDiscountReason) || offer?.status === "품절";
  }

  function offerStatus(offer) {
    return isSoldOut(offer) ? "품절" : (offer?.status || "미확인");
  }

  function priceTrend(offer) {
    const current = effectiveFinalPrice(offer);
    const change = Number.isFinite(offer?.priceChange) ? offer.priceChange : null;
    if (!Number.isFinite(current) || !Number.isFinite(change)) return { className: "", label: "" };
    if (change < 0) return { className: "overview-row--price-down", label: `직전 대비 ↓ ${formatWon(Math.abs(change))}` };
    if (change > 0) return { className: "overview-row--price-up", label: `직전 대비 ↑ ${formatWon(change)}` };
    return { className: "", label: "직전과 동일" };
  }

  function downloadWorkbook(headers, rows, sheetName, filename) {
    if (!window.MarketPulseXlsx?.createWorkbook) throw new Error("Excel 생성 모듈을 불러오지 못했습니다.");
    const blob = window.MarketPulseXlsx.createWorkbook(headers, rows, sheetName);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function exportMyProducts() {
    const brand = data.meta.brand || document.title.split(/\s+/)[0] || "MarketPulse";
    const headers = [
      "브랜드", "모델명(MTM)", "제품명/화면", "용량", "Product ID", "Item ID", "VendorItem ID",
      "판매처", "채널", "상태", "SRP", "표시가", "표시가 종류", "매칭차액",
      "일반 쿠폰할인", "와우 전용 즉시할인", "와우 전용 쿠폰할인", "쿠폰할인 총금액",
      "주문서 할인 상태", "판독 실패 항목", "주문서 할인 근거",
      "카드할인 상태", "카드할인", "카드할인 전 가격", "최종 실구매가", "배송비", "적용 카드사",
      "카드 할인율(%)", "최대 할인한도", "가격 조건", "확인 출처", "신뢰도",
      "신뢰도 설명", "가격 확인 시각", "최근 접근 시각", "상품 URL", "대시보드 조사 기준 시각"
    ];
    const rows = data.products.map((product) => {
      const mine = product.offers.find((offer) => offer.role === "mine") || {};
      const breakdown = priceBreakdown(mine);
      const checkout = checkoutDiscounts(mine, breakdown.couponDiscount);
      return [
        brand, product.mtm, product.display, product.storage, product.productId, product.itemId, product.vendorItemId,
        mine.seller, mine.channel, offerStatus(mine),
        Number.isFinite(breakdown.srp) ? breakdown.srp : "SRP 미입력",
        Number.isFinite(breakdown.basisPrice) ? breakdown.basisPrice : "미확인",
        basisTypeText(mine.priceBasisType),
        Number.isFinite(breakdown.matchingDifference) ? breakdown.matchingDifference : "미확인",
        checkoutDiscountExportValue(checkout.regular, checkout.regularStatus),
        checkoutDiscountExportValue(checkout.instant, checkout.instantStatus),
        checkoutDiscountExportValue(checkout.coupon, checkout.couponStatus),
        Number.isFinite(checkout.total) ? checkout.total : "미확인",
        mine.checkoutDiscountStatus || "missing",
        Array.isArray(mine.checkoutUnparsedFields) ? mine.checkoutUnparsedFields.join(", ") : "",
        Array.isArray(mine.checkoutDiscountEvidence) ? mine.checkoutDiscountEvidence.join(" / ") : "",
        cardStatusText(mine.cardBenefitStatus),
        mine.cardBenefitStatus === "none" ? 0 : Number.isFinite(mine.cardDiscount) ? mine.cardDiscount : "미확인",
        Number.isFinite(breakdown.preCardPrice) ? breakdown.preCardPrice : "미확인",
        Number.isFinite(effectiveFinalPrice(mine)) ? effectiveFinalPrice(mine) : "미확인", mine.shipping,
        Array.isArray(mine.cardProviders) ? mine.cardProviders.filter(Boolean).join(", ") : "",
        mine.cardRate,
        Number.isFinite(mine.cardMaxDiscount) ? mine.cardMaxDiscount : mine.cardBenefitStatus === "captured" ? "한도 표기 없음" : "미확인",
        mine.condition, mine.sourceType, mine.confidence,
        mine.confidenceText, mine.priceCheckedAt || mine.checkedAt, mine.availabilityCheckedAt,
        safeUrl(mine.url) === "#" ? "" : safeUrl(mine.url), data.meta.snapshotAt
      ];
    });
    const date = String(data.meta.snapshotAt || new Date().toISOString()).slice(0, 10);
    downloadWorkbook(headers, rows, "내 쿠팡상품", `MarketPulse_${brand}_내상품_${date}.xlsx`);
  }

  function productStats(product) {
    const mine = product.offers.find((offer) => offer.role === "mine");
    const competitors = product.offers
      .filter((offer) => offer.role === "competitor" && Number.isFinite(effectiveCompetitorPrice(offer, mine)))
      .sort((a, b) => effectiveCompetitorPrice(a, mine) - effectiveCompetitorPrice(b, mine));
    const competitorBest = competitors[0] || null;
    const mineFinalPrice = effectiveFinalPrice(mine);
    const competitorBestPrice = competitorBest ? effectiveCompetitorPrice(competitorBest, mine) : null;
    const mineReady = Number.isFinite(mineFinalPrice);
    const difference = mineReady && Number.isFinite(competitorBestPrice) ? competitorBestPrice - mineFinalPrice : null;
    const undercutters = mineReady ? competitors.filter((offer) => effectiveCompetitorPrice(offer, mine) < mineFinalPrice) : [];
    return { mine, mineFinalPrice, competitors, competitorBest, competitorBestPrice, difference, undercutters };
  }

  function activeProduct() {
    return data.products.find((product) => product.mtm === activeMtm) || data.products[0];
  }

  function confidenceClass(value) {
    return String(value).toLowerCase().replace("/", "");
  }

  function initials(seller, mine) {
    if (mine) return "MY";
    return seller.replace(/[^A-Za-z가-힣]/g, "").slice(0, 2).toUpperCase() || "₩";
  }

  function renderHeader() {
    const stats = data.products.map(productStats);
    const wins = stats.filter((item) => Number.isFinite(item.difference) && item.difference >= 0);
    const alerts = stats.filter((item) => item.undercutters.length > 0);
    const advantages = wins.map((item) => item.difference).filter(Number.isFinite);
    const currentSellers = stats.reduce((sum, item) => sum + item.competitors.length, 0);
    const total = data.products.length;
    const brand = data.meta.brand || document.title.split(/\s+/)[0] || "Market Pulse";

    const snapshotDate = new Date(data.meta.snapshotAt);
    const snapshotParts = new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    }).formatToParts(snapshotDate).reduce((parts, part) => ({ ...parts, [part.type]: part.value }), {});
    refs.headerSnapshot.textContent = `${snapshotParts.year}.${snapshotParts.month}.${snapshotParts.day} ${snapshotParts.hour}:${snapshotParts.minute} KST`;
    refs.winCount.textContent = wins.length;
    if (refs.totalCount) refs.totalCount.textContent = total;
    if (refs.overviewEyebrow) refs.overviewEyebrow.textContent = `${total} MTM OVERVIEW`;
    if (refs.brandSubtitle) refs.brandSubtitle.textContent = `${brand} Notebook · Korea`;
    refs.minAdvantage.textContent = advantages.length ? formatWon(Math.min(...advantages)) : "—";
    refs.sellerCount.textContent = `${currentSellers}곳`;

    const compared = stats.filter((item) => Number.isFinite(item.difference)).length;
    if (alerts.length) {
      refs.pageTitle.innerHTML = `${alerts.length}개 MTM<br /><em>가격 역전.</em>`;
      refs.heroSummary.textContent = "검증된 현재 판매가에서 내 상품보다 저렴한 경쟁 판매처가 발견됐습니다.";
    } else if (compared) {
      refs.pageTitle.innerHTML = `${compared === total ? `${total}개 모델 모두` : `${compared}개 모델`}<br /><em>가격 우위.</em>`;
      refs.heroSummary.textContent = "현재 가격이 확인된 모델의 공개 실구매가를 비교했습니다.";
    } else {
      refs.pageTitle.innerHTML = `${total}개 모델<br /><em>가격 확인 중.</em>`;
      refs.heroSummary.textContent = "상품 등록을 마쳤습니다. 첫 가격 수집 후 비교 결과가 표시됩니다.";
    }

    $("#basisText").textContent = data.meta.comparisonBasis;
    $("#exclusionText").textContent = data.meta.exclusions;
    const monitoring = data.meta.monitoring;
    const attempt = monitoring?.lastAttemptAt ? new Date(monitoring.lastAttemptAt) : null;
    const attemptTime = attempt && !Number.isNaN(attempt.getTime())
      ? new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(attempt)
      : null;
    $("#automationStrip").innerHTML = monitoring?.enabled ? `
      <span><i></i>가격 감시 <b>${escapeHtml(monitoring.quickWatch)}</b></span>
      <span><i></i>전체 조사 <b>${escapeHtml(monitoring.fullResearch)}</b></span>
      <span><i></i><b>${escapeHtml(monitoring.dashboardSync)}</b></span>
      ${attemptTime ? `<span class="is-partial" title="${escapeHtml(monitoring.lastAttemptText)}"><i></i>최근 자동 확인 <b>${attemptTime} · ${monitoring.lastAttemptStatus === "success" ? "완료" : "일부 제한"}</b></span>` : ""}` : "";
  }

  function watchForPublishedData() {
    const dataScript = [...document.scripts].find((script) => /market-data\.js(?:\?|$)/.test(script.src));
    const dataUrl = dataScript?.src || new URL("./market-data.js", location.href).href;
    window.setInterval(async () => {
      try {
        const separator = dataUrl.includes("?") ? "&" : "?";
        const response = await fetch(`${dataUrl}${separator}check=${Date.now()}`, { cache: "no-store" });
        const source = await response.text();
        const latest = source.match(/["']?snapshotAt["']?\s*:\s*"([^"]+)"/)?.[1];
        if (latest && latest !== data.meta.snapshotAt) location.reload();
      } catch {
        // 다음 확인 주기에 다시 시도합니다.
      }
    }, 300000);
  }

  function renderCards() {
    const rows = data.products.map((product) => {
      const mine = productStats(product).mine || {};
      const breakdown = priceBreakdown(mine);
      const checkout = checkoutDiscounts(mine, breakdown.couponDiscount);
      const providers = Array.isArray(mine.cardProviders) ? mine.cardProviders.filter(Boolean).join(", ") : "";
      const cardCondition = Number.isFinite(mine.cardRate)
        ? `${mine.cardRate}% · ${Number.isFinite(mine.cardMaxDiscount) ? `최대 ${formatWon(mine.cardMaxDiscount)}` : "한도 표기 없음"}`
        : cardStatusText(mine.cardBenefitStatus);
      const checkedAt = mine.priceCheckedAt || mine.checkedAt || "미확인";
      const soldOut = isSoldOut(mine);
      const trend = priceTrend(mine);
      return `
        <button class="overview-row ${trend.className}" type="button" role="tab" data-mtm="${escapeHtml(product.mtm)}" aria-selected="${product.mtm === activeMtm}"${trend.label ? ` title="${escapeHtml(trend.label)}"` : ""}>
          <span class="overview-model" data-label="내 쿠팡상품">
            <strong>${escapeHtml(product.mtm)}</strong><small>${escapeHtml(product.storage)} · ${escapeHtml(product.display)}</small>
            <i class="overview-status ${soldOut ? "overview-status--soldout" : ""}">${escapeHtml(offerStatus(mine))}</i>
          </span>
          <span class="overview-stack" data-label="가격 기준">
            <span><small>SRP</small>${Number.isFinite(breakdown.srp) ? formatWon(breakdown.srp) : '<span class="unknown">미입력</span>'}</span>
            <span><small>표시가</small>${formatWon(breakdown.basisPrice)}</span>
            <span><small>매칭차액</small>${formatDiff(breakdown.matchingDifference)}</span>
          </span>
          <span class="overview-stack" data-label="할인 상세">
            <span><small>일반 쿠폰</small>${checkoutDiscountText(checkout.regular, checkout.regularStatus)}</span>
            <span><small>와우 즉시</small>${checkoutDiscountText(checkout.instant, checkout.instantStatus)}</span>
            <span><small>와우 쿠폰</small>${checkoutDiscountText(checkout.coupon, checkout.couponStatus)}</span>
            <span class="overview-stack__total"><small>합계</small>${discountText(checkout.total)}</span>
          </span>
          <span class="overview-stack" data-label="카드 상세">
            <span><small>할인 전</small>${formatWon(breakdown.preCardPrice)}</span>
            <span><small>카드할인</small>${cardDiscountText(mine)}</span>
            <span><small>조건</small>${escapeHtml(cardCondition)}</span>
            ${providers ? `<span><small>카드사</small>${escapeHtml(providers)}</span>` : ""}
          </span>
          <span class="overview-result" data-label="최종 실구매가">
            <strong>${soldOut ? '<span class="unknown">구매 불가</span>' : formatWon(effectiveFinalPrice(mine))}</strong>
            <small>확인 ${escapeHtml(checkedAt)}${checkedAt === "미확인" ? "" : " KST"}</small>
            ${trend.label ? `<small class="overview-trend ${trend.className ? `overview-trend--${mine.priceTrend}` : ""}">${escapeHtml(trend.label)}</small>` : ""}
          </span>
        </button>`;
    }).join("");
    refs.productGrid.innerHTML = `
      <div class="overview-head" aria-hidden="true"><span>내 쿠팡상품 · 상태</span><span>가격 기준</span><span>할인 상세</span><span>카드 상세</span><span>최종 실구매가</span></div>
      ${rows}`;
  }

  function renderSignal(product) {
    if (activeView === "reference") {
      refs.priceSignal.innerHTML = `
        <div class="signal signal--reference">
          <span class="signal__copy"><span class="signal__icon">i</span><span><strong>참고가격은 현재 최저가 계산에서 제외</strong><span>품절, 오래된 검색 인덱스 또는 직접 검증이 어려운 가격입니다.</span></span></span>
        </div>`;
      return;
    }

    const stats = productStats(product);
    const ready = Number.isFinite(stats.mineFinalPrice) && Number.isFinite(stats.competitorBestPrice);
    if (!ready) {
      refs.priceSignal.innerHTML = '<div class="signal signal--reference"><span class="signal__copy"><span class="signal__icon">i</span><span><strong>비교가격을 확인하지 못했습니다.</strong><span>카드 상세정보와 경쟁가격이 모두 확인된 경우에만 최종 가격을 비교합니다.</span></span></span></div>';
      return;
    }
    const alert = stats.undercutters.length > 0;
    const gap = Math.abs(stats.difference || 0);
    refs.priceSignal.innerHTML = `
      <div class="signal ${alert ? "signal--alert" : ""}">
        <span class="signal__copy">
          <span class="signal__icon">${alert ? "!" : "✓"}</span>
          <span>
            <strong>${alert ? "가격 역전이 발견됐습니다." : "현재 내 상품이 최저가입니다."}</strong>
            <span>${alert ? `${escapeHtml(stats.competitorBest.seller)}가 내 상품보다 저렴합니다.` : `${escapeHtml(stats.competitorBest.seller)}보다 내 상품 가격이 낮습니다.`}</span>
          </span>
        </span>
        <span class="signal__price"><span>${alert ? "경쟁사 가격 우위" : "내 상품 가격 우위"}</span><strong>${formatWon(gap)}</strong></span>
      </div>`;
  }

  function renderRows(product) {
    const stats = productStats(product);
    const source = activeView === "current"
      ? [stats.mine, ...stats.competitors].filter(Boolean)
      : product.references;

    refs.offerRows.innerHTML = source.map((offer, index) => {
      const mine = offer.role === "mine";
      const current = activeView === "current";
      const price = current ? offer.finalPrice : offer.referencePrice;
      const breakdown = mine ? priceBreakdown(offer) : null;
      const srp = mine ? breakdown.srp : offer.displayPrice;
      const matchingDifference = mine ? breakdown.matchingDifference : null;
      const couponDiscount = mine ? breakdown.couponDiscount : offer.couponDiscount;
      const checkout = mine ? checkoutDiscounts(offer, couponDiscount) : { regular: null, instant: null, coupon: null, total: couponDiscount };
      const offerFinalPrice = current
        ? (mine ? effectiveFinalPrice(offer) : effectiveCompetitorPrice(offer, stats.mine))
        : null;
      const difference = current && !mine && Number.isFinite(offerFinalPrice) && Number.isFinite(stats.mineFinalPrice)
        ? offerFinalPrice - stats.mineFinalPrice
        : null;
      const best = current && !mine && offer === stats.competitorBest;
      const alert = current && !mine && difference < 0;
      const rowClass = mine ? "is-mine" : alert ? "is-alert" : best ? "is-best" : "";
      const soldOut = current && isSoldOut(offer);
      const statusClass = soldOut ? "soldout" : current ? "active" : "stale";
      const finalCell = current
        ? `<strong class="price">${formatWon(offerFinalPrice)}</strong>`
        : `<span class="unknown">현재가 미확인</span><span class="conditional">참고 ${formatWon(price)}</span>`;
      const diffCell = mine
        ? '<span class="diff diff--base">비교 기준</span>'
        : current
          ? (Number.isFinite(difference) ? `<span class="diff diff--${difference < 0 ? "bad" : "good"}">${formatDiff(difference)}</span>` : '<span class="unknown">기준가 미확인</span>')
          : '<span class="unknown">계산 제외</span>';

      return `
        <tr class="${rowClass}" data-index="${index}">
          <td>
            <span class="seller">
              <span class="seller__mark">${escapeHtml(initials(offer.seller, mine))}</span>
              <span><strong>${escapeHtml(offer.seller)}</strong><small>${escapeHtml(offer.channel)}${best ? " · 경쟁 최저" : ""}</small></span>
            </span>
          </td>
          <td data-label="상태"><span class="row-badge row-badge--${statusClass}">${escapeHtml(offerStatus(offer))}</span></td>
          <td data-label="가격 기준" class="cell-stack">
            <span><small>SRP</small>${mine && !Number.isFinite(srp) ? '<span class="unknown">SRP 미입력</span>' : formatWon(srp)}</span>
            <span><small>표시가</small>${current && mine ? formatWon(breakdown.basisPrice) : '<span class="unknown">—</span>'}</span>
            <span><small>매칭차액</small>${current && mine ? formatDiff(matchingDifference) : '<span class="unknown">—</span>'}</span>
          </td>
          <td data-label="할인 상세" class="cell-stack cell-stack--discount">
            <span><small>일반 쿠폰</small>${current && mine ? checkoutDiscountText(checkout.regular, checkout.regularStatus) : '<span class="unknown">—</span>'}</span>
            <span><small>와우 즉시</small>${current && mine ? checkoutDiscountText(checkout.instant, checkout.instantStatus) : '<span class="unknown">—</span>'}</span>
            <span><small>와우 쿠폰</small>${current && mine ? checkoutDiscountText(checkout.coupon, checkout.couponStatus) : '<span class="unknown">—</span>'}</span>
            <span class="cell-stack__total"><small>합계</small>${current ? discountText(checkout.total) : '<span class="unknown">—</span>'}</span>
          </td>
          <td data-label="카드할인">${current ? cardDiscountText(offer) : '<span class="unknown">—</span>'}</td>
          <td data-label="최종 실구매가">${finalCell}</td>
          <td data-label="내 상품 대비">${diffCell}</td>
          <td data-label="신뢰도"><span class="confidence confidence--${confidenceClass(offer.confidence)}">${escapeHtml(offer.confidence)}</span></td>
          <td><button class="evidence-button" type="button" data-evidence-index="${index}" aria-label="${escapeHtml(offer.seller)} 가격 근거 보기" title="가격 근거 보기"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg></button></td>
        </tr>`;
    }).join("");
  }

  function renderDetail() {
    const product = activeProduct();
    refs.productMeta.innerHTML = `<strong>${escapeHtml(product.mtm)}</strong> · ${escapeHtml(product.storage)} · ${escapeHtml(product.display)} · Item ID ${escapeHtml(product.itemId)}`;
    refs.referenceCount.textContent = product.references.length;
    document.querySelectorAll("[data-view]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.view === activeView);
    });
    renderSignal(product);
    renderRows(product);
  }

  function render() {
    renderHeader();
    renderCards();
    renderDetail();
  }

  function openEvidence(index) {
    const product = activeProduct();
    const list = activeView === "current"
      ? [productStats(product).mine, ...productStats(product).competitors].filter(Boolean)
      : product.references;
    const offer = list[index];
    if (!offer) return;

    const mine = activeView === "current" && offer.role === "mine";
    const breakdown = mine ? priceBreakdown(offer) : null;
    const displayPrice = mine
      ? (Number.isFinite(breakdown.srp) ? formatWon(breakdown.srp) : "SRP 미입력")
      : (Number.isFinite(offer.displayPrice) ? formatWon(offer.displayPrice) : "미확인");
    const finalValue = activeView === "current"
      ? (mine ? effectiveFinalPrice(offer) : effectiveCompetitorPrice(offer, productStats(product).mine))
      : offer.referencePrice;
    const providers = Array.isArray(offer.cardProviders) ? offer.cardProviders.filter(Boolean).join(', ') : '';
    refs.evidenceTitle.textContent = offer.seller;
    const priceCheckedAt = offer.priceCheckedAt || offer.checkedAt || "미확인";
    const accessCheckedAt = offer.availabilityCheckedAt || null;
    const checkout = mine ? checkoutDiscounts(offer, breakdown.couponDiscount) : null;
    const unparsedLabels={checkoutCouponDiscount:"일반 쿠폰",wowInstantDiscount:"와우 즉시",wowCouponDiscount:"와우 쿠폰"};
    const unparsed=mine&&Array.isArray(offer.checkoutUnparsedFields)
      ? offer.checkoutUnparsedFields.map(value=>unparsedLabels[value]||value).filter(Boolean) : [];
    const checkoutEvidence=mine&&Array.isArray(offer.checkoutDiscountEvidence)
      ? offer.checkoutDiscountEvidence.filter(Boolean) : [];
    refs.evidenceContent.innerHTML = `
      <div class="evidence__item"><span>MTM</span><strong>${escapeHtml(product.mtm)}</strong></div>
      <div class="evidence__item"><span>채널·상태</span><strong>${escapeHtml(offer.channel)} · ${escapeHtml(offer.status)}</strong></div>
      <div class="evidence__item"><span>SRP</span><strong>${displayPrice}</strong></div>
      ${mine ? `<div class="evidence__item"><span>표시가</span><strong>${formatWon(breakdown.basisPrice)}</strong></div>
      <div class="evidence__item"><span>표시가 종류</span><strong>${escapeHtml(basisTypeText(offer.priceBasisType))}</strong></div>
      <div class="evidence__item"><span>매칭차액</span><strong>${formatDiff(breakdown.matchingDifference)}</strong></div>
      <div class="evidence__item"><span>일반 쿠폰할인</span><strong>${checkoutDiscountText(checkout.regular, checkout.regularStatus)}</strong></div>
      <div class="evidence__item"><span>와우 전용 즉시할인</span><strong>${checkoutDiscountText(checkout.instant, checkout.instantStatus)}</strong></div>
      <div class="evidence__item"><span>와우 전용 쿠폰할인</span><strong>${checkoutDiscountText(checkout.coupon, checkout.couponStatus)}</strong></div>
      <div class="evidence__item"><span>쿠폰할인 총금액</span><strong>${discountText(breakdown.couponDiscount)}</strong></div>
      <div class="evidence__item"><span>카드할인 전 가격</span><strong>${formatWon(breakdown.preCardPrice)}</strong></div>
      <div class="evidence__item"><span>카드할인 상태</span><strong>${escapeHtml(cardStatusText(offer.cardBenefitStatus))}</strong></div>
      <div class="evidence__item"><span>카드할인 금액</span><strong>${cardDiscountText(offer)}</strong></div>
      ${unparsed.length ? `<div class="evidence__item evidence__item--wide"><span>판독 실패 항목</span><p>${escapeHtml(unparsed.join(', '))}</p></div>` : ""}
      ${checkoutEvidence.length ? `<div class="evidence__item evidence__item--wide"><span>주문서 할인 근거</span><p>${checkoutEvidence.map(escapeHtml).join('<br>')}</p></div>` : ""}` : ""}
      <div class="evidence__item"><span>${activeView === "current" ? "최종 실구매가" : "참고가격"}</span><strong>${formatWon(finalValue)}</strong></div>
      ${providers ? `<div class="evidence__item"><span>적용 카드사</span><strong>${escapeHtml(providers)}</strong></div>` : ""}
      ${Number.isFinite(offer.cardRate) ? `<div class="evidence__item"><span>카드 할인조건</span><strong>${escapeHtml(`${offer.cardRate}% · ${Number.isFinite(offer.cardMaxDiscount) ? `최대 ${formatWon(offer.cardMaxDiscount)}` : "할인한도 표기 없음"}`)}</strong></div>` : ""}
      <div class="evidence__item"><span>신뢰도</span><strong>${escapeHtml(offer.confidence)} · ${escapeHtml(offer.confidenceText)}</strong></div>
      <div class="evidence__item"><span>가격 확인 시각</span><strong>${escapeHtml(priceCheckedAt)}${priceCheckedAt === "미확인" ? "" : " KST"}</strong></div>
      ${accessCheckedAt ? `<div class="evidence__item"><span>최근 접근 시각</span><strong>${escapeHtml(accessCheckedAt)} KST</strong></div>` : ""}
      <div class="evidence__item evidence__item--wide"><span>가격 조건</span><p>${escapeHtml(offer.condition)}</p></div>
      <div class="evidence__item evidence__item--wide"><span>확인 출처</span><p>${escapeHtml(offer.sourceType)}</p></div>`;
    refs.sourceLink.href = safeUrl(offer.url);
    refs.sourceLink.hidden = refs.sourceLink.href.endsWith("#");
    refs.evidenceDialog.showModal();
  }

  refs.productGrid.addEventListener("click", (event) => {
    const card = event.target.closest("[data-mtm]");
    if (!card) return;
    activeMtm = card.dataset.mtm;
    activeView = "current";
    history.replaceState(null, "", `#${encodeURIComponent(activeMtm)}`);
    render();
    if (matchMedia("(max-width: 880px)").matches) {
      $(".detail").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      activeView = button.dataset.view;
      renderDetail();
    });
  });

  refs.offerRows.addEventListener("click", (event) => {
    const button = event.target.closest("[data-evidence-index]");
    if (button) openEvidence(Number(button.dataset.evidenceIndex));
  });

  refs.exportExcel.addEventListener("click", exportMyProducts);
  $("#methodButton").addEventListener("click", () => refs.methodDialog.showModal());
  document.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", () => button.closest("dialog").close());
  });
  document.querySelectorAll("dialog").forEach((dialog) => {
    dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
  });

  render();
  watchForPublishedData();
  window.MarketPulse = { productStats, formatWon, exportMyProducts, getActiveMtm: () => activeMtm };
})();
