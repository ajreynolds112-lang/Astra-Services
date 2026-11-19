import type { ReactNode } from "react";
import { Link } from "wouter";
import { Nav, Footer } from "@/components/chrome";

const EFFECTIVE = "October 2, 2026";
const CONTACT = "ajreynolds112@gmail.com";

type Section = { title: string; body: ReactNode };

function LegalPage({ eyebrow, title, intro, sections }: { eyebrow: string; title: string; intro: ReactNode; sections: Section[] }) {
  return (
    <div className="min-h-[100dvh]">
      <Nav />
      <main className="mx-auto max-w-3xl px-6 pb-28 pt-32 md:pt-40">
        <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-primary">{eyebrow}</p>
        <h1 className="font-display mt-4 text-5xl md:text-7xl" data-testid="text-legal-title">{title}</h1>
        <p className="mt-4 text-sm text-muted-foreground">Effective {EFFECTIVE}</p>
        <div className="mt-8 text-base leading-relaxed text-muted-foreground">{intro}</div>
        <nav aria-label="Sections" className="mt-10 rounded-3xl border border-border bg-card p-6">
          <ol className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {sections.map((s, i) => (
              <li key={s.title}>
                <a href={`#s${i + 1}`} className="text-foreground underline-offset-4 hover:underline">
                  <span className="mr-2 font-mono text-xs text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <div className="mt-14 space-y-12">
          {sections.map((s, i) => (
            <section key={s.title} id={`s${i + 1}`} className="scroll-mt-24">
              <h2 className="flex items-baseline gap-3 text-xl font-semibold tracking-tight text-foreground">
                <span className="font-mono text-xs text-primary">{String(i + 1).padStart(2, "0")}</span>
                {s.title}
              </h2>
              <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-muted-foreground [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-foreground">{s.body}</div>
            </section>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
}

const mail = <a href={`mailto:${CONTACT}`} className="text-foreground underline underline-offset-4">{CONTACT}</a>;

export function Terms() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Terms of Service"
      intro={
        <p>
          These Terms of Service ("Terms") govern your use of the ASTRA website and the app design, development, hosting, and app tweak request services we provide ("Services"). "ASTRA", "we", and "us" refer to ASTRA Studio. By purchasing a plan, creating an account, or using the Services, you agree to these Terms. Please also read our <Link href="/privacy" className="text-foreground underline underline-offset-4">Privacy Policy</Link>.
        </p>
      }
      sections={[
        {
          title: "Services",
          body: (
            <>
              <p>ASTRA offers three plans:</p>
              <ul>
                <li><strong>App Design</strong> — design and development of your app.</li>
                <li><strong>Design + Hosting</strong> — App Design plus 8, 12, or 15 months of managed hosting, depending on your chosen schedule, with hosting continuing afterward as described below.</li>
                <li><strong>Managed Hosting</strong> — ongoing managed hosting for your app.</li>
              </ul>
              <p>The specific scope of each project (screens, features, and platforms) is agreed with you before work begins. Work outside that scope may require a tweak request or a separate quote.</p>
            </>
          ),
        },
        {
          title: "Timeline",
          body: (
            <p>Most apps are designed and built in around two weeks from kickoff. This is an estimate, not a guarantee. Timelines depend on project scope and on how quickly you provide the content, feedback, and approvals we need. We'll tell you promptly if we expect your project to take longer.</p>
          ),
        },
        {
          title: "Pricing and payment plans",
          body: (
            <>
              <ul>
                <li><strong>App Design:</strong> $200 per month for 5 months ($1,000 total).</li>
                <li><strong>Design + Hosting:</strong> Choose $250 per month for 8 months ($2,000 total), $175 per month for 12 months ($2,100 total), or $150 per month for 15 months ($2,250 total). After the chosen term, hosting continues automatically at $89 per month until you cancel.</li>
                <li><strong>Managed Hosting:</strong> $99 per month, billed until you cancel.</li>
              </ul>
              <p>Installment plans charge your payment method automatically each month, starting on the day you check out, until the plan is complete. Installment payments are an agreed schedule for the full plan price. Cancelling hosting doesn't cancel, erase, or accelerate the remaining balance: remaining agreed design and bundle payments stay due and continue on the original schedule until paid in full.</p>
              <p>Failed or overdue design payments must be resolved, or your app may be suspended or taken offline. Unpaid invoices and secure payment links are available in the billing panel of your client portal.</p>
              <p>Prices are in U.S. dollars and exclude any applicable taxes. We may change prices for new purchases at any time; changes don't affect a plan you've already started.</p>
            </>
          ),
        },
        {
          title: "Pay-in-full discount",
          body: (
            <p>App Design and the $250 per month, 8-month Design + Hosting schedule offer a 20% pay-in-full discount: $800 and $1,600 respectively. The $175 per month, 12-month and $150 per month, 15-month schedules are monthly-only and do not offer pay-in-full. For a paid-in-full Design + Hosting plan, your card is kept on file with Stripe and hosting begins billing at $89 per month once the prepaid 8 months end, unless you cancel before then.</p>
          ),
        },
        {
          title: "App tweak requests",
          body: (
            <>
              <p>Clients can request changes to their app through the client portal. Requests are $20 each for App Design and Design + Hosting clients. The $250 per month Design + Hosting schedule includes 2 free requests per calendar month; the $175 and $150 schedules each include 1 free request per calendar month. Unused free requests don't roll over. The $99 per month Managed Hosting plan includes no free requests, and each request costs $25. Paid request fees are charged when you submit the request.</p>
              <p>We aim to complete each request in under a day. A request covers one clearly described change. If a request is too large to finish in that time, we'll contact you to split it into multiple requests or quote it separately before doing the work, and we'll refund the fee if you choose not to proceed.</p>
            </>
          ),
        },
        {
          title: "Hosting",
          body: (
            <p>We host your app on third-party cloud infrastructure and take reasonable steps to keep it available, monitored, and backed up. We don't guarantee uninterrupted availability; outages at our infrastructure providers or for maintenance may occur. If hosting ends or a design payment fails or is overdue and isn't resolved, we may suspend your app or take it offline. If your hosting is still active, we may restore it once overdue charges are resolved, but we don't promise instant or automatic infrastructure operations. On request, we'll help you move your app to another host.</p>
          ),
        },
        {
          title: "How we build",
          body: (
            <p>We use a range of professional development tools to build your app, including AI-assisted coding tools such as Claude Code. All work is directed, reviewed, and tested by ASTRA before it's delivered to you, and ASTRA remains responsible for the work under these Terms.</p>
          ),
        },
        {
          title: "Your responsibilities",
          body: (
            <>
              <p>You agree to:</p>
              <ul>
                <li>Provide accurate information and the content, feedback, and approvals your project needs.</li>
                <li>Have the rights to any text, images, logos, or other materials you give us.</li>
                <li>Not use the Services or your app for anything unlawful, infringing, or harmful.</li>
                <li>Keep your account login secure.</li>
              </ul>
            </>
          ),
        },
        {
          title: "Ownership",
          body: (
            <p>Once your plan is paid in full, you own the custom design and code we create specifically for your app. ASTRA keeps ownership of its pre-existing tools, templates, and know-how, and you receive a license to use any of those that are included in your app. Third-party and open-source components remain subject to their own licenses. We may show your app in our portfolio unless you ask us not to.</p>
          ),
        },
        {
          title: "Cancellation and refunds",
          body: (
            <>
              <p>You can cancel hosting yourself in the billing panel of your client portal (or by emailing us). Cancellation takes effect at the end of the paid period, and there is no further hosting renewal after the effective end. Hosting already prepaid is covered through the prepaid term.</p>
              <p>Cancelling hosting does not change your design payments: remaining agreed design and bundle payments are still due and continue on the original schedule until paid in full. We don't collect the balance early, and cancelling doesn't change pricing or discounts.</p>
              <p>Because design and development work begins immediately, payments for work already performed are non-refundable. If you want to stop a design plan before it's finished, contact us and we'll work out a fair arrangement based on the work completed.</p>
            </>
          ),
        },
        {
          title: "Disclaimers and liability",
          body: (
            <>
              <p>We'll perform the Services with reasonable care and skill. Except as stated in these Terms, the Services are provided "as is", without other warranties of any kind, to the extent permitted by law.</p>
              <p>To the extent permitted by law, ASTRA isn't liable for indirect, incidental, or consequential damages, or for lost profits, revenue, or data. Our total liability for any claim relating to the Services is limited to the amount you paid us in the 12 months before the claim.</p>
            </>
          ),
        },
        {
          title: "Changes and contact",
          body: (
            <p>We may update these Terms from time to time. We'll post the new version here with a new effective date, and for material changes we'll notify active clients by email. These Terms are governed by the laws of the United States and the state in which ASTRA is based. Questions? Email {mail}.</p>
          ),
        },
      ]}
    />
  );
}

export function Privacy() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Privacy Policy"
      intro={
        <p>
          This Privacy Policy explains what information ASTRA Studio ("ASTRA", "we", "us") collects when you use our website, client portal, and Services, how we use it, and the choices you have. We don't sell your personal information.
        </p>
      }
      sections={[
        {
          title: "Information we collect",
          body: (
            <ul>
              <li><strong>Contact details</strong> — your name, email, and company when you send an inquiry or start a plan.</li>
              <li><strong>Account information</strong> — your email and name when you create a client portal account.</li>
              <li><strong>Payment information</strong> — handled entirely by Stripe. We receive payment status and the last details Stripe shares (such as plan and amount), but never your full card number.</li>
              <li><strong>Project content</strong> — the details you include in inquiries and app tweak requests, and materials you send us for your app.</li>
              <li><strong>Technical data</strong> — basic logs such as IP address, browser type, and pages requested, used to run and secure the site.</li>
            </ul>
          ),
        },
        {
          title: "How we use it",
          body: (
            <ul>
              <li>To design, build, host, and support your app.</li>
              <li>To process payments, installment plans, and request fees.</li>
              <li>To receive, track, and complete your app tweak requests.</li>
              <li>To reply to inquiries and send service emails such as receipts and request updates.</li>
              <li>To keep the site and our Services secure and working properly.</li>
            </ul>
          ),
        },
        {
          title: "Who we share it with",
          body: (
            <>
              <p>We share information only with service providers that help us run ASTRA, and only as needed for them to do so:</p>
              <ul>
                <li><strong>Stripe</strong> — payments and billing.</li>
                <li><strong>Clerk</strong> — client portal sign-in.</li>
                <li><strong>Resend</strong> — sending email.</li>
                <li><strong>GitHub</strong> — storing app tweak requests alongside your app's code.</li>
                <li><strong>Cloud hosting providers</strong> — running this site and the apps we host.</li>
                <li><strong>Development tools</strong> — AI-assisted coding tools we use to build your app may process your project's code and requirements.</li>
              </ul>
              <p>We may also disclose information if required by law, or to protect our rights, our clients, or the public.</p>
            </>
          ),
        },
        {
          title: "Cookies",
          body: (
            <p>We use cookies that are needed to keep you signed in to the client portal and to keep the site secure. We don't use advertising cookies.</p>
          ),
        },
        {
          title: "How long we keep it",
          body: (
            <p>We keep your information for as long as you're a client and for a reasonable period afterward to meet legal, tax, and accounting requirements, then delete it or anonymize it.</p>
          ),
        },
        {
          title: "Your choices and rights",
          body: (
            <p>You can ask us to access, correct, or delete your personal information, or to stop sending you non-essential emails, by emailing {mail}. Depending on where you live, such as California, you may have additional rights under local law, and we'll honor them. We won't treat you differently for exercising them.</p>
          ),
        },
        {
          title: "Security",
          body: (
            <p>We use reasonable safeguards, including encrypted connections and trusted providers, to protect your information. No system is perfectly secure, so we can't guarantee absolute security.</p>
          ),
        },
        {
          title: "Children",
          body: <p>Our Services are meant for businesses and adults. We don't knowingly collect information from children under 13.</p>,
        },
        {
          title: "Changes and contact",
          body: (
            <p>We may update this policy from time to time and will post the new version here with a new effective date. Questions or requests? Email {mail}.</p>
          ),
        },
      ]}
    />
  );
}
