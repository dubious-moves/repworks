// Routes live in the hash, since GitHub Pages has no SPA fallback (PLAN.md §4.1):
//   #/            the study list
//   #/import      import a study
// A setup link (#setup?…) is read and removed before routing (src/app/setup.ts).

export type Route = { name: 'home' } | { name: 'import' };

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#\/?/, '').split(/[?#]/)[0]!.replace(/\/+$/, '');
  if (path === 'import') return { name: 'import' };
  return { name: 'home' };
}

export function routeHash(route: Route): string {
  switch (route.name) {
    case 'home':
      return '#/';
    case 'import':
      return '#/import';
  }
}
