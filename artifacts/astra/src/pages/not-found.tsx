import { Link } from "wouter";
import { StatusShell } from "@/components/status-shell";

export default function NotFound() {
  return (
    <StatusShell eyebrow="404" title="Lost in orbit." accent="This page doesn't exist." tone="muted">
      <Link href="/" className="inline-block rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background" data-testid="link-404-home">Return home</Link>
    </StatusShell>
  );
}
