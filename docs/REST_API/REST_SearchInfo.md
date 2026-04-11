# **Search Information API Documentation**

## **1\. Overview**

**Router Paths:** /search endpoints are added to existing controllers where applicable:

| Context                | Base Router    | Controller             |
| :--------------------- | :------------- | :--------------------- |
| Routes search          | /              | MapController          |
| Routes and Stop search | /              | MapController          |
| Notification search    | /notifications | NotificationController |

This section covers the search endpoints for the SearchInfo use case. The API allows an authenticated Member to search for information stored in the system. Search is **contextual,** with behavior varying depending on the search context (current screen). The server implements the **Strategy Design Pattern**, delegating to a different search strategy per context.

SearchInfo uses **two complementary mechanisms**:

- **REST API (Full Search):** Returns complete search results when the Member submits a search query. Used for displaying the full results list.

- **Socket.io (Autocomplete):** Provides real-time typeahead suggestions as the Member types in the search bar. Returns lightweight suggestion objects for fast rendering in a dropdown.

**Assumption:** The Member is logged into the system (JWT Bearer token required on all REST endpoints; authenticated Socket.io connection required for autocomplete).

### **1.1 Interface Definitions**

- **IStop** (from common/transit.interface.ts)
  - **stopId**: string

  - **stopName**: string

  - **lat**: number

  - **lon**: number

  - **routes?**: string\[\]

  - **dtradd**: string\[\]

  - **dtrrem**: string\[\]

- **IRoute** (from common/transit.interface.ts)
  - **id**: string

  - **name**: string

  - **system**: 'PRT' | 'CMU'

  - **color**: string

  - **directions**: string\[\]

  - **activeStatus**: boolean

  - **operatingDays**: number\[\]

- **INotification** (defined by TUC 3\)
  - **\_id?**: string

  - **routeId**: string — Route this notification pertains to

  - **vid**: string — Vehicle ID

  - **message**: string — Human-readable notification text

  - **changedFields**: string\[\] — Fields that changed (e.g., \["crowdedness", "condition"\])

  - **reportId**: string — Reference to the originating IBusReport

  - **createdAt**: string — ISO timestamp (TTL: 30 minutes)

- **ITransitSearchResult** (new)
  - **routes**: IRoute\[\]

  - **stops**: IStop\[\]

- **ISuccess** (from common/server.responses.ts)
  - **name**: SuccessName

  - **message?**: string

  - **authorizedUser?**: string

  - **metadata?**: Record\<string, unknown\>

  - **payload**: IPayload

- **IAppError** (extends Error)
  - **type**: 'ClientError' | 'ServerError'

  - **name**: string

  - **message**: string

- **ITokenPayload** (from common/user.interface.ts)
  - **userId**: string

  - **username**: string

  - **iat?**: number

  - **exp?**: number

## **2\. REST API Endpoints (Full Search)**

Full search endpoints return complete results when the Member submits a search query (e.g., presses Enter or clicks a search button).

| Method | Path | Function | Resource or Response Type (Success) | Body Type |
| :-- | :-- | :-- | :-- | :-- |
| **GET** | /routes/search | Search routes | ISuccess with IRoute\[\] payload (HTTP 200\) | _None_ |
| **GET** | /search | Search stops and routes | ISuccess with ITransitSearchResult payload (HTTP 200\) | _None_ |
| **GET** | /notifications/notifications | Search notifications | ISuccess with INotification\[\] payload (HTTP 200\) | _None_ |

## **3\. Request Payload Details**

### **3.1 Search Transit — Stops and Routes (GET /search)**

- **Query Parameters:**
  - **q** (string, required): One or more search words matching stop names, stop IDs, route IDs

- **Headers:** Authorization: Bearer \<JWT\>

- **Authorization Rules:** Any authenticated Member.

- **Behavior:**
  - The server searches both routes (by route ID and route name) and stops (by stop name and stop ID) for matches.

  - Results are limited to the first 5 items to limit clutter.

**Example Request:**

```json
GET /search?q=east+busway
```

\*Note: Search routes function the same, except stops are not shown for search routes.

### **3.2 Search Notifications (GET /notifications/notifications)**

- **Query Parameters:**
  - **route** (string, optional): Filter by route ID (e.g., 61C).

  - **bus** (string, optional): Filter by vehicle ID.

  - **q** (string, optional): Text query matched against notification message content.

- **Headers:** Authorization: Bearer \<JWT\>

- **Authorization Rules:** Any authenticated Member.

- **Behavior:**
  - The server searches notifications by message content, route ID, and vehicle ID.

  - Results are returned in reverse chronological order.

**Example Request:**

```json
GET /notifications/notifications?route=61C&q=packed
```

## **4\. Response Payload Details**

### **4.1 SearchTransitCompleted (HTTP 200\)**

- **Success Name:** SearchTransitCompleted

- **Payload Type:** ITransitSearchResult

- **Result Size:** Up to 5 matching routes and up to 5 matching stops.

**Example Response:**

