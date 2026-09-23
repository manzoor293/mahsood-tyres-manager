# Mahsood Tyre Manager

## Project

Build a Windows desktop application called:

Mahsood Tyre Manager

Subtitle:
Sales, Inventory & Shop Management System

The application is for managing a tyre shop and should work offline-first.

## Technology Stack

Use:

- Electron
- React
- Vite
- JavaScript
- Tailwind CSS
- Material UI when appropriate
- React Router
- Node.js through the Electron main process
- SQLite
- better-sqlite3
- Electron IPC
- Git

Do not use TypeScript.

Do not use MongoDB unless explicitly requested.

Do not use Express unless there is a clear architectural requirement.

## Electron Architecture

Use a secure Electron architecture:

React Renderer
↓
preload / contextBridge
↓
IPC
↓
Electron Main Process
↓
SQLite

Rules:

- Keep contextIsolation enabled.
- Keep nodeIntegration disabled.
- React must never access Node.js directly.
- React must never access SQLite directly.
- Database operations must run in the Electron main process.
- Expose only required functions through preload/contextBridge.
- Validate IPC inputs.

## Code Style

- Use React functional components.
- Use clear component names.
- Keep components reasonably small.
- Avoid unnecessary dependencies.
- Avoid duplicate code.
- Use async/await where appropriate.
- Keep business logic separate from UI components.
- Use meaningful variable and function names.

## Project Structure

Prefer a structure similar to:

electron/
main.cjs
preload.cjs
database/
ipc/
services/
utils/

src/
components/
pages/
layouts/
hooks/
context/
utils/
assets/

## Planned Modules

The application will eventually contain:

- Dashboard
- Products / Tyres
- Brands
- Categories
- Suppliers
- Purchases
- Sales / POS
- Customers
- Inventory
- Expenses
- Reports
- Settings
- Backup and Restore
- User Authentication

## Tyre/Product Data

Products may include:

- brand
- model
- tyre size
- category
- purchase price
- selling price
- stock quantity
- minimum stock level
- supplier
- notes
- created date

## Sales

Sales may include:

- invoice number
- customer
- sale items
- quantity
- selling price
- subtotal
- discount
- total
- amount paid
- remaining balance
- payment method
- sale date

Inventory must decrease when a sale is completed.

Inventory must increase when a purchase is recorded.

## Development Rules

Before making major changes:

1. Inspect the existing code.
2. Explain the intended approach briefly.
3. Modify only relevant files.
4. Run appropriate tests or build commands.
5. Report errors instead of hiding them.
6. Summarize the files changed after completing the task.

Do not implement unrelated features.

Do not rewrite working parts of the application unnecessarily.

For large features, implement them incrementally instead of creating the entire application at once.
