"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Save, Square, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";

const statusColors: Record<string, string> = {
  created: "bg-gray-500/10 text-gray-400 border-gray-500/20",
  deploying: "bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse",
  live: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  stopping: "bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse",
  stopped: "bg-gray-500/10 text-gray-400 border-gray-500/20",
  deleting: "bg-red-500/10 text-red-400 border-red-500/20 animate-pulse",
  failed: "bg-red-500/10 text-red-400 border-red-500/20",
  queued: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  cloning: "bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse",
  building: "bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse",
};

type ServiceData = Awaited<ReturnType<typeof api.getService>>;
type EnvRow = { id?: string; key: string; value: string; isSecret: boolean };

const SECRET_MASK = "********";
const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export default function ServiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const serviceId = params.serviceId as string;
  const projectId = params.id as string;

  const [service, setService] = useState<ServiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<string | null>(null);
  const [logsDeploymentId, setLogsDeploymentId] = useState<string | null>(null);
  const [envRows, setEnvRows] = useState<EnvRow[]>([]);
  const [envSaving, setEnvSaving] = useState(false);
  const [envError, setEnvError] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const [deletingProject, setDeletingProject] = useState(false);

  const loadService = useCallback(() => {
    api.getService(serviceId).then(setService).catch(console.error).finally(() => setLoading(false));
  }, [serviceId]);

  useEffect(() => { loadService(); }, [loadService]);

  useEffect(() => {
    if (!service) return;
    setEnvRows(service.environmentVariables.map((ev) => ({
      id: ev.id,
      key: ev.key,
      value: ev.value,
      isSecret: ev.isSecret,
    })));
    setEnvError(null);
  }, [service]);

  const handleDeploy = async () => {
    try { await api.triggerDeploy(serviceId); loadService(); } catch (err) { console.error(err); }
  };

  const handleStop = async () => {
    if (!confirm("Stop this service container? The service record and deployment history will remain.")) return;
    setStopping(true);
    try { await api.stopService(serviceId); loadService(); } catch (err) { console.error(err); } finally { setStopping(false); }
  };

  const handleDeleteProject = async () => {
    if (!confirm("Delete this project and stop all of its services?")) return;
    setDeletingProject(true);
    try {
      await api.deleteProject(projectId);
      router.push("/dashboard/projects");
    } catch (err) {
      console.error(err);
      setDeletingProject(false);
    }
  };

  const viewLogs = async (deploymentId: string) => {
    try {
      const data = await api.getDeploymentLogs(deploymentId);
      setLogs(data.buildLogs);
      setLogsDeploymentId(deploymentId);
    } catch (err) { console.error(err); }
  };

  const addEnvRow = () => {
    setEnvRows((rows) => [...rows, { key: "", value: "", isSecret: true }]);
  };

  const updateEnvRow = (index: number, patch: Partial<EnvRow>) => {
    setEnvRows((rows) => rows.map((row, i) => i === index ? { ...row, ...patch } : row));
  };

  const removeEnvRow = (index: number) => {
    setEnvRows((rows) => rows.filter((_, i) => i !== index));
  };

  const saveEnvVars = async () => {
    const normalizedRows = envRows.map((row) => ({ ...row, key: row.key.trim() }));
    const invalidRow = normalizedRows.find((row) => !ENV_KEY_PATTERN.test(row.key));
    if (invalidRow) {
      setEnvError("Keys must start with a letter or underscore and contain only letters, numbers, and underscores.");
      return;
    }

    const duplicateKey = normalizedRows.find((row, index) => normalizedRows.findIndex((candidate) => candidate.key === row.key) !== index)?.key;
    if (duplicateKey) {
      setEnvError(`Duplicate key: ${duplicateKey}`);
      return;
    }

    setEnvSaving(true);
    setEnvError(null);
    try {
      await api.updateEnvVars(serviceId, normalizedRows);
      loadService();
    } catch (err) {
      setEnvError(err instanceof Error ? err.message : "Could not save environment variables.");
    } finally {
      setEnvSaving(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" /></div>;
  if (!service) return <div className="text-center py-20"><p className="text-muted-foreground">Service not found</p></div>;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/dashboard/projects" className="hover:text-violet-400">Projects</Link>
        <span>/</span>
        <Link href={`/dashboard/projects/${projectId}`} className="hover:text-violet-400">Project</Link>
        <span>/</span>
        <span className="text-foreground">{service.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{service.name}</h1>
            <Badge className={statusColors[service.status] || ""}>{service.status}</Badge>
          </div>
          <p className="text-muted-foreground mt-1">{service.serviceType} · {service.detectedStack || "Stack not detected"} · {service.branch}</p>
          {service.liveUrl && (
            <a href={service.liveUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-violet-400 hover:text-violet-300 mt-1 inline-block">
              🔗 {service.liveUrl}
            </a>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleDeleteProject}
            disabled={deletingProject}
            className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {deletingProject ? "Deleting..." : "Delete Project"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleStop}
            disabled={stopping || !service.containerId || service.status === "stopped" || service.status === "stopping" || service.status === "deploying"}
          >
            <Square className="mr-2 h-4 w-4" />
            {service.status === "stopping" || stopping ? "Stopping..." : "Stop"}
          </Button>
          <Button onClick={handleDeploy} disabled={service.status === "deploying" || service.status === "stopping"} className="bg-gradient-to-r from-violet-600 to-indigo-600">
            {service.status === "deploying" ? "Deploying..." : "🚀 Deploy"}
          </Button>
        </div>
      </div>

      <Separator />

      {/* Tabs */}
      <Tabs defaultValue="deployments" className="space-y-4">
        <TabsList><TabsTrigger value="deployments">Deployments</TabsTrigger><TabsTrigger value="env">Environment</TabsTrigger><TabsTrigger value="settings">Settings</TabsTrigger></TabsList>

        {/* Deployments Tab */}
        <TabsContent value="deployments" className="space-y-4">
          {service.recentDeployments.length === 0 ? (
            <Card className="border-border/50 border-dashed"><CardContent className="py-12 text-center text-muted-foreground">No deployments yet. Click Deploy to start.</CardContent></Card>
          ) : (
            <div className="space-y-3">
              {service.recentDeployments.map((d) => (
                <Card key={d.id} className="border-border/50">
                  <CardContent className="flex items-center justify-between py-4">
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-mono text-muted-foreground">v{d.version}</span>
                      <Badge className={statusColors[d.status] || ""}>{d.status}</Badge>
                      <span className="text-sm text-muted-foreground">{new Date(d.createdAt).toLocaleString()}</span>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => viewLogs(d.id)}>View Logs</Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Logs Panel */}
          {logs !== null && (
            <Card className="border-border/50">
              <CardHeader className="flex flex-row items-center justify-between py-3">
                <CardTitle className="text-sm font-mono">Build Logs — {logsDeploymentId?.slice(0, 8)}</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => { setLogs(null); setLogsDeploymentId(null); }}>Close</Button>
              </CardHeader>
              <CardContent><pre className="text-xs font-mono bg-black/50 rounded-lg p-4 max-h-96 overflow-auto whitespace-pre-wrap">{logs || "No logs available"}</pre></CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Environment Tab */}
        <TabsContent value="env">
          <Card className="border-border/50">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Environment Variables</CardTitle>
              <Button type="button" variant="outline" size="sm" onClick={addEnvRow}>
                <Plus className="mr-2 h-4 w-4" /> Add
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                {envRows.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No environment variables configured.</p>
                ) : (
                  envRows.map((row, index) => (
                    <div key={row.id ?? index} className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto_auto]">
                      <Input
                        value={row.key}
                        onChange={(event) => updateEnvRow(index, { key: event.target.value })}
                        placeholder="AWS_ACCESS_KEY_ID"
                        className="font-mono"
                      />
                      <Input
                        value={row.value}
                        onChange={(event) => updateEnvRow(index, { value: event.target.value })}
                        placeholder={row.isSecret ? SECRET_MASK : "value"}
                        type={row.isSecret ? "password" : "text"}
                        className="font-mono"
                      />
                      <label className="flex h-10 items-center gap-2 text-sm text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={row.isSecret}
                          onChange={(event) => updateEnvRow(index, { isSecret: event.target.checked })}
                          className="h-4 w-4"
                        />
                        Secret
                      </label>
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeEnvRow(index)} aria-label="Remove environment variable">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
              {envError && <p className="text-sm text-red-400">{envError}</p>}
              <div className="flex items-center justify-between gap-4">
                <p className="text-xs text-muted-foreground">Changes apply on the next deploy. Secret values are masked after saving.</p>
                <Button type="button" onClick={saveEnvVars} disabled={envSaving}>
                  <Save className="mr-2 h-4 w-4" /> {envSaving ? "Saving..." : "Save"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings">
          <Card className="border-border/50">
            <CardHeader><CardTitle className="text-lg">Service Info</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Repository</span><a href={service.repoUrl} target="_blank" className="text-violet-400">{service.repoUrl}</a></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Branch</span><span>{service.branch}</span></div>
              {service.subfolder && <div className="flex justify-between"><span className="text-muted-foreground">Subfolder</span><span>{service.subfolder}</span></div>}
              {service.containerId && <div className="flex justify-between"><span className="text-muted-foreground">Container ID</span><span className="font-mono">{service.containerId}</span></div>}
              <div className="flex justify-between"><span className="text-muted-foreground">Created</span><span>{new Date(service.createdAt).toLocaleString()}</span></div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
