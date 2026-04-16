/**
 * Bus icon SVG generator.
 * Extracted from VehicleTracker so icon appearance can change independently
 * of polling/state logic.
 */

import type { IVehicle } from '../../../common/transit.interface';

/**
 * Build a data-URI SVG bus icon for a given vehicle and map zoom level.
 *
 * @param vehicle    - The vehicle whose heading and detour status drive the icon.
 * @param zoom       - Current map zoom level (used to scale the icon).
 * @param routeColor - The route's display colour (hex). Detoured buses override
 *                     this with amber automatically.
 */
export function createBusIcon(
  vehicle: IVehicle,
  zoom: number,
  routeColor: string
): { url: string; anchor: { x: number; y: number }; size: { width: number; height: number } } {
  // Detoured buses keep an amber override so they stand out on the map.
  const color = vehicle.isDetoured ? '#FFA500' : routeColor;

  const scale = Math.max(0.5, Math.min(2.5, (zoom - 10) * 0.3 + 1));

  // Normalise heading to [0, 360).
  const heading = (((vehicle.heading ?? 0) % 360) + 360) % 360;

  // Westward headings (180-359°): mirror the bus so the front stays
  // visually "correct" (windows above chassis, headlight at nose).
  // Eastward headings (0-179°): standard rotation only.
  const flip = heading >= 180;

  // Rotation angle that makes the bus front point toward `heading`.
  // Without flip: front is +x; rotate(heading-90) maps +x -> compass heading.
  // With flip: after scale(-1,1), effective front is -x;
  // rotate(-(heading+90)) maps -x -> compass heading.
  const rotDeg = flip ? -(heading + 90) : heading - 90;

  const vbSize = 40;
  const cx = vbSize / 2;
  const cy = vbSize / 2;
  const sz = Math.round(vbSize * scale);

  const groupTransform = flip
    ? `translate(${cx},${cy}) scale(-1,1) rotate(${rotDeg})`
    : `translate(${cx},${cy}) rotate(${rotDeg})`;

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${sz}" height="${sz}" viewBox="0 0 ${vbSize} ${vbSize}">` +
    `<g transform="${groupTransform}">` +
    `<rect x="-12" y="-5" width="24" height="10" rx="2" fill="${color}" stroke="rgba(0,0,0,0.35)" stroke-width="0.6"/>` +
    `<rect x="9" y="-5" width="3" height="10" fill="rgba(0,0,0,0.18)"/>` +
    `<rect x="4.5" y="-3.5" width="5" height="7" rx="1" fill="rgba(210,235,255,0.9)" stroke="rgba(0,0,0,0.25)" stroke-width="0.4"/>` +
    `<rect x="-1.5" y="-3.5" width="3.5" height="5" rx="0.5" fill="rgba(210,235,255,0.75)" stroke="rgba(0,0,0,0.2)" stroke-width="0.3"/>` +
    `<rect x="-7" y="-3.5" width="3.5" height="5" rx="0.5" fill="rgba(210,235,255,0.75)" stroke="rgba(0,0,0,0.2)" stroke-width="0.3"/>` +
    `<circle cx="12" cy="0" r="1.3" fill="rgba(255,255,200,0.95)"/>` +
    `<rect x="5" y="4.5" width="4.5" height="2.5" rx="0.8" fill="rgba(30,30,30,0.85)"/>` +
    `<rect x="-9.5" y="4.5" width="4.5" height="2.5" rx="0.8" fill="rgba(30,30,30,0.85)"/>` +
    `</g>` +
    `</svg>`;

  return {
    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
    anchor: { x: Math.round(cx * scale), y: Math.round(cy * scale) },
    size: { width: sz, height: sz }
  };
}
