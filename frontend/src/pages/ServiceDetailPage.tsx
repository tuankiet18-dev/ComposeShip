import { ArrowLeft, ExternalLink, Loader2, Play, Save, Square, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "@/components/app/PageHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, type ServiceDetail } from "@/lib/api";
import { toast } from "sonner";

export function ServiceDetailPage() {
  const { projectId = "", serviceId = "" } = useParams();
  const navigate = useNavigate();
  const [service, setService] = useState<ServiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingDetails, setSavingDetails] = useState(false);
  const [savingEnv, setSavingEnv] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [envVars, setEnvVars] = useState<ServiceDetail["environmentVariables"]>([]);
  const [logs, setLogs] = useState<string | null>(null);
  const [detailsForm, setDetailsForm] = useState({
    name: "",
    repoUrl: "",
    branch: "",
    subfolder: "",
    serviceType: "",
    networkAliases: "",
  });

  const loadService = useCallback(() => {
    api
      .getService(serviceId)
      .then((data) => {
        setService(data);
        setEnvVars(data.environmentVariables);
        setDetailsForm({
          name: data.name,
          repoUrl: data.repoUrl || "",
          branch: data.branch || "main",
          subfolder: data.subfolder || "",
          serviceType: data.serviceType || "frontend",
          networkAliases: data.networkAliases || "",
        });
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [serviceId]);

  useEffect(() => {
    loadService();
  }, [loadService]);

  const deleteService = async () => {
    if (!confirm("Delete this service?")) return;
    setPendingAction("delete");
    try {
      await api.deleteService(serviceId);
      toast.success("Service queued for deletion");
      navigate(`/projects/${projectId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete service");
    } finally {
      setPendingAction(null);
    }
  };

  const deployService = async () => {
    setPendingAction("deploy");
    try {
      await api.triggerDeploy(serviceId);
      toast.success("Deployment queued");
      loadService();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not queue deployment");
    } finally {
      setPendingAction(null);
    }
  };

  const stopService = async () => {
    setPendingAction("stop");
    try {
      await api.stopService(serviceId);
      toast.success("Stop queued");
      loadService();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not stop service");
    } finally {
      setPendingAction(null);
    }
  };

  const saveEnvVars = async () => {
    setSavingEnv(true);
    try {
      await api.updateEnvVars(serviceId, envVars);
      toast.success("Environment variables saved");
      loadService();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save variables");
    } finally {
      setSavingEnv(false);
    }
  };

  const saveDetails = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingDetails(true);
    try {
      await api.updateService(serviceId, {
        name: detailsForm.name,
        repoUrl: detailsForm.repoUrl,
        branch: detailsForm.branch,
        subfolder: detailsForm.subfolder || undefined,
        serviceType: detailsForm.serviceType,
        networkAliases: detailsForm.networkAliases || undefined,
      });
      toast.success("Service details saved");
      loadService();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save service");
    } finally {
      setSavingDetails(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!service) return <Card className="border-dashed"><CardContent className="py-14 text-center">Service not found.</CardContent></Card>;

  return (
    <div className="space-y-6">
      <PageHeader
        title={service.name}
        description={`${service.serviceType} - ${service.detectedStack || "stack not detected"}`}
        eyebrow={
          <Link to={`/projects/${projectId}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to project
          </Link>
        }
        actions={
          <>
            <StatusBadge status={service.status} />
            {service.liveUrl && (
              <Button variant="outline" asChild>
                <a href={service.liveUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" /> Open
                </a>
              </Button>
            )}
            <Button variant="outline" onClick={stopService} disabled={pendingAction === "stop"}>
              {pendingAction === "stop" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
              Stop
            </Button>
            <Button onClick={deployService} disabled={pendingAction === "deploy"}>
              {pendingAction === "deploy" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Deploy
            </Button>
            <Button variant="destructive" onClick={deleteService} disabled={pendingAction === "delete"}>
              {pendingAction === "delete" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete
            </Button>
          </>
        }
      />

      <Tabs defaultValue="env" className="space-y-4">
        <TabsList>
          <TabsTrigger value="env">Environment</TabsTrigger>
          <TabsTrigger value="deployments">Deployments</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>
        <TabsContent value="env">
          <Card>
            <CardHeader>
              <CardTitle>Environment variables</CardTitle>
              <CardDescription>Values are encrypted by the backend before deploys use them.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {envVars.map((env, index) => (
                <div key={env.id || index} className="grid gap-2 md:grid-cols-[1fr_1fr_120px_88px]">
                  <Input value={env.key} onChange={(event) => setEnvVars((rows) => rows.map((row, i) => (i === index ? { ...row, key: event.target.value } : row)))} placeholder="KEY" />
                  <Input value={env.value} onChange={(event) => setEnvVars((rows) => rows.map((row, i) => (i === index ? { ...row, value: event.target.value } : row)))} placeholder="value" type={env.isSecret ? "password" : "text"} />
                  <label className="flex min-h-10 items-center gap-2 text-sm text-muted-foreground">
                    <input type="checkbox" checked={env.isSecret} onChange={(event) => setEnvVars((rows) => rows.map((row, i) => (i === index ? { ...row, isSecret: event.target.checked } : row)))} />
                    Secret
                  </label>
                  <Button type="button" variant="ghost" onClick={() => setEnvVars((rows) => rows.filter((_, i) => i !== index))}>
                    Remove
                  </Button>
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" type="button" onClick={() => setEnvVars((rows) => [...rows, { id: "", key: "", value: "", isSecret: true }])}>
                  Add variable
                </Button>
                <Button type="button" onClick={saveEnvVars} disabled={savingEnv}>
                  {savingEnv ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save variables
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="deployments">
          <div className="space-y-3">
            {service.recentDeployments.map((deployment) => (
              <Card key={deployment.id}>
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm">v{deployment.version}</span>
                      <StatusBadge status={deployment.status} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{new Date(deployment.createdAt).toLocaleString()}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      api
                        .getDeploymentLogs(deployment.id)
                        .then((result) => setLogs(result.buildLogs || "No logs available"))
                        .catch((error) => toast.error(error instanceof Error ? error.message : "Could not load logs"))
                    }
                  >
                    Logs
                  </Button>
                </CardContent>
              </Card>
            ))}
            {logs !== null && (
              <pre className="max-h-96 max-w-full overflow-auto whitespace-pre-wrap break-words rounded-xl bg-terminal p-4 text-xs leading-6 text-terminal-foreground">
                {logs}
              </pre>
            )}
          </div>
        </TabsContent>
        <TabsContent value="details">
          <Card>
            <CardContent className="p-4">
              <form onSubmit={saveDetails} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="service-name">Service name</Label>
                    <Input
                      id="service-name"
                      value={detailsForm.name}
                      onChange={(event) => setDetailsForm((form) => ({ ...form, name: event.target.value }))}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="service-type">Service type</Label>
                    <Input
                      id="service-type"
                      value={detailsForm.serviceType}
                      onChange={(event) => setDetailsForm((form) => ({ ...form, serviceType: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="repo-url">Repository</Label>
                    <Input
                      id="repo-url"
                      value={detailsForm.repoUrl}
                      onChange={(event) => setDetailsForm((form) => ({ ...form, repoUrl: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="branch">Branch</Label>
                    <Input
                      id="branch"
                      value={detailsForm.branch}
                      onChange={(event) => setDetailsForm((form) => ({ ...form, branch: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="subfolder">Subfolder</Label>
                    <Input
                      id="subfolder"
                      value={detailsForm.subfolder}
                      onChange={(event) => setDetailsForm((form) => ({ ...form, subfolder: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="network-aliases">Network aliases</Label>
                    <Input
                      id="network-aliases"
                      value={detailsForm.networkAliases}
                      onChange={(event) => setDetailsForm((form) => ({ ...form, networkAliases: event.target.value }))}
                    />
                  </div>
                  <Field label="Container" value={service.containerId || "-"} />
                </div>
                <Button type="submit" disabled={savingDetails}>
                  {savingDetails ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {savingDetails ? "Saving..." : "Save service"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <p className="mt-1 truncate rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">{value}</p>
    </div>
  );
}
