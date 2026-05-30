import { useCallback, useMemo, memo } from "react";
import { List, type RowComponentProps } from "react-window";
import { User, Bot, Wrench, ChevronRight } from "lucide-react";
import {
  formatSlashCommandText,
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
  if (event.isAgentCall && event.agentType) return event.agentType;
  return "Tool";
}

function getSinglePreview(event: TimelineEvent): string {
  if (event.kind === "message") {
    const normalized = formatSlashCommandText(event.content);
    return normalized.slice(0, 80);
  }
  if (event.isSkillCall && event.skillName) return `Skill: ${event.skillName}`;
  if (event.isAgentCall && event.agentType) return `Subagent: ${event.agentType}`;
  return event.toolName;
}

function getIconParts(event: TimelineEvent) {
  if (event.kind === "message") {
    if (event.role === "HUMAN") {
      return [User, "bg-brand"] as const;
    }
    return [Bot, "bg-brand-2"] as const;
  }
  const isSpecial = event.isSkillCall || event.isAgentCall;
  return [Wrench, isSpecial ? "bg-chart-4" : "bg-muted-foreground"] as const;
}

type RowViewProps = {
  label: string;
  preview: string;
  time: string;
  Icon: typeof User;
  iconBg: string;
  isSelected: boolean;
  onClick: () => void;
  indented?: boolean;
  chevron?: "collapsed" | "expanded";
};

const RowView = memo(function RowView({
  label,
  preview,
  time,
  Icon,
  iconBg,
  isSelected,
  onClick,
  indented = false,
  chevron,
}: RowViewProps) {
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
          iconBg,
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
});

type RowProps = {
  rows: FlatRow[];
  selectedIdx: number;
  sessionStartedAt: string;
  onSelect: (idx: number) => void;
  onToggleGroup: (firstIdx: number) => void;
};

function shallowEqualRecord(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): boolean {
  if (a === b) return true;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

function areRowPropsEqual(
  prev: RowComponentProps<RowProps>,
  next: RowComponentProps<RowProps>,
): boolean {
  if (prev.index !== next.index) return false;

  if (
    !shallowEqualRecord(
      prev.style as unknown as Record<string, unknown>,
      next.style as unknown as Record<string, unknown>,
    )
  ) {
    return false;
  }

  if (
    !shallowEqualRecord(
      prev.ariaAttributes as unknown as Record<string, unknown>,
      next.ariaAttributes as unknown as Record<string, unknown>,
    )
  ) {
    return false;
  }

  if (prev.sessionStartedAt !== next.sessionStartedAt) return false;
  if (prev.onSelect !== next.onSelect) return false;
  if (prev.onToggleGroup !== next.onToggleGroup) return false;

  const prevRow = prev.rows[prev.index];
  const nextRow = next.rows[next.index];
  if (!prevRow || !nextRow) return prevRow === nextRow;
  if (prevRow.key !== nextRow.key) return false;
  if (prevRow.kind !== nextRow.kind) return false;

  if (prevRow.kind === "event" && nextRow.kind === "event") {
    if (prevRow.event !== nextRow.event) return false;
    if (prevRow.indented !== nextRow.indented) return false;
    if (prevRow.labelOverride !== nextRow.labelOverride) return false;

    const prevSelected = prevRow.idx === prev.selectedIdx;
    const nextSelected = nextRow.idx === next.selectedIdx;
    if (prevSelected !== nextSelected) return false;

    return true;
  }

  if (prevRow.kind === "groupHeader" && nextRow.kind === "groupHeader") {
    if (prevRow.firstEvent !== nextRow.firstEvent) return false;
    if (prevRow.toolName !== nextRow.toolName) return false;
    if (prevRow.count !== nextRow.count) return false;
    if (prevRow.groupFirstIdx !== nextRow.groupFirstIdx) return false;
    if (prevRow.isExpanded !== nextRow.isExpanded) return false;

    return true;
  }

  return false;
}

const RowInner = memo(function RowInner({
  index,
  style,
  ariaAttributes,
  rows,
  selectedIdx,
  sessionStartedAt,
  onSelect,
  onToggleGroup,
}: RowComponentProps<RowProps>) {
  const row = rows[index];

  const eventIdx = row?.kind === "event" ? row.idx : undefined;
  const groupFirstIdx = row?.kind === "groupHeader" ? row.groupFirstIdx : undefined;
  const handleClick = useCallback(() => {
    if (groupFirstIdx !== undefined) {
      onToggleGroup(groupFirstIdx);
      return;
    }
    if (eventIdx !== undefined) {
      onSelect(eventIdx);
    }
  }, [eventIdx, groupFirstIdx, onSelect, onToggleGroup]);

  if (!row) return null;

  if (row.kind === "groupHeader") {
    const [Icon, iconBg] = getIconParts(row.firstEvent);
    return (
      <div style={style} {...ariaAttributes} role="listitem">
        <RowView
          label="Tool"
          preview={`${row.toolName} x${row.count}`}
          time={formatElapsed(row.firstEvent.timestamp, sessionStartedAt)}
          Icon={Icon}
          iconBg={iconBg}
          isSelected={false}
          onClick={handleClick}
          chevron={row.isExpanded ? "expanded" : "collapsed"}
        />
      </div>
    );
  }

  const [Icon, iconBg] = getIconParts(row.event);
  const label = row.labelOverride ?? getSingleLabel(row.event);
  const preview = row.labelOverride === "Tool"
    ? row.event.kind === "tool"
      ? row.event.toolName
      : getSinglePreview(row.event)
    : getSinglePreview(row.event);

  return (
    <div style={style} {...ariaAttributes} role="listitem">
      <RowView
        label={label}
        preview={preview}
        time={formatElapsed(row.event.timestamp, sessionStartedAt)}
        Icon={Icon}
        iconBg={iconBg}
        isSelected={row.idx === selectedIdx}
        onClick={handleClick}
        indented={row.indented}
      />
    </div>
  );
}, areRowPropsEqual);

function Row(props: RowComponentProps<RowProps>) {
  return <RowInner {...props} />;
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
