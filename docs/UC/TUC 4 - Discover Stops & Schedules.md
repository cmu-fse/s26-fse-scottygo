# Team Use Case: Discover Stops & Schedules

Short Name: Discover

Participating Actors

- The UC is initiated by a member.
- The UC interacts with the Google Maps API, True Time PRT API, and Trip Shot CMU Shuttle API.

Brief Description  
In this Use Case, the app identifies nearby transit stops and provides arrival estimates in two stages. Based on the Member's current coordinates, the app identifies nearby stops and displays them as markers. Upon selecting a marker, the app displays a panel with stop details, upcoming arrivals, and estimated walking time. If the Member chooses to start navigation by pressing a Directions button, the app then provides a step-by-step pedestrian path from the Member's location to the selected stop.

Assumptions  
The Member has internet access and has already successfully logged into the app and has elected to **Confirm/Allow** location access, and the Google Maps API, PRT TrueTime API, and TripShot API are all active and functioning.

Flow of Events

Basic Flow

1. The Use Case starts after the Member has successfully logged into the app, been redirected to the map page, and has elected to **Confirm/Allow** location access.
2. The app displays all stops and their routes within a 1-kilometer radius of the Member’s current location.
   1. _(1 kilometer is the average distance covered in 15 minutes of slow walking on flat terrain.)_  
      2. _(Server provides this data, not external API; see Server Role implementation notes below for details.)_
3. The Member can (but does not need to) use the app filters if desired, and selects a stop by clicking / tapping on it. _(See Filtering implementation note below for filtering details)_
4. The app displays a small window next to the selected stop containing the stop name, buses' next arrival times, and the Member's estimated walking time to that stop.
   1. _(Estimated walking time is computed from straight-line distance between Member location and stop, using the heuristic that 1 kilometer corresponds to 15 minutes of walking. Server provides this data, not external API; see Server Role implementation notes below for details.)_  
      2. _(The window has an ‘X’ mark to cancel stop selection, a ‘–’ mark to minimize the window, and a ‘Directions’ button with text and walking icon.)_  
      3. _(While in this stop-selection stage, the app allows the Member to select another stop marker, which causes the former stop window to close and the new stop window to open with its respective content. Again, the server provides this data, not an external API; see Server Role implementation notes below for details.)_
5. The Member presses the **Directions** button in the stop window.
6. The app enters directions mode and hides other stops and routes, calls the **Google route API**, and displays a recommended walking path with estimated walking duration and estimated arrival time for the selected stop.
   1. _(The client calls the API directly, and the returned route \[polyline, duration, and distance\] stays in client memory.)_
7. The Member walks towards the stop, following the recommended walking path.
8. The app updates the Member’s location every 2-5 seconds as they walk, reflecting the updated Member location on the map.
   1. _(The Member’s phone provides GPS/location via browser geolocation \[watchPosition\], and the client updates the marker on the map; see Client Role implementation notes below for details.)_
9. Every 120 seconds, the app automatically calls again the Google route API and displays an updated recommended walking path as well as an estimated walking time and arrival time.
   1. _(The client calls the API directly, and the returned route \[polyline, duration, and distance\] stays in client memory; see Client Role implementation notes below for details.)_
10. The Member walks to within 20 meters of the stop. _(20 meters is the smallest distance that Google Maps uses to determine if a user has arrived at their destination)_
11. The app stops displaying the recommended walking path, and displays a small non-intrusive toast notification stating ‘Arrived\!’

Alternative Flows

