# Market Pulse Dashboard

Lenovo, Acer 및 사용자 등록 브랜드의 가격 모니터링 대시보드입니다.

## 자동 실행

- 국내 Windows PC에서 매일 08:00·12:00·16:00·20:00 KST에 Chrome 확장프로그램 수집
- 각 수집 후 30분 뒤인 08:30·12:30·16:30·20:30 KST에 JSON 검증·히스토리 누적·GitHub 업로드
- 업로드 실패 시 Windows 작업 스케줄러가 15분 간격으로 최대 3회 재시도. 같은 슬롯 첫 시도부터 합산 최대2시간이며 Git 명령은 최대10분/남은 예산 제한
- GitHub 업로드 후 Actions 검증을 통과하면 Pages에 자동 배포
- Actions의 **Market Pulse Update → Run workflow**는 공개 데이터 조사 작업이다. PC의 주문서 가격 수집·Supplier 인증/CSV 작업을 원격 실행하는 기능은 아니다
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


## 운영 문서와 검사

현재 가격 확장은 Chrome·Edge1.9.37, Supplier Connector0.1.16이다. PC 자동 종료는23:00이며20:30 업로드 최대22:30 종료 후30분 여유가 있다. PROJECT_RULES.md를 기준으로 WINDOWS_LOCAL_SCANNER.md, CHROME_RECOVERY.md, SUPPLIER_HUB_STARTUP.md를 함께 따른다. `node scripts/test-line-endings.mjs`는 임시 LF/CRLF 소스 각각에서 JavaScript 검사를 실행한다. CI는 Ubuntu와 Windows에서 같은 검사를 수행하고 Windows PowerShell5.1 검사도 별도로 통과해야 Pages에 배포한다.
