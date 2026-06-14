import {
  Box,
  Boxes,
  Cable,
  Database,
  Minimize2,
  GitBranch,
  HardDrive,
  KeyRound,
  Loader2,
  Maximize2,
  Minus,
  RotateCcw,
  Network,
  Plus,
  RadioTower,
  Server,
  Workflow,
} from "lucide-react";
import type { ComponentType, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "@/components/app/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  api,
  type DeploymentGraph,
  type DeploymentGraphEdge,
  type DeploymentGraphNode,
  type DeploymentGraphNodeType,
} from "@/lib/api";
import { cn } from "@/lib/utils";

type DeploymentGraphPanelProps = {
  projectId: string;
  hasComposeConfig: boolean;
};

type PositionedNode = DeploymentGraphNode & {
  x: number;
  y: number;
  width: number;
  height: number;
};

type Point = { x: number; y: number };
type ViewState = { x: number; y: number; scale: number };

const nodeWidth = 188;
const nodeHeight = 74;
const columnGap = 260;
const rowGap = 136;
const canvasPadding = 80;
const autoPanThreshold = 64;
const autoPanMaxSpeed = 18;

const nodeTypeLabels: Record<DeploymentGraphNodeType, string> = {
  service: "Service",
  database: "Database",
  cache: "Cache",
  worker: "Worker",
  reverse_proxy: "Reverse proxy",
  volume: "Volume",
  env_var: "Env var",
  network: "Network",
};

const nodeTypeIcons: Record<DeploymentGraphNodeType, ComponentType<{ className?: string }>> = {
  service: Server,
  database: Database,
  cache: Box,
  worker: Workflow,
  reverse_proxy: RadioTower,
  volume: HardDrive,
  env_var: KeyRound,
  network: Network,
};

const nodeTypeClasses: Record<DeploymentGraphNodeType, string> = {
  service: "border-primary/25 bg-primary/10 text-primary",
  database: "border-success/25 bg-success/10 text-success",
  cache: "border-warning/25 bg-warning/10 text-warning",
  worker: "border-info/25 bg-info/10 text-info",
  reverse_proxy: "border-primary/25 bg-primary/10 text-primary",
  volume: "border-border bg-muted text-muted-foreground",
  env_var: "border-border bg-muted text-muted-foreground",
  network: "border-info/25 bg-info/10 text-info",
};

const nodeSvgColors: Record<DeploymentGraphNodeType, { fill: string; stroke: string; accent: string }> = {
  service: { fill: "#eff6ff", stroke: "#93c5fd", accent: "#2563eb" },
  database: { fill: "#ecfdf5", stroke: "#86efac", accent: "#16a34a" },
  cache: { fill: "#fffbeb", stroke: "#fcd34d", accent: "#d97706" },
  worker: { fill: "#f0f9ff", stroke: "#7dd3fc", accent: "#0284c7" },
  reverse_proxy: { fill: "#eef2ff", stroke: "#a5b4fc", accent: "#4f46e5" },
  volume: { fill: "#f8fafc", stroke: "#cbd5e1", accent: "#64748b" },
  env_var: { fill: "#faf5ff", stroke: "#d8b4fe", accent: "#7e22ce" },
  network: { fill: "#ecfeff", stroke: "#67e8f9", accent: "#0891b2" },
};

const edgeLabels: Record<DeploymentGraphEdge["type"], string> = {
  depends_on: "depends on",
  uses_env: "uses env",
  mounts: "mounts",
  exposes: "exposes",
  connects_to: "connects to",
};

const edgeColors: Record<DeploymentGraphEdge["type"], string> = {
  depends_on: "#2563eb",
  uses_env: "#7e22ce",
  mounts: "#64748b",
  exposes: "#0891b2",
  connects_to: "#475569",
};

const runtimeTypes = new Set<DeploymentGraphNodeType>(["reverse_proxy", "service", "worker", "database", "cache"]);
const resourceTypes = new Set<DeploymentGraphNodeType>(["network", "volume", "env_var"]);

