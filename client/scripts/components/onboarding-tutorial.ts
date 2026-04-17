/**
 * Onboarding Tutorial Component
 * A spotlight-based walkthrough that highlights map page components
 * one at a time with descriptive popups.
 */

export interface ITutorialStep {
  targetSelector: string;
  title: string;
  description: string;
  position: 'top' | 'bottom' | 'left' | 'right';
}

export interface IOnboardingTutorialElement extends HTMLElement {
  start(): void;
}

const TUTORIAL_STEPS: ITutorialStep[] = [
  {
    targetSelector: 'transit-search .search-bar',
    title: 'Search',
    description:
      'Search for routes or stops by name. You can also set a custom planned location.',
    position: 'bottom'
  },
  {
    targetSelector: '#route-filter-btn',
    title: 'Route Filter',
    description:
      'Tap here to browse and select a specific route to display on the map.',
    position: 'right'
  },
  {
    targetSelector: '#system-filter-btn',
    title: 'Transit System',
    description:
      'Toggle between Pittsburgh Regional Transit (PRT) and CMU Shuttle routes.',
    position: 'right'
  },
  {
    targetSelector: '#direction-filter-btn',
    title: 'Direction Filter',
    description:
      'Show only inbound, outbound, or both directions for the selected route.',
    position: 'right'
  },
  {
    targetSelector: '#clear-filters-btn',
    title: 'Clear Filters',
    description: 'Reset all active filters and return to the default map view.',
    position: 'right'
  },
  {
    targetSelector: '#menu-icon',
    title: 'Menu',
    description:
      'Open the menu to access your subscribed routes, notifications, manage your account, or log out.',
    position: 'bottom'
  },
  {
    targetSelector: 'route-bell',
    title: 'Route Notifications',
    description:
      'Select a route first, then tap the bell to subscribe and receive live notifications.',
    position: 'left'
  },
  {
    targetSelector: '.gm-style div[role="button"]',
    title: 'Stop Details',
    description:
      'Tap any stop marker on the map to see detailed stop info and real-time arrival predictions.',
    position: 'top'
  }
];

