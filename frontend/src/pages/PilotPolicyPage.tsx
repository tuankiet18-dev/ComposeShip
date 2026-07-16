import { ArrowLeft, Boxes } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const abuseContact = import.meta.env.VITE_ABUSE_CONTACT_EMAIL?.trim();

export function PilotPolicyPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-10 text-foreground sm:py-16">
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Boxes className="h-4 w-4" />
            </span>
            OneClickHost
          </Link>
          <Button variant="outline" size="sm" asChild>
            <Link to="/register"><ArrowLeft className="h-4 w-4" /> Back to registration</Link>
          </Button>
        </div>

        <article className="mt-10 space-y-9 text-sm leading-6 text-muted-foreground">
          <header>
            <h1 className="text-3xl font-semibold text-foreground">Invite-only pilot policies</h1>
            <p className="mt-3">Effective date: set at the first production release.</p>
          </header>

          <PolicySection title="Terms of pilot use">
            <p>Access is invitation-only, personal to the invited account, and may be suspended to protect the service, its users, or infrastructure.</p>
            <p>The pilot is experimental. Preview URLs, availability, supported images, and data retention are not guaranteed. Do not use it for production-critical or highly sensitive workloads.</p>
            <p>You are responsible for the code, repositories, images, configuration, and content you deploy, including having permission to use them.</p>
          </PolicySection>

          <PolicySection title="Acceptable use">
            <ul className="list-disc space-y-2 pl-5">
              <li>Do not deploy malware, phishing, spam, unauthorized scanning, cryptomining, denial-of-service, or evasion tooling.</li>
              <li>Do not attempt to access host systems, cloud metadata, Docker, control-plane services, credentials, or another user's workload.</li>
              <li>Do not bypass resource limits or use the pilot for unlawful content or activity.</li>
            </ul>
          </PolicySection>

          <PolicySection title="Privacy and operational data">
            <p>The service stores account identity, project and repository metadata, encrypted environment-variable values, deployment state, routes, and operational logs needed to run and secure the pilot.</p>
            <p>Do not put secrets in repositories or logs. Project deletion remains visible until the worker confirms cleanup.</p>
          </PolicySection>

          <PolicySection title="Abuse and privacy requests">
            {abuseContact ? (
              <p>Report abuse, a security concern, or a privacy request to <a className="font-medium text-primary hover:underline" href={`mailto:${abuseContact}`}>{abuseContact}</a>. Do not include passwords, tokens, or secret values in email.</p>
            ) : (
              <p>The abuse contact has not been configured. This pilot must not be opened to external users until the operator publishes a monitored contact address.</p>
            )}
          </PolicySection>
        </article>
      </div>
    </main>
  );
}

function PolicySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}
