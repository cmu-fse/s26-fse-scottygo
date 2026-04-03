# **Live Notification API Documentation**

## **1\. Overview**

**Base Router Path:** /notifications

This section covers the live notification endpoints, including route subscriptions, bus report submission, notification retrieval, and GTFS-RT service alerts. All endpoints require authentication (Bearer token in Authorization header).

**Real-Time Transport:** Socket.io is used for push-based live notification delivery (Observer Pattern). REST endpoints handle CRUD operations and data retrieval.

**Search Behavior:** Notification searches use the Strategy Pattern. The server selects a search strategy based on query parameters (`route`, `bus`, `q`, or combinations) to keep search logic extensible.

### **1.1 Interface Definitions**

- **ISubscription**
  - **\_id?**: string
  - **userId**: string — User's \_id (from JWT)
  - **routeId**: string — Subscribed route (e.g., "61C", "P1")
  - **createdAt**: string — ISO timestamp

- **IBusReport**
  - **\_id?**: string
  - **userId**: string — Reporter's \_id (from JWT)
  - **vid**: string — Vehicle ID being reported on
  - **routeId**: string — Route the bus is operating on
  - **crowdedness?**: 'Empty' | 'Few Seats Taken' | 'Standing Room' | 'Packed'
  - **prioritySeating?**: 'Available' | 'Occupied'
  - **condition?**: 'Clean' | 'Dirty' | 'Needs Maintenance'
  - **comment?**: string — Free-text comment (moderated by LLM)
  - **lat**: number — Reporter's latitude at time of submission
  - **lon**: number — Reporter's longitude at time of submission
  - **createdAt**: string — ISO timestamp

- **INotification**
  - **\_id?**: string
  - **routeId**: string — Route this notification pertains to
  - **vid**: string — Vehicle ID
  - **message**: string — Human-readable notification text
  - **changedFields**: string[] — Fields that changed (e.g., ["crowdedness", "condition"])
  - **reportId**: string — Reference to the originating IBusReport
  - **createdAt**: string — ISO timestamp (TTL: 30 minutes)

- **IServiceAlert**
  - **id**: string — GTFS-RT alert ID
  - **headerText**: string — Alert headline
  - **descriptionText**: string — Full alert description
  - **routeIds**: string[] — Affected routes
  - **activePeriods**: { start: string; end: string }[] — Active time ranges (ISO timestamps)

- **ISuccess\<T\>**
  - **name**: SuccessName
  - **message?**: string
  - **authorizedUser?**: string
  - **payload**: T | null

- **IAppError**
  - **type**: 'ClientError' | 'ServerError'
  - **name**: string
  - **message**: string

---

## **2\. REST API Endpoints**

| Method | Path | Function | Resource or Response Type (Success) | Body Type |
| :-- | :-- | :-- | :-- | :-- |
| **GET** | /subscriptions | Get user's active subscriptions | ISuccess\<ISubscription[]\> (HTTP 200) | _None_ |
| **POST** | /subscriptions | Subscribe to a route | ISuccess\<ISubscription\> (HTTP 201) | { routeId: string } |
| **DELETE** | /subscriptions/:routeId | Unsubscribe from a route | ISuccess (HTTP 200) | _None_ |
| **POST** | /reports | Submit a bus report | ISuccess\<IBusReport\> (HTTP 201) | IBusReport fields |
| **GET** | /notifications | Search notifications (last 30 min) | ISuccess\<INotification[]\> (HTTP 200) | _None_ |
| **GET** | /alerts | Get GTFS-RT service alerts | ISuccess\<IServiceAlert[]\> (HTTP 200) | _None_ |

---

## **3\. Request Payload Details**

### **3.1 Get Subscriptions (GET /notifications/subscriptions)**

- **Headers:** Authorization: Bearer \<token\>
- **Query Parameters:** _None_
- **Purpose:** Retrieves all active subscription cards for the authenticated user. Used by the Subscribe Page on load.
- **Example Request:** `GET /notifications/subscriptions`

### **3.2 Subscribe to Route (POST /notifications/subscriptions)**

- **Headers:** Authorization: Bearer \<token\>
- **Body Fields:**
  - **routeId** (string, required): The route to subscribe to (e.g., "61C", "P1").
- **Validation:**
  - Route must exist.
  - User must not already be subscribed to the route (R2 — no duplicates).
  - User must have fewer than 10 active subscriptions (R1 — subscription limit).
- **Server Behavior:** Creates a subscription record in MongoDB and registers the user's socket connection as an observer for the route's notification topic.

**Example Body:**

```json
{
  "routeId": "61C"
}
```

