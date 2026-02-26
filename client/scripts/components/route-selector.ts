/**
 * Route Selector Panel Component
 * A reusable route selector panel for selecting transit routes
 * Used for Route Filter in VisRoute feature (Basic Flow steps 7-10, Rule R1)
 */

export interface IRouteSelection {
  route: string;
}

export interface IRouteSelectorElement extends HTMLElement {
  show(): void;
  hide(): void;
  toggle(): void;
  isOpen(): boolean;
  setRoutes(routes: string[]): void;
}

export class RouteSelectorPanel extends HTMLElement implements IRouteSelectorElement {
  private routes: string[] = [];
  private filteredRoutes: string[] = [];
  private selectedRoute: string | null = null;
  private isVisible = false;

  constructor() {
    super();
    // Default sample routes (PRT and CMU routes)
    this.routes = ['61A', '61B', '61C', '61D', '67', '69', '71A', '71B', '71C', '71D', 'P1', 'P3', 'P10X'];
    this.filteredRoutes = [...this.routes];
  }

  connectedCallback(): void {
    this.render();
  }

  /**
   * Show the route selector panel
   */
  show(): void {
    const panel = this.querySelector('.route-selector-panel') as HTMLElement;
    if (panel) {
      console.log('Showing route selector panel');
      panel.style.display = 'block';
      this.isVisible = true;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          panel.classList.add('visible');
        });
      });
    }
  }

  /**
   * Hide the route selector panel
   */
  hide(): void {
    const panel = this.querySelector('.route-selector-panel') as HTMLElement;
    if (panel) {
      console.log('Hiding route selector panel');
      panel.classList.remove('visible');
      setTimeout(() => {
        panel.style.display = 'none';
        this.isVisible = false;
      }, 300);
    }
  }

  /**
   * Toggle panel visibility
   */
  toggle(): void {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Check if panel is open
   */
  isOpen(): boolean {
    return this.isVisible;
  }

  /**
   * Allow setting routes dynamically
   */
  setRoutes(routes: string[]): void {
    this.routes = routes;
    this.filteredRoutes = [...routes];
    this.render();
  }

  private render(): void {
    this.innerHTML = `
      <div class="route-selector-panel panel" style="display: none;">
        <div class="route-search-wrapper">
          <span class="material-icons-outlined route-search-icon">search</span>
          <input type="text" class="route-search-input" placeholder="Search route..." />
        </div>

        <div class="route-list">
          ${this.filteredRoutes
            .map(
              route => `
                <button class="route-btn ${this.selectedRoute === route ? 'selected' : ''}" data-route="${route}">
                  ${route}
                </button>
              `
            )
            .join('')}
        </div>

        <div class="filter-actions">
          <button class="filter-btn cancel-btn" id="route-cancel">Cancel</button>
          <button class="filter-btn ok-btn" id="route-ok">OK</button>
        </div>
      </div>
    `;

    this.attachEvents();
  }

  private attachEvents(): void {
    // Search input
    const input = this.querySelector('.route-search-input') as HTMLInputElement;
    input?.addEventListener('input', (e) => {
      e.stopPropagation();
      const value = (e.target as HTMLInputElement).value.toLowerCase();
      this.filteredRoutes = this.routes.filter(route =>
        route.toLowerCase().includes(value)
      );
      this.render();
    });

    // Route button selection
    this.querySelectorAll('.route-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const route = (e.currentTarget as HTMLElement).dataset.route;
        this.selectedRoute = route || null;
        this.render();
      });
    });

    // Cancel button
    this.querySelector('#route-cancel')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.selectedRoute = null;
      this.hide();
    });

    // OK button - dispatch routeSelected event
    this.querySelector('#route-ok')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.selectedRoute) {
        const routeSelection: IRouteSelection = {
          route: this.selectedRoute
        };

        this.dispatchEvent(
          new CustomEvent('routeSelected', {
            detail: routeSelection,
            bubbles: true
          })
        );
      }

      this.hide();
    });
  }
}

customElements.define('route-selector-panel', RouteSelectorPanel);
