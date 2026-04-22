interface EmptyWeekStateProps {
  title?: string
  message: string
  action?: React.ReactNode
}

export function EmptyWeekState({
  title = '데이터 없음',
  message,
  action,
}: EmptyWeekStateProps) {
  return (
    <div className="rounded-xl bg-card ring-1 ring-foreground/10 p-12 text-center">
      <h2 className="text-lg font-medium mb-2">{title}</h2>
      <p className="text-sm text-muted-foreground mb-4">{message}</p>
      {action}
    </div>
  )
}
