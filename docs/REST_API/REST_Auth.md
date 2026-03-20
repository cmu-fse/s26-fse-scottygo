# **Authentication API Documentation**

## **1\. Overview**

**Base Router Path:** /auth

This section covers the authentication endpoints, including user registration, login procedures, and client-side logout logic.

### **1.1 Interface Definitions**

- **ILogin**
  - **username**: string
  - **password**: string

- **IUser**
  - **credentials**: ILogin
  - **\_id?**: string
  - **email**: string
  - **agreed**: boolean

- **ITokenPayload**
  - **userId**: string — User's \_id (immutable, source of truth)
  - **username**: string — Included for convenience
  - **iat?**: number — Issued at (set by jwt.sign)
  - **exp?**: number — Expiration time (set by jwt.sign)

- **IAuthenticatedUser**
  - **token**: string
  - **user**: IUser

- **ISuccess**
  - **name**: SuccessName
  - **message?**: string
  - **authorizedUser?**: string
  - **metadata?**: Record\<string, unknown\>
  - **payload**: IPayload

- **IAppError** (extends Error)
  - **type**: 'ClientError' | 'ServerError'
  - **name**: string
  - **message**: string

---

## **2\. REST API Endpoints**

| Method | Path | Function | Resource or Response Type (Success) | Body Type |
| :-- | :-- | :-- | :-- | :-- |
| **GET** | / | Get combined login/register page | Static page: auth.html | _None_ |
| **POST** | /users | Register User | ISuccess with IUser payload (HTTP 201) | IUser |
| **POST** | /tokens/:username? | Login User | ISuccess with IAuthenticatedUser payload (HTTP 200) | { password: string } |
| **PATCH** | /users/:username | Set agreement to true | ISuccess with IUser payload (HTTP 200) | { password: string } |

---

## **3\. Request Payload Details**

### **3.1 Register User (POST /auth/users)**

- **Body Type:** IUser
- **Fields:**
  - **credentials** (object, required):
    - **username** (string, required): Must be at least 4 characters. Cannot be a reserved username (e.g., "admin", "root", "api", etc.). Lowercased before saving.
    - **password** (string, required): Plaintext password. Must be at least 4 characters and contain at least one letter, one number, and one special character (`$%#@!*&~^-+`). Only letters, numbers, and the listed special characters are allowed. Hashed with bcrypt server-side before storage.
  - **\_id** (string, optional): Ignored if provided; the server assigns a UUID.
  - **email** (string, required): Must be a valid CMU email address (matches `@cmu.edu` or `@subdomain.cmu.edu`, e.g., `@andrew.cmu.edu`).
  - **agreed** (boolean): Terms of Service agreement flag.

**Validation Order:** email format → username format → duplicate username check → password strength.

**Example Body:**

```json
{
  "credentials": {
    "username": "scotty",
    "password": "Abc1$"
  },
  "email": "scotty@andrew.cmu.edu",
  "agreed": false
}
```

### **3.2 Login User (POST /auth/tokens/:username)**

- **Path Parameters:**
  - **username** (string, required): The user's username.
- **Body Fields:**
  - **password** (string, required): Plaintext password.

**Server-side checks (in order):**

1. Validates credentials against the database (username lookup + bcrypt password comparison).
2. Checks account status — if `Inactive`, returns **403** with `InactiveAccount` error.
3. Checks agreement — if `agreed` is false, returns **401** with `UnauthorizedRequest` error.
4. Generates JWT with `ITokenPayload` (contains immutable `userId` and `username`).

**Example Body:**

```json
{
  "password": "Abc1$"
}
```

### **3.3 Set Agreement to True (PATCH /auth/users/:username)**

**Purpose:** Sets the user's `agreed` field to `true`. The server validates the user's credentials before updating. There are no query parameters; the endpoint unconditionally sets `agreed` to `true`.

- **Path Parameters:**
  - **username** (string, required): The user's username.
- **Body Fields:**
  - **password** (string, required): Plaintext password (used to re-validate the user before updating).

**Example Body:**

```json
{
  "password": "Abc1$"
}
```

---

## **4\. Response Payload Details**

### **4.1 UserRegistered (HTTP 201\)**

