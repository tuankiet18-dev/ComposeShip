import { ArrowLeft, ExternalLink, Loader2, Play, Plus, ServerCog, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ComposeStackPanel } from "@/components/app/ComposeStackPanel";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, type ProjectDetail } from "@/lib/api";
import { toast } from "sonner";

export function ProjectDetailPage() {
  const { projectId = "" } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [serviceName, setServiceName] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [subfolder, setSubfolder] = useState("");
  const [serviceType, setServiceType] = useState("frontend");
  const [networkAliases, setNetworkAliases] = useState("");

  const loadProject = useCallback(() => {
    api
      .getProject(projectId)
      .then(setProject)
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
        networkAliases: networkAliases || undefined,
      });
      setServiceName("");
      setRepoUrl("");
      setBranch("main");
      setSubfolder("");
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

      <Tabs defaultValue="services" className="space-y-4">
        <TabsList>
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="compose">Compose stack</TabsTrigger>
        </TabsList>
        <TabsContent value="services">
          {project.services.length === 0 ? (
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
                        <CardDescription>{service.serviceType} - {service.detectedStack || "not detected"}</CardDescription>
                      </div>
                      <StatusBadge status={service.status} />
                    </div>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between gap-3">
                    {service.liveUrl ? (
                      <a href={service.liveUrl} className="inline-flex min-w-0 items-center gap-1 truncate text-sm text-primary" target="_blank" rel="noreferrer">
                        <ExternalLink className="h-3.5 w-3.5 shrink-0" /> {service.liveUrl}
                      </a>
                    ) : (
                      <span className="text-sm text-muted-foreground">Not deployed</span>
                    )}
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
        <TabsContent value="compose">
          <ComposeStackPanel
            project={project}
            projectId={projectId}
            pendingAction={pendingAction}
            onProjectChanged={loadProject}
            onRunProjectAction={runProjectAction}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
