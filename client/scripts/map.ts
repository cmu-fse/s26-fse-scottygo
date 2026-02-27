import axios, { AxiosResponse } from 'axios';
import type { IUser } from '../../common/user.interface';
import type { IResponse } from '../../common/server.responses';
import type { IMapProvider, IConfig } from '../../common/map.interface';
import { GoogleMapProvider } from './maps/google-map.provider';

// Import web components
import './components/transit-search';
import './components/map-controls';
import './components/zoom-controls';
import './components/location-indicator';
import './components/dark-toggle';
import './components/toggle-panel';
import './components/time-picker';
import './components/calendar-picker';
import './components/route-selector';
import type {
  ITogglePanelConfig,
  ITogglePanelElement
} from './components/toggle-panel';
import type {
  ITimePickerElement,
  ITimeSelection
} from './components/time-picker';
import type {
  ICalendarPickerElement,
  IDateSelection
} from './components/calendar-picker';
import type {
  IRouteSelectorElement,
  IRouteSelection
} from './components/route-selector';
import { RouteDataService, ROUTE_COLORS } from './services/route-data.service';
import type { IStop } from './services/route-data.service';

// Export empty object to treat as module
export {};

// Check whether user is logged in
async function isLoggedIn(): Promise<boolean> {
  const token = localStorage.getItem('token'); // Get fresh token from localStorage
  if (!token) {
    return false;
  }
  const username = localStorage.getItem('username') as string;
  if (!username) {
    return false;
  }
  const userInDB = await getUser(username);
  if (!userInDB) {
    return false;
  }
  return true;
}

// Get User information from server using username
async function getUser(username: string): Promise<IUser | null> {
  try {
    const token = localStorage.getItem('token'); // Get fresh token from localStorage
    const res: AxiosResponse = await axios.request({
      method: 'get',
      headers: { Authorization: `Bearer ${token}` },
      url: '/map/users/' + username,
      validateStatus: () => true
    });
    // Now handle response
    const response: IResponse = res.data;

    // Get request successful - ISuccess response with IUser as payload
    // SuccessName = 'UserFound'
    if (res.status === 200 && response.name === 'UserFound') {
      console.log(response.message);
      const user: IUser = response.payload as IUser;
      return user;
    } else if (
      res.status === 400 &&
      'type' in response &&
      response.type === 'ClientError'
    ) {
      // If User not found
      // ClientErrorName = 'UserNotFound'
      if (response.name === 'UserNotFound') {
        alert('User does not exist: ' + response.message);
        return null;
      } else {
        alert(response.message);
        return null;
      }
    } else if (
      res.status === 401 &&
      'type' in response &&
      response.type === 'ClientError'
    ) {
      // If token invalid or user unauthorized
      // ClientErrorName could be 'MissingToken', 'InvalidToken', or 'UserNotFound'
      console.error('Unauthorized: ' + response.message);
      // User's token invalid or they were deleted - remove token and username
      // from localStorage and redirect to auth
      localStorage.removeItem('token'); // Remove unneeded token
      localStorage.removeItem('username'); // Remove username
      window.location.replace('/auth');
      return null;
    } else if (
      res.status === 500 &&
      'type' in response &&
      response.type === 'ServerError'
    ) {
      // If MongoDB error, pass error message to User
      if (response.name === 'MongoDBError') {
        alert('Database error: ' + response.message);
        return null;
      }
      // Handle any other server errors
      else {
        alert('Server error: ' + response.message);
        return null;
      }
    } else {
      console.error('Client failed to send message to server');
      return null;
    }
  } catch (error) {
    console.error('Error: ', error);
    return null;
  }
}

// Map provider instance — depends on IMapProvider, not Google Maps directly
const mapProvider: IMapProvider = new GoogleMapProvider();
const routeService = RouteDataService.getInstance();

// Fetch map config (API key, default center, zoom) from server
async function getMapConfig(): Promise<IConfig | null> {
  try {
    const token = localStorage.getItem('token');
    const res: AxiosResponse = await axios.get('/map/config', {
      headers: { Authorization: `Bearer ${token}` },
      validateStatus: () => true
    });
    const response: IResponse = res.data;
    if (res.status === 200 && response.name === 'ConfigFound') {
      return response.payload as IConfig;
    }
    console.error('Failed to fetch map config:', response);
    return null;
  } catch (error) {
    console.error('Error fetching map config:', error);
    return null;
  }
}

