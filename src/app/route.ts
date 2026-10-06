// The current route, from the address bar's hash.
import { signal } from '@preact/signals';
import { parseRoute, routeHash, type Route } from '../core/app/route.ts';

export const route = signal<Route>(parseRoute(location.hash));

addEventListener('hashchange', () => (route.value = parseRoute(location.hash)));

export function navigate(to: Route): void {
  const hash = routeHash(to);
  if (location.hash !== hash) location.hash = hash;
  route.value = to;
}
