# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a NestJS TypeScript starter project called "hackerton" - a fresh Node.js backend framework application using the latest NestJS v11 with TypeScript.

## Common Commands

### Development
- `npm run start:dev` - Start the application in watch mode (recommended for development)
- `npm run start:debug` - Start with debug mode and watch
- `npm run start` - Start the application normally
- `npm run start:prod` - Start in production mode (requires build first)

### Build & Production
- `npm run build` - Build the application using NestJS CLI
- Built files are output to `./dist` directory

### Code Quality
- `npm run lint` - Run ESLint with auto-fix on TypeScript files
- `npm run format` - Format code using Prettier
- Always run linting before commits as the project uses strict ESLint rules

### Testing
- `npm run test` - Run unit tests with Jest
- `npm run test:watch` - Run tests in watch mode
- `npm run test:cov` - Run tests with coverage report
- `npm run test:e2e` - Run end-to-end tests
- `npm run test:debug` - Run tests in debug mode

## Architecture & Structure

### NestJS Application Structure
- **Entry Point**: `src/main.ts` - Bootstrap application listening on port 3000 (or PORT env var)
- **Root Module**: `src/app.module.ts` - Main application module that imports all other modules
- **Controller Layer**: Controllers handle HTTP requests (e.g., `app.controller.ts`)
- **Service Layer**: Business logic resides in services (e.g., `app.service.ts`)
- **Test Structure**: 
  - Unit tests: `*.spec.ts` files alongside source files
  - E2E tests: `test/` directory with `*.e2e-spec.ts` files

### TypeScript Configuration
- Uses modern TypeScript with ES2023 target and NodeNext module resolution
- Decorators and metadata emission enabled for NestJS dependency injection
- Source maps enabled for debugging
- Strict null checks enabled but with relaxed `noImplicitAny`

### Code Style & Linting
- ESLint with TypeScript support and recommended rules
- Prettier integration with single quotes and trailing commas
- Custom ESLint rules: `no-explicit-any` disabled, floating promises as warnings
- Files are formatted automatically with Prettier on save

## Development Workflow

When adding new features:
1. Create modules using NestJS CLI: `nest generate module <name>`
2. Generate controllers: `nest generate controller <name>`
3. Generate services: `nest generate service <name>`
4. Follow the existing pattern: Controller → Service → Module registration
5. Add unit tests alongside each component
6. Run `npm run lint` and `npm run test` before committing

The application follows standard NestJS patterns with dependency injection, decorators, and modular architecture.