- **A1 Select Another Stop (Before Directions).** In step 5, if the Member chooses another stop marker rather than pressing the Directions button in the window of the previously selected stop, the app updates the stop window to the newly selected stop and remains in the stop-selection stage (no Google route API request is made). The flow then returns to step 5 of the Basic Flow.
- **A2 Deselect Stop.** In steps 4 or 5, if the Member chooses to deselect the stop they had previously chosen by clicking on the ‘X’ mark on the stop window, the app closes the stop window and returns to step 2, again displaying all stops and routes within a 1-kilometer radius of the Member’s current location. The flow then proceeds to step 3 of the Basic Flow.
- **A3 Minimize Stop Window.** In steps 4 or 5, if the Member clicks the ‘–’ mark, the app minimizes the stop window and the Member may restore it by clicking the selected stop marker again. The flow then proceeds to step 3 of the Basic Flow.
- **A4 Exit Directions Mode.** In steps 7-9, if the Member exits directions mode by clicking on the ‘X’ mark on the stop window, the app closes the stop window, cancels any in-flight route request to the Google route API, removes the walking path overlay, and returns to step 2, again displaying all stops and routes within a 1-kilometer radius. The flow then proceeds to step 3 of the Basic Flow.
- **A5 Strays From Path.** In step 8, if the Member strays from the recommended walking path by 50 meters, the app calls the Google route API to obtain an updated recommended walking path as well as updated walking duration and arrival time. The flow then proceeds to step 7 of the Basic Flow.
  - As per Rule R2, the previous route request to the Google route API will be cancelled and replaced by the new route request so there is only one in-flight route request per Member.
  - As per Rule R3, if the last automatic reroute request to the Google route API was performed within 45 seconds, the reroute request for this Alternative Flow is delayed until 45 seconds have passed since the last automatic reroute request.
- **A6 No Stops Within 15 Minute Walk.** In step 2, if there are no stops within a 1-kilometer radius of the Member, the app automatically doubles the radius and displays all stops and their routes within a 2-kilometer radius of the Member’s current location. _(2 kilometers is the average distance covered in 30 minutes of slow walking on flat terrain)._

Rules

- **R1 Tap Debounce Rule (Directions Trigger).** There will be a tap debounce of 500 ms on actions that trigger calls to the Google route API (for example, tapping the **Directions** button repeatedly). Taps within 500 ms of the first triggering tap are ignored. This rule limits multiple redundant or erroneous calls to the Google route API.
- **R2 One In-Flight Route Request Rule.** There will only be one in-flight route request to the Google route API per Member at any point in time. If a new route request must be made (for example, a reroute in Alternative Flow A5), the earlier route request to the Google route API will be cancelled so the new route request can proceed.
- **R3 One Auto-Reroute Per 45 Seconds Rule.** There will only be one automatic reroute request to the Google route API per Member every 45 seconds. Specifically, the automatic reroute requests performed every 120 seconds as well as those performed when the Member strays from the recommended path by 50 meters (Alternative Flow A5) will be temporarily delayed if the last automatic reroute request was performed within 45 seconds; they will instead be performed after 45 seconds have passed since the last automatic reroute request.
- **R4 Walk-Time Heuristic Rule.** In the stop-selection stage, the estimated walking time shown in the stop window is computed from straight-line distance using the heuristic that 1 kilometer corresponds to 15 minutes of walking.
- **R5 Navigation Focus Rule.** Once directions mode starts, non-selected stops and route overlays are hidden to reduce visual clutter. They are restored when directions mode ends.

Implementation Notes

- **Filtering:** The existing filtering specified in the **Visualize Routes** Team Use Case, i.e., Route Filter, Calendar Filter, Clock Menu, System Filter, and Direction Filter, should continue to be available during the stop-selection stage and function as specified in the **Visualize Routes** Team Use Case document. Functionality specified here in the **Discover Stops & Schedules** Team Use Case is **additional functionality** and is not a separate workflow, does not replace or override behavior or functionality in other Use Cases, and is not in an exclusive-or relationship with other Use Cases.
- **Non-obtrusiveness**: There should be a minimum of notifications, pop-ups, alerts, and confirmation requests which do not provide significant benefit to Members as they detract from the overall User Experience / UX, and potentially complicate the app. For example, there should be no warning / alert in Alternative Flow A5 when the Member strays from the recommended path; the app should simply provide the updated recommended path.
- **Client Role:** Handles map rendering, user geolocation, stop and route drawing, stop-window rendering, walk-time heuristic display, requests to Google route API only after the **Directions** button is pressed, display of recommended walking path, marker updates, ETA display, and reroute decisions.
- **Server Role**: Handles transit data retrieval, caching, schedule/availability logic, and returns stops/routes within 1 km using local stop GTFS data and geospatial filtering.
- **Data Sourcing**: The PRT GTFS data is used for stops and bus routes, and Google route API provides data for walking path, walk duration, and ETA.
- **Member Location Updates**: GPS updates do not require server round trips; the Member’s phone provides GPS/location via browser geolocation (watchPosition), and the client updates the marker on the map.
