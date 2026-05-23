import { GitCommitHorizontal } from "lucide-react";
import { CodeInline } from "@/components/app/CodeInline";
import { StatusBadge } from "@/components/app/StatusBadge";

export type TimelineDeployment = {
  id: string;
  project: string;
  service?: string;
  message: string;
  commit?: string;
  branch?: string;
  author?: string;
  timestamp: string;
  duration?: string;
  status: string;
};

export function DeploymentTimeline({ items }: { items: TimelineDeployment[] }) {
  return (
    <div className="space-y-0">
      {items.map((item, index) => (
        <div key={item.id} className="relative flex gap-4 pb-5 last:pb-0">
          {index < items.length - 1 && <div className="absolute left-4 top-8 h-[calc(100%-2rem)] w-px bg-border" />}
          <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-card">
            <GitCommitHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={item.status} />
              <span className="text-sm font-medium">{item.project}</span>
              {item.service && <span className="text-xs text-muted-foreground">- {item.service}</span>}
            </div>
            <p className="mt-1 text-sm text-foreground">{item.message}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {item.commit && <CodeInline>{item.commit}</CodeInline>}
              {item.branch && (
                <>
                  <span>on</span>
                  <CodeInline>{item.branch}</CodeInline>
                </>
              )}
              {item.author && <span>by {item.author}</span>}
              <span>{item.timestamp}</span>
              {item.duration && <span>{item.duration}</span>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
