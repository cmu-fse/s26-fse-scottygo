// Export empty object to treat as module
export {};

console.log('Home page loaded');

// Menu toggle
const menuIcon = document.getElementById('menu-icon');
const dropdownMenu = document.getElementById('dropdown-menu');

menuIcon?.addEventListener('click', () => {
  menuIcon.classList.toggle('is-active');
  dropdownMenu?.classList.toggle('is-active');
});

// Logout
const menuLogoutBtn = document.getElementById('menu-logout-btn');

menuLogoutBtn?.addEventListener('click', () => {
  localStorage.removeItem('token');
  localStorage.removeItem('username');
  window.location.replace('/home');
});
