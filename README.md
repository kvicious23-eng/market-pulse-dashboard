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

현재 가격 확장은 Chrome·Edge·Whale1.9.44, Supplier Connector0.1.20이다. PC 자동 종료는23:00이며20:30 업로드 최대22:30 종료 후30분 여유가 있다. PROJECT_RULES.md를 기준으로 WINDOWS_LOCAL_SCANNER.md, CHROME_RECOVERY.md, SUPPLIER_HUB_STARTUP.md를 함께 따른다. `node scripts/test-line-endings.mjs`는 임시 LF/CRLF 소스 각각에서 JavaScript 검사를 실행한다. CI는 Ubuntu와 Windows에서 같은 검사를 수행하고 Windows PowerShell5.1 검사도 별도로 통과해야 Pages에 배포한다.


## Whale을 포함한 업데이트 완료 기준

모든 Market Pulse 변경은 Chrome·Edge·Whale 영향을 함께 확인한다. 가격 확장 변경 시 세 브라우저에 같은 최신 소스를 적용하고 수집이 없는 안전한 시점에 각각 maintenance 재로드 및 별도 verify 영수증으로 실행 버전·관측 권한·다운로드를 확인한다. Chrome 예약4개, Edge·Whale 예약0개를 유지한다. 수집 중/상태 불명확 시 강제 종료하지 않고 보류를 보고한다. 상품/브랜드/식별자 변경은 Whale 별도 목록에도 검증된 최신 카탈로그를 반영한다.

확장 외 변경에는 필요한 영향 검토만 수행하며 불필요한 재로드·중복 수집은 하지 않는다. Supplier는 Chrome에서만 운영한다. Whale은 예비 수동 검증용이며 자동 복구/운영 가격 게시에는 추가하지 않는다. 세부 완료 조건은 PROJECT_RULES.md의 ‘모든 업데이트의 Whale 동시 반영’을 따른다.


## 2026-10-21부터12시 Whale 기본 수집

가격1.9.44는08/16/20 Chrome,12시 Whale, 실패 증거가 확인된 경우 전체 목록 Edge 복구로 운영한다. 기존 Windows 작업 이름은 유지하되12시 실행 대상은 Whale이다. Chrome 확장12시 알람/따라잡기를 제거하며 Chrome 알람3개, Edge·Whale 확장 알람0개를 확인한다. Whale은 Windows가 최신 공용 목록과 고유 요청ID를 전달하는 내부 primary 페이지에서만12시 예약 수집을 시작한다.

운영 업로더는 Whale의12시 예약 파일과Windows 요청 기록·슬롯·시각·버전·전체 목록을 대조한다. Whale 수동 검증 파일은 운영 게시에서 제외한다. 접근 제한 재시도 후 Edge, 증거 있는 프로세스 종료/저장 오류 복구와 모델별 파란 오류 표시는 PROJECT_RULES.md의 최신 ‘12시 Whale 기본 수집 전환’을 따른다. Supplier는 Chrome에서 독립적으로 유지한다. 이전 절의Chrome 네 예약/Whale 예비 전용 정책은 이 절로 대체하며 첫 무인12시와 자연 복구의 성공은 따로 확인한다.