// Document-ready event handler
document.addEventListener('DOMContentLoaded', async function (e: Event) {
  e.preventDefault();
  const loggedIn: boolean = await isLoggedIn(); // Check if user logged in
  if (!loggedIn) {
    window.location.replace('/home'); // Redirect to home page
    return;
  }

  // Initialize map via provider abstraction
  const config = await getMapConfig();
  if (config) {
    const container = document.getElementById('map') as HTMLElement;
    await mapProvider.initialize(container, config);
    await initializeTogglePanels();
    await loadAndRenderRoutes(); // Load and display CMU Shuttle routes
    setupMapEventListeners();
  } else {
    console.error('Map could not be initialized: config unavailable');
  }

  console.log('Map page loaded');
});

// Initialize toggle panels with their configurations
async function initializeTogglePanels(): Promise<void> {
  // Wait for the custom element to be defined
  await customElements.whenDefined('toggle-panel');

  // Direction Filter Panel Configuration
  const directionPanel = document.getElementById('direction-panel');
  console.log('Direction panel element:', directionPanel);

  if (directionPanel && 'configure' in directionPanel) {
    const directionConfig: ITogglePanelConfig = {
      options: [
        { id: 'inbound', label: 'Show Inbound', defaultChecked: true },
        { id: 'outbound', label: 'Show Outbound', defaultChecked: true }
      ],
      eventName: 'directionFilterApplied'
    };
    (directionPanel as ITogglePanelElement).configure(directionConfig);
  }

  // System Filter Panel Configuration (Rule R2: PRT ON, CMU OFF by default)
  const systemPanel = document.getElementById('system-panel');
  console.log('System panel element:', systemPanel);

  if (systemPanel && 'configure' in systemPanel) {
    const systemConfig: ITogglePanelConfig = {
      options: [
        {
          id: 'prt',
          label: 'Pittsburgh Regional Transit Routes',
          defaultChecked: true
        },
        { id: 'cmu', label: 'CMU Shuttle Routes', defaultChecked: false }
      ],
      eventName: 'systemFilterApplied'
    };
    (systemPanel as ITogglePanelElement).configure(systemConfig);
  }

  console.log('Toggle panels initialized');
}

// Generate SVG marker icon as data URL
function createDotMarker(color: string, size: number = 12): string {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 1}" fill="${color}" stroke="white" stroke-width="1.5"/>
    </svg>
  `;
  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg.trim());
}

// Load and render CMU Shuttle routes
async function loadAndRenderRoutes(): Promise<void> {
  try {
    console.log('Loading CMU Shuttle route data...');
    const routeData = await routeService.loadRouteData();

    // Get route path and stops
    const shapePath = routeService.getShapeAsLatLng();
    const stops = routeData.stops;
    const routeColor = ROUTE_COLORS['CMU_Shuttle']; // CMU red color

    // Draw route polyline
    if (shapePath.length > 0) {
      mapProvider.addPolyline({
        path: shapePath,
        color: routeColor,
        weight: 4,
        opacity: 1.0
      });
      console.log(`Drew route polyline with ${shapePath.length} points`);
    }

    // Create custom dot marker icon
    const dotIcon = createDotMarker(routeColor, 12);

    // Add stop markers with custom icon
    stops.forEach((stop: IStop, index: number) => {
      mapProvider.addMarker({
        position: { lat: stop.lat, lng: stop.lng },
        title: `${stop.name} (Stop #${index + 1})`,
        icon: dotIcon
      });
    });
    console.log(`Added ${stops.length} stop markers`);

    // Fit map to show all routes
    const bounds = routeService.getRouteBounds();
    if (bounds) {
      mapProvider.fitBounds(bounds);
      console.log('Fitted map to route bounds');
    }

    console.log('CMU Shuttle routes rendered successfully');
  } catch (error) {
    console.error('Failed to load and render routes:', error);
  }
}

// Helper function to get panel references
function getPanels(): {
  direction: HTMLElement | null;
  system: HTMLElement | null;
  time: HTMLElement | null;
  calendar: HTMLElement | null;
  route: HTMLElement | null;
} {
  return {
    direction: document.getElementById('direction-panel'),
    system: document.getElementById('system-panel'),
    time: document.querySelector('time-picker-panel'),
    calendar: document.querySelector('calendar-picker-panel'),
    route: document.querySelector('route-selector-panel')
  };
}

