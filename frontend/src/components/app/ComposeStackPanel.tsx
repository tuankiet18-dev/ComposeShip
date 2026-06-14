import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Cloud,
  ExternalLink,
  Eye,
  EyeOff,
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
const exposureOptions = [
  { value: "traefik", label: "Traefik" },
  { value: "cloudflare_quick", label: "Cloudflare quick" },
] as const;

export function ComposeStackPanel({
  project,
  projectId,
  onProjectChanged,
}: ComposeStackPanelProps) {
  const config = project.composeConfig;
  const [repoUrl, setRepoUrl] = useState(config?.repoUrl || "");
  const [branch, setBranch] = useState(config?.branch || "main");
  const [subfolder, setSubfolder] = useState(config?.subfolder || "");
  const [composeFile, setComposeFile] = useState(config?.composeFile || "docker-compose.yml");
  const [routes, setRoutes] = useState<ComposeRoute[]>(config?.routes || []);
  const [envVars, setEnvVars] = useState<ComposeEnvVar[]>(config?.environmentVariables || []);
  const [postStartCommands, setPostStartCommands] = useState(config?.postStartCommands || "");
  const [inspectResult, setInspectResult] = useState<ComposeInspectResponse | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);

  useEffect(() => {
    setRepoUrl(config?.repoUrl || "");
    setBranch(config?.branch || "main");
    setSubfolder(config?.subfolder || "");
    setComposeFile(config?.composeFile || "docker-compose.yml");
    setRoutes(config?.routes || []);
    setEnvVars(config?.environmentVariables || []);
    setPostStartCommands(config?.postStartCommands || "");
  }, [config]);

  const services = useMemo(() => inspectResult?.services || [], [inspectResult]);
  const serviceNames = useMemo(() => {
    const values = new Set<string>();
    services.forEach((service) => values.add(service.name));
    routes.forEach((route) => route.serviceName && values.add(route.serviceName));
    envVars.forEach((envVar) => envVar.serviceName && values.add(envVar.serviceName));
    return Array.from(values).sort();
  }, [envVars, routes, services]);

  const latestDeployment = project.recentProjectDeployments[0] || null;
  const routeTargets = latestDeployment?.routeTargets || [];
  const stateful = inspectResult?.stateful || config?.stateful || null;
  const duplicateRouteSlugs = findDuplicates(routes.map((route) => route.routeSlug.trim()).filter(Boolean));
  const duplicateEnvKeys = findDuplicates(envVars.map((envVar) => `${envVar.serviceName}:${envVar.key}`).filter((key) => !key.endsWith(":")));
  const canSave = repoUrl.trim().length > 0 && duplicateRouteSlugs.length === 0 && duplicateEnvKeys.length === 0;
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
      if (routes.length === 0) setRoutes(result.suggestedRoutes);
      if (envVars.length === 0 && result.suggestedEnvironmentVariables.length > 0) {
        setEnvVars(result.suggestedEnvironmentVariables);
      }
      toast.success("Compose file inspected");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not inspect Compose file");
    } finally {
      setInspecting(false);
    }
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

  const addRoute = (serviceName = "", internalPort = 3000) => {
    setRoutes((items) => [
      ...items,
      {
        serviceName,
        routeSlug: toSlug(serviceName || "app"),
        internalPort,
        exposureProvider: "traefik",
        healthPath: serviceName.toLowerCase().includes("api") ? "/health" : "/",
      },
    ]);
  };

  const addEnvVar = (serviceName = "") => {
    setEnvVars((items) => [...items, { serviceName, key: "", value: "", isSecret: true }]);
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
              <Input id="compose-file" value={composeFile} onChange={(event) => setComposeFile(event.target.value)} placeholder="docker-compose.yml" />
            </Field>
          </div>

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
                  Add a repository and resolve any duplicate route slugs or environment keys before saving.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {services.length > 0 && (
        <Card>
          <CardHeader className="gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Server className="h-4 w-4 text-primary" />
                Discovered services
              </CardTitle>
              <CardDescription>Promote only user-facing services to public routes. Keep databases and caches private.</CardDescription>
            </div>
            <Badge variant="outline">{services.length} services found</Badge>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 lg:grid-cols-2">
              {services.map((service) => (
                <div key={service.name} className="rounded-md border bg-background p-3 transition-colors hover:border-primary/40">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <p className="truncate font-medium">{service.name}</p>
                        {service.looksPublic ? <Badge variant="secondary">public candidate</Badge> : <Badge variant="outline">internal</Badge>}
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {service.image || service.buildContext || "compose service"}
                      </p>
                    </div>
                    {service.looksPublic ? (
                      <Button type="button" size="sm" variant="outline" onClick={() => addRoute(service.name, service.ports[0] || 3000)}>
                        <Plus className="h-4 w-4" />
                        Route
                      </Button>
                    ) : (
                      <Badge variant="outline" className="shrink-0">Private</Badge>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    {(service.ports.length ? service.ports : ["no public ports"]).map((port) => (
                      <span key={String(port)} className="rounded bg-muted px-2 py-1 font-mono">
                        {port}
                      </span>
                    ))}
                  </div>
                  {service.environmentKeys.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {service.environmentKeys.slice(0, 8).map((key) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setEnvVars((items) => [...items, { serviceName: service.name, key, value: "", isSecret: true }])}
                          className="cursor-pointer rounded border px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                        >
                          {key}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(380px,0.8fr)]">
        <Card className="min-w-0">
          <CardHeader className="gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Globe2 className="h-4 w-4 text-primary" />
                Public routes
              </CardTitle>
              <CardDescription>Each route becomes a public URL after deployment.</CardDescription>
            </div>
            <Button type="button" variant="outline" onClick={() => addRoute()}>
              <Plus className="h-4 w-4" />
              Add route
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {duplicateRouteSlugs.length > 0 && <InlineWarning text={`Duplicate route slug: ${duplicateRouteSlugs.join(", ")}`} />}
            {routes.length === 0 ? (
              <EmptyInline title="No public routes" description="Add a route for the app surface users should reach." />
            ) : (
              <div className="space-y-2">
                {routes.map((route, index) => (
                  <div key={`${route.serviceName}-${index}`} className="rounded-md border bg-background p-3">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">Route {index + 1}</p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {route.serviceName || "service"}:{route.internalPort || "port"} {"->"} /{route.routeSlug || "slug"}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => setRoutes((items) => items.filter((_, itemIndex) => itemIndex !== index))}
                      >
                        <Trash2 className="h-4 w-4" />
                        Remove
                      </Button>
                    </div>
                    <div className="grid gap-3 2xl:grid-cols-2">
                      <Field label="Service" htmlFor={`route-service-${index}`}>
                        <Input
                          id={`route-service-${index}`}
                          list="compose-service-names"
                          value={route.serviceName}
                          onChange={(event) => updateRoute(index, { serviceName: event.target.value })}
                          placeholder="frontend"
                        />
                      </Field>
                      <Field label="Route slug" htmlFor={`route-slug-${index}`}>
                        <Input
                          id={`route-slug-${index}`}
                          value={route.routeSlug}
                          onChange={(event) => updateRoute(index, { routeSlug: toSlug(event.target.value) })}
                          placeholder="app"
                        />
                      </Field>
                      <Field label="Internal port" htmlFor={`route-port-${index}`}>
                        <Input
                          id={`route-port-${index}`}
                          type="number"
                          min={1}
                          max={65535}
                          value={route.internalPort}
                          onChange={(event) => updateRoute(index, { internalPort: Number(event.target.value) })}
                        />
                      </Field>
                      <Field label="Exposure" htmlFor={`route-exposure-${index}`}>
                        <Select
                          value={route.exposureProvider || "traefik"}
                          onValueChange={(value) => updateRoute(index, { exposureProvider: value as ComposeRoute["exposureProvider"] })}
                        >
                          <SelectTrigger id={`route-exposure-${index}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {exposureOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Health path" htmlFor={`route-health-${index}`}>
                        <Input
                          id={`route-health-${index}`}
                          value={route.healthPath || ""}
                          onChange={(event) => updateRoute(index, { healthPath: event.target.value })}
                          placeholder="/health"
                        />
                      </Field>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <datalist id="compose-service-names">
              {serviceNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader className="gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <KeyRound className="h-4 w-4 text-primary" />
                Service env
              </CardTitle>
              <CardDescription>Env vars are scoped to Compose service names and secrets stay masked.</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" size="icon" onClick={() => setShowSecrets((value) => !value)} aria-label={showSecrets ? "Hide secrets" : "Show secrets"}>
                {showSecrets ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button type="button" variant="outline" onClick={() => addEnvVar()}>
                <Plus className="h-4 w-4" />
                Add env
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {duplicateEnvKeys.length > 0 && <InlineWarning text={`Duplicate environment key: ${duplicateEnvKeys.join(", ")}`} />}
            {envVars.length === 0 ? (
              <EmptyInline title="No service env vars" description="Add only the values the Compose stack explicitly needs." />
            ) : (
              <div className="space-y-2">
                {envVars.map((envVar, index) => (
                  <div key={`${envVar.serviceName}-${envVar.key}-${index}`} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_1fr]">
                    <Input
                      list="compose-service-names"
                      value={envVar.serviceName}
                      onChange={(event) => updateEnvVar(index, { serviceName: event.target.value })}
                      placeholder="api"
                      aria-label="Env service name"
                    />
                    <Input
                      value={envVar.key}
                      onChange={(event) => updateEnvVar(index, { key: event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_") })}
                      placeholder="DATABASE_URL"
                      aria-label="Env key"
                    />
                    <Input
                      className="sm:col-span-2"
                      type={envVar.isSecret && !showSecrets ? "password" : "text"}
                      value={envVar.value}
                      onChange={(event) => updateEnvVar(index, { value: event.target.value })}
                      placeholder={envVar.isSecret ? secretMask : "value"}
                      aria-label="Env value"
                    />
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                      <Checkbox checked={envVar.isSecret} onCheckedChange={(value) => updateEnvVar(index, { isSecret: Boolean(value) })} />
                      Secret
                    </label>
                    <Button type="button" variant="ghost" size="sm" className="justify-self-start sm:justify-self-end" onClick={() => setEnvVars((items) => items.filter((_, itemIndex) => itemIndex !== index))}>
                      <Trash2 className="h-4 w-4" />
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
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

function InlineWarning({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm">
      <AlertTriangle className="h-4 w-4 text-warning" />
      <span>{text}</span>
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
