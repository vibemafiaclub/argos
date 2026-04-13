export default function ProjectOverviewPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Overview</h2>
        <p className="text-muted-foreground">Project metrics and usage statistics</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Total Sessions</p>
          <p className="text-2xl font-bold">—</p>
        </div>
        <div className="border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Active Users</p>
          <p className="text-2xl font-bold">—</p>
        </div>
        <div className="border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Total Tokens</p>
          <p className="text-2xl font-bold">—</p>
        </div>
        <div className="border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Estimated Cost</p>
          <p className="text-2xl font-bold">—</p>
        </div>
      </div>
      <div className="border rounded-lg p-6">
        <p className="text-center text-muted-foreground">
          No data yet. Start using Claude Code with the Argos CLI to see metrics.
        </p>
      </div>
    </div>
  )
}
