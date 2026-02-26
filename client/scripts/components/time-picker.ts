/**
 * Time Picker Panel Component
 * A reusable time picker panel for selecting time
 * Used for Time Filter in VisRoute feature (Basic Flow steps 15-18)
 */

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
  private hour = 7;
  private minute = 0;
  private period: 'AM' | 'PM' = 'AM';
  private isVisible = false;

  constructor() {
    super();
  }

  connectedCallback(): void {
    this.render();
  }

  /**
   * Show the time picker panel
   */
  show(): void {
    const panel = this.querySelector('.time-picker-panel') as HTMLElement;
    if (panel) {
      console.log('Showing time picker panel');
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
   * Hide the time picker panel
   */
  hide(): void {
    const panel = this.querySelector('.time-picker-panel') as HTMLElement;
    if (panel) {
      console.log('Hiding time picker panel');
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
    this.innerHTML = `
      <div class="time-picker-panel panel" style="display: none;">
        <h3 class="panel-title">Select Time</h3>

        <div class="digital">
          <div class="time-box" id="hour-box">
            <span>${this.format(this.hour)}</span>
          </div>
          <div class="colon">:</div>
          <div class="time-box" id="minute-box">
            <span>${this.format(this.minute)}</span>
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
    // Hour selection from clock
    this.querySelectorAll('.clock-number').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const hour = Number((e.currentTarget as HTMLElement).dataset.hour);
        this.hour = hour;
        this.render();
      });
    });

    // AM/PM toggle
    this.querySelectorAll('[data-period]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.period = (e.currentTarget as HTMLElement).dataset.period as 'AM' | 'PM';
        this.render();
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
}

customElements.define('time-picker-panel', TimePickerPanel);