### **3.3 Unsubscribe from Route (DELETE /notifications/subscriptions/:routeId)**

- **Headers:** Authorization: Bearer \<token\>
- **Path Parameters:**
  - **routeId** (string, required): The route to unsubscribe from.
- **Purpose:** Removes the subscription record and deregisters the socket from the route's notification topic.
- **Example Request:** `DELETE /notifications/subscriptions/61C`

### **3.4 Submit Bus Report (POST /notifications/reports)**

- **Headers:** Authorization: Bearer \<token\>
- **Body Fields:**
  - **vid** (string, required): Vehicle ID of the bus being reported.
  - **routeId** (string, required): Route the bus is on.
  - **crowdedness** (string, optional): One of `"Empty"`, `"Few Seats Taken"`, `"Standing Room"`, `"Packed"`.
  - **prioritySeating** (string, optional): One of `"Available"`, `"Occupied"`.
  - **condition** (string, optional): One of `"Clean"`, `"Dirty"`, `"Needs Maintenance"`.
  - **comment** (string, optional): Free-text comment. Subject to LLM content moderation (R11).
  - **lat** (number, required): Reporter's current latitude.
  - **lon** (number, required): Reporter's current longitude.
- **Validation:**
  - At least one optional field (crowdedness, prioritySeating, condition, or comment) must be provided (R5).
  - Reporter must be within **0.5 miles** of the bus (R9). The server validates proximity using the bus's coordinates from the in-memory vehicle positions service (Haversine formula).
  - If a comment is provided, it is sent to the LLM moderation service. Flagged comments are excluded from the notification (R11).
- **Server Behavior:**
  1. Validates proximity (server-side, using vehicle positions service).
  2. Stores the report in MongoDB.
  3. Compares reported fields against the **last known bus status** (R12).
  4. If any field changed: constructs a notification message highlighting only changed fields (R6), stores the notification (TTL: 30 min), and publishes it via Socket.io to all route subscribers.
  5. If no field changed: stores the report but does **not** publish a notification (A18).

**Example Body:**

```json
{
  "vid": "3301",
  "routeId": "61C",
  "crowdedness": "Packed",
  "condition": "Dirty",
  "comment": "Very crowded today",
  "lat": 40.4418,
  "lon": -79.944
}
```

### **3.5 Search Notifications (GET /notifications/notifications)**

- **Headers:** Authorization: Bearer \<token\>
- **Query Parameters:**
  - **route** (string, optional): Filter by route ID (e.g., `?route=61C`).
  - **bus** (string, optional): Filter by vehicle ID (e.g., `?bus=3301`).
  - **q** (string, optional): Free-text search across notification message content (A13).
- **Purpose:** Returns live notifications from the last 30 minutes (R3), optionally filtered. Used by the Notification Page and for pre-filled searches (A14).
- **Design Pattern:** Strategy Pattern for search execution.
- **Notes:** Results are sorted by `createdAt` descending (newest first). If no query params are provided, returns all notifications from the last 30 minutes.
- **Strategy Selection Rules:**
  - `route` only -> RouteSearchStrategy
  - `bus` only -> BusSearchStrategy
  - `q` only -> TextSearchStrategy
  - Any combination of `route`, `bus`, and `q` -> CompositeSearchStrategy
  - No filters -> RecentNotificationsStrategy
- **Example Requests:**
  - `GET /notifications/notifications?route=61C`
  - `GET /notifications/notifications?bus=3301`
  - `GET /notifications/notifications?q=packed`

### **3.6 Get Service Alerts (GET /notifications/alerts)**

- **Headers:** Authorization: Bearer \<token\>
- **Query Parameters:** _None_
- **Purpose:** Returns current GTFS-RT service alerts. Displayed as default content on the Notification Page when no search is active (A15).
- **Example Request:** `GET /notifications/alerts`

---

## **4\. Response Payload Details**

### **4.1 SubscriptionsRetrieved (HTTP 200)**

- **Success Name:** SubscriptionsRetrieved
- **Payload Type:** ISubscription[]

**Example Response:**

```json
{
  "name": "SubscriptionsRetrieved",
  "message": "Found 3 subscriptions",
  "payload": [
    {
      "_id": "sub-id-1",
      "userId": "user-id-1",
      "routeId": "61C",
      "createdAt": "2026-03-27T10:00:00Z"
    },
    {
      "_id": "sub-id-2",
      "userId": "user-id-1",
      "routeId": "P1",
      "createdAt": "2026-03-27T10:05:00Z"
    }
  ]
}
```

### **4.2 RouteSubscribed (HTTP 201)**

