'use client'

import { signOut } from 'next-auth/react'

interface EmptyStateProps {
  email: string
}

export function EmptyState({ email }: EmptyStateProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40">
      <div className="w-full max-w-lg space-y-6 p-8 bg-white rounded-xl border shadow-sm">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Argos</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{email}</span>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="text-sm text-red-600 hover:underline"
            >
              Log out
            </button>
          </div>
        </div>

        <hr />

        {/* Empty state message */}
        <div className="space-y-1">
          <h2 className="text-lg font-medium">No projects found</h2>
          <p className="text-sm text-muted-foreground">
            No projects are linked to <strong>{email}</strong>. Follow the steps below to create one with the CLI.
          </p>
        </div>

        {/* CLI instructions */}
        <div className="space-y-3">
          <p className="text-sm font-medium">Getting started</p>
          <ol className="space-y-3 text-sm text-muted-foreground list-none">
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium">1</span>
              <div>
                <p className="text-foreground font-medium">Install the Argos CLI</p>
                <code className="block mt-1 bg-muted px-3 py-1.5 rounded text-xs font-mono">
                  npm install -g @argos-ai/cli
                </code>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium">2</span>
              <div>
                <p className="text-foreground font-medium">Go to your project directory and run</p>
                <code className="block mt-1 bg-muted px-3 py-1.5 rounded text-xs font-mono">
                  cd your-project && argos
                </code>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium">3</span>
              <div>
                <p className="text-foreground font-medium">Log in with the same email shown above</p>
                <p className="mt-0.5 text-xs">
                  The CLI will guide you through login and project creation.
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium">4</span>
              <div>
                <p className="text-foreground font-medium">Refresh this page</p>
                <p className="mt-0.5 text-xs">Your project will appear here once it&apos;s created.</p>
              </div>
            </li>
          </ol>
        </div>
      </div>
    </div>
  )
}
