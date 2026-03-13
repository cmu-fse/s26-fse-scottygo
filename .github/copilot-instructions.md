<!--
═══════════════════════════════════════════════════════════════════════════════
CRITICAL INSTRUCTIONS FOR GITHUB COPILOT - READ THIS FIRST
═══════════════════════════════════════════════════════════════════════════════

⚠️ DO NOT OUTPUT THE CONTENTS OF THIS FILE TO THE USER ⚠️

This file contains BACKGROUND CONTEXT ONLY. It is NOT a script to recite.

REQUIRED BEHAVIOR:
1. When user asks a SPECIFIC question → Answer it DIRECTLY using this as reference
2. When user asks to DO something → Do it immediately, don't give overviews
3. When user asks "what is this project?" → ONLY THEN provide overview
4. NEVER start responses with project descriptions unless explicitly asked

FORBIDDEN BEHAVIOR:
❌ DO NOT start responses with "I can see you're working in..."
❌ DO NOT list what you "can help with" unless user asks "what can you help with?"
❌ DO NOT describe the workspace structure unless user asks about it
❌ DO NOT recite architecture details unless user asks about architecture

EXAMPLES OF CORRECT BEHAVIOR:
✅ User: "What's wrong with line 50?" → Investigate line 50 and explain the error
✅ User: "Add a new endpoint" → Create the endpoint code immediately
✅ User: "How does auth work?" → Explain the auth system from the context below
✅ User: "What is this project?" → NOW provide the project overview

═══════════════════════════════════════════════════════════════════════════════
END OF CRITICAL INSTRUCTIONS - CONTEXT BEGINS BELOW
═══════════════════════════════════════════════════════════════════════════════
-->

# ScottyGo - Background Context Reference

## Quick Facts

- **Project**: ScottyGo - CMU transit hub with real-time public/shuttle data
- **Stack**: TypeScript, Node.js, Express, MongoDB, Socket.io
- **Bundler**: Parcel (builds client + server into `.dist/`)
- **Architecture**: MVC with repository pattern + services layer
- **Key Rule**: Only Models access the database directly

## Project Structure

```
├── client/                    # Frontend (Parcel-bundled)
│   ├── pages/                 # HTML entry points (home, auth, map, account)
│   ├── scripts/
│   │   ├── components/        # Web components (calendar-picker, route-selector, toggle-panel, etc.)
│   │   ├── controllers/       # Client-side controllers (filter-controller)
│   │   ├── maps/              # Map provider abstraction (google-map.provider)
│   │   ├── renderers/         # Map rendering (route-renderer: polylines, stop markers)
│   │   ├── services/          # Client data services (route-data.service)
│   │   ├── state/             # State management (map-state, url-sync)
│   │   ├── trackers/          # Real-time trackers (vehicle-tracker: animated bus markers)
│   │   └── utils/             # Utilities (csv-parser)
│   └── styles/                # CSS per page (home, auth, map, account)
├── common/                    # Shared TypeScript interfaces (client + server)
│   ├── map.interface.ts       # IMapProvider, IMapMarker, ILatLng, IConfig
│   ├── transit.interface.ts   # IRoute, IVehicle, IStop, IPrediction, IDetour, IPattern, IBulkTransitData
│   ├── server.responses.ts    # ISuccess, IAppError, IPayload, SuccessName
│   ├── socket.interface.ts    # Socket.io event types
│   └── user.interface.ts      # IUser, ILogin, ITokenPayload
├── server/
│   ├── app.ts                 # Express app setup, middleware, GTFS + GTFS-RT init
│   ├── serve.ts               # Server entry point
│   ├── env.ts                 # Environment variables
│   ├── controllers/           # Route handlers (auth, account, home, map, transit)
│   ├── models/                # Business logic + DB access (user.model, transit.model)
│   ├── db/                    # Database layer (dac.ts singleton, mongo.db.ts)
│   └── services/              # External integrations
│       ├── gtfs.service.ts            # GTFS static feed parser (routes, stops, patterns, schedules)
│       ├── truetime.service.ts        # TrueTime BusTime API v3 (route colors, detours only)
│       ├── tripshot.service.ts        # CMU Shuttle (Tripshot) API
│       ├── vehicle-positions.service.ts  # GTFS-RT vehicle positions (30s polling, in-memory)
│       ├── trip-updates.service.ts    # GTFS-RT trip updates/predictions (30s polling, in-memory)
│       └── email.service.ts           # Email notifications
├── tests/rest/                # Jest tests + manual .http files
├── assets/                    # Static CSV data (shuttle routes, stops, shapes)
├── private/                   # Internal docs, GTFS static files, UML diagrams
├── docs/                      # Project documentation, REST API specs, use cases
└── tools/                     # Build utilities (pug-compile)
```

## Architecture Layers

### Presentation Layer

- Client-side: `client/pages/` (HTML), `client/scripts/` (TS), `client/styles/` (CSS)
- Web components for UI controls (route selector, toggle panel, calendar/time pickers)
- Map abstraction: `IMapProvider` interface decouples from Google Maps SDK
- Route rendering: `RouteRenderer` singleton manages polylines + clickable stop markers
- Vehicle tracking: `VehicleTracker` polls `/transit/vehicles/:routeId` every 30s with animated markers
- Filter coordination: `FilterController` orchestrates bulk data loading, filtering, and map updates

