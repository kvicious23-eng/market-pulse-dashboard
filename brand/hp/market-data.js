window.MARKET_DATA = {
  "meta": {
    "snapshotAt": "2026-11-06T12:13:17+09:00",
    "sourceFile": "product-catalog.json",
    "comparisonBasis": "사용자가 지정한 쿠팡 경쟁모델의 가격 구성과 실제 확인시각 비교",
    "exclusions": "품절·수집 오류·이전 회차 가격은 현재 순위와 차액에서 제외. 카드사별 조건은 개별 확인.",
    "monitoring": {
      "enabled": true,
      "quickWatch": "매일 08:00 · 12:00 · 16:00 · 20:00 KST",
      "fullResearch": "Basic and precision scan",
      "dashboardSync": "GitHub Pages automatic deployment",
      "lastAttemptAt": "2026-11-06T12:13:17+09:00",
      "lastAttemptStatus": "success",
      "lastAttemptText": "HP 수집 결과: 검증 0, 품절 1, 일부 0 / 전체 1",
      "collectionRoute": "Windows PC · 일반 Whale 확장프로그램",
      "competitionValidationStatus": "coupang-models",
      "alertEvaluation": ""
    },
    "competitorPhase": {
      "scanSlot": "2026-11-06T12:00+09:00",
      "state": "complete",
      "count": 0,
      "sourceRunId": null,
      "completedAt": null
    },
    "brand": "HP",
    "collectionEvidence": {
      "browser": "whale",
      "extensionVersion": "1.9.76",
      "scanSlot": "2026-11-06T12:00+09:00",
      "policyId": "whale-noon-evening-v1",
      "runId": "74daac18632947d79867c0a71a3a774f",
      "sourceRunId": "74daac18632947d79867c0a71a3a774f",
      "startedAt": "2026-11-06T03:00:10.338Z",
      "completedAt": "2026-11-06T03:13:17.916Z",
      "targetCount": 18,
      "resultCount": 18
    },
    "recoveryEvidence": null,
    "publishedAt": "2026-11-06T12:13:17+09:00",
    "historyBrands": [
      "HP"
    ],
    "lifecycleStatus": "active",
    "renamedTo": null
  },
  "products": [
    {
      "storage": "",
      "display": "15-GB0139AX",
      "validation": "identifiers-verified",
      "offers": [
        {
          "role": "mine",
          "channel": "쿠팡",
          "seller": "내 쿠팡 상품",
          "status": "품절",
          "displayPrice": 2699000,
          "instantDiscount": 0,
          "couponDiscount": null,
          "cardDiscount": null,
          "finalPrice": null,
          "shipping": 0,
          "condition": "정확한 Item ID 확인. 품절 상품의 주문서 쿠폰은 미확인.",
          "sourceType": "관리화면 등록 URL",
          "checkedAt": "2026-11-06 12:00",
          "confidence": "A",
          "confidenceText": "동일 Item ID의 일반 Whale 화면에서 가격 확인",
          "url": "https://www.coupang.com/vp/products/9641812639?itemId=28810435903&vendorItemId=95745501474",
          "collectionEvidence": {
            "browser": "whale",
            "extensionVersion": "1.9.76",
            "runId": "74daac18632947d79867c0a71a3a774f",
            "checkedAt": "2026-11-06T03:00:28.109Z"
          },
          "availabilityCheckedAt": "2026-11-06 12:00",
          "srp": 2699000,
          "observedListPrice": 2699000,
          "productPagePrice": 2189000,
          "preCardPrice": null,
          "priceBasisType": "crossed-out",
          "cardBenefitStatus": "captured",
          "publishedPriceBasis": "unavailable",
          "cardEvidenceSource": "dom-snapshot",
          "cardRate": 7,
          "cardMaxDiscount": 140000,
          "cardProviders": [
            "와우카드(KB)",
            "KB국민",
            "신한",
            "롯데",
            "하나",
            "삼성",
            "KB"
          ],
          "cardTerms": [
            {
              "rate": 7,
              "maxDiscount": 140000,
              "providers": [
                "와우카드(KB)",
                "KB국민",
                "신한",
                "롯데",
                "하나",
                "삼성",
                "KB"
              ]
            }
          ],
          "cardBenefitText": "최대 7% 카드 즉시할인 (와우카드(KB)",
          "checkoutDiscountStatus": "soldout",
          "checkoutDiscountReason": "buy-now-button-not-found",
          "checkoutCouponDiscount": null,
          "checkoutCouponSource": null,
          "wowInstantDiscount": null,
          "wowCouponDiscount": null,
          "checkoutDiscountCheckedAt": "",
          "checkoutUnparsedFields": [],
          "checkoutDiscountFieldStatus": null,
          "checkoutDiscountEvidence": [],
          "alertEligible": false,
          "priceChange": null,
          "priceTrend": "unavailable",
          "priceComparisonAt": "",
          "priceCheckedAt": "2026-11-06 12:00"
        }
      ],
      "competitorModels": [],
      "mtm": "15-GB0139AX",
      "productId": "9641812639",
      "itemId": "28810435903",
      "vendorItemId": "95745501474",
      "category": "Notebook",
      "srp": 2699000,
      "references": [],
      "supplierMetrics": {
        "stock": null,
        "dailySales": null,
        "monthSales": null,
        "stockStatus": "sku-not-found",
        "dailySalesStatus": "sku-not-found",
        "monthSalesStatus": "sku-not-found",
        "asOfDate": "2026-11-05",
        "month": "2026-11",
        "monthThrough": "2026-11-05",
        "sourceDate": "2026-11-05",
        "salesBasis": "outbound",
        "source": "Supplier Hub CSV"
      }
    }
  ]
};
