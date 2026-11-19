import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Nav, Footer, Mark } from "@/components/chrome";

export function StatusShell({ eyebrow, title, accent, children, tone = "primary" }: { eyebrow: string; title: string; accent?: string; children: ReactNode; tone?: "primary" | "muted" }) {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <Nav />
      <main className="relative flex flex-1 items-center overflow-hidden px-6 pb-24 pt-36">
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[640px] w-[640px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/10 orbit" />
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/15 orbit-rev" />
        <div className="relative mx-auto w-full max-w-xl text-center">
          <motion.div initial={{ scale: 0, rotate: -120 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 110, damping: 14 }} className="mx-auto w-fit">
            <Mark className={`h-12 w-12 ${tone === "primary" ? "text-primary" : "text-muted-foreground"}`} />
          </motion.div>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="mt-8 font-mono text-[11px] uppercase tracking-[0.3em] text-primary">{eyebrow}</motion.p>
          <motion.h1 initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35, duration: 0.9, ease: [0.22, 1, 0.36, 1] }} className="font-display mt-4 text-5xl md:text-7xl">
            {title}{accent && <><br /><span className="italic text-muted-foreground">{accent}</span></>}
          </motion.h1>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55, duration: 0.9, ease: [0.22, 1, 0.36, 1] }} className="mt-10">{children}</motion.div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
