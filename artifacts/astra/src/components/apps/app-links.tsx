import { ArrowUpRight, Smartphone } from "lucide-react";
import type { ClientApp } from "@workspace/api-client-react";
import { expoGoLink } from "@/lib/expo-go";

function LinkRow({ label, help, href, id }: { label: string; help: string; href: string | null; id: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-4">
      <div>
        <p className="text-[15px] font-medium text-foreground">{label}</p>
        <p className="text-sm text-muted-foreground">{href ? help : "Setup pending. Not configured yet."}</p>
      </div>
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background" data-testid={`link-${id}`}>
          Open <ArrowUpRight className="h-4 w-4" />
        </a>
      ) : (
        <span className="shrink-0 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground" data-testid={`status-${id}-pending`}>Pending</span>
      )}
    </div>
  );
}

export function AppLinks({ app }: { app: ClientApp }) {
  const nativeLink = expoGoLink(app.previewUrl);
  return (
    <div className="divide-y divide-border">
      <div className="py-5" data-testid="expo-go-preview">
        <p className="text-[15px] font-medium text-foreground">Your app in Expo Go</p>
        <p className="mt-1 text-sm text-muted-foreground">Try the native app on your iPhone or Android—not a web preview.</p>
        {nativeLink ? (
          <>
            <a href={nativeLink} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background" data-testid="link-expo-go">
              <Smartphone className="h-4 w-4" aria-hidden="true" /> Open in Expo Go
            </a>
          </>
        ) : (
          <p className="mt-4 rounded-xl bg-muted p-3 text-sm text-muted-foreground" data-testid="status-expo-go-pending">
            Your Expo Go link is not ready yet. The studio will add it here when your native preview is connected.
          </p>
        )}
        <h3 className="mt-5 text-sm font-medium text-foreground">How to see {app.name} on your phone</h3>
        <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-muted-foreground" data-testid="phone-setup-steps">
          <li>Install the official <strong>Expo Go</strong> app from the App Store on iPhone or Google Play on Android.</li>
          <li>Open your ASTRA client portal in Safari or Chrome on your phone.</li>
          <li>Sign in or create an account with the email assigned to this project and complete email verification. No purchase or paid plan is required to view your assigned app.</li>
          <li>Select <strong>{app.name}</strong> in your assigned apps to open this page.</li>
          <li>Tap <strong>Open in Expo Go</strong>, allow the phone to open Expo Go, and follow any supported project sign-in prompts. If the link is pending, wait for the studio to connect it.</li>
          <li>Let the app load, try its features, then return to your portal to send feedback or request a tweak.</li>
        </ol>
        <p className="mt-3 text-xs text-muted-foreground">Live previews work while the studio’s preview server is running. If the link is unavailable or Expo Go reports a version/account error, contact the studio. Never share passwords or buy another plan to fix a preview problem.</p>
      </div>
      <LinkRow id="site" label="Website" help="Your live site." href={app.siteUrl} />
      <LinkRow id="testflight" label="TestFlight invite" help="Join the iOS beta through TestFlight." href={app.testflightUrl} />
    </div>
  );
}
