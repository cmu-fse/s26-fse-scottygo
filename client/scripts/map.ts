import axios, { AxiosResponse } from 'axios';
import type { IUser } from '../../common/user.interface';
import type { IResponse } from '../../common/server.responses';
import type { IMapProvider, IConfig } from '../../common/map.interface';
import { GoogleMapProvider } from './maps/google-map.provider';

// Import web components
import './components/app-header';
import './components/transit-search';
import './components/map-controls';
import './components/zoom-controls';
import './components/route-bell';
import './components/live-notifications';
import './components/bus-report-form';
import type { BusReportFormElement } from './components/bus-report-form';
import type { IRouteBellElement } from './components/route-bell';
import { LocationIndicator } from './components/location-indicator';
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

// Import state management and controllers
import { MapStateManager } from './state/map-state';
import { URLSyncManager } from './state/url-sync';
import { FilterController } from './controllers/filter-controller';
import { RouteRenderer } from './renderers/route-renderer';
import { VehicleTracker } from './trackers/vehicle-tracker';

// Export empty object to treat as module
export {};

// Modal utility functions

// Extend the global Window interface to include showModal
declare global {
  interface Window {
    showModal?: (title: string, message: string) => void;
  }
}

function showModal(title: string, message: string): void {
  const modal = document.getElementById('message-modal');
  const modalTitle = document.getElementById('modal-title');
  const modalMessage = document.getElementById('modal-message');
  const okButton = document.getElementById('modal-ok');

  if (modal && modalTitle && modalMessage && okButton) {
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    modal.classList.add('is-open');
    modal.removeAttribute('inert');

    // Close modal on OK button click
    const closeModal = () => {
      modal.classList.remove('is-open');
      modal.setAttribute('inert', '');
      okButton.removeEventListener('click', closeModal);
    };

    okButton.addEventListener('click', closeModal);
  } else {
    console.error('Modal elements not found in DOM:', {
      modal: !!modal,
      modalTitle: !!modalTitle,
      modalMessage: !!modalMessage,
      okButton: !!okButton
    });
    // Fallback to alert if modal not available
    alert(`${title}\n\n${message}`);
  }
}

// Export modal function for use in other modules
window.showModal = showModal;
console.log('showModal function registered globally');