export function DeploymentGraphPanel({ projectId, hasComposeConfig }: DeploymentGraphPanelProps) {
  const [graph, setGraph] = useState<DeploymentGraph | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!hasComposeConfig) {
      setGraph(null);
      setError(null);
      setSelectedId(null);
      return;
    }

    setLoading(true);
    setError(null);
    api
      .getDeploymentGraph(projectId)
      .then((result) => {
        setGraph(result);
        setSelectedId((current) => current ?? firstRuntimeNode(result)?.id ?? result.nodes[0]?.id ?? null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load deployment graph."))
      .finally(() => setLoading(false));
  }, [hasComposeConfig, projectId]);

  const nodesById = useMemo(() => new Map((graph?.nodes || []).map((node) => [node.id, node])), [graph]);
  const selectedNode = selectedId ? nodesById.get(selectedId) ?? null : null;
  const selectedEdges = useMemo(
    () => (selectedId ? (graph?.edges || []).filter((edge) => edge.source === selectedId || edge.target === selectedId) : []),
    [graph?.edges, selectedId],
  );
  const runtimeCount = useMemo(() => (graph?.nodes || []).filter((node) => runtimeTypes.has(node.type)).length, [graph]);
  const resourceCount = useMemo(() => (graph?.nodes || []).filter((node) => resourceTypes.has(node.type)).length, [graph]);

  if (!hasComposeConfig) {
    return (
      <EmptyState
        icon={GitBranch}
        title="No Compose source"
        description="Save a Compose configuration before opening the deployment graph."
      />
    );
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading deployment graph...
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={Cable}
        title="Graph unavailable"
        description={error}
        action={
          <Button variant="outline" onClick={() => window.location.reload()}>
            Reload page
          </Button>
        }
      />
    );
  }

  if (!graph || graph.nodes.length === 0) {
    return (
      <EmptyState
        icon={Boxes}
        title="No graph nodes"
        description="The source was found, but it did not contain services to graph."
      />
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <GraphMetric label="Nodes" value={graph.nodes.length} />
          <GraphMetric label="Edges" value={graph.edges.length} />
          <GraphMetric label="Runtime" value={runtimeCount} />
          <GraphMetric label="Resources" value={resourceCount} />
        </div>

        <GraphCanvas
          graph={graph}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </div>

      <Card className="h-fit xl:sticky xl:top-6">
        <CardHeader>
          <CardTitle className="text-base">Node detail</CardTitle>
          <CardDescription>{selectedNode ? selectedNode.id : "Select a node"}</CardDescription>
        </CardHeader>
        <CardContent>
          {selectedNode ? (
            <div className="space-y-4">
              <NodeDetailHeader node={selectedNode} />
              <DetailList metadata={selectedNode.metadata} />
              <Separator />
              <div>
                <p className="text-sm font-medium">Connected edges</p>
                {selectedEdges.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">No direct edges.</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {selectedEdges.map((edge) => {
                      const otherId = edge.source === selectedNode.id ? edge.target : edge.source;
                      const other = nodesById.get(otherId);
                      return (
                        <button
                          key={edge.id}
                          type="button"
                          onClick={() => setSelectedId(otherId)}
                          className="w-full rounded-md border p-2 text-left text-sm transition-colors hover:bg-muted/60"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <Badge variant="outline">{edgeLabels[edge.type]}</Badge>
                            <span className="truncate text-muted-foreground">{other?.label || otherId}</span>
                          </div>
                          {Object.keys(edge.metadata).length > 0 && <DetailList metadata={edge.metadata} compact />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">Select a node to inspect it.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function GraphCanvas({
  graph,
  selectedId,
  onSelect,
}: {
  graph: DeploymentGraph;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const initialScale = graph.nodes.length > 4 ? 0.38 : 0.78;
  const initialX = graph.nodes.length > 4 ? -120 : 18;
  const viewRef = useRef<ViewState>({ x: initialX, y: 24, scale: initialScale });
  const draggedNodeRef = useRef<{ id: string; offset: Point } | null>(null);
  const pointerRef = useRef<Point | null>(null);
  const autoPanFrameRef = useRef<number | null>(null);
  const [view, setView] = useState<ViewState>({ x: initialX, y: 24, scale: initialScale });
  const [draggedNode, setDraggedNode] = useState<{ id: string; offset: Point } | null>(null);
  const [panning, setPanning] = useState<Point | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [manualPositions, setManualPositions] = useState<Record<string, Point>>({});
  const layout = useMemo(() => buildLayout(graph, manualPositions), [graph, manualPositions]);
  const nodeMap = useMemo(() => new Map(layout.nodes.map((node) => [node.id, node])), [layout.nodes]);
  const connectedIds = useMemo(() => {
    if (!selectedId) return new Set<string>();
    const ids = new Set<string>([selectedId]);
    graph.edges.forEach((edge) => {
      if (edge.source === selectedId) ids.add(edge.target);
      if (edge.target === selectedId) ids.add(edge.source);
    });
    return ids;
  }, [graph.edges, selectedId]);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    draggedNodeRef.current = draggedNode;
  }, [draggedNode]);

  const pointToWorld = useCallback(
    (point: Point, currentView: ViewState): Point => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: (point.x - rect.left - currentView.x) / currentView.scale,
        y: (point.y - rect.top - currentView.y) / currentView.scale,
      };
    },
    [],
  );

  const updateDraggedNodePosition = useCallback(
    (pointer: Point, currentView = viewRef.current) => {
      const drag = draggedNodeRef.current;
      if (!drag) return;
      const point = pointToWorld(pointer, currentView);
      setManualPositions((positions) => ({
        ...positions,
        [drag.id]: {
          x: point.x - drag.offset.x,
          y: point.y - drag.offset.y,
        },
      }));
    },
    [pointToWorld],
  );

  const stopAutoPan = useCallback(() => {
    if (autoPanFrameRef.current !== null) {
      window.cancelAnimationFrame(autoPanFrameRef.current);
      autoPanFrameRef.current = null;
    }
  }, []);

  const runAutoPan = useCallback(() => {
    const drag = draggedNodeRef.current;
    const pointer = pointerRef.current;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!drag || !pointer || !rect) {
      autoPanFrameRef.current = null;
      return;
    }

    const dx = edgePanDelta(pointer.x, rect.left, rect.right);
    const dy = edgePanDelta(pointer.y, rect.top, rect.bottom);

    if (dx !== 0 || dy !== 0) {
      const current = viewRef.current;
      const next = { ...current, x: current.x + dx, y: current.y + dy };
      viewRef.current = next;
      setView(next);
      // Keep the dragged node anchored under the cursor while the viewport moves.
      updateDraggedNodePosition(pointer, next);
    }

    autoPanFrameRef.current = window.requestAnimationFrame(runAutoPan);
  }, [updateDraggedNodePosition]);

  const startAutoPan = useCallback(() => {
    if (autoPanFrameRef.current === null) {
      autoPanFrameRef.current = window.requestAnimationFrame(runAutoPan);
    }
  }, [runAutoPan]);

  useEffect(() => stopAutoPan, [stopAutoPan]);

  useEffect(() => {
    if (!isFullscreen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsFullscreen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen]);

  const zoom = (factor: number) => {
    setView((current) => ({
      ...current,
      scale: clamp(current.scale * factor, 0.35, 1.8),
    }));
  };

  const resetView = () => {
    setView({ x: graph.nodes.length > 4 ? -120 : 18, y: 24, scale: graph.nodes.length > 4 ? 0.38 : 0.78 });
    setManualPositions({});
  };

  const toggleFullscreen = () => {
    const next = !isFullscreen;
    setIsFullscreen(next);
    window.requestAnimationFrame(() => {
      setView({
        x: next ? 72 : graph.nodes.length > 4 ? -120 : 18,
        y: next ? 80 : 24,
        scale: next ? (graph.nodes.length > 8 ? 0.72 : 0.9) : graph.nodes.length > 4 ? 0.38 : 0.78,
      });
    });
  };

  const handleWheel = (event: ReactWheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const factor = event.deltaY > 0 ? 0.92 : 1.08;
    setView((current) => {
      const nextScale = clamp(current.scale * factor, 0.35, 1.8);
      const worldX = (pointer.x - current.x) / current.scale;
      const worldY = (pointer.y - current.y) / current.scale;
      return {
        scale: nextScale,
        x: pointer.x - worldX * nextScale,
        y: pointer.y - worldY * nextScale,
      };
    });
  };

  const handleCanvasPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setPanning({ x: event.clientX - view.x, y: event.clientY - view.y });
  };

  const handleNodePointerDown = (event: ReactPointerEvent<SVGGElement>, node: PositionedNode) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointToWorld({ x: event.clientX, y: event.clientY }, viewRef.current);
    setDraggedNode({ id: node.id, offset: { x: point.x - node.x, y: point.y - node.y } });
    onSelect(node.id);
    pointerRef.current = { x: event.clientX, y: event.clientY };
    startAutoPan();
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (draggedNode) {
      const pointer = { x: event.clientX, y: event.clientY };
      pointerRef.current = pointer;
      updateDraggedNodePosition(pointer);
      startAutoPan();
      return;
    }

    if (panning) {
      setView((current) => ({
        ...current,
        x: event.clientX - panning.x,
        y: event.clientY - panning.y,
      }));
    }
  };

  const stopPointerActions = () => {
    setDraggedNode(null);
    setPanning(null);
    pointerRef.current = null;
    stopAutoPan();
  };

  const graphBody = (
    <>
      <div className="overflow-hidden rounded-md border bg-muted/20">
        <svg
          ref={svgRef}
          className={cn(isFullscreen ? "h-[calc(100vh-146px)]" : "h-[620px]", "w-full touch-none select-none", panning ? "cursor-grabbing" : "cursor-grab")}
          onWheel={handleWheel}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={stopPointerActions}
          onPointerCancel={stopPointerActions}
          role="img"
          aria-label="Deployment graph visualization"
        >
          <defs>
            <pattern id="graph-grid" width="32" height="32" patternUnits="userSpaceOnUse">
              <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#e2e8f0" strokeWidth="1" />
            </pattern>
            {Object.entries(edgeColors).map(([type, color]) => (
              <marker
                key={type}
                id={`arrow-${type}`}
                markerWidth="10"
                markerHeight="10"
                refX="9"
                refY="3"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M0,0 L0,6 L9,3 z" fill={color} />
              </marker>
            ))}
          </defs>
          <rect width="100%" height="100%" fill="url(#graph-grid)" />
          <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
            {graph.edges.map((edge) => {
              const source = nodeMap.get(edge.source);
              const target = nodeMap.get(edge.target);
              if (!source || !target) return null;
              const isActive = !selectedId || edge.source === selectedId || edge.target === selectedId;
              return (
                <GraphEdgePath
                  key={edge.id}
                  edge={edge}
                  source={source}
                  target={target}
                  active={isActive}
                />
              );
            })}

            {layout.nodes.map((node) => {
              const isSelected = node.id === selectedId;
              const isDimmed = selectedId ? !connectedIds.has(node.id) : false;
              return (
                <GraphNodeShape
                  key={node.id}
                  node={node}
                  selected={isSelected}
                  dimmed={isDimmed}
                  onPointerDown={(event) => handleNodePointerDown(event, node)}
                />
              );
            })}
          </g>
        </svg>
      </div>
      <GraphLegend />
    </>
  );

  const header = (
    <CardHeader className="gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <CardTitle className="flex items-center gap-2 text-base">
          <Network className="h-4 w-4 text-primary" />
          Deployment graph
        </CardTitle>
        <CardDescription>Drag nodes, pan the canvas, and zoom with the wheel or controls.</CardDescription>
      </div>
      <div className="flex items-center gap-1">
        <Button type="button" variant="outline" size="icon" onClick={() => zoom(0.86)} aria-label="Zoom out">
          <Minus className="h-4 w-4" />
        </Button>
        <span className="w-14 text-center text-xs text-muted-foreground">{Math.round(view.scale * 100)}%</span>
        <Button type="button" variant="outline" size="icon" onClick={() => zoom(1.16)} aria-label="Zoom in">
          <Plus className="h-4 w-4" />
        </Button>
        <Button type="button" variant="outline" size="icon" onClick={resetView} aria-label="Reset view" title="Reset view">
          <RotateCcw className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={toggleFullscreen}
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        >
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </Button>
      </div>
    </CardHeader>
  );

  return (
    <>
      <Card>
        {header}
        <CardContent>{graphBody}</CardContent>
      </Card>
      {isFullscreen && (
        <div className="fixed inset-0 z-[100] bg-background p-4">
          <Card className="flex h-full min-h-0 flex-col">
            {header}
            <CardContent className="min-h-0 flex-1">{graphBody}</CardContent>
          </Card>
        </div>
      )}
    </>
  );
}

