import {
  api,
  type ProjectDeployment,
  type ProjectDetail,
  type ProjectSummary,
  type ServiceDetail,
} from "@/lib/api";

export type AppDeployment = {
  id: string;
  kind: "project" | "service";
  projectId: string;
  projectName: string;
  serviceId?: string;
  serviceName: string;
  status: string;
  version: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  errorMessage?: string | null;
  hasAiDiagnosis?: boolean;
  hasDiagnosticSnapshot?: boolean;
  executionNodeName?: string | null;
  failureCategory?: string | null;
};

const byNewest = (a: AppDeployment, b: AppDeployment) =>
  new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

export function formatRelativeTime(value: string | null | undefined) {
  if (!value) return "not started";
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return value;
  const diffSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSeconds < 60) return "just now";
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} h ago`;
  return `${Math.floor(diffHours / 24)} d ago`;
}

export function formatDuration(startedAt: string | null, completedAt: string | null, status: string) {
  if (!startedAt) return status.toLowerCase() === "queued" ? "queued" : "not started";
  if (!completedAt) return ["building", "deploying", "cloning", "queued"].includes(status.toLowerCase())
    ? "running"
    : "in progress";

  const seconds = Math.max(0, Math.floor((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0 ? `${minutes}m ${rest}s` : `${rest}s`;
}

export function deploymentMessage(deployment: AppDeployment) {
  if (deployment.errorMessage) return deployment.errorMessage;
  return deployment.kind === "project"
    ? `Project stack deployment v${deployment.version}`
    : `Service deployment v${deployment.version}`;
}

export async function collectDeployments(projects?: ProjectSummary[]) {
  const summaries = projects ?? (await api.getProjects());
  const details = await Promise.all(
    summaries.map((project) =>
      api.getProject(project.id).catch((error) => {
        console.error(error);
        return null;
      }),
    ),
  );

  const deployments: AppDeployment[] = [];

  for (const project of details.filter(Boolean) as ProjectDetail[]) {
    project.recentProjectDeployments.forEach((deployment: ProjectDeployment) => {
      deployments.push({
        id: deployment.id,
        kind: "project",
        projectId: project.id,
        projectName: project.name,
        serviceName: deployment.composeProjectName || "compose",
        status: deployment.status,
        version: deployment.version,
        startedAt: deployment.startedAt,
        completedAt: deployment.completedAt,
        createdAt: deployment.createdAt,
        errorMessage: deployment.errorMessage,
        executionNodeName: deployment.executionNodeName,
        failureCategory: deployment.failureCategory,
      });
    });

    const serviceDetails = await Promise.all(
      project.services.map((service) =>
        api.getService(service.id).catch((error) => {
          console.error(error);
          return null;
        }),
      ),
    );

    for (const service of serviceDetails.filter(Boolean) as ServiceDetail[]) {
      service.recentDeployments.forEach((deployment) => {
        deployments.push({
          id: deployment.id,
          kind: "service",
          projectId: project.id,
          projectName: project.name,
          serviceId: service.id,
          serviceName: service.name,
          status: deployment.status,
          version: deployment.version,
          startedAt: deployment.startedAt,
          completedAt: deployment.completedAt,
          createdAt: deployment.createdAt,
          hasAiDiagnosis: deployment.hasAiDiagnosis,
          hasDiagnosticSnapshot: deployment.hasDiagnosticSnapshot,
        });
      });
    }
  }

  return deployments.sort(byNewest);
}
