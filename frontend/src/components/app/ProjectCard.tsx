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
    <Link to={`/projects/${project.id}`} className="group block rounded-xl border border-border bg-card p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-md hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Layers className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold tracking-tight text-foreground">{project.name}</h3>
            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
              {project.description || "No description provided"}
            </p>
          </div>
        </div>
        <StatusBadge status={project.status} />
      </div>
      <div className="mt-5 flex items-center justify-between text-xs text-muted-foreground border-t border-border/50 pt-4">
        <span className="inline-flex items-center gap-2">
          <span className="rounded bg-muted px-2 py-0.5 font-semibold uppercase tracking-wider text-[10px] text-muted-foreground">
            {project.deploymentMode || "compose"}
          </span>
          <span className="hidden sm:inline-block text-muted-foreground/40">•</span>
          <span className="font-medium">{runtimeLabel}</span>
        </span>
        <div className="relative overflow-hidden h-4 w-20 text-right">
          <span className="absolute inset-0 flex items-center justify-end font-medium text-primary opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-4 group-hover:translate-y-0">
            Open <ArrowRight className="ml-1 h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
          <span className="absolute inset-0 flex items-center justify-end group-hover:opacity-0 transition-all duration-300 -translate-y-0 group-hover:-translate-y-4">
            {new Date(project.updatedAt || project.createdAt).toLocaleDateString()}
          </span>
        </div>
      </div>
    </Link>
  );
}
