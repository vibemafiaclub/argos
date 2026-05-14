import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { spawn } from 'child_process'
import type { IngestEventPayload } from '@argos/shared'

/**
 * Config snapshot captured at hook invocation time.
 * Only the fields needed for self-heal comparison.
 */
export interface CurrentConfig {
  projectId: string
  orgId: string
  orgSlug: string
  [key: string]: unknown
}

/**
 * Options for sendEventBackground (new opts-based form).
 * projectJsonPath must be the absolute path discovered by findProjectConfig traversal.
 */
export interface SendEventBackgroundOpts {
  url: string
  token: string
  payload: IngestEventPayload
  /** Absolute path to .argos/project.json as found by findProjectConfig traversal. */
  projectJsonPath: string
  /** Snapshot of the config at hook invocation time. */
  currentConfig: CurrentConfig
}

/**
 * Build the inline JS script string for the detached child process.
 * The child performs the self-heal logic:
 *   1. Read tmp file → restore opts
 *   2. POST to /api/events with AbortSignal.timeout(10000)
 *   3. Only proceed on status 202 (self-heal contract from WU-4)
 *   4. Validate JSON shape: body.project.{id,orgId,orgSlug} must all be strings
 *   5. Guard: body.project.id must match currentConfig.projectId (cross-project contamination)
 *   6. Re-read projectJsonPath (race protection for concurrent hooks)
 *   7. Guard: latest.projectId must still match body.project.id
 *   8. No-op if orgId + orgSlug already match (idempotent)
 *   9. Merge new orgId/orgSlug into existing config (preserve all other fields)
 *  10. Atomic write via tmp file + renameSync
 *
 * All errors are swallowed silently (ADR-006 fire-and-forget).
 * No external module imports (constraint: inline child script, Decision-7).
 */
export function buildSelfHealScript({
  tmpFile,
  tmpDir,
  projectJsonPath,
}: {
  tmpFile: string
  tmpDir?: string
  projectJsonPath: string
}): string {
  // Serialize paths as JSON so they are safely embedded in the script string.
  const tmpFileJson = JSON.stringify(tmpFile)
  const tmpDirJson = tmpDir ? JSON.stringify(tmpDir) : 'null'
  const projectJsonPathJson = JSON.stringify(projectJsonPath)

  return [
    `const fs=require('fs');`,
    `(async()=>{`,
    `try{`,
    // Step 1: Read tmp file and restore opts
    `const d=JSON.parse(fs.readFileSync(${tmpFileJson},'utf8'));`,
    `const {url,token,payload,currentConfig}=d;`,
    // Step 2: POST to /api/events
    `let res;`,
    `try{res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify(payload),signal:AbortSignal.timeout(10000)});}catch{return;}`,
    // Step 3: Only proceed on status 202
    `if(res.status!==202)return;`,
    // Step 4: Parse JSON and validate shape
    `let body;`,
    `try{body=await res.json();}catch{return;}`,
    `if(!body||!body.project||typeof body.project.id!=='string'||typeof body.project.orgId!=='string'||typeof body.project.orgSlug!=='string')return;`,
    // Step 5: Guard — must be for the same project (cross-project contamination check)
    `if(body.project.id!==currentConfig.projectId)return;`,
    // Step 6: Re-read projectJsonPath (race protection for concurrent hooks)
    `let latest;`,
    `try{latest=JSON.parse(fs.readFileSync(${projectJsonPathJson},'utf8'));}catch{return;}`,
    // Step 7: Guard — projectId must still match after re-read
    `if(latest.projectId!==body.project.id)return;`,
    // Step 8: No-op if already up to date (idempotent)
    `if(latest.orgId===body.project.orgId&&latest.orgSlug===body.project.orgSlug)return;`,
    // Step 9: Merge new orgId/orgSlug, preserving all other fields and key order
    `const updated={...latest,orgId:body.project.orgId,orgSlug:body.project.orgSlug};`,
    // Step 10: Atomic write via tmp + renameSync
    `const atomicTmp=${projectJsonPathJson}+'.tmp.'+process.pid+'.'+Math.random().toString(36).slice(2);`,
    `try{`,
    `fs.writeFileSync(atomicTmp,JSON.stringify(updated,null,2),'utf8');`,
    `fs.renameSync(atomicTmp,${projectJsonPathJson});`,
    `}catch{try{fs.unlinkSync(atomicTmp);}catch{}}`,
    `}catch{}`,
    // Cleanup tmp file/dir in finally (runs whether self-heal succeeded or any early return)
    `finally{try{fs.unlinkSync(${tmpFileJson});}catch{};if(${tmpDirJson})try{fs.rmSync(${tmpDirJson},{recursive:true,force:true});}catch{}}`,
    `})()`,
  ].join('')
}

/**
 * Spawn a fully detached background process to POST the event to the API
 * and self-heal the .argos/project.json if the server indicates the project
 * has moved to a different org.
 *
 * The caller exits immediately — no network round-trip blocks Claude Code (ADR-005).
 * All errors in the child are swallowed silently (ADR-006 fire-and-forget).
 * A temp JSON file is used to pass the payload safely (avoids shell-escaping issues).
 */
export function sendEventBackground(opts: SendEventBackgroundOpts): void {
  const { url, token, payload, projectJsonPath, currentConfig } = opts

  let tmpDir: string | undefined
  try {
    tmpDir = mkdtempSync(join(tmpdir(), 'argos-'))
    const tmpFile = join(tmpDir, 'payload.json')
    writeFileSync(
      tmpFile,
      JSON.stringify({ url, token, payload, projectJsonPath, currentConfig }),
      'utf8',
    )

    const script = buildSelfHealScript({ tmpFile, tmpDir, projectJsonPath })

    const child = spawn(process.execPath, ['-e', script], {
      detached: true,
      stdio: 'ignore',
    })
    child.unref()
  } catch {
    try {
      if (tmpDir) rmSync(tmpDir, { recursive: true, force: true })
    } catch {}
  }
}
