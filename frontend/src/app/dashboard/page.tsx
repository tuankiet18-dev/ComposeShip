"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Project {
  id: string;
  name: string;
  description: string | null;
  serviceCount: number;
  createdAt: string;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    api
      .getProjects()
      .then(setProjects)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-8">
      {/* ── Welcome ────────────────────────── */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Welcome back, {user?.fullName?.split(" ")[0] || "there"} 👋
        </h1>
        <p className="text-muted-foreground mt-1">
          Here&apos;s an overview of your deployments
        </p>
      </div>

      {/* ── Deployment Guide ──────────────── */}
      <Card className="border-violet-500/30 bg-violet-500/5 overflow-hidden">
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-lg text-violet-300">🚀 Deployment Quick Start Guide</CardTitle>
            <CardDescription className="text-gray-400">Learn how to connect services and use Network Aliases for mono-repos.</CardDescription>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setShowGuide(!showGuide)}
            className="text-violet-400 hover:text-violet-300 hover:bg-violet-500/10"
          >
            {showGuide ? "Hide Details" : "Show Details"}
          </Button>
        </CardHeader>
        {showGuide && (
          <CardContent className="space-y-6 text-sm text-gray-300 animate-in slide-in-from-top-2 duration-300">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center text-violet-400 font-bold">1</div>
                <h3 className="font-semibold text-white">Deploy Backend</h3>
                <p>When adding a Backend service, fill in the <code className="text-violet-400">Network Aliases</code> field (e.g. <code>api-server</code>). This creates a private hostname.</p>
              </div>
              <div className="space-y-2">
                <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center text-violet-400 font-bold">2</div>
                <h3 className="font-semibold text-white">Update Frontend Config</h3>
                <p>In your Frontend code (Nginx/Next.js), point your proxy to <code>http://api-server:8080</code>. Use the alias you defined in step 1.</p>
              </div>
              <div className="space-y-2">
                <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center text-violet-400 font-bold">3</div>
                <h3 className="font-semibold text-white">Deploy Frontend</h3>
                <p>Add your Frontend service (leave Network Aliases blank). It will now communicate with the Backend internally!</p>
              </div>
            </div>
            
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-md text-amber-200">
              <p><strong>💡 Pro Tip:</strong> If your project is a mono-repo, use the <code className="text-amber-400">Subfolder</code> field to specify the path to each service (e.g., <code>apps/backend</code>).</p>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ── Quick Stats ────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardDescription>Total Projects</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {loading ? "—" : projects.length}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardDescription>Total Services</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {loading
                ? "—"
                : projects.reduce((sum, p) => sum + p.serviceCount, 0)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardDescription>Status</CardDescription>
          </CardHeader>
          <CardContent>
            <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20">
              All systems normal
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* ── Recent Projects ────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Recent Projects</h2>
          <Link href="/dashboard/projects">
            <Button variant="outline" size="sm">
              View All
            </Button>
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="border-border/50 animate-pulse">
                <CardHeader>
                  <div className="h-5 bg-muted rounded w-2/3" />
                  <div className="h-4 bg-muted rounded w-1/2 mt-2" />
                </CardHeader>
              </Card>
            ))}
          </div>
        ) : projects.length === 0 ? (
          <Card className="border-border/50 border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-violet-500/10 flex items-center justify-center text-3xl">
                🚀
              </div>
              <div className="text-center">
                <p className="font-medium">No projects yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Create your first project to start deploying
                </p>
              </div>
              <Link href="/dashboard/projects">
                <Button className="bg-gradient-to-r from-violet-600 to-indigo-600">
                  Create Project
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.slice(0, 6).map((project) => (
              <Link
                key={project.id}
                href={`/dashboard/projects/${project.id}`}
              >
                <Card className="border-border/50 hover:border-violet-500/30 transition-colors cursor-pointer group">
                  <CardHeader>
                    <CardTitle className="text-lg group-hover:text-violet-400 transition-colors">
                      {project.name}
                    </CardTitle>
                    <CardDescription>
                      {project.description || "No description"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>{project.serviceCount} service(s)</span>
                      <span>
                        {new Date(project.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
