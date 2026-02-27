/**
 * Transit Search Component
 * Provides search input and layer filter toggle for route visualization
 */
export class TransitSearch extends HTMLElement {
  connectedCallback(): void {
    this.innerHTML = `
      <div class="search-bar">
        <div class="search-box">
          <span class="material-icons-outlined">search</span>
          <input type="text" id="transit-search-input" placeholder="Search routes or stops" />
        </div>
        <button class="layers-btn" id="layers-btn" title="Toggle Layers">
          <span class="material-icons-outlined">layers</span>
        </button>
      </div>
    `;

    // Add event listeners
    const searchInput = this.querySelector('#transit-search-input') as HTMLInputElement;
    const layersBtn = this.querySelector('#layers-btn') as HTMLButtonElement;

    searchInput?.addEventListener('input', (e) => {
      const query = (e.target as HTMLInputElement).value;
      this.dispatchEvent(new CustomEvent('search', { detail: { query }, bubbles: true }));
    });

    layersBtn?.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('toggleLayers', { bubbles: true }));
    });
  }
}

customElements.define('transit-search', TransitSearch);
