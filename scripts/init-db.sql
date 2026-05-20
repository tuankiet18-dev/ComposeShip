-- =======================================
-- OneClick-Host Database Initialization
-- =======================================
-- This script is a safety net / reference.
-- EF Core migrations handle schema creation in production.

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS "Users" (
    "Id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "Email" VARCHAR(255) NOT NULL UNIQUE,
    "PasswordHash" TEXT NOT NULL,
    "FullName" VARCHAR(100) NOT NULL,
    "CreatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "UpdatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Projects table
CREATE TABLE IF NOT EXISTS "Projects" (
    "Id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "UserId" UUID NOT NULL REFERENCES "Users"("Id") ON DELETE CASCADE,
    "Name" VARCHAR(100) NOT NULL,
    "Description" VARCHAR(500),
    "CreatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "UpdatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Services table
CREATE TABLE IF NOT EXISTS "Services" (
    "Id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "ProjectId" UUID NOT NULL REFERENCES "Projects"("Id") ON DELETE CASCADE,
    "Name" VARCHAR(100) NOT NULL,
    "RepoUrl" VARCHAR(500) NOT NULL,
    "Branch" VARCHAR(100) DEFAULT 'main',
    "Subfolder" VARCHAR(255),
    "ServiceType" VARCHAR(20) DEFAULT 'frontend',
    "DetectedStack" VARCHAR(30),
    "ContainerId" VARCHAR(100),
    "LiveUrl" VARCHAR(500),
    "Status" VARCHAR(20) DEFAULT 'created',
    "CreatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "UpdatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Deployments table (BuildLogs merged as single text column for MVP)
CREATE TABLE IF NOT EXISTS "Deployments" (
    "Id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "ServiceId" UUID NOT NULL REFERENCES "Services"("Id") ON DELETE CASCADE,
    "Status" VARCHAR(20) DEFAULT 'queued',
    "ImageTag" VARCHAR(200),
    "ErrorMessage" VARCHAR(2000),
    "BuildLogs" TEXT,
    "Version" INT DEFAULT 1,
    "StartedAt" TIMESTAMP WITH TIME ZONE,
    "CompletedAt" TIMESTAMP WITH TIME ZONE,
    "CreatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Diagnostic snapshots captured by the Worker when a deployment fails.
CREATE TABLE IF NOT EXISTS "DeploymentDiagnosticSnapshots" (
    "Id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "DeploymentId" UUID NOT NULL UNIQUE REFERENCES "Deployments"("Id") ON DELETE CASCADE,
    "FailureStep" VARCHAR(50) NOT NULL DEFAULT 'unknown',
    "DetectedStack" VARCHAR(50),
    "ErrorSummary" VARCHAR(500),
    "RelevantLogExcerpt" TEXT,
    "RepositoryTree" JSONB,
    "SelectedFiles" JSONB,
    "CreatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- One-shot AI diagnosis generated from a deployment diagnostic snapshot.
CREATE TABLE IF NOT EXISTS "DeploymentAiDiagnoses" (
    "Id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "DeploymentId" UUID NOT NULL UNIQUE REFERENCES "Deployments"("Id") ON DELETE CASCADE,
    "DiagnosisJson" JSONB NOT NULL,
    "ModelName" VARCHAR(100) NOT NULL,
    "PromptVersion" VARCHAR(50) NOT NULL,
    "CreatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "UpdatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Environment Variables table
CREATE TABLE IF NOT EXISTS "EnvironmentVariables" (
    "Id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "ServiceId" UUID NOT NULL REFERENCES "Services"("Id") ON DELETE CASCADE,
    "Key" VARCHAR(255) NOT NULL,
    "Value" VARCHAR(2000) NOT NULL,
    "IsSecret" BOOLEAN DEFAULT FALSE,
    "CreatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_projects_user ON "Projects"("UserId");
CREATE INDEX IF NOT EXISTS idx_services_project ON "Services"("ProjectId");
CREATE INDEX IF NOT EXISTS idx_deployments_service ON "Deployments"("ServiceId");
CREATE INDEX IF NOT EXISTS idx_deployments_status ON "Deployments"("Status");
CREATE INDEX IF NOT EXISTS idx_diagnostic_snapshots_deployment ON "DeploymentDiagnosticSnapshots"("DeploymentId");
CREATE INDEX IF NOT EXISTS idx_ai_diagnoses_deployment ON "DeploymentAiDiagnoses"("DeploymentId");
CREATE INDEX IF NOT EXISTS idx_env_vars_service ON "EnvironmentVariables"("ServiceId");
