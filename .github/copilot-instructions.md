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
- **Stack**: TypeScript, Node.js, Express, MongoDB, Socket.io, Pug
- **Architecture**: MVC with repository pattern
- **Key Rule**: Only Models access the database directly

## Architecture Layers

### Presentation Layer

- Client-side: `pages/`, `scripts/`, `styles/`
- UI rendering and user interactions

### Application Layer

- `controllers/` - Route requests, delegate to models
- **Important**: Controllers do NOT access database directly

### Business Logic Layer

- `models/` - Core domain logic and data persistence
- **Important**: Only layer that accesses database

### Data Access Layer

- `db/` - MongoDB connections via DAC singleton
- Use DAC singleton for all DB connections

### Shared Layer

- `common/` - TypeScript interfaces for type safety across stack

### External Integrations

- Google Maps API, TrueTime API, Tripshot Data

## Key Architectural Rules

1. **Database Access**: ONLY through Models layer - never from Controllers
2. **Interface Naming**: Prefix all interfaces with "I" (e.g., `IUser`, `IRoute`)
3. **DAC Singleton**: Use the Database Access Controller in `db/` for connections
4. **Type Safety**: Use interfaces from `common/` for shared types
5. **Separation of Concerns**: Controllers delegate to Models for business logic

## Tech Stack

- **Backend**: TypeScript, Node.js, Express
- **Frontend**: TypeScript, HTML, CSS, Pug templates
- **Database**: MongoDB with Mongoose ODM
- **Real-time**: Socket.io for WebSocket communication
- **Auth**: JWT tokens with bcrypt
- **Testing**: Jest
- **Code Quality**: ESLint, Prettier
- **Deployment**: Render

## Communication Patterns

- RESTful HTTP/HTTPS for API calls
- WebSocket (Socket.io) for real-time bidirectional updates
- JWT tokens for stateless authentication

## Development Environment

- **IDE**: VS Code, GitHub Codespaces (Ubuntu 24.04.3 LTS)
- **Version Control**: GitHub with feature branch workflow
- **CI/CD**: GitHub Actions with ESLint checks
- **Branching**: Feature branches with PR protection on main

## Features

1. Route visualization over Google Maps
2. Live service alerts and notifications
3. Real-time bus tracking
4. Stop and schedule discovery with arrival times
5. Offline route mapping
6. User registration/login/logout
7. Account management
8. User search functionality

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
9. Write responsive CSS
10. Handle API rate limits (TrueTime API)
11. Prefix interfaces with "I"
12. Always use DAC singleton for database
13. Isolate external data sources in services layer
