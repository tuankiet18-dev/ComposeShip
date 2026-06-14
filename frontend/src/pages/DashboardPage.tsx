import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  FolderGit2,
  Plus,
  Rocket,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/app/PageHeader";
import { DeploymentTimeline, type TimelineDeployment } from "@/components/app/DeploymentTimeline";
import { ProjectCard } from "@/components/app/ProjectCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  collectDeployments,
  deploymentMessage,
  formatDuration,
  formatRelativeTime,
  type AppDeployment,
} from "@/lib/deployments";
import { api, type ProjectSummary } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export function DashboardPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [deployments, setDeployments] = useState<AppDeployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [deploymentsLoading, setDeploymentsLoading] = useState(true);

  useEffect(() => {
    api
      .getProjects()
      .then((items) => {
        setProjects(items);
        setDeploymentsLoading(true);
        return collectDeployments(items);
      })
      .then(setDeployments)
      .catch(console.error)
      .finally(() => {
        setLoading(false);
        setDeploymentsLoading(false);
      });
  }, []);

  const stats = useMemo(() => {
    const live = projects.filter((project) => ["live", "active"].includes(project.status?.toLowerCase())).length;
    const failed = projects.filter((project) => project.status?.toLowerCase().includes("failed")).length;
    const building = projects.filter((project) =>
      ["queued", "building", "deploying", "cloning"].includes(project.status?.toLowerCase()),
    ).length;
    return [
      { label: "Projects", value: projects.length, icon: FolderGit2, tone: "text-foreground" },
      { label: "Live projects", value: live, icon: Rocket, tone: "text-[var(--success)]" },
      { label: "Failed deploys", value: failed, icon: AlertTriangle, tone: "text-[var(--destructive)]" },
      { label: "Queued / Building", value: building, icon: Clock, tone: "text-[var(--warning)]" },
    ];
  }, [projects]);

  const recentDeployments = useMemo<TimelineDeployment[]>(() => {
    return deployments.slice(0, 5).map((deployment) => ({
      id: deployment.id,
      project: deployment.projectName,
      service: deployment.serviceName,
      message: deploymentMessage(deployment),
      commit: deployment.id.slice(0, 7),
      timestamp: formatRelativeTime(deployment.createdAt),
      duration: formatDuration(deployment.startedAt, deployment.completedAt, deployment.status),
      status: deployment.status,
    }));
  }, [deployments]);

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Overview${user?.fullName ? ` for ${user.fullName.split(" ")[0]}` : ""}`}
        description="Start from Projects to configure a repo, deploy the stack, then use Activity & logs when something needs debugging."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/deployments">
                <Activity className="h-4 w-4" /> Activity & logs
              </Link>
            </Button>
            <Button asChild>
              <Link to="/projects/new">
                <Plus className="h-4 w-4" /> New project
              </Link>
            </Button>
          </>
        }
      />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">{stat.label}</span>
                <stat.icon className={`h-4 w-4 ${stat.tone}`} />
              </div>
              <div className="mt-3 text-2xl font-semibold tracking-tight">{loading ? "-" : stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold">Primary workflow</h2>
            <p className="mt-1 text-sm text-muted-foreground">Use this order when you want to verify a deploy end to end.</p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to="/projects">
              Open projects <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          {[
            { label: "Create", detail: "New project or fixture", to: "/projects/new" },
            { label: "Configure", detail: "Compose source, routes, env", to: "/projects" },
            { label: "Deploy", detail: "Queue on execution node", to: "/projects" },
            { label: "Observe", detail: "Logs, events, route targets", to: "/deployments" },
          ].map((step, index) => (
            <Link key={step.label} to={step.to} className="rounded-md border border-border bg-background p-3 transition-colors hover:border-primary/40">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary">
                  {index + 1}
                </span>
                <span className="text-sm font-medium">{step.label}</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{step.detail}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Recent projects</h2>
            <Link to="/projects" className="text-xs font-medium text-primary hover:underline">View all</Link>
          </div>
          {projects.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
              No projects yet. Create one first, then configure the Compose stack from its project page.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {projects.slice(0, 4).map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Activity snapshot</h2>
            <Link to="/deployments" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              Logs <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <Card>
            <CardContent className="p-5">
              {deploymentsLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((item) => (
                    <div key={item} className="h-12 animate-pulse rounded bg-muted" />
                  ))}
                </div>
              ) : recentDeployments.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
                  Deployment history appears here after the first deploy.
                </div>
              ) : (
                <DeploymentTimeline items={recentDeployments} />
              )}
            </CardContent>
          </Card>
          <div className="mt-3 rounded-lg border border-border bg-card p-4">
            <StatusRow icon={CheckCircle2} label="API" value={loading ? "Checking" : "Connected"} />
            <StatusRow icon={Activity} label="Queue" value={`${stats[3].value} active`} />
          </div>
        </div>
      </section>
    </div>
  );
}

function StatusRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm">{label}</span>
      </div>
      <span className="text-xs font-medium text-[var(--success)]">{value}</span>
    </div>
  );
}
