const MUTED_ROUTES_KEY = 'scottygo_muted_routes';

export function normalizeRouteId(routeId: string): string {
  return routeId.trim().toLowerCase();
}

export function getMutedRoutes(): Set<string> {
  try {
    const stored = localStorage.getItem(MUTED_ROUTES_KEY) ?? '[]';
    const parsed = JSON.parse(stored);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

export function saveMutedRoutes(routes: Set<string>): void {
  localStorage.setItem(MUTED_ROUTES_KEY, JSON.stringify([...routes]));
}

export function muteRoute(routeId: string): void {
  const routes = getMutedRoutes();
  routes.add(normalizeRouteId(routeId));
  saveMutedRoutes(routes);
}

export function unmuteRoute(routeId: string): void {
  const routes = getMutedRoutes();
  routes.delete(normalizeRouteId(routeId));
  saveMutedRoutes(routes);
}

export function isRouteMuted(routeId: string): boolean {
  return getMutedRoutes().has(normalizeRouteId(routeId));
}
