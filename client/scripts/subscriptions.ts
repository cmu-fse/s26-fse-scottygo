export {};

import './components/app-header';
import './components/live-notifications';

const MAX_SUBSCRIPTIONS = 10;

interface Subscription {
  routeId: string;
  routeName: string;
  lastUpdated: string;
  muted: boolean;
}

interface Route {
  routeId: string;
  routeName: string;
  destination: string;
}

// Placeholder data — replace with real API calls
const subscriptions: Subscription[] = [
  { routeId: '71a', routeName: 'Route 71A', lastUpdated: '2m ago', muted: false },
  { routeId: '71b', routeName: 'Route 71B', lastUpdated: '10m ago', muted: false },
  { routeId: '61c', routeName: 'Route 61C', lastUpdated: '1m ago', muted: true },
  { routeId: '61a', routeName: 'Route 61A', lastUpdated: '1m ago', muted: false },
];

// Placeholder route list — replace with real API call
const allRoutes: Route[] = [
  { routeId: '61a', routeName: 'Route 61A', destination: 'Downtown → Oakland' },
  { routeId: '61b', routeName: 'Route 61B', destination: 'Downtown → Squirrel Hill' },
  { routeId: '61c', routeName: 'Route 61C', destination: 'Braddock → Downtown' },
  { routeId: '71a', routeName: 'Route 71A', destination: 'Downtown → Point Breeze' },
  { routeId: '71b', routeName: 'Route 71B', destination: 'Downtown → Swissvale' },
  { routeId: '28x', routeName: 'Route 28X', destination: 'Airport → Downtown' },
  { routeId: '54', routeName: 'Route 54', destination: 'Downtown → Lawrenceville' },
];

const busIconSVG = `
  <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
    <path d="M240-120q-17 0-28.5-11.5T200-160v-82q-18-20-29-44.5T160-340v-380q0-83 77-121.5T480-880q172 0 246 37t74 123v380q0 29-11 53.5T760-242v82q0 17-11.5 28.5T720-120h-40q-17 0-28.5-11.5T640-160v-40H320v40q0 17-11.5 28.5T280-120h-40Zm242-640h224-448 224Zm158 280H240h480-80Zm-400-80h480v-120H240v120Zm142.5 222.5Q400-355 400-380t-17.5-42.5Q365-440 340-440t-42.5 17.5Q280-405 280-380t17.5 42.5Q315-320 340-320t42.5-17.5Zm280 0Q680-355 680-380t-17.5-42.5Q645-440 620-440t-42.5 17.5Q560-405 560-380t17.5 42.5Q595-320 620-320t42.5-17.5ZM258-760h448q-15-17-64.5-28.5T482-800q-107 0-156.5 12.5T258-760Zm62 480h320q33 0 56.5-23.5T720-360v-120H240v120q0 33 23.5 56.5T320-280Z"/>
  </svg>`;

const bellOnSVG = `
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
    <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
  </svg>`;

const bellOffSVG = `
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
    <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
    <line x1="1" y1="1" x2="23" y2="23"></line>
  </svg>`;

const chevronSVG = `
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="9 18 15 12 9 6"></polyline>
  </svg>`;

const xSVG = `
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>`;

function updateCount(): void {
  const btn = document.getElementById('add-route-btn') as HTMLButtonElement;
  const labelEl = btn.querySelector('span:first-child')!;
  const countEl = document.getElementById('route-count')!;
  const dividerEl = btn.querySelector('.add-route-divider') as HTMLElement;
  const atLimit = subscriptions.length >= MAX_SUBSCRIPTIONS;

  countEl.textContent = `${subscriptions.length}/${MAX_SUBSCRIPTIONS}`;
  labelEl.textContent = atLimit ? 'Limit reached' : '+ Add route';
  dividerEl.style.display = atLimit ? 'none' : '';
  btn.classList.toggle('is-disabled', atLimit);
}

