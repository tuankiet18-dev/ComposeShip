import { ArrowRight, Boxes, CheckCircle2, GitBranch, Rocket, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function HomePage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Boxes className="h-4 w-4" />
            </div>
            <span className="text-base font-semibold tracking-tight">OneClickHost</span>
          </Link>
          <nav className="flex items-center gap-2">
            <Button variant="ghost" asChild>
              <Link to="/login">Sign in</Link>
            </Button>
            <Button asChild>
              <Link to="/register">Get started</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-10 px-6 py-12 lg:grid-cols-[1fr_520px] lg:items-center lg:py-20">
        <section className="max-w-2xl space-y-8">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--success)]" />
            Build workers online
          </div>
          <div>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
              Deploy from GitHub without the deploy anxiety.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground">
              OneClickHost detects your stack, builds containers, handles Compose projects,
              stores secrets securely, and gives every deployment a calm operational dashboard.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button size="lg" asChild>
              <Link to="/register">
                Start deploying <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link to="/login">Open dashboard</Link>
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ["Stack detection", GitBranch],
              ["One-click deploy", Rocket],
              ["Encrypted secrets", ShieldCheck],
            ].map(([label, Icon]) => (
              <div key={String(label)} className="rounded-xl border border-border bg-card p-4">
                <Icon className="h-4 w-4 text-primary" />
                <p className="mt-3 text-sm font-medium">{String(label)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">deploy-zen-stack</p>
                <p className="text-xs text-muted-foreground">frontend, api, postgres, worker</p>
              </div>
              <span className="rounded-full bg-[color-mix(in_oklab,var(--success)_12%,transparent)] px-2 py-0.5 text-xs font-medium text-[var(--success)]">
                Live
              </span>
            </div>
            <div className="mt-6 space-y-3">
              {["Cloned repository", "Generated production Dockerfile", "Provisioned routes", "Deployed containers"].map(
                (step) => (
                  <div key={step} className="flex items-center gap-3 rounded-md bg-card px-3 py-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-[var(--success)]" />
                    {step}
                  </div>
                ),
              )}
            </div>
          </div>
        </section>
      </main>
      <footer className="mx-auto flex max-w-7xl justify-end px-6 pb-8 text-xs text-muted-foreground">
        <Link to="/pilot-policies" className="hover:text-foreground hover:underline">Pilot policies</Link>
      </footer>
    </div>
  );
}
