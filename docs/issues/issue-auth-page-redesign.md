# Issue: Redesign Auth Page with Separate Login and Register Views

## Summary

Redesign the auth page (`/auth`) to have two distinct views — **Login** and **Register** — instead of the current single combined form. Add real-time client-side field validation on the Register view that mirrors backend rules, showing inline feedback below each field as the user types.

## Problem

The current auth page combines login and registration into a single form with a single "Login/Register" button. The form decides whether to log in or register based on whether the email field has a value. This is unintuitive:

- Users don't know if they're logging in or registering
- The email field label says "Email (only for registration)" which is confusing
- The ToS checkbox is visible during login but irrelevant
- There's no client-side validation — all errors come back from the server after submission
- No confirm-password field to catch typos during registration

## Proposed Solution

### Section 1: Two-View Layout

Split the auth page into two switchable views within the same page (no navigation, just DOM toggling).

**Login View** contains: | Element | Details | |----------------------|---------------------------------------------| | Username field | Text input | | Password field | Password input | | Login button | Primary submit — calls `POST /auth/tokens/:username` | | Register button | Secondary — switches to Register view |

**Register View** contains: | Element | Details | |----------------------|---------------------------------------------| | Username field | Text input with inline validation | | Email field | Email input with inline validation | | Password field | Password input with inline validation | | Confirm Password | Password input — must match Password field | | ToS checkbox + link | Same Terms of Service modal flow as today | | Register button | Primary submit — calls `POST /auth/users` | | Back to Login button | Secondary — switches back to Login view |

### Section 2: Real-Time Inline Validation (Register View)

Validation is performed **server-side** by calling a new backend endpoint. The client sends each field value to the backend on `input` (debounced ~300ms) and on `blur`. The backend runs the existing validation logic in `user.validation.ts` and returns either success or the specific error. The client displays the result below the field — green check + text when valid, red × + text when invalid. Validation stays hidden until the user has interacted with the field.

**New backend endpoint**: `POST /auth/validate`

Request body:

```json
{ "field": "username" | "email" | "password", "value": "string" }
```

Response (success): `{ "name": "ValidationPassed", "message": "Valid" }`

Response (failure): `{ "name": "InvalidUsername" | "InvalidEmail" | "WeakPassword" | ..., "message": "Username must be at least 4 characters long" }`

The endpoint calls the existing `validateUsernameFormat()`, `validateEmailFormat()`, and `validatePasswordStrength()` functions from `user.validation.ts` — no validation logic is duplicated on the client.

**Username**: Backend validates length ≥4 and reserved name list. Display: `✓ Looks good` or `✗ <server message>`

**Email**: Backend validates CMU email pattern. Display: `✓ Valid CMU email` or `✗ <server message>`

**Password**: Backend validates all strength rules. Display: `✓ Strong password` or `✗ <server message>`

**Confirm Password** (client-side only):

- Must match the Password field exactly
- Display: `✓ Passwords match` or `✗ Passwords do not match`

### Section 3: Preserved Flows

All existing backend flows must remain unchanged:

- Login → success → redirect to home
- Login → `UnauthorizedRequest` (ToS not agreed) → show Terms modal → PATCH agreement → redirect
- Login → `InactiveAccount` → show error, no ToS modal
- Register → confirm modal → `POST /auth/users` → optional PATCH agreement → redirect
- Terms modal accept/decline flow stays the same
- The Register button on the Register view replaces the current "confirm account creation" modal trigger (i.e., still shows the confirm modal before actually calling the API)

## Files to Modify

| File | Changes |
| --- | --- |
| `client/pages/auth.html` | Restructure form into two view containers; add confirm-password field; add validation message elements |
| `client/scripts/auth.ts` | Add view-switching logic; add debounced validation calls to `POST /auth/validate`; wire up separate Login/Register submit flows; keep all modal + agreement logic |
| `client/styles/auth.css` | Style the two views, validation messages (valid/invalid states), view transition |
| `server/controllers/auth.controller.ts` | Add `POST /auth/validate` endpoint that calls existing validation functions |
| `server/models/user.validation.ts` | No changes — existing validation functions are reused as-is |

## Acceptance Criteria

- [ ] Auth page loads in **Login view** by default
- [ ] Login view has only: username, password, Login button, Register button
- [ ] Clicking "Register" switches to Register view (no page reload)
- [ ] Register view has: username, email, password, confirm password, ToS checkbox+link, Register button, Back to Login button
- [ ] Clicking "Back to Login" switches back to Login view
- [ ] Inline validation shows below each Register field after user interaction
- [ ] Username validation calls `POST /auth/validate` and displays server response
- [ ] Email validation calls `POST /auth/validate` and displays server response
- [ ] Password validation calls `POST /auth/validate` and displays server response
- [ ] Confirm Password validates client-side: matches password field
- [ ] No validation logic is duplicated on the client (except confirm password match)
- [ ] Register button is disabled until all validations pass and ToS is checked
- [ ] All existing login flows (success, ToS agreement, inactive account) work unchanged
- [ ] All existing register flows (confirm modal, agreement, redirect) work unchanged
- [ ] Login view does not show email, confirm password, or ToS
- [ ] Dark mode styling works for both views and validation messages