export class OnboardingTutorial
  extends HTMLElement
  implements IOnboardingTutorialElement
{
  private currentStep = 0;
  private overlay: HTMLDivElement | null = null;
  private popup: HTMLDivElement | null = null;
  private spotlightEl: HTMLDivElement | null = null;
  private active = false;

  start(): void {
    this.currentStep = 0;
    this.active = true;
    this.createOverlay();
    this.showStep();
  }

  private finish(): void {
    this.active = false;
    this.cleanup();
    this.dispatchEvent(new CustomEvent('tutorial-complete', { bubbles: true }));
  }

  private cleanup(): void {
    // Fade out then remove
    if (this.overlay) {
      this.overlay.classList.add('tutorial-fade-out');
      this.overlay.addEventListener(
        'animationend',
        () => {
          this.overlay?.remove();
          this.overlay = null;
        },
        { once: true }
      );
    }
    if (this.spotlightEl) {
      this.spotlightEl.remove();
      this.spotlightEl = null;
    }
    if (this.popup) {
      this.popup.remove();
      this.popup = null;
    }
  }

  private createOverlay(): void {
    this.overlay = document.createElement('div');
    this.overlay.className = 'tutorial-overlay';
    this.overlay.setAttribute('aria-hidden', 'true');
    document.body.appendChild(this.overlay);
  }

  private showStep(): void {
    if (!this.active) return;

    const step = TUTORIAL_STEPS[this.currentStep];
    if (!step) {
      this.finish();
      return;
    }

    let target = document.querySelector(
      step.targetSelector
    ) as HTMLElement | null;

    // For stop markers: fall back to the map center area if no marker is found
    if (!target && step.targetSelector.includes('role="button"')) {
      target = document.getElementById('map');
    }

    if (!target) {
      // Skip step if target doesn't exist
      this.currentStep++;
      this.showStep();
      return;
    }

    this.positionSpotlight(target);
    this.createPopup(step, target);
  }

  private positionSpotlight(target: HTMLElement): void {
    if (this.spotlightEl) this.spotlightEl.remove();

    this.spotlightEl = document.createElement('div');
    this.spotlightEl.className = 'tutorial-spotlight';
    document.body.appendChild(this.spotlightEl);

    const rect = target.getBoundingClientRect();
    const pad = 8;
    this.spotlightEl.style.top = `${rect.top - pad}px`;
    this.spotlightEl.style.left = `${rect.left - pad}px`;
    this.spotlightEl.style.width = `${rect.width + pad * 2}px`;
    this.spotlightEl.style.height = `${rect.height + pad * 2}px`;
  }

  private createPopup(step: ITutorialStep, target: HTMLElement): void {
    if (this.popup) this.popup.remove();

    const total = TUTORIAL_STEPS.length;
    const isLast = this.currentStep === total - 1;

    this.popup = document.createElement('div');
    this.popup.className = 'tutorial-popup';
    this.popup.setAttribute('role', 'dialog');
    this.popup.setAttribute('aria-modal', 'true');
    this.popup.innerHTML = `
      <p class="tutorial-popup__step">${this.currentStep + 1} of ${total}</p>
      <h3 class="tutorial-popup__title">${step.title}</h3>
      <p class="tutorial-popup__desc">${step.description}</p>
      <div class="tutorial-popup__actions">
        <span class="tutorial-popup__ok" tabindex="0" role="button">Ok</span>
        ${isLast ? '' : '<span class="tutorial-popup__dismiss" tabindex="0" role="button">Dismiss</span>'}
      </div>
    `;
    document.body.appendChild(this.popup);

    // Position the popup
    this.positionPopup(step.position, target);

    // Focus the ok action for keyboard accessibility
    const okBtn = this.popup.querySelector(
      '.tutorial-popup__ok'
    ) as HTMLElement;
    const dismissBtn = this.popup.querySelector(
      '.tutorial-popup__dismiss'
    ) as HTMLElement | null;

    okBtn?.focus();

    okBtn?.addEventListener('click', () => {
      if (isLast) {
        this.finish();
      } else {
        this.currentStep++;
        this.showStep();
      }
    });

    // Allow Enter/Space on spans for keyboard accessibility
    okBtn?.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        okBtn.click();
      }
    });

    dismissBtn?.addEventListener('click', () => {
      this.finish();
    });

    dismissBtn?.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        dismissBtn.click();
      }
    });

    // Trap focus within popup
    this.popup.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusables = this.popup?.querySelectorAll('[tabindex]') ?? [];
      if (focusables.length === 0) return;
      const first = focusables[0] as HTMLElement;
      const last = focusables[focusables.length - 1] as HTMLElement;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });
  }

  private positionPopup(
    preferred: 'top' | 'bottom' | 'left' | 'right',
    target: HTMLElement
  ): void {
    if (!this.popup) return;

    const rect = target.getBoundingClientRect();
    const gap = 16;

    // Temporarily make visible to measure
    this.popup.style.visibility = 'hidden';
    this.popup.style.top = '0';
    this.popup.style.left = '0';
    const popupRect = this.popup.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let top = 0;
    let left = 0;

    switch (preferred) {
      case 'bottom':
        top = rect.bottom + gap;
        left = rect.left + rect.width / 2 - popupRect.width / 2;
        break;
      case 'top':
        top = rect.top - gap - popupRect.height;
        left = rect.left + rect.width / 2 - popupRect.width / 2;
        break;
      case 'right':
        top = rect.top + rect.height / 2 - popupRect.height / 2;
        left = rect.right + gap;
        break;
      case 'left':
        top = rect.top + rect.height / 2 - popupRect.height / 2;
        left = rect.left - gap - popupRect.width;
        break;
    }

    // Clamp to viewport
    left = Math.max(12, Math.min(left, vw - popupRect.width - 12));
    top = Math.max(12, Math.min(top, vh - popupRect.height - 12));

    this.popup.style.top = `${top}px`;
    this.popup.style.left = `${left}px`;
    this.popup.style.visibility = 'visible';
  }
}

customElements.define('onboarding-tutorial', OnboardingTutorial);
