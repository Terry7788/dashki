// Stand-in for next/link: the website's pages run unchanged on react-router.
import { forwardRef, type AnchorHTMLAttributes, type ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: string | { pathname?: string; query?: Record<string, string> };
  prefetch?: boolean;
  replace?: boolean;
  scroll?: boolean;
  shallow?: boolean;
  passHref?: boolean;
  legacyBehavior?: boolean;
  children?: ReactNode;
};

const Link = forwardRef<HTMLAnchorElement, Props>(function Link(
  { href, prefetch: _p, scroll: _s, shallow: _sh, passHref: _ph, legacyBehavior: _l, replace, ...rest },
  ref,
) {
  const to =
    typeof href === 'string'
      ? href
      : (href.pathname || '/') + (href.query ? `?${new URLSearchParams(href.query)}` : '');
  if (/^(https?:|mailto:|tel:)/.test(to)) return <a ref={ref} href={to} {...rest} />;
  return <RouterLink ref={ref} to={to} replace={replace} {...rest} />;
});

export default Link;
