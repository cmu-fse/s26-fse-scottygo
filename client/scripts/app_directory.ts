// Export empty object to treat as module
export {};

const clearAuth = (): void => {
  sessionStorage.removeItem('token');
  localStorage.removeItem('token');
  localStorage.removeItem('username');
};

const isLoggedIn = (): boolean => {
  return localStorage.getItem('token') !== null;
};

const getUsername = (): string | null => {
  return localStorage.getItem('username');
};

const logoutBtn = document.getElementById(
  'logout-btn'
) as HTMLButtonElement | null;

const updateAuthUI = () => {
  if (!isLoggedIn()) {
    window.location.href = 'home.html';
    return;
  }
};


const handleLogout = () => {
  clearAuth();
  window.location.href = 'home.html';
};

updateAuthUI();

logoutBtn?.addEventListener('click', handleLogout);

console.log('App directory page loaded');
