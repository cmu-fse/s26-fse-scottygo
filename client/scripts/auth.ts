import axios, { AxiosResponse } from 'axios';
import './components/app-header';
import type { ILogin, IUser } from '../../common/user.interface';
import type {
  IAuthenticatedUser,
  IResponse
} from '../../common/server.responses';
import { isSuccess } from '../../common/server.responses';

export {};

const storeAuth = (token: string, username: string): void => {
  localStorage.setItem('token', token);
  localStorage.setItem('username', username);
};

const form = document.getElementById('auth-form') as HTMLFormElement | null;
const statusEl = document.getElementById(
  'status'
) as HTMLParagraphElement | null;
const submitBtn = document.getElementById(
  'submit-btn'
) as HTMLButtonElement | null;

const usernameInput = document.getElementById(
  'username'
) as HTMLInputElement | null;
const emailInput = document.getElementById('email') as HTMLInputElement | null;
const passwordInput = document.getElementById(
  'password'
) as HTMLInputElement | null;
const tosInput = document.getElementById('tos') as HTMLInputElement | null;
const confirmModal = document.getElementById(
  'confirm-modal'
) as HTMLDivElement | null;
const confirmYes = document.getElementById(
  'confirm-yes'
) as HTMLButtonElement | null;
const confirmNo = document.getElementById(
  'confirm-no'
) as HTMLButtonElement | null;
const termsModal = document.getElementById(
  'terms-modal'
) as HTMLDivElement | null;
const termsAccept = document.getElementById(
  'terms-accept'
) as HTMLButtonElement | null;
const termsDecline = document.getElementById(
  'terms-decline'
) as HTMLButtonElement | null;
const termsLink = document.getElementById(
  'terms-link'
) as HTMLButtonElement | null;
const declineModal = document.getElementById(
  'decline-modal'
) as HTMLDivElement | null;
const declineOk = document.getElementById(
  'decline-ok'
) as HTMLButtonElement | null;

let pendingRegisterPayload: IUser | null = null;
let pendingAgreementUsername: string | null = null;
let pendingAgreementPassword: string | null = null;
let pendingRedirectToHome = false;

const setStatus = (message: string, isError = false): void => {
  if (!statusEl) {
    return;
  }
  statusEl.textContent = message;
  statusEl.classList.toggle('status--error', isError);
};

const clearInputErrors = (): void => {
  usernameInput?.classList.remove('form-input--error');
  emailInput?.classList.remove('form-input--error');
  passwordInput?.classList.remove('form-input--error');
};

const setInputError = (errorName: string): void => {
  clearInputErrors();
  switch (errorName) {
    case 'MissingUsername':
    case 'InvalidUsername':
    case 'UserExists':
      usernameInput?.classList.add('form-input--error');
      break;
    case 'MissingPassword':
    case 'InvalidPassword':
      passwordInput?.classList.add('form-input--error');
      break;
    case 'IncorrectPassword':
      usernameInput?.classList.add('form-input--error');
      passwordInput?.classList.add('form-input--error');
      break;
    case 'MissingEmail':
    case 'InvalidEmail':
      emailInput?.classList.add('form-input--error');
      break;
  }
};

const setSubmitting = (isSubmitting: boolean): void => {
  if (!submitBtn) {
    return;
  }
  submitBtn.disabled = isSubmitting;
  submitBtn.textContent = isSubmitting ? 'Submitting...' : 'Login/Register';
};

const getResponseMessage = (
  data: IResponse | null,
  fallback: string
): string => {
  if (!data) {
    return fallback;
  }
  const errorName = 'name' in data ? data.name : '';
  // Map error names to wireframe messages
  const errorMessages: Record<string, string> = {
    UserExists: 'Username exists, Log in or try another username',
    IncorrectPassword: 'Incorrect username or password',
    InvalidUsername: 'Username less than 4 characters or invalid',
    InvalidPassword: 'Password should be at least 4 characters',
    InvalidEmail: 'You are ineligible, ScottyGo is CMU ONLY',
    MissingUsername: 'Missing Username',
    MissingPassword: 'Missing Password',
    InactiveAccount:
      'Your account is inactive. Please contact an administrator to reactivate your account.'
  };
  if (errorName in errorMessages) {
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
    return errorName;
  }
  return fallback;
};

const hasSuccessStatus = (status: number): boolean =>
  status >= 200 && status < 300;

