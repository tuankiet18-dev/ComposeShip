import { ExternalLink, Layers } from "lucide-react";
import { Link } from "react-router-dom";
import { StatusBadge } from "@/components/app/StatusBadge";
import { CodeInline } from "@/components/app/CodeInline";
import type { ProjectSummary } from "@/lib/api";

export function ProjectCard({ project }: { project: ProjectSummary }) {
  return (
    <Link
      to={`/projects/${project.id}`}
      className="group block rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold tracking-tight">{project.name}</h3>
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
            {project.description || "No description"}
          </p>
        </div>
        <StatusBadge status={project.status} />
      </div>
      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Layers className="h-3.5 w-3.5" />
          {project.serviceCount} service{project.serviceCount === 1 ? "" : "s"}
          <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[0.65rem] font-medium uppercase">
            {project.deploymentMode || "single"}
          </span>
        </span>
        <span>{new Date(project.updatedAt || project.createdAt).toLocaleDateString()}</span>
      </div>
      <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <ExternalLink className="h-3.5 w-3.5" />
        <CodeInline className="truncate">project-{project.id.slice(0, 8)}</CodeInline>
      </div>
    </Link>
  );
}
