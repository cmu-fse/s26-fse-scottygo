/**
 * Time Picker Panel Component
 * A reusable time picker panel for selecting time
 * Used for Time Filter in VisRoute feature (Basic Flow steps 15-18)
 */
//TODO esnure input for se

import {
  hidePanel,
  showPanel,
  togglePanelVisibility,
  getPanelRenderStyles,
  restoreVisibleClass
} from './panel-visibility';

export interface ITimeSelection {
  hour: number;
  minute: number;
  period: 'AM' | 'PM';
}

export interface ITimePickerElement extends HTMLElement {
  show(): void;
  hide(): void;
  toggle(): void;
  isOpen(): boolean;
}

export class TimePickerPanel extends HTMLElement implements ITimePickerElement {
  private hour = 12;
  private minute = 0;
  private period: 'AM' | 'PM' = 'PM';
  private isVisible = false;

  constructor() {
    super();
    // Initialize with current time
    const now = new Date();
    const currentHour = now.getHours();
    this.minute = now.getMinutes();

    // Convert to 12-hour format
    if (currentHour === 0) {
      this.hour = 12;
      this.period = 'AM';
    } else if (currentHour < 12) {
      this.hour = currentHour;
      this.period = 'AM';
    } else if (currentHour === 12) {
      this.hour = 12;
      this.period = 'PM';
    } else {
      this.hour = currentHour - 12;
      this.period = 'PM';
    }
  }

  connectedCallback(): void {
    this.render();
    // Add stopPropagation at the component level to prevent any clicks from bubbling
    this.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  /**
   * Show the time picker panel
   */
  show(): void {
    showPanel(
      this,
      {
        selector: '.time-picker-panel',
        managePointerEvents: true,
        debugName: 'time picker panel'
      },
      (visible) => {
        this.isVisible = visible;
      }
    );
  }

  /**
   * Hide the time picker panel
   */
  hide(): void {
    hidePanel(
      this,
      {
        selector: '.time-picker-panel',
        managePointerEvents: true,
        debugName: 'time picker panel'
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
    const { displayStyle, pointerEvents } = getPanelRenderStyles(this.isVisible);

    this.innerHTML = `
      <div class="time-picker-panel panel" style="display: ${displayStyle}; pointer-events: ${pointerEvents};">
        <h3 class="panel-title">Select Time</h3>

        <div class="digital">
          <div class="time-box" id="hour-box">
            <input type="number" class="time-input" id="hour-input" min="1" max="12" value="${this.hour}" />
          </div>
          <div class="colon">:</div>
          <div class="time-box" id="minute-box">
            <input type="number" class="time-input" id="minute-input" min="0" max="59" value="${this.format(this.minute)}" />
          </div>
        </div>

        <div class="period">
          <button class="period-btn ${this.period === 'AM' ? 'active' : ''}" data-period="AM">AM</button>
          <button class="period-btn ${this.period === 'PM' ? 'active' : ''}" data-period="PM">PM</button>
        </div>

        <div class="clock">
          ${this.renderClock()}
        </div>

        <div class="filter-actions">
          <button class="filter-btn cancel-btn" id="time-cancel">Cancel</button>
          <button class="filter-btn ok-btn" id="time-ok">OK</button>
        </div>
      </div>
    `;

    restoreVisibleClass(this, '.time-picker-panel', this.isVisible);

    this.attachEvents();
  }

  private renderClock(): string {
    const numbers = [];
    const center = 90;
    const radius = 70;

    for (let i = 1; i <= 12; i++) {
      const angle = (i - 3) * (Math.PI / 6);
      const x = center + radius * Math.cos(angle);
      const y = center + radius * Math.sin(angle);

      numbers.push(`
        <div 
          class="clock-number ${this.hour === i ? 'active' : ''}" 
          data-hour="${i}"
          style="left:${x}px; top:${y}px;"
        >
          ${i}
        </div>
      `);
    }

    return numbers.join('');
  }

  private attachEvents(): void {
    // Hour input
    const hourInput = this.querySelector('#hour-input') as HTMLInputElement;
    hourInput?.addEventListener('input', (e) => {
      e.stopPropagation();
      let value = parseInt((e.target as HTMLInputElement).value);
      if (value < 1) value = 1;
      if (value > 12) value = 12;
      this.hour = value;
      (e.target as HTMLInputElement).value = value.toString();
      this.updateClock();
    });

    hourInput?.addEventListener('blur', (e) => {
      (e.target as HTMLInputElement).value = this.hour.toString();
    });

    // Minute input
    const minuteInput = this.querySelector('#minute-input') as HTMLInputElement;
    minuteInput?.addEventListener('input', (e) => {
      e.stopPropagation();
      let value = parseInt((e.target as HTMLInputElement).value);
      if (isNaN(value) || value < 0) value = 0;
      if (value > 59) value = 59;
      this.minute = value;
      (e.target as HTMLInputElement).value = this.format(value);
    });

    minuteInput?.addEventListener('blur', (e) => {
      (e.target as HTMLInputElement).value = this.format(this.minute);
    });

    // Hour selection from clock
    this.querySelectorAll('.clock-number').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const hour = Number((e.currentTarget as HTMLElement).dataset.hour);
        this.hour = hour;
        this.updateDigital();
        this.updateClock();
      });
    });

    // AM/PM toggle
    this.querySelectorAll('[data-period]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.period = (e.currentTarget as HTMLElement).dataset.period as
          | 'AM'
          | 'PM';
        this.updatePeriod();
      });
    });

    // Cancel button
    this.querySelector('#time-cancel')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hide();
    });

    // OK button - dispatch timeSelected event
    this.querySelector('#time-ok')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const timeSelection: ITimeSelection = {
        hour: this.hour,
        minute: this.minute,
        period: this.period
      };

      this.dispatchEvent(
        new CustomEvent('timeSelected', {
          detail: timeSelection,
          bubbles: true
        })
      );

      this.hide();
    });
  }

  private format(n: number): string {
    return n.toString().padStart(2, '0');
  }

  /**
   * Update digital display without re-rendering entire panel
   */
  private updateDigital(): void {
    const hourInput = this.querySelector('#hour-input') as HTMLInputElement;
    const minuteInput = this.querySelector('#minute-input') as HTMLInputElement;
    if (hourInput) hourInput.value = this.hour.toString();
    if (minuteInput) minuteInput.value = this.format(this.minute);
  }

  /**
   * Update clock display without re-rendering entire panel
   */
  private updateClock(): void {
    this.querySelectorAll('.clock-number').forEach((el) => {
      const hour = Number((el as HTMLElement).dataset.hour);
      if (hour === this.hour) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });
  }

  /**
   * Update period buttons without re-rendering entire panel
   */
  private updatePeriod(): void {
    this.querySelectorAll('.period-btn').forEach((btn) => {
      const period = (btn as HTMLElement).dataset.period;
      if (period === this.period) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }
}

customElements.define('time-picker-panel', TimePickerPanel);
