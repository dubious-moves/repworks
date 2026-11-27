// A link followed into the installed app while it is already open (PLAN.md §5.215). The manifest's
// `launch_handler` is `focus-existing` (§5.159: a .pgn opened with the app must not reload it), and
// with it the browser focuses the open window without navigating it: the link arrives as the
// launch's `targetURL`, and going there is the app's own job. Pure: the link, and where the app is.

export interface Here {
  origin: string;
  pathname: string;
  hash: string;
}

/**
 * The hash to go to for a launch's link: the link's own, when it is an address of this app (its
 * origin and path) other than the one shown. Undefined for a launch with no link, a link elsewhere,
 * or the page already open. A link to the app itself with no hash is its home.
 */
export function launchHash(target: string | undefined, here: Here): string | undefined {
  if (!target) return undefined;
  const at = target.indexOf('#');
  const page = (at < 0 ? target : target.slice(0, at)).replace(/\?.*$/, '');
  if (page !== here.origin + here.pathname) return undefined;
  const hash = at < 0 || at === target.length - 1 ? '#/' : target.slice(at);
  return hash === (here.hash || '#/') ? undefined : hash;
}
