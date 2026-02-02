# ScottyGo Architecture Guide

## Project Overview

CMU transit hub integrating real-time public and shuttle data with student-contributed service updates.

## Architecture Diagrams

> **Note**: Check [`.github/diagrams/`](diagrams/) for the latest UML diagrams. Always verify diagram dates and look for new views (e.g., class diagrams, sequence diagrams) that may have been added since this document was last updated.

### Development View

**Reference**: [development-view-31jan26.png](diagrams/development-view-31jan26.png)

The development view shows the layered architecture and package structure:

- **Presentation Layer**: Client-side components (`pages/`, `scripts/`, `styles/`) handle UI rendering and user interactions
- **Application Layer**: Controllers route requests and orchestrate business logic through the service layer
- **Business Logic Layer**: Models contain core domain logic and encapsulate data persistence operations
- **Data Access Layer**: Database abstraction (`db/`) manages MongoDB connections via DAC singleton
- **Shared Layer**: Common TypeScript interfaces ensure type consistency across frontend and backend
- **External Integrations**: Google Maps API, TrueTime API, and Tripshot Data provide real-time transit information

**Key Architectural Principles**:

- Strict separation of concerns with one-way dependencies flowing downward
- Models are the only components that access the database directly
- Controllers delegate to Models rather than implementing business logic
- Shared types in `common/` maintain type safety across the stack

### Deployment View

**Reference**: [deployment-view-31jan26.png](diagrams/deployment-view-31jan26.png)

The deployment view illustrates the runtime environment and infrastructure:

- **Client Tier**: Chrome browsers accessing the application with responsive design support
- **Application Server**: Node.js/Express application deployed on Render
  - Serves HTML pages via server-side rendering (Pug templates)
  - Exposes RESTful API endpoints
  - Manages WebSocket connections via Socket.io for real-time updates
- **Database Tier**: MongoDB instance for persistent data storage
- **External Services**:
  - Google Maps API for mapping functionality
  - PRT TrueTime API for real-time bus tracking (rate-limited)
  - Tripshot Data for additional transit information
  - CMU Shibboleth Service for authentication

**Communication Patterns**:

- HTTP/HTTPS for RESTful API calls and page requests
- WebSocket (Socket.io) for bidirectional real-time communication
- JWT tokens for stateless authentication
- API rate limiting considerations for TrueTime API integration

## Technical Constraints

### Platform

- App must work on Chrome and be responsive to different screen sizes

### Programming Languages

- **Backend**: TypeScript with Node.js and Express
- **Frontend**: TypeScript, HTML, CSS

### Communication & Interface Constraints

- PRT TrueTime API / web service (usage limits apply)

## Software Stack & Technology

- **Mapping**: Google Maps API
- **Transit Data**: TrueTime API, Tripshot Data
- **Database**: MongoDB with Mongoose ODM
- **Real-time Communication**: Socket.io
- **Authentication**: JSON Web Tokens (JWT) with bcrypt

## Architectural Patterns

- **Repository Architecture**: DB access confined to Models layer
- **Event-Driven Architecture**: Real-time updates via Socket.io
- **Uniform RESTful Architecture**: HTTP endpoints follow REST conventions
- **MVC Pattern**: Models hold core application logic and are the only layer that accesses the database
- **Service-Layer Abstraction**: Data source logic separated from UI

## Authentication & Authorization

- **Stateless Token-Based Authentication** using JSON Web Tokens (JWT) and bcrypt
- **CMU Web Login Integration** via Shibboleth Service

## Development Environment & Tooling

- **IDE**: VS Code, GitHub Codespaces
- **Version Control**: Single repo via GitHub Classroom
- **Branching Strategy**: Feature Branch workflow with main-branch protection and Pull Requests
- **CI/CD**: GitHub Actions with ESLint checks
- **Project Management**: GitHub Projects
- **Issue Tracking**: GitHub Issues
- **Deployment**: Render
- **Code Quality**: ESLint and Prettier (ESLint runs as part of CI/CD)
- **Build Tool**: Bundler (e.g., Parcel)