- **Success Name:** RouteSubscribed
- **Payload Type:** ISubscription

**Example Response:**

```json
{
  "name": "RouteSubscribed",
  "message": "Subscribed to route 61C",
  "payload": {
    "_id": "sub-id-3",
    "userId": "user-id-1",
    "routeId": "61C",
    "createdAt": "2026-03-27T10:10:00Z"
  }
}
```

### **4.3 RouteUnsubscribed (HTTP 200)**

- **Success Name:** RouteUnsubscribed
- **Payload Type:** null

**Example Response:**

```json
{
  "name": "RouteUnsubscribed",
  "message": "Unsubscribed from route 61C",
  "payload": null
}
```

### **4.4 ReportSubmitted (HTTP 201)**

- **Success Name:** ReportSubmitted
- **Payload Type:** IBusReport

**Example Response (normal):**

```json
{
  "name": "ReportSubmitted",
  "message": "Report submitted. Thank you!",
  "payload": {
    "_id": "report-id-1",
    "userId": "user-id-1",
    "vid": "3301",
    "routeId": "61C",
    "crowdedness": "Packed",
    "condition": "Dirty",
    "comment": "Very crowded today",
    "lat": 40.4418,
    "lon": -79.944,
    "createdAt": "2026-03-27T10:15:00Z"
  }
}
```

**Example Response (comment flagged — A19):**

```json
{
  "name": "ReportSubmitted",
  "message": "Your comment was flagged and will not be included in the notification.",
  "payload": {
    "_id": "report-id-2",
    "userId": "user-id-1",
    "vid": "3301",
    "routeId": "61C",
    "crowdedness": "Standing Room",
    "lat": 40.4418,
    "lon": -79.944,
    "createdAt": "2026-03-27T10:20:00Z"
  }
}
```

### **4.5 NotificationsRetrieved (HTTP 200)**

- **Success Name:** NotificationsRetrieved
- **Payload Type:** INotification[]

**Example Response:**

```json
{
  "name": "NotificationsRetrieved",
  "message": "Found 2 notifications",
  "payload": [
    {
      "_id": "notif-id-1",
      "routeId": "61C",
      "vid": "3301",
      "message": "Bus #3301 on Route 61C — Crowdedness changed to Packed, condition changed to Dirty",
      "changedFields": ["crowdedness", "condition"],
      "reportId": "report-id-1",
      "createdAt": "2026-03-27T10:15:00Z"
    },
    {
      "_id": "notif-id-2",
      "routeId": "61C",
      "vid": "5502",
      "message": "Bus #5502 on Route 61C — Crowdedness changed to Empty",
      "changedFields": ["crowdedness"],
      "reportId": "report-id-3",
      "createdAt": "2026-03-27T10:12:00Z"
    }
  ]
}
```

### **4.6 AlertsRetrieved (HTTP 200)**

- **Success Name:** AlertsRetrieved
- **Payload Type:** IServiceAlert[]

**Example Response:**

```json
{
  "name": "AlertsRetrieved",
  "message": "Found 1 service alert",
  "payload": [
    {
      "id": "alert-001",
      "headerText": "61C Detour in Effect",
      "descriptionText": "Route 61C is detoured via Forbes Ave due to road construction on Murray Ave.",
      "routeIds": ["61C"],
      "activePeriods": [
        {
          "start": "2026-03-25T06:00:00Z",
          "end": "2026-04-05T22:00:00Z"
        }
      ]
    }
  ]
}
```

---

## **5\. Socket.io Events (Observer Pattern)**

The server uses Socket.io for real-time notification delivery per **R4 (Observer Pattern)**.

### **5.1 Client → Server Events**

| Event | Payload | Description |
| :-- | :-- | :-- |
| `subscribeRoute` | `{ routeId: string }` | Join the notification room for a route. Emitted when the user subscribes via REST or on page load for existing subscriptions. |
| `unsubscribeRoute` | `{ routeId: string }` | Leave the notification room for a route. Emitted on unsubscribe. |

### **5.2 Server → Client Events**

| Event | Payload | Description |
| :-- | :-- | :-- |
| `liveNotification` | `INotification` | Pushed to all sockets in the route's room when a new bus report triggers a status change. |
| `alertUpdate` | `IServiceAlert[]` | Pushed when GTFS-RT alert feed is refreshed with new or changed alerts. |

### **5.3 Room Strategy**

- Each route has a Socket.io room named `route:<routeId>` (e.g., `route:61C`).
- When a user subscribes, their socket joins the room. On unsubscribe, the socket leaves.
- On report submission that triggers a notification, the server emits `liveNotification` to the room `route:<routeId>`.

