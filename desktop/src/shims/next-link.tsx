import { ReactNode, AnchorHTMLAttributes, MouseEvent } from 'react';

interface NextLinkShimProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  href: string;
  children?: ReactNode;
  // Next.js-specific props we accept and ignore
  prefetch?: boolean;
  replace?: boolean;
  scroll?: boolean;
  shallow?: boolean;
  passHref?: boolean;
  legacyBehavior?: boolean;
  locale?: string | false;
}

/**
 * Shim for `next/link` in the desktop Electron app.
 *
 * The web app's pages (e.g. `web/src/app/page.tsx`) use `<Link href="/gym">`
 * for in-app navigation. The desktop app has no Next.js router — it has tabs.
 * Letting an `<a href="/gym">` click through would navigate the Electron
 * BrowserWindow away from our bundle. So clicks here are intercepted
 * (preventDefault) but the visual `<a>` still renders for layout fidelity.
 */
export default function NextLinkShim({
  href,
  children,
  prefetch: _prefetch,
  replace: _replace,
  scroll: _scroll,
  shallow: _shallow,
  passHref: _passHref,
  legacyBehavior: _legacyBehavior,
  locale: _locale,
  onClick,
  ...rest
}: NextLinkShimProps) {
  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    onClick?.(e);
  };
  return (
    <a href={href} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
}
