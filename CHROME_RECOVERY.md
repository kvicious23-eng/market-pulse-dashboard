# Chrome 종료 시 전체 목록 Edge 복구

가격 확장 1.9.33과 Windows 숨김 수집 감시 작업을 함께 적용한다. 접근 제한은 기존 완료 Chrome JSON의 `access-check` 분기를 사용하며, 프로세스 종료는 아래 별도 증거로 판단한다. 두 분기 모두 Edge에서 전체 목록을 새로 수집한다.

## 판단과 실행

1. 08·12·16·20시 `Market Pulse Chrome Start`가 숨김 `run-scheduled-scan.ps1`으로 Chrome을 시작한다. 감시 콘솔만 숨기며 상품 화면은 일반 브라우저 창으로 연다.
2. Chrome 확장은 수집 시작 시 슬롯·실행 ID·시작 시각·전체 활성 목록을 `Downloads\MarketPulse\scan-start.json`에 저장한다. 저장 완료 전에는 첫 상품을 열지 않는다. 부분 가격/주문서 결과·SKUID·계정 정보는 저장하지 않는다.
3. 감시 작업은 Chrome 프로세스를 관측한 뒤 같은 Windows 로그인 세션의 모든 Chrome 프로세스가 10초 간격 두 번 연속 사라졌고 동일 실행의 완료 JSON이 없을 때만 종료 복구를 시작한다. 닫힌 창과 살아 있는 백그라운드 프로세스, 누락 JSON, 확장 오류만으로는 종료라고 하지 않는다. 종료 원인은 미확인이다.
4. 시작 기록의 날짜/슬롯/시작 시각/고유 실행 ID/상품 개수를 검증하고 저장 카탈로그의 활성 브랜드·MTM·productId/itemId/vendorItemId 목록과 비교한다. 시작 기록 누락, 이전 회차, 중복 ID, 0개, 카탈로그 불일치는 자동 복구를 막는다. 실제 저장 카탈로그가 없는 새 프로필의 기본 목록으로 복구하지 않는다.
5. Edge의 동일 확장 설치 후보가 정확히 하나여야 한다. 기존 로그인 프로필로 전체 목록을 전달한다. 별도 `edge-recovery-{실행ID}.json`을 기다리고 Chrome 결과와 병합하지 않는다.
6. Edge 결과의 슬롯·전환 실행 ID·Chrome 시작 실행 ID·전환 후 시작 시각·완료 여부·모든 상품 성공·전체 목록 일치를 확인한다. 수집 중 사용자 목록 변경도 차단한다. 그 뒤 예약 업로더가 기존 가격·주문서 쿠폰·카드 할인·상품 ID·카탈로그 검증을 다시 수행한다.
7. 같은 슬롯 복구가 시작되면 늦은 Chrome 결과는 게시 대상으로 선택하지 않는다. 고유 Edge 파일이 준비되면 30분 뒤의 기존 예약 업로드 또는 그 재시도가 GitHub로 올린다. GitHub Actions의 update/windows_history/deploy와 Pages 성공을 별도로 확인한다.

## 시간과 실패

감시는 시작 후 최대 75분, Edge 결과 대기는 최대 40분이다. 감시 예약 실행 제한은 120분이며 중복 실행은 IgnoreNew다. 업로더는 현재 슬롯을 최대 45분 기다리고 실패 시 기존 15분 간격 3회 재시도를 사용한다. 늦은 복구는 첫 예약 업로드 이후 게시될 수 있으며, 30분 이내 성공을 보장하지 않는다. 시작/완료/실패 증거 없이 임의로 Edge 수집을 반복하지 않는다. 다른 Chrome 프로필이 같은 세션에서 계속 실행 중이면 종료 분기는 보수적으로 동작하지 않는다.

PC 종료·로그아웃 동안 Windows 감시도 실행할 수 없다. 시작 기록 저장 전 종료나 확장 비활성, Chrome이 살아 있는 상태에서 수집만 중단된 경우도 이 종료 복구 분기의 성공 대상이 아니다. 이전 정상 공개 스냅샷을 보존하고 원인을 분리해서 조사한다. 복구 실패 후 같은 슬롯을 재시도해야 한다면 로그/대상/실패 원인을 먼저 확인한다.

## 증거와 보관

- `reports\scan-watchdog.log`: 슬롯 시작, 정상 완료, 프로세스 부재, 복구 요청, 실패.
- `reports\edge-recovery.json`: handoff 시작/목록 일치 결과 준비/실패 상태와 고유 파일 연결. `result-ready`는 게시 완료를 뜻하지 않는다.
- `Downloads\MarketPulse\edge-recovery-{실행ID}.json`: 이번 Edge 전체 결과. 늦은 Chrome 파일로 덮어쓰지 않으며 자동 삭제하지 않는다.
- 공개 브랜드 메타 `recoveryEvidence`: 원인 미확인, 부재 관측 횟수·시각, Chrome/Edge 실행 ID·버전·시각, 대상/결과 개수·전체 목록 일치. 원본 JSON과 SKUID는 게시하지 않는다.
- `scheduled-upload.log`, GitHub 커밋, Actions 및 Pages 성공: 결과 준비 이후 게시의 별도 증거.

정상 Chrome 완료 JSON은 기존 최신 파일 덮어쓰기 규칙을 유지한다. 시작 기록과 로컬 복구 상태는 최신 한 회차를 유지하며 전체 원본 수집 아카이브가 아니다.

## 적용 및 검증 범위

PC에서 최신 코드를 받고 `UPDATE_LOCAL_SCHEDULE.cmd`를 실행한다. Chrome과 Edge의 `C:\MarketPulse\chrome-extension`을 각각 새로고침해 1.9.33을 확인한다. 수집 작업의 실행 프로그램은 Windows PowerShell, 인자는 Hidden과 `run-scheduled-scan.ps1`이어야 한다. 업로드 네 시각은 유지된다.

테스트는 시작 기록 저장 순서, 중단된 기록 다운로드, 완료/이전 회차 제외, 프로세스 관측 조건, 대상 중복/변경, Edge 시간/실행 ID/목록/실패, 늦은 Chrome 결과 배제, 예약 인자를 검사한다. 실제 운영 Chrome을 강제로 종료하거나 쿠팡 접근 차단을 유발하지 않는다. 구현·CI·PC 예약 적용과 실제 자연 발생 Chrome 종료 회차의 성공은 구분한다. 첫 성공 뒤에도 추적을 계속한다.

Supplier Hub CSV는 기존 Chrome 08시 완료 신호를 사용한다. Edge 가격 복구만으로 Supplier Hub 인증/CSV 갱신을 완료했다고 하지 않는다. [PROJECT_RULES.md](PROJECT_RULES.md)와 [SUPPLIER_HUB_STARTUP.md](SUPPLIER_HUB_STARTUP.md)를 함께 따른다.

공개 브랜드 메타 `collectionEvidence`는 새 회차 JSON의 브라우저·실행 버전·슬롯·실행 ID·시작/완료 시각·대상/결과 개수를 보존한다. 설치 버전 확인과 실제 실행 버전은 구분하며 기존 회차에 이 증거를 소급해 만들지 않는다. Edge 수집 회차의 경로 및 설명은 Edge로 표시한다.