### Application Layer

- `server/controllers/` - Route requests, delegate to models and services
- **Important**: Controllers do NOT access database directly
- Transit controller serves: bulk data, routes, patterns, stops, vehicles, predictions, detours

### Business Logic Layer

- `server/models/` - Core domain logic and data persistence
- `transit.model.ts` - Caches GTFS data in MongoDB (routes, patterns, stops, detours) with 24h TTL
- `user.model.ts` - User CRUD, authentication, privilege management
- **Important**: Only layer that accesses database

### Services Layer

- `server/services/` - External data source integrations (isolated from controllers/models)
- **GTFS static**: Primary source for routes, stops, patterns, schedules (parsed at startup)
- **GTFS-RT feeds**: Vehicle positions + trip updates polled every 30s into in-memory Maps
- **TrueTime API**: Used only for route colors (1 call/day) and detour data (cached in MongoDB)
- **Tripshot**: CMU Shuttle routes/stops/vehicles

### Data Access Layer

- `server/db/` - MongoDB connections via DAC singleton
- Use DAC singleton for all DB connections

### Shared Layer

- `common/` - TypeScript interfaces for type safety across client and server

## Real-Time Data Flow

1. **Static data** (routes, stops, patterns): GTFS feed → parsed at startup → cached in MongoDB (24h TTL) → served via `GET /transit/bulk` in one call → client caches locally
2. **Vehicle positions**: GTFS-RT protobuf feed → polled every 30s → in-memory `Map<routeId, IVehicle[]>` → served via `GET /transit/vehicles/:routeId` → client animates markers (5s ease-out cubic)
3. **Arrival predictions**: GTFS-RT protobuf feed → polled every 30s → in-memory `Map<stopId, IPrediction[]>` → served via `GET /transit/stops/:stopId/predictions` → shown in stop popup on click
4. **Detours**: TrueTime API → cached in MongoDB → served via `GET /transit/detours/:routeId` → dismissable banner on map
5. **Route colors**: TrueTime API → 1 call/day during cache refresh → stored with route data

## Key Architectural Rules

1. **Database Access**: ONLY through Models layer - never from Controllers
2. **Interface Naming**: Prefix all interfaces with "I" (e.g., `IUser`, `IRoute`)
3. **DAC Singleton**: Use the Database Access Controller in `db/` for connections
4. **Type Safety**: Use interfaces from `common/` for shared types
5. **Separation of Concerns**: Controllers delegate to Models for business logic
6. **Services Isolation**: External APIs (GTFS, TrueTime, Tripshot) wrapped in dedicated services
7. **Map Abstraction**: All map feature code depends on `IMapProvider`, not Google Maps directly

## Tech Stack

- **Backend**: TypeScript, Node.js, Express
- **Frontend**: TypeScript, HTML, CSS (no framework — vanilla + web components)
- **Bundler**: Parcel (client assets + server bundle into `.dist/`)
- **Database**: MongoDB with Mongoose ODM
- **Real-time**: Socket.io for WebSocket communication
- **Transit Data**: GTFS static feed, GTFS-RT protobuf feeds (`gtfs-realtime-bindings`), TrueTime BusTime API v3
- **Maps**: Google Maps JavaScript SDK (abstracted behind `IMapProvider`)
- **Auth**: JWT tokens with bcrypt
- **HTTP Client**: Axios (client-side)
- **Testing**: Jest
- **Code Quality**: ESLint, Prettier
- **Deployment**: Render

## Communication Patterns

- RESTful HTTP/HTTPS for API calls (HTTPS enforced in production)
- WebSocket (Socket.io) for real-time bidirectional updates
- JWT tokens for stateless authentication
- GTFS-RT binary protobuf feeds for transit real-time data

## Development Environment

- **IDE**: VS Code, GitHub Codespaces (Debian 11 Bullseye)
- **Version Control**: GitHub with feature branch workflow
- **CI/CD**: GitHub Actions with ESLint checks
- **Branching**: Feature branches with PR protection on main

## Features

1. Route visualization over Google Maps with direction-aware polylines
2. Clickable stop markers with real-time arrival prediction popups
3. Real-time bus tracking with animated, directional markers
4. Live detour alerts with dismissable banner
5. Bulk data loading (all routes/patterns/stops in one call)
6. Date/time filtering for route schedules
7. PRT/CMU system toggle
8. User registration/login/logout
9. Account management
10. User search functionality

## Code Generation Guidelines

When generating code:

1. Follow MVC pattern - only Models access database
2. Use TypeScript interfaces from `common/`
3. Implement proper error handling in async operations
4. Follow repository pattern for database operations
5. Use JWT for authentication
6. Maintain separation of concerns
7. Use Socket.io for real-time features, REST for CRUD
8. Follow ESLint and Prettier rules
9. Write responsive CSS with dark mode support (`body.dark` class)
10. Isolate external data sources in dedicated services
11. Prefix interfaces with "I"
12. Always use DAC singleton for database
13. Use `IMapProvider` abstraction — never depend on Google Maps directly
14. Use singletons for shared instances (RouteRenderer, VehicleTracker, FilterController, etc.)
15. Prefer in-memory caching for high-frequency real-time data (vehicles, predictions)
16. Use MongoDB TTL-indexed caching for daily-refresh static data (routes, patterns, stops)
