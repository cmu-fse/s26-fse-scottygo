import axios, { AxiosResponse } from 'axios';
import type { ILogin, IUser } from '../../common/user.interface';
import type {
  IAuthenticatedUser,
  IResponse
} from '../../common/server.responses';
import { isSuccess } from '../../common/server.responses';

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

// Document-ready event handler
document.addEventListener('DOMContentLoaded', async function (e: Event) {
  e.preventDefault();
  const loggedIn: boolean = await isLoggedIn(); // Check if user logged in
  if (!loggedIn) {
    window.location.replace('/home'); // Redirect to home page
  }
  console.log('App directory page loaded');
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

// Google Maps initialization
interface GoogleMapsInstance {
  new (
    el: HTMLElement | null,
    opts: { center: { lat: number; lng: number }; zoom: number }
  ): unknown;
}
declare const google: { maps: { Map: GoogleMapsInstance } };

declare global {
  interface Window {
    initMap: () => void;
  }
}

window.initMap = function () {
  new google.maps.Map(document.getElementById('map'), {
    center: { lat: 40.4432, lng: -79.9428 }, // CMU campus
    zoom: 15
  });
};

const mapsScript = document.createElement('script');
mapsScript.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.GOOGLE_MAPS_KEY}&callback=initMap&loading=async`;
mapsScript.async = true;
document.head.appendChild(mapsScript);

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
