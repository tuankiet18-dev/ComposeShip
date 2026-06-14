import { ArrowRight, Layers } from "lucide-react";
import { Link } from "react-router-dom";
import { StatusBadge } from "@/components/app/StatusBadge";
import type { ProjectSummary } from "@/lib/api";

export function ProjectCard({ project }: { project: ProjectSummary }) {
  const isCompose = project.deploymentMode?.toLowerCase() === "compose";
  const runtimeLabel = isCompose
    ? "Compose stack"
    : `${project.serviceCount} service${project.serviceCount === 1 ? "" : "s"}`;

  return (
    <Link to={`/projects/${project.id}`} className="group block rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold tracking-tight">{project.name}</h3>
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
            {project.description || "No description"}
          </p>
        </div>
        <StatusBadge status={project.status} />
      </div>
      <div className="mt-4 grid grid-cols-[1fr_auto] items-end gap-3 text-xs text-muted-foreground">
        <span className="inline-flex min-w-0 flex-wrap items-center gap-1.5">
          <Layers className="h-3.5 w-3.5" />
          {runtimeLabel}
          <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[0.65rem] font-medium uppercase">
            {project.deploymentMode || "single"}
          </span>
        </span>
        <span>{new Date(project.updatedAt || project.createdAt).toLocaleDateString()}</span>
      </div>
      <div className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-primary">
        Open project
        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}
