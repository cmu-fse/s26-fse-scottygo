// Export empty object to treat as module
export {};

import './components/app-header';

type NotifCategory = 'accessibility' | 'capacity' | 'condition' | 'delay';

interface Notification {
  id: number;
  title: string;
  body: string;
  category: NotifCategory;
  busLabel: string;
  minutesAgo: number;
}

const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: 1,
    title: 'Accessibility Update',
    body: 'Bus 6551 near stop x: Priority seating is blocked. Consider the next bus if you need wheelchair or stroller space.',
    category: 'accessibility',
    busLabel: '6551',
    minutesAgo: 1,
  },
  {
    id: 2,
    title: 'Bus 6551 is Full',
    body: 'Bus 6551 near stop x: At capacity. It may not stop for new passengers.',
    category: 'capacity',
    busLabel: '6551',
    minutesAgo: 2,
  },
  {
    id: 3,
    title: 'Condition Report',
    body: 'Bus 6551: AC is out — too hot. You might want a window seat or a different bus.',
    category: 'condition',
    busLabel: '6551',
    minutesAgo: 10,
  },
  {
    id: 4,
    title: 'Delay Alert',
    body: 'Bus 61A running 8 minutes late due to traffic on Forbes Ave near CMU.',
    category: 'delay',
    busLabel: '61A',
    minutesAgo: 5,
  },
];

const CATEGORY_ICONS: Record<NotifCategory, string> = {
  accessibility: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"></circle>
    <line x1="12" y1="8" x2="12" y2="12"></line>
    <line x1="12" y1="16" x2="12.01" y2="16"></line>
  </svg>`,
  capacity: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
    <line x1="12" y1="9" x2="12" y2="13"></line>
    <line x1="12" y1="17" x2="12.01" y2="17"></line>
  </svg>`,
  condition: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"></circle>
    <line x1="12" y1="8" x2="12" y2="12"></line>
    <line x1="12" y1="16" x2="12.01" y2="16"></line>
  </svg>`,
  delay: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"></circle>
    <polyline points="12 6 12 12 16 14"></polyline>
  </svg>`,
};

function formatTime(minutesAgo: number): string {
  if (minutesAgo < 60) return `${minutesAgo}m ago`;
  const h = Math.floor(minutesAgo / 60);
  return `${h}h ago`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function createCard(notif: Notification): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'notif-card';
  li.dataset.id = String(notif.id);
  li.dataset.category = notif.category;

  li.innerHTML = `
    <button class="notif-dismiss" aria-label="Dismiss notification">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>
    <div class="notif-card-header">
      <span class="notif-icon" data-category="${notif.category}">${CATEGORY_ICONS[notif.category]}</span>
      <span class="notif-title">${notif.title}</span>
    </div>
    <p class="notif-body">${notif.body}</p>
    <div class="notif-card-footer">
      <span class="notif-tag" data-category="${notif.category}">${capitalize(notif.category)}</span>
      <span class="notif-time">${formatTime(notif.minutesAgo)}</span>
    </div>
  `;

  li.querySelector<HTMLButtonElement>('.notif-dismiss')!.addEventListener('click', () => {
    li.remove();
    updateEmptyState();
  });

  return li;
}

function updateEmptyState(): void {
  const list = document.getElementById('notif-list')!;
  const empty = document.getElementById('notif-empty')!;
  empty.classList.toggle('is-visible', list.children.length === 0);
}

function render(notifications: Notification[]): void {
  const list = document.getElementById('notif-list')!;
  list.innerHTML = '';
  notifications.forEach((n) => list.appendChild(createCard(n)));
  updateEmptyState();
}

function init(): void {
  const notifications = [...MOCK_NOTIFICATIONS];
  render(notifications);

  const searchInput = document.getElementById('notif-search-input') as HTMLInputElement;
  const clearBtn = document.getElementById('notif-search-clear')!;

  searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim().toLowerCase();
    clearBtn.classList.toggle('is-visible', query.length > 0);

    const filtered = notifications.filter(
      (n) =>
        n.busLabel.toLowerCase().includes(query) ||
        n.title.toLowerCase().includes(query) ||
        n.body.toLowerCase().includes(query) ||
        n.category.toLowerCase().includes(query),
    );
    render(filtered);
  });

  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearBtn.classList.remove('is-visible');
    render(notifications);
    searchInput.focus();
  });
}

init();
