/**
 * App Header Component
 * Renders the top navigation bar with optional back button and hamburger menu.
 *
 * Attributes:
 *   back  - Boolean attribute. If present, shows a back button that navigates to the previous page.
 */
export class AppHeader extends HTMLElement {
  connectedCallback(): void {
    this.classList.add('app-header');

    const showBack = this.hasAttribute('back');

    const backButton = showBack
      ? `<a href="#" class="back-icon" id="back-icon" aria-label="Go back">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M20 11H7.83L13.42 5.41L12 4L4 12L12 20L13.41 18.59L7.83 13H20V11Z" fill="white"/>
          </svg>
        </a>`
      : '';

    this.innerHTML = `
      ${backButton}
      <div class="menu-icon" id="menu-icon">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <nav class="dropdown-menu" id="dropdown-menu">
        <div class="dropdown-header">
          <a href="/" class="dropdown-title-link"><h2>ScottyGo</h2></a>
        </div>
        <div class="dropdown-grid">
          <a href="/subscriptions" class="dropdown-item">
            <div class="icon-circle">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
              </svg>
            </div>
            <span>Subscribed</span>
          </a>
          <a href="/notifications" class="dropdown-item">
            <div class="icon-circle">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
              </svg>
            </div>
            <span>Notifications</span>
          </a>
          <a href="/account" class="dropdown-item">
            <div class="icon-circle">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
            </div>
            <span>Manage Account</span>
          </a>
          <a href="#" class="dropdown-item" id="menu-logout-btn">
            <div class="icon-circle">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
              </svg>
            </div>
            <span>Log out</span>
          </a>
        </div>
      </nav>
    `;

    const menuIcon = this.querySelector<HTMLElement>('#menu-icon');
    const dropdownMenu = this.querySelector<HTMLElement>('#dropdown-menu');
    const backIcon = this.querySelector<HTMLElement>('#back-icon');
    const logoutBtn = this.querySelector<HTMLElement>('#menu-logout-btn');

    menuIcon?.addEventListener('click', () => {
      menuIcon.classList.toggle('is-active');
      dropdownMenu?.classList.toggle('is-active');
      backIcon?.classList.toggle('is-hidden');
    });

    backIcon?.addEventListener('click', (e) => {
      e.preventDefault();
      history.back();
    });

    logoutBtn?.addEventListener('click', () => {
      localStorage.removeItem('token');
      localStorage.removeItem('username');
      window.location.replace('/auth');
    });
  }
}

customElements.define('app-header', AppHeader);