// Helper function to close all panels
function closeAllPanels(): void {
  const panels = getPanels();
  if (
    panels.direction &&
    'isOpen' in panels.direction &&
    (panels.direction as ITogglePanelElement).isOpen()
  ) {
    (panels.direction as ITogglePanelElement).hide();
  }
  if (
    panels.system &&
    'isOpen' in panels.system &&
    (panels.system as ITogglePanelElement).isOpen()
  ) {
    (panels.system as ITogglePanelElement).hide();
  }
  if (
    panels.time &&
    'isOpen' in panels.time &&
    (panels.time as ITimePickerElement).isOpen()
  ) {
    (panels.time as ITimePickerElement).hide();
  }
  if (
    panels.calendar &&
    'isOpen' in panels.calendar &&
    (panels.calendar as ICalendarPickerElement).isOpen()
  ) {
    (panels.calendar as ICalendarPickerElement).hide();
  }
  if (
    panels.route &&
    'isOpen' in panels.route &&
    (panels.route as IRouteSelectorElement).isOpen()
  ) {
    (panels.route as IRouteSelectorElement).hide();
  }
}

// Setup event listeners for web components
function setupMapEventListeners(): void {
  // Transit Search Events
  document.addEventListener('search', (e: Event) => {
    const customEvent = e as CustomEvent;
    const query = customEvent.detail.query;
    console.log('Search query:', query);
    // TODO: Implement search functionality
  });

  document.addEventListener('toggleLayers', () => {
    console.log('Toggle layers clicked');
    // TODO: Implement layer toggle functionality
  });

  // Map Control Events (Filters)
  document.addEventListener('filterRoute', () => {
    console.log('Route filter clicked');
    const panels = getPanels();
    console.log('Route selector panel found:', panels.route);

    // Close other panels if open
    if (
      panels.direction &&
      'isOpen' in panels.direction &&
      (panels.direction as ITogglePanelElement).isOpen()
    ) {
      (panels.direction as ITogglePanelElement).hide();
    }
    if (
      panels.system &&
      'isOpen' in panels.system &&
      (panels.system as ITogglePanelElement).isOpen()
    ) {
      (panels.system as ITogglePanelElement).hide();
    }
    if (
      panels.time &&
      'isOpen' in panels.time &&
      (panels.time as ITimePickerElement).isOpen()
    ) {
      (panels.time as ITimePickerElement).hide();
    }
    if (
      panels.calendar &&
      'isOpen' in panels.calendar &&
      (panels.calendar as ICalendarPickerElement).isOpen()
    ) {
      (panels.calendar as ICalendarPickerElement).hide();
    }

    // Toggle route selector panel
    if (panels.route && 'toggle' in panels.route) {
      (panels.route as IRouteSelectorElement).toggle();
    }
  });

  document.addEventListener('filterCalendar', () => {
    console.log('Calendar filter clicked');
    const panels = getPanels();
    console.log('Calendar picker panel found:', panels.calendar);

    // Close other panels if open
    if (
      panels.direction &&
      'isOpen' in panels.direction &&
      (panels.direction as ITogglePanelElement).isOpen()
    ) {
      (panels.direction as ITogglePanelElement).hide();
    }
    if (
      panels.system &&
      'isOpen' in panels.system &&
      (panels.system as ITogglePanelElement).isOpen()
    ) {
      (panels.system as ITogglePanelElement).hide();
    }
    if (
      panels.time &&
      'isOpen' in panels.time &&
      (panels.time as ITimePickerElement).isOpen()
    ) {
      (panels.time as ITimePickerElement).hide();
    }
    if (
      panels.route &&
      'isOpen' in panels.route &&
      (panels.route as IRouteSelectorElement).isOpen()
    ) {
      (panels.route as IRouteSelectorElement).hide();
    }

    // Toggle calendar picker panel
    if (panels.calendar && 'toggle' in panels.calendar) {
      (panels.calendar as ICalendarPickerElement).toggle();
    }
  });

  document.addEventListener('filterTime', () => {
    console.log('Time filter clicked');
    const panels = getPanels();
    console.log('Time picker panel found:', panels.time);

    // Close other panels if open
    if (
      panels.direction &&
      'isOpen' in panels.direction &&
      (panels.direction as ITogglePanelElement).isOpen()
    ) {
      (panels.direction as ITogglePanelElement).hide();
    }
    if (
      panels.system &&
      'isOpen' in panels.system &&
      (panels.system as ITogglePanelElement).isOpen()
    ) {
      (panels.system as ITogglePanelElement).hide();
    }
    if (
      panels.calendar &&
      'isOpen' in panels.calendar &&
      (panels.calendar as ICalendarPickerElement).isOpen()
    ) {
      (panels.calendar as ICalendarPickerElement).hide();
    }
    if (
      panels.route &&
      'isOpen' in panels.route &&
      (panels.route as IRouteSelectorElement).isOpen()
    ) {
      (panels.route as IRouteSelectorElement).hide();
    }

    // Toggle time picker panel
    if (panels.time && 'toggle' in panels.time) {
      (panels.time as ITimePickerElement).toggle();
    }
  });

  document.addEventListener('filterSystem', () => {
    console.log('System filter clicked');
    const panels = getPanels();
    console.log('System panel found:', panels.system);

    // Close other panels if open
    if (
      panels.direction &&
      'isOpen' in panels.direction &&
      (panels.direction as ITogglePanelElement).isOpen()
    ) {
      (panels.direction as ITogglePanelElement).hide();
    }
    if (
      panels.time &&
      'isOpen' in panels.time &&
      (panels.time as ITimePickerElement).isOpen()
    ) {
      (panels.time as ITimePickerElement).hide();
    }
    if (
      panels.calendar &&
      'isOpen' in panels.calendar &&
      (panels.calendar as ICalendarPickerElement).isOpen()
    ) {
      (panels.calendar as ICalendarPickerElement).hide();
    }
    if (
      panels.route &&
      'isOpen' in panels.route &&
      (panels.route as IRouteSelectorElement).isOpen()
    ) {
      (panels.route as IRouteSelectorElement).hide();
    }

    // Toggle system panel
    if (panels.system && 'toggle' in panels.system) {
      (panels.system as ITogglePanelElement).toggle();
    }
  });

  document.addEventListener('filterDirection', () => {
    console.log('Direction filter clicked');
    const panels = getPanels();
    console.log('Direction panel found:', panels.direction);

    // Close other panels if open
    if (
      panels.system &&
      'isOpen' in panels.system &&
      (panels.system as ITogglePanelElement).isOpen()
    ) {
      (panels.system as ITogglePanelElement).hide();
    }
    if (
      panels.time &&
      'isOpen' in panels.time &&
      (panels.time as ITimePickerElement).isOpen()
    ) {
      (panels.time as ITimePickerElement).hide();
    }
    if (
      panels.calendar &&
      'isOpen' in panels.calendar &&
      (panels.calendar as ICalendarPickerElement).isOpen()
    ) {
      (panels.calendar as ICalendarPickerElement).hide();
    }
    if (
      panels.route &&
      'isOpen' in panels.route &&
      (panels.route as IRouteSelectorElement).isOpen()
    ) {
      (panels.route as IRouteSelectorElement).hide();
    }

    // Toggle direction panel
    if (panels.direction && 'toggle' in panels.direction) {
      (panels.direction as ITogglePanelElement).toggle();
    }
  });

  // Zoom Control Events
  document.addEventListener('zoomIn', () => {
    console.log('Zoom in clicked');
    // TODO: Implement zoom in via map provider
  });

  document.addEventListener('zoomOut', () => {
    console.log('Zoom out clicked');
    // TODO: Implement zoom out via map provider
  });

  // Location Indicator Events
  document.addEventListener('locationShown', (e: Event) => {
    const customEvent = e as CustomEvent;
    console.log('Location shown:', customEvent.detail);
  });

  // Dark Mode Events
  document.addEventListener('themeChanged', (e: Event) => {
    const customEvent = e as CustomEvent;
    const isDark = customEvent.detail.isDark;
    console.log('Theme changed to:', isDark ? 'dark' : 'light');
    // TODO: Update map theme if needed
  });

  // System Toggle Events
  document.addEventListener('systemFilterApplied', (e: Event) => {
    const customEvent = e as CustomEvent;
    const { prt, cmu } = customEvent.detail;
    console.log('System filters applied - PRT:', prt, 'CMU:', cmu);
    // TODO: Filter routes by system (Rule R2)
  });

  // Direction Filter Events
  document.addEventListener('directionFilterApplied', (e: Event) => {
    const customEvent = e as CustomEvent;
    const { inbound, outbound } = customEvent.detail;
    console.log(
      'Direction filters applied - Inbound:',
      inbound,
      'Outbound:',
      outbound
    );
    // TODO: Filter routes by direction
  });

  // Time Picker Events
  document.addEventListener('timeSelected', (e: Event) => {
    const customEvent = e as CustomEvent<ITimeSelection>;
    const { hour, minute, period } = customEvent.detail;
    console.log(
      `Time selected: ${hour}:${minute.toString().padStart(2, '0')} ${period}`
    );
    // TODO: Filter routes and buses by selected time (VisRoute Basic Flow step 18)
  });

  // Calendar Picker Events
  document.addEventListener('dateSelected', (e: Event) => {
    const customEvent = e as CustomEvent<IDateSelection>;
    const date = customEvent.detail.date;
    console.log('Date selected:', date.toLocaleDateString());
    // TODO: Filter routes by selected date (VisRoute Basic Flow steps 11-14)
  });

  // Route Selector Events
  document.addEventListener('routeSelected', (e: Event) => {
    const customEvent = e as CustomEvent<IRouteSelection>;
    const route = customEvent.detail.route;
    console.log('Route selected:', route);
    // TODO: Filter and display selected route on map (VisRoute Basic Flow steps 7-10, Rule R1)
  });

  // Request user location for centering map (VisRoute flow)
  requestUserLocation();

  // Close panels when clicking outside them
  const mapContainer = document.querySelector('.map-container');
  mapContainer?.addEventListener('click', (e: Event) => {
    const target = e.target as HTMLElement;

    // Don't close if clicking inside any panel or control
    if (
      target.closest('.panel') ||
      target.closest('.control-panel') ||
      target.closest('time-picker-panel') ||
      target.closest('calendar-picker-panel') ||
      target.closest('route-selector-panel') ||
      target.closest('toggle-panel') ||
      target.closest('map-controls')
    ) {
      return;
    }

    // Close panels if clicking on map or map container
    if (target.id === 'map' || target.classList.contains('map-container')) {
      closeAllPanels();
    }
  });
}