function createCard(sub: Subscription): HTMLLIElement {
  const li = document.createElement('li');
  li.classList.add('subscription-card');
  li.dataset.routeId = sub.routeId;

  li.innerHTML = `
    <div class="card-icon-circle">${busIconSVG}</div>
    <div class="card-info">
      <a class="card-route-link" href="/route/${sub.routeId}">
        ${sub.routeName} ${chevronSVG}
      </a>
      <div class="card-last-updated">updated ${sub.lastUpdated}</div>
    </div>
    <div class="card-actions">
      <button class="card-bell ${sub.muted ? 'muted' : ''}" aria-label="${sub.muted ? 'Unmute' : 'Mute'} notifications">
        ${sub.muted ? bellOffSVG : bellOnSVG}
      </button>
      <button class="card-remove" aria-label="Remove subscription">${xSVG}</button>
    </div>
  `;

  li.querySelector<HTMLButtonElement>('.card-remove')!.addEventListener('click', () => {
    const idx = subscriptions.findIndex((s) => s.routeId === sub.routeId);
    if (idx !== -1) subscriptions.splice(idx, 1);
    li.remove();
    updateCount();
    renderSheetResults(
      (document.getElementById('route-search-input') as HTMLInputElement).value,
    );
  });

  const bellBtn = li.querySelector<HTMLButtonElement>('.card-bell')!;
  bellBtn.addEventListener('click', () => {
    sub.muted = !sub.muted;
    bellBtn.classList.toggle('muted', sub.muted);
    bellBtn.innerHTML = sub.muted ? bellOffSVG : bellOnSVG;
    bellBtn.setAttribute('aria-label', `${sub.muted ? 'Unmute' : 'Mute'} notifications`);
  });

  return li;
}

function renderList(): void {
  const list = document.getElementById('subscription-list')!;
  list.innerHTML = '';
  subscriptions.forEach((sub) => list.appendChild(createCard(sub)));
  updateCount();
}

function renderSheetResults(query: string): void {
  const results = document.getElementById('sheet-results')!;
  const filtered = query
    ? allRoutes.filter((r) => r.routeName.toLowerCase().includes(query.toLowerCase()))
    : allRoutes;

  results.innerHTML = '';
  filtered.forEach((route) => {
    const isSubscribed = subscriptions.some((s) => s.routeId === route.routeId);
    const li = document.createElement('li');
    li.classList.add('sheet-result-item');
    li.innerHTML = `
      <div class="result-icon-circle">${busIconSVG}</div>
      <div class="result-info">
        <div class="result-name">${route.routeName}</div>
        <div class="result-destination">${route.destination}</div>
      </div>
      <button class="result-add-btn ${isSubscribed ? 'subscribed' : ''}" aria-label="${isSubscribed ? 'Remove' : 'Add'} ${route.routeName}">
        +
      </button>
    `;

    const addBtn = li.querySelector<HTMLButtonElement>('.result-add-btn')!;
    addBtn.addEventListener('click', () => {
      const idx = subscriptions.findIndex((s) => s.routeId === route.routeId);
      if (idx !== -1) {
        subscriptions.splice(idx, 1);
      } else if (subscriptions.length < MAX_SUBSCRIPTIONS) {
        subscriptions.push({ routeId: route.routeId, routeName: route.routeName, lastUpdated: 'just now', muted: false });
      }
      renderList();
      renderSheetResults(query);
    });

    results.appendChild(li);
  });
}

function initSheet(): void {
  const addBtn = document.getElementById('add-route-btn')!;
  const overlay = document.getElementById('sheet-overlay')!;
  const sheet = document.getElementById('bottom-sheet')!;
  const input = document.getElementById('route-search-input') as HTMLInputElement;

  function openSheet(): void {
    overlay.classList.add('is-active');
    sheet.classList.add('is-active');
    renderSheetResults('');
    input.focus();
  }

  function closeSheet(): void {
    overlay.classList.remove('is-active');
    sheet.classList.remove('is-active');
    input.value = '';
  }

  addBtn.addEventListener('click', () => {
    if (subscriptions.length >= MAX_SUBSCRIPTIONS) return;
    openSheet();
  });
  overlay.addEventListener('click', closeSheet);
  input.addEventListener('input', () => renderSheetResults(input.value.trim()));
}

renderList();
initSheet();
