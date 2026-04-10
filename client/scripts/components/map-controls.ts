/**
 * Map Controls Component
 * Provides filter controls for route, calendar, time, and direction
 */

export class MapControls extends HTMLElement {
  connectedCallback(): void {
    this.innerHTML = `
      <div class="control-panel">
        <button class="circle-btn" id="route-filter-btn" title="Route Filter">
          <span class="material-icons-outlined">directions_bus</span>
        </button>
        <button class="circle-btn" id="calendar-filter-btn" title="Calendar Filter">
          <span class="material-icons-outlined">calendar_today</span>
        </button>
        <button class="circle-btn" id="time-filter-btn" title="Time Filter">
          <span class="material-icons-outlined">schedule</span>
        </button>
        <button class="circle-btn" id="system-filter-btn" title="Transit System Filter">
          <div class="system-icon">
            <span class="system-text">PRT</span>
            <span class="system-text">CMU</span>
          </div>
        </button>
        <button class="circle-btn primary" id="direction-filter-btn" title="Direction Filter">
          <span class="material-icons-outlined">sync_alt</span>
        </button>
        <button class="circle-btn" id="clear-filters-btn" title="Clear All Filters">
          <span class="material-icons-outlined">clear_all</span>
        </button>
      </div>
    `;

    // Add event listeners for each filter button
    const routeBtn = this.querySelector('#route-filter-btn');
    const calendarBtn = this.querySelector('#calendar-filter-btn');
    const timeBtn = this.querySelector('#time-filter-btn');
    const systemBtn = this.querySelector('#system-filter-btn');
    const directionBtn = this.querySelector('#direction-filter-btn');

    routeBtn?.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('filterRoute', { bubbles: true }));
    });

    calendarBtn?.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('filterCalendar', { bubbles: true }));
    });

    timeBtn?.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('filterTime', { bubbles: true }));
    });

    systemBtn?.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('filterSystem', { bubbles: true }));
    });

    directionBtn?.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('filterDirection', { bubbles: true }));
    });

    const clearBtn = this.querySelector('#clear-filters-btn');
    clearBtn?.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('clearFilters', { bubbles: true }));
    });
  }
}

customElements.define('map-controls', MapControls);
