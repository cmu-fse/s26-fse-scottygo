/**
 * Route Selector Panel Component
 * A reusable route selector panel for selecting transit routes
 * Used for Route Filter in VisRoute feature (Basic Flow steps 7-10, Rule R1)
 */

export interface IRouteSelection {
  route: string;
}

export interface IRouteOption {
  id: string;
  name: string;
}

export interface IRouteSelectorElement extends HTMLElement {
  show(): void;
  hide(): void;
  toggle(): void;
  isOpen(): boolean;
  setRoutes(routes: IRouteOption[]): void;
}

export class RouteSelectorPanel
  extends HTMLElement
  implements IRouteSelectorElement
{
  private routes: IRouteOption[] = [];
  private filteredRoutes: IRouteOption[] = [];
  private selectedRoute: string | null = null;
  private isVisible = false;
  private searchValue = '';

  constructor() {
    super();
    // Default sample routes (PRT and CMU routes)
    this.routes = [
      { id: '61A', name: '61A' },
      { id: '61B', name: '61B' },
      { id: '61C', name: '61C' },
      { id: '61D', name: '61D' },
      { id: '67', name: '67' },
      { id: '69', name: '69' },
      { id: '71A', name: '71A' },
      { id: '71B', name: '71B' },
      { id: '71C', name: '71C' },
      { id: '71D', name: '71D' },
      { id: 'P1', name: 'P1' },
      { id: 'P3', name: 'P3' },
      { id: 'P10X', name: 'P10X' }
    ];
    this.filteredRoutes = [...this.routes];
  }

  connectedCallback(): void {
    this.render();
    // Add stopPropagation at the component level to prevent any clicks from bubbling
    this.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  /**
   * Show the route selector panel
   */
  show(): void {
    const panel = this.querySelector('.route-selector-panel') as HTMLElement;
    if (panel) {
      console.log('Showing route selector panel');
      panel.style.display = 'block';
      panel.style.pointerEvents = 'auto'; // Enable pointer events immediately
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
      panel.style.pointerEvents = 'none'; // Disable pointer events
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
  setRoutes(routes: IRouteOption[]): void {
    this.routes = routes;
    this.filteredRoutes = [...routes];
    this.searchValue = '';
    this.render();
  }

  private render(): void {
    // Preserve display and pointer-events styles if panel is currently visible
    const displayStyle = this.isVisible ? 'block' : 'none';
    const pointerEvents = this.isVisible ? 'auto' : 'none';

    this.innerHTML = `
      <div class="route-selector-panel panel" style="display: ${displayStyle}; pointer-events: ${pointerEvents};">
        <div class="route-search-wrapper">
          <span class="material-icons-outlined route-search-icon">search</span>
          <input type="text" class="route-search-input" placeholder="Search route..." value="${this.searchValue}" />
        </div>

        <div class="route-list">
          ${this.filteredRoutes
            .map(
              (route) => `
                <button class="route-btn ${this.selectedRoute === route.id ? 'selected' : ''}" data-route="${route.id}">
                  ${route.name}
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

    // Re-apply the visible class if panel is currently visible
    if (this.isVisible) {
      const panel = this.querySelector('.route-selector-panel') as HTMLElement;
      if (panel) {
        panel.classList.add('visible');
      }
    }

    this.attachEvents();

    // Scroll to selected route if one exists
    if (this.selectedRoute) {
      requestAnimationFrame(() => {
        const selectedBtn = this.querySelector(
          `.route-btn[data-route="${this.selectedRoute}"]`
        ) as HTMLElement;
        if (selectedBtn) {
          selectedBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
    }
  }

  private attachEvents(): void {
    // Search input
    const input = this.querySelector('.route-search-input') as HTMLInputElement;
    input?.addEventListener('input', (e) => {
      e.stopPropagation();
      const value = (e.target as HTMLInputElement).value.toLowerCase();
      const cursorPos = (e.target as HTMLInputElement).selectionStart;
      this.searchValue = value;
      this.filteredRoutes = this.routes.filter(
        (route) =>
          route.id.toLowerCase().includes(value) ||
          route.name.toLowerCase().includes(value)
      );
      // Save scroll position before re-render
      const routeList = this.querySelector('.route-list') as HTMLElement;
      const scrollTop = routeList?.scrollTop || 0;
      this.render();
      // Restore scroll position and focus after re-render
      const newRouteList = this.querySelector('.route-list') as HTMLElement;
      if (newRouteList) {
        newRouteList.scrollTop = scrollTop;
      }
      // Restore focus and cursor position
      const newInput = this.querySelector(
        '.route-search-input'
      ) as HTMLInputElement;
      if (newInput) {
        newInput.focus();
        newInput.setSelectionRange(cursorPos, cursorPos);
      }
    });

    // Route button selection
    this.querySelectorAll('.route-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const route = (e.currentTarget as HTMLElement).dataset.route;
        this.selectedRoute = route || null;

        // Update selection without full re-render to preserve scroll position
        this.querySelectorAll('.route-btn').forEach((b) => {
          b.classList.remove('selected');
        });
        (e.currentTarget as HTMLElement).classList.add('selected');
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
