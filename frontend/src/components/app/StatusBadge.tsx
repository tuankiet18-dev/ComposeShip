import { cn } from "@/lib/utils";

const statusMap: Record<string, { label: string; className: string; dot: string }> = {
  live: {
    label: "Live",
    className: "bg-[color-mix(in_oklab,var(--success)_12%,transparent)] text-[var(--success)] ring-[color-mix(in_oklab,var(--success)_22%,transparent)]",
    dot: "bg-[var(--success)]",
  },
  active: {
    label: "Active",
    className: "bg-[color-mix(in_oklab,var(--success)_12%,transparent)] text-[var(--success)] ring-[color-mix(in_oklab,var(--success)_22%,transparent)]",
    dot: "bg-[var(--success)]",
  },
  building: {
    label: "Building",
    className: "bg-[color-mix(in_oklab,var(--warning)_14%,transparent)] text-[color-mix(in_oklab,var(--warning)_70%,var(--foreground))] ring-[color-mix(in_oklab,var(--warning)_25%,transparent)]",
    dot: "bg-[var(--warning)] animate-pulse",
  },
  cloning: {
    label: "Cloning",
    className: "bg-[color-mix(in_oklab,var(--info)_12%,transparent)] text-[var(--info)] ring-[color-mix(in_oklab,var(--info)_24%,transparent)]",
    dot: "bg-[var(--info)] animate-pulse",
  },
  deploying: {
    label: "Deploying",
    className: "bg-[color-mix(in_oklab,var(--warning)_14%,transparent)] text-[color-mix(in_oklab,var(--warning)_70%,var(--foreground))] ring-[color-mix(in_oklab,var(--warning)_25%,transparent)]",
    dot: "bg-[var(--warning)] animate-pulse",
  },
  queued: {
    label: "Queued",
    className: "bg-[color-mix(in_oklab,var(--warning)_10%,transparent)] text-[color-mix(in_oklab,var(--warning)_70%,var(--foreground))] ring-[color-mix(in_oklab,var(--warning)_20%,transparent)]",
    dot: "bg-[var(--warning)]",
  },
  created: {
    label: "Created",
    className: "bg-[color-mix(in_oklab,var(--info)_10%,transparent)] text-[var(--info)] ring-[color-mix(in_oklab,var(--info)_22%,transparent)]",
    dot: "bg-[var(--info)]",
  },
  failed: {
    label: "Failed",
    className: "bg-[color-mix(in_oklab,var(--destructive)_12%,transparent)] text-[var(--destructive)] ring-[color-mix(in_oklab,var(--destructive)_22%,transparent)]",
    dot: "bg-[var(--destructive)]",
  },
  stopped: {
    label: "Stopped",
    className: "bg-muted text-muted-foreground ring-border",
    dot: "bg-muted-foreground",
  },
  stopping: {
    label: "Stopping",
    className: "bg-[color-mix(in_oklab,var(--warning)_12%,transparent)] text-[color-mix(in_oklab,var(--warning)_70%,var(--foreground))] ring-[color-mix(in_oklab,var(--warning)_24%,transparent)]",
    dot: "bg-[var(--warning)] animate-pulse",
  },
  deleting: {
    label: "Deleting",
    className: "bg-[color-mix(in_oklab,var(--destructive)_10%,transparent)] text-[var(--destructive)] ring-[color-mix(in_oklab,var(--destructive)_22%,transparent)]",
    dot: "bg-[var(--destructive)] animate-pulse",
  },
  deleting_failed: {
    label: "Delete failed",
    className: "bg-[color-mix(in_oklab,var(--destructive)_12%,transparent)] text-[var(--destructive)] ring-[color-mix(in_oklab,var(--destructive)_22%,transparent)]",
    dot: "bg-[var(--destructive)]",
  },
  cleanup_failed: {
    label: "Cleanup failed",
    className: "bg-[color-mix(in_oklab,var(--destructive)_12%,transparent)] text-[var(--destructive)] ring-[color-mix(in_oklab,var(--destructive)_22%,transparent)]",
    dot: "bg-[var(--destructive)]",
  },
  superseded: {
    label: "Superseded",
    className: "bg-muted text-muted-foreground ring-border",
    dot: "bg-muted-foreground",
  },
};

export function StatusBadge({
  status,
  className,
  label,
}: {
  status: string;
  className?: string;
  label?: string;
}) {
  const normalized = status?.toLowerCase() || "stopped";
  const config = statusMap[normalized] ?? {
    label: status || "Unknown",
    className: "bg-muted text-muted-foreground ring-border",
    dot: "bg-muted-foreground",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1",
        config.className,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", config.dot)} />
      {label ?? config.label}
    </span>
  );
}
