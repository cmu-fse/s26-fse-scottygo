import axios, { AxiosResponse } from 'axios';
import type { IUser } from '../../common/user.interface';
import type { IResponse } from '../../common/server.responses';
import type { IMapProvider, IConfig } from '../../common/map.interface';
import { GoogleMapProvider } from './maps/google-map.provider';

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
  } else {
    console.error('Map could not be initialized: config unavailable');
  }

  console.log('Map page loaded');
});

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
