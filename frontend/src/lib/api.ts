const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

class ApiClient {
  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    redirectOnUnauthorized = true,
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...((options.headers as Record<string, string>) || {}),
    };

    const response = await fetch(`${API_BASE}${endpoint}`, {
      cache: "no-store",
      credentials: "include",
      ...options,
      headers,
    });

    if (response.status === 401) {
      if (redirectOnUnauthorized) {
        localStorage.removeItem("user");
        window.location.href = "/login";
      }
      throw new Error("Unauthorized");
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `API Error: ${response.status}`);
    }

    const text = await response.text();
    if (!text) return {} as T;
    return JSON.parse(text);
  }

  async register(email: string, password: string, fullName: string) {
    return this.request<{ id: string; email: string; fullName: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, fullName }),
    });
  }

  async login(email: string, password: string) {
    return this.request<{ id: string; email: string; fullName: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  }

  async getProfile() {
    return this.request<{ id: string; email: string; fullName: string; createdAt: string }>(
      "/auth/me",
      {},
      false,
    );
  }

  async logout() {
    return this.request("/auth/logout", { method: "POST" }, false);
  }

  async getProjects() {
    return this.request<ProjectSummary[]>("/projects");
  }

  async createProject(name: string, description?: string) {
    return this.request<{ id: string; name: string }>("/projects", {
      method: "POST",
      body: JSON.stringify({ name, description }),
    });
  }

  async deleteProject(id: string) {
    return this.request(`/projects/${id}`, { method: "DELETE" });
  }

  async getProject(id: string) {
    return this.request<ProjectDetail>(`/projects/${id}`);
  }

  async createService(projectId: string, data: CreateServiceRequest) {
    return this.request(`/projects/${projectId}/services`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async deleteService(id: string) {
    return this.request(`/services/${id}`, { method: "DELETE" });
  }

  async updateService(id: string, data: UpdateServiceRequest) {
    return this.request<ServiceResponse>(`/services/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async triggerDeploy(serviceId: string) {
    return this.request(`/services/${serviceId}/deploy`, { method: "POST" });
  }

  async stopService(id: string) {
    return this.request(`/services/${id}/stop`, { method: "POST" });
  }

  async getService(id: string) {
    return this.request<ServiceDetail>(`/services/${id}`);
  }

  async updateEnvVars(
    serviceId: string,
    envVars: { id?: string; key: string; value: string; isSecret: boolean }[],
  ) {
    return this.request(`/services/${serviceId}/env`, {
      method: "PUT",
      body: JSON.stringify(envVars),
    });
  }

  async getDeploymentLogs(id: string) {
    return this.request<{ deploymentId: string; status: string; buildLogs: string | null }>(
      `/deployments/${id}/logs`,
    );
  }

  async getDeployments(serviceId: string) {
    return this.request<DeploymentResponse[]>(`/services/${serviceId}/deployments`);
  }

  async getAiDiagnosis(id: string) {
    return this.request<AiDiagnosis>(`/deployments/${id}/ai-diagnosis`);
  }

  async generateAiDiagnosis(id: string) {
    return this.request<AiDiagnosis>(`/deployments/${id}/ai-diagnosis`, { method: "POST" });
  }

  async updateComposeConfig(projectId: string, data: ComposeConfigRequest) {
    return this.request<ComposeConfig>(`/projects/${projectId}/compose-config`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async inspectCompose(projectId: string, data: ComposeInspectRequest) {
    return this.request<ComposeInspectResponse>(`/projects/${projectId}/compose-inspect`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async deployProject(projectId: string) {
    return this.request<ProjectDeployment>(`/projects/${projectId}/deploy`, { method: "POST" });
  }

  async stopProject(projectId: string) {
    return this.request(`/projects/${projectId}/stop`, { method: "POST" });
  }

  async getProjectDeploymentLogs(id: string) {
    return this.request<{ deploymentId: string; status: string; buildLogs: string | null }>(
      `/project-deployments/${id}/logs`,
    );
  }

  async getProjectDeployments(projectId: string) {
    return this.request<ProjectDeployment[]>(`/projects/${projectId}/deployments`);
  }
}

export const api = new ApiClient();

export type ProjectSummary = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  deploymentMode: string;
  serviceCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ServiceSummary = {
  id: string;
  name: string;
  serviceType: string;
  detectedStack: string | null;
  status: string;
  liveUrl: string | null;
};

export type ProjectDetail = ProjectSummary & {
  composeConfig: ComposeConfig | null;
  recentProjectDeployments: ProjectDeployment[];
  services: ServiceSummary[];
};

export type CreateServiceRequest = {
  name: string;
  repoUrl?: string;
  branch?: string;
  subfolder?: string;
  serviceType?: string;
  networkAliases?: string;
};

export type UpdateServiceRequest = Partial<CreateServiceRequest>;

export type ServiceResponse = {
  id: string;
  projectId: string;
  name: string;
  repoUrl: string;
  branch: string;
  subfolder: string | null;
  serviceType: string;
  detectedStack: string | null;
  networkAliases: string | null;
  status: string;
  liveUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ServiceDetail = {
  id: string;
  projectId: string;
  name: string;
  repoUrl: string;
  branch: string;
  subfolder: string | null;
  serviceType: string;
  detectedStack: string | null;
  networkAliases: string | null;
  containerId: string | null;
  status: string;
  liveUrl: string | null;
  environmentVariables: { id: string; key: string; value: string; isSecret: boolean }[];
  recentDeployments: {
    id: string;
    status: string;
    version: number;
    startedAt: string | null;
    completedAt: string | null;
    createdAt: string;
    hasDiagnosticSnapshot: boolean;
    hasAiDiagnosis: boolean;
  }[];
  createdAt: string;
  updatedAt: string;
};

export type DeploymentResponse = {
  id: string;
  serviceId: string;
  status: string;
  imageTag: string | null;
  errorMessage: string | null;
  version: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

export type ComposeRoute = {
  serviceName: string;
  routeSlug: string;
  internalPort: number;
  healthPath?: string | null;
  liveUrl?: string | null;
};

export type ComposeEnvVar = {
  serviceName: string;
  key: string;
  value: string;
  isSecret: boolean;
};

export type ComposeConfig = {
  repoUrl: string | null;
  branch: string | null;
  subfolder: string | null;
  composeFile: string | null;
  composeProjectName: string | null;
  routes: ComposeRoute[];
  environmentVariables: ComposeEnvVar[];
  postStartCommands: string | null;
  liveUrls: string[];
};

export type ComposeConfigRequest = {
  repoUrl: string;
  branch?: string;
  subfolder?: string;
  composeFile?: string;
  routes: ComposeRoute[];
  environmentVariables?: ComposeEnvVar[];
  postStartCommands?: string;
};

export type ComposeInspectRequest = {
  repoUrl: string;
  branch?: string;
  subfolder?: string;
  composeFile?: string;
};

export type ComposeInspectResponse = {
  composeFile: string;
  services: {
    name: string;
    image: string | null;
    buildContext: string | null;
    ports: number[];
    environmentKeys: string[];
    looksPublic: boolean;
  }[];
  suggestedRoutes: ComposeRoute[];
  suggestedEnvironmentVariables: ComposeEnvVar[];
};

export type ProjectDeployment = {
  id: string;
  projectId: string;
  status: string;
  composeProjectName: string | null;
  publicUrls: string[];
  errorMessage: string | null;
  version: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  executionNodeName: string | null;
  failureCategory: string | null;
  routeTargets: RouteTarget[];
};

export type RouteTarget = {
  id: string;
  host: string;
  targetUrl: string;
  status: string;
  executionNodeName: string | null;
  updatedAt: string;
};

export type AiDiagnosis = {
  id: string;
  deploymentId: string;
  diagnosis: {
    diagnosis: string;
    rootCauseCategory: string;
    confidence: "low" | "medium" | "high";
    evidence: string[];
    filesToInspect: { path: string; reason: string }[];
    suggestedFixes: string[];
    isLikelyPlatformIssue: boolean;
    platformIssueReason: string | null;
    missingInformation: string[];
  };
  modelName: string;
  promptVersion: string;
  createdAt: string;
  updatedAt: string;
};
