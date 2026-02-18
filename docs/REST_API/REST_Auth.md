# **Authentication API Documentation**

## **1\. Overview**

**Base Router Path:** /auth

This section covers the authentication endpoints, including user registration, login procedures, and client-side logout logic.

### **1.1 Interface Definitions**

**IUser**

* **credentials**: { username: string, password: string }  
* **\_id?**: string  
* **email**: string  
* **agreed**: boolean

**IAuthenticatedUser**

* **user**: IUser  
* **token**: string

**ISuccess\<T\>**

* **name**: string  
* **message?**: string  
* **authorizedUser?**: string  
* **payload**: T | null

---

## **2\. REST API Endpoints**

| Method | Path | Function | Resource or Response Type (Success) | Body Type |
| :---- | :---- | :---- | :---- | :---- |
| **GET** | / | Get combined login/register page | Static page: auth.html | *None* |
| **POST** | /users | Register User | ISuccess with IUser payload | IUser |
| **POST** | /tokens/:username | Login User | ISuccess with IAuthenticatedUser payload | { password: string } |
| **PATCH** | /users/:username? | Set agreement toggle | ISuccess with IUser payload | { password: string } |

---

## **3\. Request Payload Details**

### **3.1 Register User (POST /auth/users)**

* **Body Type:** IUser  
* **Fields:**  
  * **credentials** (object, required):  
    * **username** (string, required): username.  
    * **password** (string, required): Plaintext password (validated and hashed server-side).  
  * **\_id** (string, optional): Ignored if provided; the server assigns a unique ID.  
  * **email** (string, required): The user's email.  
  * **agreed** (boolean): Terms of Service agreement flag. Defaults to false if omitted.

**Example Body:**

JSON

```
{
  "credentials": ILogin {
    "username": "Username",
    "password": "Abc1$"
  },
  "email": "user@email.com",
  "agreed": false
}
```

### **3.2 Login User (POST /auth/tokens/:username)**

* **Path Parameters:**  
  * **username** (string, required): Username (must match credentials.username).  
* **Body Fields:**  
  * **password** (string, required): Plaintext password.

**Example Body:**

JSON

```
{
  "password": "Abc1$"
}
```

### **3.3 Set Agreement Toggle (PATCH /auth/users/:username)**

**Purpose:** Update the user record to indicate agreement. The client sends this request only when the user accepts.

* **Query Parameters:**  
  * **agreed** (boolean, required): Set to true when the user accepts.  
* **Path Parameters:**  
  * **username** (string, required): The user's unique username.  
* **Body Fields:**  
  * **password** (string, required): Plaintext password.

**Example Body:**

JSON

```
{
  "password": "Abc1$"
}
```

---

## **4\. Response Payload Details**

### **4.1 UserRegistered (HTTP 201\)**

* **Success Name:** UserRegistered  
* **Payload Type:** IUser  
* **Fields:** \_id, credentials.username, credentials.password (obfuscated), email, agreed.

### **4.2 UserAuthenticated (HTTP 200\)**

* **Success Name:** UserAuthenticated  
* **Payload Type:** IAuthenticatedUser  
* **Fields:**  
  * **user**: Full IUser object (password obfuscated).  
  * **token**: JWT (JSON Web Token) for session management.

---

## **5\. Agreement Gate**

The user record contains an agreement toggle (agreed).

1. **Registration:** Backend creates the record even if agreed is false.  
2. **Access:** Backend blocks access to post-registration landing pages if agreed is false.  
3. **Client Logic:** On login, if agreed is false, the client must re-trigger the agreement dialog.  
4. **Acceptance:** Upon acceptance, the client calls the **PATCH** endpoint to proceed.

## **6\. Logout Logic**

**Note:** There is no REST endpoint for logout. Authentication is managed client-side by:

1. Clearing **Local Storage**.  
2. Removing the **Token**.  
3. Removing the **User Object**.  
4. Redirecting to the /auth path.

---

## **7\. Response Codes and Error Names**

### **Success (200/201)**

* UserRegistered, UserAuthenticated, UserAgreed

### **Client Errors (400)**

* MissingUsername, MissingPassword, MissingEmail, InvalidPassword, InvalidEmail, InvalidUsername, UserExists, UnregisteredUser, IncorrectPassword, InvalidToken, UnauthorizedRequest

### **Server Errors (500)**

* FailedAuthentication, PostRequestFailure, MongoDBError, PatchRequestFailure, TokenError, GetRequestFailure

