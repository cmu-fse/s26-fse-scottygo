// Export empty object to treat as module
export {};

import './components/app-header';
import './components/live-notifications';
import { io, Socket } from 'socket.io-client';
import type { INotification, IServiceAlert } from '../../common/transit.interface';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  ISearchSuggestion
} from '../../common/socket.interface';

// ── Auth ───────────────────────────────────────────────────────────────────────

function getToken(): string {
  return localStorage.getItem('token') ?? '';
}

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${getToken()}` };
}

// ── DOM refs ───────────────────────────────────────────────────────────────────

const list = document.getElementById('notif-list')!;
const emptyEl = document.getElementById('notif-empty')!;
const searchWrap = document.querySelector('.notif-search-wrap') as HTMLDivElement;
const searchInput = document.getElementById('notif-search-input') as HTMLInputElement;
const clearBtn = document.getElementById('notif-search-clear')!;
const suggestionsEl = document.getElementById(
  'notif-search-suggestions'
) as HTMLDivElement;

// ── State ──────────────────────────────────────────────────────────────────────

/** true while showing live notification search results (not alerts) */
let showingNotifications = false;
let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatTime(isoTimestamp: string): string {
  const mins = Math.round((Date.now() - new Date(isoTimestamp).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

function updateEmptyState(query?: string): void {
  const hasItems = list.children.length > 0;
  emptyEl.classList.toggle('is-visible', !hasItems);
  if (!hasItems && query) {
    emptyEl.textContent = `No results found for '${query}'.`;
  } else if (!hasItems) {
    emptyEl.textContent = 'No results found.';
  }
}

function normalizeSearchText(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function alertMatchesSearch(
  alert: IServiceAlert,
  params: { route?: string; bus?: string; q?: string }
): boolean {
  const routeQuery = normalizeSearchText(params.route);
  const busQuery = normalizeSearchText(params.bus);
  const textQuery = normalizeSearchText(params.q);

  const routeIds = alert.routeIds.map((id) => id.toLowerCase());
  const searchableText = [
    alert.headerText,
    alert.descriptionText,
    ...alert.routeIds
  ]
    .join(' ')
    .toLowerCase();

  if (routeQuery) {
    const matchesRoute =
      routeIds.some((id) => id.includes(routeQuery)) ||
      searchableText.includes(routeQuery);
    if (!matchesRoute) return false;
  }

  if (busQuery && !searchableText.includes(busQuery)) {
    return false;
  }

  if (textQuery && !searchableText.includes(textQuery)) {
    return false;
  }

  return true;
}

function hideSuggestions(): void {
  suggestionsEl.hidden = true;
  suggestionsEl.innerHTML = '';
}

const SUGGESTION_ICONS: Record<ISearchSuggestion['type'], string> = {
  route: 'directions_bus',
  vehicle: 'commute',
  alert: 'warning',
  notification: 'report'
};

function renderSuggestions(suggestions: ISearchSuggestion[]): void {
  const query = searchInput.value.trim();
  if (!query) {
    hideSuggestions();
    return;
  }

  suggestionsEl.innerHTML = '';
  suggestionsEl.hidden = false;

  if (suggestions.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'notif-search-no-suggestions';
    empty.textContent = 'No suggestions';
    suggestionsEl.appendChild(empty);
    return;
  }

  suggestions.forEach(({ label, type, routeId, vid }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'notif-search-suggestion';
    button.dataset.type = type;
    button.innerHTML = `
      <span class="material-icons-outlined notif-suggestion-icon" data-type="${type}">${SUGGESTION_ICONS[type]}</span>
      <span class="notif-suggestion-label">${label}</span>
    `;
    button.addEventListener('click', () => {
      hideSuggestions();

      if (type === 'notification' && (routeId || vid)) {
        // Search by the notification's route/bus IDs — avoids stop-word
        // mangling of the message text as a free-text query.
        const displayTerm = routeId ?? vid ?? label;
        searchInput.value = displayTerm;
        clearBtn.classList.add('is-visible');
        void searchNotifications({ route: routeId, bus: vid });
        return;
      }

      if (type === 'vehicle' && vid) {
        searchInput.value = vid;
        clearBtn.classList.add('is-visible');
        void searchNotifications({ bus: vid });
        return;
      }

      searchInput.value = label;
      clearBtn.classList.add('is-visible');
      void runFullSearch(label);
    });
    suggestionsEl.appendChild(button);
  });
}

// ── Notification cards ─────────────────────────────────────────────────────────

const NOTIF_ICON = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
  <line x1="12" y1="9" x2="12" y2="13"></line>
  <line x1="12" y1="17" x2="12.01" y2="17"></line>
</svg>`;

