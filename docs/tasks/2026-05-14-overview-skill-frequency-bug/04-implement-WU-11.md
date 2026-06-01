# Implement — WU-11

## 변경 요약

`skill-frequency-chart.tsx` 를 검토 전용으로 읽었다. 카피/툴팁 의미 모호성 없음을 확인했다.
- 툴팁 레이블: `calls:` — "skill 호출 횟수" 의미가 명확하며 중의성 없음.
- empty state 문구: `No skill data yet` — 데이터 미존재 상태를 단순명료하게 표현.
- XAxis 레이블: `displaySkill` (16자 truncate + `…`) — 축약 표시이며 hover 시 full name 이 `title` 속성으로 제공.
- Bar `name="calls"` + `dataKey="calls"` — 내부 key 와 툴팁 표시 모두 일관.
코드 변경 없음. plan WU-11 의 "변경 금지" 조건 준수.

## 변경 파일

없음 (검토만)

## 검증 결과

- `git diff -- packages/web/src/components/dashboard/skill-frequency-chart.tsx` 빈 결과 (변경 0줄) 확인.

## 잠재 이슈 / 후속 메모

- `Bar name="calls"` 은 recharts 의 legend 표시에 사용되나 현재 `<Legend />` 컴포넌트가 없으므로 노출 없음. 향후 legend 추가 시 "calls" 레이블 재검토 권고 (예: "Call Count").
- `data.slice(0, 10)` 으로 컴포넌트 자체가 N 을 10 으로 하드코딩. WU-9 에서 route 가 `topSkillsN: 10` 으로 보내는 것과 이중 방어 — 이중 방어 자체는 문제 없으나, overview route 가 5 개만 보낼 경우 chart 가 5 개만 표시하는 점 주의.
