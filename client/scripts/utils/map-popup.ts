/**
 * Shared map-popup utilities — unified minimize / restore / dismiss lifecycle.
 *
 * All popup types (stop, bus, route-info) share one DOM slot so only one
 * popup OR docked tab can exist at a time.
 */

/** The single id used for every map overlay popup. */
export const MAP_POPUP_ID = 'map-popup';

/**
 * Create a bare popup shell with a header row.
 * Returns { popup, header, subheader } ready to be populated by the caller.
 *
 * @param iconModifier  BEM modifier for the icon span, e.g. 'stop' or 'bus'
 * @param iconName      Material icon name, e.g. 'place' or 'directions_bus'
 * @param titleHtml     Inner HTML for the bold title element
 * @param minimizeTitle Optional title attribute on the minimize button
 */
export function createMapPopup(
  iconModifier: string,
  iconName: string,
  titleHtml: string,
  minimizeTitle?: string
): { popup: HTMLDivElement; subheader: HTMLDivElement } {
  const popup = document.createElement('div');
  popup.id = MAP_POPUP_ID;
  popup.className = 'map-popup';

  const header = document.createElement('div');
  header.className = 'map-popup__header';
  const titleAttr = minimizeTitle ? ` title="${minimizeTitle}"` : '';
  header.innerHTML = `
    <span class="material-icons-outlined map-popup__icon map-popup__icon--${iconModifier}">${iconName}</span>
    <strong class="map-popup__title">${titleHtml}</strong>
    <button class="map-popup__minimize" aria-label="Minimize"${titleAttr}>&ndash;</button>
  `;
  popup.appendChild(header);

  const subheader = document.createElement('div');
  subheader.className = 'map-popup__subheader';
  popup.appendChild(subheader);

  return { popup, subheader };
}

/** The single id for the docked minimised tab. */
const MAP_POPUP_TAB_ID = 'map-popup-tab';

/** Cached popup state for restore. */
let cachedPopupHTML: string | null = null;
let cachedScrollTop = 0;
let cachedOnRestore: (() => void) | null = null;

// ── Close / Dismiss ─────────────────────────────────────────────────

/**
 * Remove the currently-visible map popup (stop, bus, or route), if any.
 */
export function closeMapPopup(): void {
  const existing = document.getElementById(MAP_POPUP_ID);
  if (existing) existing.remove();
}

/**
 * Fully dismiss both the popup and any docked tab, clearing cached state.
 */
export function dismissPopup(): void {
  closeMapPopup();
  removeDockTab();
  cachedPopupHTML = null;
  cachedScrollTop = 0;
  cachedOnRestore = null;
}

// ── Minimise → Docked Tab ───────────────────────────────────────────

/**
 * Minimize the current popup into a small docked tab at the bottom.
 * @param label  Short text summarising the popup (e.g. stop name, bus id)
 * @param badgeText  Optional badge text (route id)
 * @param badgeColor Optional badge background colour (route colour)
 * @param onRestore  Callback invoked when the user clicks the tab to restore
 */
export function minimizePopup(
  label: string,
  onRestore: () => void,
  badgeText?: string,
  badgeColor?: string
): void {
  // Cache current popup contents
  const popup = document.getElementById(MAP_POPUP_ID);
  if (popup) {
    const scrollableList = popup.querySelector('.map-popup__list');
    cachedScrollTop = scrollableList ? scrollableList.scrollTop : 0;
    cachedPopupHTML = popup.innerHTML;
  }
  cachedOnRestore = onRestore;

  // Remove full popup
  closeMapPopup();

  // Remove any existing tab
  removeDockTab();

  // Build the docked tab
  const container = document.querySelector('.map-container');
  if (!container) return;

  const tab = document.createElement('div');
  tab.id = MAP_POPUP_TAB_ID;
  tab.className = 'map-popup-tab';

  let inner =
    '<span class="material-icons-outlined map-popup-tab__arrow">expand_less</span>';
  if (badgeText) {
    const style = badgeColor ? ` style="background:${badgeColor}"` : '';
    inner += `<span class="map-popup-tab__badge"${style}>${badgeText}</span>`;
  }
  inner += `<span class="map-popup-tab__label">${label}</span>`;
  tab.innerHTML = inner;

  tab.addEventListener('click', () => {
    restorePopup();
  });

  container.appendChild(tab);
}

// ── Restore from Tab ────────────────────────────────────────────────

/**
 * Restore the popup from the docked tab using cached HTML.
 */
export function restorePopup(): void {
  removeDockTab();

  if (!cachedPopupHTML) return;

  const container = document.querySelector('.map-container');
  if (!container) return;

  const popup = document.createElement('div');
  popup.id = MAP_POPUP_ID;
  popup.className = 'map-popup';
  popup.innerHTML = cachedPopupHTML;
  container.appendChild(popup);

  // Restore scroll position
  const scrollableList = popup.querySelector('.map-popup__list');
  if (scrollableList) {
    scrollableList.scrollTop = cachedScrollTop;
  }

  // Re-bind event handlers via the onRestore callback
  if (cachedOnRestore) {
    cachedOnRestore();
  }

  cachedPopupHTML = null;
  cachedScrollTop = 0;
}

// ── Helpers ─────────────────────────────────────────────────────────

function removeDockTab(): void {
  const tab = document.getElementById(MAP_POPUP_TAB_ID);
  if (tab) tab.remove();
}

/**
 * Returns true if there is a minimised popup tab currently visible.
 */
export function hasMinimisedTab(): boolean {
  return !!document.getElementById(MAP_POPUP_TAB_ID);
}