function GraphEdgePath({
  edge,
  source,
  target,
  active,
}: {
  edge: DeploymentGraphEdge;
  source: PositionedNode;
  target: PositionedNode;
  active: boolean;
}) {
  const color = edgeColors[edge.type];
  const start = edgeAnchor(source, target);
  const end = edgeAnchor(target, source);
  const delta = Math.max(80, Math.abs(end.x - start.x) * 0.45);
  const direction = end.x >= start.x ? 1 : -1;
  const path = `M ${start.x} ${start.y} C ${start.x + delta * direction} ${start.y}, ${end.x - delta * direction} ${end.y}, ${end.x} ${end.y}`;
  const labelX = (start.x + end.x) / 2;
  const labelY = (start.y + end.y) / 2 - 8;

  return (
    <g opacity={active ? 1 : 0.18}>
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={active ? 2.2 : 1.4}
        markerEnd={`url(#arrow-${edge.type})`}
      />
      <g transform={`translate(${labelX} ${labelY})`}>
        <rect x="-45" y="-11" width="90" height="22" rx="5" fill="#ffffff" stroke="#e2e8f0" />
        <text textAnchor="middle" dominantBaseline="middle" className="fill-slate-600 text-[10px]">
          {edgeLabels[edge.type]}
        </text>
      </g>
    </g>
  );
}

