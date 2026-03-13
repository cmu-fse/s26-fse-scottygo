# TUC2: Track Bus in Real-Time

Shortname: TrackBus

Participating Actors  
The use case is initiated by a Member. The supporting actors include Google Maps API, PRT API, and TripShot API.

Brief Description  
The use case provides real-time tracking of vehicle locations and visualizes dynamic reroutes. The application polls for vehicle coordinates and renders them as moving markers on the map. If the system detects a deviation from the standard path (reroute), it dynamically renders a modified path on the Google Map based on current event data to inform the Member of the change in service.

Assumptions  
The Member is logged into the app.

Flow of Events

Basic Flow  
1\. The use case starts when the Member selects one or more bus routes from the filter.  
– 2\. The app queries the database for current route status and vehicle locations.  
3\. The app checks the timestamp of the current route status and the saved vehicle locations data.  
– 4\. If the data is stale or missing, the app calls the PRT API to update the data.  
5\. The app requests real-time route coordinates and current vehicle locations from the PRT API for the selected route.  
6\. The app sends the route coordinates and bus location to the Google Maps API to render the map interface.  
7\. The app displays the map with the route overlay and moving bus icons.  
8\. The app updates the bus location marker at regular intervals (every 30 seconds) until the user exits the view. The UC ends here.

Alternative Flows

- **A1 Reroute.** In Step 2, the PRT API flags a "Detour" event for the selected route.
  - The app fetches the temporary detour coordinates.
  - The app displays the detour path on the map instead of the standard route.
- **A2: No Data Available.** In Step 4, if the PRT API returns no active vehicles for the selected route, the app displays a "No active buses found for this route" message.
- **A3: API Connection Failure.** If the app cannot reach Google Maps, it displays an error message and suggests the user check their internet connection.
- **A4: System Busy.** If the API rate limit is reached or the PRT API is down, the app displays a message: "Real-time tracking is currently unavailable. Showing scheduled times only.”
- **A5 TrueTime.** In step 1, the route is selected & _Show CMU Shuttle_ is toggled on. This flow follows the basic flow, except that the PRT API is replaced with TripShot.

Rules

- **R1 Selected Routes:** The system displays only the selected routes.
- **R2 Refresh Rate:** Vehicle positions shall be updated every 30 seconds via the TrueTime API.
- **R3 Reroute Visibility:** When a reroute event is active, the original path is hidden, and the detour path is highlighted in a distinct color (e.g., Red).
- **R4 Data Freshness Rule:** Vehicle location data is considered stale after 30 seconds.

Implementation Notes

- MongoDB is used to account for our API call limits. If multiple users request the same information, we can share it instead of making multiple API calls. MongoDB had a Time-To-Live (TTL) feature that automatically deletes documents/data after a set time.
  - Reference: [https://www.mongodb.com/docs/manual/core/index-ttl/](https://www.mongodb.com/docs/manual/core/index-ttl/)
- MongoDB may not be needed if we are directly pulling the bus location from the GTFS data.
- Polyline Reference: https://developers.google.com/maps/documentation/javascript/examples/polyline-simple
