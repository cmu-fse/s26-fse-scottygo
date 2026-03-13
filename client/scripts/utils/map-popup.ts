/**
 * Shared map-popup utilities.
 *
 * Both the stop-info popup (filter-controller) and the bus-info popup
 * (vehicle-tracker) share one DOM slot so only one popup can be visible at
 * a time.  Any module that needs to show a popup should call
 * `closeMapPopup()` first to dismiss whatever is currently displayed.
 */

/** The single id used for every map overlay popup. */
export const MAP_POPUP_ID = 'map-popup';

/**
 * Remove the currently-visible map popup (stop or bus), if any.
 */
export function closeMapPopup(): void {
  const existing = document.getElementById(MAP_POPUP_ID);
  if (existing) existing.remove();
}
