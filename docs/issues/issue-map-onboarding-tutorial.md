# Issue: First-Time User Onboarding Tutorial for Map Page

## Summary

Create a step-by-step guided tutorial that introduces first-time users to the key map page components. The tutorial uses spotlight popups — small modals anchored next to each component — with the rest of the page dimmed and non-interactive.

## Motivation

New users landing on the map page for the first time have no guidance on how to use the search bar, filters, bell subscription, or stop markers. A lightweight onboarding walkthrough reduces the learning curve and improves feature discoverability.

## User Flow

1. On first visit to the map page (no `onboarding_complete` flag in `localStorage`), the tutorial starts automatically after the map finishes loading.
2. A semi-transparent dark overlay covers the entire page, blocking interaction with all elements.
3. A spotlight cutout highlights the current tutorial target component, making it visually prominent.
4. A small popup modal appears next to the highlighted component with:
   - A title and short description of the component
   - **"Next"** button — advance to the next step
   - **"Skip Tutorial"** button — dismiss all remaining steps and end the tutorial
5. After the last step, the popup shows **"Done"** instead of "Next".
6. On completion or skip, set `localStorage.setItem('onboarding_complete', 'true')` so the tutorial does not show again.

## Tutorial Steps

### Step 1 — Search Bar

- **Target**: `<transit-search>` component
- **Title**: "Search"
- **Description**: "Search for routes or stops by name. You can also set a custom planned location."

### Step 2 — Route Filter

- **Target**: Route filter button within `<map-controls>`
- **Title**: "Route Filter"
- **Description**: "Tap here to browse and select a specific route to display on the map."

### Step 3 — System Filter

- **Target**: System filter button within `<map-controls>`
- **Title**: "Transit System"
- **Description**: "Toggle between Pittsburgh Regional Transit (PRT) and CMU Shuttle routes."

### Step 4 — Direction Filter

- **Target**: Direction filter button within `<map-controls>`
- **Title**: "Direction Filter"
- **Description**: "Show only inbound, outbound, or both directions for the selected route."

### Step 5 — Clear Filters

- **Target**: Clear filter button within `<map-controls>`
- **Title**: "Clear Filters"
- **Description**: "Reset all active filters and return to the default map view."

### Step 6 — Subscribe Bell

- **Target**: `<route-bell>` component
- **Title**: "Route Notifications"
- **Description**: "Select a route first, then tap the bell to subscribe and receive live notifications about that route."

### Step 7 — Stop Markers

- **Target**: Any visible stop marker on the map (or a representative marker area)
- **Title**: "Stop Details"
- **Description**: "Tap any stop marker on the map to see detailed stop info and real-time arrival predictions."

## Visual Design

### Overlay

- Full-screen fixed overlay with `background: rgba(0, 0, 0, 0.5)`
- `z-index` above all map components but below the popup
- `pointer-events: all` to block interaction with covered elements

### Spotlight Cutout

- The target component gets a higher `z-index` than the overlay so it appears "punched through"
- Add a subtle glow or border highlight around the spotlighted element (e.g. `box-shadow: 0 0 0 4px rgba(196, 18, 48, 0.4)`, `border-radius` matching the component)
- The spotlighted element should **not** be interactive — it is visual-only

### Popup Modal

- Small card anchored near the spotlight target (positioned above, below, or to the side depending on screen space)
- White background, `border-radius: 14px`, soft shadow (`box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15)`)
- Step indicator (e.g. "1 of 7")
- Title: bold, 16px
- Description: regular, 14px, color `#555`
- Two buttons: primary "Next"/"Done" (CMU red) and secondary "Skip Tutorial" (gray text)
- Dark mode support: dark card background, light text

### Transitions

- Fade the overlay in on tutorial start
- Animate the spotlight and popup position when transitioning between steps (e.g. 300ms ease)
- Fade everything out on completion/skip

## Implementation Notes

### Component

- Create a new web component `<onboarding-tutorial>` in `client/scripts/components/onboarding-tutorial.ts`
- The component manages its own overlay, spotlight, popup, and step state
- Accepts a configuration array of steps, each with: `targetSelector`, `title`, `description`, `position` (preferred popup placement)

### Integration (map.ts)

- After `filterController.initialize()` and all setup is complete, check `localStorage.getItem('onboarding_complete')`
- If not set, instantiate and start the tutorial:
  ```ts
  const tutorial = document.querySelector('onboarding-tutorial');
  if (tutorial && !localStorage.getItem('onboarding_complete')) {
    tutorial.start();
  }
  ```

### localStorage Key

- Key: `onboarding_complete`
- Value: `'true'` when tutorial is completed or skipped
- Clearing this key (e.g. from dev tools) allows the tutorial to replay

### Accessibility

- Trap focus within the popup during tutorial
- Popup should have `role="dialog"` and `aria-modal="true"`
- Overlay should have `aria-hidden="true"`
- "Skip Tutorial" should be reachable via keyboard (Tab)

## Acceptance Criteria

- [ ] Tutorial appears on first map page visit (no `onboarding_complete` in localStorage)
- [ ] Tutorial does not appear on subsequent visits
- [ ] Seven steps display in order: Search Bar → Route Filter → System Filter → Direction Filter → Clear Filters → Bell → Stop Markers
- [ ] Each step highlights the correct component with a spotlight cutout
- [ ] Rest of the page is dimmed and non-interactive during tutorial
- [ ] "Next" advances to the next step; last step shows "Done"
- [ ] "Skip Tutorial" ends the tutorial immediately from any step
- [ ] Tutorial completion and skip both set `onboarding_complete` in localStorage
- [ ] Popup is correctly positioned near each target (no overflow off-screen)
- [ ] Works in both light and dark mode
- [ ] Focus is trapped within the popup
- [ ] Transitions are smooth (overlay fade, spotlight move)
