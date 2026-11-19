import { Link } from "wouter";
import { useEffect, useState } from "react";
import { useGetStudio } from "@workspace/api-client-react";
import { Show } from "@clerk/react";

export function Mark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d="M12 1.5 14.2 9.8 22.5 12 14.2 14.2 12 22.5 9.8 14.2 1.5 12 9.8 9.8Z" fill="currentColor" />
    </svg>
  );
}

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ${scrolled ? "bg-background/75 backdrop-blur-xl border-b border-border/60" : "bg-transparent"}`}>
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2 text-foreground" data-testid="link-home">
          <Mark className="h-4 w-4 text-primary" />
          <span className="text-[13px] font-semibold tracking-[0.32em]">ASTRA</span>
        </Link>
        <nav className="hidden items-center gap-8 text-[13px] text-muted-foreground md:flex">
          <a href="/#how" className="transition-colors hover:text-foreground" data-testid="link-how">How it works</a>
          <a href="/#services" className="transition-colors hover:text-foreground" data-testid="link-services">Services</a>
          <a href="/#build" className="transition-colors hover:text-foreground" data-testid="link-build">Development</a>
          <a href="/#plans" className="transition-colors hover:text-foreground" data-testid="link-plans">Plans</a>
          <a href="/#faq" className="transition-colors hover:text-foreground" data-testid="link-faq">Questions</a>
        </nav>
        <div className="flex items-center gap-4">
        <Show when="signed-out">
          <Link href="/sign-in" className="text-[13px] text-muted-foreground transition-colors hover:text-foreground" data-testid="link-sign-in">Login</Link>
        </Show>
        <Show when="signed-in">
          <Link href="/portal" className="text-[13px] text-muted-foreground transition-colors hover:text-foreground" data-testid="link-portal">Portal</Link>
        </Show>
        <a href="/#contact" className="rounded-full bg-foreground px-4 py-1.5 text-[13px] font-medium text-background transition-transform hover:scale-[1.03]" data-testid="link-contact-nav">
          Start a project
        </a>
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  const { data: studio } = useGetStudio();
  const email = studio?.email ?? "ajreynolds112@gmail.com";
  return (
    <footer className="border-t border-border/70">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-14 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2"><Mark className="h-4 w-4 text-primary" /><span className="text-[13px] font-semibold tracking-[0.32em]">{(studio?.name ?? "ASTRA").toUpperCase()}</span></div>
          <p className="mt-4 max-w-xs text-sm text-muted-foreground">App design and hosting, paid over time. An independent studio working with founders across the {studio?.location ?? "United States"}.</p>
        </div>
        <div className="text-sm">
          <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Write</p>
          <a href={`mailto:${email}`} className="text-foreground underline-offset-4 hover:underline" data-testid="link-footer-email">{email}</a>
          <a href="/#build" className="mt-3 block text-muted-foreground underline-offset-4 hover:underline" data-testid="link-footer-build">How we build apps</a>
        </div>
        <div className="text-sm">
          <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Based</p>
          <p data-testid="text-footer-location">{studio?.location ?? "United States"}</p>
        </div>
      </div>
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 pb-10 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>© {new Date().getFullYear()} ASTRA Studio. Payments processed securely by Stripe.</span>
        <span className="flex gap-5">
          <Link href="/terms" className="hover:text-foreground" data-testid="link-footer-terms">Terms of Service</Link>
          <Link href="/privacy" className="hover:text-foreground" data-testid="link-footer-privacy">Privacy Policy</Link>
        </span>
      </div>
    </footer>
  );
}
