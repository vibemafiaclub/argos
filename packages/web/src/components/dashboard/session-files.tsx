import { Eye, Pencil, FileText } from 'lucide-react'
import type { FileEntry, SessionFiles } from '@/lib/session-files'

type FilesSummaryProps = {
  files: SessionFiles
  onOpenFilesTab: () => void
}

export function SessionFilesSummary({ files, onOpenFilesTab }: FilesSummaryProps) {
  const modifiedCount = files.modified.length
  const readCount = files.read.length

  if (modifiedCount === 0 && readCount === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {modifiedCount > 0 && (
        <button
          type="button"
          onClick={onOpenFilesTab}
          aria-label={`View ${modifiedCount} modified ${modifiedCount === 1 ? 'file' : 'files'}`}
          className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-1 text-success hover:bg-success/25 transition-colors"
        >
          <Pencil className="h-3 w-3" />
          <span className="font-medium tabular-nums">{modifiedCount}</span>
          <span>{modifiedCount === 1 ? 'file modified' : 'files modified'}</span>
        </button>
      )}
      {readCount > 0 && (
        <button
          type="button"
          onClick={onOpenFilesTab}
          aria-label={`View ${readCount} read ${readCount === 1 ? 'file' : 'files'}`}
          className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-muted-foreground hover:bg-muted/70 transition-colors"
        >
          <Eye className="h-3 w-3" />
          <span className="font-medium tabular-nums">{readCount}</span>
          <span>{readCount === 1 ? 'file read' : 'files read'}</span>
        </button>
      )}
    </div>
  )
}

function splitPath(path: string): { dir: string; base: string } {
  const idx = path.lastIndexOf('/')
  if (idx === -1) return { dir: '', base: path }
  return { dir: path.slice(0, idx + 1), base: path.slice(idx + 1) }
}

type FileRowProps = {
  entry: FileEntry
  unit: 'edit' | 'read'
  onJump: (idx: number) => void
  tone: 'modified' | 'read'
}

function FileRow({ entry, unit, onJump, tone }: FileRowProps) {
  const { dir, base } = splitPath(entry.path)
  const unitLabel =
    entry.count === 1 ? unit : unit === 'edit' ? 'edits' : 'reads'
  const iconTone =
    tone === 'modified' ? 'text-success' : 'text-muted-foreground'
  const countTone =
    tone === 'modified'
      ? 'bg-success/15 text-success'
      : 'bg-muted text-muted-foreground'

  return (
    <button
      type="button"
      onClick={() => onJump(entry.lastEventIdx)}
      title={`${entry.path} — jump to last ${unit}`}
      aria-label={`Jump to last ${unit} in ${entry.path}`}
      className="group w-full text-left flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted/50 transition-colors"
    >
      <FileText className={`h-4 w-4 shrink-0 ${iconTone}`} />
      <span className="min-w-0 flex-1 flex items-baseline gap-1 truncate">
        {dir && (
          <span className="text-xs text-muted-foreground truncate" dir="rtl">
            {dir}
          </span>
        )}
        <span className="text-sm font-medium truncate">
          {base}
        </span>
      </span>
      <span
        className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs tabular-nums ${countTone}`}
      >
        <span className="font-semibold">{entry.count}</span>
        <span>{unitLabel}</span>
      </span>
    </button>
  )
}

type FilesTabProps = {
  files: SessionFiles
  onJump: (idx: number) => void
}

export function SessionFilesTab({ files, onJump }: FilesTabProps) {
  const { modified, read } = files

  if (modified.length === 0 && read.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        No file reads or edits in this session.
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4">
      <section>
        <header className="flex items-center gap-2 mb-2 px-1">
          <Pencil className="h-4 w-4 text-success" />
          <h3 className="text-sm font-semibold">
            Modified
            <span className="ml-1.5 text-xs font-normal text-muted-foreground tabular-nums">
              ({modified.length})
            </span>
          </h3>
        </header>
        {modified.length === 0 ? (
          <p className="px-3 py-2 text-sm text-muted-foreground">
            No files were modified.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {modified.map((entry) => (
              <li key={entry.path}>
                <FileRow
                  entry={entry}
                  unit="edit"
                  onJump={onJump}
                  tone="modified"
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <header className="flex items-center gap-2 mb-2 px-1">
          <Eye className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium text-muted-foreground">
            Read
            <span className="ml-1.5 text-xs font-normal text-muted-foreground tabular-nums">
              ({read.length})
            </span>
          </h3>
        </header>
        {read.length === 0 ? (
          <p className="px-3 py-2 text-sm text-muted-foreground">
            No files were read.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card/60">
            {read.map((entry) => (
              <li key={entry.path}>
                <FileRow
                  entry={entry}
                  unit="read"
                  onJump={onJump}
                  tone="read"
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
