import { Boxes, Loader2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";

export function RegisterPage() {
  const { register } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [acceptedPilotTerms, setAcceptedPilotTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await register(email, password, fullName, inviteCode, acceptedPilotTerms);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
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
            <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
            <p className="mt-1 text-sm text-muted-foreground">Invitation-only pilot access.</p>
          </div>
          {success ? (
            <div className="space-y-4 text-center">
              <div className="rounded-md bg-green-500/15 p-4 text-sm text-green-600">
                Registration successful. Please proceed to sign in.
              </div>
              <Button asChild className="w-full">
                <Link to="/login">Sign in</Link>
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="inviteCode">Invite code</Label>
                  <Input
                    id="inviteCode"
                    value={inviteCode}
                    onChange={(event) => setInviteCode(event.target.value)}
                    className="mt-1.5 font-mono"
                    autoComplete="off"
                    minLength={20}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="fullName">Full name</Label>
                  <Input id="fullName" value={fullName} onChange={(event) => setFullName(event.target.value)} className="mt-1.5" required />
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1.5" required />
                </div>
                <div>
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    minLength={8}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="mt-1.5"
                    required
                  />
                  <p className="mt-1 text-xs text-muted-foreground">At least 8 characters.</p>
                </div>
                <div className="flex items-start gap-2 pt-1">
                  <Checkbox
                    id="pilot-terms"
                    checked={acceptedPilotTerms}
                    onCheckedChange={(checked) => setAcceptedPilotTerms(checked === true)}
                    aria-required="true"
                  />
                  <Label htmlFor="pilot-terms" className="text-xs font-normal leading-5 text-muted-foreground">
                    I agree to the <Link to="/pilot-policies" className="font-medium text-primary hover:underline">invite-only pilot policies</Link>.
                  </Label>
                </div>
                {error && <p className="text-xs text-[var(--destructive)]">{error}</p>}
              </div>
              <Button type="submit" className="w-full" disabled={loading || !acceptedPilotTerms}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {loading ? "Creating account..." : "Create account"}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link to="/login" className="font-medium text-primary hover:underline">
                  Sign in
                </Link>
              </p>
            </>
          )}
        </form>
      </div>
      <div className="relative hidden flex-col justify-center border-l border-border bg-muted/40 p-10 lg:flex">
        <div className="max-w-lg">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">
            One repo. One click.
            <br />
            <span className="text-muted-foreground">A live service in 90 seconds.</span>
          </h2>
          <ul className="mt-8 space-y-4 text-sm text-muted-foreground">
            <li>- Connect a GitHub repo</li>
            <li>- Inspect your Compose file</li>
            <li>- Configure routes and env vars</li>
            <li>- Deploy and watch the logs</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
