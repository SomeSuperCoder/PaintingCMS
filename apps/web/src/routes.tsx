/**
 * Route path constants — the 7 screens of the ux-design inventory
 * (docs/ux-design.md §1/§2; the form screen has two routes: new + edit).
 */
export const ROUTES = {
  home: '/',
  paintingDetail: '/paintings/:id',
  paintingNew: '/paintings/new',
  paintingEdit: '/paintings/:id/edit',
  locations: '/locations',
  owner: '/owner',
  denied: '/denied',
  expired: '/expired',
} as const;

export type RouteName = keyof typeof ROUTES;
export type RoutePath = (typeof ROUTES)[RouteName];

/** Build a concrete detail path for a painting id. */
export function paintingDetailPath(id: string): string {
  return ROUTES.paintingDetail.replace(':id', encodeURIComponent(id));
}

/** Build a concrete edit path for a painting id. */
export function paintingEditPath(id: string): string {
  return ROUTES.paintingEdit.replace(':id', encodeURIComponent(id));
}
