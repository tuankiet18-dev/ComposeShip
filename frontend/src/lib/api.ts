const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

class ApiClient {
  private getToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("token");
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = this.getToken();

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...((options.headers as Record<string, string>) || {}),
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      // Token expired or invalid
      if (typeof window !== "undefined") {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = "/login";
      }
      throw new Error("Unauthorized");
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `API Error: ${response.status}`);
    }

    // Handle 204 No Content
    if (response.status === 204) return {} as T;

    return response.json();
  }

  // ── Auth ─────────────────────────────────
  async register(email: string, password: string, fullName: string) {
    return this.request<{
      id: string;
      email: string;
      fullName: string;
      token: string;
    }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, fullName }),
    });
  }

  async login(email: string, password: string) {
    return this.request<{
      id: string;
      email: string;
      fullName: string;
      token: string;
    }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  }

  async getProfile() {
    return this.request<{
      id: string;
      email: string;
      fullName: string;
      createdAt: string;
    }>("/auth/me");
  }

  // ── Projects ─────────────────────────────
  async getProjects() {
    return this.request<
      {
        id: string;
        name: string;
        description: string | null;
        serviceCount: number;
        createdAt: string;
        updatedAt: string;
      }[]
    >("/projects");
  }

  async createProject(name: string, description?: string) {
    return this.request<{ id: string; name: string }>("/projects", {
      method: "POST",
      body: JSON.stringify({ name, description }),
    });
  }

  async getProject(id: string) {
    return this.request<{
      id: string;
      name: string;
      description: string | null;
      services: {
        id: string;
        name: string;
        serviceType: string;
        detectedStack: string | null;
        status: string;
        liveUrl: string | null;
      }[];
      createdAt: string;
      updatedAt: string;
    }>(`/projects/${id}`);
  }

  async deleteProject(id: string) {
    return this.request(`/projects/${id}`, { method: "DELETE" });
  }

  // ── Services ─────────────────────────────
  async getServices(projectId: string) {
    return this.request<
      {
        id: string;
        name: string;
        repoUrl: string;
        status: string;
        liveUrl: string | null;
      }[]
    >(`/projects/${projectId}/services`);
  }

  async createService(
    projectId: string,
    data: {
      name: string;
      repoUrl: string;
      branch?: string;
      subfolder?: string;
      serviceType?: string;
      networkAliases?: string;
    }
  ) {
    return this.request(`/projects/${projectId}/services`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getService(id: string) {
    return this.request<{
      id: string;
      projectId: string;
      name: string;
      repoUrl: string;
      branch: string;
      subfolder: string | null;
      serviceType: string;
      detectedStack: string | null;
      containerId: string | null;
      status: string;
      liveUrl: string | null;
      environmentVariables: {
        id: string;
        key: string;
        value: string;
        isSecret: boolean;
      }[];
      recentDeployments: {
        id: string;
        status: string;
        version: number;
        startedAt: string | null;
        completedAt: string | null;
        createdAt: string;
      }[];
      createdAt: string;
      updatedAt: string;
    }>(`/services/${id}`);
  }

  async deleteService(id: string) {
    return this.request(`/services/${id}`, { method: "DELETE" });
  }

  // ── Deployments ──────────────────────────
  async triggerDeploy(serviceId: string) {
    return this.request(`/services/${serviceId}/deploy`, { method: "POST" });
  }

  async getDeployments(serviceId: string) {
    return this.request<
      {
        id: string;
        status: string;
        version: number;
        startedAt: string | null;
        completedAt: string | null;
        createdAt: string;
      }[]
    >(`/services/${serviceId}/deployments`);
  }

  async getDeployment(id: string) {
    return this.request<{
      id: string;
      serviceId: string;
      status: string;
      imageTag: string | null;
      errorMessage: string | null;
      version: number;
    }>(`/deployments/${id}`);
  }

  async getDeploymentLogs(id: string) {
    return this.request<{
      deploymentId: string;
      status: string;
      buildLogs: string | null;
    }>(`/deployments/${id}/logs`);
  }

  // ── Environment Variables ────────────────
  async getEnvVars(serviceId: string) {
    return this.request<
      { id: string; key: string; value: string; isSecret: boolean }[]
    >(`/services/${serviceId}/env`);
  }

  async updateEnvVars(
    serviceId: string,
    envVars: { key: string; value: string; isSecret: boolean }[]
  ) {
    return this.request(`/services/${serviceId}/env`, {
      method: "PUT",
      body: JSON.stringify(envVars),
    });
  }
}

export const api = new ApiClient();
