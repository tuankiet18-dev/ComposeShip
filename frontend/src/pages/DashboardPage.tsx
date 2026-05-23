import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Clock,
  Cpu,
  FolderGit2,
  Globe,
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
        title={`Welcome back, ${user?.fullName?.split(" ")[0] || "there"}`}
        description="Here's what's running today. Everything is organized around projects, services, and deployments."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/deployments">
                <Activity className="h-4 w-4" /> View logs
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

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Recent deployments</h2>
            <Link to="/deployments" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              View all <ArrowRight className="h-3.5 w-3.5" />
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
                  No deployments yet. Create a project and deploy a service to populate this timeline.
                </div>
              ) : (
                <DeploymentTimeline items={recentDeployments} />
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <div>
            <h2 className="mb-3 text-sm font-semibold">System status</h2>
            <div className="space-y-2 rounded-xl border border-border bg-card p-4">
              <StatusRow icon={Cpu} label="API status" value={loading ? "Checking" : "Connected"} />
              <StatusRow icon={Globe} label="Projects indexed" value={`${projects.length} total`} />
              <StatusRow icon={Activity} label="Queue depth" value={`${stats[3].value} active jobs`} />
            </div>
          </div>
          <div>
            <h2 className="mb-3 text-sm font-semibold">Quick actions</h2>
            <div className="grid gap-2">
              <Button variant="outline" className="justify-start" asChild>
                <Link to="/projects/new"><Plus className="h-4 w-4" /> Create new project</Link>
              </Button>
              <Button variant="outline" className="justify-start" asChild>
                <Link to="/projects"><FolderGit2 className="h-4 w-4" /> Browse projects</Link>
              </Button>
              <Button variant="outline" className="justify-start" asChild>
                <Link to="/deployments"><Rocket className="h-4 w-4" /> See all deployments</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Recent projects</h2>
          <Link to="/projects" className="text-xs font-medium text-primary hover:underline">View all</Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {projects.slice(0, 3).map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
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
