import { describe, it, expect, beforeAll } from 'vitest'
import { buildSelfHealScript } from './event-sender.js'

const TMP_FILE = '/tmp/argos-test-payload.json'
const TMP_DIR = '/tmp/argos-test-dir'
const PROJECT_JSON_PATH = '/repo/.argos/project.json'

describe('buildSelfHealScript', () => {
  let script: string

  beforeAll(() => {
    script = buildSelfHealScript({
      tmpFile: TMP_FILE,
      tmpDir: TMP_DIR,
      projectJsonPath: PROJECT_JSON_PATH,
    })
  })

  it('returns a non-empty string', () => {
    expect(typeof script).toBe('string')
    expect(script.length).toBeGreaterThan(0)
  })

  it('(a) embeds projectJsonPath literal', () => {
    expect(script).toContain(PROJECT_JSON_PATH)
  })

  it('(b) contains body.project.id, orgId, orgSlug shape validation', () => {
    expect(script).toContain('body.project.id')
    expect(script).toContain('body.project.orgId')
    expect(script).toContain('body.project.orgSlug')
    // Shape guard: all three must be string checks
    expect(script).toContain("typeof body.project.id!=='string'")
    expect(script).toContain("typeof body.project.orgId!=='string'")
    expect(script).toContain("typeof body.project.orgSlug!=='string'")
  })

  it('(c) contains renameSync call for atomic write', () => {
    expect(script).toContain('renameSync')
  })

  it('holds an inter-process lock while rewriting project.json', () => {
    expect(script).toContain(`const lockDir=${JSON.stringify(PROJECT_JSON_PATH)}+'.lock'`)
    const mkdirIdx = script.indexOf('fs.mkdirSync(lockDir)')
    const readIdx = script.indexOf(`JSON.parse(fs.readFileSync(${JSON.stringify(PROJECT_JSON_PATH)},'utf8'))`)
    const renameIdx = script.indexOf(`fs.renameSync(atomicTmp,${JSON.stringify(PROJECT_JSON_PATH)})`)
    const releaseIdx = script.indexOf('fs.rmdirSync(lockDir)')

    expect(mkdirIdx).toBeGreaterThanOrEqual(0)
    expect(readIdx).toBeGreaterThan(mkdirIdx)
    expect(renameIdx).toBeGreaterThan(readIdx)
    expect(releaseIdx).toBeGreaterThan(renameIdx)
  })

  it('(d) contains res.status !== 202 guard', () => {
    expect(script).toContain('res.status!==202')
  })

  it('embeds the tmpFile path for reading payload', () => {
    expect(script).toContain(TMP_FILE)
  })

  it('guards against cross-project contamination (body.project.id vs currentConfig.projectId)', () => {
    expect(script).toContain('currentConfig.projectId')
    expect(script).toContain('body.project.id!==currentConfig.projectId')
  })

  it('re-reads the project.json file for race protection', () => {
    // Should read the file a second time (re-read step)
    // The script must contain two references to the projectJsonPath for readFileSync
    const readMatches = script.match(/readFileSync/g)
    expect(readMatches).not.toBeNull()
    expect(readMatches!.length).toBeGreaterThanOrEqual(2)
  })

  it('checks latest.projectId after re-read (race protection step 7)', () => {
    expect(script).toContain('latest.projectId')
  })

  it('contains no-op check for already up-to-date orgId and orgSlug (step 8)', () => {
    expect(script).toContain('latest.orgId===body.project.orgId')
    expect(script).toContain('latest.orgSlug===body.project.orgSlug')
  })

  it('spreads latest to preserve all existing fields (step 9)', () => {
    expect(script).toContain('...latest')
  })

  it('cleans up tmpFile in finally block', () => {
    expect(script).toContain('finally')
    // The tmp file unlink should happen in the finally block
    const finallyIdx = script.indexOf('finally')
    const afterFinally = script.slice(finallyIdx)
    expect(afterFinally).toContain('unlinkSync')
  })

  it('cleans up the private tmp directory in finally block', () => {
    const finallyIdx = script.indexOf('finally')
    const afterFinally = script.slice(finallyIdx)
    expect(afterFinally).toContain(TMP_DIR)
    expect(afterFinally).toContain('rmSync')
    expect(afterFinally).toContain('recursive:true')
    expect(afterFinally).toContain('force:true')
  })

  it('is wrapped in an async IIFE', () => {
    expect(script).toContain('async()')
  })

  it('uses AbortSignal.timeout(10000) for fetch', () => {
    expect(script).toContain('AbortSignal.timeout(10000)')
  })

  it('produces different scripts for different paths', () => {
    const script2 = buildSelfHealScript({
      tmpFile: '/tmp/other.json',
      projectJsonPath: '/other/project.json',
    })
    expect(script2).toContain('/other/project.json')
    expect(script2).not.toContain(PROJECT_JSON_PATH)
  })
})
