/**
 * Bus Report Form Component
 * A multi-step modal form for reporting bus conditions.
 *
 * Usage:
 *   const form = document.querySelector('bus-report-form') as BusReportFormElement;
 *   form.open('6551', '71A');
 */

export interface BusReportFormElement extends HTMLElement {
  open(vid: string, routeId: string): void;
  close(): void;
}

const STEPS = [
  {
    id: 'crowding',
    question: 'How crowded is the bus?',
    options: ['Empty', 'Few Seats', 'Standing', 'Packed'],
    wrap: true
  },
  {
    id: 'priority-seating',
    question: 'Priority seating available?',
    options: ['Yes', 'No', 'Not Sure'],
    wrap: false
  },
  {
    id: 'condition',
    question: 'Condition of the bus?',
    options: ['Clean', 'Average', 'Dirty'],
    wrap: false
  },
  {
    id: 'comments',
    question: 'Any comments?',
    options: [],
    wrap: false
  }
] as const;

const TOTAL_STEPS = STEPS.length;

class BusReportForm extends HTMLElement implements BusReportFormElement {
  private currentStep = 1;
  private answers: Partial<Record<string, string>> = {};
  private vid = '';
  private routeId = '';

  connectedCallback(): void {
    this.render();
    this.setupListeners();
    this.setAttribute('inert', '');
  }

  open(vid: string, routeId: string): void {
    this.vid = vid;
    this.routeId = routeId;
    this.currentStep = 1;
    this.answers = {};
    this.render();
    this.setupListeners();
    this.removeAttribute('inert');
    this.classList.add('is-open');
  }

  close(): void {
    this.classList.remove('is-open');
    this.setAttribute('inert', '');
  }

  private render(): void {
    const step = STEPS[this.currentStep - 1];
    const isFirstStep = this.currentStep === 1;
    const isLastStep = this.currentStep === TOTAL_STEPS;

    this.innerHTML = `
      <div class="bus-report-backdrop">
        <div class="bus-report" role="dialog" aria-modal="true" aria-label="Bus Report">
          <div class="bus-report__header">
            <strong class="bus-report__title">Bus Report</strong>
            <p class="bus-report__subtitle">Bus ${this.vid} &middot; Route ${this.routeId}</p>
          </div>
          <div class="bus-report__progress">
            ${Array.from({ length: TOTAL_STEPS }, (_, i) =>
              `<div class="bus-report__bar${i < this.currentStep ? ' bus-report__bar--filled' : ''}"></div>`
            ).join('')}
          </div>
          <div class="bus-report__body">
            ${this.renderStepContent(step)}
          </div>
          <div class="bus-report__nav">
            <button
              class="bus-report__nav-btn bus-report__nav-btn--back"
              id="bus-report-back"
              ${isFirstStep ? 'disabled' : ''}
              aria-label="Previous step"
            >&#8249;</button>
            <button class="bus-report__nav-btn bus-report__nav-btn--skip" id="bus-report-skip">Skip</button>
            <button class="bus-report__nav-btn bus-report__nav-btn--next" id="bus-report-next">
              ${isLastStep ? 'Submit' : 'Next &#8250;'}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private renderStepContent(step: (typeof STEPS)[number]): string {
    if (step.id === 'comments') {
      const saved = this.answers['comments'] ?? '';
      const count = saved.length;
      return `
        <p class="bus-report__question">${step.question}</p>
        <p class="bus-report__hint">Optional &middot; max 200 characters</p>
        <textarea
          class="bus-report__textarea"
          id="bus-report-comment"
          placeholder="Add a note..."
          maxlength="200"
        >${saved}</textarea>
        <p class="bus-report__char-count"><span id="bus-report-char-count">${count}</span> / 200</p>
      `;
    }

    const selected = this.answers[step.id];
    const optionsHtml = step.options
      .map((opt) => {
        const val = opt.toLowerCase().replace(/\s+/g, '-');
        const active = selected === val ? ' bus-report__option--active' : '';
        return `<button class="bus-report__option${active}" data-value="${val}">${opt}</button>`;
      })
      .join('');

    return `
      <p class="bus-report__question">${step.question}</p>
      <div class="bus-report__options${step.wrap ? ' bus-report__options--wrap' : ''}">
        ${optionsHtml}
      </div>
    `;
  }

  private setupListeners(): void {
    // Option selection
    this.addEventListener('click', (e: Event) => {
      const target = e.target as HTMLElement;
      const option = target.closest<HTMLElement>('.bus-report__option');
      if (option && option.dataset.value) {
        const step = STEPS[this.currentStep - 1];
        this.answers[step.id] = option.dataset.value;
        this.querySelectorAll('.bus-report__option').forEach((btn) =>
          btn.classList.remove('bus-report__option--active')
        );
        option.classList.add('bus-report__option--active');
      }
    });

    // Char counter for comments step
    this.addEventListener('input', (e: Event) => {
      const textarea = e.target as HTMLTextAreaElement;
      if (textarea.id === 'bus-report-comment') {
        const counter = this.querySelector('#bus-report-char-count');
        if (counter) counter.textContent = String(textarea.value.length);
        this.answers['comments'] = textarea.value;
      }
    });

    // Back
    this.querySelector('#bus-report-back')?.addEventListener('click', () => {
      if (this.currentStep > 1) {
        this.currentStep--;
        this.render();
        this.setupListeners();
      }
    });

    // Skip
    this.querySelector('#bus-report-skip')?.addEventListener('click', () => {
      this.advanceOrSubmit();
    });

    // Next / Submit
    this.querySelector('#bus-report-next')?.addEventListener('click', () => {
      if (this.currentStep === TOTAL_STEPS) {
        this.submitReport();
      } else {
        this.advanceOrSubmit();
      }
    });

    // Close on backdrop click
    this.querySelector('.bus-report-backdrop')?.addEventListener('click', (e: Event) => {
      if (e.target === e.currentTarget) this.close();
    });
  }

  private advanceOrSubmit(): void {
    if (this.currentStep < TOTAL_STEPS) {
      this.currentStep++;
      this.render();
      this.setupListeners();
    } else {
      this.submitReport();
    }
  }

  private submitReport(): void {
    const payload = {
      vid: this.vid,
      routeId: this.routeId,
      ...this.answers
    };
    this.dispatchEvent(
      new CustomEvent('busReportSubmitted', { detail: payload, bubbles: true })
    );
    this.close();
  }
}

customElements.define('bus-report-form', BusReportForm);