function createNotifCard(notif: INotification): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'notif-card';
  li.dataset.category = 'notification';

  li.innerHTML = `
    <button class="notif-dismiss" aria-label="Dismiss notification">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>
    <div class="notif-card-header">
      <span class="notif-icon" data-category="notification">${NOTIF_ICON}</span>
      <span class="notif-title">Route ${notif.routeId} · Bus #${notif.vid}</span>
    </div>
    <p class="notif-body">${notif.message}</p>
    <div class="notif-card-footer">
      <span class="notif-tag" data-category="notification">Live Update</span>
      <span class="notif-time">${formatTime(notif.createdAt)}</span>
    </div>
  `;

  li.querySelector<HTMLButtonElement>('.notif-dismiss')!.addEventListener('click', () => {
    li.remove();
    updateEmptyState(searchInput.value.trim() || undefined);
  });

  return li;
}

// ── Alert cards ────────────────────────────────────────────────────────────────

const ALERT_ICON = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="12" cy="12" r="10"></circle>
  <line x1="12" y1="8" x2="12" y2="12"></line>
  <line x1="12" y1="16" x2="12.01" y2="16"></line>
</svg>`;

function createAlertCard(alert: IServiceAlert): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'notif-card';
  li.dataset.category = 'alert';
  const routes = alert.routeIds.join(', ');

  li.innerHTML = `
    <div class="notif-card-header">
      <span class="notif-icon" data-category="alert">${ALERT_ICON}</span>
      <span class="notif-title">${alert.headerText}</span>
    </div>
    <p class="notif-body">${alert.descriptionText}</p>
    <div class="notif-card-footer">
      <span class="notif-tag" data-category="alert">Service Alert${routes ? ` · ${routes}` : ''}</span>
    </div>
  `;

  return li;
}

// ── Data fetching ──────────────────────────────────────────────────────────────

async function loadAlerts(): Promise<void> {
  showingNotifications = false;
  list.innerHTML = '';

  try {
    const res = await fetch('/notifications/alerts', { headers: authHeaders() });
    if (res.status === 503) {
      emptyEl.textContent = 'Service alerts are temporarily unavailable.';
      emptyEl.classList.add('is-visible');
      return;
    }
    if (!res.ok) {
      emptyEl.textContent = 'Failed to load service alerts.';
      emptyEl.classList.add('is-visible');
      return;
    }
    const data = await res.json();
    const alerts: IServiceAlert[] = data.payload ?? [];
    alerts.forEach((a) => list.appendChild(createAlertCard(a)));
    updateEmptyState();
  } catch {
    emptyEl.textContent = 'Service alerts are temporarily unavailable.';
    emptyEl.classList.add('is-visible');
  }
}

async function searchNotifications(params: {
  route?: string;
  bus?: string;
  q?: string;
}): Promise<void> {
  showingNotifications = true;
  list.innerHTML = '';

  const qs = new URLSearchParams();
  if (params.route) qs.set('route', params.route);
  if (params.bus) qs.set('bus', params.bus);
  if (params.q) qs.set('q', params.q);

  const query = [params.route, params.bus, params.q].filter(Boolean).join(' ');

  try {
    // Fetch both notifications and service alerts in parallel
    const [notifRes, alertRes] = await Promise.all([
      fetch(`/notifications/notifications?${qs}`, { headers: authHeaders() }),
      fetch('/notifications/alerts', { headers: authHeaders() })
    ]);

    if (notifRes.ok) {
      const notifData = await notifRes.json();
      const notifs: INotification[] = notifData.payload ?? [];
      notifs.forEach((n) => list.appendChild(createNotifCard(n)));
    }

    // Filter service alerts client-side by query text
    if (alertRes.ok) {
      const alertData = await alertRes.json();
      const alerts: IServiceAlert[] = alertData.payload ?? [];
      const lower = (query || '').toLowerCase();
      const matched = lower
        ? alerts.filter(
            (a) =>
              a.headerText.toLowerCase().includes(lower) ||
              a.descriptionText.toLowerCase().includes(lower) ||
              a.routeIds.some((r) => r.toLowerCase().includes(lower))
          )
        : [];
      matched.forEach((a) => list.appendChild(createAlertCard(a)));
    }

    updateEmptyState(query || undefined);
  } catch {
    emptyEl.textContent = 'Failed to load search results.';
    emptyEl.classList.add('is-visible');
  }
}

// ── URL pre-fill (A14) ─────────────────────────────────────────────────────────

function getPreFill(): { route?: string; bus?: string } {
  const params = new URLSearchParams(window.location.search);
  const route = params.get('route') ?? undefined;
  const bus = params.get('bus') ?? undefined;
  return { route, bus };
}

// ── Socket.io — live alertUpdate refresh ───────────────────────────────────────

function connectForAlerts(): void {
  const token = getToken();
  if (!token) return;

  socket = io({ query: { token } });
  socket.on('alertUpdate', () => {
    // Refresh alert display only if we're not showing a search result
    if (!showingNotifications) {
      loadAlerts();
    }
  });

  socket.on('searchSuggestions', (suggestions) => {
    renderSuggestions(suggestions);
  });
}

// ── Search bar ─────────────────────────────────────────────────────────────────

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function queriesEqual(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

async function runFullSearch(query: string): Promise<void> {
  const trimmed = query.trim();
  if (!trimmed) {
    await loadAlerts();
    return;
  }

  const preFill = getPreFill();
  if (queriesEqual(preFill.route, trimmed)) {
    await searchNotifications({ route: trimmed });
    return;
  }
  if (queriesEqual(preFill.bus, trimmed)) {
    await searchNotifications({ bus: trimmed });
    return;
  }
  await searchNotifications({ q: trimmed });
}

function handleSearchInput(): void {
  const query = searchInput.value.trim();
  clearBtn.classList.toggle('is-visible', query.length > 0);

  if (debounceTimer) clearTimeout(debounceTimer);

  if (!query) {
    hideSuggestions();
    loadAlerts();
    return;
  }

  debounceTimer = setTimeout(() => {
    if (socket) {
      socket.emit('searchAutocomplete', query, 'notifications');
      return;
    }
    void runFullSearch(query);
  }, 300);
}

// ── Init ───────────────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  const token = getToken();
  if (!token) {
    window.location.replace('/auth');
    return;
  }

  connectForAlerts();

  const { route, bus } = getPreFill();

  if (route || bus) {
    // A14: pre-filled from external navigation
    const displayValue = route ?? bus ?? '';
    searchInput.value = displayValue;
    clearBtn.classList.add('is-visible');
    await searchNotifications({ route, bus });
  } else {
    // Default: show GTFS-RT alerts
    await loadAlerts();
  }

  searchInput.addEventListener('input', handleSearchInput);

  searchInput.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      hideSuggestions();
      return;
    }

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const buttons = Array.from(
        suggestionsEl.querySelectorAll<HTMLButtonElement>('.notif-search-suggestion')
      );
      if (buttons.length === 0) return;
      e.preventDefault();

      const focused = suggestionsEl.querySelector<HTMLButtonElement>('.notif-search-suggestion:focus');
      const idx = focused ? buttons.indexOf(focused) : -1;

      if (e.key === 'ArrowDown') {
        const next = buttons[idx + 1] ?? buttons[0];
        next.focus();
      } else {
        if (idx <= 0) {
          searchInput.focus();
        } else {
          buttons[idx - 1].focus();
        }
      }
      return;
    }

    if (e.key !== 'Enter') return;
    e.preventDefault();
    hideSuggestions();
    void runFullSearch(searchInput.value.trim());
  });

  document.addEventListener('click', (e) => {
    if (!searchWrap.contains(e.target as Node)) {
      hideSuggestions();
    }
  });

  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearBtn.classList.remove('is-visible');
    hideSuggestions();
    // Clear URL params without reload
    history.replaceState(null, '', window.location.pathname);
    loadAlerts();
    searchInput.focus();
  });
}

init();
