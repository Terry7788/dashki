// Dashki for Android = the website's own pages (../web/src), built into the app.
// Only the phone extras live here: Samsung Health steps, widget shortcuts,
// update check. The page layout and features come from the web app unchanged.
import { lazy, StrictMode, Suspense, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import '@/app/globals.css';
import './phone.css';
import AppShell from '@/components/AppShell';
import HealthCard from './native/HealthCard';
import { initHealthSync, initThemeBars, initWidgetRoutes } from './native/health';
import { checkForUpdate } from './native/updater';

const Home = lazy(() => import('@/app/page'));
const Journal = lazy(() => import('@/app/journal/page'));
const Foods = lazy(() => import('@/app/foods/page'));
const Meals = lazy(() => import('@/app/meals/page'));
const Weight = lazy(() => import('@/app/weight/page'));
const Steps = lazy(() => import('@/app/steps/page'));
const Calendar = lazy(() => import('@/app/calendar/page'));
const Settings = lazy(() => import('@/app/settings/page'));

/** Each page starts at the top, like a page load on the website. */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

/** Home-screen widgets open pages: on a cold start by routing, while running by reloading (the page reads ?addFood=1 on load). */
function WidgetRoutes() {
  const navigate = useNavigate();
  useEffect(() => {
    let first = true;
    initWidgetRoutes((route) => {
      if (first) navigate(route);
      else window.location.assign(route);
    });
    const t = setTimeout(() => (first = false), 1500);
    return () => clearTimeout(t);
  }, [navigate]);
  return null;
}

function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <WidgetRoutes />
      <AppShell>
        <Suspense fallback={<div className="phone-loading" />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/journal" element={<Journal />} />
            <Route path="/foods" element={<Foods />} />
            <Route path="/meals" element={<Meals />} />
            <Route path="/weight" element={<Weight />} />
            <Route path="/steps" element={<><Steps /><HealthCard /></>} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Home />} />
          </Routes>
        </Suspense>
      </AppShell>
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

checkForUpdate('dashki');
initHealthSync();
initThemeBars();