---

## **6\. Business Rules Reference**

| Rule | Description |
| :-- | :-- |
| **R1** | A Member may have at most **10** active subscriptions. |
| **R2** | No duplicate subscriptions — a Member cannot subscribe to the same route twice. |
| **R3** | Notifications are retained for **30 minutes** (MongoDB TTL index). |
| **R4** | Observer Pattern — server maintains route → subscriber mappings via Socket.io rooms. |
| **R5** | At least one report field (crowdedness, prioritySeating, condition, or comment) must be answered. |
| **R6** | Notifications highlight only **changed fields** compared to the bus's last known status. |
| **R9** | Reporter must be within **0.5 miles** of the bus (Haversine distance, validated server-side). |
| **R10** | Browser Geolocation API required for report submission. |
| **R11** | Free-text comments are moderated by an LLM. Flagged comments are excluded from notifications. |
| **R12** | Server maintains a last known status per vehicle (crowdedness, prioritySeating, condition). |
| **R13** | Any notification search must use Strategy Pattern selection based on search inputs. |

---

## **7\. Error Codes and Error Names**

| HTTP Code | Error Name | Trigger & Description |
| :-- | :-- | :-- |
| 400 | MissingParameter | Required field missing (e.g., `routeId`, `vid`, `lat`, `lon`). |
| 400 | EmptyReport | Report submitted with no fields answered (all skipped). |
| 400 | InvalidReportField | Report field value is not one of the allowed enum values. |
| 401 | MissingToken | No Authorization header or Bearer token provided. |
| 401 | InvalidToken | JWT verification failed (expired, malformed, or invalid signature). |
| 403 | ProximityViolation | Reporter is more than 0.5 miles from the bus (server-side validation). |
| 404 | RouteNotFound | Route ID does not exist in the system. |
| 404 | VehicleNotFound | Vehicle ID not found in the in-memory vehicle positions store. |
| 404 | SubscriptionNotFound | User is not subscribed to the specified route (on DELETE). |
| 409 | DuplicateSubscription | User already has an active subscription for the route. |
| 409 | SubscriptionLimitReached | User already has 10 active subscriptions. |
| 500 | GetRequestFailure | Unhandled server error during a GET request handler. |
| 500 | ReportSubmissionFailure | Unhandled server error during report processing. |
| 503 | AlertFeedUnavailable | GTFS-RT alert feed is unreachable or returned an error. |

---

## **8\. Implementation Notes**

- **Proximity Validation:** The client performs a preliminary 0.5-mile check using `navigator.geolocation.getCurrentPosition()` before showing the Report option. The server **also** validates proximity on `POST /notifications/reports` using the bus's coordinates from `vehiclePositionsService.getVehicles(routeId)` as a security measure. Distance is calculated using the Haversine formula.

- **Last Known Bus Status:** Maintained as an in-memory `Map<vid, { crowdedness, prioritySeating, condition }>` on the server. Updated on each report. On server restart, rebuilt from the most recent report per vehicle in MongoDB. Used to determine if a notification should be published (R6, R12).

- **LLM Content Moderation:** On report submission, if a `comment` field is present, it is sent to the LLM moderation endpoint asynchronously. If flagged, the comment is excluded from the notification but the report is still stored. The response message indicates the comment was flagged (A19).

- **Notification TTL:** Notifications are stored in MongoDB with a TTL index of 30 minutes. Stale notifications are automatically purged by MongoDB.

- **GTFS-RT Alerts:** Fetched from the GTFS-RT alert feed. Displayed as default content on the Notification Page. If the feed is unavailable, the endpoint returns 503 `AlertFeedUnavailable` (A15).

- **Pre-filled Navigation:** The Notification Page accepts URL query parameters (`?route=61C` or `?bus=3301`) to pre-fill the search bar when redirected from the Map Page (A3) or Subscribe Page (Basic Flow Manage step 3).

- **Search Strategy Pattern:** `GET /notifications/notifications` delegates to a strategy selected by `SearchStrategyFactory`. Strategies should implement a shared contract such as `INotificationSearchStrategy.search(criteria)` and include at least: `RecentNotificationsStrategy`, `RouteSearchStrategy`, `BusSearchStrategy`, `TextSearchStrategy`, and `CompositeSearchStrategy`. This prevents large conditional search logic in controllers and supports adding new search types without modifying existing strategy implementations.

- **Step-by-Step Report Form:** Implemented as a `<bus-report-form>` web component. Displays one question per step with Skip and Back navigation. Emits a `report-submit` custom event with collected answers. The component does not make API calls directly — the parent page handles submission.
