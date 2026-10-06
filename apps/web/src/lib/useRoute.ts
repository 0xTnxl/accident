import { useCallback, useEffect, useState } from 'react';
import type { Route } from './route.js';
import { parseRoute, routePath } from './route.js';

function current(): Route {
  return parseRoute(window.location.pathname, window.location.search, window.location.hash);
}

/** The current route and a way to move to another one without reloading the page. */
export function useRoute(): [Route, (route: Route, options?: { replace?: boolean }) => void] {
  const [route, setRoute] = useState<Route>(current);

  useEffect(() => {
    const onChange = (): void => setRoute(current());
    window.addEventListener('popstate', onChange);
    return () => window.removeEventListener('popstate', onChange);
  }, []);

  const go = useCallback((next: Route, options?: { replace?: boolean }) => {
    const path = routePath(next);
    if (options?.replace) window.history.replaceState(null, '', path);
    else window.history.pushState(null, '', path);
    setRoute(current());
    window.scrollTo?.(0, 0);
  }, []);

  return [route, go];
}
