/**
 * Dark Mode Toggle Component
 * Allows users to switch between light and dark map themes
 */
export class DarkToggle extends HTMLElement {
  private isDark = false;

  connectedCallback(): void {
    // Check for saved theme preference
    const savedTheme = localStorage.getItem('theme');
    this.isDark = savedTheme === 'dark';

    this.innerHTML = `
      <button class="dark-btn circle-btn" id="dark-mode-btn" title="Toggle Dark Mode">
        <span class="material-icons-outlined">${this.isDark ? 'light_mode' : 'dark_mode'}</span>
      </button>
    `;

    // Apply saved theme
    if (this.isDark) {
      document.body.classList.add('dark');
    }

    // Add click listener
    const btn = this.querySelector('#dark-mode-btn');
    btn?.addEventListener('click', () => {
      this.toggleTheme();
    });
  }

  private toggleTheme(): void {
    this.isDark = !this.isDark;
    document.body.classList.toggle('dark');
    
    // Update icon
    const icon = this.querySelector('.material-icons-outlined');
    if (icon) {
      icon.textContent = this.isDark ? 'light_mode' : 'dark_mode';
    }

    // Save preference
    localStorage.setItem('theme', this.isDark ? 'dark' : 'light');

    // Dispatch event for map theme changes
    this.dispatchEvent(new CustomEvent('themeChanged', { 
      detail: { isDark: this.isDark }, 
      bubbles: true 
    }));
  }
}

customElements.define('dark-toggle', DarkToggle);
