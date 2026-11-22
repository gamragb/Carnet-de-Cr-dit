/**
 * Central version & self-hosted Over-The-Air (OTA) update configuration.
 *
 * How to publish updates without resending an APK:
 * 1. Host your built `dist/` folder once on Netlify / Vercel / GitHub Pages.
 * 2. Set `DEFAULT_UPDATE_MANIFEST_URL` below to `https://YOUR-SITE/update.json`
 *    (or enter it directly in Settings -> Mises à jour).
 * 3. For every future update, bump `"version"` in `package.json` and run:
 *      npm run release:ota
 *    Then upload `release/update.json` and `release/bundle-<version>.zip` to your host.
 */
export const APP_VERSION = '1.1.0';

/**
 * Native Android shell version (increment only when adding new native Capacitor plugins or Java code).
 */
export const NATIVE_BINARY_VERSION = '1.1.0';

/**
 * Pre-configured HTTPS URL to your hosted update.json manifest.
 * Leave empty until your hosting URL is ready, or configure inside Settings.
 */
export const DEFAULT_UPDATE_MANIFEST_URL =
  'https://gamragb.github.io/Carnet-de-Cr-dit/update.json';

export const DEFAULT_PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=ma.carnetcredit.app';
