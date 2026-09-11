window.MARKET_PULSE_DATA = {
  "updatedAt": "2026-09-11T13:07:01+09:00",
  "timezone": "Asia/Seoul",
  "status": "daily-market-check",
  "methodology": {
    "rule": "Exact MTM only. Old search indexes are not promoted to current prices. Coupang own-price is populated only when the exact itemId is re-verified.",
    "ownPricePolicy": "Do not infer my Coupang price from another seller or generic MTM listing."
  },
  "products": [
    {
      "mtm": "83N30037KR",
      "storage": "512GB",
      "display": "15.3-inch WUXGA 1920x1200, 300nit",
      "coupang": {
        "productId": "9235110727",
        "itemId": "27303279355",
        "vendorItemId": "95415897534",
        "url": "https://www.coupang.com/vp/products/9235110727?itemId=27303279355&vendorItemId=95415897534",
        "verifiedCurrentPrice": null,
        "verificationStatus": "Exact itemId current price not re-verified in this run"
      },
      "marketLowest": 899000,
      "marketLowestSeller": "자동 조사 확인 최저가",
      "marketRows": [
        {
          "seller": "두리칸",
          "price": 989000,
          "shipping": "가격비교 표기",
          "source": "Danawa",
          "url": "https://prod.danawa.com/info/?pcode=95845739",
          "confidence": "B"
        },
        {
          "seller": "피씨블랙",
          "price": 988000,
          "shipping": "가격비교 표기",
          "paymentCondition": "현금",
          "source": "Danawa",
          "url": "https://prod.danawa.com/info/?pcode=95845739",
          "confidence": "B",
          "note": "현금가이므로 일반 결제가와 분리"
        },
        {
          "seller": "롯데ON",
          "price": 1051340,
          "shipping": "무료배송",
          "source": "Danawa",
          "url": "https://prod.danawa.com/info/?pcode=95845739",
          "confidence": "B"
        },
        {
          "seller": "레노버 브랜드스토어 네이버페이",
          "price": 1109000,
          "shipping": "무료배송",
          "source": "Danawa",
          "url": "https://prod.danawa.com/info/?pcode=95845739",
          "confidence": "B"
        },
        {
          "seller": "Lenovo Korea",
          "price": 1262999,
          "shipping": "무료배송",
          "source": "Lenovo",
          "url": "https://www.lenovo.com/buy/kr/ko/womens-day-deals-on-high-performance-slim-laptops-with-windows-11-0acz00a",
          "confidence": "A"
        }
      ],
      "automation": {
        "mode": "daily",
        "checkedAt": "2026-09-11T13:07:01+09:00",
        "sourcesAttempted": 2,
        "sourcesSucceeded": 2,
        "observations": [
          {
            "url": "https://prod.danawa.com/info/?pcode=95845739",
            "price": 899000,
            "checkedAt": "2026-09-11T13:07:01+09:00"
          },
          {
            "url": "https://www.lenovo.com/buy/kr/ko/womens-day-deals-on-high-performance-slim-laptops-with-windows-11-0acz00a",
            "price": 1262999,
            "checkedAt": "2026-09-11T13:07:01+09:00"
          }
        ]
      }
    },
    {
      "mtm": "83N3003DKR",
      "storage": "1TB",
      "display": "15.3-inch WUXGA family",
      "coupang": {
        "productId": "9235110727",
        "itemId": "27303268765",
        "vendorItemId": "95415897535",
        "url": "https://www.coupang.com/vp/products/9235110727?itemId=27303268765&vendorItemId=95415897535",
        "verifiedCurrentPrice": null,
        "verificationStatus": "Exact itemId current price not re-verified in this run"
      },
      "marketLowest": 949000,
      "marketLowestSeller": "자동 조사 확인 최저가",
      "marketRows": [
        {
          "seller": "다나와 최저가",
          "price": 1046000,
          "shipping": "무료배송",
          "source": "Danawa",
          "url": "https://prod.danawa.com/info/?pcode=95845826",
          "confidence": "B"
        },
        {
          "seller": "피씨블랙",
          "price": 1046000,
          "shipping": "무료배송",
          "paymentCondition": "현금",
          "source": "Danawa",
          "url": "https://prod.danawa.com/info/?pcode=95845826",
          "confidence": "B"
        },
        {
          "seller": "쿠팡(다나와 연결 항목)",
          "price": 1069000,
          "shipping": "무료배송",
          "source": "Danawa",
          "url": "https://prod.danawa.com/info/?pcode=95845826",
          "confidence": "C",
          "note": "내 itemId와 동일 여부를 이번 실행에서 재확인하지 못했으므로 내 상품 가격으로 사용하지 않음"
        },
        {
          "seller": "레노버 브랜드스토어 네이버페이",
          "price": 1209000,
          "shipping": "무료배송",
          "source": "Danawa",
          "url": "https://prod.danawa.com/info/?pcode=95845826",
          "confidence": "B"
        },
        {
          "seller": "Lenovo Korea",
          "price": 1510065,
          "shipping": "무료배송",
          "source": "Lenovo",
          "url": "https://www.lenovo.com/buy/kr/ko/womens-day-deals-on-slim-15-inch-laptops-0acz00a",
          "confidence": "A"
        }
      ],
      "automation": {
        "mode": "daily",
        "checkedAt": "2026-09-11T13:07:01+09:00",
        "sourcesAttempted": 2,
        "sourcesSucceeded": 2,
        "observations": [
          {
            "url": "https://prod.danawa.com/info/?pcode=95845826",
            "price": 949000,
            "checkedAt": "2026-09-11T13:07:01+09:00"
          },
          {
            "url": "https://www.lenovo.com/buy/kr/ko/womens-day-deals-on-slim-15-inch-laptops-0acz00a",
            "price": 1359982,
            "checkedAt": "2026-09-11T13:07:01+09:00"
          }
        ]
      }
    },
    {
      "mtm": "83N30046KR",
      "storage": "512GB",
      "display": "15.1-inch WQXGA 2560x1600, 500nit",
      "coupang": {
        "productId": "8708708250",
        "itemId": "25515648568",
        "vendorItemId": "95415897536",
        "url": "https://www.coupang.com/vp/products/8708708250?itemId=25515648568&vendorItemId=95415897536",
        "verifiedCurrentPrice": null,
        "verificationStatus": "Exact itemId current price not re-verified in this run"
      },
      "marketLowest": 1486092,
      "marketLowestSeller": "자동 조사 확인 최저가",
      "marketRows": [
        {
          "seller": "Lenovo Korea",
          "price": 1486092,
          "shipping": "무료배송",
          "source": "Lenovo/Danawa",
          "url": "https://prod.danawa.com/info/?pcode=122647414",
          "confidence": "A/B"
        },
        {
          "seller": "쿠팡(다나와 연결 항목)",
          "price": 1549800,
          "shipping": "무료배송",
          "source": "Danawa",
          "url": "https://prod.danawa.com/info/?pcode=122647414",
          "confidence": "C",
          "note": "내 itemId와 동일 여부를 이번 실행에서 재확인하지 못했으므로 내 상품 가격으로 사용하지 않음"
        },
        {
          "seller": "phcnc",
          "price": 1550000,
          "shipping": "무료배송",
          "source": "Danawa",
          "url": "https://prod.danawa.com/info/?pcode=122647414",
          "confidence": "B"
        },
        {
          "seller": "노트필(NOTEFEEL)",
          "price": 1550000,
          "shipping": "무료배송",
          "paymentCondition": "현금",
          "source": "Danawa",
          "url": "https://prod.danawa.com/info/?pcode=122647414",
          "confidence": "B"
        }
      ],
      "automation": {
        "mode": "daily",
        "checkedAt": "2026-09-11T13:07:01+09:00",
        "sourcesAttempted": 1,
        "sourcesSucceeded": 1,
        "observations": [
          {
            "url": "https://prod.danawa.com/info/?pcode=122647414",
            "price": 1486092,
            "checkedAt": "2026-09-11T13:07:01+09:00"
          }
        ]
      }
    }
  ],
  "note": "2026-09-11T13:07:01+09:00 automated daily scan completed. Prices change only when a numeric value is re-verified; Coupang 와우 prices are never inferred."
};
