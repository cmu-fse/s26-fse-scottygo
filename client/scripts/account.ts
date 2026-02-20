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
// Auth helpers
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

const pageTitle = document.getElementById('page-title') as HTMLHeadingElement;

// Admin: username selector
const userSelectorGroup = document.getElementById(
  'user-selector-group'
) as HTMLDivElement;
const userSelector = document.getElementById(
  'user-selector'
) as HTMLSelectElement;
const searchStatusEl = document.getElementById(
  'search-status'
) as HTMLParagraphElement;

// Single account card
const accountCard = document.getElementById('account-card') as HTMLDivElement;
const accountForm = document.getElementById('account-form') as HTMLFormElement;

// Display (read-only) spans
const displayStatus = document.getElementById(
  'display-status'
) as HTMLSpanElement;
const displayUsername = document.getElementById(
  'display-username'
) as HTMLSpanElement;
const displayEmail = document.getElementById(
  'display-email'
) as HTMLSpanElement;
const displayPassword = document.getElementById(
  'display-password'
) as HTMLSpanElement;
const displayPrivilege = document.getElementById(
  'display-privilege'
) as HTMLSpanElement;

// Form groups
const statusDisplayGroup = document.getElementById(
  'status-display-group'
) as HTMLDivElement;
const usernameGroup = document.getElementById(
  'username-group'
) as HTMLDivElement;
const emailGroup = document.getElementById('email-group') as HTMLDivElement;
const passwordGroup = document.getElementById(
  'password-group'
) as HTMLDivElement;
const privilegeGroup = document.getElementById(
  'privilege-group'
) as HTMLDivElement;
const statusEditGroup = document.getElementById(
  'status-edit-group'
) as HTMLDivElement;

// Editable inputs
const fieldUsername = document.getElementById(
  'field-username'
) as HTMLInputElement;
const fieldEmail = document.getElementById('field-email') as HTMLInputElement;
const fieldPassword = document.getElementById(
  'field-password'
) as HTMLInputElement;
const fieldPrivilege = document.getElementById(
  'field-privilege'
) as HTMLSelectElement;
const fieldStatus = document.getElementById(
  'field-status'
) as HTMLSelectElement;

// Error elements
const usernameError = document.getElementById(
  'username-error'
) as HTMLParagraphElement;
const emailError = document.getElementById(
  'email-error'
) as HTMLParagraphElement;
const passwordError = document.getElementById(
  'password-error'
) as HTMLParagraphElement;
const privilegeError = document.getElementById(
  'privilege-error'
) as HTMLParagraphElement;
const statusError = document.getElementById(
  'status-error'
) as HTMLParagraphElement;

// Member status toggle
const statusToggleGroup = document.getElementById(
  'status-toggle-group'
) as HTMLDivElement;
const statusToggle = document.getElementById(
  'status-toggle'
) as HTMLInputElement;
const toggleStatusText = document.getElementById(
  'toggle-status-text'
) as HTMLSpanElement;

// Buttons
const editBtn = document.getElementById('edit-btn') as HTMLButtonElement;
const saveBtn = document.getElementById('save-btn') as HTMLButtonElement;
const cancelBtn = document.getElementById('cancel-btn') as HTMLButtonElement;

// Form status
const formStatusEl = document.getElementById(
  'form-status'
) as HTMLParagraphElement;

// Confirm modal
const confirmModal = document.getElementById('confirm-modal') as HTMLDivElement;
const confirmMessage = document.getElementById(
  'confirm-message'
) as HTMLParagraphElement;
const confirmYes = document.getElementById('confirm-yes') as HTMLButtonElement;
const confirmNo = document.getElementById('confirm-no') as HTMLButtonElement;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let currentUserAccount: IUserAccount | null = null; // the logged-in user
let viewingAccount: IUserAccount | null = null; // the account being viewed/edited
let allUsernames: string[] = []; // for Admin dropdown
let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;
let pendingConfirmAction: (() => Promise<void>) | null = null;
let editing = false;

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

const isAdmin = (): boolean =>
  currentUserAccount?.privilegeLevel === 'Administrator';

const isOwnAccount = (): boolean =>
  viewingAccount !== null &&
  currentUserAccount !== null &&
  viewingAccount.credentials.username.toLowerCase() ===
    currentUserAccount.credentials.username.toLowerCase();