```json
{
  "name": "SearchTransitCompleted",
  "message": "Found 6 results matching 'east'",
  "authorizedUser": "scotty",
  "metadata": { "totalItems": 6 },
  "payload": {
    "stops": [
      {
        "stopId": "7120",
        "stopName": "East Busway at Wilkinsburg Station",
        "lat": 40.4413,
        "lon": -79.8769,
        "routes": ["P1", "P3"],
        "dtradd": [],
        "dtrrem": []
      }
    ],
    "routes": [
      {
        "id": "P1",
        "name": "East Busway All-Stops",
        "system": "PRT",
        "color": "#00518B",
        "directions": ["INBOUND", "OUTBOUND"],
        "activeStatus": true,
        "operatingDays": [1, 2, 3, 4, 5]
      }
    ]
  }
}
```

**4.2 NotificationsRetrieved (HTTP 200\)**

- **Success Name:** NotificationsRetrieved

- **Payload Type:** INotification\[\]

- **Sorting:** Reverse chronological order (most recent first).

- **Result Size:** Matching notifications (no page parameter on this endpoint).

**Example Response:**

```json
{
  "name": "NotificationsRetrieved",
  "message": "Found 5 notifications matching '61C'",
  "authorizedUser": "scotty",
  "payload": [
    {
      "_id": "664a1b2c3d4e5f6a7b8c9d0e",
      "routeId": "61C",
      "vid": "3245",
      "message": "Bus #3245 on Route 61C — Crowdedness changed to Packed",
      "changedFields": ["crowdedness"],
      "reportId": "rpt-664a1b2c3d4e5f6a7b8c9d0e",
      "createdAt": "2026-03-27T14:25:00Z"
    },
    {
      "_id": "664a1b2c3d4e5f6a7b8c9d0f",
      "routeId": "61C",
      "vid": "3102",
      "message": "Bus #3102 on Route 61C — Crowdedness changed to Packed, condition changed to Dirty",
      "changedFields": ["crowdedness", "condition"],
      "reportId": "rpt-664a1b2c3d4e5f6a7b8c9d0f",
      "createdAt": "2026-03-27T14:10:00Z"
    }
  ]
}
```

### **4.4 Empty Results (HTTP 200\)**

When no matches are found, the endpoint returns HTTP 200 with an empty payload.

**Example Response (no matches):**

```json
{
  "name": "NotificationsRetrieved",
  "message": "No notifications found matching 'xyznonexistent'",
  "authorizedUser": "scotty",
  "payload": []
}
```

**Example Response (stopwords only — transit contexts):**

```json
{
  "name": "SearchTransitCompleted",
  "message": "Search query contained only stop words",
  "authorizedUser": "scotty",
  "metadata": { "totalItems": 0 },
  "payload": { "stops": [], "routes": [] }
}
```

## **5\. Autocomplete vs Full Search**

SearchInfo distinguishes between two interaction modes:

| Mode | Mechanism | Trigger | Purpose | Response |
| :-- | :-- | :-- | :-- | :-- |
| **Autocomplete** | Socket.io | As the Member types (each keystroke/debounced input) | Show real-time suggestions in a dropdown | Lightweight ISearchSuggestion[] payload |
| **Full Search** | REST API | Member submits the query (Enter key / search button) | Display complete, detailed results | Full ISuccess response with typed payload |

### **Why two mechanisms?**

- **Autocomplete via Socket.io** avoids the overhead of establishing a new HTTP request per keystroke. The persistent socket connection provides low-latency, bidirectional communication ideal for real-time typeahead. The server returns compact suggestion objects to minimize payload size while preserving search intent metadata.

- **Full Search via REST** returns richly typed results suitable for rendering a complete results list. This follows standard REST conventions and produces cacheable, bookmarkable URLs.

### **Autocomplete Flow**

1\. The Member starts typing in the search bar.

2\. The client debounces input (e.g., 300ms) and emits a searchAutocomplete socket event with the partial query and the current search context.

3\. The server applies the appropriate search strategy, retrieves matching items, and emits searchSuggestions back to the client with an array of ISearchSuggestion objects.

4\. The client renders the suggestions in a dropdown beneath the search bar.

5\. When the Member selects a suggestion or presses Enter, the client fires a full search via the REST API.

## **6\. Search Rules (R1)**

Search is **contextual** — the system behavior varies depending on the endpoint (context). The server implements the **Strategy Design Pattern** with an ISearchStrategy interface and separate concrete strategies for each context.

| Search Context | REST Endpoint | Autocomplete Context | Search Criteria | Search Results |
| :-- | :-- | :-- | :-- | :-- |
| Route Search | GET /routes/search | transit | One or more search words matching route IDs or route names. | Up to 5 matching routes. |
| Stop and Route Search | GET /search | transit | One or more search words matching stop names, route names, stop IDs or route IDs. | Up to 5 matching routes and/or stops. |
| Notification Search | GET /notifications/notifications | notifications | Optional route and bus filters with optional text query (q) matched against notification messages. | Matching notifications in reverse chronological order. |

## **7\. Stopword Rule (R2)**

