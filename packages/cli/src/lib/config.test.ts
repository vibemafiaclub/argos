import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import type * as OsModule from 'os'

const homedirMock = vi.hoisted(() => vi.fn<() => string>())

vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof OsModule>()
  return { ...actual, homedir: homedirMock }
})

const { tmpdir } = await import('os')
const {
  DEFAULT_API_URL,
  deleteConfig,
  getConfigPath,
  normalizeApiUrl,
  readConfig,
  writeConfig,
} = await import('./config.js')

let fakeHome: string

beforeEach(() => {
  fakeHome = mkdtempSync(join(tmpdir(), 'argos-config-test-'))
  homedirMock.mockReturnValue(fakeHome)
})

afterEach(() => {
  rmSync(fakeHome, { recursive: true, force: true })
})

describe('normalizeApiUrl', () => {
  it('빈 값(undefined/null/빈 문자열)은 undefined 를 반환한다', () => {
    expect(normalizeApiUrl(undefined)).toBeUndefined()
    expect(normalizeApiUrl(null)).toBeUndefined()
    expect(normalizeApiUrl('')).toBeUndefined()
  })

  it('기본 서비스 호스트(argos-ai.xyz 와 모든 서브도메인)는 undefined 로 정규화한다', () => {
    expect(normalizeApiUrl('https://argos-ai.xyz')).toBeUndefined()
    expect(normalizeApiUrl('https://www.argos-ai.xyz')).toBeUndefined()
    expect(normalizeApiUrl('https://api.argos-ai.xyz/path?q=1')).toBeUndefined()
    expect(normalizeApiUrl(DEFAULT_API_URL)).toBeUndefined()
  })

  it('argos-ai.xyz 로 끝나지만 서브도메인이 아닌 호스트는 커스텀으로 유지한다', () => {
    expect(normalizeApiUrl('https://myargos-ai.xyz')).toBe('https://myargos-ai.xyz')
  })

  it('커스텀 URL 은 그대로 반환한다 (원본 문자열 보존)', () => {
    expect(normalizeApiUrl('https://argos.example.com')).toBe('https://argos.example.com')
    expect(normalizeApiUrl('http://localhost:3000')).toBe('http://localhost:3000')
    expect(normalizeApiUrl('http://localhost:3000/base/')).toBe('http://localhost:3000/base/')
  })

  it('URL 로 파싱 불가능한 문자열은 undefined 를 반환한다', () => {
    expect(normalizeApiUrl('not a url')).toBeUndefined()
  })

  // TODO(bug): `localhost:3000` 은 new URL() 이 protocol='localhost:' 로 파싱해
  // 예외가 발생하지 않으므로 hostname='' 인 채로 커스텀 URL 로 통과한다.
  // 이후 fetch 단계에서야 깨진다. http(s) 프로토콜 검증이 없다. 현재 동작을 고정한다.
  it('scheme 없는 host:port 문자열은 걸러지지 않고 그대로 통과한다 (현재 동작)', () => {
    expect(normalizeApiUrl('localhost:3000')).toBe('localhost:3000')
  })
})

describe('readConfig / writeConfig / deleteConfig', () => {
  const config = {
    token: 'tok-1',
    userId: 'user-1',
    email: 'a@b.co',
  }

  it('config 파일이 없으면 null 을 반환한다', () => {
    expect(readConfig()).toBeNull()
  })

  it('writeConfig 는 ~/.argos 디렉토리를 만들고 JSON 으로 기록한다', () => {
    writeConfig(config)
    const raw = JSON.parse(readFileSync(getConfigPath(), 'utf8'))
    expect(raw).toEqual(config)
  })

  it('round-trip: 기록한 config 를 그대로 읽는다', () => {
    writeConfig({ ...config, apiUrl: 'https://argos.example.com' })
    expect(readConfig()).toEqual({ ...config, apiUrl: 'https://argos.example.com' })
  })

  it('기본 서비스를 가리키는 apiUrl 은 읽을 때 제거된다', () => {
    writeConfig({ ...config, apiUrl: 'https://www.argos-ai.xyz' })
    const read = readConfig()
    expect(read).not.toBeNull()
    expect(read?.apiUrl).toBeUndefined()
  })

  it('JSON 이 깨져 있으면 null 을 반환한다 (예외를 던지지 않는다)', () => {
    mkdirSync(join(fakeHome, '.argos'), { recursive: true })
    writeFileSync(getConfigPath(), '{ not valid json', 'utf8')
    expect(readConfig()).toBeNull()
  })

  it('deleteConfig 는 파일을 지우고, 없어도 에러가 나지 않는다', () => {
    writeConfig(config)
    expect(existsSync(getConfigPath())).toBe(true)
    deleteConfig()
    expect(existsSync(getConfigPath())).toBe(false)
    expect(() => deleteConfig()).not.toThrow()
  })
})
