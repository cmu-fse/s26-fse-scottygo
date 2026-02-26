/**
 * Zoom Controls Component
 * Provides zoom in/out buttons for map navigation
 */
export class ZoomControls extends HTMLElement {
  connectedCallback(): void {
    this.innerHTML = `
      <div class="zoom-panel">
        <button class="circle-btn" id="zoom-in-btn" title="Zoom In">
          <span class="material-icons-outlined">add</span>
        </button>
        <button class="circle-btn" id="zoom-out-btn" title="Zoom Out">
          <span class="material-icons-outlined">remove</span>
        </button>
      </div>
    `;

    // Add event listeners
    const zoomInBtn = this.querySelector('#zoom-in-btn');
    const zoomOutBtn = this.querySelector('#zoom-out-btn');

    zoomInBtn?.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('zoomIn', { bubbles: true }));
    });

    zoomOutBtn?.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('zoomOut', { bubbles: true }));
    });
  }
}

customElements.define('zoom-controls', ZoomControls);
