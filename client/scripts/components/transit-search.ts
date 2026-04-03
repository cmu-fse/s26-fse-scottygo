/**
 * Transit Search Component
 * Provides search input with dropdown results for routes and stops.
 * Delegates search to the backend via GET /map/search?q=... (TransitSearchStrategy).
 */
import { MapStateManager } from '../state/map-state';
import type { IRoute, IStop } from '../../../common/transit.interface';

export interface ITransitSearchElement extends HTMLElement {
  setStopsData(stopsData: Record<string, IStop[]>): void;
}

export class TransitSearch extends HTMLElement {
  private routes: IRoute[] = [];
  private routeMap: Map<string, IRoute> = new Map();
  private unsubscribe: (() => void) | null = null;

  private searchInput: HTMLInputElement | null = null;
  private clearBtn: HTMLButtonElement | null = null;
  private dropdown: HTMLElement | null = null;

  connectedCallback(): void {
    this.innerHTML = `
      <div class="search-bar">
        <div class="search-wrapper">
          <div class="search-box">
            <span class="material-icons-outlined search-icon">search</span>
            <input
              type="text"
              id="transit-search-input"
              placeholder="Search routes or stops"
              autocomplete="off"
              aria-label="Search routes or stops"
              aria-autocomplete="list"
              aria-controls="search-dropdown"
            />
            <button
              class="search-clear-btn"
              id="search-clear-btn"
              aria-label="Clear search"
            >
              <span class="material-icons-outlined">close</span>
            </button>
          </div>
          <div
            class="search-dropdown"
            id="search-dropdown"
            role="listbox"
            hidden
          ></div>
        </div>
        <button class="layers-btn" id="layers-btn" title="Toggle Layers">
          <span class="material-icons-outlined">layers</span>
        </button>
      </div>
    `;

    this.searchInput = this.querySelector(
      '#transit-search-input'
    ) as HTMLInputElement;
    this.clearBtn = this.querySelector(
      '#search-clear-btn'
    ) as HTMLButtonElement;
    this.dropdown = this.querySelector('#search-dropdown') as HTMLElement;
    const layersBtn = this.querySelector('#layers-btn') as HTMLButtonElement;

    this.searchInput?.addEventListener('input', () => this.handleInput());
    this.searchInput?.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const query = this.searchInput?.value.trim() ?? '';
      if (!query) return;
      void this.renderResults(query);
    });
    this.searchInput?.addEventListener('focus', () => {
      const query = this.searchInput?.value.trim() ?? '';
      if (query) void this.renderResults(query);
    });

    this.clearBtn?.addEventListener('click', () => this.clearSearch());

    layersBtn?.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('toggleLayers', { bubbles: true }));
    });

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
      if (!this.contains(e.target as Node)) this.hideDropdown();
    });

    // Subscribe to route updates from state manager (for stop badge colors)
    const stateManager = MapStateManager.getInstance();
    this.unsubscribe = stateManager.subscribe((state) => {
      this.routes = state.availableRoutes;
      this.routeMap = new Map(this.routes.map((r) => [r.id, r]));
    });

    const initialState = stateManager.getState();
    this.routes = initialState.availableRoutes;
    this.routeMap = new Map(this.routes.map((r) => [r.id, r]));
  }

  disconnectedCallback(): void {
    this.unsubscribe?.();
  }

  /**
   * No-op: stop data is now handled server-side by TransitSearchStrategy.
   * Kept for interface compatibility with existing callers in map.ts.
   */
  setStopsData(_stopsData: Record<string, IStop[]>): void {
    // Search is now delegated to the backend — no local stop state needed.
  }

  private handleInput(): void {
    const query = this.searchInput?.value.trim() ?? '';

    if (this.clearBtn) this.clearBtn.classList.toggle('is-visible', !!query);

    if (!query) {
      this.hideDropdown();
      this.dispatchEvent(
        new CustomEvent('search', { detail: { query: '' }, bubbles: true })
      );
      return;
    }

    this.dispatchEvent(
      new CustomEvent('search', { detail: { query }, bubbles: true })
    );
    void this.renderResults(query);
  }

  /**
   * Calls GET /map/search?q=<query> on the backend (TransitSearchStrategy).
   * The backend applies stop word filtering and returns matching routes and stops.
   */
  private async renderResults(query: string): Promise<void> {
    if (!this.dropdown) return;

    const token = localStorage.getItem('token') ?? '';
    let matchedRoutes: IRoute[] = [];
    let matchedStops: IStop[] = [];

    try {
      const res = await fetch(`/map/search?q=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json() as {
          payload?: { routes: IRoute[]; stops: IStop[] }
        };
        matchedRoutes = data.payload?.routes ?? [];
        matchedStops = data.payload?.stops ?? [];
      }
    } catch {
      // Network error — show no results
    }

    if (matchedRoutes.length === 0 && matchedStops.length === 0) {
      this.dropdown.innerHTML = `<div class="search-no-results">No results found</div>`;
      this.showDropdown();
      return;
    }

    const routeItems = matchedRoutes
      .map((r) => {
        // PRT GTFS uses internal numeric route_id; route.name is the
        // user-facing route number (route_short_name) in that case.
        // When route_id is alphanumeric (e.g. "61D") it IS the route
        // identifier and route.name holds the description (e.g. "Murray").
        const isInternalId = /^\d+$/.test(r.id);
        let label: string;
        if (isInternalId) {
          label = r.name; // e.g. "11" instead of "1- 11"
        } else if (r.id === r.name) {
          label = r.id; // avoid "61D- 61D"
        } else {
          label = `${r.id}- ${r.name}`; // e.g. "61D- Murray"
        }
        return `
        <div class="search-result-item search-result-route" data-route-id="${r.id}" role="option" tabindex="0">
          <span class="material-icons-outlined search-result-icon">directions_bus</span>
          <span class="search-result-name">${label}</span>
        </div>`;
      })
      .join('');

    const stopItems = matchedStops
      .map((s) => {
        const badges = (s.routes ?? [])
          .map((routeId: string) => {
            const route = this.routeMap.get(routeId);
            const color = route?.color ?? '#888888';
            const textColor = this.getTextColor(color);
            return `<span class="route-badge" style="background:${color};color:${textColor}">${routeId}</span>`;
          })
          .join('');

        return `
          <div class="search-result-item search-result-stop" data-stop-id="${s.stopId}" role="option" tabindex="0">
            <span class="material-icons-outlined search-result-icon">place</span>
            <div class="search-result-content">
              <span class="search-result-name">${s.stopName}</span>
              ${badges ? `<div class="search-result-badges">${badges}</div>` : ''}
            </div>
          </div>`;
      })
      .join('');

    this.dropdown.innerHTML = routeItems + stopItems;
    this.showDropdown();

    const stopById = new Map(matchedStops.map((stop) => [stop.stopId, stop]));

    this.dropdown.querySelectorAll('.search-result-route').forEach((el) => {
      el.addEventListener('click', () => {
        const routeId = (el as HTMLElement).dataset.routeId!;
        this.dispatchEvent(
          new CustomEvent('searchSelectRoute', {
            detail: { routeId },
            bubbles: true
          })
        );
        this.hideDropdown();
      });
    });

    this.dropdown.querySelectorAll('.search-result-stop').forEach((el) => {
      el.addEventListener('click', () => {
        const stopId = (el as HTMLElement).dataset.stopId!;
        const stop = stopById.get(stopId);
        this.dispatchEvent(
          new CustomEvent('searchSelectStop', {
            detail: {
              stopId,
              stop
            },
            bubbles: true
          })
        );
        this.hideDropdown();
      });
    });
  }

  /** Returns black or white text color depending on background luminance. */
  private getTextColor(hex: string): string {
    const clean = hex.replace('#', '');
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    // Relative luminance (WCAG formula, simplified)
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.55 ? '#1f2937' : '#ffffff';
  }

  private clearSearch(): void {
    if (this.searchInput) this.searchInput.value = '';
    if (this.clearBtn) this.clearBtn.classList.remove('is-visible');
    this.hideDropdown();
    this.dispatchEvent(
      new CustomEvent('search', { detail: { query: '' }, bubbles: true })
    );
    this.searchInput?.focus();
  }

  private showDropdown(): void {
    if (this.dropdown) this.dropdown.hidden = false;
  }

  private hideDropdown(): void {
    if (this.dropdown) this.dropdown.hidden = true;
  }
}

customElements.define('transit-search', TransitSearch);
