import { AlertTriangle, BrainCircuit, Copy, Download, Filter, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState } from "@/components/app/EmptyState";
import { PageHeader } from "@/components/app/PageHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api, type AiDiagnosis } from "@/lib/api";
import {
  collectDeployments,
  deploymentMessage,
  formatDuration,
  formatRelativeTime,
  type AppDeployment,
} from "@/lib/deployments";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function DeploymentsPage() {
  const [deployments, setDeployments] = useState<AppDeployment[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [logs, setLogs] = useState("");
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  const [filterErrors, setFilterErrors] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [diagnosis, setDiagnosis] = useState<AiDiagnosis | null>(null);
  const [diagnosisLoading, setDiagnosisLoading] = useState(false);
  const [diagnosisError, setDiagnosisError] = useState<string | null>(null);
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    collectDeployments()
      .then((items) => {
        setDeployments(items);
        setSelectedId(items[0]?.id ?? null);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const visibleDeployments = useMemo(
    () => (filterErrors ? deployments.filter((deployment) => deployment.status.toLowerCase().includes("failed")) : deployments),
    [deployments, filterErrors],
  );

  const selected = visibleDeployments.find((deployment) => deployment.id === selectedId) ?? visibleDeployments[0] ?? null;

  useEffect(() => {
    if (!selected) {
      setLogs("");
      return;
    }

    setLogsLoading(true);
    const request =
      selected.kind === "project"
        ? api.getProjectDeploymentLogs(selected.id)
        : api.getDeploymentLogs(selected.id);

    request
      .then((result) => setLogs(result.buildLogs || "No logs available for this deployment."))
      .catch((error) => {
        console.error(error);
        setLogs(error instanceof Error ? error.message : "Could not load deployment logs.");
      })
      .finally(() => setLogsLoading(false));
  }, [selected]);

  useEffect(() => {
    if (autoScroll) logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [logs, autoScroll]);

  useEffect(() => {
    setDiagnosis(null);
    setDiagnosisError(null);
    setDiagnosisLoading(false);
  }, [selected?.id]);

  const diagnoseSelected = async () => {
    if (!selected || selected.kind !== "service") return;

    setDiagnosisLoading(true);
    setDiagnosisError(null);
    try {
      const result = selected.hasAiDiagnosis
        ? await api.getAiDiagnosis(selected.id)
        : await api.generateAiDiagnosis(selected.id);
      setDiagnosis(result);
      toast.success("Diagnosis ready");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not diagnose this deployment.";
      setDiagnosisError(message);
      toast.error(message);
    } finally {
      setDiagnosisLoading(false);
    }
  };

  const copyLogs = async () => {
    try {
      await navigator.clipboard.writeText(logs);
      toast.success("Logs copied");
    } catch (error) {
      console.warn("Clipboard copy was blocked by the browser.", error);
      toast.error("Clipboard copy was blocked");
    }
  };

  const downloadLogs = () => {
    const blob = new Blob([logs], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selected?.projectName || "deployment"}-${selected?.id || "logs"}.log`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Logs downloaded");
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Activity & logs" description="Deployment history, failure context, and build logs across every project." />

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : deployments.length === 0 ? (
        <EmptyState
          icon={Filter}
          title="No deployments yet"
          description="Deploy a service or Compose stack to see logs and deployment history here."
          action={
            <Button asChild>
              <Link to="/projects">Open projects</Link>
            </Button>
          }
        />
      ) : (
        <section className="grid max-w-full gap-6 overflow-hidden lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              {visibleDeployments.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground">No deployments match the current filter.</div>
              ) : (
                visibleDeployments.map((deployment) => (
                  <button
                    key={deployment.id}
                    type="button"
                    aria-label={`${deployment.projectName} ${deployment.serviceName} deployment ${deployment.status}`}
                    onClick={() => setSelectedId(deployment.id)}
                    className={cn(
                      "flex w-full items-start justify-between gap-3 border-b border-border p-4 text-left last:border-b-0 hover:bg-muted/50",
                      selected?.id === deployment.id && "bg-muted/60",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{deployment.projectName}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{deploymentMessage(deployment)}</p>
                      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="rounded bg-muted px-1.5 py-0.5 font-mono">{deployment.id.slice(0, 7)}</span>
                        <span>{formatRelativeTime(deployment.createdAt)}</span>
                      </div>
                    </div>
                    <StatusBadge status={deployment.status} />
                  </button>
                ))
              )}
            </CardContent>
          </Card>

          {selected ? (
            <div className="min-w-0 space-y-4">
              <Card>
                <CardContent className="flex min-w-0 items-start justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="min-w-0 break-words text-base font-semibold">
                        {selected.projectName} - {selected.serviceName}
                      </h2>
                      <StatusBadge status={selected.status} />
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{deploymentMessage(selected)}</p>
                    <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                      <span>Deployment <span className="font-mono text-foreground">{selected.id.slice(0, 8)}</span></span>
                      <span>Version <span className="font-mono text-foreground">v{selected.version}</span></span>
                      <span>Started {formatRelativeTime(selected.startedAt || selected.createdAt)}</span>
                      <span>Duration {formatDuration(selected.startedAt, selected.completedAt, selected.status)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <DeploymentDiagnosisPanel
                deployment={selected}
                diagnosis={diagnosis}
                diagnosisError={diagnosisError}
                diagnosisLoading={diagnosisLoading}
                onDiagnose={diagnoseSelected}
              />

              <Card className="min-w-0 overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="h-2.5 w-2.5 rounded-full bg-[var(--destructive)]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[var(--warning)]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[var(--success)]" />
                    <span>Deployment logs</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant={filterErrors ? "default" : "ghost"} size="sm" onClick={() => setFilterErrors((value) => !value)}>
                      <Filter className="h-4 w-4" /> Failed only
                    </Button>
                    <Button variant={autoScroll ? "default" : "ghost"} size="sm" onClick={() => setAutoScroll((value) => !value)}>
                      <RefreshCw className="h-4 w-4" /> Auto-scroll
                    </Button>
                    <Button variant="ghost" size="sm" onClick={copyLogs} disabled={!logs}>
                      <Copy className="h-4 w-4" /> Copy
                    </Button>
                    <Button variant="ghost" size="sm" onClick={downloadLogs} disabled={!logs}>
                      <Download className="h-4 w-4" /> Download
                    </Button>
                  </div>
                </div>
                <pre ref={logRef} className="max-h-[560px] min-h-[420px] max-w-full overflow-auto whitespace-pre-wrap break-words bg-terminal p-4 font-mono text-xs leading-6 text-terminal-foreground">
                  {logsLoading ? "Loading logs..." : logs}
                </pre>
              </Card>
            </div>
          ) : (
            <EmptyState
              icon={Filter}
              title="No deployments match"
              description="Clear the filter to see the rest of your deployment history."
            />
          )}
        </section>
      )}
    </div>
  );
}

function DeploymentDiagnosisPanel({
  deployment,
  diagnosis,
  diagnosisError,
  diagnosisLoading,
  onDiagnose,
}: {
  deployment: AppDeployment;
  diagnosis: AiDiagnosis | null;
  diagnosisError: string | null;
  diagnosisLoading: boolean;
  onDiagnose: () => void;
}) {
  const failed = isErrorStatus(deployment.status);
  const isServiceDeployment = deployment.kind === "service";
  const canDiagnose = failed && isServiceDeployment && deployment.hasDiagnosticSnapshot;

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <BrainCircuit className="h-4 w-4 text-primary" />
              <h2 className="text-base font-semibold">AI diagnosis</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Explain failed service deploys from captured logs and diagnostic snapshots.
            </p>
          </div>
          <Button type="button" onClick={onDiagnose} disabled={!canDiagnose || diagnosisLoading}>
            {diagnosisLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BrainCircuit className="h-4 w-4" />}
            {deployment.hasAiDiagnosis ? "Open diagnosis" : "Diagnose issue"}
          </Button>
        </div>

        {!failed && (
          <p className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
            Diagnosis appears after a deployment fails.
          </p>
        )}

        {failed && !isServiceDeployment && (
          <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-warning" />
            <div>
              <p className="font-medium">Compose stack diagnosis is not wired yet</p>
              <p className="mt-1 text-muted-foreground">
                AI diagnosis is currently available for single-service deployments. Compose stack support needs project-deployment diagnostics on the backend.
              </p>
            </div>
          </div>
        )}

        {failed && isServiceDeployment && !deployment.hasDiagnosticSnapshot && (
          <p className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
            No diagnostic snapshot was captured for this failed deployment.
          </p>
        )}

        {diagnosisError && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {diagnosisError}
          </p>
        )}

        {diagnosis && (
          <div className="space-y-4 rounded-md border bg-muted/20 p-4">
            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground">Root cause</p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <span className="rounded bg-primary/10 px-2 py-0.5 text-primary">
                  {diagnosis.diagnosis.rootCauseCategory}
                </span>
                <span className="rounded bg-muted px-2 py-0.5 text-muted-foreground">
                  {diagnosis.diagnosis.confidence} confidence
                </span>
              </div>
              <p className="mt-2 text-sm leading-6">{diagnosis.diagnosis.diagnosis}</p>
            </div>
            <DiagnosisList title="Evidence" values={diagnosis.diagnosis.evidence} />
            <DiagnosisList title="Suggested fixes" values={diagnosis.diagnosis.suggestedFixes} />
            {diagnosis.diagnosis.platformIssueReason && (
              <p className="rounded-md border bg-background p-3 text-sm text-muted-foreground">
                {diagnosis.diagnosis.platformIssueReason}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DiagnosisList({ title, values }: { title: string; values: string[] }) {
  if (values.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-muted-foreground">{title}</p>
      <ul className="mt-2 space-y-2 text-sm leading-6">
        {values.map((value) => (
          <li key={value} className="rounded border bg-background px-3 py-2 text-muted-foreground">
            {value}
          </li>
        ))}
      </ul>
    </div>
  );
}

function isErrorStatus(status: string) {
  const value = status.toLowerCase();
  return value.includes("failed") || value.includes("error") || value.includes("unhealthy");
}
