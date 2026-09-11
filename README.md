# Market Pulse Dashboard

Lenovo Slim 3x 3MTM 가격 모니터링 대시보드입니다.

## 자동 실행

- 매일 오전 10:00 KST: 기본 가격 점검과 정밀 점검을 함께 실행
- 조사 완료 후 GitHub Pages에 자동 배포
- Actions의 **Market Pulse Update → Run workflow**에서 즉시 수동 실행 가능
- 실행할 때마다 `dist/market-data.js`의 조사 시각, 출처별 성공 여부와 검증 가격을 갱신
- 가격 숫자는 페이지에서 재확인된 경우에만 변경
- 쿠팡 와우/회원가는 로그인 검증 없이 추정하지 않음

GitHub Actions 스케줄은 UTC 기준이며 혼잡 시 몇 분 지연될 수 있습니다.


## Acer dashboard

- 10개 Acer MTM 별도 모니터링: `/acer/`
- 매일 오전 10:00 KST 기본+정밀 조사 및 자동 배포
- 동일 MTM·Item ID가 확인된 가격만 현재가로 반영
- 입력 검증 필요: SFG16-74-7412/SFG16-I71-75Y2 URL 중복, SFG16-74-70E9 vendorItemId 길이 이상
