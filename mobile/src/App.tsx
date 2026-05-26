import { lazy, Suspense, useEffect } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from 'react-router-dom';
import { AuthProvider, useAuth, type AuthStatus } from './lib/auth-context';
import AppShell from './components/AppShell';

// Auth screens — synchronous so the sign-in screen feels instant.
import SignInScreen from './screens/SignInScreen';
import SignUpScreen from './screens/SignUpScreen';
import ForgotPasswordScreen from './screens/ForgotPasswordScreen';
import ResetPasswordScreen from './screens/ResetPasswordScreen';
import OnboardingScreen from './screens/OnboardingScreen';

// Main app screens — code-split so the auth bundle stays small.
const HomeScreen = lazy(() => import('./screens/HomeScreen'));
const SettingsScreen = lazy(() => import('./screens/SettingsScreen'));
const MoreScreen = lazy(() => import('./screens/MoreScreen'));

// Stub screens for tabs ported in subsequent sessions.
const StubsModule = () => import('./screens/stubs');
const JournalScreen = lazy(() =>
  StubsModule().then((m) => ({ default: m.JournalScreen })),
);
const WeightScreen = lazy(() =>
  StubsModule().then((m) => ({ default: m.WeightScreen })),
);
const StepsScreen = lazy(() =>
  StubsModule().then((m) => ({ default: m.StepsScreen })),
);
const MealsScreen = lazy(() =>
  StubsModule().then((m) => ({ default: m.MealsScreen })),
);
const FoodsScreen = lazy(() =>
  StubsModule().then((m) => ({ default: m.FoodsScreen })),
);
const CalendarScreen = lazy(() =>
  StubsModule().then((m) => ({ default: m.CalendarScreen })),
);

function LoadingSplash() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: 'var(--color-background)' }}
    >
      <span
        style={{
          fontSize: 14,
          color: 'var(--color-muted-foreground)',
          fontFamily: 'var(--font-mono)',
        }}
      >
        Loading…
      </span>
    </div>
  );
}

function ScrollToTop() {
  const location = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);
  return null;
}

function ProtectedRoute({
  children,
  allowed,
}: {
  children: React.ReactNode;
  allowed: AuthStatus[];
}) {
  const { status, user } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <LoadingSplash />;
  if (!allowed.includes(status)) {
    return <Navigate to="/sign-in" replace />;
  }
  if (
    status === 'signed-in' &&
    user &&
    !user.onboarding_completed_at &&
    !location.pathname.startsWith('/onboarding')
  ) {
    return <Navigate to="/onboarding" replace />;
  }
  return <>{children}</>;
}

function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  if (status === 'loading') return <LoadingSplash />;
  if (status === 'signed-in' || status === 'guest') {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

/**
 * Wraps protected routes that should show the bottom tab bar.
 * Settings + Onboarding are deliberately NOT tabbed — they're full-bleed pages.
 */
function TabbedRoute({
  children,
  allowed,
}: {
  children: React.ReactNode;
  allowed: AuthStatus[];
}) {
  return (
    <ProtectedRoute allowed={allowed}>
      <AppShell>{children}</AppShell>
    </ProtectedRoute>
  );
}

function AppRoutes() {
  const tabbed: AuthStatus[] = ['signed-in', 'guest'];
  return (
    <Suspense fallback={<LoadingSplash />}>
      <Routes>
        {/* Public (signed-out only) */}
        <Route
          path="/sign-in"
          element={
            <PublicOnlyRoute>
              <SignInScreen />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/sign-up"
          element={
            <PublicOnlyRoute>
              <SignUpScreen />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/forgot-password"
          element={
            <PublicOnlyRoute>
              <ForgotPasswordScreen />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/reset-password/:token"
          element={
            <PublicOnlyRoute>
              <ResetPasswordScreen />
            </PublicOnlyRoute>
          }
        />

        {/* Onboarding wizard — no tab bar */}
        <Route
          path="/onboarding"
          element={
            <ProtectedRoute allowed={tabbed}>
              <OnboardingScreen />
            </ProtectedRoute>
          }
        />

        {/* Full-bleed protected pages (no tab bar) */}
        <Route
          path="/settings"
          element={
            <ProtectedRoute allowed={tabbed}>
              <SettingsScreen />
            </ProtectedRoute>
          }
        />

        {/* Tabbed routes — share the bottom tab bar */}
        <Route
          path="/"
          element={
            <TabbedRoute allowed={tabbed}>
              <HomeScreen />
            </TabbedRoute>
          }
        />
        <Route
          path="/journal"
          element={
            <TabbedRoute allowed={tabbed}>
              <JournalScreen />
            </TabbedRoute>
          }
        />
        <Route
          path="/weight"
          element={
            <TabbedRoute allowed={tabbed}>
              <WeightScreen />
            </TabbedRoute>
          }
        />
        <Route
          path="/steps"
          element={
            <TabbedRoute allowed={tabbed}>
              <StepsScreen />
            </TabbedRoute>
          }
        />
        <Route
          path="/more"
          element={
            <TabbedRoute allowed={tabbed}>
              <MoreScreen />
            </TabbedRoute>
          }
        />
        <Route
          path="/meals"
          element={
            <TabbedRoute allowed={tabbed}>
              <MealsScreen />
            </TabbedRoute>
          }
        />
        <Route
          path="/foods"
          element={
            <TabbedRoute allowed={tabbed}>
              <FoodsScreen />
            </TabbedRoute>
          }
        />
        <Route
          path="/calendar"
          element={
            <TabbedRoute allowed={tabbed}>
              <CalendarScreen />
            </TabbedRoute>
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ScrollToTop />
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
