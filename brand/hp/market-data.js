window.MARKET_DATA = {
    "meta":  {
                 "snapshotAt":  "2026-11-22T07:10:54+09:00",
                 "sourceFile":  "product-catalog.json",
                 "comparisonBasis":  "사용자가 지정한 쿠팡 경쟁모델의 가격 구성과 실제 확인시각 비교",
                 "exclusions":  "품절·수집 오류·이전 회차 가격은 현재 순위와 차액에서 제외. 카드사별 조건은 개별 확인.",
                 "monitoring":  {
                                    "enabled":  true,
                                    "quickWatch":  "매일 07:00 · 12:00 · 15:00 · 20:00 KST",
                                    "fullResearch":  "Basic and precision scan",
                                    "dashboardSync":  "GitHub Pages automatic deployment",
                                    "lastAttemptAt":  "2026-11-22T07:10:54+09:00",
                                    "lastAttemptStatus":  "success",
                                    "lastAttemptText":  "HP 수집 결과: 검증 1, 품절 0, 일부 0 / 전체 1",
                                    "collectionRoute":  "Windows PC · 일반 Chrome 확장프로그램",
                                    "competitionValidationStatus":  "coupang-models",
                                    "alertEvaluation":  ""
                                },
                 "competitorPhase":  {
                                         "scanSlot":  "2026-11-22T07:00+09:00",
                                         "state":  "complete",
                                         "count":  0,
                                         "sourceRunId":  "1b8778f724b7473ba79de8102d9fd9bd",
                                         "completedAt":  "2026-11-21T22:18:11.113Z"
                                     },
                 "priceCalculationPolicy":  "product-page-v1",
                 "pricePolicyAppliedAt":  "2026-11-16T05:25:29.451Z",
                 "wowCouponDisplayPolicy":  "checkout-match-v1",
                 "wowCouponPolicyAppliedAt":  "2026-11-16T06:41:54.179Z",
                 "brand":  "HP",
                 "collectionEvidence":  {
                                            "browser":  "chrome",
                                            "extensionVersion":  "1.9.79",
                                            "scanSlot":  "2026-11-22T07:00+09:00",
                                            "policyId":  "chrome-07-15-whale-12-20-v1",
                                            "runId":  "1b8778f724b7473ba79de8102d9fd9bd",
                                            "sourceRunId":  "1b8778f724b7473ba79de8102d9fd9bd",
                                            "startedAt":  "2026-11-21T22:00:03.414Z",
                                            "completedAt":  "2026-11-21T22:10:54.811Z",
                                            "targetCount":  15,
                                            "resultCount":  15
                                        },
                 "recoveryEvidence":  null,
                 "historyBrands":  [
                                       "HP"
                                   ],
                 "lifecycleStatus":  "active",
                 "renamedTo":  null,
                 "publishedAt":  "2026-11-22T08:00:44+09:00"
             },
    "products":  [
                     {
                         "storage":  "",
                         "display":  "15-GB0139AX",
                         "validation":  "identifiers-verified",
                         "offers":  [
                                        {
                                            "role":  "mine",
                                            "channel":  "쿠팡",
                                            "seller":  "내 쿠팡 상품",
                                            "status":  "현재가 직접 확인",
                                            "displayPrice":  2699000,
                                            "instantDiscount":  0,
                                            "couponDiscount":  50000,
                                            "cardDiscount":  150000,
                                            "finalPrice":  2499000,
                                            "shipping":  0,
                                            "condition":  "정확한 Item ID와 상품페이지·주문서 할인을 직접 확인.",
                                            "sourceType":  "관리화면 등록 URL",
                                            "checkedAt":  "2026-11-22 07:00",
                                            "confidence":  "A",
                                            "confidenceText":  "동일 Item ID의 일반 Chrome 화면에서 가격 확인",
                                            "url":  "https://www.coupang.com/vp/products/9641812639?itemId=28810435903\u0026vendorItemId=95745501474",
                                            "collectionEvidence":  {
                                                                       "browser":  "chrome",
                                                                       "extensionVersion":  "1.9.79",
                                                                       "runId":  "1b8778f724b7473ba79de8102d9fd9bd",
                                                                       "checkedAt":  "2026-11-21T22:00:20.127Z"
                                                                   },
                                            "availabilityCheckedAt":  "2026-11-22 07:00",
                                            "srp":  2699000,
                                            "observedListPrice":  2699000,
                                            "productPagePrice":  2649000,
                                            "preCardPrice":  2649000,
                                            "priceBasisType":  "crossed-out",
                                            "cardBenefitStatus":  "captured",
                                            "publishedPriceBasis":  "final",
                                            "cardEvidenceSource":  "dom-snapshot",
                                            "cardRate":  6,
                                            "cardMaxDiscount":  150000,
                                            "cardProviders":  [
                                                                  "NH농협"
                                                              ],
                                            "cardTerms":  [
                                                              {
                                                                  "rate":  6,
                                                                  "maxDiscount":  150000,
                                                                  "providers":  [
                                                                                    "삼성"
                                                                                ]
                                                              },
                                                              {
                                                                  "rate":  6,
                                                                  "maxDiscount":  150000,
                                                                  "providers":  [
                                                                                    "신한"
                                                                                ]
                                                              },
                                                              {
                                                                  "rate":  6,
                                                                  "maxDiscount":  150000,
                                                                  "providers":  [
                                                                                    "NH농협"
                                                                                ]
                                                              }
                                                          ],
                                            "cardBenefitText":  "최대 6% 카드 즉시할인 (신한, NH농협, 삼성)",
                                            "checkoutDiscountStatus":  "captured",
                                            "checkoutDiscountReason":  "checkout-confirmed-absent-discount-fields-zero",
                                            "checkoutCouponDiscount":  50000,
                                            "checkoutCouponSource":  "checkout",
                                            "wowInstantDiscount":  0,
                                            "priceCalculationPolicy":  "product-page-v1",
                                            "observedWowCouponDiscount":  0,
                                            "checkoutPreCardItemPrice":  2649000,
                                            "wowCouponTreatment":  "none",
                                            "excludedWowCouponDiscount":  null,
                                            "wowCouponDiscount":  0,
                                            "checkoutDiscountCheckedAt":  "2026-11-21T22:00:35.595Z",
                                            "checkoutUnparsedFields":  [

                                                                       ],
                                            "checkoutDiscountFieldStatus":  null,
                                            "checkoutDiscountEvidence":  [
                                                                             "쿠폰할인",
                                                                             "쿠폰할인 변경",
                                                                             "쿠폰할인 변경 -50,000원"
                                                                         ],
                                            "alertEligible":  true,
                                            "priceChange":  0,
                                            "priceTrend":  "same",
                                            "priceComparisonAt":  "2026-11-21 20:00",
                                            "lastVerifiedFinalPrice":  2499000,
                                            "lastVerifiedPriceCheckedAt":  "2026-11-22 07:00",
                                            "priceCheckedAt":  "2026-11-22 07:00"
                                        }
                                    ],
                         "competitorModels":  [

                                              ],
                         "mtm":  "15-GB0139AX",
                         "productId":  "9641812639",
                         "itemId":  "28810435903",
                         "vendorItemId":  "95745501474",
                         "category":  "Notebook",
                         "srp":  2699000,
                         "references":  [

                                        ],
                         "supplierMetrics":  {
                                                 "stock":  150,
                                                 "dailySales":  0,
                                                 "monthSales":  0,
                                                 "stockStatus":  "confirmed",
                                                 "dailySalesStatus":  "confirmed",
                                                 "monthSalesStatus":  "confirmed",
                                                 "asOfDate":  "2026-11-21",
                                                 "month":  "2026-11",
                                                 "monthThrough":  "2026-11-21",
                                                 "sourceDate":  "2026-11-21",
                                                 "salesBasis":  "outbound",
                                                 "source":  "Supplier Hub CSV"
                                             }
                     }
                 ]
};
