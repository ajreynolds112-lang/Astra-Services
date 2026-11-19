import { useEffect, useRef, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import Home from '@/pages/home';
import CheckoutSuccess from '@/pages/checkout-success';
import CheckoutCancel from '@/pages/checkout-cancel';
import Portal from '@/pages/portal';
import AppDetail from '@/pages/app-detail';
import { Terms, Privacy } from '@/pages/legal';
import { Mark } from '@/components/chrome';
import {
  Link,
  Redirect,
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

// REQUIRED — copy verbatim. Resolves the key from window.location.hostname so the
// same build serves multiple Clerk custom domains.
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

// REQUIRED — copy verbatim. Empty in dev, auto-set in prod.
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

// Clerk passes full paths to routerPush/routerReplace, but wouter's
// setLocation prepends the base — strip it to avoid doubling.
function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || '/'
    : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
    socialButtonsVariant: 'blockButton' as const,
  },
  variables: {
    colorPrimary: 'hsl(236 92% 54%)',
    colorForeground: 'hsl(232 45% 12%)',
    colorMutedForeground: 'hsl(232 12% 38%)',
    colorDanger: 'hsl(2 72% 46%)',
    colorBackground: 'hsl(40 40% 99%)',
    colorInput: 'hsl(0 0% 100%)',
    colorInputForeground: 'hsl(232 45% 12%)',
    colorNeutral: 'hsl(232 20% 40%)',
    fontFamily: "'Geist', system-ui, sans-serif",
    borderRadius: '0.75rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[hsl(40_40%_99%)] rounded-3xl w-[420px] max-w-full overflow-hidden border border-[hsl(232_20%_88%)] shadow-[0_30px_80px_-30px_rgba(17,21,46,0.25)]',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[hsl(232_45%_12%)] text-2xl font-semibold tracking-tight',
    headerSubtitle: 'text-[hsl(232_12%_38%)]',
    socialButtonsBlockButtonText: 'text-[hsl(232_45%_12%)] font-medium',
    formFieldLabel: 'text-[hsl(232_45%_14%)] font-medium',
    footerActionLink: 'text-[hsl(236_92%_48%)] font-medium',
    footerActionText: 'text-[hsl(232_12%_38%)]',
    dividerText: 'text-[hsl(232_12%_38%)]',
    identityPreviewEditButton: 'text-[hsl(236_92%_48%)]',
    formFieldSuccessText: 'text-[hsl(150_60%_28%)]',
    alertText: 'text-[hsl(2_72%_36%)]',
    logoBox: 'h-12 justify-center',
    logoImage: 'h-12 w-12',
    socialButtonsBlockButton: 'bg-white border border-[hsl(232_20%_86%)] rounded-full h-11',
    formButtonPrimary: 'bg-[hsl(232_45%_12%)] text-[hsl(40_40%_98%)] rounded-full h-11 normal-case text-sm font-medium',
    formFieldInput: 'bg-white border border-[hsl(232_18%_84%)] rounded-xl h-11 text-[hsl(232_45%_12%)]',
    footerAction: 'justify-center',
    dividerLine: 'bg-[hsl(232_20%_88%)]',
    alert: 'bg-[hsl(2_80%_96%)] border border-[hsl(2_70%_85%)]',
    otpCodeFieldInput: 'border border-[hsl(232_18%_80%)] text-[hsl(232_45%_12%)]',
    formFieldRow: 'gap-3',
    main: 'gap-5',
  },
};

function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center bg-background px-4 py-16">
      <Link href="/" className="absolute left-6 top-5 flex items-center gap-2 text-foreground" data-testid="link-auth-home">
        <Mark className="h-4 w-4 text-primary" />
        <span className="text-[13px] font-semibold tracking-[0.32em]">ASTRA</span>
      </Link>
      {children}
    </div>
  );
}

function SignInPage() {
  return (
    <AuthShell>
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </AuthShell>
  );
}

function SignUpPage() {
  return (
    <AuthShell>
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </AuthShell>
  );
}

function AppDetailRoute() {
  return (
    <>
      <Show when="signed-in">
        <AppDetail />
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/portal" />
      </Show>
      <Show when="signed-out">
        <Home />
      </Show>
    </>
  );
}

function PortalRoute() {
  return (
    <>
      <Show when="signed-in">
        <Portal />
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

// Clears cached API data when the signed-in user changes.
function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: 'Welcome back',
            subtitle: 'Sign in to your ASTRA account',
          },
        },
        signUp: {
          start: {
            title: 'Create your account',
            subtitle: 'Sign up for an ASTRA account',
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <RoutedErrorBoundary>
            <Switch>
              <Route path="/" component={HomeRedirect} />
              <Route path="/sign-in/*?" component={SignInPage} />
              <Route path="/sign-up/*?" component={SignUpPage} />
              <Route path="/portal" component={PortalRoute} />
              <Route path="/portal/apps/:id" component={AppDetailRoute} />
              <Route path="/checkout/success" component={CheckoutSuccess} />
              <Route path="/checkout/cancel" component={CheckoutCancel} />
              <Route path="/terms" component={Terms} />
              <Route path="/privacy" component={Privacy} />
              <Route component={NotFound} />
            </Switch>
          </RoutedErrorBoundary>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
