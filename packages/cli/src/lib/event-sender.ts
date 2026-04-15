import { existsSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { spawn } from 'child_process'
import type { IngestEventPayload } from '@argos/shared'

/**
 * Spawn a fully detached background process to POST the event to the API.
 * The caller exits immediately — no network round-trip blocks Claude Code.
 * A temp JSON file is used to pass the payload safely (avoids shell-escaping issues).
 */
export function sendEventBackground(url: string, token: string, payload: IngestEventPayload): void {
  const tmpFile = join(tmpdir(), `argos-${Date.now()}-${Math.random().toString(36).slice(2)}.json`)
  try {
    writeFileSync(tmpFile, JSON.stringify({ url, token, payload }), 'utf8')
    const script = [
      `const fs=require('fs');`,
      `const d=JSON.parse(fs.readFileSync(${JSON.stringify(tmpFile)},'utf8'));`,
      `fetch(d.url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token},body:JSON.stringify(d.payload),signal:AbortSignal.timeout(10000)})`,
      `.catch(()=>{})`,
      `.finally(()=>{try{fs.unlinkSync(${JSON.stringify(tmpFile)})}catch{}})`,
    ].join('')
    const child = spawn(process.execPath, ['-e', script], {
      detached: true,
      stdio: 'ignore',
    })
    child.unref()
  } catch {
    try { if (existsSync(tmpFile)) unlinkSync(tmpFile) } catch {}
  }
}
