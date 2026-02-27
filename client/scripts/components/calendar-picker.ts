/**
 * Calendar Picker Panel Component
 * A reusable calendar picker panel for selecting dates
 * Used for Calendar Filter in VisRoute feature (Basic Flow steps 11-14)
 */

export interface IDateSelection {
  date: Date;
}

export interface ICalendarPickerElement extends HTMLElement {
  show(): void;
  hide(): void;
  toggle(): void;
  isOpen(): boolean;
}

export class CalendarPickerPanel extends HTMLElement implements ICalendarPickerElement {
  private currentDate = new Date();
  private selectedDate: Date | null = null;
  private isVisible = false;

  constructor() {
    super();
  }

  connectedCallback(): void {
    this.render();
  }

  /**
   * Show the calendar picker panel
   */
  show(): void {
    const panel = this.querySelector('.calendar-picker-panel') as HTMLElement;
    if (panel) {
      console.log('Showing calendar picker panel');
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
   * Hide the calendar picker panel
   */
  hide(): void {
    const panel = this.querySelector('.calendar-picker-panel') as HTMLElement;
    if (panel) {
      console.log('Hiding calendar picker panel');
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

  private render(): void {
    const month = this.currentDate.getMonth();
    const year = this.currentDate.getFullYear();
    const monthName = this.currentDate.toLocaleString('default', { month: 'long' });

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

    this.innerHTML = `
      <div class="calendar-picker-panel panel" style="display: none;">
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
        const selectedDay = Number((e.currentTarget as HTMLElement).dataset.day);
        this.selectedDate = new Date(
          this.currentDate.getFullYear(),
          this.currentDate.getMonth(),
          selectedDay
        );
        this.render();
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
