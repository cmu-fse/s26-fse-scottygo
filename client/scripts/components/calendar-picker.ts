/**
 * Calendar Picker Panel Component
 * A reusable calendar picker panel for selecting dates
 * Used for Calendar Filter in VisRoute feature (Basic Flow steps 11-14)
 */

import {
  hidePanel,
  showPanel,
  togglePanelVisibility
} from './panel-visibility';

export interface IDateSelection {
  date: Date;
}

export interface ICalendarPickerElement extends HTMLElement {
  show(): void;
  hide(): void;
  toggle(): void;
  isOpen(): boolean;
}

export class CalendarPickerPanel
  extends HTMLElement
  implements ICalendarPickerElement
{
  private currentDate = new Date();
  private selectedDate: Date | null = new Date(); // Default to today
  private isVisible = false;

  constructor() {
    super();
  }

  connectedCallback(): void {
    this.render();
    // Add stopPropagation at the component level to prevent any clicks from bubbling
    this.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  /**
   * Show the calendar picker panel
   */
  show(): void {
    showPanel(
      this,
      {
        selector: '.calendar-picker-panel',
        managePointerEvents: true,
        debugName: 'calendar picker panel'
      },
      (visible) => {
        this.isVisible = visible;
      }
    );
  }

  /**
   * Hide the calendar picker panel
   */
  hide(): void {
    hidePanel(
      this,
      {
        selector: '.calendar-picker-panel',
        managePointerEvents: true,
        debugName: 'calendar picker panel'
      },
      (visible) => {
        this.isVisible = visible;
      }
    );
  }

  /**
   * Toggle panel visibility
   */
  toggle(): void {
    togglePanelVisibility(
      this.isVisible,
      this.hide.bind(this),
      this.show.bind(this)
    );
  }

  /**
   * Check if panel is open
   */
  isOpen(): boolean {
    return this.isVisible;
  }

  private render(): void {
    const month = this.currentDate.getMonth();
    const year = this.currentDate.getFullYear();
    const monthName = this.currentDate.toLocaleString('default', {
      month: 'long'
    });

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    let daysHTML = '';

    // Previous month spillover
    for (let i = firstDay - 1; i >= 0; i--) {
      daysHTML += `<div class="cal-day muted">${daysInPrevMonth - i}</div>`;
    }

    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
      const isSelected =
        this.selectedDate &&
        this.selectedDate.getDate() === d &&
        this.selectedDate.getMonth() === month &&
        this.selectedDate.getFullYear() === year;

      daysHTML += `
        <div class="cal-day ${isSelected ? 'selected' : ''}" data-day="${d}">
          ${d}
        </div>
      `;
    }

    // Preserve display and pointer-events styles if panel is currently visible
    const displayStyle = this.isVisible ? 'block' : 'none';
    const pointerEvents = this.isVisible ? 'auto' : 'none';

    this.innerHTML = `
      <div class="calendar-picker-panel panel" style="display: ${displayStyle}; pointer-events: ${pointerEvents};">
        <div class="cal-header">
          <button class="cal-nav-btn" id="cal-prev">
            <span class="material-icons-outlined">chevron_left</span>
          </button>
          <div class="cal-month-year">
            ${monthName} ${year}
          </div>
          <button class="cal-nav-btn" id="cal-next">
            <span class="material-icons-outlined">chevron_right</span>
          </button>
        </div>

        <div class="cal-weekdays">
          <div>Su</div><div>Mo</div><div>Tu</div>
          <div>We</div><div>Th</div><div>Fr</div><div>Sa</div>
        </div>

        <div class="cal-grid">
          ${daysHTML}
        </div>

        <div class="filter-actions">
          <button class="filter-btn cancel-btn" id="cal-cancel">Cancel</button>
          <button class="filter-btn ok-btn" id="cal-ok">OK</button>
        </div>
      </div>
    `;

    // Re-apply the visible class if panel is currently visible
    if (this.isVisible) {
      const panel = this.querySelector('.calendar-picker-panel') as HTMLElement;
      if (panel) {
        panel.classList.add('visible');
      }
    }

    this.attachEvents();
  }

  private attachEvents(): void {
    // Previous month button
    this.querySelector('#cal-prev')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.currentDate.setMonth(this.currentDate.getMonth() - 1);
      this.render();
    });

    // Next month button
    this.querySelector('#cal-next')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.currentDate.setMonth(this.currentDate.getMonth() + 1);
      this.render();
    });

    // Day selection
    this.querySelectorAll('.cal-day:not(.muted)').forEach((day) => {
      day.addEventListener('click', (e) => {
        e.stopPropagation();
        const selectedDay = Number(
          (e.currentTarget as HTMLElement).dataset.day
        );
        this.selectedDate = new Date(
          this.currentDate.getFullYear(),
          this.currentDate.getMonth(),
          selectedDay
        );
        // Update selected state without full re-render to avoid flicker
        this.querySelectorAll('.cal-day').forEach((d) =>
          d.classList.remove('selected')
        );
        (e.currentTarget as HTMLElement).classList.add('selected');
      });
    });

    // Cancel button
    this.querySelector('#cal-cancel')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hide();
    });

    // OK button - dispatch dateSelected event
    this.querySelector('#cal-ok')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.selectedDate) {
        const dateSelection: IDateSelection = {
          date: this.selectedDate
        };

        this.dispatchEvent(
          new CustomEvent('dateSelected', {
            detail: dateSelection,
            bubbles: true
          })
        );
      }

      this.hide();
    });
  }
}

customElements.define('calendar-picker-panel', CalendarPickerPanel);
