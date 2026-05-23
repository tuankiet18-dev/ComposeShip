import { BrainCircuit, Copy, Download, Filter, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
  const [diagnosis, setDiagnosis] = useState<AiDiagnosis | null>(null);
  const [diagnosisLoading, setDiagnosisLoading] = useState(false);
  const [diagnosisError, setDiagnosisError] = useState<string | null>(null);
  const [filterErrors, setFilterErrors] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
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
      setDiagnosis(null);
      setDiagnosisError(null);
      return;
    }

    setLogsLoading(true);
    setDiagnosis(null);
    setDiagnosisError(null);
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

    if (selected.kind === "service" && selected.hasAiDiagnosis) {
      setDiagnosisLoading(true);
      api
        .getAiDiagnosis(selected.id)
        .then(setDiagnosis)
        .catch(() => setDiagnosisError(null))
        .finally(() => setDiagnosisLoading(false));
    }
  }, [selected]);

  useEffect(() => {
    if (autoScroll) logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [logs, autoScroll]);

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

  const diagnoseLogs = async () => {
    if (!selected || selected.kind !== "service") return;
    setDiagnosisLoading(true);
    setDiagnosisError(null);
    try {
      const result = await api.generateAiDiagnosis(selected.id);
      setDiagnosis(result);
      toast.success("Diagnosis ready");
    } catch (error) {
      setDiagnosisError(error instanceof Error ? error.message : "Could not diagnose these logs right now.");
      toast.error(error instanceof Error ? error.message : "Could not diagnose these logs right now.");
    } finally {
      setDiagnosisLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Deployments" description="All deploys across your projects, with live logs." />

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : deployments.length === 0 ? (
        <EmptyState
          icon={Filter}
          title="No deployments yet"
          description="Deploy a service or Compose stack to see logs and deployment history here."
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

              <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
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
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={diagnoseLogs}
                      disabled={selected.kind !== "service" || diagnosisLoading}
                    >
                      {diagnosisLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BrainCircuit className="h-4 w-4" />}
                      Diagnose
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
              <Card className="min-w-0 overflow-hidden">
                <CardContent className="space-y-4 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold">Diagnose logs</h3>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        Generate a focused root-cause summary from the captured deployment snapshot.
                      </p>
                    </div>
                  </div>

                  {selected.kind !== "service" ? (
                    <p className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                      AI diagnosis is available for service deployments. Project stack diagnosis can be added when the backend exposes a project deployment diagnosis API.
                    </p>
                  ) : diagnosisLoading ? (
                    <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Diagnosing deployment logs...
                    </div>
                  ) : diagnosis ? (
                    <div className="space-y-4">
                      <div className="rounded-md border border-border bg-muted/30 p-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-medium text-foreground">{diagnosis.diagnosis.rootCauseCategory}</span>
                          <span className="rounded bg-primary/10 px-2 py-0.5 text-primary">{diagnosis.diagnosis.confidence} confidence</span>
                        </div>
                        <p className="mt-2 text-sm leading-6">{diagnosis.diagnosis.diagnosis}</p>
                      </div>
                      {diagnosis.diagnosis.evidence.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold uppercase text-muted-foreground">Evidence</p>
                          <ul className="mt-2 space-y-2 text-xs leading-5 text-muted-foreground">
                            {diagnosis.diagnosis.evidence.map((item) => (
                              <li key={item} className="rounded border border-border bg-background px-3 py-2">{item}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {diagnosis.diagnosis.suggestedFixes.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold uppercase text-muted-foreground">Suggested fixes</p>
                          <ul className="mt-2 space-y-2 text-xs leading-5 text-muted-foreground">
                            {diagnosis.diagnosis.suggestedFixes.map((item) => (
                              <li key={item} className="rounded border border-border bg-background px-3 py-2">{item}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {diagnosisError && (
                        <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                          {diagnosisError}
                        </p>
                      )}
                      <Button className="w-full" onClick={diagnoseLogs} disabled={diagnosisLoading}>
                        <BrainCircuit className="h-4 w-4" /> Diagnose logs
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
              </div>
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
