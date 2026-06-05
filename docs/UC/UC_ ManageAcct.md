# Use Case: Manage User Account

Short Name: ManageAcct

Participating Actors  
The use case is initiated by an Administrator or a Member. Email Sender is a supporting actor that gets involved only upon certain user actions.

Brief Description  
The use case allows the Administrator or Member to change the account information related to a user, as permitted.

Assumptions  
The Administrator or Member is logged into the app. Refer to **R1 At-least-One-Administrator** and **R2** **Initial-Administrator** rules below.

Flow of Events

Basic Flow

1. The use case starts when the Administrator or Member elects to administer the account of a specific user or themselves (based on their username).
2. The app displays the user account elements that the user is permitted to change (Refer to the **Account Element** column of the **R3 User Account Rule** below).
3. The app displays a way to modify each element.
4. The Administrator or Member proposes one or more permitted changes to the account (Refer to the **Administrator Action** or **Member Action** columns of the **User Account Rule** below)
5. The app validates the proposed changes as applicable (Refer to the **System Validation** column of the **User Account Rule** below).
6. The app displays the changes as valid.
7. The app asks the Administrator or Member to submit the changes.
8. The Administrator or Member submits the changes.
9. The app stores the changes.
10. The app takes the appropriate actions to affect any required subsequent changes in the app’s behavior. (Refer to the **Additional System Action** column of the **User Account Rule** below).

Alternative Flows

- A1 InvalidChanges. In step 5, if one or more of the proposed changes cannot be validated, the app marks the corresponding changes as invalid. The use case returns to step 3\.
- A2 CancelChanges. At any time, the Administrator or Member can elect to stop changing the account. The use case ends.

Rules

- **R1 At-Least-One-Administrator Rule**: There is at least one active Administrator in the system.

- **R2 Initial-Administrator Rule**: Out of the box, the system comes with an Administrator user defined as follows:

| Username            | Admin         |
| :------------------ | :------------ |
| **Password**        | admin         |
| **Email**           | _undefined_   |
| **Privilege Level** | Administrator |
| **Account Status**  | Active        |

- **R3 User Account Rule**:

| Account Element | Administrator Action | Member Action | System Validation | Additional System Action |
| --- | --- | --- | --- | --- |
| Account Status | Allowed to switch any user’s account between **Active** & **Inactive** | Allowed to switch own account between **Active** & **Inactive** | Any change from one status to another is valid. | Refer to the **Active/Inactive Rule** |
| Privilege Level | Allowed to switch any user’s account among **Administrator, Coordinator**, **Member**. By default, any new account created has the **Member** privilege | Not allowed | Any change from one Privilege Level to another is valid. | Refer to the **Privilege Rule** |
| Username | Not allowed | Allowed to change own username only | Validate that the change follows the Username Rule including proper format and that the proposed new username does not already exist. |  |
| Email | Not allowed | Allowed to change own email only | Validate that the change follows the Eligibility Rule. |  |
| Password (current password not to be displayed on screen) | Allowed to change any user’s password | Allowed to change own password only | Validate that the change follows the Password Rule. |  |

- **R4 Privilege Rule**:  
  A privilege change takes effect only next time the user logs into the app.  
  _\[Note: This rule does not need to be modeled in OOA or covered with user stories.\]_

| Privilege Level | Possible Actions |
| --- | --- |
| Member | Users at this level of privilege can perform all the use cases that the **Member** actor can initiate |
| Coordinator | Users at this level of privilege can perform all the use cases that the **Member & Coordinator** actors can initiate |
| Administrator | Users at this level of privilege can perform all the use cases that the **Member, Coordinator & Administrator** actors can initiate |

- **R5 Active/Inactive Rule**:
  - **Active** is the default status of an account
  - A logged in member whose account becomes **Inactive** is logged out of the app with an email sent to the registered email address. _\[Note: This is the only element of the Active / Inactive Rule to be modeled in OOA\]_
  - If there is only one Administrator in the system, that Administrator cannot inactivate its own account by **R1** above.
  - A logged out member whose account becomes **Inactive** cannot log into the app any longer, but receives an informing message upon trying. An Inactive account can only be reactivated by an Administrator. Provided there are multiple Administrators, only another Administrator can reactivate an **Inactive** Administrator.
  - Information and resources associated with an **Active** account are visible to other users, as applicable.
  - Information and resources associated with an **Inactive** account remain in the app, but are invisible to all users (except for User Account information, which is visible to the Administrator for administration purposes).
