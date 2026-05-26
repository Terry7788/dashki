import { lazy, Suspense, useEffect } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from 'react-router-dom';
import { AuthProvider, useAuth, type AuthStatus } from './lib/auth-context';

// Auth screens — synchronous so the sign-in screen feels instant.
import SignInScreen from './screens/SignInScreen';
import SignUpScreen from './screens/SignUpScreen';
import ForgotPasswordScreen from './screens/ForgotPasswordScreen';
import ResetPasswordScreen from './screens/ResetPasswordScreen';
import OnboardingScreen from './screens/OnboardingScreen';

// Main app screens — code-split so the auth bundle stays small.
const HomeScreen = lazy(() => import('./screens/HomeScreen'));
const SettingsScreen = lazy(() => import('./screens/SettingsScreen'));

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

/**
 * Gate that scrolls to top on route change. Mobile WebViews preserve scroll
 * position across navigation, which is jarring inside an app.
 */
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
  // After sign-up, force the user through onboarding once.
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

function AppRoutes() {
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

        {/* Onboarding — signed-in users only */}
        <Route
          path="/onboarding"
          element={
            <ProtectedRoute allowed={['signed-in', 'guest']}>
              <OnboardingScreen />
            </ProtectedRoute>
          }
        />

        {/* Protected (signed-in OR guest) */}
        <Route
          path="/settings"
          element={
            <ProtectedRoute allowed={['signed-in', 'guest']}>
              <SettingsScreen />
            </ProtectedRoute>
          }
        />
        <Route
          path="/"
          element={
            <ProtectedRoute allowed={['signed-in', 'guest']}>
              <HomeScreen />
            </ProtectedRoute>
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
