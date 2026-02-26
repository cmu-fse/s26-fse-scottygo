/**
 * Location Indicator Component
 * Shows the user's current location on the map with a pulsing animation
 */
export class LocationIndicator extends HTMLElement {
  private isVisible = false;

  connectedCallback(): void {
    this.innerHTML = `
      <div class="location-dot" style="display: none;">
        <div class="pulse"></div>
      </div>
    `;
  }

  /**
   * Show the location indicator at specified coordinates
   * @param lat Latitude
   * @param lng Longitude
   */
  show(lat?: number, lng?: number): void {
    const dot = this.querySelector('.location-dot') as HTMLElement;
    if (dot) {
      dot.style.display = 'block';
      this.isVisible = true;
      // Position will be managed by map provider based on lat/lng
      this.dispatchEvent(new CustomEvent('locationShown', { 
        detail: { lat, lng }, 
        bubbles: true 
      }));
    }
  }

  /**
   * Hide the location indicator
   */
  hide(): void {
    const dot = this.querySelector('.location-dot') as HTMLElement;
    if (dot) {
      dot.style.display = 'none';
      this.isVisible = false;
    }
  }

  /**
   * Check if location indicator is visible
   */
  getVisibility(): boolean {
    return this.isVisible;
  }
}

customElements.define('location-indicator', LocationIndicator);
