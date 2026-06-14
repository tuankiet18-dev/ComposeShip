import { FolderGit2, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { EmptyState } from "@/components/app/EmptyState";
import { PageHeader } from "@/components/app/PageHeader";
import { ProjectCard } from "@/components/app/ProjectCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, type ProjectSummary } from "@/lib/api";

export function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("search") || "");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getProjects()
      .then(setProjects)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setQuery(searchParams.get("search") || "");
  }, [searchParams]);

  const filtered = useMemo(
    () =>
      projects.filter((project) => {
        const matchesQuery = project.name.toLowerCase().includes(query.toLowerCase());
        const matchesFilter = filter === "all" || project.status?.toLowerCase() === filter;
        return matchesQuery && matchesFilter;
      }),
    [filter, projects, query],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        description="Pick a project to configure Compose, deploy, open live URLs, or debug runtime events."
        actions={
          <Button asChild>
            <Link to="/projects/new">
              <Plus className="h-4 w-4" /> New project
            </Link>
          </Button>
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <form
          className="relative flex-1"
          onSubmit={(event) => {
            event.preventDefault();
            setSearchParams(query.trim() ? { search: query.trim() } : {});
          }}
        >
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search projects"
            className="h-9 pl-8"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              if (!event.target.value.trim()) setSearchParams({});
            }}
          />
        </form>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="h-9 w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="live">Live</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="queued">Queued</SelectItem>
            <SelectItem value="building">Building</SelectItem>
            <SelectItem value="deploying">Deploying</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="unhealthy">Unhealthy</SelectItem>
            <SelectItem value="stopped">Stopped</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-32 animate-pulse rounded-xl border border-border bg-card" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={FolderGit2}
          title="No projects match"
          description="Try clearing the filter or create your first project."
          action={
            <Button asChild>
              <Link to="/projects/new">
                <Plus className="h-4 w-4" /> New project
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}
