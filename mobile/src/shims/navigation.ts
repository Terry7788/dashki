// Stand-in for next/navigation on react-router.
import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export function usePathname(): string {
  return useLocation().pathname;
}

export function useSearchParams(): URLSearchParams {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

export function useRouter() {
  const navigate = useNavigate();
  return useMemo(
    () => ({
      push: (to: string) => navigate(to),
      replace: (to: string) => navigate(to, { replace: true }),
      back: () => navigate(-1),
      forward: () => navigate(1),
      refresh: () => window.location.reload(),
      prefetch: () => {},
    }),
    [navigate],
  );
}

export function redirect(to: string): never {
  window.location.assign(to);
  throw new Error('redirect');
}

export function notFound(): never {
  throw new Error('not found');
}
