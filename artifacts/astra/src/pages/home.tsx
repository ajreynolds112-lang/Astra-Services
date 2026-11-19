import { motion, useScroll, useTransform } from "framer-motion";
import { useEffect, useRef } from "react";
import { ArrowDown, ArrowRight } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Nav, Footer } from "@/components/chrome";
import { Reveal } from "@/components/reveal";
import { BuildGuide } from "@/components/build-guide";
import { Plans } from "@/components/plans";
import { Contact } from "@/components/contact";
import heroImg from "@/assets/hero-phone.jpg";

const ease = [0.22, 1, 0.36, 1] as const;

function Hero() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const scale = useTransform(scrollYProgress, [0, 1], [1, 1.12]);
  const y = useTransform(scrollYProgress, [0, 1], [0, 80]);
  const words = ["Beautiful", "apps,", "paid", "for", "gently."];
  return (
    <section ref={ref} className="relative overflow-hidden pt-36 md:pt-44">
      <div className="mx-auto max-w-6xl px-6 text-center">
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1 }} className="font-mono text-[11px] uppercase tracking-[0.3em] text-primary">App design, development &amp; hosting studio</motion.p>
        <h1 className="font-display mx-auto mt-6 max-w-5xl text-[15vw] leading-[0.92] md:text-[9rem]">
          {words.map((w, i) => (
            <motion.span key={i} initial={{ opacity: 0, y: 40, filter: "blur(8px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ duration: 1.1, delay: 0.15 + i * 0.09, ease }} className={`mr-[0.22em] inline-block ${i === 4 ? "italic text-primary" : ""}`}>{w}</motion.span>
          ))}
        </h1>
        <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, delay: 0.75, ease }} className="mx-auto mt-8 max-w-xl text-lg text-muted-foreground md:text-xl">
          ASTRA designs, builds, and hosts your app in around two weeks, then lets you pay in calm monthly installments instead of one daunting invoice.
        </motion.p>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, delay: 0.9, ease }} className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a href="#plans" className="inline-flex items-center gap-2 rounded-full bg-primary px-7 py-3.5 text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.03]" data-testid="link-hero-plans">See payment plans <ArrowRight className="h-4 w-4" /></a>
          <a href="#contact" className="inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary" data-testid="link-hero-contact">Talk about a project</a>
        </motion.div>
        <a href="#build" className="mt-6 inline-flex items-center gap-2 py-2 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground" data-testid="link-hero-build">Explore our development process <ArrowDown className="h-3.5 w-3.5" /></a>
      </div>
      <motion.div initial={{ opacity: 0, y: 60 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.4, delay: 0.6, ease }} className="mx-auto mt-20 max-w-6xl px-4 md:px-6">
        <div className="overflow-hidden rounded-[36px] ultra">
          <motion.img style={{ scale, y }} src={heroImg} alt="A phone floating on ultramarine" className="aspect-[16/10] w-full object-cover md:aspect-[16/8]" />
        </div>
      </motion.div>
    </section>
  );
}