function GraphNodeShape({
  node,
  selected,
  dimmed,
  onPointerDown,
}: {
  node: PositionedNode;
  selected: boolean;
  dimmed: boolean;
  onPointerDown: (event: ReactPointerEvent<SVGGElement>) => void;
}) {
  const colors = nodeSvgColors[node.type];
  const label = truncateMiddle(node.label, 20);
  const detail = node.metadata.image || node.metadata.build || node.metadata.containerization || node.metadata.service || node.id;

  return (
    <g
      transform={`translate(${node.x} ${node.y})`}
      onPointerDown={onPointerDown}
      className="cursor-grab active:cursor-grabbing"
      opacity={dimmed ? 0.3 : 1}
    >
      <rect
        width={node.width}
        height={node.height}
        rx="8"
        fill={colors.fill}
        stroke={selected ? colors.accent : colors.stroke}
        strokeWidth={selected ? 3 : 1.5}
        filter={selected ? "drop-shadow(0 6px 14px rgb(15 23 42 / 0.16))" : undefined}
      />
      <circle cx="25" cy="25" r="13" fill="#ffffff" stroke={colors.stroke} />
      <text x="25" y="29" textAnchor="middle" className="fill-slate-700 text-[14px] font-bold">
        {nodeIconGlyph(node.type)}
      </text>
      <text x="48" y="25" className="fill-slate-900 text-[13px] font-semibold">
        {label}
      </text>
      <text x="48" y="45" className="fill-slate-500 text-[10px]">
        {nodeTypeLabels[node.type]}
      </text>
      <text x="12" y="63" className="fill-slate-500 text-[10px]">
        {truncateMiddle(detail, 28)}
      </text>
    </g>
  );
}

