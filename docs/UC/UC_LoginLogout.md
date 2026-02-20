# Common Use Case: Login/Logout

Short Name: LoginLogout

Participating Actors  
The use case is initiated by a community Member.

Brief Description  
The use case allows the Member (who is already registered to login by providing an existing username and password. The Member can see themselves listed in the app directory, along with other Members. The Member can also logout.

Flow of Events

Basic Flow

1. The use case starts when an existing Member accesses the app using the home page in order to login.
2. The app asks the Member to provide a username and password.
3. The Member provides a username and password and elects to login (with the same button used in the Register use case).
4. The app validates the username and password by making sure that they correspond to an existing Member.
5. The app marks the Member as online internally.
6. The app displays the app directory in alphabetical order, starting with all the Members who are online, and followed by all the Members who are offline. (See implementation note on the **Online/Offline Status Update** below)
7. After verifying that he is listed in the directory, along with other Members if applicable, the Member elects to log out.
8. The app marks the Member as offline internally.
9. The app returns to its home page. The use case ends.

Alternative Flows \[all mandatory\]

- A1 NonexistingMember. In step 4, if the username and password do not correspond to an existing Member, the app follows the Register use case flow, except for the following: When the Member acknowledges that they agree to the terms provided in the welcome message, then the app displays the app directory (as described in step 6 above) instead of going back to the home page.
- A2. Disagreement. In step 4, the username and password are validated, but if during the Register UC, the Member had not agreed to the terms, then the welcome message with the terms are shown again, and the Member is once more asked to agree to the terms. If the Member agrees, the UC continues in step 5\. If the Member does not agree, the app returns to the home page.

Rules:

- **R1 OnlyUsernamePassword Rule**. In step 2, only username and password should be provided. If the Member also provides an email, the user is automatically assumed to be trying to register rather than login.

Implementation Notes

- **RESTfulness:** The use case (and ultimately the whole application) must comply with REST guidelines, providing RESTful operation. The most practical way to achieve this is to rely on **web tokens** rather than sessions and cookies. Once a client is authenticated, the server provides the client with a unique web token, which remains valid until the client logs out or until it expires. The web token is transmitted by the client with each subsequent request to prove that the client has already been authenticated. Cookies, however, can be used to store tokens on the client side. See below (Sessions vs. Tokens) for more information on this.
- **Sessions and Cookies vs. Tokens and Local Storage:** Normally, you have two choices with respect to managing authentication: sessions with cookies and web tokens. See this blog that explains both with advantages and disadvantages. Remember that the services provided by your app should be RESTful, meaning the server side should not keep track of client state. Sessions break this RESTfulness principle. Web tokens (e.g., JWT) avoid this and are also considered to be a more modern alternative to the session/cookie approach. It allows all requests to carry all the information they need for the server to process the request using only that information (no session look-up to determine the client state). Normally, on the client side, you store the token in the browser’s local or session storage. You may still use a cookie with the web token approach to store a token in the browser, but only for that purpose (serving as an alternative to local storage), and still maintain RESTfulness. Note however that cookies are automatically sent to the server with each request.  
  For further information, refer back to 18351/651 resources on the Security topic and these additional blogs:
  - [**https://stormpath.com/blog/where-to-store-your-jwts-cookies-vs-html5-web-storage**](https://stormpath.com/blog/where-to-store-your-jwts-cookies-vs-html5-web-storage)
  - [**https://dzone.com/articles/cookies-vs-tokens-the-definitive-guide**](https://dzone.com/articles/cookies-vs-tokens-the-definitive-guide)
- **Stateful Features:** A few of your team use cases may define a stateful feature that requires a client’s state to be stored and tracked by the server (for example if the use case involves a complex, multi-step transaction most naturally implemented by sessions). You can use sessions and cookies in these special use cases, however this is not advisable since it breaks the agreed-upon architecture of your app (if you do this, your Architecture Haiku will need to reflect this important decision). If you use cookies and sessions in select team use cases, it’s your responsibility to learn about them and use them properly. Features that use sessions and cookies must still build on substeps executed by RESTful endpoints, whenever possible.
- **Online/Offline Status Update:** This status must be updated dynamically for all Members. If a Member closes the browser tab, for any practical purposes the Member becomes offline (since they cannot be reached by other Members who should know). You can ask AI about how to detect a window-closing event and send a request to the backend to inform the server.

---

## Implementation Status (February 2026)

### Implemented

- Login/logout with JWT tokens (Steps 2-4, 9)
- R1 OnlyUsernamePassword Rule
- A2 Disagreement: Re-show terms if not agreed
- Token-based authorization middleware

### Not Implemented

- **Online/offline status** (Steps 5, 8): No `isOnline` field in user model
- **App directory listing** (Step 6): No `GET /appdir/users` endpoint, no UI to list members
- **Real-time status updates**: No Socket.io integration
- **Browser close detection**: No `beforeunload` handler
- **A1 NonexistingMember**: Shows error instead of redirecting to registration flow
