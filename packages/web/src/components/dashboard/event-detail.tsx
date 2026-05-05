import type { TimelineEvent, ToolEvent } from "@/lib/timeline-events";
import { formatDateTime } from "@/lib/format";
import { User, Bot, Wrench, X } from "lucide-react";
import { MarkdownContent } from "./markdown-content";

function formatDurationMs(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(2)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = ((ms % 60_000) / 1000).toFixed(1);
  return `${mins}m ${secs}s`;
}

function ToolEventBody({ event }: { event: ToolEvent }) {
  const inputPretty = event.toolInput
    ? JSON.stringify(event.toolInput, null, 2)
    : "(none)";

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Tool</dt>
        <dd className="font-medium">{event.toolName}</dd>
        <dt className="text-muted-foreground">Duration</dt>
        <dd className="tabular-nums">
          {formatDurationMs(event.durationMs)}
        </dd>
      </dl>

      {(event.isSkillCall || event.isAgentCall) && (
        <div className="flex flex-wrap gap-2">
          {event.isSkillCall && event.skillName && (
            <span className="inline-flex items-center rounded-full bg-brand-subtle px-2 py-0.5 text-xs text-brand">
              Skill: {event.skillName}
            </span>
          )}
          {event.isAgentCall && event.agentType && (
            <span className="inline-flex items-center rounded-full bg-brand-2-subtle px-2 py-0.5 text-xs text-brand-2">
              Subagent: {event.agentType}
            </span>
          )}
        </div>
      )}

      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Input
        </div>
        <pre className="overflow-x-auto rounded-md bg-background border border-border p-3 text-xs text-foreground">
          <code>{inputPretty}</code>
        </pre>
      </div>

      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Output
        </div>
        {event.content ? (
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-xs text-foreground">
            <code>{event.content}</code>
          </pre>
        ) : (
          <p className="text-xs text-muted-foreground">(no output captured)</p>
        )}
      </div>
    </div>
  );
}

type EventDetailProps = {
  event: TimelineEvent | null;
  onClose?: () => void;
};

function getHeaderIcon(event: TimelineEvent) {
  if (event.kind === "message") {
    if (event.role === "HUMAN") {
      return { Icon: User, bg: "bg-brand" };
    }
    return { Icon: Bot, bg: "bg-brand-2" };
  }
  const isSpecial = event.isSkillCall || event.isAgentCall;
  return { Icon: Wrench, bg: isSpecial ? "bg-chart-4" : "bg-muted-foreground" };
}

function getHeaderLabel(event: TimelineEvent): string {
  if (event.kind === "message") {
    return event.role === "HUMAN" ? "User" : "Agent";
  }
  if (event.isAgentCall) return "Subagent";
  return event.toolName;
}

function getHeaderSubLabel(event: TimelineEvent): string | null {
  if (event.kind !== "tool") return null;
  if (event.isSkillCall && event.skillName) return `Skill: ${event.skillName}`;
  if (event.isAgentCall && event.agentType) return `Subagent: ${event.agentType}`;
  return null;
}

export function EventDetail({ event, onClose }: EventDetailProps) {
  if (event === null) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          Select an event to see details
        </div>
      </div>
    );
  }

  const { Icon, bg } = getHeaderIcon(event);
  const label = getHeaderLabel(event);
  const subLabel = getHeaderSubLabel(event);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${bg}`}
          >
            <Icon className="h-3.5 w-3.5 text-background" />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{label}</div>
            {subLabel && (
              <div className="text-xs text-muted-foreground truncate">{subLabel}</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatDateTime(event.timestamp)}
          </span>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close event details"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Content
        </div>
        {event.kind === "message" ? (
          <MarkdownContent>{event.content}</MarkdownContent>
        ) : (
          <ToolEventBody event={event} />
        )}
      </div>
    </div>
  );
}
