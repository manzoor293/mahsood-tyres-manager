# Mahsood Tyre Manager

Sales, Inventory & Shop Management System

JavaScript, React, Vite, and Electron frontend foundation with Tailwind CSS v4, Material UI/Emotion, and React Router. Requires Node.js 22.12+ (Node 24 LTS recommended) and npm.

```sh
npm install
npm run dev
```

On Windows PowerShell with script execution disabled, use `npm.cmd` instead of `npm`.

`npm run dev` starts Vite on `127.0.0.1:5173`, waits for it to listen, and opens Electron. Closing Electron or pressing Ctrl+C stops the development processes. The port is fixed; startup fails if it is already occupied. React/CSS changes update through Vite. Restart the command after editing main or preload files.

To run the built UI without Vite:

```sh
npm run build
npm start
```

This builds renderer assets, not an installer. Electron loads `dist/index.html` locally with relative asset paths.

## Architecture

- `src/`: React renderer; browser APIs only.
- `src/App.jsx`: Material UI theme and `HashRouter`, supporting local production files.
- `src/layouts/AppLayout.jsx`: persistent sidebar/header and scrollable route content.
- `src/components/`: reusable navigation, header, and local SVG icons.
- `src/routes/`: route definitions and shared navigation metadata; unknown routes return to Dashboard.
- `src/pages/PlaceholderPage.jsx`: shared placeholder for the nine modules, without sample data or business actions.
- `src/styles.css`: Tailwind v4 import and base styles. Tailwind handles layout; Material UI uses its theme and `sx` for component styling.
- `electron/main.cjs`: window lifecycle, local content loading, and security policy. Future privileged operations belong here.
- `electron/preload.cjs`: isolated context bridge exposing only `desktop.isElectron`. No generic IPC or Node API is exposed.
- `scripts/dev.mjs`: Vite/Electron startup and shutdown.
- `scripts/start.mjs`: built-app launcher; both launchers clear inherited `ELECTRON_RUN_AS_NODE` so Electron opens as a desktop application.
- `vite.config.js`: React tooling, local development address, and relative build paths.

Context isolation and renderer sandboxing are enabled; Node integration is disabled. Document navigation, new windows, webviews, and permission requests are blocked. Hash navigation stays inside the current document. The content security policy allows local scripts and Vite's local WebSocket; inline styles support Vite's CSS updates and Emotion. No database, authentication, or business functionality is implemented.

Routes: Dashboard, Products / Tyres, Suppliers, Purchases, Sales / POS, Customers, Expenses, Reports, and Settings. Fonts and icons are local and require no network access.

Development alone permits inline scripts for React Fast Refresh's preamble. Built HTML retains the stricter script policy.

## Verification

```sh
npm run test:electron:dev
npm run build
npm run test:electron
```

These checks launch real Electron windows, visit all nine routes, check active navigation, reload a hash route, verify unknown-route fallback, styling, narrow-window layout, the preload bridge, absence of renderer Node globals, and security preferences. They save screenshots under ignored `artifacts/` and exit. They require a desktop session.
