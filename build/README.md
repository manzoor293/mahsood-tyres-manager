# Windows branding assets

Place the official Windows icon at `build/icon.ico`. Use a proper multi-resolution
ICO including 16, 32, 48, and 256 pixel sizes, prepared from the official logo.
The frontend logo remains at `src/assets/mahsood-tyres-logo.png`.

Electron automatically uses this optional ICO for the development and local
production BrowserWindow. Without it, Electron keeps its default window icon.

Windows packaging uses `build/icon.ico` for the executable/installer and copies
it to `resources/icon.ico` for the packaged BrowserWindow. The internal app and
installer identity remains `Mahsood Tyre Manager` to preserve upgrades; visible
window and business branding is `Mahsood Tyres`.
