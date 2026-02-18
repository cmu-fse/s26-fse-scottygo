# **Team ScottyGo Architecture Haiku** 

CMU transit hub integrating real-time public and shuttle data with student-contributed service updates.

## ---

**Technical Constraints:** 

* Platform: App must work on Chrome and be responsive to different screen sizes  
* Programming languages: TypeScript (Node.js with Express on backend), HTML, CSS  
* Software Stack & Technology: Google Maps API, True Time API, Tripshot Data  
* Architectural styles or patterns: Repository architecture, event-driven architecture, uniform RESTful Architecture, MVC model with DB access only by models, which hold the core application logic  
* Authentication/Authorization: Stateless Token-Based Authentication using JSON Web Tokens (JWT) and bcrypt

---

## **Features:** 

* Route Visualization: PRT and CMU Shuttle route visualization over Google Maps   
* Real-Time Bus Tracking: Live vehicle locations and dynamic reroutes based on current event data  
* Live Notifications: Service alerts generated from integrated active and passive user reports  
* Stop and Schedule Discovery: Identifies nearby stops and provides upcoming arrival times with vehicle capacity insights  
* Offline Route Mapping: Maintains a visible record of transit paths for use when network connectivity is unavailable  
* User Registration: Users can register and create an account  
* User Login / Logout: Users can log in and out of their accounts  
* Manage Account: Users can manage their accounts  
* Search Information: In addition to searching for users via username and email address, 2 more searches are defined in the Team Use Case (TUC) 

---

## **Top NFRs:** 

* Usability  (Easy to learn and use on Chrome/mobile): Users need info fast, without confusion / Responsive \+ accessible UI; quick task-based user tests.  
* Testability (Easy to verify correctness with automated tests): Prevent regressions across auth, DB, and external APIs / Isolate/mocks for DB \+ APIs; add Jest unit \+ route integration tests.

---

## **Architectural Decisions:** 

* Service-layer abstraction to keep our data sources' logic separate from our UI  
* Communication & interface constraints: The PRT TrueTime API / web service (usage limits apply)  	  
* Use [Socket.io](http://Socket.io) to provide real-time server-client dynamic updates (client-server interaction via HTTP)  
* Employ MongoDB as the central database  
* We use Mongoose (ODM) to centralize MongoDB interactions through Schema-based models	

---

## **Design Decisions:** 

* \<design pattern name\>: \<reason\>  
* The dependency on the database is broken by confining all persistence logic to the Model layer, ensuring that Controllers and Views interact only with Models and remain independent of database-specific concerns  
* Shared Type Definitions: Ensures consistency and type safety across the full stack

---

## **Responsibilities of Main Components:** 

| serve.ts/app.ts: Configures and starts the application  controllers: Route HTTP/WebSocket requests and delegate operations to models model: Define domain entities and encapsulate their persistence logic services: Isolate business logic from controllers to enable reusability and testability db: Provide database abstraction, connection management, and a centralized access interface via DAC singleton | common: Shared TypeScript interfaces between frontend and backend pages: Define server-rendered HTML templates used for dynamic page generation styles: Contain CSS assets that define the application's visual design system scripts: Implement client-side JavaScript for DOM manipulation, user interactions, and Socket.IO client connections |
| :---- | :---- |

