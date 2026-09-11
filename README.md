# Market Pulse Dashboard

Lenovo Slim 3x 3MTM 가격 모니터링 대시보드입니다.

## 자동 실행

- 매일 오전 10:00 KST: 기본 가격 점검
- 월·수·금 오전 10:10 KST: 정밀 점검
- Actions의 **Market Pulse Update → Run workflow**에서 즉시 수동 실행 가능
- 실행할 때마다 `dist/market-data.js`의 조사 시각, 출처별 성공 여부와 검증 가격을 갱신
- 가격 숫자는 페이지에서 재확인된 경우에만 변경
- 쿠팡 와우/회원가는 로그인 검증 없이 추정하지 않음

GitHub Actions 스케줄은 UTC 기준이며 혼잡 시 몇 분 지연될 수 있습니다.