const setFieldError = (el: HTMLParagraphElement, message: string): void => {
  el.textContent = message;
};

const clearFieldErrors = (): void => {
  [
    usernameError,
    emailError,
    passwordError,
    privilegeError,
    statusError
  ].forEach((el) => {
    el.textContent = '';
  });
  [fieldUsername, fieldEmail, fieldPassword].forEach((el) => {
    el.classList.remove('form-input--error');
  });
};

const setFormStatus = (message: string, isError = false): void => {
  formStatusEl.textContent = message;
  formStatusEl.classList.toggle('form-status--error', isError);
};

const getResponseMessage = (
  data: IResponse | null,
  fallback: string
): string => {
  if (!data) return fallback;
  const errorName = 'name' in data ? data.name : '';
  const errorMessages: Record<string, string> = {
    UnauthorizedRequest: 'You do not have permission for this action',
    LastAdministrator: 'Invalid: at least 1 Administrator always needed',
    UserNotFound: 'User does not exist',
    InvalidPassword: 'Password should be at least 4 characters',
    UsernameExists: 'Username already taken',
    InvalidUsername: 'Username less than 4 characters or invalid',
    InvalidEmail: 'You are ineligible, ScottyGo is CMU ONLY',
    IncorrectPassword: 'Current password is incorrect',
    MissingPassword: 'Missing Password',
    MissingUsername: 'Missing Username',
    MissingEmail: 'Missing Email'
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

// ---------------------------------------------------------------------------
// Modal helpers
// ---------------------------------------------------------------------------

const openModal = (modal: HTMLDivElement): void => {
  modal.classList.add('is-open');
  modal.removeAttribute('inert');
};

const closeModal = (modal: HTMLDivElement): void => {
  modal.classList.remove('is-open');
  modal.setAttribute('inert', '');
};

const showConfirm = (message: string, onConfirm: () => Promise<void>): void => {
  confirmMessage.textContent = message;
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
    if (
      viewingAccount &&
      (account.credentials.username.toLowerCase() ===
        viewingAccount.credentials.username.toLowerCase() ||
        account._id === viewingAccount._id)
    ) {
      viewingAccount = account;
      if (!editing) renderReadMode();
    }
    if (currentUserAccount && account._id === currentUserAccount._id) {
      currentUserAccount = account;
    }
  });

  socket.on('forceLogout', (_reason: string) => {
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
// UI rendering — Read (view) mode
// ---------------------------------------------------------------------------

const renderReadMode = (): void => {
  if (!viewingAccount) return;
  editing = false;
  accountCard.hidden = false;

  // Show read-only values, hide inputs
  displayUsername.textContent = viewingAccount.credentials.username;
  displayUsername.hidden = false;
  fieldUsername.hidden = true;

  displayEmail.textContent = viewingAccount.email || '—';
  displayEmail.hidden = false;
  fieldEmail.hidden = true;

  displayPassword.textContent = '••••••••';
  displayPassword.hidden = false;
  fieldPassword.hidden = true;

  // Status display
  if (!isAdmin() && isOwnAccount()) {
    // Member viewing own account → show toggle above card
    statusToggleGroup.hidden = false;
    statusToggle.checked = viewingAccount.status === 'Active';
    toggleStatusText.textContent = viewingAccount.status;
    statusDisplayGroup.hidden = true;
  } else {
    // Admin view → show status as read-only text inside card
    statusToggleGroup.hidden = true;
    displayStatus.textContent = viewingAccount.status;
    displayStatus.className = 'field-value';
    displayStatus.classList.add(
      viewingAccount.status === 'Active' ? 'status-active' : 'status-inactive'
    );
    statusDisplayGroup.hidden = false;
  }

  // Privilege (visible for Admin view)
  if (isAdmin()) {
    displayPrivilege.textContent = viewingAccount.privilegeLevel;
    displayPrivilege.hidden = false;
    fieldPrivilege.hidden = true;
    privilegeGroup.hidden = false;
  } else {
    privilegeGroup.hidden = true;
  }

  // Status edit group hidden in read mode
  statusEditGroup.hidden = true;
  fieldStatus.hidden = true;

  // Admin editing someone else: hide username/email groups (can't edit those)
  if (isAdmin() && !isOwnAccount()) {
    usernameGroup.hidden = true;
    emailGroup.hidden = true;
  } else {
    usernameGroup.hidden = false;
    emailGroup.hidden = false;
  }

  // Show Edit button, hide Save/Cancel
  editBtn.hidden = false;
  saveBtn.hidden = true;
  cancelBtn.hidden = true;

  clearFieldErrors();
  setFormStatus('');
};

// ---------------------------------------------------------------------------
// UI rendering — Edit mode
// ---------------------------------------------------------------------------

const enterEditMode = (): void => {
  if (!viewingAccount) return;
  editing = true;

  clearFieldErrors();
  setFormStatus('');

  const adminUser = isAdmin();
  const ownAcct = isOwnAccount();

  // Username
  if (adminUser && !ownAcct) {
    usernameGroup.hidden = true;
  } else {
    usernameGroup.hidden = false;
    displayUsername.hidden = true;
    fieldUsername.hidden = false;
    fieldUsername.value = viewingAccount.credentials.username;
  }

  // Email
  if (adminUser && !ownAcct) {
    emailGroup.hidden = true;
  } else {
    emailGroup.hidden = false;
    displayEmail.hidden = true;
    fieldEmail.hidden = false;
    fieldEmail.value = viewingAccount.email || '';
  }

  // Password — always editable
  passwordGroup.hidden = false;
  displayPassword.hidden = true;
  fieldPassword.hidden = false;
  fieldPassword.value = '';

  // Privilege — Admin only
  if (adminUser) {
    privilegeGroup.hidden = false;
    displayPrivilege.hidden = true;
    fieldPrivilege.hidden = false;
    fieldPrivilege.value = viewingAccount.privilegeLevel;
  } else {
    privilegeGroup.hidden = true;
  }

  // Account Status — editable (Admin uses dropdown; Member uses toggle outside card)
  if (adminUser) {
    statusEditGroup.hidden = false;
    fieldStatus.hidden = false;
    fieldStatus.value = viewingAccount.status;
    statusDisplayGroup.hidden = true;
    statusToggleGroup.hidden = true;
  }
  // Member toggle stays visible and interactive (no change needed here)

  // Show Save/Cancel, hide Edit
  editBtn.hidden = true;
  saveBtn.hidden = false;
  cancelBtn.hidden = false;
};

// ---------------------------------------------------------------------------
// Save changes — sends only changed fields individually
// ---------------------------------------------------------------------------

const handleSave = async (): Promise<void> => {
  if (!viewingAccount) return;

  clearFieldErrors();
  setFormStatus('');

  const adminUser = isAdmin();
  const ownAcct = isOwnAccount();
  const targetUsername = viewingAccount.credentials.username;

  let hasError = false;
  let saveCount = 0;
  let lastError = '';

  // --- Username ---
  if (!(adminUser && !ownAcct)) {
    const newUsername = fieldUsername.value.trim();
    const usernameChanged =
      newUsername.toLowerCase() !==
      viewingAccount.credentials.username.toLowerCase();

    if (usernameChanged) {
      if (!newUsername) {
        setFieldError(usernameError, 'Missing Username');
        fieldUsername.classList.add('form-input--error');
        hasError = true;
      } else if (newUsername.length < 4) {
        setFieldError(
          usernameError,
          'Username less than 4 characters or invalid'
        );
        fieldUsername.classList.add('form-input--error');
        hasError = true;
      } else {
        const { status, data } = await patchAccount(targetUsername, 'username', {
          newUsername
        });
        if (status >= 200 && status < 300) {
          saveCount++;
          if (ownAcct) localStorage.setItem('username', newUsername);
          if (data && isSuccess(data) && data.payload) {
            viewingAccount = data.payload as IUserAccount;
          }
        } else {
          const msg = getResponseMessage(data, 'Username update failed.');
          setFieldError(usernameError, msg);
          fieldUsername.classList.add('form-input--error');
          hasError = true;
          lastError = msg;
        }
      }
    }
  }

  // --- Email ---
  if (!(adminUser && !ownAcct)) {
    const newEmail = fieldEmail.value.trim();
    const emailChanged = newEmail !== (viewingAccount.email || '');

    if (emailChanged) {
      if (!newEmail) {
        // Only error if previously had email and now clearing it
        if (viewingAccount.email) {
          setFieldError(emailError, 'Missing Email');
          fieldEmail.classList.add('form-input--error');
          hasError = true;
        }
        // If was empty and stays empty, no error
      } else {
        const { status, data } = await patchAccount(
          viewingAccount.credentials.username,
          'email',
          { email: newEmail }
        );
        if (status >= 200 && status < 300) {
          saveCount++;
          if (data && isSuccess(data) && data.payload) {
            viewingAccount = data.payload as IUserAccount;
          }
        } else {
          const msg = getResponseMessage(data, 'Email update failed.');
          setFieldError(emailError, msg);
          fieldEmail.classList.add('form-input--error');
          hasError = true;
          lastError = msg;
        }
      }
    }
  }

  // --- Password ---
  const newPassword = fieldPassword.value;
  if (newPassword) {
    if (newPassword.length < 4) {
      setFieldError(passwordError, 'Password should be at least 4 characters');
      fieldPassword.classList.add('form-input--error');
      hasError = true;
    } else {
      const { status, data } = await patchAccount(
        viewingAccount.credentials.username,
        'password',
        { newPassword }
      );
      if (status >= 200 && status < 300) {
        saveCount++;
        if (data && isSuccess(data) && data.payload) {
          viewingAccount = data.payload as IUserAccount;
        }
      } else {
        const msg = getResponseMessage(data, 'Password update failed.');
        setFieldError(passwordError, msg);
        fieldPassword.classList.add('form-input--error');
        hasError = true;
        lastError = msg;
      }
    }
  }

  // --- Privilege ---
  if (adminUser) {
    const newPrivilege = fieldPrivilege.value as IPrivilegeLevel;
    if (newPrivilege !== viewingAccount.privilegeLevel) {
      const { status, data } = await patchAccount(
        viewingAccount.credentials.username,
        'privilege',
        { privilegeLevel: newPrivilege }
      );
      if (status >= 200 && status < 300) {
        saveCount++;
        if (data && isSuccess(data) && data.payload) {
          viewingAccount = data.payload as IUserAccount;
        }
      } else {
        const msg = getResponseMessage(data, 'Privilege update failed.');
        setFieldError(privilegeError, msg);
        hasError = true;
        lastError = msg;
      }
    }
  }

  // --- Status (Admin dropdown only; Member uses toggle which saves immediately) ---
  if (adminUser) {
    const newStatus = fieldStatus.value as IAccountStatus;
    if (newStatus !== viewingAccount.status) {
      const { status, data } = await patchAccount(
        viewingAccount.credentials.username,
        'status',
        { status: newStatus }
      );
      if (status >= 200 && status < 300) {
        saveCount++;
        if (data && isSuccess(data) && data.payload) {
          viewingAccount = data.payload as IUserAccount;
        }
      } else {
        const msg = getResponseMessage(data, 'Status update failed.');
        setFieldError(statusError, msg);
        hasError = true;
        lastError = msg;
      }
    }
  }

  // Show result
  if (!hasError) {
    renderReadMode();
    if (saveCount > 0) {
      setFormStatus('Changes saved!');
    }
  } else if (saveCount > 0) {
    setFormStatus('Some changes saved, but errors remain.', true);
  } else {
    setFormStatus(lastError || 'Please fix the errors above.', true);
  }
};

// ---------------------------------------------------------------------------
// Load account data
// ---------------------------------------------------------------------------

const loadAccount = async (username: string): Promise<boolean> => {
  clearFieldErrors();
  setFormStatus('');

  const { status, data } = await fetchAccount(username);

  if (status < 200 || status >= 300) {
    const message = getResponseMessage(data, 'Failed to load account.');
    searchStatusEl.textContent = message;
    return false;
  }

  if (data && isSuccess(data) && data.payload) {
    if (viewingAccount) {
      unsubscribeFromAccount(viewingAccount.credentials.username);
    }
    viewingAccount = data.payload as IUserAccount;
    renderReadMode();
    subscribeToAccount(viewingAccount.credentials.username);
    return true;
  }

  searchStatusEl.textContent = 'Unexpected response from server.';
  return false;
};

// ---------------------------------------------------------------------------
// Admin: populate username dropdown
// ---------------------------------------------------------------------------

const populateUserSelector = async (): Promise<void> => {
  try {
    const res: AxiosResponse<IResponse> = await axios.request({
      method: 'get',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      url: '/account/users',
      validateStatus: () => true
    });

    if (res.status >= 200 && res.status < 300 && isSuccess(res.data)) {
      const users = res.data.payload as string[];
      allUsernames = users;
    }
  } catch {
    if (currentUserAccount) {
      allUsernames = [currentUserAccount.credentials.username];
    }
  }

  userSelector.innerHTML = '<option value="">Select Username</option>';
  allUsernames.forEach((u: string) => {
    const opt = document.createElement('option');
    opt.value = u;
    opt.textContent = u;
    userSelector.appendChild(opt);
  });
};

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------

// Edit button
editBtn.addEventListener('click', () => {
  enterEditMode();
});

// Cancel button
cancelBtn.addEventListener('click', () => {
  renderReadMode();
});

// Save button / form submit
accountForm.addEventListener('submit', async (e: SubmitEvent) => {
  e.preventDefault();
  saveBtn.disabled = true;
  await handleSave();
  saveBtn.disabled = false;
});

// Admin: username selector change
userSelector.addEventListener('change', async () => {
  const selected = userSelector.value;
  if (!selected) {
    accountCard.hidden = true;
    return;
  }
  searchStatusEl.textContent = '';
  await loadAccount(selected);
});

// Member status toggle
statusToggle.addEventListener('change', () => {
  if (!viewingAccount) return;

  const newStatus: IAccountStatus = statusToggle.checked
    ? 'Active'
    : 'Inactive';

  if (newStatus === viewingAccount.status) return;

  // Self-inactivation — show confirmation modal
  if (isOwnAccount() && newStatus === 'Inactive') {
    // Revert the toggle visually until confirmed
    statusToggle.checked = true;

    showConfirm(
      "Do you really want to inactivate your account?\n\nIf you confirm, you'll be logged out and unable to log back in. Only an Administrator can reactivate accounts.",
      async () => {
        const { status, data } = await patchAccount(
          viewingAccount!.credentials.username,
          'status',
          { status: 'Inactive' as IAccountStatus }
        );
        if (status >= 200 && status < 300) {
          handleLogout();
        } else {
          const msg = getResponseMessage(data, 'Status update failed.');
          setFormStatus(msg, true);
        }
      }
    );
    return;
  }

  // Reactivation (shouldn't normally happen for Member, but handle it)
  patchAccount(viewingAccount.credentials.username, 'status', {
    status: newStatus
  }).then(({ status, data }) => {
    if (status >= 200 && status < 300) {
      if (data && isSuccess(data) && data.payload) {
        viewingAccount = data.payload as IUserAccount;
      }
      toggleStatusText.textContent = newStatus;
      setFormStatus('Status updated!');
    } else {
      // Revert toggle on failure
      statusToggle.checked = viewingAccount!.status === 'Active';
      const msg = getResponseMessage(data, 'Status update failed.');
      setFormStatus(msg, true);
    }
  });
});

// Confirm modal handlers
confirmYes.addEventListener('click', async () => {
  closeModal(confirmModal);
  if (pendingConfirmAction) {
    const action = pendingConfirmAction;
    pendingConfirmAction = null;
    await action();
  }
});

confirmNo.addEventListener('click', () => {
  pendingConfirmAction = null;
  closeModal(confirmModal);
});

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

  connectSocket();

  const { status, data } = await fetchAccount(username);

  if (status === 401) {
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

    // Set page title per wireframe
    if (isAdmin()) {
      pageTitle.textContent = 'Manage\nAccounts';
      pageTitle.style.whiteSpace = 'pre-line';
      userSelectorGroup.hidden = false;
      await populateUserSelector();
      userSelector.value = currentUserAccount.credentials.username;
    } else {
      pageTitle.textContent = 'Account';
    }

    renderReadMode();
    subscribeToAccount(currentUserAccount.credentials.username);
  } else {
    const message = getResponseMessage(data, 'Failed to load your account.');
    setFormStatus(message, true);
  }
});

// Menu toggle
const menuIcon = document.getElementById('menu-icon');
const dropdownMenu = document.getElementById('dropdown-menu');
const backIcon = document.getElementById('back-icon');

menuIcon?.addEventListener('click', () => {
  menuIcon.classList.toggle('is-active');
  dropdownMenu?.classList.toggle('is-active');
  backIcon?.classList.toggle('is-hidden');
});

// Logout from menu
const menuLogoutBtn = document.getElementById('menu-logout-btn');
menuLogoutBtn?.addEventListener('click', handleLogout);
