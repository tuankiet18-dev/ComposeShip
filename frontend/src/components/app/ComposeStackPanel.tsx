import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ChevronDown,
  Lock,
  Cloud,
  ExternalLink,
  GitBranch,
  Globe2,
  KeyRound,
  Loader2,
  Network,
  Plus,
  RefreshCw,
  Route,
  Save,
  Server,
  ShieldCheck,
  Trash2,
  Workflow,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { StatusBadge } from "@/components/app/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  api,
  type ComposeEnvVar,
  type ComposeInspectResponse,
  type ComposeRoute,
  type ProjectDetail,
} from "@/lib/api";
import { formatRelativeTime } from "@/lib/deployments";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type ComposeStackPanelProps = {
  project: ProjectDetail;
  projectId: string;
  onProjectChanged: () => void;
};

const fixtureRepo = "https://github.com/tuankiet18-dev/oneclick-compose-fixture";
const secretMask = "******";

export function ComposeStackPanel({
  project,
  projectId,
  onProjectChanged,
}: ComposeStackPanelProps) {
  const config = project.composeConfig;
  const [repoUrl, setRepoUrl] = useState(config?.repoUrl || "");
  const [branch, setBranch] = useState(config?.branch || "main");
  const [subfolder, setSubfolder] = useState(config?.subfolder || "");
  const [composeFile, setComposeFile] = useState(config?.composeFile || "");
  const [routes, setRoutes] = useState<ComposeRoute[]>(config?.routes || []);
  const [envVars, setEnvVars] = useState<ComposeEnvVar[]>(config?.environmentVariables || []);
  const [postStartCommands, setPostStartCommands] = useState(config?.postStartCommands || "");
  const [inspectResult, setInspectResult] = useState<ComposeInspectResponse | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const showSecrets = false;
  const [expandedServices, setExpandedServices] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setRepoUrl(config?.repoUrl || "");
    setBranch(config?.branch || "main");
    setSubfolder(config?.subfolder || "");
    setComposeFile(config?.composeFile || "");
    setRoutes(config?.routes || []);
    setEnvVars(config?.environmentVariables || []);
    setPostStartCommands(config?.postStartCommands || "");
  }, [config]);

  const services = useMemo(() => inspectResult?.services || [], [inspectResult]);
  const latestDeployment = project.recentProjectDeployments[0] || null;
  const routeTargets = latestDeployment?.routeTargets || [];
  const stateful = inspectResult?.stateful || config?.stateful || null;
  const duplicateRouteSlugs = findDuplicates(routes.map((route) => route.routeSlug.trim()).filter(Boolean));
  const duplicateEnvKeys = findDuplicates(envVars.map((envVar) => `${envVar.serviceName}:${envVar.key}`).filter((key) => !key.endsWith(":")));
  const inspectedCurrentFile = inspectResult?.composeFile === composeFile;
  const canSave = repoUrl.trim().length > 0
    && duplicateRouteSlugs.length === 0
    && duplicateEnvKeys.length === 0
    && inspectedCurrentFile
    && Boolean(inspectResult?.isDeployable);
  const savedConfigReady = Boolean(config?.repoUrl && config.routes.length > 0);
  const workflowSteps = [
    { label: "Source", detail: repoUrl ? "Repo selected" : "Add repo", state: repoUrl ? "done" : "current" },
    { label: "Routes", detail: routes.length ? `${routes.length} public` : "Add route", state: routes.length ? "done" : repoUrl ? "current" : "pending" },
    { label: "Save", detail: savedConfigReady ? "Ready" : "Persist config", state: savedConfigReady ? "done" : canSave ? "current" : "pending" },
    { label: "Deploy", detail: latestDeployment ? latestDeployment.status : "Queue stack", state: latestDeployment ? "done" : savedConfigReady ? "current" : "pending" },
  ] as const;

  const inspectCompose = async () => {
    setInspecting(true);
    try {
      const result = await api.inspectCompose(projectId, {
        repoUrl: repoUrl.trim(),
        branch: branch.trim() || undefined,
        subfolder: subfolder.trim() || undefined,
        composeFile: composeFile.trim() || undefined,
      });
      setInspectResult(result);
      setComposeFile(result.composeFile);
      if (result.isDeployable) toast.success("Production Compose file inspected");
      else toast.error("This Compose file is for local development and cannot be deployed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not inspect Compose file");
    } finally {
      setInspecting(false);
    }
  };

  const applyDetectedConfiguration = () => {
    if (!inspectResult?.isDeployable) {
      toast.error("Choose a production-ready Compose file before applying routes");
      return;
    }

    setComposeFile(inspectResult.composeFile);
    setRoutes(inspectResult.suggestedRoutes);
    if (envVars.length === 0 && inspectResult.suggestedEnvironmentVariables.length > 0) {
      setEnvVars(inspectResult.suggestedEnvironmentVariables);
    }
    toast.success("Detected routes applied. Review environment values before saving.");
  };

  const saveConfig = async () => {
    if (!canSave) {
      toast.error("Set a repository and resolve duplicate route or environment keys before saving");
      return;
    }

    setSaving(true);
    try {
      await api.updateComposeConfig(projectId, {
        repoUrl: repoUrl.trim(),
        branch: branch.trim() || undefined,
        subfolder: subfolder.trim() || undefined,
        composeFile: composeFile.trim() || undefined,
        routes: routes.map((route) => ({
          ...route,
          routeSlug: toSlug(route.routeSlug),
          healthPath: route.healthPath?.trim() || undefined,
        })),
        environmentVariables: envVars
          .filter((envVar) => envVar.key.trim())
          .map((envVar) => ({
            ...envVar,
            serviceName: envVar.serviceName.trim(),
            key: envVar.key.trim(),
          })),
        postStartCommands: postStartCommands.trim() || undefined,
      });
      toast.success("Compose configuration saved");
      onProjectChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save Compose config");
    } finally {
      setSaving(false);
    }
  };

  const useFixture = () => {
    setRepoUrl(fixtureRepo);
    setBranch("main");
    setSubfolder("");
    setComposeFile("docker-compose.yml");
    setRoutes([
      { serviceName: "frontend", routeSlug: "app", internalPort: 3000, exposureProvider: "traefik", healthPath: "/" },
      { serviceName: "api", routeSlug: "api", internalPort: 8000, exposureProvider: "traefik", healthPath: "/health" },
    ]);
    setEnvVars([]);
    toast.success("Fixture configuration filled");
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Metric icon={GitBranch} label="Repository" value={repoUrl ? "Configured" : "Missing"} tone={repoUrl ? "good" : "warn"} />
        <Metric icon={Route} label="Public routes" value={String(routes.length)} tone={routes.length ? "good" : "warn"} />
        <Metric icon={KeyRound} label="Scoped env vars" value={String(envVars.length)} tone={envVars.length ? "neutral" : "muted"} />
        <Metric
          icon={Network}
          label="Execution node"
          value={latestDeployment?.executionNodeName || "Pending"}
          tone={latestDeployment?.executionNodeName ? "good" : "muted"}
        />
      </div>

      <WorkflowStrip steps={workflowSteps} />

      <Card>
        <CardHeader className="gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Workflow className="h-4 w-4 text-primary" />
              Compose source
            </CardTitle>
            <CardDescription>Inspect a public GitHub Compose repo, then save the route and environment contract.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={useFixture}>
              <Boxes className="h-4 w-4" />
              Use fixture
            </Button>
            <Button type="button" variant="outline" onClick={inspectCompose} disabled={inspecting || !repoUrl.trim()}>
              {inspecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Inspect
            </Button>
            <Button type="button" variant="outline" onClick={applyDetectedConfiguration} disabled={!inspectedCurrentFile || !inspectResult?.isDeployable}>
              <CheckCircle2 className="h-4 w-4" />
              Apply detected setup
            </Button>
            <Button type="button" onClick={saveConfig} disabled={saving || !canSave}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save config
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-[minmax(0,1.5fr)_160px_160px_180px]">
            <Field label="Repository URL" htmlFor="compose-repo">
              <Input
                id="compose-repo"
                value={repoUrl}
                onChange={(event) => setRepoUrl(event.target.value)}
                placeholder="https://github.com/user/repo"
              />
            </Field>
            <Field label="Branch" htmlFor="compose-branch">
              <Input id="compose-branch" value={branch} onChange={(event) => setBranch(event.target.value)} placeholder="main" />
            </Field>
            <Field label="Subfolder" htmlFor="compose-subfolder">
              <Input id="compose-subfolder" value={subfolder} onChange={(event) => setSubfolder(event.target.value)} placeholder="apps/web" />
            </Field>
            <Field label="Compose file" htmlFor="compose-file">
              {inspectResult?.availableFiles.length ? (
                <Select value={composeFile} onValueChange={setComposeFile}>
                  <SelectTrigger id="compose-file">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {inspectResult.availableFiles.map((file) => (
                      <SelectItem key={file.path} value={file.path}>
                        {file.path}{file.isRecommended ? " (recommended)" : ""}{file.kind === "development" ? " - local only" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input id="compose-file" value={composeFile} onChange={(event) => { setComposeFile(event.target.value); setInspectResult(null); }} placeholder="docker-compose.prod.yml" />
              )}
            </Field>
          </div>

          {inspectResult && inspectedCurrentFile && (
            <div className={cn("rounded-md border p-3 text-sm", inspectResult.isDeployable ? "border-success/30 bg-success/10" : "border-destructive/30 bg-destructive/10")}>
              <div className="flex items-start gap-3">
                {inspectResult.isDeployable ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-success" /> : <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />}
                <div className="min-w-0 space-y-1">
                  <p className="font-medium">{inspectResult.isDeployable ? "Ready for production deployment" : "Local development configuration detected"}</p>
                  {inspectResult.validationErrors.map((issue) => <p key={issue} className="text-muted-foreground">{issue}</p>)}
                  {inspectResult.warnings.map((warning) => <p key={warning} className="text-muted-foreground">{warning}</p>)}
                </div>
              </div>
            </div>
          )}

          <div className="rounded-md border bg-muted/30 p-3">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 text-success" />
              <div className="min-w-0 text-sm">
                <p className="font-medium">Only selected services become public routes.</p>
                <p className="mt-1 text-muted-foreground">
                  Compose service names still work inside the stack, so database and cache services can stay private without a public route.
                </p>
              </div>
            </div>
          </div>

          {stateful && stateful.risk !== "none" && (
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0">
                <p className="font-medium">Stateful workload warning</p>
                <div className="mt-1 space-y-1">
                  {stateful.warnings.map((warning) => (
                    <p key={warning}>{warning}</p>
                  ))}
                </div>
              </div>
            </div>
          )}

          {!canSave && (
            <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-warning" />
              <div className="min-w-0">
                <p className="font-medium">Configuration needs attention</p>
                <p className="mt-1 text-muted-foreground">
                  Inspect a production-ready Compose file, then resolve any duplicate route slugs or environment keys before saving.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>


      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Configure Services</h2>
          <p className="mt-1 text-sm text-muted-foreground">We've analyzed your repository. Configure routing and environment variables before deploying.</p>
        </div>

        {services.length === 0 ? (
          <EmptyInline title="No services discovered" description="Make sure your docker-compose.yml is valid." />
        ) : (
          <div className="space-y-4">
            {services.map((service) => {
              const serviceRoutes = routes.map((r, i) => ({ ...r, originalIndex: i })).filter((r) => r.serviceName === service.name);
              const isPublic = serviceRoutes.length > 0;
              const serviceEnvs = envVars.map((e, i) => ({ ...e, originalIndex: i })).filter((e) => e.serviceName === service.name);
              const isExpanded = expandedServices.has(service.name);
              const panelId = `service-${service.name}-configuration`;

              return (
                <div key={service.name} className="group overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all duration-300 hover:shadow-md">
                  <div
                    className="flex cursor-pointer items-center justify-between border-b border-border/50 bg-muted/20 px-6 py-4 transition-colors hover:bg-muted/40"
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpanded}
                    aria-controls={panelId}
                    onClick={() => setExpandedServices((items) => toggleService(items, service.name))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setExpandedServices((items) => toggleService(items, service.name));
                      }
                    }}
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Server className="h-6 w-6" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-foreground">{service.name}</h3>
                        <div className="mt-1 flex items-center gap-3">
                          <span className="rounded-md border border-border bg-muted/50 px-2.5 py-0.5 font-mono text-xs font-medium text-muted-foreground">
                            Port {service.ports[0] || "N/A"}
                          </span>
                          {isPublic ? (
                            <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-500">
                              <Globe2 className="h-3.5 w-3.5" /> Public Route
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                              <Lock className="h-3.5 w-3.5" /> Internal Only
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-muted-foreground">
                      <ChevronDown className={cn("h-5 w-5 transition-transform duration-300", isExpanded && "rotate-180")} />
                    </div>
                  </div>

                  {isExpanded && (
                  <div id={panelId}>
                    <div className="space-y-8 p-6">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-base font-semibold">Networking & Routing</h4>
                            <p className="mt-1 text-sm text-muted-foreground">Expose this service to the internet to receive external traffic.</p>
                          </div>
                          <button
                            type="button"
                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${isPublic ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              if (isPublic) {
                                setRoutes(items => items.filter(r => r.serviceName !== service.name));
                              } else {
                                setRoutes(items => [...items, { serviceName: service.name, routeSlug: service.name, internalPort: service.ports[0] || 3000, exposureProvider: "traefik" }]);
                              }
                            }}
                          >
                            <span className={`pointer-events-none inline-block h-5 w-5 translate-x-0 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isPublic ? 'translate-x-5' : 'translate-x-0'}`} />
                          </button>
                        </div>

                        {isPublic && serviceRoutes.map((route) => (
                          <div key={route.originalIndex} className="grid grid-cols-1 gap-6 rounded-xl border border-border bg-muted/20 p-5 md:grid-cols-2">
                            <Field label="Route Path" htmlFor={`route-slug-${route.originalIndex}`}>
                              <div className="flex rounded-lg shadow-sm">
                                <span className="inline-flex items-center rounded-l-lg border border-r-0 border-input bg-muted px-4 text-sm font-medium text-muted-foreground">/</span>
                                <Input
                                  id={`route-slug-${route.originalIndex}`}
                                  value={route.routeSlug}
                                  onChange={(e) => updateRoute(route.originalIndex, { routeSlug: toSlug(e.target.value) })}
                                  className="rounded-l-none"
                                />
                              </div>
                            </Field>
                            <Field label="Target Internal Port" htmlFor={`route-port-${route.originalIndex}`}>
                              <Input
                                id={`route-port-${route.originalIndex}`}
                                type="number"
                                value={route.internalPort}
                                onChange={(e) => updateRoute(route.originalIndex, { internalPort: Number(e.target.value) })}
                              />
                            </Field>
                          </div>
                        ))}
                      </div>

                      <Separator />

                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h4 className="text-base font-semibold">Environment Variables</h4>
                          <Button type="button" variant="outline" size="sm" onClick={() => setEnvVars(items => [...items, { serviceName: service.name, key: "", value: "", isSecret: false }])}>
                            <Plus className="mr-2 h-4 w-4" /> Add Env Var
                          </Button>
                        </div>

                        {serviceEnvs.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                            No environment variables configured for this service.
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {serviceEnvs.map((envVar) => (
                              <div key={envVar.originalIndex} className="grid grid-cols-[1fr_1.5fr_auto_auto] items-center gap-3 rounded-lg border border-border bg-background p-2">
                                <Input
                                  value={envVar.key}
                                  onChange={(e) => updateEnvVar(envVar.originalIndex, { key: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_") })}
                                  placeholder="KEY"
                                  className="h-9 border-0 bg-transparent shadow-none focus-visible:ring-1"
                                />
                                <div className="h-6 w-px bg-border" />
                                <Input
                                  type={envVar.isSecret && !showSecrets ? "password" : "text"}
                                  value={envVar.value}
                                  onChange={(e) => updateEnvVar(envVar.originalIndex, { value: e.target.value })}
                                  placeholder={envVar.isSecret ? secretMask : "Value"}
                                  className="h-9 border-0 bg-transparent shadow-none focus-visible:ring-1"
                                />
                                <label className="flex cursor-pointer items-center gap-2 px-3 text-sm text-muted-foreground">
                                  <Checkbox checked={envVar.isSecret} onCheckedChange={(val) => updateEnvVar(envVar.originalIndex, { isSecret: Boolean(val) })} />
                                  Secret
                                </label>
                                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setEnvVars(items => items.filter((_, idx) => idx !== envVar.originalIndex))}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Auto-detected keys suggestion */}
                        {service.environmentKeys.length > 0 && serviceEnvs.length === 0 && (
                          <div className="flex flex-wrap gap-2 pt-2">
                            <span className="text-xs text-muted-foreground flex items-center mr-1">Auto-detected:</span>
                            {service.environmentKeys.slice(0, 5).map((key) => (
                              <button
                                key={key}
                                type="button"
                                onClick={() => setEnvVars((items) => [...items, { serviceName: service.name, key, value: "", isSecret: true }])}
                                className="cursor-pointer rounded border border-border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                              >
                                {key} <Plus className="inline h-3 w-3" />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>




      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            Deploy and routing status
          </CardTitle>
          <CardDescription>Track node assignment, failure category, route targets, and live URLs for the latest stack deploy.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="ghost">
              <Link to="/deployments">Open logs</Link>
            </Button>
            <span className="inline-flex items-center rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              Deploy and stop actions live in the project action bar above.
            </span>
          </div>

          {latestDeployment ? (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
              <div className="rounded-md border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={latestDeployment.status} />
                  <span className="rounded bg-muted px-2 py-1 font-mono text-xs">v{latestDeployment.version}</span>
                  <span className="text-xs text-muted-foreground">{formatRelativeTime(latestDeployment.createdAt)}</span>
                </div>
                <Separator className="my-4" />
                <dl className="grid gap-3 text-sm">
                  <StatusLine label="Compose project" value={latestDeployment.composeProjectName || "pending"} />
                  <StatusLine label="Execution node" value={latestDeployment.executionNodeName || "not assigned"} />
                  <StatusLine label="Failure category" value={latestDeployment.failureCategory || "none"} muted={!latestDeployment.failureCategory} />
                </dl>
                {latestDeployment.errorMessage && (
                  <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                    {latestDeployment.errorMessage}
                  </p>
                )}
              </div>

              <div className="min-w-0 rounded-md border">
                <div className="border-b px-4 py-3 text-sm font-medium">Route targets</div>
                {routeTargets.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground">No route targets recorded yet. Cloudflare quick routes appear in live URLs.</div>
                ) : (
                  <div className="divide-y">
                    {routeTargets.map((target) => (
                      <div key={target.id} className="grid gap-2 p-4 text-sm md:grid-cols-[1fr_auto]">
                        <div className="min-w-0">
                          <a className="inline-flex max-w-full items-center gap-1 truncate text-primary hover:underline" href={`http://${target.host}`} target="_blank" rel="noreferrer">
                            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                            {target.host}
                          </a>
                          <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{target.targetUrl}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 md:justify-end">
                          <Badge variant={target.status === "active" ? "secondary" : "outline"}>{target.status}</Badge>
                          <span className="text-xs text-muted-foreground">{target.executionNodeName || "node pending"}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <EmptyInline title="No Compose deployment yet" description="Save the Compose config, then deploy the stack." />
          )}

          {config?.liveUrls && config.liveUrls.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {config.liveUrls.map((url) => (
                <a key={url} href={url} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1 rounded-md border px-3 py-2 text-sm text-primary hover:bg-muted">
                  {url.includes("trycloudflare.com") ? <Cloud className="h-3.5 w-3.5 shrink-0" /> : <ExternalLink className="h-3.5 w-3.5 shrink-0" />}
                  <span className="truncate">{url}</span>
                </a>
              ))}
            </div>
          )}

          <Field label="Post-start commands" htmlFor="post-start-commands">
            <Textarea
              id="post-start-commands"
              value={postStartCommands}
              onChange={(event) => setPostStartCommands(event.target.value)}
              placeholder="Optional commands executed after stack startup"
              className="min-h-24 font-mono text-xs"
            />
          </Field>
        </CardContent>
      </Card>
    </div>
  );

  function updateRoute(index: number, patch: Partial<ComposeRoute>) {
    setRoutes((items) => items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  function updateEnvVar(index: number, patch: Partial<ComposeEnvVar>) {
    setEnvVars((items) => items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function WorkflowStrip({
  steps,
}: {
  steps: ReadonlyArray<{ label: string; detail: string; state: "done" | "current" | "pending" }>;
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="grid gap-2 md:grid-cols-4">
        {steps.map((step, index) => (
          <div
            key={step.label}
            className={cn(
              "rounded-md border p-3 transition-colors",
              step.state === "done" && "border-success/25 bg-success/10",
              step.state === "current" && "border-primary/30 bg-primary/10",
              step.state === "pending" && "border-border bg-muted/30",
            )}
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-xs font-semibold",
                  step.state === "done" && "border-success/30 bg-success/15 text-success",
                  step.state === "current" && "border-primary/30 bg-primary/15 text-primary",
                  step.state === "pending" && "border-border bg-background text-muted-foreground",
                )}
              >
                {index + 1}
              </span>
              <span className="text-sm font-medium">{step.label}</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{step.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone: "good" | "warn" | "neutral" | "muted";
}) {
  const toneClass = {
    good: "border-success/20 bg-success/10 text-success",
    warn: "border-warning/20 bg-warning/10 text-warning",
    neutral: "border-primary/20 bg-primary/10 text-primary",
    muted: "border-border bg-muted/40 text-muted-foreground",
  }[tone];

  return (
    <div className="rounded-md border bg-card p-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md border", toneClass)}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 truncate text-sm font-semibold">{value}</p>
        </div>
      </div>
    </div>
  );
}

function EmptyInline({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-md border border-dashed p-6 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function StatusLine({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="grid grid-cols-[130px_minmax(0,1fr)] gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("min-w-0 truncate font-medium", muted && "text-muted-foreground")}>{value}</dd>
    </div>
  );
}

function toSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
}

function findDuplicates(values: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  values.forEach((value) => {
    const normalized = value.toLowerCase();
    if (seen.has(normalized)) duplicates.add(value);
    else seen.add(normalized);
  });
  return Array.from(duplicates);
}

function toggleService(expandedServices: Set<string>, serviceName: string) {
  const next = new Set(expandedServices);
  if (next.has(serviceName)) next.delete(serviceName);
  else next.add(serviceName);
  return next;
}
