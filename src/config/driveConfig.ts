/**
 * Google Drive automatic backup configuration.
 *
 * - Default automatic interval: every 10 hours.
 * - On Android APK: authenticates natively via Google Play Services AuthorizationClient
 *   using package `ma.carnetcredit.app` + release SHA-1 registered in Google Cloud Console
 *   and runs Android WorkManager in the background every 10 hours.
 * - On Web / PWA: authenticates via Google Identity Services using a Web OAuth Client ID
 *   (configured below or directly inside Settings -> Google Drive).
 */
export const DRIVE_AUTO_BACKUP_INTERVAL_HOURS = 10;
export const DRIVE_BACKUP_FOLDER_NAME = 'Carnet de Credit Backups';
export const DRIVE_BACKUP_FILE_NAME = 'carnet-credit-auto-backup.json';
export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

/**
 * Optional pre-configured Google OAuth 2.0 Web Client ID (`*.apps.googleusercontent.com`)
 * for Web / PWA users at https://gamragb.github.io/Carnet-de-Cr-dit/.
 * Leave empty until created in Google Cloud Console, or configure in Settings.
 */
export const DEFAULT_GOOGLE_WEB_CLIENT_ID = '';
