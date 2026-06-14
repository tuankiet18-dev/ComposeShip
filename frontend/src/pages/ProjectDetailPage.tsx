import { Activity, AlertTriangle, ArrowLeft, Clock3, ExternalLink, Globe2, Loader2, Play, Plus, RefreshCw, ServerCog, Square, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ComposeServicesPanel } from "@/components/app/ComposeServicesPanel";
import { ComposeStackPanel } from "@/components/app/ComposeStackPanel";
import { DeploymentGraphPanel } from "@/components/app/DeploymentGraphPanel";
import { PageHeader } from "@/components/app/PageHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, type ExposureProvider, type ProjectDetail, type ProjectEvent } from "@/lib/api";
import { toast } from "sonner";

export function ProjectDetailPage() {
  const { projectId = "" } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [events, setEvents] = useState<ProjectEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [serviceName, setServiceName] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [subfolder, setSubfolder] = useState("");
  const [serviceType, setServiceType] = useState("frontend");
  const [exposureProvider, setExposureProvider] = useState<ExposureProvider>("traefik");
  const [networkAliases, setNetworkAliases] = useState("");

  const loadProject = useCallback(() => {
    Promise.all([api.getProject(projectId), api.getProjectEvents(projectId)])
      .then(([projectResponse, projectEvents]) => {
        setProject(projectResponse);
        setEvents(projectEvents);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  const createService = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreating(true);
    try {
      await api.createService(projectId, {
        name: serviceName,
        repoUrl: serviceType === "database" || serviceType === "redis" ? undefined : repoUrl,
        branch: serviceType === "database" || serviceType === "redis" ? undefined : branch || undefined,
        subfolder: serviceType === "database" || serviceType === "redis" ? undefined : subfolder || undefined,
        serviceType,
        exposureProvider: serviceType === "database" || serviceType === "redis" ? undefined : exposureProvider,
        networkAliases: networkAliases || undefined,
      });
      setServiceName("");
      setRepoUrl("");
      setBranch("main");
      setSubfolder("");
      setExposureProvider("traefik");
      setNetworkAliases("");
      setDialogOpen(false);
      loadProject();
      toast.success("Service added");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add service");
    } finally {
      setCreating(false);
    }
  };

  const deleteProject = async () => {
    if (!confirm("Delete this project and all of its services?")) return;
    setPendingAction("delete-project");
    try {
      await api.deleteProject(projectId);
      toast.success("Project queued for deletion");
      navigate("/projects");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete project");
    } finally {
      setPendingAction(null);
    }
  };

  const publicService = serviceType !== "database" && serviceType !== "redis";
  const hasComposeConfig = Boolean(project?.composeConfig?.repoUrl);
  const defaultTab = "compose";

  const deployService = async (serviceId: string) => {
    setPendingAction(`deploy-service-${serviceId}`);
    try {
      await api.triggerDeploy(serviceId);
      toast.success("Deployment queued");
      loadProject();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not queue deployment");
    } finally {
      setPendingAction(null);
    }
  };

  const runProjectAction = async (action: "deploy" | "stop") => {
    setPendingAction(`${action}-stack`);
    try {
      if (action === "deploy") await api.deployProject(projectId);
      else await api.stopProject(projectId);
      toast.success(action === "deploy" ? "Stack deployment queued" : "Stack stop queued");
      loadProject();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed");
    } finally {
      setPendingAction(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!project) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-14 text-center text-muted-foreground">Project not found.</CardContent>
      </Card>
    );
  }

  const latestDeployment = project.recentProjectDeployments[0] || null;
  const publicUrls = [
    ...(project.composeConfig?.liveUrls ?? []),
    ...project.services.map((service) => service.liveUrl).filter((url): url is string => Boolean(url)),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={project.name}
        description={project.description || "Manage services, Compose settings, and deployments."}
        eyebrow={
          <Link to="/projects" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Projects
          </Link>
        }
        actions={
          <>
            <StatusBadge status={project.status} />
            <Button variant="destructive" onClick={deleteProject} disabled={pendingAction === "delete-project"}>
              {pendingAction === "delete-project" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete
            </Button>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4" /> Add service
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add service</DialogTitle>
                  <DialogDescription>Deploy one service manually inside this project.</DialogDescription>
                </DialogHeader>
                <form onSubmit={createService} className="mt-4 space-y-4">
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <div className="flex flex-wrap gap-2">
                      {["frontend", "backend", "database", "redis"].map((type) => (
                        <Button key={type} type="button" variant={serviceType === type ? "default" : "outline"} size="sm" onClick={() => setServiceType(type)}>
                          {type}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="service-name">Service name</Label>
                    <Input id="service-name" value={serviceName} onChange={(event) => setServiceName(event.target.value)} required />
                  </div>
                  {serviceType !== "database" && serviceType !== "redis" && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="repo-url">Repository URL</Label>
                        <Input id="repo-url" value={repoUrl} onChange={(event) => setRepoUrl(event.target.value)} placeholder="https://github.com/user/repo" required />
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="branch">Branch</Label>
                          <Input id="branch" value={branch} onChange={(event) => setBranch(event.target.value)} placeholder="main" />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="subfolder">Subfolder</Label>
                          <Input id="subfolder" value={subfolder} onChange={(event) => setSubfolder(event.target.value)} placeholder="apps/web" />
                        </div>
                      </div>
                    </>
                  )}
                  {publicService && (
                    <div className="space-y-2">
                      <Label htmlFor="service-exposure">Expose</Label>
                      <Select value={exposureProvider} onValueChange={(value) => setExposureProvider(value as ExposureProvider)}>
                        <SelectTrigger id="service-exposure">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="traefik">Traefik</SelectItem>
                          <SelectItem value="cloudflare_quick">Cloudflare quick</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="network-aliases">Network aliases</Label>
                    <Input id="network-aliases" value={networkAliases} onChange={(event) => setNetworkAliases(event.target.value)} placeholder="api,backend" />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={creating}>
                      {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                      {creating ? "Adding..." : "Add service"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </>
        }
      />

      <ProjectCommandBar
        project={project}
        latestDeployment={latestDeployment}
        hasComposeConfig={hasComposeConfig}
        publicUrls={publicUrls}
        pendingAction={pendingAction}
        onRunProjectAction={runProjectAction}
      />

      {project.status === "unhealthy" && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-950">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="space-y-1">
                <p className="text-sm font-semibold">Execution node offline</p>
                <p className="text-sm">
                  This project has stale runtime targets. Redeploy will queue a new deployment and the scheduler will choose a healthy execution node.
                </p>
                {project.composeConfig?.stateful.warnings?.length ? (
                  <div className="pt-2 text-xs">
                    {project.composeConfig.stateful.warnings.map((warning) => (
                      <p key={warning}>{warning}</p>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
            <Button onClick={() => runProjectAction("deploy")} disabled={pendingAction === "deploy-stack"}>
              {pendingAction === "deploy-stack" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Redeploy
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Tabs defaultValue={defaultTab} className="min-w-0 space-y-4">
          <TabsList>
            <TabsTrigger value="compose">Compose deploy</TabsTrigger>
            <TabsTrigger value="services">Runtime services</TabsTrigger>
            <TabsTrigger value="graph">Topology</TabsTrigger>
          </TabsList>
          <TabsContent value="compose">
            <ComposeStackPanel
              project={project}
              projectId={projectId}
              onProjectChanged={loadProject}
            />
          </TabsContent>
          <TabsContent value="services">
            {hasComposeConfig ? (
              <ComposeServicesPanel project={project} projectId={projectId} />
            ) : project.services.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
                  <ServerCog className="h-10 w-10 text-muted-foreground" />
                  <div>
                    <p className="font-medium">No services yet</p>
                    <p className="mt-1 text-sm text-muted-foreground">Add a service or configure a Compose stack.</p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {project.services.map((service) => (
                  <Card key={service.id} className="transition-colors hover:border-primary/40">
                    <CardHeader>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <Link to={`/projects/${projectId}/services/${service.id}`}>
                            <CardTitle className="text-base hover:text-primary">{service.name}</CardTitle>
                          </Link>
                          <CardDescription>
                            {service.serviceType} - {service.detectedStack || "not detected"}
                            {service.serviceType === "database" || service.serviceType === "redis"
                              ? ""
                              : ` - ${service.exposureProvider === "cloudflare_quick" ? "Cloudflare quick" : "Traefik"}`}
                          </CardDescription>
                        </div>
                        <StatusBadge status={service.status} />
                      </div>
                    </CardHeader>
                    <CardContent className="flex items-end justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <p className="text-xs font-semibold uppercase text-muted-foreground">Live URL</p>
                        {service.liveUrl ? (
                          <a href={service.liveUrl} className="inline-flex max-w-full items-center gap-1 truncate text-sm text-primary" target="_blank" rel="noreferrer">
                            <span className="truncate">{service.liveUrl}</span>
                            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                          </a>
                        ) : (
                          <span className="text-sm text-muted-foreground">Not deployed yet</span>
                        )}
                      </div>
                      <Button size="sm" onClick={() => deployService(service.id)} disabled={pendingAction === `deploy-service-${service.id}`}>
                        {pendingAction === `deploy-service-${service.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                        Deploy
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
          <TabsContent value="graph">
            <DeploymentGraphPanel projectId={projectId} hasComposeConfig={hasComposeConfig} />
          </TabsContent>
        </Tabs>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock3 className="h-4 w-4" /> Project timeline
            </CardTitle>
            <CardDescription>Node, route, and redeploy events.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {events.length === 0 ? (
              <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No project events yet.</div>
            ) : (
              events.slice(0, 8).map((event) => (
                <div key={event.id} className="flex gap-3 border-l-2 border-border pl-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{event.message}</span>
                      <StatusBadge status={event.severity} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {event.type} - {new Date(event.createdAt).toLocaleString()}
                      {event.executionNodeName ? ` - ${event.executionNodeName}` : ""}
                    </p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ProjectCommandBar({
  project,
  latestDeployment,
  hasComposeConfig,
  publicUrls,
  pendingAction,
  onRunProjectAction,
}: {
  project: ProjectDetail;
  latestDeployment: ProjectDetail["recentProjectDeployments"][number] | null;
  hasComposeConfig: boolean;
  publicUrls: string[];
  pendingAction: string | null;
  onRunProjectAction: (action: "deploy" | "stop") => void;
}) {
  const primaryUrl = publicUrls[0] ?? null;

  return (
    <Card>
      <CardContent className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="grid gap-3 sm:grid-cols-3">
          <CommandMetric icon={Activity} label="State" value={project.status || "unknown"} />
          <CommandMetric icon={ServerCog} label="Execution node" value={latestDeployment?.executionNodeName || "not assigned"} />
          <CommandMetric icon={Globe2} label="Public URL" value={primaryUrl ? "available" : "not published"} />
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          {primaryUrl && (
            <Button variant="outline" asChild>
              <a href={primaryUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" /> Open app
              </a>
            </Button>
          )}
          <Button variant="outline" asChild>
            <Link to="/deployments">
              <Activity className="h-4 w-4" /> Logs
            </Link>
          </Button>
          <Button variant="outline" onClick={() => onRunProjectAction("stop")} disabled={!hasComposeConfig || pendingAction === "stop-stack"}>
            {pendingAction === "stop-stack" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
            Stop
          </Button>
          <Button onClick={() => onRunProjectAction("deploy")} disabled={!hasComposeConfig || pendingAction === "deploy-stack"}>
            {pendingAction === "deploy-stack" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {latestDeployment ? "Redeploy stack" : "Deploy stack"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CommandMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-muted/40 text-muted-foreground">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-semibold">{value}</p>
      </div>
    </div>
  );
}
