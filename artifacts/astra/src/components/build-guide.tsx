import { ArrowRight } from "lucide-react";
import { Reveal } from "@/components/reveal";

const capabilities = [
  ["Responsive web apps", "Browser-based products that work on phones, tablets, and desktops, built with React and TypeScript."],
  ["Mobile apps", "Apps for the platforms we agree on during scoping, commonly built with Expo where a mobile app is the right fit."],
  ["Portals and internal tools", "Client portals, dashboards, and back-office tools that replace spreadsheets and scattered email threads."],
  ["Sign-in and permissions", "Secure accounts with roles, so each person sees only what they should."],
  ["Data-backed workflows", "A backend and database behind your screens, so records, forms, and statuses are stored and kept consistent."],
  ["Payments, APIs, and automation", "Connections to outside services such as payment providers, where they are part of the agreed scope."],
];

const phases = [
  ["01", "Discovery", "We learn who the app is for, what they need to do, and which features matter first. If you already have code, share your repository links and we review what exists before proposing changes."],
  ["02", "Scope and timeline", "We write down the features, platforms, and outside services involved, and agree a timeline. Most scoped apps take around two weeks. That is an estimate, not a guarantee."],
  ["03", "Design and feedback", "We map the steps your users take and design the screens around them. You review the layout, wording, and behavior before implementation, so we can resolve questions before building the agreed features."],
  ["04", "Build", "We turn the approved screens into an interactive frontend, then build the backend and database needed to save and retrieve real information. We connect the services in scope and handle loading, validation, and errors. The result is working software, not just a set of mockups."],
  ["05", "Testing and review", "We test the agreed user journeys, including forms, saved data, sign-in, and payments where included. We check layouts on the target screen sizes, error cases, and access permissions. You review a working version and give feedback on adjustments within the agreed scope."],
  ["06", "Launch and support", "We prepare the agreed launch, provide the agreed source code and documentation, and explain how to use and manage the app. Managed hosting is available under a hosting plan; later changes are handled through app tweak requests or a separately agreed scope."],
];

export function BuildGuide() {
  return (
    <section id="build" className="scroll-mt-20">
      <div className="mx-auto max-w-6xl px-6 py-28 md:py-40">
        <Reveal className="max-w-3xl">
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-primary">App development</p>
          <h2 className="font-display mt-4 text-5xl md:text-7xl">What we build,<br /><span className="italic text-muted-foreground">and how it gets built.</span></h2>
          <p className="mt-8 text-lg text-muted-foreground">Everything below is scoped with you first. What a given app includes is written down before work begins, so you always know what you are getting.</p>
        </Reveal>

        <div className="mt-16 grid gap-px overflow-hidden rounded-[28px] border border-border bg-border md:grid-cols-3">
          {capabilities.map(([t, d], i) => (
            <Reveal key={t} delay={i * 0.05} className="bg-card p-8">
              <h3 className="text-lg font-semibold tracking-tight">{t}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{d}</p>
            </Reveal>
          ))}
        </div>
        <p className="mt-5 max-w-2xl text-sm text-muted-foreground">Publishing to an app store, native device features, and third-party services are confirmed during scoping. They are not automatically included, and store approval is decided by the store, not by us.</p>
      </div>

      <div className="bg-secondary/60">
        <div className="mx-auto max-w-6xl px-6 py-24 md:py-32">
          <Reveal className="max-w-2xl">
            <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-primary">The process in detail</p>
            <h2 className="font-display mt-4 text-4xl md:text-6xl">Six phases, in plain language.</h2>
          </Reveal>
          <ol className="mt-14 grid gap-x-12 gap-y-10 md:grid-cols-2">
            {phases.map(([n, t, d], i) => (
              <li key={n}>
                <Reveal delay={(i % 2) * 0.08} className="flex gap-5 border-t border-border pt-6">
                  <span className="font-mono text-xs text-primary">{n}</span>
                  <div>
                    <h3 className="text-xl font-semibold tracking-tight">{t}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{d}</p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ol>

          <div className="mt-20 grid gap-6 md:grid-cols-2">
            <Reveal>
              <div className="h-full rounded-[28px] border border-border bg-card p-8 md:p-10">
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">You provide</p>
                <ul className="mt-5 space-y-3 text-sm text-foreground/85">
                  <li>— Your goals and who the app is for</li>
                  <li>— Content and brand assets you have the rights to use</li>
                  <li>— Access to any services the app needs, shared through secure channels</li>
                  <li>— Timely feedback and approvals, which keep the schedule moving</li>
                </ul>
              </div>
            </Reveal>
            <Reveal delay={0.1}>
              <div className="h-full rounded-[28px] ultra p-8 md:p-10">
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/70">You receive</p>
                <ul className="mt-5 space-y-3 text-sm text-white/90">
                  <li>— A working app covering the agreed scope</li>
                  <li>— Agreed source code and documentation</li>
                  <li>— Launch guidance for going live</li>
                  <li>— Ownership of custom design and code once your plan is paid in full, subject to third-party licenses</li>
                </ul>
              </div>
            </Reveal>
          </div>

          <Reveal className="mt-20 max-w-3xl">
            <h3 className="font-display text-3xl md:text-4xl">How AI fits in</h3>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">We use AI-assisted tools, including Claude Code, alongside other development tools to move faster. They do not replace judgment: ASTRA directs the work, reviews the code, tests the result, and stays responsible for what we deliver.</p>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">Typical stack: React and TypeScript on the frontend, an API and database on the backend, and Expo for mobile apps where appropriate. We confirm the right fit for your project during scoping.</p>
            <a href="#contact" className="mt-8 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.03]" data-testid="link-build-contact">Scope your app <ArrowRight className="h-4 w-4" /></a>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
