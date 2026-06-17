import { describe, it, expect } from 'vitest'
import { generateSlug } from './slug'

// generateSlug 는 org/project 의 URL slug (/orgs/[orgSlug]) 를 만든다.
// 깨지면 라우팅이 어긋나거나(특수문자 미제거) 한글 전용 이름의 fallback 분기
// (generateUniqueOrgSlug 의 `|| org-<random>`)가 작동하지 않는다 → URL 깨짐.
// 여기서는 generateSlug 의 "현재 동작"을 고정한다. DB 의존 suffix 로직은 대상 아님.

describe('generateSlug', () => {
  it('소문자화 + 공백을 하이픈으로', () => {
    expect(generateSlug('Hello World')).toBe('hello-world')
  })

  it('앞뒤 공백/하이픈을 trim 한다', () => {
    expect(generateSlug('  Leading And Trailing  ')).toBe('leading-and-trailing')
    expect(generateSlug('--dashes--')).toBe('dashes')
  })

  it('연속 공백은 하이픈 하나로 합쳐진다', () => {
    expect(generateSlug('Multiple   Spaces')).toBe('multiple-spaces')
  })

  it('연속 하이픈은 하나로 합쳐진다', () => {
    expect(generateSlug('a---b')).toBe('a-b')
  })

  it('[a-z0-9-] 이외 문자는 제거된다 (URL 안전)', () => {
    expect(generateSlug('My Project 2024!')).toBe('my-project-2024')
    // 점/언더스코어/물음표 등은 하이픈이 아니라 "삭제" 된다 (공백과 다른 처리)
    expect(generateSlug('a.b_c?d')).toBe('abcd')
  })

  it('악센트/비ASCII 문자는 제거된다', () => {
    expect(generateSlug('Café')).toBe('caf')
  })

  // 의도된 i18n 분기: 영숫자가 하나도 안 남으면 빈 문자열을 반환해
  // 호출자가 `org-<random>` / `project-<random>` fallback 으로 대체하게 한다.
  it('영숫자가 하나도 없으면 빈 문자열을 반환한다 (fallback 트리거)', () => {
    expect(generateSlug('한글만')).toBe('')
    expect(generateSlug('###')).toBe('')
    expect(generateSlug('   ')).toBe('')
    expect(generateSlug('')).toBe('')
  })
})