function Statement() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-32 md:py-48">
      <Reveal>
        <p className="font-display text-4xl leading-[1.15] md:text-6xl">
          Great software shouldn't require a war chest. <span className="text-muted-foreground">Your app is built in around two weeks, and the cost is spread over calm monthly payments, so your runway stays yours.</span>
        </p>
      </Reveal>
      <div className="mt-20 grid grid-cols-2 gap-y-12 border-t border-border pt-12 md:grid-cols-4">
        {[["~2", "weeks to build your app"], ["$20–$25", "per app tweak request, depending on your plan"], ["<24h", "turnaround on every request"], ["20%", "off when you pay in full upfront"]].map(([n, l], i) => (
          <Reveal key={l} delay={i * 0.08}>
            <p className="text-4xl font-semibold tracking-tight md:text-5xl">{n}</p>
            <p className="mt-2 max-w-[12rem] text-sm text-muted-foreground">{l}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function How() {
  const steps = [
    ["01", "Talk", "Share the idea. We scope it honestly and recommend a plan sized to your stage."],
    ["02", "Choose a pace", "Pick a monthly plan. The first installment starts the work; nothing else is due today."],
    ["03", "We build", "Your app designed and built in around two weeks, with check-ins along the way."],
    ["04", "We host", "Launch on infrastructure we run and watch, for one predictable monthly fee."],
  ];
  return (
    <section id="how" className="scroll-mt-20 bg-secondary/60">
      <div className="mx-auto max-w-6xl px-6 py-28 md:py-40">
        <Reveal className="max-w-2xl">
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-primary">How it works</p>
          <h2 className="font-display mt-4 text-5xl md:text-7xl">Four steps.<br /><span className="italic text-muted-foreground">Zero surprises.</span></h2>
        </Reveal>
        <div className="relative mt-20">
          <motion.div initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }} transition={{ duration: 1.6, ease }} className="absolute left-0 right-0 top-[7px] hidden h-px origin-left bg-primary/40 md:block" />
          <div className="grid gap-12 md:grid-cols-4 md:gap-8">
            {steps.map(([n, t, d], i) => (
              <Reveal key={n} delay={0.2 + i * 0.12}>
                <div className="relative h-[15px] w-[15px] rounded-full border-[3px] border-secondary bg-primary" />
                <p className="mt-6 font-mono text-xs text-primary">{n}</p>
                <h3 className="mt-2 text-xl font-semibold tracking-tight">{t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{d}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Services() {
  return (
    <section id="services" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-28 md:py-40">
      <Reveal className="max-w-2xl">
        <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-primary">Services</p>
        <h2 className="font-display mt-4 text-5xl md:text-7xl">Designed here.<br /><span className="italic text-muted-foreground">Kept running here.</span></h2>
      </Reveal>
      <div className="mt-16 grid gap-6 md:grid-cols-5">
        <Reveal className="md:col-span-3">
          <div className="relative h-full overflow-hidden rounded-[32px] ultra p-10 md:p-14">
            <div className="pointer-events-none absolute -right-20 -bottom-20 h-80 w-80 rounded-full border border-white/20 orbit" />
            <div className="pointer-events-none absolute -right-4 -bottom-4 h-48 w-48 rounded-full border border-white/10 orbit-rev" />
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/70">Design &amp; development</p>
            <h3 className="font-display mt-6 max-w-md text-4xl md:text-5xl">From a sentence to a product people trust.</h3>
            <ul className="mt-10 grid max-w-md grid-cols-2 gap-3 text-sm text-white/85">
              {["Product strategy", "UX flows", "Interface design", "Interactive prototypes", "Full-stack development", "Testing & launch"].map((x) => <li key={x}>— {x}</li>)}
            </ul>
          </div>
        </Reveal>
        <Reveal delay={0.1} className="md:col-span-2">
          <div className="flex h-full flex-col justify-between rounded-[32px] border border-border bg-card p-10">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Hosting</p>
              <h3 className="font-display mt-6 text-4xl">Launched, monitored, backed up.</h3>
              <p className="mt-4 text-sm text-muted-foreground">Managed hosting with uptime watching, SSL, daily backups, and a human who answers.</p>
            </div>
            <div className="mt-10 flex items-center gap-3 rounded-2xl bg-secondary px-4 py-3 text-sm">
              <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" /></span>
              All systems operational
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Faq() {
  const qs = [
    ["How do installment plans work?", "You choose a plan and pay the first installment at checkout. The remaining payments are charged automatically on the same schedule until the plan is complete. No interest, no lump sum."],
    ["How long does it take to build my app?", "Around two weeks from kickoff for most apps. We'll confirm the timeline once we've scoped your project."],
    ["What kinds of apps can you build?", "Responsive web apps, mobile apps for platforms we agree on, client portals and internal tools, with sign-in, permissions, a database, and payment or API connections where scoped. We confirm what is included before work begins."],
    ["Do you use AI to write code?", "Yes. We use AI-assisted tools including Claude Code, and ASTRA directs, reviews, and tests everything before delivery. ASTRA remains responsible for the work."],
    ["Can you work on an app I already started?", "Often, yes. Share your repository links during intake and we review the existing code before agreeing what to change."],
    ["What do you need from me?", "Your goals, content and brand assets, access to needed services through secure channels, and timely feedback. Delays on these can move the timeline."],
    ["Will my app be in the app stores?", "Only if agreed in scope. Store publishing and third-party services are confirmed up front, and store approval is the store's decision, so it can't be guaranteed."],
    ["Do I own the code?", "Once your plan is paid in full, you own the custom design and code created for your app. Third-party and open-source components keep their own licenses."],
    ["Which Design + Hosting schedules can I choose?", "$250/month for 8 months ($2,000 total) includes 2 free app tweak requests each month. $175/month for 12 months ($2,100 total) and $150/month for 15 months ($2,250 total) each include 1 free app tweak request each month. All include hosting for the chosen term."],
    ["Can I pay in full instead?", "App Design and the $250/month Design + Hosting schedule offer 20% off upfront: $800 and $1,600 respectively. The $175/month and $150/month schedules are monthly-only and do not offer pay-in-full."],
    ["What happens after my Design + Hosting term?", "After your chosen 8, 12, or 15 months, hosting continues at $89 a month. There's nothing to set up, and you can cancel anytime."],
    ["How do app tweak requests work?", "Send a request from your client portal and it's done in under a day. Requests are $20 each for App Design and Design + Hosting. The $250 Design + Hosting schedule includes 2 free requests every month; the $175 and $150 schedules each include 1. The $99 Managed Hosting plan has no free requests; requests are $25 each."],
    ["What does 'ongoing' mean for hosting?", "Managed Hosting is $99 a month, billed until you cancel. There's no contract term — cancel whenever, and we'll help you migrate cleanly."],
    ["Is my payment information safe?", "Checkout runs entirely on Stripe. ASTRA never sees or stores your card details."],
    ["What if my project doesn't fit a plan?", "Most don't, exactly. Send an inquiry and we'll propose a custom schedule that matches your scope and runway."],
    ["Do you work with clients outside my state?", "Yes. ASTRA is fully remote and works with founders and small businesses across the United States."],
  ];
  return (
    <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-6 pb-28 md:pb-40">
      <Reveal className="text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-primary">Questions</p>
        <h2 className="font-display mt-4 text-5xl md:text-6xl">Asked often.</h2>
      </Reveal>
      <Reveal delay={0.1}>
        <Accordion type="single" collapsible className="mt-12">
          {qs.map(([q, a], i) => (
            <AccordionItem key={i} value={`q${i}`} className="border-border">
              <AccordionTrigger className="py-6 text-left text-lg font-medium hover:no-underline" data-testid={`button-faq-${i}`}>{q}</AccordionTrigger>
              <AccordionContent className="pb-6 text-base leading-relaxed text-muted-foreground">{a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </Reveal>
    </section>
  );
}

export default function Home() {
  // Clerk can mount this page after the browser's initial anchor lookup.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (window.location.hash) {
        document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ behavior: "instant" });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="min-h-[100dvh]">
      <Nav />
      <main>
        <Hero />
        <div className="flex justify-center pt-12"><ArrowDown className="h-4 w-4 animate-bounce text-muted-foreground" /></div>
        <Statement />
        <How />
        <Services />
        <BuildGuide />
        <Plans />
        <Faq />
        <Contact />
      </main>
      <Footer />
    </div>
  );
}
