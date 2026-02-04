import type { ILogin, IUser } from '../../common/user.interface';
import type {
  IAuthenticatedUser,
  IResponse
} from '../../common/server.responses';
import { isSuccess } from '../../common/server.responses';

export {};

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

let pendingRegisterPayload: IUser | null = null;
let pendingAgreementUsername: string | null = null;
let pendingAgreementPassword: string | null = null;
let pendingRedirectToHome = false;

const setStatus = (message: string, isError = false) => {
  if (!statusEl) {
    return;
  }
  statusEl.textContent = message;
  statusEl.classList.toggle('status--error', isError);
};

const clearInputErrors = () => {
  usernameInput?.classList.remove('form-input--error');
  emailInput?.classList.remove('form-input--error');
  passwordInput?.classList.remove('form-input--error');
};

const setInputError = (errorName: string) => {
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

const setSubmitting = (isSubmitting: boolean) => {
  if (!submitBtn) {
    return;
  }
  submitBtn.disabled = isSubmitting;
  submitBtn.textContent = isSubmitting ? 'Submitting...' : 'Login/Register';
};

const parseJson = async <T>(response: Response): Promise<T | null> => {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
};

const getResponseMessage = (data: IResponse | null, fallback: string) => {
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
    MissingPassword: 'Missing Password'
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

const registerUser = async (body: IUser) => {
  const response = await fetch('/auth/users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const data = await parseJson<IResponse>(response);
  return { response, data };
};

const loginUser = async (username: string, password: string) => {
  const response = await fetch(`/auth/tokens/${encodeURIComponent(username)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ password })
  });

  const data = await parseJson<IResponse>(response);
  return { response, data };
};

const confirmAgreement = async (username: string, password: string) => {
  const response = await fetch(
    `/auth/users/${encodeURIComponent(username)}?agreed=true`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ password })
    }
  );

  const data = await parseJson<IResponse>(response);
  return { response, data };
};

const openModal = (modal: HTMLDivElement | null) => {
  if (!modal) {
    return;
  }
  modal.classList.add('is-open');
  modal.removeAttribute('inert');
};

const closeModal = (modal: HTMLDivElement | null) => {
  if (!modal) {
    return;
  }
  modal.classList.remove('is-open');
  modal.setAttribute('inert', '');
};

const openTermsModal = (username: string, password: string, shouldRedirect: boolean) => {
  pendingAgreementUsername = username;
  pendingAgreementPassword = password;
  pendingRedirectToHome = shouldRedirect;
  openModal(termsModal);
};

const handleAgreementAccept = async () => {
  if (!pendingAgreementUsername || !pendingAgreementPassword) {
    if (tosInput) {
      tosInput.checked = true;
    }
    closeModal(termsModal);
    return;
  }

  setSubmitting(true);
  try {
    const agreementResult = await confirmAgreement(pendingAgreementUsername, pendingAgreementPassword);
    if (!agreementResult.response.ok) {
      const agreementMessage = getResponseMessage(
        agreementResult.data,
        'Agreement update failed.'
      );
      setStatus(agreementMessage, true);
      return;
    }

    if (tosInput) {
      tosInput.checked = true;
    }
    closeModal(termsModal);
    setStatus('Agreement accepted. Redirecting to home...');
    if (pendingRedirectToHome) {
      window.setTimeout(() => {
        window.location.href = 'home.html';
      }, 1200);
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

form?.addEventListener('submit', async (event) => {
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
    const { response, data } = await loginUser(
      payload.credentials.username,
      payload.credentials.password
    );

    if (!response.ok) {
      const message = getResponseMessage(data, 'Login failed.');
      const errorName = data && 'name' in data ? data.name : '';
      setInputError(errorName);
      setStatus(message, true);
      return;
    }

    const authPayload =
      data && isSuccess(data) && data.payload && 'user' in data.payload
        ? (data.payload as IAuthenticatedUser)
        : null;
    const authenticatedUser = authPayload?.user ?? null;
    if (authenticatedUser && authenticatedUser.agreed === false) {
      // User hasn't agreed yet - show terms modal with password for PATCH
      openTermsModal(authenticatedUser.credentials.username, payload.credentials.password, true);
      return;
    }

    setStatus('Login successful. Redirecting to home...');
    window.setTimeout(() => {
      window.location.href = 'home.html';
    }, 1200);
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
    const { response, data } = await registerUser(registerBody);

    if (!response.ok) {
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
      // User checked ToS checkbox - send PATCH with password
      const agreementResult = await confirmAgreement(
        user.credentials.username,
        registerBody.credentials.password
      );
      if (!agreementResult.response.ok) {
        const agreementMessage = getResponseMessage(
          agreementResult.data,
          'Agreement update failed.'
        );
        setStatus(agreementMessage, true);
        return;
      }

      setStatus('Registered and agreed. Redirecting to home...');
      window.setTimeout(() => {
        window.location.href = 'home.html';
      }, 1200);
      return;
    }

    // User didn't check ToS checkbox - show terms modal
    openTermsModal(user.credentials.username, registerBody.credentials.password, true);
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
  window.location.href = 'home.html';
});