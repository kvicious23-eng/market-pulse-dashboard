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

현재 가격 확장은 Chrome·Edge·Whale1.9.49, Supplier Connector0.1.21이다. PC 자동 종료는23:00이며20:30 업로드 최대22:30 종료 후30분 여유가 있다. PROJECT_RULES.md를 기준으로 WINDOWS_LOCAL_SCANNER.md, CHROME_RECOVERY.md, SUPPLIER_HUB_STARTUP.md를 함께 따른다. `node scripts/test-line-endings.mjs`는 임시 LF/CRLF 소스 각각에서 JavaScript 검사를 실행한다. CI는 Ubuntu와 Windows에서 같은 검사를 수행하고 Windows PowerShell5.1 검사도 별도로 통과해야 Pages에 배포한다.


## Whale을 포함한 업데이트 완료 기준

모든 Market Pulse 변경은 Chrome·Edge·Whale 영향을 함께 확인한다. 가격 확장 변경 시 세 브라우저에 같은 최신 소스를 적용하고 수집이 없는 안전한 시점에 각각 maintenance 재로드 및 별도 verify 영수증으로 실행 버전·관측 권한·다운로드를 확인한다. Chrome 예약4개, Edge·Whale 예약0개를 유지한다. 수집 중/상태 불명확 시 강제 종료하지 않고 보류를 보고한다. 상품/브랜드/식별자 변경은 Whale 별도 목록에도 검증된 최신 카탈로그를 반영한다.

확장 외 변경에는 필요한 영향 검토만 수행하며 불필요한 재로드·중복 수집은 하지 않는다. Supplier는 Chrome에서만 운영한다. Whale은 예비 수동 검증용이며 자동 복구/운영 가격 게시에는 추가하지 않는다. 세부 완료 조건은 PROJECT_RULES.md의 ‘모든 업데이트의 Whale 동시 반영’을 따른다.


## 2026-10-21부터12시 Whale 기본 수집

가격1.9.44는08/16/20 Chrome,12시 Whale, 실패 증거가 확인된 경우 전체 목록 Edge 복구로 운영한다. 기존 Windows 작업 이름은 유지하되12시 실행 대상은 Whale이다. Chrome 확장12시 알람/따라잡기를 제거하며 Chrome 알람3개, Edge·Whale 확장 알람0개를 확인한다. Whale은 Windows가 최신 공용 목록과 고유 요청ID를 전달하는 내부 primary 페이지에서만12시 예약 수집을 시작한다.

운영 업로더는 Whale의12시 예약 파일과Windows 요청 기록·슬롯·시각·버전·전체 목록을 대조한다. Whale 수동 검증 파일은 운영 게시에서 제외한다. 접근 제한 재시도 후 Edge, 증거 있는 프로세스 종료/저장 오류 복구와 모델별 파란 오류 표시는 PROJECT_RULES.md의 최신 ‘12시 Whale 기본 수집 전환’을 따른다. Supplier는 Chrome에서 독립적으로 유지한다. 이전 절의Chrome 네 예약/Whale 예비 전용 정책은 이 절로 대체하며 첫 무인12시와 자연 복구의 성공은 따로 확인한다.

가격1.9.45의12시 Whale 실행은 짧은 내부 URL과 `chrome-extension/runtime/noon-request.json`의 요청ID·회차·전체 목록을 대조한다. runtime은 PC 전용이며Git에서 제외한다. 접수/거부 영수증과120초 시작 증거 한도를 사용하며 `verify=1`은 전달만 검사하고 가격을 수집/게시하지 않는다.

가격1.9.46: 12시Whale운영은Chrome의동일시각반복접근가설에대해브라우저를분산하는사용자운영방침이며차단원인확정이아니다. 기본08/16/20Chrome·12Whale와독립Supplier를유지하고12시Chrome자동대체는추가하지않는다. Whale은접수페이지가진행을감시하고중단된같은요청을1회만재시도한다. 6분진행정지에는협조중단을요청하고실제비실행확인전에는재수집/Edge를시작하지않는다. 2분내중단미확인은자동복구를중단한다. 1회재시도후에도실패하면handoff를고정하고증거를검증해전체Edge로전환한다. Windows전달페이지재실행은별도최대1회이며기존요청/실행잠금으로동시수집을막는다. 처음요청부터2시간/다음슬롯예산을유지한다. 수집전용창소실시1회재생성,빈활성카탈로그정리,Edge짧은파일전달/모든전환사유공통잠금도적용한다. Whale/Edge의verify=1은전달검증만하고가격수집·게시를하지않는다. 자연예약과자연복구성공은합성/수동검증과구분한다.

가격1.9.47은Whale예약수집에서타임아웃후남은비동기작업이실제로끝날때까지실행중으로추적해중복수집/조기Edge전환/재로드를차단한다. 가격계산과수동수집정책은유지한다.

가격1.9.48은 Whale 감시 영수증 저장 실패를 수집 거부와 분리한다. 기본 저장 실패 시 요청ID·페이지ID·순번을 포함한 고유 경로로1회 재시도하고, 모두 실패해도 실제 worker 감시를 계속한다. Windows는 같은 회차/요청/페이지 실행의 유효 기록을 사건 시각으로 선택한다. 시작 증거가 있으면 페이지 재호출1회 뒤 감시 저하 상태로 완료 파일/프로세스 확인을 원래 기한까지 유지하며, 영수증 누락만으로 Edge를 시작하지 않는다. 수집 중 재로드 금지와 세 브라우저별 적용/verify는 유지한다.

2026-10-26 20시부터 가격1.9.49는 Chrome08/16·Whale12/20으로 운영한다. 공유 scan-policy.js의 효력시각/정책ID를 worker와 Windows가 함께 사용하고, 요청·시작·감시·Whale Edge 영수증은 슬롯/요청별로 격리한다. Chrome20시 알람/따라잡기를 차단하며 Whale 실패의 자동 Chrome 대체와 모델별 Edge 복구는 추가하지 않는다. 최초 요청부터2시간,20시 늦은 시작은22:20 상한,업로드22:30/PC종료23:00을 유지한다. 세 브라우저 각각 수집 비실행 확인→재로드→별도verify가 필요하다. 검증전용 전달 검사는 실제 예약수집 성공과 구분한다.
