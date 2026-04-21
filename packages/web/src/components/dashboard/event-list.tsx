import { Fragment, useState } from "react";
import { User, Bot, Wrench, ChevronRight } from "lucide-react";
import {
  SLASH_COMMAND_TAG_RE,
  type TimelineEvent,
  type ToolEvent,
} from "@/lib/timeline-events";

type EventListProps = {
  events: TimelineEvent[];
  selectedIdx: number;
  onSelect: (idx: number) => void;
  sessionStartedAt: string;
};

type Group =
  | { kind: "single"; event: TimelineEvent; idx: number }
  | {
      kind: "toolRun";
      toolName: string;
      items: { event: ToolEvent; idx: number }[];
    };

function formatElapsed(timestamp: string, sessionStartedAt: string): string {
  const t = new Date(timestamp).getTime();
  const start = new Date(sessionStartedAt).getTime();
  if (Number.isNaN(t) || Number.isNaN(start)) return "";
  const diffSec = Math.max(0, Math.floor((t - start) / 1000));
  const h = Math.floor(diffSec / 3600);
  const m = Math.floor((diffSec % 3600) / 60);
  const s = diffSec % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function buildGroups(events: TimelineEvent[]): Group[] {
  const groups: Group[] = [];
  let run: {
    toolName: string;
    items: { event: ToolEvent; idx: number }[];
  } | null = null;
  const flush = () => {
    if (run) {
      groups.push({ kind: "toolRun", toolName: run.toolName, items: run.items });
      run = null;
    }
  };
  events.forEach((event, idx) => {
    if (event.kind === "tool" && !event.isSkillCall && !event.isAgentCall) {
      if (run && run.toolName === event.toolName) {
        run.items.push({ event, idx });
      } else {
        flush();
        run = { toolName: event.toolName, items: [{ event, idx }] };
      }
    } else {
      flush();
      groups.push({ kind: "single", event, idx });
    }
  });
  flush();
  return groups;
}

function getSingleLabel(event: TimelineEvent): string {
  if (event.kind === "message") {
    return event.role === "HUMAN" ? "User" : "Agent";
  }
  if (event.isSkillCall && event.skillName) return event.skillName;
  if (event.isAgentCall && event.agentType) return `Agent:${event.agentType}`;
  return "Tool";
}

function getSinglePreview(event: TimelineEvent): string {
  if (event.kind === "message") {
    const normalized = event.content.replace(
      SLASH_COMMAND_TAG_RE,
      (_, name) => `/${name}`,
    );
    const stripped = normalized.replace(/\s+/g, " ").trim();
    return stripped.slice(0, 80);
  }
  if (event.isSkillCall && event.skillName) return `Skill: ${event.skillName}`;
  if (event.isAgentCall && event.agentType) return `Agent: ${event.agentType}`;
  return event.toolName;
}

function getIcon(event: TimelineEvent) {
  if (event.kind === "message") {
    if (event.role === "HUMAN") {
      return { Icon: User, bg: "bg-purple-500" };
    }
    return { Icon: Bot, bg: "bg-blue-500" };
  }
  const isSpecial = event.isSkillCall || event.isAgentCall;
  return { Icon: Wrench, bg: isSpecial ? "bg-amber-500" : "bg-gray-400" };
}

type RowProps = {
  label: string;
  preview: string;
  time: string;
  icon: ReturnType<typeof getIcon>;
  isSelected: boolean;
  onClick: () => void;
  indented?: boolean;
  chevron?: "collapsed" | "expanded";
};

function Row({
  label,
  preview,
  time,
  icon,
  isSelected,
  onClick,
  indented = false,
  chevron,
}: RowProps) {
  const { Icon, bg } = icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left flex items-center gap-3 py-2 transition-colors ${
        indented ? "pl-10 pr-3" : "px-3"
      } ${
        isSelected
          ? "border-l-4 border-purple-500 bg-purple-50"
          : "border-l-4 border-transparent hover:bg-gray-50"
      }`}
    >
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${bg}`}
      >
        <Icon className="h-3 w-3 text-white" />
      </span>
      <span className="w-20 shrink-0 text-sm font-medium truncate">
        {label}
      </span>
      <span className="flex-1 min-w-0 flex items-center gap-1 text-sm text-gray-600">
        {chevron !== undefined && (
          <ChevronRight
            className={`h-3 w-3 shrink-0 transition-transform ${
              chevron === "expanded" ? "rotate-90" : ""
            }`}
          />
        )}
        <span className="truncate">{preview}</span>
      </span>
      <span className="shrink-0 text-xs text-gray-400 tabular-nums">
        {time}
      </span>
    </button>
  );
}

export function EventList({
  events,
  selectedIdx,
  onSelect,
  sessionStartedAt,
}: EventListProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());

  if (events.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-gray-500">
        No events recorded
      </div>
    );
  }

  const groups = buildGroups(events);

  const toggleGroup = (key: number) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <ul className="divide-y divide-gray-100">
      {groups.map((group) => {
        if (group.kind === "single") {
          const { event, idx } = group;
          return (
            <li key={idx}>
              <Row
                label={getSingleLabel(event)}
                preview={getSinglePreview(event)}
                time={formatElapsed(event.timestamp, sessionStartedAt)}
                icon={getIcon(event)}
                isSelected={idx === selectedIdx}
                onClick={() => onSelect(idx)}
              />
            </li>
          );
        }

        if (group.items.length === 1) {
          const { event, idx } = group.items[0];
          return (
            <li key={idx}>
              <Row
                label="Tool"
                preview={event.toolName}
                time={formatElapsed(event.timestamp, sessionStartedAt)}
                icon={getIcon(event)}
                isSelected={idx === selectedIdx}
                onClick={() => onSelect(idx)}
              />
            </li>
          );
        }

        const firstIdx = group.items[0].idx;
        const lastIdx = group.items[group.items.length - 1].idx;
        const containsSelected =
          selectedIdx >= firstIdx && selectedIdx <= lastIdx;
        const isExpanded = expandedGroups.has(firstIdx) || containsSelected;
        const firstEvent = group.items[0].event;

        return (
          <Fragment key={`group-${firstIdx}`}>
            <li>
              <Row
                label="Tool"
                preview={`${group.toolName} x${group.items.length}`}
                time={formatElapsed(firstEvent.timestamp, sessionStartedAt)}
                icon={getIcon(firstEvent)}
                isSelected={false}
                onClick={() => toggleGroup(firstIdx)}
                chevron={isExpanded ? "expanded" : "collapsed"}
              />
            </li>
            {isExpanded &&
              group.items.map(({ event, idx }) => (
                <li key={idx}>
                  <Row
                    label="Tool"
                    preview={event.toolName}
                    time={formatElapsed(event.timestamp, sessionStartedAt)}
                    icon={getIcon(event)}
                    isSelected={idx === selectedIdx}
                    onClick={() => onSelect(idx)}
                    indented
                  />
                </li>
              ))}
          </Fragment>
        );
      })}
    </ul>
  );
}
