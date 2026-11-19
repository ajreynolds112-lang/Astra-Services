import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Loader2, Mail, MapPin } from "lucide-react";
import { useCreateInquiry, useGetStudio, type InquiryInputService } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Reveal } from "@/components/reveal";
import { Mark } from "@/components/chrome";
import { apiErrorMessage } from "@/lib/format";

const services: { v: InquiryInputService; l: string }[] = [
  { v: "design", l: "Design" }, { v: "hosting", l: "Hosting" }, { v: "bundle", l: "Both" }, { v: "other", l: "Not sure" },
];

export function Contact() {
  const { data: studio } = useGetStudio();
  const inquiry = useCreateInquiry();
  const [form, setForm] = useState({ name: "", email: "", company: "", message: "" });
  const [service, setService] = useState<InquiryInputService>("design");
  const [error, setError] = useState<string | null>(null);
  const [sentName, setSentName] = useState<string | null>(null);
  const email = studio?.email ?? "ajreynolds112@gmail.com";

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.name.trim() || !/^\S+@\S+\.\S+$/.test(form.email) || !form.message.trim()) { setError("Name, a valid email, and a few words about the project, please."); return; }
    inquiry.mutate(
      { data: { name: form.name.trim(), email: form.email.trim(), company: form.company.trim() || undefined, service, message: form.message.trim() } },
      { onSuccess: (r) => setSentName(r.name.split(" ")[0]), onError: (err) => setError(apiErrorMessage(err, "That didn't send. Try again, or email us directly.")) },
    );
  };

  const chip = (on: boolean) => `rounded-full border px-4 py-2 text-sm transition-all ${on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:border-foreground/40"}`;

  return (
    <section id="contact" className="scroll-mt-20 bg-foreground text-background">
      <div className="mx-auto grid max-w-6xl gap-16 px-6 py-28 md:grid-cols-[0.9fr_1.1fr] md:py-36">
        <Reveal>
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-accent">Contact</p>
          <h2 className="font-display mt-4 text-5xl md:text-7xl">Tell us the idea.<br /><span className="italic text-background/50">We'll tell you the plan.</span></h2>
          <p className="mt-6 max-w-sm text-background/65">A real reply from the person who'll design it, usually within one business day. No sales call required.</p>
          <div className="mt-10 space-y-4 text-sm">
            <a href={`mailto:${email}`} className="flex items-center gap-3 text-background/90 hover:text-accent" data-testid="link-contact-email"><Mail className="h-4 w-4" />{email}</a>
            <p className="flex items-center gap-3 text-background/60" data-testid="text-contact-location"><MapPin className="h-4 w-4" />Serving clients across the {studio?.location ?? "United States"}</p>
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          {sentName ? (
            <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} className="flex h-full min-h-[460px] flex-col items-center justify-center rounded-[32px] bg-background p-10 text-center text-foreground" data-testid="status-inquiry-sent">
              <motion.div initial={{ rotate: -90, scale: 0 }} animate={{ rotate: 0, scale: 1 }} transition={{ delay: 0.2, type: "spring", stiffness: 120 }}><Mark className="h-14 w-14 text-primary" /></motion.div>
              <h3 className="font-display mt-8 text-4xl">Thank you, {sentName}.</h3>
              <p className="mt-3 max-w-xs text-muted-foreground">Your note is with us. Expect a reply at {form.email} within a business day.</p>
              <button onClick={() => { setSentName(null); setForm({ name: "", email: "", company: "", message: "" }); }} className="mt-8 text-sm text-primary underline-offset-4 hover:underline" data-testid="button-inquiry-another">Send another</button>
            </motion.div>
          ) : (
            <form onSubmit={submit} className="space-y-6 rounded-[32px] bg-background p-8 text-foreground md:p-10">
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-1.5"><Label htmlFor="in-name">Name</Label><Input id="in-name" value={form.name} onChange={set("name")} className="h-11 rounded-xl" data-testid="input-inquiry-name" /></div>
                <div className="space-y-1.5"><Label htmlFor="in-email">Email</Label><Input id="in-email" type="email" value={form.email} onChange={set("email")} className="h-11 rounded-xl" data-testid="input-inquiry-email" /></div>
              </div>
              <div className="space-y-1.5"><Label htmlFor="in-co">Company <span className="text-muted-foreground">(optional)</span></Label><Input id="in-co" value={form.company} onChange={set("company")} className="h-11 rounded-xl" data-testid="input-inquiry-company" /></div>
              <div className="space-y-2"><Label>What do you need?</Label><div className="flex flex-wrap gap-2">{services.map((s) => <button type="button" key={s.v} onClick={() => setService(s.v)} className={chip(service === s.v)} data-testid={`button-service-${s.v}`}>{s.l}</button>)}</div></div>
              <div className="space-y-1.5"><Label htmlFor="in-msg">The project</Label><Textarea id="in-msg" value={form.message} onChange={set("message")} rows={5} placeholder="What are you building, who is it for, and when do you hope to launch?" className="rounded-xl" data-testid="input-inquiry-message" /></div>
              {error && <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="text-inquiry-error">{error}</p>}
              <button type="submit" disabled={inquiry.isPending} className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.01] disabled:opacity-60" data-testid="button-inquiry-submit">
                {inquiry.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending</> : <>Send inquiry <ArrowRight className="h-4 w-4" /></>}
              </button>
            </form>
          )}
        </Reveal>
      </div>
    </section>
  );
}
