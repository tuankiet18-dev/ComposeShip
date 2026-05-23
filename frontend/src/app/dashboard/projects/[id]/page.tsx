"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  BookOpen,
  Eye,
  EyeOff,
  ExternalLink,
  FileCode2,
  Globe2,
  KeyRound,
  ListPlus,
  Play,
  Plus,
  Save,
  Search,
  ServerCog,
  Square,
  Trash2,
} from "lucide-react";
import { api, type ComposeEnvVar, type ComposeRoute } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const statusColors: Record<string, string> = {
  active: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  created: "bg-gray-500/10 text-gray-400 border-gray-500/20",
  queued: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  cloning: "bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse",
  building: "bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse",
  deploying: "bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse",
  live: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  stopping: "bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse",
  stopped: "bg-gray-500/10 text-gray-400 border-gray-500/20",
  deleting: "bg-red-500/10 text-red-400 border-red-500/20 animate-pulse",
  deleting_failed: "bg-red-500/10 text-red-400 border-red-500/20",
  failed: "bg-red-500/10 text-red-400 border-red-500/20",
};

type ProjectData = Awaited<ReturnType<typeof api.getProject>>;
type EditableRoute = ComposeRoute & { healthPath?: string | null };
type EditableEnvVar = ComposeEnvVar;

const emptyRoute: EditableRoute = {
  serviceName: "frontend",
  routeSlug: "app",
  internalPort: 3000,
  healthPath: "",
};

const emptyEnv: EditableEnvVar = {
  serviceName: "",
  key: "",
  value: "",
  isSecret: true,
};

function FieldHelp({ children }: { children: React.ReactNode }) {
  return <p className="text-xs leading-relaxed text-muted-foreground">{children}</p>;
}

function OptionalLabel({ children }: { children: React.ReactNode }) {
  return (
    <Label className="flex items-center gap-2">
      <span>{children}</span>
      <span className="rounded border border-border/70 bg-muted/40 px-1.5 py-0.5 text-[10px] font-normal uppercase tracking-wide text-muted-foreground">Optional</span>
    </Label>
  );
}

function GuidanceCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-violet-500/20 bg-violet-500/5 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-violet-200">
        {icon}
        {title}
      </div>
      <div className="text-xs leading-relaxed text-violet-100/80">{children}</div>
    </div>
  );
}

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [svcName, setSvcName] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [subfolder, setSubfolder] = useState("");
  const [serviceType, setServiceType] = useState("frontend");
  const [networkAliases, setNetworkAliases] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [composeRepoUrl, setComposeRepoUrl] = useState("");
  const [composeBranch, setComposeBranch] = useState("main");
  const [composeSubfolder, setComposeSubfolder] = useState("");
  const [composeFile, setComposeFile] = useState("");
  const [composeRoutes, setComposeRoutes] = useState<EditableRoute[]>([{ ...emptyRoute }]);
  const [composeEnv, setComposeEnv] = useState<EditableEnvVar[]>([{ ...emptyEnv }]);
  const [visibleComposeEnvRows, setVisibleComposeEnvRows] = useState<Set<number>>(new Set());
  const [postStartCommands, setPostStartCommands] = useState("");
  const [composeInspecting, setComposeInspecting] = useState(false);
  const [composeInspectSummary, setComposeInspectSummary] = useState<string | null>(null);
  const [composeSaving, setComposeSaving] = useState(false);
  const [composeDeploying, setComposeDeploying] = useState(false);
  const [composeStopping, setComposeStopping] = useState(false);
  const [composeLogs, setComposeLogs] = useState<string | null>(null);
  const [composeError, setComposeError] = useState<string | null>(null);

  const defaultTab = useMemo(() => (project?.deploymentMode === "compose" ? "compose" : "services"), [project?.deploymentMode]);
  const configuredComposeEnv = useMemo(
    () => composeEnv
      .map((env, index) => ({ env, index }))
      .filter(({ env }) => env.key.trim()),
    [composeEnv]
  );

  const loadProject = () => {
    api
      .getProject(projectId)
      .then((data) => {
        setProject(data);
        if (data.composeConfig) {
          setComposeRepoUrl(data.composeConfig.repoUrl || "");
          setComposeBranch(data.composeConfig.branch || "main");
          setComposeSubfolder(data.composeConfig.subfolder || "");
          setComposeFile(data.composeConfig.composeFile || "");
          setComposeRoutes(data.composeConfig.routes.length ? data.composeConfig.routes : [{ ...emptyRoute }]);
          setComposeEnv(data.composeConfig.environmentVariables.length ? data.composeConfig.environmentVariables : [{ ...emptyEnv }]);
          setVisibleComposeEnvRows(new Set());
          setPostStartCommands(data.composeConfig.postStartCommands || "");
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadProject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const handleCreateService = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreating(true);
    try {
      await api.createService(projectId, {
        name: svcName,
        repoUrl: serviceType === "database" || serviceType === "redis" ? undefined : repoUrl,
        branch: serviceType === "database" || serviceType === "redis" ? undefined : branch || undefined,
        subfolder: serviceType === "database" || serviceType === "redis" ? undefined : subfolder || undefined,
        serviceType,
        networkAliases: networkAliases || undefined,
      });
      setSvcName("");
      setRepoUrl("");
      setBranch("main");
      setSubfolder("");
      setNetworkAliases("");
      setServiceType("frontend");
      setDialogOpen(false);
      loadProject();
    } catch (err) {
      console.error(err);
    } finally {
      setCreating(false);
    }
  };

  const handleDeploy = async (serviceId: string) => {
    try {
      await api.triggerDeploy(serviceId);
      loadProject();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteProject = async () => {
    if (!confirm("Delete this project, stop all services, and remove all project volumes/data?")) return;
    setDeleting(true);
    try {
      await api.deleteProject(projectId);
      router.push("/dashboard/projects");
    } catch (err) {
      console.error(err);
      setDeleting(false);
    }
  };

  const saveComposeConfig = async () => {
    setComposeSaving(true);
    setComposeError(null);
    try {
      await api.updateComposeConfig(projectId, {
        repoUrl: composeRepoUrl.trim(),
        branch: composeBranch.trim() || undefined,
        subfolder: composeSubfolder.trim() || undefined,
        composeFile: composeFile.trim() || undefined,
        routes: composeRoutes.map((route) => ({
          serviceName: route.serviceName.trim(),
          routeSlug: route.routeSlug.trim(),
          internalPort: Number(route.internalPort),
          healthPath: route.healthPath?.trim() || null,
        })),
        environmentVariables: composeEnv
          .filter((env) => env.key.trim())
          .map((env) => ({
            serviceName: env.serviceName.trim(),
            key: env.key.trim(),
            value: env.value,
            isSecret: env.isSecret,
          })),
        postStartCommands: postStartCommands.trim() || undefined,
      });
      loadProject();
    } catch (err) {
      setComposeError(err instanceof Error ? err.message : "Could not save Compose configuration.");
    } finally {
      setComposeSaving(false);
    }
  };

  const toggleComposeEnvVisibility = (index: number) => {
    setVisibleComposeEnvRows((rows) => {
      const next = new Set(rows);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const inspectCompose = async () => {
    setComposeInspecting(true);
    setComposeError(null);
    setComposeInspectSummary(null);
    try {
      const result = await api.inspectCompose(projectId, {
        repoUrl: composeRepoUrl.trim(),
        branch: composeBranch.trim() || undefined,
        subfolder: composeSubfolder.trim() || undefined,
        composeFile: composeFile.trim() || undefined,
      });

      setComposeFile(result.composeFile);
      if (result.suggestedRoutes.length) {
        setComposeRoutes(result.suggestedRoutes.map((route) => ({ ...route, healthPath: route.healthPath || "" })));
      }

      const serviceNames = result.services.map((service) => service.name).join(", ");
      setComposeInspectSummary(`Detected ${result.services.length} services in ${result.composeFile}: ${serviceNames || "no named services"}. Routes were suggested from exposed ports; environment values stay manual and can be auto-targeted by key when Service is blank.`);
    } catch (err) {
      setComposeError(err instanceof Error ? err.message : "Could not inspect the compose file.");
    } finally {
      setComposeInspecting(false);
    }
  };

  const deployCompose = async () => {
    setComposeDeploying(true);
    setComposeError(null);
    try {
      await api.deployProject(projectId);
      loadProject();
    } catch (err) {
      setComposeError(err instanceof Error ? err.message : "Could not start Compose deployment.");
    } finally {
      setComposeDeploying(false);
    }
  };

  const stopCompose = async () => {
    if (!confirm("Stop this Compose stack? Volumes will be kept until the project is deleted.")) return;
    setComposeStopping(true);
    try {
      await api.stopProject(projectId);
      loadProject();
    } catch (err) {
      setComposeError(err instanceof Error ? err.message : "Could not stop Compose stack.");
    } finally {
      setComposeStopping(false);
    }
  };

  const viewProjectLogs = async (deploymentId: string) => {
    try {
      const logs = await api.getProjectDeploymentLogs(deploymentId);
      setComposeLogs(logs.buildLogs);
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" /></div>;
  if (!project) return <div className="py-20 text-center"><p className="text-muted-foreground">Project not found</p></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-sm text-muted-foreground">
            <Link href="/dashboard/projects" className="transition-colors hover:text-violet-400">Projects</Link>
            <span>/</span>
            <span className="text-foreground">{project.name}</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
            <Badge className={statusColors[project.status] || ""}>{project.status}</Badge>
          </div>
          {project.description && <p className="mt-1 text-muted-foreground">{project.description}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={handleDeleteProject} disabled={deleting} className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300">
            <Trash2 className="mr-2 h-4 w-4" />
            {deleting ? "Deleting..." : "Delete Project"}
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger className="inline-flex cursor-pointer items-center justify-center rounded-md bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2 text-sm font-medium text-white">
              <Plus className="mr-2 h-4 w-4" />
              Add Service
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Service</DialogTitle>
                <DialogDescription>Use this when you want to deploy one service manually instead of the full Compose stack.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateService} className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <div className="flex flex-wrap gap-2">
                    {["frontend", "backend", "database", "redis"].map((type) => (
                      <Button key={type} type="button" variant={serviceType === type ? "default" : "outline"} size="sm" onClick={() => setServiceType(type)} className={serviceType === type ? "bg-violet-600" : ""}>
                        {type}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Service Name</Label>
                  <Input placeholder={serviceType === "database" ? "app-db" : "frontend"} value={svcName} onChange={(event) => setSvcName(event.target.value)} required />
                </div>
                {serviceType !== "database" && serviceType !== "redis" && (
                  <>
                    <div className="space-y-2">
                      <Label>GitHub Repository URL</Label>
                      <Input placeholder="https://github.com/user/repo" value={repoUrl} onChange={(event) => setRepoUrl(event.target.value)} required />
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Branch</Label>
                        <Input placeholder="main" value={branch} onChange={(event) => setBranch(event.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Subfolder</Label>
                        <Input placeholder="apps/web" value={subfolder} onChange={(event) => setSubfolder(event.target.value)} />
                      </div>
                    </div>
                  </>
                )}
                <div className="space-y-2">
                  <Label>Network Aliases</Label>
                  <Input placeholder={serviceType === "database" ? "app-db" : "app-api"} value={networkAliases} onChange={(event) => setNetworkAliases(event.target.value)} />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={creating} className="bg-gradient-to-r from-violet-600 to-indigo-600">{creating ? "Adding..." : "Add Service"}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs key={defaultTab} defaultValue={defaultTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="compose">Compose Stack</TabsTrigger>
          <TabsTrigger value="services">Services</TabsTrigger>
        </TabsList>

        <TabsContent value="compose" className="space-y-5">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <Card className="border-border/50">
              <CardHeader className="pb-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <ServerCog className="h-5 w-5 text-violet-400" />
                      Compose Stack Setup
                    </CardTitle>
                    <CardDescription>Deploy the entire repository as one managed stack: frontend, backend, database, cache, workers, and support services.</CardDescription>
                  </div>
                  <Badge className={statusColors[project.status] || ""}>{project.status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {composeError && <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">{composeError}</div>}

                <section className="space-y-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-2">
                      <FileCode2 className="h-4 w-4 text-violet-400" />
                      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Repository</h2>
                    </div>
                    <Button type="button" size="sm" variant="outline" onClick={inspectCompose} disabled={composeInspecting || !composeRepoUrl.trim()}>
                      <Search className="mr-2 h-4 w-4" />
                      {composeInspecting ? "Inspecting..." : "Inspect Compose"}
                    </Button>
                  </div>
                  {composeInspectSummary && (
                    <div className="rounded-md border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                      {composeInspectSummary}
                    </div>
                  )}
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2 md:col-span-2">
                      <Label>GitHub Repository URL</Label>
                      <Input value={composeRepoUrl} onChange={(event) => setComposeRepoUrl(event.target.value)} placeholder="https://github.com/acme/storefront" />
                      <FieldHelp>Use the repository root URL. If your compose file is inside a subfolder, fill in Subfolder below.</FieldHelp>
                    </div>
                    <div className="space-y-2">
                      <Label>Branch</Label>
                      <Input value={composeBranch} onChange={(event) => setComposeBranch(event.target.value)} placeholder="main" />
                      <FieldHelp>The branch that should be cloned on every deploy.</FieldHelp>
                    </div>
                    <div className="space-y-2">
                      <OptionalLabel>Compose File</OptionalLabel>
                      <Input value={composeFile} onChange={(event) => setComposeFile(event.target.value)} placeholder="docker-compose.yml" />
                      <FieldHelp>Leave empty and click Inspect Compose to auto-detect common names. Use a relative path like <code className="rounded bg-muted px-1">infra/compose.prod.yml</code> for custom locations.</FieldHelp>
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <OptionalLabel>Subfolder</OptionalLabel>
                      <Input value={composeSubfolder} onChange={(event) => setComposeSubfolder(event.target.value)} placeholder="apps/platform" />
                      <FieldHelp>Use this for monorepos when the compose file lives below the repo root.</FieldHelp>
                    </div>
                  </div>
                  <GuidanceCard icon={<Search className="h-4 w-4" />} title="Auto-fill from compose">
                    Inspect Compose reads the selected GitHub branch, detects services and ports, then fills route suggestions only. Environment values stay manual, are encrypted when saved, and can be revealed here by the project owner. When Service is blank, OneClickHost injects declared keys into matching services; undeclared keys go to inferred app services while infrastructure services stay untouched.
                  </GuidanceCard>
                </section>

                <section className="space-y-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Globe2 className="h-4 w-4 text-violet-400" />
                        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Public Routes</h2>
                      </div>
                      <FieldHelp>Expose only the services that need a public URL. Databases, Redis, queues, and workers should usually stay internal.</FieldHelp>
                    </div>
                  </div>

                  <div className="rounded-md border border-border/70">
                    <div className="hidden grid-cols-[1fr_1fr_120px_1fr_92px] gap-3 border-b border-border/70 px-3 py-2 text-xs font-medium text-muted-foreground md:grid">
                      <span>Compose service</span>
                      <span>URL slug</span>
                      <span>Port</span>
                      <span>Health path optional</span>
                      <span />
                    </div>
                    <div className="divide-y divide-border/70">
                      {composeRoutes.map((route, index) => (
                        <div key={index} className="grid gap-3 p-3 md:grid-cols-[1fr_1fr_120px_1fr_92px]">
                          <Input value={route.serviceName} onChange={(event) => setComposeRoutes((routes) => routes.map((item, i) => (i === index ? { ...item, serviceName: event.target.value } : item)))} placeholder="frontend" />
                          <Input value={route.routeSlug} onChange={(event) => setComposeRoutes((routes) => routes.map((item, i) => (i === index ? { ...item, routeSlug: event.target.value } : item)))} placeholder="app" />
                          <Input type="number" value={route.internalPort} onChange={(event) => setComposeRoutes((routes) => routes.map((item, i) => (i === index ? { ...item, internalPort: Number(event.target.value) } : item)))} placeholder="3000" />
                          <Input value={route.healthPath || ""} onChange={(event) => setComposeRoutes((routes) => routes.map((item, i) => (i === index ? { ...item, healthPath: event.target.value } : item)))} placeholder="/health" />
                          <Button type="button" variant="ghost" size="sm" onClick={() => setComposeRoutes((routes) => routes.filter((_, i) => i !== index))}>Remove</Button>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button type="button" size="sm" variant="outline" onClick={() => setComposeRoutes((routes) => [...routes, { ...emptyRoute, serviceName: "", routeSlug: "", internalPort: 80 }])}>
                      <ListPlus className="mr-2 h-4 w-4" />
                      Add Route
                    </Button>
                  </div>

                  <GuidanceCard icon={<BookOpen className="h-4 w-4" />} title="Route field guide">
                    <ul className="list-inside list-disc space-y-1">
                      <li><strong>Compose service</strong> must exactly match a service key in your compose file, for example <code className="rounded bg-violet-900/40 px-1">frontend</code> or <code className="rounded bg-violet-900/40 px-1">api</code>.</li>
                      <li><strong>URL slug</strong> becomes the public hostname prefix: <code className="rounded bg-violet-900/40 px-1">app-myproject.localhost</code>.</li>
                      <li><strong>Port</strong> is the internal container port, not a host port mapping. Host ports from user compose files are intentionally ignored.</li>
                      <li><strong>Health path</strong> is optional and can be left blank for services without a health endpoint.</li>
                    </ul>
                  </GuidanceCard>
                </section>

                <section className="space-y-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <KeyRound className="h-4 w-4 text-violet-400" />
                        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Environment Variables</h2>
                      </div>
                      <FieldHelp>Leave Service blank to automatically inject the key into every compose service that declares it. Fill Service only when you want to target one service explicitly.</FieldHelp>
                    </div>
                  </div>

                  <div className="rounded-md border border-border/70">
                    <div className="hidden grid-cols-[1fr_1fr_1.4fr_52px_92px_92px] gap-3 border-b border-border/70 px-3 py-2 text-xs font-medium text-muted-foreground md:grid">
                      <span>Service optional</span>
                      <span>Key</span>
                      <span>Value</span>
                      <span />
                      <span>Secret</span>
                      <span />
                    </div>
                    <div className="divide-y divide-border/70">
                      {composeEnv.map((env, index) => (
                        <div key={index} className="grid gap-3 p-3 md:grid-cols-[1fr_1fr_1.4fr_52px_92px_92px]">
                          <Input value={env.serviceName} onChange={(event) => setComposeEnv((rows) => rows.map((item, i) => (i === index ? { ...item, serviceName: event.target.value } : item)))} placeholder="auto by key" />
                          <Input value={env.key} onChange={(event) => setComposeEnv((rows) => rows.map((item, i) => (i === index ? { ...item, key: event.target.value } : item)))} placeholder="DATABASE_URL" />
                          <Input value={env.value} onChange={(event) => setComposeEnv((rows) => rows.map((item, i) => (i === index ? { ...item, value: event.target.value } : item)))} placeholder={env.isSecret ? "hidden value" : "value"} type={env.isSecret && !visibleComposeEnvRows.has(index) ? "password" : "text"} />
                          <Button type="button" variant="outline" size="icon" onClick={() => toggleComposeEnvVisibility(index)} aria-label={visibleComposeEnvRows.has(index) ? "Hide value" : "Show value"}>
                            {visibleComposeEnvRows.has(index) ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                          <label className="flex h-10 items-center gap-2 text-sm text-muted-foreground">
                            <input type="checkbox" checked={env.isSecret} onChange={(event) => setComposeEnv((rows) => rows.map((item, i) => (i === index ? { ...item, isSecret: event.target.checked } : item)))} />
                            Secret
                          </label>
                          <Button type="button" variant="ghost" size="sm" onClick={() => setComposeEnv((rows) => rows.filter((_, i) => i !== index))}>Remove</Button>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button type="button" size="sm" variant="outline" onClick={() => setComposeEnv((rows) => [...rows, { ...emptyEnv }])}>
                      <ListPlus className="mr-2 h-4 w-4" />
                      Add Variable
                    </Button>
                  </div>

                  <GuidanceCard icon={<BookOpen className="h-4 w-4" />} title="Environment variable guide">
                    <ul className="list-inside list-disc space-y-1">
                      <li><strong>Service</strong> is optional. Leave it blank to apply declared keys to matching services, or undeclared keys to inferred app services.</li>
                      <li><strong>Key</strong> must start with a letter or underscore and contain only letters, numbers, and underscores.</li>
                      <li>Fill <strong>Service</strong> when a variable should go to exactly one compose service.</li>
                      <li>All values are encrypted when saved. Use <strong>Secret</strong> to keep sensitive values hidden in the form until you reveal them.</li>
                    </ul>
                  </GuidanceCard>
                </section>

                <section className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Play className="h-4 w-4 text-violet-400" />
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Post-Start Commands</h2>
                    <span className="rounded border border-border/70 bg-muted/40 px-1.5 py-0.5 text-[10px] font-normal uppercase tracking-wide text-muted-foreground">Optional</span>
                  </div>
                  <FieldHelp>Run commands after the stack starts. Use this for migrations, seed data, or static asset collection.</FieldHelp>
                  <textarea
                    className="min-h-32 w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm placeholder:text-muted-foreground/50"
                    value={postStartCommands}
                    onChange={(event) => setPostStartCommands(event.target.value)}
                    placeholder={"backend: python manage.py migrate\nbackend: python manage.py collectstatic --no-input\noptional: backend: python manage.py loaddata demo.json"}
                  />
                  <GuidanceCard icon={<BookOpen className="h-4 w-4" />} title="Command syntax">
                    <p>Use one command per line: <code className="rounded bg-violet-900/40 px-1">&lt;service&gt;: &lt;shell command&gt;</code>. Prefix a line with <code className="rounded bg-violet-900/40 px-1">optional:</code> when a failure should not fail the full deployment.</p>
                  </GuidanceCard>
                </section>

                <div className="flex flex-col gap-3 border-t border-border/70 pt-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex flex-wrap gap-2">
                    {project.composeConfig?.liveUrls.map((url) => (
                      <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md border border-violet-500/20 bg-violet-500/5 px-2 py-1 text-sm text-violet-300 hover:text-violet-200">
                        <ExternalLink className="h-3 w-3" />
                        {url}
                      </a>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" onClick={saveComposeConfig} disabled={composeSaving}>
                      <Save className="mr-2 h-4 w-4" />
                      {composeSaving ? "Saving..." : "Save Compose"}
                    </Button>
                    <Button type="button" variant="outline" onClick={stopCompose} disabled={composeStopping || project.status === "stopped" || project.status === "stopping"}>
                      <Square className="mr-2 h-4 w-4" />
                      {composeStopping ? "Stopping..." : "Stop Stack"}
                    </Button>
                    <Button type="button" onClick={deployCompose} disabled={composeDeploying || project.status === "deploying"} className="bg-gradient-to-r from-violet-600 to-indigo-600">
                      <Play className="mr-2 h-4 w-4" />
                      {composeDeploying || project.status === "deploying" ? "Deploying..." : "Deploy Stack"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <aside className="space-y-4">
              <Card className="border-border/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <KeyRound className="h-4 w-4 text-violet-400" />
                    Environment Variables
                  </CardTitle>
                  <CardDescription>Saved values are encrypted in the database and decrypted only for deploys or project owners.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {configuredComposeEnv.length === 0 ? (
                    <p className="rounded-md border border-dashed border-border/70 p-3 text-sm text-muted-foreground">No variables configured yet.</p>
                  ) : (
                    configuredComposeEnv.map(({ env, index }) => (
                      <div key={`${env.serviceName || "auto"}-${env.key}-${index}`} className="rounded-md border border-border/70 p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="truncate font-mono text-sm text-foreground">{env.key}</span>
                          <Badge variant="outline" className="shrink-0 text-[10px]">{env.serviceName || "auto"}</Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            readOnly
                            value={env.value}
                            type={env.isSecret && !visibleComposeEnvRows.has(index) ? "password" : "text"}
                            className="h-8 font-mono text-xs"
                          />
                          <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => toggleComposeEnvVisibility(index)} aria-label={visibleComposeEnvRows.has(index) ? "Hide value" : "Show value"}>
                            {visibleComposeEnvRows.has(index) ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card className="border-border/50">
                <CardHeader>
                  <CardTitle className="text-base">How Compose Deploy Works</CardTitle>
                  <CardDescription>OneClickHost runs your compose file safely inside a managed project namespace.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <div className="rounded-md bg-muted/30 p-3">
                    <p className="font-medium text-foreground">1. Clone</p>
                    <p>The selected repository, branch, and subfolder are cloned fresh on every deploy.</p>
                  </div>
                  <div className="rounded-md bg-muted/30 p-3">
                    <p className="font-medium text-foreground">2. Validate</p>
                    <p>Unsafe compose options such as privileged mode, host network, host port publishing, and Docker socket mounts are blocked.</p>
                  </div>
                  <div className="rounded-md bg-muted/30 p-3">
                    <p className="font-medium text-foreground">3. Route</p>
                    <p>Only services listed in Public Routes receive public URLs through Traefik.</p>
                  </div>
                  <div className="rounded-md bg-muted/30 p-3">
                    <p className="font-medium text-foreground">4. Clean Up</p>
                    <p>Deleting a project removes containers, routes, images, networks, and volumes owned by that project.</p>
                  </div>
                </CardContent>
              </Card>

              {project.recentProjectDeployments.length > 0 && (
                <Card className="border-border/50">
                  <CardHeader>
                    <CardTitle className="text-base">Deployment History</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {project.recentProjectDeployments.map((deployment) => (
                      <div key={deployment.id} className="flex items-center justify-between gap-3 rounded-md border border-border/70 p-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm text-muted-foreground">v{deployment.version}</span>
                            <Badge className={statusColors[deployment.status] || ""}>{deployment.status}</Badge>
                          </div>
                          <p className="mt-1 truncate text-xs text-muted-foreground">{new Date(deployment.createdAt).toLocaleString()}</p>
                        </div>
                        <Button type="button" variant="outline" size="sm" onClick={() => viewProjectLogs(deployment.id)}>Logs</Button>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </aside>
          </div>

          {composeLogs !== null && (
            <Card className="border-border/50">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-mono">Compose Logs</CardTitle>
                <Button type="button" variant="ghost" size="sm" onClick={() => setComposeLogs(null)}>Close</Button>
              </CardHeader>
              <CardContent>
                <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-black/50 p-4 font-mono text-xs">{composeLogs || "No logs available"}</pre>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="services" className="space-y-4">
          {project.services.length === 0 ? (
            <Card className="border-border/50 border-dashed">
              <CardContent className="flex flex-col items-center justify-center space-y-4 py-16">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-300">
                  <ServerCog className="h-8 w-8" />
                </div>
                <div className="text-center">
                  <p className="font-medium">No services yet</p>
                  <p className="mt-1 text-sm text-muted-foreground">Add a service for manual service-by-service deployment.</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {project.services.map((svc) => (
                <Card key={svc.id} className="border-border/50 transition-colors hover:border-violet-500/30">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <Link href={`/dashboard/projects/${projectId}/services/${svc.id}`}>
                          <CardTitle className="cursor-pointer text-lg transition-colors hover:text-violet-400">{svc.name}</CardTitle>
                        </Link>
                        <CardDescription className="mt-1">{svc.serviceType} - {svc.detectedStack || "not detected"}</CardDescription>
                      </div>
                      <Badge className={statusColors[svc.status] || ""}>{svc.status}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between gap-3">
                      {svc.liveUrl ? (
                        <a href={svc.liveUrl} target="_blank" rel="noopener noreferrer" className="truncate text-sm text-violet-400 hover:text-violet-300">{svc.liveUrl}</a>
                      ) : (
                        <span className="text-sm text-muted-foreground">Not deployed</span>
                      )}
                      <Button size="sm" onClick={() => handleDeploy(svc.id)} disabled={svc.status === "deploying"} className="ml-2 bg-gradient-to-r from-violet-600 to-indigo-600">
                        {svc.status === "deploying" ? "Deploying..." : "Deploy"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
