# TUC3: Live Notification

Shortname: LiveNotif

Participating Actors  
The use case is initiated by a Member. The supporting actors include GTFS-RT Alert Feed and the ScottyGo Server.

Brief Description  
The use case allows a logged-in user to subscribe to transit routes, submit crowd-sourced bus reports, and receive live notifications derived from those reports. The feature spans three pages: the **Map Page** (subscribe to routes and report on buses), the **Subscribe Page** (manage up to 10 route subscriptions), and the **Notification Page** (search and view live notifications and GTFS-RT alerts). The system uses the **Observer Pattern**: subscribers are observers of route-level notification topics, and the server publishes notification messages constructed from user-submitted bus reports.

Assumptions  
- The Member is logged into the app.
- The Member has already selected a route on the Map Page (TUC1/TUC2 basic flow completed).

---

## Flow of Events

### Basic Flow — Subscribe to a Route (Map Page)

1. The use case starts when the Member selects a route on the Map Page.
2. The app displays a **bell icon** .
3. The Member clicks the bell icon.
4. The app subscribes the Member to the route and displays a confirmation toast: _"Subscribed to Route {routeId}."_
5. The app creates a corresponding subscription card on the Subscribe Page. The basic flow ends.

### Basic Flow — Submit a Bus Report (Map Page)

1. The Member clicks on a bus marker on the Map Page.
2. The app displays the bus info card with a **triangle alert icon**.
3. The Member clicks the triangle alert icon.
4. The app displays two options: **Report** and **Check**.
5. The Member selects **Report**.
6. The app displays the Bus Report Form containing the following fields:
   - **How crowded is the bus?** (multiple choice: Empty / Few Seats Taken / Standing Room / Packed)
   - **Is priority seating available?** (multiple choice: Yes / No / Not Sure)
   - **Condition of the bus?** (multiple choice: Clean / Average / Dirty)
   - **Additional comments** (optional free-text, max 200 characters)
7. The Member fills out the form and clicks **Submit**.
8. The app sends the report to the server.
9. The server constructs a live notification message from the submitted report and publishes it to all observers (subscribers) of the bus's route.
10. The app displays a confirmation toast: _"Report submitted. Thank you!"_ The basic flow ends.

### Basic Flow — Manage Subscriptions (Subscribe Page)

1. The Member navigates to the Subscribe Page.
2. The app displays all active subscription cards. Each card shows:
   - Route number
   - Bell icon (toggle subscribe/unsubscribe)
   - Delete icon
3. The Member clicks on a subscription card.
4. The app redirects the Member to the Notification Page with the route number pre-filled in the search bar, displaying all notifications from the last 30 minutes for that route. The basic flow ends.

### Basic Flow — View Notifications (Notification Page)

1. The Member navigates to the Notification Page.
2. The app displays GTFS-RT alert messages below the search bar (default, no search active).
3. The Member types a query into the search bar.
4. The app dynamically displays predicted results matching route numbers and bus numbers as the user types.
5. The Member selects or confirms a search term.
6. The app displays matching live notifications and alert messages from the last 30 minutes. The basic flow ends.

---

## Alternative Flows

### Map Page

- **A1. Already Subscribed.** In Basic Flow (Subscribe) step 3, if the Member is already subscribed to the route, clicking the bell icon **unsubscribes** the Member. The app removes the subscription card from the Subscribe Page and displays a toast: _"Unsubscribed from Route {routeId}."_
- **A2. Subscription Limit Reached.** In Basic Flow (Subscribe) step 3, if the Member already has 10 active subscriptions, the app displays a toast: _"Subscription limit reached (10). Please remove a subscription first."_ The bell icon click is ignored.
- **A3. Check Notifications from Bus.** In Basic Flow (Report) step 5, the Member selects **Check** instead of Report. The app redirects the Member to the Notification Page with the bus number pre-filled in the search bar, displaying all notifications from the last 30 minutes for the selected bus.
- **A4. Report Submission Failure.** In Basic Flow (Report) step 8, if the server is unreachable or returns an error, the app displays a toast: _"Failed to submit report. Please try again."_
- **A5. Incomplete Report Form.** In Basic Flow (Report) step 7, if the Member clicks Submit without answering all required multiple-choice questions, the app highlights the unanswered fields and displays: _"Please complete all required fields."_

### Subscribe Page

