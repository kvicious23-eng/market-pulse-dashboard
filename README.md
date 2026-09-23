# Market Pulse Dashboard

Lenovo, Acer 및 사용자 등록 브랜드의 가격 모니터링 대시보드입니다.

## 자동 실행

- 국내 Windows PC에서 매일 08:00 및 14:00 KST에 Chrome 확장프로그램 수집
- 각 수집 후 30분 뒤인 08:30 및 14:30 KST에 JSON 검증·히스토리 누적·GitHub 업로드
- 업로드 실패 시 Windows 작업 스케줄러가 15분 간격으로 최대 3회 재시도
- GitHub 업로드 후 Actions 검증을 통과하면 Pages에 자동 배포
- Actions의 **Market Pulse Update → Run workflow**에서 즉시 수동 실행 가능
- 실행할 때마다 `/brand/{slug}/market-data.js`의 조사 시각, 출처별 성공 여부와 검증 가격을 갱신
- 가격 숫자는 페이지에서 재확인된 경우에만 변경
- 예약 업로드 로그는 `C:\MarketPulse\reports\scheduled-upload.log`에 남김


## 브랜드 대시보드

- Lenovo: `/brand/lenovo/`
- Acer: `/brand/acer/`
- 신규 브랜드: 상품 관리 화면에서 저장 후 `/brand/{slug}/` 자동 생성
- 브랜드명은 소문자 URL 슬러그로 정규화하며 공백·특수문자는 `-`로 변환
- Lenovo와 Acer도 신규 브랜드와 동일한 `/brand/{slug}/index.html` + `market-data.js` 구조 사용
- 기존 `/`는 `/brand/lenovo/`, `/acer/`는 `/brand/acer/`로 즉시 이동하며 별도 대시보드나 데이터는 운영하지 않음
- 동일 MTM·Item ID가 확인된 가격만 현재가로 반영