The server identifies and removes **stop words** from the search query prior to executing transit and notification searches. Stop words are common English words that carry little semantic meaning.

**Behavior:**

1\. The server tokenizes the q parameter (or autocomplete query) into individual words.

2\. Each word is checked against the stop words list (case-insensitive).

3\. Stop words are removed from the query.

4\. If **all** words in the query are stop words, the server returns HTTP 200 with an empty payload and the message: _"Search query contained only stop words"_. For autocomplete, an empty suggestions array is returned.

5\. If at least one non-stop word remains, the search proceeds using only the non-stop words.

**Stop Words List:**

a, able, about, across, after, all, almost, also, am, among, an, and, any, are, as, at, be, because, been, but, by, can, cannot, could, dear, did, do, does, either, else, ever, every, for, from, get, got, had, has, have, he, her, hers, him, his, how, however, i, if, in, into, is, it, its, just, least, let, like, likely, may, me, might, most, must, my, neither, no, nor, not, of, off, often, on, only, or, other, our, own, rather, said, say, says, she, should, since, so, some, than, that, the, their, them, then, there, these, they, this, tis, to, too, twas, us, wants, was, we, were, what, when, where, which, while, who, whom, why, will, with, would, yet, you, your

## **8\. Response Codes and Error Names**

### **Success**

| HTTP Code | Name                   | Endpoint                         |
| :-------- | :--------------------- | :------------------------------- |
| 200       | SearchTransitCompleted | GET /routes/search               |
| 200       | SearchTransitCompleted | GET /search                      |
| 200       | NotificationsRetrieved | GET /notifications/notifications |

### **Client Errors**

| HTTP Code | Name | Endpoint(s) | Condition |
| :-- | :-- | :-- | :-- |
| 400 | MissingSearchQuery | GET /routes/search, GET /search | q query parameter not provided or empty |
| 401 | MissingToken | All SearchInfo REST endpoints | JWT token not provided in Authorization header |
| 401 | InvalidToken | All SearchInfo REST endpoints | JWT token is invalid or expired |

### **Server Errors**

| HTTP Code | Name | Endpoint(s) | Condition |
| :-- | :-- | :-- | :-- |
| 500 | GetRequestFailure | All SearchInfo REST endpoints | Unexpected server error during search |

## **9\. Socket.io Real-Time Events (Autocomplete)**

### **9.1 Overview**

Socket.io is used to provide real-time autocomplete suggestions as the Member types in the search bar. The persistent socket connection avoids per-keystroke HTTP overhead and enables low-latency typeahead.

**Connection:** Clients connect with a JWT token as a query parameter (?token=\<JWT\>), using the existing authentication flow in app.ts.

### **9.2 Client-to-Server Events**

| Event Name | Payload | Description |
| :-- | :-- | :-- |
| **searchAutocomplete** | query: string, context: ISearchAutocompleteContext | Emitted by the client as the Member types in the search bar (debounced, e.g., 300ms). query is the current partial input. context identifies the current screen: 'transit', or 'notifications'. |

### **9.3 Server-to-Client Events**

| Event Name | Payload | Description |
| :-- | :-- | :-- |
| **searchSuggestions** | suggestions: ISearchSuggestion\[\] | Emitted by the server in response to a searchAutocomplete event. Contains suggestion objects with a display label and type. For transit: matching stop names, route names, stop IDs, or route IDs. For notifications: matching route IDs, vehicle IDs, and notification labels (with routeId/vid when applicable). |

### **9.4 Autocomplete Behavior by Context**

| Context | Suggestions Content | Max Suggestions | Stopword Rule |
| :-- | :-- | :-- | :-- |
| transit | Matching stop names, stop IDs, route IDs, and route names (e.g., \[{"label":"P1","type":"route"}, {"label":"East Busway All-Stops","type":"route"}\]) | 5 | Yes |
| notifications | Matching route IDs, vehicle IDs, and notification labels (e.g., \[{"label":"61C","type":"route"}, {"label":"3245","type":"vehicle","vid":"3245"}, {"label":"Route 61C · Bus #3245","type":"notification","routeId":"61C","vid":"3245"}\]) | 8 | Yes |

### **9.5 Example Flow**

1\. Member is on the Map Page (transit context) and types "for" into the search bar.

2\. Client emits (after debounce):searchAutocomplete("for", "transit")

3\. Server applies the transit search strategy, finds stops and routes matching "for" (e.g., route names/IDs containing "for"):searchSuggestions(\[{"label":"Forbes Connector","type":"route"}, {"label":"61C","type":"route"}\])

4\. Client renders the suggestions in a dropdown.

5\. Member selects "Forbes Connector" and the client fires the full REST search:GET /search?q=Forbes+Connector

### **9.6 Edge Cases**

- **Empty query:** If query is an empty string, the server responds with an empty suggestions array: searchSuggestions(\[\]).

- **Stopwords only (transit/notifications):** If the query after stopword removal is empty, the server responds with an empty suggestions array.

- **Unauthenticated socket:** If the socket is not authenticated, the event is ignored (no response emitted).
