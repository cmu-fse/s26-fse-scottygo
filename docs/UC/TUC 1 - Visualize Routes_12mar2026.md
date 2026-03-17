### **Team Use Case: Visualize Routes**

**Short Name:** VisRoute

**Participating Actors:** The use case is initiated by a member (Logged in User). The supporting actors include PRT True Time API and Trip Shot CMU Shuttle API.

**Brief Description:** The use case allows a logged-in user to visualize a map of the Pittsburgh area featuring transit routes and stops. The user can center the map on their own location, filter by specific routes (PRT or CMU Shuttle), adjust time and date to see bus availability, and toggle between inbound and outbound directions.

---

### **Flow of Events**

#### **Basic Flow**

1. The use case starts when a user logs in.
2. The app requests the Member’s geographic location via a pop-up menu.
3. The Member elects to **Confirm/Allow** location access.
4. The app displays a map of the Pittsburgh area with all Port Authority (PRT) routes and stops overlaid by default.
5. The user clicks anywhere on the map.
6. The app detects the user's location, zooms in, and centers the map on the user.
7. The user selects the **Route Filter**.
   1. The app displays a scrollable side panel menu listing available routes.
   2. The user selects a single route from the menu.
   3. The app hides all other routes, displaying only the selected route for clarity.
8. The user selects the **Calendar Filter**.
   1. The app displays a calendar starting at the current date
   2. The user selects a date range
   3. The app hides all routes unavailable during those days, displaying only the selected route for clarity.
9. The user interacts with the **Clock Menu** (by selecting a time or moving the clock hand).
   1. The app displays a clock side panel for inputting time information
   2. The user selects the starting time of the incoming buses
   3. The app hides all buses/routes that are unavailable at the chosen starting time
10. The user selects the **System Filter** (PRT/CMU).
    1. The app shows toggles for "PRT" and "CMU Shuttle."
    2. The user enables or disables these systems.
    3. The app shows or hides the corresponding route sets based on the toggles.
11. The user selects the **Direction Filter**.
    1. The app shows toggles for "Inbound" and "Outbound."
    2. The user selects the starting time of the incoming buses
    3. The app displays the routes according to the selected direction. The use case ends.

#### **Alternative Flows**

- **A1**. **No Network Acces**s. In step 1, if the app detects no active internet connection, it displays a "Connection Lost" overlay. The map and filters remain non-interactive until a connection is restored.
- **A2**. **PRT API is down**. In steps 4 and 9, if the external PRT TrueTime API is unreachable or returns an error, the app displays a toast notification: _"Real-time tracking is currently unavailable. Showing scheduled times only."_ The app then pulls from local static schedule data.
- **A3. Location Out of Bounds**. In step 4, if the user’s GPS coordinates are outside the Greater Pittsburgh Area, the app displays a warning message: _"This transit app only supports the Pittsburgh bus system."_ Instead of centering on the user, the map centers on Downtown Pittsburgh (Point State Park).
- **A4**. **Map API Blocked**. In step 4, if the Google Maps API fails to initialize (e.g., due to regional censorship/IP blocking), the app redirects the user to a "Service Unavailable" landing page explaining that the map provider is restricted in their current territory.
- **A5**.**Unable To Access Location.** In step 6, if the user has denied location permissions, the app maintains the default Pittsburgh zoom level.
- **A6**.**Location Access Denied.** In step 3, if the Member elects to Deny or closes the permission prompt, the app displays a notification: _"Location access denied. Centering on Downtown Pittsburgh by default."_ The app proceeds to step 4 using the default coordinates for Point State Park.
- **A7. No Service Available**. In step 9.2, if the user selects a time or date (e.g., late night or holiday) where the selected route does not operate, the app displays a message "No service available for this selection" and clears the map of active bus markers.
- **A8. Multi-System Toggle**. In step 15, if the user disables both PRT and CMU Shuttle toggles, the map displays the base geographic map with no transit overlays.

---

### **Rules**

- **R1. Single Route Focus:** In step 7, only one specific route can be selected at a time from the side panel to maintain visual clarity. Selecting a new route automatically deselects the previous one.
- **R2. Default State:** Upon initial load, the "PRT" system is toggled "ON" and the "CMU Shuttle" is toggled "OFF."
- **R3. Real-Time Sync:** If the selected date and time match the _current_ date and time, the app must pull real-time GPS data for bus positions where available.
- **R3. API Timeout:** The app should wait no longer than 5 seconds for a response from the PRT API before triggering the **A2** fallback flow.
- **R1. Boundary Definition:** "Pittsburgh Area" for **A3** is defined as a bounding box approximately between latitudes 40.1°N to 40.7°N and longitudes \-80.4°W to \-79.6°W.

---

### **Implementation Notes**

- **Map Integration:** Use a mapping API (like Leaflet or Mapbox) to render the Pittsburgh base layer. Route overlays should be handled as GeoJSON layers that can be toggled dynamically without reloading the page.
- **Data Sources:** Route and schedule information should be fetched from the [PRT TrueTime API](https://truetime.portauthority.org/bustime/home.jsp) and the CMU Shuttle schedule database.
- **State Management:** To maintain RESTfulness, the selected filters (Route ID, Time, Date, Direction) should be reflected in the URL query parameters. This allows a user to refresh the page or share a link without losing their specific filtered view.
- **Location Privacy:** Per browser security standards, the app must explicitly request permission to access `navigator.geolocation` before attempting to center the map in step 4\.

https://developers.google.com/maps/documentation/routes/transit-route\#transit-fields