// Global instances
const mapStateManager = MapStateManager.getInstance();
const urlSyncManager = URLSyncManager.getInstance();
const filterController = FilterController.getInstance();
const routeRenderer = RouteRenderer.getInstance();
const vehicleTracker = VehicleTracker.getInstance();

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
        showModal('User Not Found', 'User does not exist: ' + response.message);
        return null;
      } else {
        showModal('Error', response.message);
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
        showModal('Database Error', response.message);
        return null;
      }
      // Handle any other server errors
      else {
        showModal('Server Error', response.message);
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

// ─── Subscription helpers (localStorage) ──────────────────────────────────────

const SUBSCRIPTIONS_KEY = 'scottygo_subscriptions';

interface StoredSubscription {
  routeId: string;
  routeName: string;
  lastUpdated: string;
  muted: boolean;
}

function getStoredSubscriptions(): StoredSubscription[] {
  try {
    return JSON.parse(localStorage.getItem(SUBSCRIPTIONS_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function isRouteSubscribed(routeId: string): boolean {
  return getStoredSubscriptions().some((s) => s.routeId === routeId);
}

function saveSubscription(routeId: string): void {
  const subs = getStoredSubscriptions();
  if (!subs.some((s) => s.routeId === routeId)) {
    subs.push({ routeId, routeName: `Route ${routeId}`, lastUpdated: 'just now', muted: false });
    localStorage.setItem(SUBSCRIPTIONS_KEY, JSON.stringify(subs));
  }
}

function removeSubscription(routeId: string): void {
  const subs = getStoredSubscriptions().filter((s) => s.routeId !== routeId);
  localStorage.setItem(SUBSCRIPTIONS_KEY, JSON.stringify(subs));
}

function showSubscriptionToast(message: string): void {
  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    z-index: 10000;
    font-size: 14px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}


// ─── Map provider ──────────────────────────────────────────────────────────────

// Map provider instance — depends on IMapProvider, not Google Maps directly
const mapProvider: IMapProvider = new GoogleMapProvider();

// Store user/initial location for recenter functionality
let userLocation: { lat: number; lng: number } | null = null;

// Store user location marker reference
import type { IMapMarker } from '../../common/map.interface';
let userLocationMarker: IMapMarker | null = null;

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

    try {
      await mapProvider.initialize(container, config);
    } catch (error) {
      console.error('Failed to initialize Google Maps:', error);
      showModal(
        'Map Unavailable',
        'Unable to load Google Maps. Please check your internet connection and try again.'
      );
      return;
    }

    // Initialize all components
    routeRenderer.initialize(mapProvider);
    vehicleTracker.initialize(mapProvider);

    // Initialize toggle panels
    await initializeTogglePanels();

    // Initialize URL sync and restore state from URL
    urlSyncManager.initialize();

    // Set up route selector update callback before initializing filter controller
    filterController.setRouteSelectorCallback((routes) => {
      const routeSelector = document.querySelector(
        'route-selector-panel'
      ) as IRouteSelectorElement;
      if (routeSelector && 'setRoutes' in routeSelector) {
        routeSelector.setRoutes(routes);
        console.log(`Updated route selector with ${routes.length} routes`);
      }
    });

    // Initialize filter controller (fetches and renders routes)
    await filterController.initialize();

    // Setup event listeners for filter panels
    setupMapEventListeners();

    // Show/hide the route bell whenever the selected route changes
    mapStateManager.subscribe((state) => {
      const bell = document.querySelector('route-bell') as IRouteBellElement | null;
      if (!bell || typeof bell.showBell !== 'function') return;
      if (state.selectedRouteId) {
        bell.showBell(state.selectedRouteId, isRouteSubscribed(state.selectedRouteId));
      } else {
        bell.hideBell();
      }
    });

    // After initialization, if a route was restored from URL, apply route filter to render stops
    const restoredState = mapStateManager.getState();
    if (restoredState.selectedRouteId) {
      console.log('Restoring route from URL:', restoredState.selectedRouteId);
      await filterController.applyRouteFilter(restoredState.selectedRouteId);
    }

    // Request user location for centering map
    requestUserLocation();

  } else {
    console.error('Map could not be initialized: config unavailable');
    showModal(
      'Map Configuration Error',
      'Map configuration is unavailable. Please check your internet connection and try again.'
    );
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
    const currentZoom = mapProvider.getZoom();
    mapProvider.setZoom(currentZoom + 1);
  });

  document.addEventListener('zoomOut', () => {
    console.log('Zoom out clicked');
    const currentZoom = mapProvider.getZoom();
    mapProvider.setZoom(currentZoom - 1);
  });

  document.addEventListener('recenter', () => {
    console.log('Recenter clicked');
    if (userLocation) {
      mapProvider.setCenter(userLocation);
      mapProvider.setZoom(15);
      console.log('Recentered map on user location');
    } else {
      console.warn('No user location stored, cannot recenter');
    }
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
  document.addEventListener('systemFilterApplied', async (e: Event) => {
    const customEvent = e as CustomEvent;
    const { prt, cmu } = customEvent.detail;
    console.log('System filters applied - PRT:', prt, 'CMU:', cmu);
    mapStateManager.updateFilter('selectedSystems', { prt, cmu });
    await filterController.applySystemFilter();
  });

  // Direction Filter Events
  document.addEventListener('directionFilterApplied', async (e: Event) => {
    const customEvent = e as CustomEvent;
    const { inbound, outbound } = customEvent.detail;
    console.log(
      'Direction filters applied - Inbound:',
      inbound,
      'Outbound:',
      outbound
    );
    mapStateManager.updateFilter('selectedDirections', { inbound, outbound });
    await filterController.applyDirectionFilter();
  });

  // Time Picker Events
  document.addEventListener('timeSelected', async (e: Event) => {
    const customEvent = e as CustomEvent<ITimeSelection>;
    const { hour, minute, period } = customEvent.detail;
    console.log(
      `Time selected: ${hour}:${minute.toString().padStart(2, '0')} ${period}`
    );

    // Highlight the time filter button to indicate active filter
    const timeBtn = document.querySelector('#time-filter-btn');
    if (timeBtn) {
      timeBtn.classList.add('primary');
    }

    mapStateManager.updateFilter('selectedTime', { hour, minute, period });
    await filterController.applyDateTimeFilter();
  });

  // Calendar Picker Events
  document.addEventListener('dateSelected', async (e: Event) => {
    const customEvent = e as CustomEvent<IDateSelection>;
    const date = customEvent.detail.date;
    console.log('Date selected:', date.toLocaleDateString());
    mapStateManager.updateFilter('selectedDate', date);
    await filterController.applyDateTimeFilter();
  });

  // Bell subscription events
  document.addEventListener('bellSubscribe', (e: Event) => {
    const { routeId } = (e as CustomEvent<{ routeId: string }>).detail;
    saveSubscription(routeId);
    showSubscriptionToast(`Subscribed to Route ${routeId}`);
  });

  document.addEventListener('bellUnsubscribe', (e: Event) => {
    const { routeId } = (e as CustomEvent<{ routeId: string }>).detail;
    removeSubscription(routeId);
  });

  // Bus Report Form
  document.addEventListener('busReport', (e: Event) => {
    const { vid, routeId } = (e as CustomEvent<{ vid: string; routeId: string }>).detail;
    const form = document.querySelector('bus-report-form') as BusReportFormElement | null;
    if (form && typeof form.open === 'function') {
      form.open(vid, routeId);
    }
  });

  document.addEventListener('busReportSubmitted', (e: Event) => {
    const detail = (e as CustomEvent).detail;
    console.log('Bus report submitted:', detail);
    // TODO: send report to server
  });

  // Route Selector Events
  document.addEventListener('routeSelected', async (e: Event) => {
    const customEvent = e as CustomEvent<IRouteSelection>;
    const route = customEvent.detail.route;
    console.log('Route selected:', route);
    mapStateManager.updateFilter('selectedRouteId', route);
    await filterController.applyRouteFilter(route);
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
          // Store and center map on user location
          userLocation = { lat, lng };
          mapProvider.setCenter({ lat, lng });
          mapProvider.setZoom(15);

          // Place a marker on the map to show user location
          addUserLocationMarker(lat, lng);

          // Also show the location indicator component (wait for custom element to be defined)
          const locationIndicator =
            document.querySelector<LocationIndicator>('location-indicator');
          if (
            locationIndicator &&
            typeof locationIndicator.show === 'function'
          ) {
            locationIndicator.show(lat, lng);
          }
          console.log('Centered map on user location');
        } else {
          // A3: Location Out of Bounds
          showModal(
            'Location Out of Bounds',
            'This transit app only supports the Pittsburgh bus system.'
          );
          // Center on Downtown Pittsburgh (Point State Park)
          mapProvider.setCenter({ lat: 40.4406, lng: -80.0112 });
          mapProvider.setZoom(14);
          console.log('Centering on default Pittsburgh location');
        }
      },
      (error) => {
        // A6: Location Access Denied
        console.warn('Location access denied:', error.message);
        showModal(
          'Location Access Denied',
          'Location access denied. Centering on Downtown Pittsburgh by default.'
        );
        // Center on default Pittsburgh coordinates (Point State Park)
        mapProvider.setCenter({ lat: 40.4406, lng: -80.0112 });
        mapProvider.setZoom(14);
      }
    );
  } else {
    console.warn('Geolocation not supported');
    // A5: Unable To Access Location
    showModal(
      'Geolocation Unavailable',
      'Geolocation is not supported by your browser. Centering on Downtown Pittsburgh.'
    );
    mapProvider.setCenter({ lat: 40.4406, lng: -80.0112 });
    mapProvider.setZoom(14);
  }
}

// Add a blue dot marker on the map for user location
function addUserLocationMarker(lat: number, lng: number): void {
  // Remove previous user location marker if exists
  if (userLocationMarker) {
    userLocationMarker.remove();
    userLocationMarker = null;
  }

  // Create a blue dot SVG icon for user location
  const size = 18;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 1}" fill="#4285F4" stroke="white" stroke-width="2"/>
    </svg>
  `;
  const icon =
    'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg.trim());

  userLocationMarker = mapProvider.addMarker({
    position: { lat, lng },
    title: 'Your Location',
    icon: icon
  });
  console.log('User location marker added to map');
}

// Check if coordinates are within Pittsburgh area (Rule R5)
function isInPittsburghArea(lat: number, lng: number): boolean {
  const MIN_LAT = 40.1;
  const MAX_LAT = 40.7;
  const MIN_LNG = -80.4;
  const MAX_LNG = -79.6;

  return lat >= MIN_LAT && lat <= MAX_LAT && lng >= MIN_LNG && lng <= MAX_LNG;
}

