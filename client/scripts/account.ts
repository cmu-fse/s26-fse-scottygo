import axios, { AxiosResponse } from 'axios';
import { io, Socket } from 'socket.io-client';
import type { IResponse } from '../../common/server.responses';
import { isSuccess } from '../../common/server.responses';
import type {
  IUserAccount,
  IAccountStatus,
  IPrivilegeLevel
} from '../../common/user.interface';
import type {
  ServerToClientEvents,
  ClientToServerEvents
} from '../../common/socket.interface';

export {};

// ---------------------------------------------------------------------------
// Auth helpers (consistent with app_directory.ts / auth.ts)
// ---------------------------------------------------------------------------

const getToken = (): string | null => localStorage.getItem('token');
const getStoredUsername = (): string | null => localStorage.getItem('username');

const handleLogout = (): void => {
  localStorage.removeItem('token');
  localStorage.removeItem('username');
  window.location.replace('/home');
};

const authHeaders = (): Record<string, string> => {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------

// User search (Admin only)
const userSearchCard = document.getElementById(
  'user-search-card'
) as HTMLDivElement | null;
const targetUsernameInput = document.getElementById(
  'target-username'
) as HTMLInputElement | null;
const loadUserBtn = document.getElementById(
  'load-user-btn'
) as HTMLButtonElement | null;
const searchStatusEl = document.getElementById(
  'search-status'
) as HTMLParagraphElement | null;

// Account info display
const accountInfoCard = document.getElementById(
  'account-info-card'
) as HTMLDivElement | null;
const displayUsername = document.getElementById(
  'display-username'
) as HTMLSpanElement | null;
const displayEmail = document.getElementById(
  'display-email'
) as HTMLSpanElement | null;
const displayStatus = document.getElementById(
  'display-status'
) as HTMLSpanElement | null;
const displayPrivilege = document.getElementById(
  'display-privilege'
) as HTMLSpanElement | null;

// Username form (Member only)
const usernameCard = document.getElementById(
  'username-card'
) as HTMLDivElement | null;
const usernameForm = document.getElementById(
  'username-form'
) as HTMLFormElement | null;
const newUsernameInput = document.getElementById(
  'new-username'
) as HTMLInputElement | null;
const usernameStatusEl = document.getElementById(
  'username-status'
) as HTMLParagraphElement | null;

// Email form (Member only)
const emailCard = document.getElementById(
  'email-card'
) as HTMLDivElement | null;
const emailForm = document.getElementById(
  'email-form'
) as HTMLFormElement | null;
const newEmailInput = document.getElementById(
  'new-email'
) as HTMLInputElement | null;
const emailStatusEl = document.getElementById(
  'email-status'
) as HTMLParagraphElement | null;

// Password form
const passwordCard = document.getElementById(
  'password-card'
) as HTMLDivElement | null;
const passwordForm = document.getElementById(
  'password-form'
) as HTMLFormElement | null;
const currentPasswordGroup = document.getElementById(
  'current-password-group'
) as HTMLDivElement | null;
const currentPasswordInput = document.getElementById(
  'current-password'
) as HTMLInputElement | null;
const newPasswordInput = document.getElementById(
  'new-password'
) as HTMLInputElement | null;
const passwordStatusEl = document.getElementById(
  'password-status'
) as HTMLParagraphElement | null;

// Status form
const statusCard = document.getElementById(
  'status-card'
) as HTMLDivElement | null;
const statusForm = document.getElementById(
  'status-form'
) as HTMLFormElement | null;
const newStatusSelect = document.getElementById(
  'new-status'
) as HTMLSelectElement | null;
const statusStatusEl = document.getElementById(
  'status-status'
) as HTMLParagraphElement | null;

// Privilege form (Admin only)
const privilegeCard = document.getElementById(
  'privilege-card'
) as HTMLDivElement | null;
const privilegeForm = document.getElementById(
  'privilege-form'
) as HTMLFormElement | null;
const newPrivilegeSelect = document.getElementById(
  'new-privilege'
) as HTMLSelectElement | null;
const privilegeStatusEl = document.getElementById(
  'privilege-status'
) as HTMLParagraphElement | null;

// Confirm modal
const confirmModal = document.getElementById(
  'confirm-modal'
) as HTMLDivElement | null;
const confirmMessage = document.getElementById(
  'confirm-message'
) as HTMLParagraphElement | null;
const confirmYes = document.getElementById(
  'confirm-yes'
) as HTMLButtonElement | null;
const confirmNo = document.getElementById(
  'confirm-no'
) as HTMLButtonElement | null;

const logoutBtn = document.getElementById(
  'logout-btn'
) as HTMLButtonElement | null;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let currentUserAccount: IUserAccount | null = null; // the logged-in user
let viewingAccount: IUserAccount | null = null; // the account being viewed/edited
let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;
let pendingConfirmAction: (() => Promise<void>) | null = null;

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

const setStatus = (
  el: HTMLParagraphElement | null,
  message: string,
  isError = false
): void => {
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('status--error', isError);
};

const clearAllStatuses = (): void => {
  [
    searchStatusEl,
    usernameStatusEl,
    emailStatusEl,
    passwordStatusEl,
    statusStatusEl,
    privilegeStatusEl
  ].forEach((el) => setStatus(el, ''));
};

const getResponseMessage = (
  data: IResponse | null,
  fallback: string
): string => {
  if (!data) return fallback;
  const errorName = 'name' in data ? data.name : '';
  const errorMessages: Record<string, string> = {
    UnauthorizedRequest: 'You do not have permission for this action',
    LastAdministrator: 'Cannot inactivate the sole Administrator',
    UserNotFound: 'User does not exist',
    InvalidPassword: 'Password should be at least 4 characters',
    UsernameExists: 'Username already taken',
    InvalidUsername: 'Username less than 4 characters or invalid',
    InvalidEmail: 'You are ineligible, ScottyGo is CMU ONLY',
    IncorrectPassword: 'Current password is incorrect'
  };
  if (typeof errorName === 'string' && errorName in errorMessages) {
    return errorMessages[errorName];
  }
  if (
    'message' in data &&
    typeof data.message === 'string' &&
    data.message.length > 0
  ) {
    return data.message;
  }
  if (typeof errorName === 'string' && errorName.length > 0) {
    return String(errorName);
  }
  return fallback;
};

const isAdmin = (): boolean =>
  currentUserAccount?.privilegeLevel === 'Administrator';

const isOwnAccount = (): boolean =>
  viewingAccount !== null &&
  currentUserAccount !== null &&
  viewingAccount.credentials.username.toLowerCase() ===
    currentUserAccount.credentials.username.toLowerCase();

// ---------------------------------------------------------------------------
// Modal helpers (consistent with auth.ts)
// ---------------------------------------------------------------------------

const openModal = (modal: HTMLDivElement | null): void => {
  if (!modal) return;
  modal.classList.add('is-open');
  modal.removeAttribute('inert');
};

const closeModal = (modal: HTMLDivElement | null): void => {
  if (!modal) return;
  modal.classList.remove('is-open');
  modal.setAttribute('inert', '');
};

const showConfirm = (message: string, onConfirm: () => Promise<void>): void => {
  if (confirmMessage) confirmMessage.textContent = message;
  pendingConfirmAction = onConfirm;
  openModal(confirmModal);
};

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

const fetchAccount = async (
  username: string
): Promise<{ status: number; data: IResponse | null }> => {
  try {
    const res: AxiosResponse<IResponse> = await axios.request({
      method: 'get',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      url: `/account/users/${encodeURIComponent(username)}`,
      validateStatus: () => true
    });
    return { status: res.status, data: res.data };
  } catch {
    return { status: 500, data: null };
  }
};

const patchAccount = async (
  username: string,
  field: string,
  body: Record<string, unknown>
): Promise<{ status: number; data: IResponse | null }> => {
  try {
    const res: AxiosResponse<IResponse> = await axios.request({
      method: 'patch',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      data: body,
      url: `/account/users/${encodeURIComponent(username)}/${field}`,
      validateStatus: () => true
    });
    return { status: res.status, data: res.data };
  } catch {
    return { status: 500, data: null };
  }
};

// ---------------------------------------------------------------------------
// Socket.io real-time connection
// ---------------------------------------------------------------------------

const connectSocket = (): void => {
  const token = getToken();
  if (!token || socket) return;

  socket = io({ query: { token } });

  socket.on('accountUpdated', (account: IUserAccount) => {
    // Update the displayed account if it matches
    if (
      viewingAccount &&
      (account.credentials.username.toLowerCase() ===
        viewingAccount.credentials.username.toLowerCase() ||
        account._id === viewingAccount._id)
    ) {
      viewingAccount = account;
      renderAccountInfo();
    }
    // Also update cached current user if it matches
    if (currentUserAccount && account._id === currentUserAccount._id) {
      currentUserAccount = account;
    }
  });

  socket.on('forceLogout', (_reason: string) => {
    // Clear auth state and redirect per R5
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    window.location.replace('/auth');
  });
};

const subscribeToAccount = (username: string): void => {
  socket?.emit('subscribeAccount', username);
};

const unsubscribeFromAccount = (username: string): void => {
  socket?.emit('unsubscribeAccount', username);
};

// ---------------------------------------------------------------------------
// UI rendering
// ---------------------------------------------------------------------------

const renderAccountInfo = (): void => {
  if (!viewingAccount || !accountInfoCard) return;

  accountInfoCard.hidden = false;

  if (displayUsername) {
    displayUsername.textContent = viewingAccount.credentials.username;
  }
  if (displayEmail) {
    displayEmail.textContent = viewingAccount.email || '—';
  }
  if (displayStatus) {
    displayStatus.textContent = viewingAccount.status;
    displayStatus.className = 'info-value';
    displayStatus.classList.add(
      viewingAccount.status === 'Active' ? 'status-active' : 'status-inactive'
    );
  }
  if (displayPrivilege) {
    displayPrivilege.textContent = viewingAccount.privilegeLevel;
    displayPrivilege.className = 'info-value';
    const privClass =
      viewingAccount.privilegeLevel === 'Administrator'
        ? 'privilege-admin'
        : viewingAccount.privilegeLevel === 'Coordinator'
          ? 'privilege-coordinator'
          : 'privilege-member';
    displayPrivilege.classList.add(privClass);
  }

  // Pre-fill dropdowns with current values
  if (newStatusSelect) newStatusSelect.value = viewingAccount.status;
  if (newPrivilegeSelect) {
    newPrivilegeSelect.value = viewingAccount.privilegeLevel;
  }
};

const showPermittedCards = (): void => {
  // Hide all editable cards first
  [usernameCard, emailCard, passwordCard, statusCard, privilegeCard].forEach(
    (card) => {
      if (card) card.hidden = true;
    }
  );

  if (!viewingAccount || !currentUserAccount) return;

  const adminUser = isAdmin();
  const ownAccount = isOwnAccount();

  // Username: Member only, own account only
  if (!adminUser && ownAccount && usernameCard) {
    usernameCard.hidden = false;
  }

  // Email: Member only, own account only
  if (!adminUser && ownAccount && emailCard) {
    emailCard.hidden = false;
  }

  // Password: Admin can change any user's; Member can change own only
  if ((adminUser || ownAccount) && passwordCard) {
    passwordCard.hidden = false;
    // Admin doesn't need current password; Member does
    if (currentPasswordGroup) {
      currentPasswordGroup.hidden = adminUser && !ownAccount;
    }
  }

  // Status: Admin can change any; Member can change own
  if ((adminUser || ownAccount) && statusCard) {
    statusCard.hidden = false;
  }

  // Privilege: Admin only
  if (adminUser && privilegeCard) {
    privilegeCard.hidden = false;
  }
};

// ---------------------------------------------------------------------------
// Load account data
// ---------------------------------------------------------------------------

const loadAccount = async (username: string): Promise<boolean> => {
  clearAllStatuses();

  const { status, data } = await fetchAccount(username);

  if (status < 200 || status >= 300) {
    const message = getResponseMessage(data, 'Failed to load account.');
    setStatus(searchStatusEl ?? usernameStatusEl, message, true);
    return false;
  }

  if (data && isSuccess(data) && data.payload) {
    // Unsubscribe from previous account if any
    if (viewingAccount) {
      unsubscribeFromAccount(viewingAccount.credentials.username);
    }

    viewingAccount = data.payload as IUserAccount;
    renderAccountInfo();
    showPermittedCards();
    subscribeToAccount(viewingAccount.credentials.username);
    return true;
  }

  setStatus(searchStatusEl, 'Unexpected response from server.', true);
  return false;
};

// ---------------------------------------------------------------------------
// Form handlers
// ---------------------------------------------------------------------------

// Update Username
usernameForm?.addEventListener('submit', async (e: SubmitEvent) => {
  e.preventDefault();
  if (!newUsernameInput || !viewingAccount) return;

  const newUsername = newUsernameInput.value.trim();
  if (newUsername.length < 4) {
    newUsernameInput.classList.add('form-input--error');
    setStatus(usernameStatusEl, 'Username must be at least 4 characters', true);
    return;
  }

  newUsernameInput.classList.remove('form-input--error');

  showConfirm(`Change username to "${newUsername}"?`, async () => {
    const oldUsername = viewingAccount!.credentials.username;
    const { status, data } = await patchAccount(oldUsername, 'username', {
      newUsername
    });

    if (status < 200 || status >= 300) {
      const message = getResponseMessage(data, 'Username update failed.');
      const errorName = data && 'name' in data ? data.name : '';
      if (errorName === 'UsernameExists' || errorName === 'InvalidUsername') {
        newUsernameInput.classList.add('form-input--error');
      }
      setStatus(usernameStatusEl, message, true);
      return;
    }

    // Update localStorage if own username changed
    if (isOwnAccount()) {
      localStorage.setItem('username', newUsername);
    }

    if (data && isSuccess(data) && data.payload) {
      viewingAccount = data.payload as IUserAccount;
      renderAccountInfo();
    }

    newUsernameInput.value = '';
    setStatus(usernameStatusEl, 'Username updated successfully.');
  });
});

// Update Email
emailForm?.addEventListener('submit', async (e: SubmitEvent) => {
  e.preventDefault();
  if (!newEmailInput || !viewingAccount) return;

  const email = newEmailInput.value.trim();
  if (!email) {
    newEmailInput.classList.add('form-input--error');
    setStatus(emailStatusEl, 'Email is required.', true);
    return;
  }

  newEmailInput.classList.remove('form-input--error');

  showConfirm(`Change email to "${email}"?`, async () => {
    const { status, data } = await patchAccount(
      viewingAccount!.credentials.username,
      'email',
      { email }
    );

    if (status < 200 || status >= 300) {
      const message = getResponseMessage(data, 'Email update failed.');
      const errorName = data && 'name' in data ? data.name : '';
      if (errorName === 'InvalidEmail') {
        newEmailInput.classList.add('form-input--error');
      }
      setStatus(emailStatusEl, message, true);
      return;
    }

    if (data && isSuccess(data) && data.payload) {
      viewingAccount = data.payload as IUserAccount;
      renderAccountInfo();
    }

    newEmailInput.value = '';
    setStatus(emailStatusEl, 'Email updated successfully.');
  });
});

// Update Password
passwordForm?.addEventListener('submit', async (e: SubmitEvent) => {
  e.preventDefault();
  if (!newPasswordInput || !viewingAccount) return;

  const newPassword = newPasswordInput.value;
  if (newPassword.length < 4) {
    newPasswordInput.classList.add('form-input--error');
    setStatus(
      passwordStatusEl,
      'Password must be at least 4 characters.',
      true
    );
    return;
  }

  newPasswordInput.classList.remove('form-input--error');
  if (currentPasswordInput)
    currentPasswordInput.classList.remove('form-input--error');

  const body: Record<string, string> = { newPassword };

  // Member must supply current password; Admin changing another user's password does not
  const adminChangingOther = isAdmin() && !isOwnAccount();
  if (!adminChangingOther) {
    const currentPassword = currentPasswordInput?.value ?? '';
    if (!currentPassword) {
      currentPasswordInput?.classList.add('form-input--error');
      setStatus(passwordStatusEl, 'Current password is required.', true);
      return;
    }
    body.currentPassword = currentPassword;
  }

  showConfirm('Change password?', async () => {
    const { status, data } = await patchAccount(
      viewingAccount!.credentials.username,
      'password',
      body
    );

    if (status < 200 || status >= 300) {
      const message = getResponseMessage(data, 'Password update failed.');
      const errorName = data && 'name' in data ? data.name : '';
      if (errorName === 'InvalidPassword') {
        newPasswordInput.classList.add('form-input--error');
      }
      if (errorName === 'IncorrectPassword') {
        currentPasswordInput?.classList.add('form-input--error');
      }
      setStatus(passwordStatusEl, message, true);
      return;
    }

    if (data && isSuccess(data) && data.payload) {
      viewingAccount = data.payload as IUserAccount;
      renderAccountInfo();
    }

    if (currentPasswordInput) currentPasswordInput.value = '';
    newPasswordInput.value = '';
    setStatus(passwordStatusEl, 'Password updated successfully.');
  });
});

// Update Status
statusForm?.addEventListener('submit', async (e: SubmitEvent) => {
  e.preventDefault();
  if (!newStatusSelect || !viewingAccount) return;

  const newStatus = newStatusSelect.value as IAccountStatus;

  if (newStatus === viewingAccount.status) {
    setStatus(statusStatusEl, 'Status is already ' + newStatus + '.', true);
    return;
  }

  const selfInactivate = isOwnAccount() && newStatus === 'Inactive';
  const confirmMsg = selfInactivate
    ? 'Setting your account to Inactive will log you out. Continue?'
    : `Set ${viewingAccount.credentials.username}'s status to ${newStatus}?`;

  showConfirm(confirmMsg, async () => {
    const { status, data } = await patchAccount(
      viewingAccount!.credentials.username,
      'status',
      { status: newStatus }
    );

    if (status < 200 || status >= 300) {
      const message = getResponseMessage(data, 'Status update failed.');
      setStatus(statusStatusEl, message, true);
      return;
    }

    if (data && isSuccess(data) && data.payload) {
      viewingAccount = data.payload as IUserAccount;
      renderAccountInfo();
    }

    setStatus(statusStatusEl, 'Status updated successfully.');

    // If member inactivated own account, they will be force-logged-out via socket
  });
});

// Update Privilege (Admin only)
privilegeForm?.addEventListener('submit', async (e: SubmitEvent) => {
  e.preventDefault();
  if (!newPrivilegeSelect || !viewingAccount) return;

  const newPrivilege = newPrivilegeSelect.value as IPrivilegeLevel;

  if (newPrivilege === viewingAccount.privilegeLevel) {
    setStatus(
      privilegeStatusEl,
      'Privilege is already ' + newPrivilege + '.',
      true
    );
    return;
  }

  showConfirm(
    `Change ${viewingAccount.credentials.username}'s privilege to ${newPrivilege}? (Takes effect on next login)`,
    async () => {
      const { status, data } = await patchAccount(
        viewingAccount!.credentials.username,
        'privilege',
        { privilegeLevel: newPrivilege }
      );

      if (status < 200 || status >= 300) {
        const message = getResponseMessage(data, 'Privilege update failed.');
        setStatus(privilegeStatusEl, message, true);
        return;
      }

      if (data && isSuccess(data) && data.payload) {
        viewingAccount = data.payload as IUserAccount;
        renderAccountInfo();
        showPermittedCards();
      }

      setStatus(privilegeStatusEl, 'Privilege updated successfully.');
    }
  );
});

// ---------------------------------------------------------------------------
// Confirm modal handlers
// ---------------------------------------------------------------------------

confirmYes?.addEventListener('click', async () => {
  closeModal(confirmModal);
  if (pendingConfirmAction) {
    const action = pendingConfirmAction;
    pendingConfirmAction = null;
    await action();
  }
});

confirmNo?.addEventListener('click', () => {
  pendingConfirmAction = null;
  closeModal(confirmModal);
});

// ---------------------------------------------------------------------------
// Load user button (Admin: search for other users)
// ---------------------------------------------------------------------------

loadUserBtn?.addEventListener('click', async () => {
  if (!targetUsernameInput) return;

  const username = targetUsernameInput.value.trim();
  if (!username) {
    setStatus(searchStatusEl, 'Please enter a username.', true);
    return;
  }

  setStatus(searchStatusEl, 'Loading...');
  const success = await loadAccount(username);
  if (success) {
    setStatus(searchStatusEl, '');
  }
});

// Allow pressing Enter in the search input
targetUsernameInput?.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    loadUserBtn?.click();
  }
});

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------

logoutBtn?.addEventListener('click', handleLogout);

// ---------------------------------------------------------------------------
// Page initialization
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', async () => {
  const token = getToken();
  const username = getStoredUsername();

  if (!token || !username) {
    window.location.replace('/auth');
    return;
  }

  // Connect socket for real-time updates
  connectSocket();

  // Load the logged-in user's own account first
  const { status, data } = await fetchAccount(username);

  if (status === 401) {
    // Token invalid — redirect to auth
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    window.location.replace('/auth');
    return;
  }

  if (
    status >= 200 &&
    status < 300 &&
    data &&
    isSuccess(data) &&
    data.payload
  ) {
    currentUserAccount = data.payload as IUserAccount;
    viewingAccount = currentUserAccount;

    renderAccountInfo();
    showPermittedCards();
    subscribeToAccount(currentUserAccount.credentials.username);

    // Show admin user-search card if Administrator
    if (isAdmin() && userSearchCard) {
      userSearchCard.hidden = false;
    }
  } else {
    // Could not load own account
    const message = getResponseMessage(data, 'Failed to load your account.');
    setStatus(searchStatusEl, message, true);
    if (accountInfoCard) accountInfoCard.hidden = true;
  }
});
