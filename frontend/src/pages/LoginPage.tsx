import { Boxes, Loader2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-2">
      <div className="flex items-center justify-center px-6 py-10">
        <form onSubmit={submit} className="w-full max-w-sm space-y-6">
          <Link to="/" className="inline-flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Boxes className="h-4 w-4" />
            </div>
            <span className="text-base font-semibold tracking-tight">ComposeShip</span>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
            <p className="mt-1 text-sm text-muted-foreground">Sign in to deploy, monitor and ship.</p>
          </div>
          <div className="space-y-3">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-1.5"
                autoComplete="email"
                required
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1.5"
                autoComplete="current-password"
                required
              />
            </div>
            {error && <p className="text-xs text-[var(--destructive)]">{error}</p>}
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? "Signing in..." : "Sign in"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            New to ComposeShip?{" "}
            <Link to="/register" className="font-medium text-primary hover:underline">
              Create an account
            </Link>
          </p>
        </form>
      </div>
      <AuthAside />
    </div>
  );
}

function AuthAside() {
  return (
    <div className="relative hidden flex-col justify-between border-l border-border bg-muted/40 p-10 lg:flex">
      <div>
        <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--success)]" />
          Secure deployments
        </div>
        <h2 className="mt-8 max-w-md text-3xl font-semibold leading-tight tracking-tight">
          Deploy from GitHub.
          <br />
          <span className="text-muted-foreground">Without the deploy anxiety.</span>
        </h2>
        <p className="mt-4 max-w-md text-sm text-muted-foreground">
          Transparent builds, readable logs, encrypted secrets, and one clear button to ship.
        </p>
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <ShieldCheck className="h-4 w-4 text-[var(--success)]" />
          Your secrets stay yours
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Environment variables are encrypted and shown masked until you reveal them.
        </p>
      </div>
    </div>
  );
}
