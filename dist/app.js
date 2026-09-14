(() => {
  "use strict";

  const data = window.MARKET_DATA;
  if (!data?.products?.length) throw new Error("가격 데이터가 없습니다.");

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

  function formatDiff(value) {
    if (!Number.isFinite(value)) return "—";
    if (value === 0) return "동일";
    return `${value > 0 ? "+" : "−"}${Math.abs(value).toLocaleString("ko-KR")}원`;
  }

  function exportMyProducts() {
    const brand = data.meta.brand || document.title.split(/\s+/)[0] || "MarketPulse";
    const headers = [
      "브랜드", "모델명(MTM)", "제품명/화면", "용량", "Product ID", "Item ID", "VendorItem ID",
      "판매처", "채널", "상태", "SRP", "취소선 표시가격", "즉시할인", "쿠폰",
      "카드할인", "카드할인 전 가격", "최종 실구매가", "배송비", "적용 카드사",
      "카드 할인율(%)", "최대 할인한도", "가격 조건", "확인 출처", "신뢰도",
      "신뢰도 설명", "가격 확인 시각", "최근 접근 시각", "상품 URL", "대시보드 조사 기준 시각"
    ];
    const rows = data.products.map((product) => {
      const mine = product.offers.find((offer) => offer.role === "mine") || {};
      const srp = Number.isFinite(mine.srp) ? mine.srp : mine.displayPrice;
      const preCardPrice = Number.isFinite(mine.preCardPrice)
        ? mine.preCardPrice
        : Number.isFinite(mine.finalPrice) && Number.isFinite(mine.cardDiscount)
          ? mine.finalPrice + mine.cardDiscount
          : mine.finalPrice;
      const instantDiscount = Number.isFinite(srp) && Number.isFinite(mine.observedListPrice) && srp >= mine.observedListPrice
        ? srp - mine.observedListPrice
        : mine.instantDiscount;
      const couponDiscount = Number.isFinite(mine.observedListPrice) && Number.isFinite(preCardPrice) && mine.observedListPrice >= preCardPrice
        ? mine.observedListPrice - preCardPrice
        : mine.couponDiscount;
      return [
        brand, product.mtm, product.display, product.storage, product.productId, product.itemId, product.vendorItemId,
        mine.seller, mine.channel, mine.status, srp, mine.observedListPrice, instantDiscount, couponDiscount,
        mine.cardDiscount, preCardPrice, mine.finalPrice, mine.shipping,
        Array.isArray(mine.cardProviders) ? mine.cardProviders.filter(Boolean).join(", ") : "",
        mine.cardRate, mine.cardMaxDiscount, mine.condition, mine.sourceType, mine.confidence,
        mine.confidenceText, mine.priceCheckedAt || mine.checkedAt, mine.availabilityCheckedAt,
        safeUrl(mine.url) === "#" ? "" : safeUrl(mine.url), data.meta.snapshotAt
      ];
    });
    const csvCell = (value) => {
      if (value === null || value === undefined) return "";
      if (typeof value === "number" && Number.isFinite(value)) return String(value);
      const text = String(value);
      const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const date = String(data.meta.snapshotAt || new Date().toISOString()).slice(0, 10);
    link.href = url;
    link.download = `MarketPulse_${brand}_내상품_${date}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function productStats(product) {
    const mine = product.offers.find((offer) => offer.role === "mine");
    const competitors = product.offers
      .filter((offer) => offer.role === "competitor" && Number.isFinite(offer.finalPrice))
      .sort((a, b) => a.finalPrice - b.finalPrice);
    const competitorBest = competitors[0] || null;
    const mineReady = Number.isFinite(mine?.finalPrice);
    const difference = mineReady && competitorBest ? competitorBest.finalPrice - mine.finalPrice : null;
    const undercutters = mineReady ? competitors.filter((offer) => offer.finalPrice < mine.finalPrice) : [];
    return { mine, competitors, competitorBest, difference, undercutters };
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
    window.setInterval(async () => {
      try {
        const response = await fetch(`./market-data.js?check=${Date.now()}`, { cache: "no-store" });
        const source = await response.text();
        const latest = source.match(/snapshotAt:\s*"([^"]+)"/)?.[1];
        if (latest && latest !== data.meta.snapshotAt) location.reload();
      } catch {
        // 다음 확인 주기에 다시 시도합니다.
      }
    }, 300000);
  }

  function renderCards() {
    refs.productGrid.innerHTML = data.products.map((product) => {
      const stats = productStats(product);
      const winning = Number.isFinite(stats.difference) && stats.difference >= 0;
      return `
        <button class="product-card" type="button" role="tab" data-mtm="${escapeHtml(product.mtm)}" aria-selected="${product.mtm === activeMtm}">
          <span class="product-card__top">
            <span>
              <strong class="product-card__mtm">${escapeHtml(product.mtm)}</strong>
              <span class="product-card__spec">${escapeHtml(product.storage)} · ${escapeHtml(product.display)}</span>
            </span>
            <span class="status status--${winning ? "win" : "lose"}">${winning ? "내 상품 우위" : "가격 역전"}</span>
          </span>
          <span class="product-card__prices">
            <span><span>내 쿠팡 실구매가</span><strong>${formatWon(stats.mine?.finalPrice)}</strong></span>
            <span><span>경쟁 최저가</span><strong>${formatWon(stats.competitorBest?.finalPrice)}</strong></span>
          </span>
          <span class="product-card__gap">
            <span>${escapeHtml(stats.competitorBest?.seller || "경쟁 판매처 없음")}</span>
            <b class="${winning ? "" : "is-alert"}">${winning ? `내 상품이 ${formatWon(stats.difference)} 저렴` : `경쟁사가 ${formatWon(Math.abs(stats.difference))} 저렴`}</b>
          </span>
        </button>`;
    }).join("");
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
      const srp = mine && Number.isFinite(offer.srp) ? offer.srp : offer.displayPrice;
      const preCardPrice = mine && Number.isFinite(offer.preCardPrice)
        ? offer.preCardPrice
        : mine && Number.isFinite(offer.finalPrice) && Number.isFinite(offer.cardDiscount)
          ? offer.finalPrice + offer.cardDiscount
          : offer.finalPrice;
      const instantDiscount = mine && Number.isFinite(srp) && Number.isFinite(offer.observedListPrice) && srp >= offer.observedListPrice
        ? srp - offer.observedListPrice
        : offer.instantDiscount;
      const couponDiscount = mine && Number.isFinite(offer.observedListPrice) && Number.isFinite(preCardPrice) && offer.observedListPrice >= preCardPrice
        ? offer.observedListPrice - preCardPrice
        : offer.couponDiscount;
      const difference = current && !mine && Number.isFinite(offer.finalPrice)
        ? offer.finalPrice - stats.mine.finalPrice
        : null;
      const best = current && !mine && offer === stats.competitorBest;
      const alert = current && !mine && difference < 0;
      const rowClass = mine ? "is-mine" : alert ? "is-alert" : best ? "is-best" : "";
      const statusClass = current ? "active" : "stale";
      const finalCell = current
        ? `<strong class="price">${formatWon(offer.finalPrice + (offer.shipping || 0))}</strong>${offer.conditionalBest ? `<span class="conditional">${escapeHtml(offer.conditionalLabel)} ${formatWon(offer.conditionalBest)}</span>` : ""}`
        : `<span class="unknown">현재가 미확인</span><span class="conditional">참고 ${formatWon(price)}</span>`;
      const diffCell = mine
        ? '<span class="diff diff--base">비교 기준</span>'
        : current
          ? `<span class="diff diff--${difference < 0 ? "bad" : "good"}">${formatDiff(difference)}</span>`
          : '<span class="unknown">계산 제외</span>';

      return `
        <tr class="${rowClass}" data-index="${index}">
          <td>
            <span class="seller">
              <span class="seller__mark">${escapeHtml(initials(offer.seller, mine))}</span>
              <span><strong>${escapeHtml(offer.seller)}</strong><small>${escapeHtml(offer.channel)}${best ? " · 경쟁 최저" : ""}</small></span>
            </span>
          </td>
          <td data-label="상태"><span class="row-badge row-badge--${statusClass}">${escapeHtml(offer.status)}</span></td>
          <td data-label="SRP">${formatWon(srp)}</td>
          <td data-label="즉시할인">${current ? discountText(instantDiscount) : '<span class="unknown">—</span>'}</td>
          <td data-label="쿠폰">${current ? discountText(couponDiscount) : '<span class="unknown">—</span>'}</td>
          <td data-label="카드할인">${current ? discountText(offer.cardDiscount) : '<span class="unknown">—</span>'}</td>
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

    const displayPrice = Number.isFinite(offer.displayPrice) ? formatWon(offer.displayPrice) : "미확인";
    const finalValue = activeView === "current" ? offer.finalPrice : offer.referencePrice;
    const providers = Array.isArray(offer.cardProviders) ? offer.cardProviders.filter(Boolean).join(', ') : '';
    refs.evidenceTitle.textContent = offer.seller;
    const priceCheckedAt = offer.priceCheckedAt || offer.checkedAt || "미확인";
    const accessCheckedAt = offer.availabilityCheckedAt || null;
    refs.evidenceContent.innerHTML = `
      <div class="evidence__item"><span>MTM</span><strong>${escapeHtml(product.mtm)}</strong></div>
      <div class="evidence__item"><span>채널·상태</span><strong>${escapeHtml(offer.channel)} · ${escapeHtml(offer.status)}</strong></div>
      <div class="evidence__item"><span>SRP</span><strong>${displayPrice}</strong></div>
      <div class="evidence__item"><span>${activeView === "current" ? "최종 실구매가" : "참고가격"}</span><strong>${formatWon(finalValue)}</strong></div>
      ${providers ? `<div class="evidence__item"><span>적용 카드사</span><strong>${escapeHtml(providers)}</strong></div>` : ""}
      ${Number.isFinite(offer.cardRate) ? `<div class="evidence__item"><span>카드 할인조건</span><strong>${escapeHtml(`${offer.cardRate}% · 최대 ${formatWon(offer.cardMaxDiscount)}`)}</strong></div>` : ""}
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