const getAuthenticatedPayload = (
  data: IResponse | null
): IAuthenticatedUser | null => {
  if (data && isSuccess(data) && data.payload && 'user' in data.payload) {
    return data.payload as IAuthenticatedUser;
  }
  return null;
};

const storeAuthFromResponse = (data: IResponse | null): void => {
  const payload = getAuthenticatedPayload(data);
  if (payload?.token && payload?.user) {
    storeAuth(payload.token, payload.user.credentials.username);
  }
};

const redirectToDirectory = (message: string): void => {
  setStatus(message);
  window.setTimeout(() => {
    window.location.href = '/';
  }, 1200);
};

const agreeAndRefreshSession = async (
  username: string,
  password: string
): Promise<{ ok: true } | { ok: false; message: string }> => {
  const agreementResult = await confirmAgreement(username, password);
  if (!hasSuccessStatus(agreementResult.status)) {
    return {
      ok: false,
      message: getResponseMessage(
        agreementResult.data,
        'Agreement update failed.'
      )
    };
  }

  const loginResult = await loginUser(username, password);
  if (hasSuccessStatus(loginResult.status)) {
    storeAuthFromResponse(loginResult.data);
  }

  return { ok: true };
};

const registerUser = async (
  body: IUser
): Promise<{ status: number; data: IResponse | null }> => {
  try {
    const res: AxiosResponse<IResponse> = await axios.request({
      method: 'post',
      headers: { 'Content-Type': 'application/json' },
      data: body,
      url: '/auth/users',
      validateStatus: () => true
    });
    return { status: res.status, data: res.data };
  } catch {
    return { status: 500, data: null };
  }
};

const loginUser = async (
  username: string,
  password: string
): Promise<{ status: number; data: IResponse | null }> => {
  try {
    const res: AxiosResponse<IResponse> = await axios.request({
      method: 'post',
      headers: { 'Content-Type': 'application/json' },
      data: { password },
      url: `/auth/tokens/${encodeURIComponent(username)}`,
      validateStatus: () => true
    });
    return { status: res.status, data: res.data };
  } catch {
    return { status: 500, data: null };
  }
};

const confirmAgreement = async (
  username: string,
  password: string
): Promise<{ status: number; data: IResponse | null }> => {
  try {
    const res: AxiosResponse<IResponse> = await axios.request({
      method: 'patch',
      headers: { 'Content-Type': 'application/json' },
      data: { password },
      url: `/auth/users/${encodeURIComponent(username)}`,
      validateStatus: () => true
    });
    return { status: res.status, data: res.data };
  } catch {
    return { status: 500, data: null };
  }
};

const openModal = (modal: HTMLDivElement | null): void => {
  if (!modal) {
    return;
  }
  modal.classList.add('is-open');
  modal.removeAttribute('inert');
};

const closeModal = (modal: HTMLDivElement | null): void => {
  if (!modal) {
    return;
  }
  modal.classList.remove('is-open');
  modal.setAttribute('inert', '');
};

const openTermsModal = (
  username: string,
  password: string,
  shouldRedirect: boolean
): void => {
  pendingAgreementUsername = username;
  pendingAgreementPassword = password;
  pendingRedirectToHome = shouldRedirect;
  openModal(termsModal);
};

