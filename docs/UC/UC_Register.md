# Common Use Case: Register User

Short Name: Register

Participating Actors  
The use case is initiated by a potential Member. 

Brief Description  
The use case allows a user who is a potential Member to join the app community by providing a new username, email address, and password. The Member is added to the app directory. A welcome message with usage terms is displayed.

Flow of Events

Basic Flow

1. The use case starts when the Member accesses the app using its home page and elects to join the app community.  
2. The app asks the Member to provide a username, email, and a password.  
3. The Member provides a username, email, and password.    
4. The app validates the username and password (according to the **username Rule** and **Password Rule**.   
5. The app  validates the Member’s eligibility to join the app community by relying on the email (according to the **Eligibility Rule**).   
6. The app asks the Member to confirm the creation of a new user.  
7. The Member confirms that a new user needs to be created.  
8. The app creates and saves a new Member, with the username, email, and password.   
9. The app adds the new Member to the app directory (an internal list of users).  
10. The app welcomes the new Member with a short welcome message that includes the terms for using the app.  
11. The app asks the Member to agree to the terms.   
12. The Member acknowledges that they agree to the terms.  
13. The app returns to the home page. The use case ends.

	  
Alternative Flows \[all mandatory\]

* A1 CanLogin. In step 4, if the user is already a community Member (the username already exists and the password is correct), then nothing happens. The use case ends (this flow will be refined in another use case called Login-Logout).  
* A2 EmailMissing. In step 2, if an email is not provided, it is assumed that the Member is trying to login, not join the app community. The use case ends (this flow will be refined in another use case called Login-Logout).  
* A3 MemberExists. In step 4, if the username already exists, but the password is incorrect (does not match the existing username), the app informs the Member that they need to re-enter the username and/or password. The use case returns to step 3\.  
* A4 UsernameInvalid. In step 4, if the username does not satisfy the app’s username selection requirements (defined under Username Rule below), the system asks the Member to provide a different username. The use case returns to step 3\.  
* A5 PasswordInvalid. In step 4, if the password does not satisfy the app’s password strength requirements (defined under **Password Rule** below), the app asks the Member to provide a different password. The use case returns to step 3\.  
* A6. Ineligible. In step 5, if the Member cannot be confirmed to be eligible to join the app community, the app informs the Member of this situation. The use case returns to step 2\.  
* A7. Cancels. In step 7, if the Member does not want to create a new user, the system returns to step 2\.  
* A8. Disagreement. In step 12, if the Member does not agree to the terms, the app informs the Member that the Member will not be able to access the app (login request will be denied) and the app returns to the home page. 

Rules

* **R1 Username Rule**: Usernames are provided by users and should be at least 4 characters long. They should not be in the list of [banned usernames](https://drive.google.com/file/d/1SOZeZz8YLAoQtuDHvwNMqkpTwnkHdvIG/view?usp=drive_link). They should not already exist. Usernames are NOT case sensitive.   
* **R2 Password Rule**: Passwords are provided by users and should be at least 4 characters long. Passwords ARE case sensitive.  
* **R3 Eligibility Rule**: This rule is specific to the application, and includes additional steps to verify that the Member is eligible to join the app community based on the email address provided. You can use any method you like. For example using one of these two options. Option 1: First check that the email belongs to a specific domain/subdomain (e.g., cmu.edu), then send a verification email with a code, and finally ask the user to enter the verification code on the registration page. Option 2: Use a third-party system, like Google, that can authenticate a user (e.g., all ECE users have a CMU Google account that uses Google OAuth sign-in, which in turn uses CMU SSO with an andrew account). You can decide this part, but must prototype with your wireframes required for this use case. 


Implementation Notes

* **Responsiveness**: While most users will use the application on a mobile device, the size of their devices will vary. Therefore, the application must be responsive to adjust to various screen sizes. Design your prototypes to look good on a “largish” phone screen.   
* **Browser Restriction:** Your application should work on a **Chrome** browser. It’s not necessary to support other browsers.  
* **Basic Security:** Authentication and client-server communication should follow standard security guidelines and practices. In particular, passwords should not be sent in the clear without encryption, nor stored as plain text (should be salted and hashed first before storing them). It should not be possible for an attacker to sniff a password in mid-transmission. The most practical way to achieve the latter is to use HTTPS/SSL, which will be possible when you deploy your application on the cloud (automatic with Render). 

FAQs about the Use Case

* Question: Can the Member change the username, email, or password after joining the community?    
  Answer: No. In a future common use case, an Administrator role will be defined. An Administrator will be able to make some of these changes and Members will also be able to update some of this information for themselves.   
* Question: Can the Member un-join?    
  Answer: No, not now, but later an Administrator will be able to deactivate any Member account in a future common use case, and a Member will be able to do it for their own account .   
* Question: Could the Member take a “selfie” and upload it?   
  Answer: This is a potential future team use case: don’t add any bells and whistles now, or implement anything extra that you think would be “cool” at this moment. Any extras must be introduced explicitly through a team use case. 
---

## Implementation Status (February 2026)

### Implemented
- Basic flow (Steps 1-12): Username/email/password input, validation, confirmation modal, ToS flow
- R1 Username Rule: ≥4 chars, banned list, case-insensitive
- R2 Password Rule: ≥4 chars + letter + number + special char (enhanced beyond UC)
- R3 Eligibility: CMU email domain check only (no verification email)
- All alternative flows (A1-A8)
- Security: bcrypt hashing, JWT auth

### Not Implemented
- Email verification (R3 Option 1) or Google OAuth (R3 Option 2)

### Design Decisions (differs from UC)
- **Password**: Stricter rules than UC spec (requires letter, number, special char)
- **Step 13**: Redirects to app directory instead of home page after registration + agreement