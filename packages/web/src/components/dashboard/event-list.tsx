import { useMemo } from "react";
import { List, type RowComponentProps } from "react-window";
import { User, Bot, Wrench, ChevronRight } from "lucide-react";
import {
  SLASH_COMMAND_TAG_RE,
  buildTimelineGroups,
  type TimelineEvent,
} from "@/lib/timeline-events";
import { cn } from "@/lib/utils";

type EventListProps = {
  events: TimelineEvent[];
  selectedIdx: number;
  onSelect: (idx: number) => void;
  sessionStartedAt: string;
  expandedGroups: Set<number>;
  onToggleGroup: (firstIdx: number) => void;
};

type FlatRow =
  | {
      kind: "event";
      key: string;
      event: TimelineEvent;
      idx: number;
      indented: boolean;
      labelOverride?: string;
    }
  | {
      kind: "groupHeader";
      key: string;
      toolName: string;
      count: number;
      firstEvent: TimelineEvent;
      groupFirstIdx: number;
      isExpanded: boolean;
    };

const ROW_HEIGHT = 36;

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

function buildFlatRows(
  events: TimelineEvent[],
  expandedGroups: Set<number>,
  selectedIdx: number,
): FlatRow[] {
  const groups = buildTimelineGroups(events);
  const rows: FlatRow[] = [];
  for (const group of groups) {
    if (group.kind === "single") {
      rows.push({
        kind: "event",
        key: `s-${group.idx}`,
        event: group.event,
        idx: group.idx,
        indented: false,
      });
      continue;
    }
    if (group.items.length === 1) {
      const { event, idx } = group.items[0];
      rows.push({
        kind: "event",
        key: `gs-${idx}`,
        event,
        idx,
        indented: false,
        labelOverride: "Tool",
      });
      continue;
    }
    const firstIdx = group.items[0].idx;
    const lastIdx = group.items[group.items.length - 1].idx;
    const containsSelected = selectedIdx >= firstIdx && selectedIdx <= lastIdx;
    const isExpanded = expandedGroups.has(firstIdx) || containsSelected;
    rows.push({
      kind: "groupHeader",
      key: `gh-${firstIdx}`,
      toolName: group.toolName,
      count: group.items.length,
      firstEvent: group.items[0].event,
      groupFirstIdx: firstIdx,
      isExpanded,
    });
    if (isExpanded) {
      for (const { event, idx } of group.items) {
        rows.push({
          kind: "event",
          key: `gc-${idx}`,
          event,
          idx,
          indented: true,
          labelOverride: "Tool",
        });
      }
    }
  }
  return rows;
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
      return { Icon: User, bg: "bg-brand" };
    }
    return { Icon: Bot, bg: "bg-brand-2" };
  }
  const isSpecial = event.isSkillCall || event.isAgentCall;
  return { Icon: Wrench, bg: isSpecial ? "bg-chart-4" : "bg-muted-foreground" };
}

type RowViewProps = {
  label: string;
  preview: string;
  time: string;
  icon: ReturnType<typeof getIcon>;
  isSelected: boolean;
  onClick: () => void;
  indented?: boolean;
  chevron?: "collapsed" | "expanded";
};

function RowView({
  label,
  preview,
  time,
  icon,
  isSelected,
  onClick,
  indented = false,
  chevron,
}: RowViewProps) {
  const { Icon, bg } = icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full h-full text-left flex items-center gap-3 py-2 border-b border-border/60 transition-colors",
        indented ? "pl-10 pr-3" : "px-3",
        isSelected
          ? "border-l-2 border-l-brand bg-brand-subtle"
          : "border-l-2 border-l-transparent hover:bg-muted/50",
      )}
    >
      <span
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
          bg,
        )}
      >
        <Icon className="h-3 w-3 text-background" />
      </span>
      <span className="w-20 shrink-0 text-sm font-medium truncate">
        {label}
      </span>
      <span className="flex-1 min-w-0 flex items-center gap-1 text-sm text-muted-foreground">
        {chevron !== undefined && (
          <ChevronRight
            className={cn(
              "h-3 w-3 shrink-0 transition-transform",
              chevron === "expanded" && "rotate-90",
            )}
          />
        )}
        <span className="truncate">{preview}</span>
      </span>
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
        {time}
      </span>
    </button>
  );
}

type RowProps = {
  rows: FlatRow[];
  selectedIdx: number;
  sessionStartedAt: string;
  onSelect: (idx: number) => void;
  onToggleGroup: (firstIdx: number) => void;
};

function Row({
  index,
  style,
  rows,
  selectedIdx,
  sessionStartedAt,
  onSelect,
  onToggleGroup,
}: RowComponentProps<RowProps>) {
  const row = rows[index];
  if (!row) return null;

  if (row.kind === "groupHeader") {
    return (
      <div style={style} role="listitem">
        <RowView
          label="Tool"
          preview={`${row.toolName} x${row.count}`}
          time={formatElapsed(row.firstEvent.timestamp, sessionStartedAt)}
          icon={getIcon(row.firstEvent)}
          isSelected={false}
          onClick={() => onToggleGroup(row.groupFirstIdx)}
          chevron={row.isExpanded ? "expanded" : "collapsed"}
        />
      </div>
    );
  }

  const label = row.labelOverride ?? getSingleLabel(row.event);
  const preview = row.labelOverride === "Tool"
    ? row.event.kind === "tool"
      ? row.event.toolName
      : getSinglePreview(row.event)
    : getSinglePreview(row.event);

  return (
    <div style={style} role="listitem">
      <RowView
        label={label}
        preview={preview}
        time={formatElapsed(row.event.timestamp, sessionStartedAt)}
        icon={getIcon(row.event)}
        isSelected={row.idx === selectedIdx}
        onClick={() => onSelect(row.idx)}
        indented={row.indented}
      />
    </div>
  );
}

export function EventList({
  events,
  selectedIdx,
  onSelect,
  sessionStartedAt,
  expandedGroups,
  onToggleGroup,
}: EventListProps) {
  const rows = useMemo(
    () => buildFlatRows(events, expandedGroups, selectedIdx),
    [events, expandedGroups, selectedIdx],
  );

  if (events.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        No events recorded
      </div>
    );
  }

  return (
    <List
      rowComponent={Row}
      rowCount={rows.length}
      rowHeight={ROW_HEIGHT}
      rowProps={{
        rows,
        selectedIdx,
        sessionStartedAt,
        onSelect,
        onToggleGroup,
      }}
      overscanCount={8}
      style={{ height: "100%", width: "100%" }}
    />
  );
}
