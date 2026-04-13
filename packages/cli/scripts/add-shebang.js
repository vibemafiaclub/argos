#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const indexPath = join(__dirname, '..', 'dist', 'index.js')
const content = readFileSync(indexPath, 'utf8')

if (!content.startsWith('#!/usr/bin/env node')) {
  writeFileSync(indexPath, '#!/usr/bin/env node\n' + content)
  console.log('✓ Added shebang to dist/index.js')
}