const handleAgreementAccept = async (): Promise<void> => {
  if (!pendingAgreementUsername || !pendingAgreementPassword) {
    if (tosInput) {
      tosInput.checked = true;
    }
    closeModal(termsModal);
    return;
  }

  setSubmitting(true);
  try {
    const agreementOutcome = await agreeAndRefreshSession(
      pendingAgreementUsername,
      pendingAgreementPassword
    );
    if (!agreementOutcome.ok) {
      setStatus(agreementOutcome.message, true);
      return;
    }

    if (tosInput) {
      tosInput.checked = true;
    }
    closeModal(termsModal);

    setStatus('Agreement accepted. Redirecting to directory...');
    if (pendingRedirectToHome) {
      redirectToDirectory('Agreement accepted. Redirecting to directory...');
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Network error. Please try again.';
    setStatus(message, true);
  } finally {
    pendingAgreementUsername = null;
    pendingAgreementPassword = null;
    pendingRedirectToHome = false;
    setSubmitting(false);
  }
};

form?.addEventListener('submit', async (event: SubmitEvent) => {
  event.preventDefault();
  setStatus('');
  clearInputErrors();

  if (!usernameInput || !passwordInput || !emailInput || !tosInput) {
    setStatus('Form is missing fields. Please refresh and try again.', true);
    return;
  }

  const credentials: ILogin = {
    username: usernameInput.value.trim(),
    password: passwordInput.value
  };

  const shouldAgree = tosInput.checked;
  const payload: IUser = {
    credentials,
    email: emailInput.value.trim(),
    agreed: false // Always false in POST; PATCH sent after if checkbox was checked
  };

  const isRegister = payload.email.length > 0;

  if (isRegister) {
    pendingRegisterPayload = { ...payload, agreed: shouldAgree }; // Store checkbox state for PATCH decision
    openModal(confirmModal);
    return;
  }

  setSubmitting(true);

  try {
    const { status, data } = await loginUser(
      payload.credentials.username,
      payload.credentials.password
    );

    if (!hasSuccessStatus(status)) {
      const errorName = data && 'name' in data ? data.name : '';

      // R5: Inactive accounts cannot log in - show error, don't show ToS modal
      if (errorName === 'InactiveAccount') {
        const message = getResponseMessage(data, 'Your account is inactive.');
        setStatus(message, true);
        return;
      }

      if (errorName === 'UnauthorizedRequest') {
        // If user already checked the ToS checkbox, process agreement directly
        if (shouldAgree) {
          const agreementOutcome = await agreeAndRefreshSession(
            payload.credentials.username,
            payload.credentials.password
          );
          if (!agreementOutcome.ok) {
            setStatus(agreementOutcome.message, true);
            return;
          }

          redirectToDirectory(
            'Agreement accepted. Redirecting to directory...'
          );
          return;
        }

        // Checkbox not checked — open the terms modal
        openTermsModal(
          payload.credentials.username,
          payload.credentials.password,
          true
        );
        return;
      }
      const message = getResponseMessage(data, 'Login failed.');
      setInputError(errorName);
      setStatus(message, true);
      return;
    }

    const authPayload = getAuthenticatedPayload(data);
    const authenticatedUser = authPayload?.user ?? null;

    if (authenticatedUser && authenticatedUser.agreed === false) {
      // User hasn't agreed yet - show terms modal with password for PATCH
      openTermsModal(
        authenticatedUser.credentials.username,
        payload.credentials.password,
        true
      );
      return;
    }

    storeAuthFromResponse(data);
    redirectToDirectory('Login successful. Redirecting to directory...');
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Network error. Please try again.';
    setStatus(message, true);
  } finally {
    setSubmitting(false);
  }
});

confirmYes?.addEventListener('click', async () => {
  if (!pendingRegisterPayload) {
    closeModal(confirmModal);
    return;
  }

  closeModal(confirmModal);
  setSubmitting(true);

  const shouldAgree = pendingRegisterPayload.agreed;
  const registerBody: IUser = {
    ...pendingRegisterPayload,
    agreed: false // Always false in POST
  };

  try {
    const { status, data } = await registerUser(registerBody);

    if (status < 200 || status >= 300) {
      const message = getResponseMessage(data, 'Registration failed.');
      const errorName = data && 'name' in data ? data.name : '';
      setInputError(errorName);
      setStatus(message, true);
      return;
    }

    const user =
      data && isSuccess(data) && data.payload && 'credentials' in data.payload
        ? (data.payload as IUser)
        : null;

    if (!user) {
      setStatus('Registration succeeded but user data is missing.', true);
      return;
    }

    if (shouldAgree) {
      const agreementOutcome = await agreeAndRefreshSession(
        user.credentials.username,
        registerBody.credentials.password
      );
      if (!agreementOutcome.ok) {
        setStatus(agreementOutcome.message, true);
        return;
      }

      redirectToDirectory('Registered and agreed. Redirecting to directory...');
      return;
    }

    // User didn't check ToS checkbox - show terms modal
    openTermsModal(
      user.credentials.username,
      registerBody.credentials.password,
      true
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Network error. Please try again.';
    setStatus(message, true);
  } finally {
    pendingRegisterPayload = null;
    setSubmitting(false);
  }
});

confirmNo?.addEventListener('click', () => {
  pendingRegisterPayload = null;
  closeModal(confirmModal);
});

termsAccept?.addEventListener('click', async () => {
  await handleAgreementAccept();
});

termsLink?.addEventListener('click', () => {
  pendingAgreementUsername = null;
  pendingAgreementPassword = null;
  pendingRedirectToHome = false;
  openModal(termsModal);
});

termsDecline?.addEventListener('click', () => {
  closeModal(termsModal);
  openModal(declineModal);
});

declineOk?.addEventListener('click', () => {
  closeModal(declineModal);
  window.location.href = '/';
});
