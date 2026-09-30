# Windows branding assets

Place the official Windows icon at `build/icon.ico`. Use a proper multi-resolution
ICO including 16, 32, 48, and 256 pixel sizes, prepared from the official logo.
The frontend logo remains at `src/assets/mahsood-tyres-logo.png`.

Electron automatically uses this optional ICO for the development and local
production BrowserWindow. Without it, Electron keeps its default window icon.

When Windows packaging is introduced, configure the packager's executable and
installer icon using `build/icon.ico`, and copy it to `resources/icon.ico` for
the packaged BrowserWindow. No packager or installer icon configuration is
enabled yet. The software/window name remains `Mahsood Tyre Manager`; the
visible business brand is `Mahsood Tyres`.
