import { Loader2, LogOut, Moon, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";

export function SettingsPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [dark, setDark] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    const next = localStorage.getItem("och-theme") === "dark";
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
  }, []);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      navigate("/login");
    } finally {
      setLoggingOut(false);
    }
  };

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("och-theme", next ? "dark" : "light");
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Your account and app preferences." />

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-sm font-semibold text-primary">
              {(user?.fullName || user?.email || "U").slice(0, 2).toUpperCase()}
            </div>
            <div>
              <p className="font-medium">{user?.fullName}</p>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Display name</Label>
              <p className="mt-1.5 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">{user?.fullName}</p>
            </div>
            <div>
              <Label>Email</Label>
              <p className="mt-1.5 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">{user?.email}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preferences</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Theme</p>
            <CardDescription>Switch between light and dark.</CardDescription>
          </div>
          <Button variant="outline" onClick={toggleTheme}>
            <Moon className="h-4 w-4" /> {dark ? "Light mode" : "Dark mode"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-start gap-3 p-5">
          <ShieldCheck className="mt-0.5 h-4 w-4 text-[var(--success)]" />
          <div>
            <p className="font-medium">Security</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Secrets and environment variables are stored encrypted at rest and shown masked in the UI.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Session</CardTitle>
          <CardDescription>Log out of this device.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={handleLogout} disabled={loggingOut}>
            {loggingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
            Log out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
