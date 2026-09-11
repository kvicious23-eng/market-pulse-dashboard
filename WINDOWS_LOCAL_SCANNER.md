# 국내 PC 쿠팡 가격 자동수집기

GitHub의 해외 서버에서 차단되는 쿠팡 상품 페이지를 국내 Windows PC의 Chrome 또는 Edge로 확인하고, 검증된 가격만 대시보드에 반영합니다.

## 최초 1회 설치

1. Windows PC에 Chrome 또는 Edge와 Git for Windows가 설치되어 있어야 합니다.
2. 저장소의 `INSTALL_WINDOWS_SCANNER.cmd` 파일을 다운로드해 실행합니다.
3. 첫 실행 중 GitHub 로그인 창이 뜨면 `kvicious23-eng` 계정으로 로그인합니다.

설치가 끝나면 Windows 작업 스케줄러에 `Market Pulse Coupang Price Scan`이 등록되고 매일 오전 10시에 실행됩니다.

## 판정 기준

- 제공된 URL의 정확한 `itemId`가 페이지 데이터에 있어야 합니다.
- 같은 `itemId` 주변의 `salePrice`, `finalPrice`, `discountPrice`, `totalPrice`만 후보로 사용합니다.
- 25만원 미만 또는 700만원 초과 값은 노트북 가격 후보에서 제외합니다.
- 확인 성공 시에만 `현재가 직접 확인`과 가격 확인 시각을 갱신합니다.
- 접근 실패 시 마지막 검증가격을 유지하고 `자동확인 실패`로 표시합니다.
- 개인화 쿠폰, 로그인 전용 와우가, 카드 할인은 일반 공개가격에 합산하지 않습니다.

## 운영 조건

- 오전 10시에 PC가 켜져 있고 인터넷에 연결되어 있어야 합니다.
- Windows 계정에 로그인된 상태에서 실행하는 구성이 가장 안정적입니다.
- Chrome/Edge의 전용 프로필은 `%LOCALAPPDATA%\MarketPulseChrome`에 저장됩니다.

## 수동 시험

설치 폴더에서 다음 파일을 PowerShell로 실행하면 즉시 다시 조사할 수 있습니다.

`scripts\local-coupang-scan.ps1`