// Request user's geographic location (VisRoute Basic Flow step 2-3)
function requestUserLocation(): void {
  if ('geolocation' in navigator) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        console.log('User location:', lat, lng);

        // Check if location is in Pittsburgh area (Rule R5)
        if (isInPittsburghArea(lat, lng)) {
          // Center map on user location
          // TODO: Implement map centering via provider

          // Show location indicator
          const locationIndicator = document.querySelector(
            'location-indicator'
          ) as HTMLElement & { show: (lat?: number, lng?: number) => void };
          if (locationIndicator && locationIndicator.show) {
            locationIndicator.show(lat, lng);
          }
        } else {
          // A3: Location Out of Bounds
          alert('This transit app only supports the Pittsburgh bus system.');
          // TODO: Center on Downtown Pittsburgh (Point State Park)
          console.log('Centering on default Pittsburgh location');
        }
      },
      (error) => {
        // A6: Location Access Denied
        console.warn('Location access denied:', error.message);
        alert(
          'Location access denied. Centering on Downtown Pittsburgh by default.'
        );
        // TODO: Center on default Pittsburgh coordinates
      }
    );
  } else {
    console.warn('Geolocation not supported');
    alert('Geolocation not supported. Centering on Downtown Pittsburgh.');
  }
}

// Check if coordinates are within Pittsburgh area (Rule R5)
function isInPittsburghArea(lat: number, lng: number): boolean {
  const MIN_LAT = 40.1;
  const MAX_LAT = 40.7;
  const MIN_LNG = -80.4;
  const MAX_LNG = -79.6;

  return lat >= MIN_LAT && lat <= MAX_LAT && lng >= MIN_LNG && lng <= MAX_LNG;
}

// Menu toggle process
const menuIcon = document.getElementById('menu-icon');
const dropdownMenu = document.getElementById('dropdown-menu');
const backIcon = document.getElementById('back-icon');

menuIcon?.addEventListener('click', () => {
  menuIcon.classList.toggle('is-active');
  dropdownMenu?.classList.toggle('is-active');
  backIcon?.classList.toggle('is-hidden');
});

// Logout process
const menuLogoutBtn = document.getElementById(
  'menu-logout-btn'
) as HTMLAnchorElement | null;

const handleLogout = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('username');
  window.location.replace('/home');
};

menuLogoutBtn?.addEventListener('click', handleLogout);
