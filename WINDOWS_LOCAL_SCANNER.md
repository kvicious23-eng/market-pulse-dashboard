# 국내 PC 쿠팡 가격 자동수집기

GitHub의 해외 서버에서 차단되는 쿠팡 상품 페이지를 국내 Windows PC의 Chrome으로 확인하고, 검증된 가격만 대시보드에 반영합니다.

## 최초 1회 설치

1. Windows PC에 Chrome과 Git for Windows가 설치되어 있어야 합니다.
2. C드라이브 설치용 압축파일을 풀고 `INSTALL_WINDOWS_SCANNER.cmd`를 실행합니다.
3. 첫 실행 중 GitHub 로그인 창이 뜨면 `kvicious23-eng` 계정으로 로그인합니다.

설치가 끝나면 Windows 작업 스케줄러의 `Market Pulse Chrome Start`가 PC 현지시각 08·12·16·20시에 Chrome을 시작하고, 확장프로그램이 가격·할인 수집을 실행합니다. `Market Pulse Result Upload`는 08:30·12:30·16:30·20:30에 각 수집 결과를 GitHub로 전송합니다. 한국 운영 PC의 Windows 표준 시간대는 `(UTC+09:00) 서울`이어야 합니다.

기존 설치 PC의 예약만 갱신하려면 저장소의 `UPDATE_LOCAL_SCHEDULE.cmd`를 내려받아 한 번 실행합니다. 실행 결과에 `Automatic scan ... 08:00, 12:00, 16:00, 20:00`과 `Result upload ... 08:30, 12:30, 16:30, 20:30`이 표시되면 적용된 것입니다.

## 판정 기준

- 등록 URL의 productId·itemId·vendorItemId와 현재 상품 근거를 검증한다. 표시가는 상품 가격 영역의 화면상 최상단 가격이며, 취소선 여부로 우선순위를 바꾸지 않는다.
- 구매 가능 상품은 주문서 동일 상품 및 쿠폰 3종을 검증한다. 확인된 0과 미확인을 구분한다. 품절은 주문서 할인과 최종 실구매가를 계산하지 않고 수집된 카드 조건만 표시한다.
- 구매 가능 상품의 카드별 실제 할인액은 쿠폰 차감 후 금액에 각 할인율과 확인된 한도를 적용해 계산하고 최댓값을 선택한다. 대표 할인율로 대체하지 않는다.
- 카드 혜택은 있으나 계산 조건을 확인하지 못한 상품은 파란 ‘카드할인 재확인 필요’와 카드 적용 전 금액을 게시한다. 검증된 최종가 비교와 가격 알림에서는 제외한다. 카드 외 필수 검증 실패는 게시하지 않는다.
- 자세한 계산·표시 규칙은 PROJECT_RULES.md를 따른다.

## 운영 조건

- Chrome 확장프로그램 화면에서 개발자 모드를 켠 후 `C:\MarketPulse\chrome-extension` 폴더를 `압축해제된 확장 프로그램 로드`로 등록해야 합니다.
- 기존 `%LOCALAPPDATA%\MarketPulseDashboard\chrome-extension` 확장이 남아 있다면 중복 실행을 막기 위해 사용 중지하거나 제거합니다.
- 절전 상태에서는 Windows 깨우기 타이머로 08·12·16·20시 작업을 시도합니다. 완전히 종료된 PC는 작업 스케줄러가 켤 수 없으며, 다음 부팅·로그인 때 `StartWhenAvailable`로 누락 작업을 실행합니다. 실행 시 인터넷 연결이 필요합니다.
- Windows 계정에 로그인된 상태에서 실행하는 구성이 가장 안정적입니다.

## 예약 시간 확인

작업 스케줄러에서 아래 두 항목을 확인합니다.

| 예약 작업 | PC 현지시각 | 역할 |
|---|---:|---|
| `Market Pulse Chrome Start` | 매일 08:00, 12:00, 16:00, 20:00 | Chrome 시작 및 확장프로그램 수집 유도 |
| `Market Pulse Result Upload` | 매일 08:30, 12:30, 16:30, 20:30 | 각 회차 JSON 검증·히스토리 누적·대시보드 업로드 |

## 수동 시험

Chrome 도구 모음의 Market Pulse 확장 아이콘을 열고 `지금 수집`을 한 번 누릅니다. 전체 수집 중에는 다시 누르지 않습니다.


## 현재 적용 및 복구 기준 (2026-10-08)

현재 가격 확장은 Chrome·Edge 1.9.38, Chrome Supplier Connector는 0.1.17이다. 확장 소스 변경이 있을 때만 해당 브라우저 확장을 새로고침한다. Supplier0.1.17은 확장 소스 변경이므로 최신 코드를 받은 뒤 Chrome Supplier Connector를 새로고침해야 한다. 가격 확장1.9.38의 접근 제한 진단을 적용하려면 Chrome과Edge의 가격 확장을 각각 새로고침한다. 예약 변경은 없다.

수집 감시와 업로드는 숨김 PowerShell로 실행하고 로그는 reports/scan-watchdog.log와 reports/scheduled-upload.log에 남긴다. 상품 화면은 일반 브라우저 창이다. 수집 예약은 PT2H/IgnoreNew, 업로드는 PT2H/IgnoreNew 및 같은 슬롯 첫 시도 기준 합산2시간 예산이다. Git 명령은 최대10분 또는 남은 전체 시간 중 짧은 한도를 적용한다. 재시도는15분 간격 최대3회이지만 예산을 초기화하지 않는다.

Edge는 독립 예약 수집을 하지 않는다. 완료 Chrome JSON의 access-check 또는 시작 기록·프로세스 관측으로 입증한 Chrome 종료 때 전체 목록을 다시 수집한다. JSON 누락만으로 자동 전환하지 않는다. 고유 edge-recovery-{실행ID}.json과 전환 영수증을 검증하며 부분 결과를 병합하지 않는다. 세부 조건은 CHROME_RECOVERY.md를 따른다.

PC 자동 부팅07:30 및 바탕화면 로그인은 사용자 설정이다. 현재 자동 종료 예약은23:00이다. 20:30 첫 업로드 시도는 최대22:30까지이며 종료까지30분 여유가 있다. 늦은 시작·계속되는 통신 오류의 게시 성공을 보장하지 않는다.

## Windows 검사 실행

저장소 루트에서 `node scripts/test-line-endings.mjs`를 실행한다. 임시 LF·CRLF 사본 각각에서 모든 JavaScript 회귀 검사를 실행하고 종료 후 제거한다. 검사 소스 읽기만 메모리에서 정규화하며 실제 운영 파일·CSV·BOM 바이트를 바꾸지 않는다. Windows PowerShell5.1 검사와 실제 회차 수집·업로드·Pages 검증은 별도로 수행한다.