- **A6. Unsubscribe via Bell Icon.** In Basic Flow (Manage) step 2, if the Member clicks the bell icon on a card, the app toggles the subscription off. The card remains visible but the bell icon changes to an "unsubscribed" state. Notifications for that route are paused.
- **A7. Delete Subscription Card.** In Basic Flow (Manage) step 2, if the Member clicks the delete icon, the app removes the subscription card and unsubscribes the Member from that route.
- **A8. Add New Subscription.** In Basic Flow (Manage) step 2, the Member clicks the **Add (+)** icon.
  1. The app displays a search bar.
  2. The Member types a route number.
  3. The app displays matching routes.
  4. The Member selects a route.
  5. The app creates a new subscription card and subscribes the Member to the route.
- **A9. Duplicate Subscription Attempt.** In A8 step 4, if the Member selects a route that already has a subscription card, the app displays a toast: _"You are already subscribed to Route {routeId}."_ No duplicate card is created.
- **A10. Add Icon Hidden at Limit.** If the Member has 10 subscription cards, the Add (+) icon is not displayed.
- **A11. No Subscriptions.** In Basic Flow (Manage) step 2, if the Member has no subscriptions, the app displays an empty state: _"No subscriptions yet. Use the map to subscribe to routes, or tap + to add one."_

### Notification Page

- **A12. No Matching Results.** In Basic Flow (Notifications) step 6, if no notifications or alerts match the search query, the app displays: _"No notifications found for '{query}'."_
- **A13. Free-Text Search.** In Basic Flow (Notifications) step 3, if the Member types a keyword that is neither a route number nor a bus number, the app searches notification content and alert messages for matches and displays relevant results.
- **A14. Pre-filled Search from External Navigation.** When the Member is redirected from the Map Page (A3) or Subscribe Page (Basic Flow Manage step 3), the search bar is pre-filled and results are loaded automatically without additional user input.
- **A15. GTFS-RT Alert Feed Unavailable.** In Basic Flow (Notifications) step 2, if the GTFS-RT alert feed is unreachable, the app displays: _"Service alerts are temporarily unavailable."_ User-submitted live notifications remain searchable.

---

## Rules

- **R1. Subscription Limit:** A Member may have at most **10** active subscription cards.
- **R2. No Duplicate Subscriptions:** A Member cannot create two subscription cards for the same route.
- **R3. Notification Recency:** The Notification Page and Check flow display only notifications from the **last 30 minutes**.
- **R4. Observer Pattern:** The server maintains a mapping of route → subscribed Members. When a new bus report is submitted, the server constructs a notification message and pushes it to all subscribers of that route.
- **R5. Report Fields:** The bus report form must include at minimum: crowdedness, priority seating availability, and bus condition as required multiple-choice fields, plus one optional free-text field (max 200 characters).
- **R6. Notification Content:** Live notification messages are derived exclusively from user-submitted bus reports. The server formats the report data into a human-readable notification.
- **R7. Add Icon Visibility:** The Add (+) icon on the Subscribe Page is hidden when the Member has 10 subscription cards and reappears when a card is deleted.
- **R8. Search Predictions:** The Notification Page search bar must display dynamic predicted results as the user types, matching against route numbers and bus numbers.

---

## Implementation Notes

- **Observer Pattern:** Implement using Socket.io. When a Member subscribes to a route, the server adds a socket-to-route mapping. On report submission, the server emits a notification event to all sockets subscribed to the relevant route.
- **Notification Storage:** Store notifications in MongoDB with a TTL index of 30 minutes so stale notifications are automatically purged.
- **Bus Reports:** Store reports in MongoDB. The server constructs a notification message (e.g., _"Bus #1234 on Route 61C — Packed, no priority seating, average condition"_) and publishes it via the observer channel.
- **GTFS-RT Alerts:** Fetch from the GTFS-RT alert feed and display as a default/fallback on the Notification Page when no search is active.
- **Subscribe Page State:** Persist subscription cards in MongoDB, linked to the Member's user ID. Load on page visit.
- **Pre-filled Navigation:** Use URL query parameters (e.g., `?route=61C` or `?bus=1234`) to pre-fill the Notification Page search bar when redirected from Map or Subscribe pages.
- **UI Components:** The bell icon, triangle alert icon, subscription cards, and report form should be implemented as reusable web components consistent with the existing component architecture.