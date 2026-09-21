# 국내 PC 쿠팡 가격 자동수집기

GitHub의 해외 서버에서 차단되는 쿠팡 상품 페이지를 국내 Windows PC의 Chrome으로 확인하고, 검증된 가격만 대시보드에 반영합니다.

## 최초 1회 설치

1. Windows PC에 Chrome과 Git for Windows가 설치되어 있어야 합니다.
2. C드라이브 설치용 압축파일을 풀고 `INSTALL_WINDOWS_SCANNER.cmd`를 실행합니다.
3. 첫 실행 중 GitHub 로그인 창이 뜨면 `kvicious23-eng` 계정으로 로그인합니다.

설치가 끝나면 Windows 작업 스케줄러의 `Market Pulse Chrome Start`가 PC 현지시각 오전 8시에 Chrome을 시작하고, 확장프로그램이 가격·할인 수집을 실행합니다. `Market Pulse Result Upload`는 오전 8시 30분에 결과를 GitHub로 전송합니다. 한국 운영 PC의 Windows 표준 시간대는 `(UTC+09:00) 서울`이어야 합니다.

기존 설치 PC의 예약만 갱신하려면 저장소의 `UPDATE_LOCAL_SCHEDULE.cmd`를 내려받아 한 번 실행합니다. 실행 결과에 `Automatic scan ... 08:00`과 `Result upload ... 08:30`이 표시되면 적용된 것입니다.

## 판정 기준

- 제공된 URL의 정확한 `itemId`가 페이지 데이터에 있어야 합니다.
- 일반 Chrome 상품 화면의 정확한 Item ID와 보이는 가격 요소를 함께 확인합니다.
- 25만원 미만 또는 700만원 초과 값은 노트북 가격 후보에서 제외합니다.
- 확인 성공 시에만 `현재가 직접 확인`과 가격 확인 시각을 갱신합니다.
- 접근 실패 시 마지막 검증가격을 유지하고 `자동확인 실패`로 표시합니다.
- 카드 안내가 있으면 할인율과 카드사를 수집하고, 최대 한도가 표시된 경우에만 한도를 적용합니다.
- 최대 한도 표시가 없으면 카드 할인 전 가격에 수집한 할인율을 그대로 적용합니다.
- 카드 혜택 없음은 0원, 상세정보 미수집은 미확인으로 구분합니다.
- 상세정보 미수집 상태에서는 카드 적용 후 최종 실구매가를 확정하지 않습니다.

## 운영 조건

- Chrome 확장프로그램 화면에서 개발자 모드를 켠 후 `C:\MarketPulse\chrome-extension` 폴더를 `압축해제된 확장 프로그램 로드`로 등록해야 합니다.
- 기존 `%LOCALAPPDATA%\MarketPulseDashboard\chrome-extension` 확장이 남아 있다면 중복 실행을 막기 위해 사용 중지하거나 제거합니다.
- 절전 상태에서는 Windows 깨우기 타이머로 오전 8시 작업을 시도합니다. 완전히 종료된 PC는 작업 스케줄러가 켤 수 없으며, 다음 부팅·로그인 때 `StartWhenAvailable`로 누락 작업을 실행합니다. 실행 시 인터넷 연결이 필요합니다.
- Windows 계정에 로그인된 상태에서 실행하는 구성이 가장 안정적입니다.

## 예약 시간 확인

작업 스케줄러에서 아래 두 항목을 확인합니다.

| 예약 작업 | PC 현지시각 | 역할 |
|---|---:|---|
| `Market Pulse Chrome Start` | 매일 08:00 | Chrome 시작 및 확장프로그램 수집 유도 |
| `Market Pulse Result Upload` | 매일 08:30 | 당일 JSON 검증·대시보드 업로드 |

## 수동 시험

Chrome 도구 모음의 Market Pulse 확장 아이콘을 열고 `지금 수집`을 한 번 누릅니다. 전체 수집 중에는 다시 누르지 않습니다.