- **Success Name:** UserRegistered
- **Headers:** `Location: /auth/users/{username}`
- **Payload Type:** IUser
- **Fields:** \_id, credentials.username, credentials.password (obfuscated as `"obfuscated"`), email, agreed.

**Example Response:**

```json
{
  "name": "UserRegistered",
  "payload": {
    "credentials": { "username": "scotty", "password": "obfuscated" },
    "email": "scotty@andrew.cmu.edu",
    "agreed": false,
    "_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
  }
}
```

### **4.2 UserAuthenticated (HTTP 200\)**

- **Success Name:** UserAuthenticated
- **Payload Type:** IAuthenticatedUser
- **Fields:**
  - **token**: JWT containing `ITokenPayload` (userId, username, iat, exp).
  - **user**: Full IUser object (password obfuscated as `"obfuscated"`).

**Example Response:**

```json
{
  "name": "UserAuthenticated",
  "message": "User scotty is authenticated",
  "payload": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "credentials": { "username": "scotty", "password": "obfuscated" },
      "email": "scotty@andrew.cmu.edu",
      "agreed": true,
      "_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
    }
  }
}
```

### **4.3 UserAgreed (HTTP 200\)**

- **Success Name:** UserAgreed
- **Payload Type:** IUser
- **Fields:** \_id, credentials.username, credentials.password (obfuscated as `"obfuscated"`), email, agreed (set to true).

**Example Response:**

```json
{
  "name": "UserAgreed",
  "message": "User agreed status successfully set to true",
  "payload": {
    "credentials": { "username": "scotty", "password": "obfuscated" },
    "email": "scotty@andrew.cmu.edu",
    "agreed": true,
    "_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
  }
}
```

---

## **5\. Agreement Gate**

The user record contains an agreement toggle (`agreed`).

1. **Registration:** Backend creates the record even if `agreed` is false.
2. **Login Block:** If `agreed` is false at login time, the server rejects the login with a **401** `UnauthorizedRequest` error. The user cannot obtain a token until they agree.
3. **Client Logic:** On receiving `UnauthorizedRequest` due to agreement, the client must display the agreement dialog and call the **PATCH** endpoint upon acceptance.
4. **Acceptance:** The PATCH endpoint validates credentials, then sets `agreed` to true. After that, the user can log in successfully.

## **6\. Inactive Account Gate**

User accounts have an `IAccountStatus` field (`Active` or `Inactive`).

- During login, after credential validation, the server checks the account status.
- If the account is `Inactive`, the server returns **403** with `InactiveAccount` error and the message: _"Your account is inactive. Please contact an administrator to reactivate your account."_
- This check occurs before the agreement check.

## **7\. Logout Logic**

**Note:** There is no REST endpoint for logout. Authentication is managed client-side by:

1. Clearing **Local Storage**.
2. Removing the **Token**.
3. Removing the **User Object**.
4. Redirecting to the /auth path.

---

## **8\. Response Codes and Error Names**

### **Success**

| HTTP Code | Name              | Endpoint                    |
| :-------- | :---------------- | :-------------------------- |
| 201       | UserRegistered    | POST /auth/users            |
| 200       | UserAuthenticated | POST /auth/tokens/:username |
| 200       | UserAgreed        | PATCH /auth/users/:username |

### **Client Errors**

| HTTP Code | Name | Condition |
| :-- | :-- | :-- |
| 400 | MissingUsername | Username not provided in path or body |
| 400 | MissingPassword | Password not provided in body |
| 400 | MissingEmail | Email not provided in register body |
| 400 | InvalidUsername | Username \< 4 chars or is a reserved name |
| 400 | InvalidEmail | Email is not a valid CMU email address |
| 400 | WeakPassword | Password fails strength requirements (length, letter, number, special char) |
| 400 | InvalidPassword | Password contains characters outside the allowed set |
| 400 | UserExists | User with same username and password already exists |
| 400 | IncorrectPassword | Wrong password for an existing user |
| 400 | UserNotFound | No user found with the given username |
| 401 | UnauthorizedRequest | User has not agreed to Terms of Service |
| 403 | InactiveAccount | User account is inactive |

### **Server Errors**

| HTTP Code | Name                | Condition                           |
| :-------- | :------------------ | :---------------------------------- |
| 500       | MongoDBError        | Unexpected database or server error |
| 500       | PatchRequestFailure | Failed to update user agreed status |