## Features

1. **Route Visualization**: PRT and CMU Shuttle route visualization over Google Maps
2. **Live Notifications**: Service alerts generated from integrated active and passive user reports
3. **Real-Time Bus Tracking**: Live vehicle locations and dynamic reroutes based on current event data
4. **Stop and Schedule Discovery**: Identifies nearby stops and provides upcoming arrival times with vehicle capacity insights
5. **Offline Route Mapping**: Maintains a visible record of transit paths for use when network connectivity is unavailable
6. **User Registration**: Users can register and create an account
7. **User Login/Logout**: Users can log in and out of their accounts
8. **Manage Account**: Users can manage their accounts
9. **Search Information**: Search for users via username and email address, plus 2 additional searches defined in the Team Use Case (TUC)

## Top Non-Functional Requirements (NFRs)

> **Note**: This section is being finalized by the team. Placeholders below:
>
> - `<External NFR>` `(<short definition>)`: `<brief reason>` / `<list two steps to address them>`
> - `<Internal NFR>` `(<short definition>)`: `<reason>` / `<list two steps to address them>`

## Architectural Decisions

1. **Service-layer abstraction** to keep our data sources' logic separate from our UI
2. **Authentication via CMU web login** (Shibboleth Service)
3. **Socket.io for real-time updates**: Provides real-time server-client dynamic updates (client-server interaction via HTTP)
4. **MongoDB as central database**: Employ MongoDB as the central database
5. **Mongoose ODM**: Centralize MongoDB interactions through Schema-based models

## Design Decisions

1. **Database Dependency Isolation**: The dependency on the database is broken by confining all persistence logic to the Model layer, ensuring that Controllers and Views interact only with Models and remain independent of database-specific concerns
2. **Shared Type Definitions**: Ensures consistency and type safety across the full stack
3. **Middleware Pattern**: Use middleware for request processing and validation

> **Note**: Additional design patterns being finalized by the team.

## Component Responsibilities

### Backend Components

- **`serve.ts`/`app.ts`**: Configures and starts the application
- **`controllers/`**: Route HTTP/WebSocket requests and delegate operations to models
- **`models/`**: Define domain entities and encapsulate their persistence logic
- **`services/`**: Isolate business logic from controllers to enable reusability and testability
- **`db/`**: Provide database abstraction, connection management, and a centralized access interface via DAC singleton

### Shared Components

- **`common/`**: Shared TypeScript interfaces between frontend and backend

### Frontend Components

- **`pages/`**: Define server-rendered HTML templates used for dynamic page generation
- **`styles/`**: Contain CSS assets that define the application's visual design system
- **`scripts/`**: Implement client-side JavaScript for DOM manipulation, user interactions, and Socket.IO client connections

## Code Generation Guidelines

When generating code for this project:

1. **Follow the MVC pattern strictly**: Only Models should access the database
2. **Use TypeScript interfaces** from `common/` for shared types between frontend and backend
3. **Implement proper error handling** in all async operations
4. **Follow the repository pattern**: All database operations go through Models
5. **Use JWT tokens** for authentication in API endpoints
6. **Maintain separation of concerns**: Controllers delegate to Models, Models handle data logic
7. **Use Socket.io** for real-time features, HTTP/REST for standard CRUD operations
8. **Follow ESLint and Prettier** formatting rules
9. **Write responsive CSS** that works across different screen sizes
10. **Handle API rate limits** when working with TrueTime API
11. **Prefix interface names with "I"**: All TypeScript interfaces should be prefixed with "I" (e.g., IUser, IRoute, IStop)
12. **Always use the DAC singleton**: Use the DAC (Database Access Controller) singleton in `db/` for all database connections
13. **Isolate data source logic in services layer**: All external data source logic (e.g., fetching from TrueTime or Tripshot APIs) must be isolated in the `services/` layer