function GraphLegend() {
  const types: DeploymentGraphNodeType[] = ["service", "worker", "database", "cache", "env_var", "volume", "network"];
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {types.map((type) => (
        <span key={type} className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-1 text-xs text-muted-foreground">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: nodeSvgColors[type].accent }} />
          {nodeTypeLabels[type]}
        </span>
      ))}
    </div>
  );
}

function NodeDetailHeader({ node }: { node: DeploymentGraphNode }) {
  const Icon = nodeTypeIcons[node.type];
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="flex items-start gap-3">
        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md border", nodeTypeClasses[node.type])}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold">{node.label}</p>
            <Badge variant="outline">{nodeTypeLabels[node.type]}</Badge>
          </div>
          <p className="mt-1 break-all font-mono text-[0.7rem] text-muted-foreground">{node.id}</p>
        </div>
      </div>
    </div>
  );
}

function GraphMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function DetailList({ metadata, compact = false }: { metadata: Record<string, string>; compact?: boolean }) {
  const entries = Object.entries(metadata);
  if (entries.length === 0) {
    return compact ? null : <p className="text-sm text-muted-foreground">No metadata.</p>;
  }

  return (
    <dl className={cn("grid gap-2 text-sm", compact ? "mt-2" : "")}>
      {entries.map(([key, value]) => (
        <div key={key} className="grid grid-cols-[100px_minmax(0,1fr)] gap-2">
          <dt className="text-muted-foreground">{key}</dt>
          <dd className="min-w-0 break-words font-mono text-xs">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function buildLayout(graph: DeploymentGraph, manualPositions: Record<string, Point>) {
  const sourceByTarget = new Map<string, DeploymentGraphEdge[]>();
  graph.edges.forEach((edge) => {
    sourceByTarget.set(edge.target, [...(sourceByTarget.get(edge.target) || []), edge]);
  });

  const columns = new Map<number, DeploymentGraphNode[]>();
  graph.nodes.forEach((node) => {
    const column = resolveColumn(node, sourceByTarget);
    columns.set(column, [...(columns.get(column) || []), node]);
  });

  const positioned: PositionedNode[] = [];
  Array.from(columns.entries())
    .sort(([a], [b]) => a - b)
    .forEach(([column, nodes]) => {
      const sorted = [...nodes].sort(compareNodes);
      sorted.forEach((node, row) => {
        const automatic = {
          x: canvasPadding + column * columnGap,
          y: canvasPadding + row * rowGap + columnStagger(column),
        };
        const manual = manualPositions[node.id];
        positioned.push({
          ...node,
          ...(manual || automatic),
          width: nodeWidth,
          height: nodeHeight,
        });
      });
    });

  return { nodes: positioned };
}

function resolveColumn(node: DeploymentGraphNode, sourceByTarget: Map<string, DeploymentGraphEdge[]>) {
  if (node.type === "reverse_proxy") return 0;
  if (node.type === "service") return 1;
  if (node.type === "worker") return 2;
  if (node.type === "database" || node.type === "cache") return 3;
  if (node.type === "volume") return 3;
  if (node.type === "network") return node.label.toLowerCase().includes("public") ? 0 : 4;
  if (node.type === "env_var") {
    const source = sourceByTarget.get(node.id)?.find((edge) => edge.type === "uses_env")?.source;
    if (source?.includes("worker")) return 3;
    return 2;
  }
  return 1;
}

function compareNodes(a: DeploymentGraphNode, b: DeploymentGraphNode) {
  const typeOrder: DeploymentGraphNodeType[] = ["reverse_proxy", "service", "worker", "database", "cache", "env_var", "volume", "network"];
  const byType = typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type);
  if (byType !== 0) return byType;
  return a.label.localeCompare(b.label);
}

function columnStagger(column: number) {
  return column % 2 === 0 ? 0 : 42;
}

function edgeAnchor(node: PositionedNode, other: PositionedNode) {
  const x = other.x >= node.x ? node.x + node.width : node.x;
  return { x, y: node.y + node.height / 2 };
}

function firstRuntimeNode(graph: DeploymentGraph) {
  return graph.nodes.find((node) => runtimeTypes.has(node.type));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function edgePanDelta(pointer: number, start: number, end: number) {
  const distanceToStart = pointer - start;
  const distanceToEnd = end - pointer;

  if (distanceToStart < autoPanThreshold) {
    const intensity = (autoPanThreshold - Math.max(distanceToStart, 0)) / autoPanThreshold;
    return autoPanMaxSpeed * intensity;
  }

  if (distanceToEnd < autoPanThreshold) {
    const intensity = (autoPanThreshold - Math.max(distanceToEnd, 0)) / autoPanThreshold;
    return -autoPanMaxSpeed * intensity;
  }

  return 0;
}

function truncateMiddle(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  const head = Math.ceil((maxLength - 1) / 2);
  const tail = Math.floor((maxLength - 1) / 2);
  return `${value.slice(0, head)}...${value.slice(value.length - tail)}`;
}

function nodeIconGlyph(type: DeploymentGraphNodeType) {
  const glyphs: Record<DeploymentGraphNodeType, string> = {
    service: "S",
    database: "D",
    cache: "C",
    worker: "W",
    reverse_proxy: "P",
    volume: "V",
    env_var: "E",
    network: "N",
  };
  return glyphs[type];
}
