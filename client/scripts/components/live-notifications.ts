/**
 * Live Notification Popups Component
 * Displays toast-style notification cards on all pages for subscribed routes.
 * Notifications are persisted in localStorage so they survive page navigation.
 *
 * Usage: import this file on any page — it self-initialises on DOMContentLoaded.
 */

type LiveNotifCategory = 'accessibility' | 'capacity' | 'condition' | 'delay';

interface StoredLiveNotif {
  id: string;
  title: string;
  body: string;
  category: LiveNotifCategory;
  createdAt: number; // Date.now() when queued
}

const LIVE_NOTIF_KEY = 'scottygo_live_notifications';
const SUBSCRIPTIONS_KEY = 'scottygo_subscriptions';

const LIVE_NOTIF_ICONS: Record<LiveNotifCategory, string> = {
  accessibility: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`,
  capacity: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
  condition: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`,
  delay: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`,
};

const MOCK_LIVE_NOTIFICATIONS: Omit<StoredLiveNotif, 'id' | 'createdAt'>[] = [
  {
    title: 'Accessibility Update',
    body: 'Bus 6551 near stop x: Priority seating is blocked. Consider next bus if you need wheelchair or stroller space.',
    category: 'accessibility',
  },
  {
    title: 'Bus at Capacity',
    body: 'Bus 6551 near stop x: At capacity. It may not stop for new passengers.',
    category: 'capacity',
  },
  {
    title: 'Condition Report',
    body: 'Bus 6551: AC is out — too hot. You might want a different bus.',
    category: 'condition',
  },
  {
    title: 'Delay Alert',
    body: 'Bus 61A running 8 minutes late due to traffic on Forbes Ave near CMU.',
    category: 'delay',
  },
];

function hasSubscriptions(): boolean {
  try {
    const subs = JSON.parse(localStorage.getItem(SUBSCRIPTIONS_KEY) ?? '[]');
    return Array.isArray(subs) && subs.length > 0;
  } catch {
    return false;
  }
}

function getPendingNotifs(): StoredLiveNotif[] {
  try {
    return JSON.parse(localStorage.getItem(LIVE_NOTIF_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function savePendingNotifs(notifs: StoredLiveNotif[]): void {
  localStorage.setItem(LIVE_NOTIF_KEY, JSON.stringify(notifs));
}

function removePendingNotif(id: string): void {
  savePendingNotifs(getPendingNotifs().filter((n) => n.id !== id));
}

/** Seeds mock notifications into localStorage if none are pending yet. */
function queueMockNotifications(): void {
  if (getPendingNotifs().length > 0) return;
  const now = Date.now();
  const seeded: StoredLiveNotif[] = MOCK_LIVE_NOTIFICATIONS.map((n, i) => ({
    ...n,
    id: `mock-${i}`,
    createdAt: now - i * 60_000, // stagger so timestamps differ
  }));
  savePendingNotifs(seeded);
}

function formatElapsed(createdAt: number): string {
  const mins = Math.round((Date.now() - createdAt) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

function dismissCard(card: HTMLElement, id: string): void {
  removePendingNotif(id);
  card.classList.add('is-dismissing');
  card.addEventListener('animationend', () => card.remove(), { once: true });
}

function renderCard(container: HTMLElement, notif: StoredLiveNotif): void {
  const { id, title, body, category, createdAt } = notif;
  const label = category.charAt(0).toUpperCase() + category.slice(1);

  const card = document.createElement('div');
  card.className = 'live-notif-card';
  card.dataset.category = category;
  card.innerHTML = `
    <button class="live-notif-dismiss" aria-label="Dismiss notification">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>
    <div class="live-notif-header">
      <span class="live-notif-icon" data-category="${category}">${LIVE_NOTIF_ICONS[category]}</span>
      <span class="live-notif-title">${title}</span>
    </div>
    <p class="live-notif-body">${body}</p>
    <div class="live-notif-footer">
      <span class="live-notif-tag" data-category="${category}">${label}</span>
      <span class="live-notif-time">${formatElapsed(createdAt)}</span>
    </div>
  `;

  card.querySelector<HTMLButtonElement>('.live-notif-dismiss')!
    .addEventListener('click', () => dismissCard(card, id));

  container.appendChild(card);
}

function init(): void {
  if (!hasSubscriptions()) return;

  queueMockNotifications();

  const pending = getPendingNotifs();
  if (pending.length === 0) return;

  const container = document.createElement('div');
  container.className = 'live-notif-container';
  document.body.appendChild(container);

  // Stagger the entrance of each card
  pending.forEach((notif, i) => {
    setTimeout(() => renderCard(container, notif), i * 600);
  });
}

document.addEventListener('DOMContentLoaded', init);
