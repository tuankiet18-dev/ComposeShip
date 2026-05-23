// ── Auth ──────────────────────────────────────────
export interface AuthResponse {
  id: string;
  email: string;
  fullName: string;
  token?: string;
}

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  createdAt: string;
}

// ── Project ───────────────────────────────────────
export interface Project {
  id: string;
  name: string;
  description: string | null;
  serviceCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectDetail {
  id: string;
  name: string;
  description: string | null;
  services: ServiceSummary[];
  createdAt: string;
  updatedAt: string;
}

export interface ServiceSummary {
  id: string;
  name: string;
  serviceType: string;
  detectedStack: string | null;
  status: string;
  liveUrl: string | null;
}

// ── Service ───────────────────────────────────────
export interface Service {
  id: string;
  projectId: string;
  name: string;
  repoUrl: string;
  branch: string;
  subfolder: string | null;
  serviceType: string;
  detectedStack: string | null;
  status: string;
  liveUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceDetail extends Service {
  containerId: string | null;
  environmentVariables: EnvVar[];
  recentDeployments: DeploymentSummary[];
}

export interface EnvVar {
  id: string;
  key: string;
  value: string;
  isSecret: boolean;
}

// ── Deployment ────────────────────────────────────
export interface DeploymentSummary {
  id: string;
  status: string;
  version: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  hasDiagnosticSnapshot: boolean;
  hasAiDiagnosis: boolean;
}

export interface Deployment extends DeploymentSummary {
  serviceId: string;
  imageTag: string | null;
  errorMessage: string | null;
}

export interface DeploymentLogs {
  deploymentId: string;
  status: string;
  buildLogs: string | null;
}

export interface DeploymentAiDiagnosis {
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
}

// ── Status types ──────────────────────────────────
export type ServiceStatus = "created" | "deploying" | "live" | "stopped" | "failed";
export type DeploymentStatus = "queued" | "cloning" | "building" | "deploying" | "live" | "failed";
