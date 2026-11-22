package ma.carnetcredit.app;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "GoogleDriveBackup")
public class GoogleDrivePlugin extends Plugin {
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void getStatus(PluginCall call) {
        SharedPreferences prefs = DriveRestHelper.getPrefs(getContext());
        JSObject ret = new JSObject();
        ret.put("available", true);
        ret.put("enabled", prefs.getBoolean(DriveRestHelper.KEY_ENABLED, false));
        ret.put(
            "intervalHours",
            prefs.getInt(DriveRestHelper.KEY_INTERVAL_HOURS, DriveRestHelper.DEFAULT_INTERVAL_HOURS)
        );
        ret.put("email", prefs.getString(DriveRestHelper.KEY_ACCOUNT_EMAIL, ""));
        ret.put("fileId", prefs.getString(DriveRestHelper.KEY_FILE_ID, ""));
        ret.put("lastBackupAt", prefs.getString(DriveRestHelper.KEY_LAST_BACKUP_AT, ""));
        ret.put("lastError", prefs.getString(DriveRestHelper.KEY_LAST_ERROR, ""));
        ret.put("needsReauth", prefs.getBoolean(DriveRestHelper.KEY_NEEDS_REAUTH, false));
        call.resolve(ret);
    }

    @PluginMethod
    public void connect(PluginCall call) {
        MainActivity mainActivity = getMainActivityOrReject(call);
        if (mainActivity == null) return;

        int intervalHours = call.getInt("intervalHours", DriveRestHelper.DEFAULT_INTERVAL_HOURS);
        String snapshotJson = call.getString("snapshotJson", "");

        mainActivity.requestDriveAuthorization(true, new MainActivity.DriveAuthCallback() {
            @Override
            public void onToken(String accessToken) {
                executor.execute(() -> {
                    try {
                        Context ctx = getContext();
                        SharedPreferences prefs = DriveRestHelper.getPrefs(ctx);
                        String email = DriveRestHelper.fetchUserEmail(accessToken);
                        if (snapshotJson != null && !snapshotJson.trim().isEmpty()) {
                            DriveRestHelper.writeSnapshot(ctx, snapshotJson);
                        }

                        prefs.edit()
                            .putBoolean(DriveRestHelper.KEY_ENABLED, true)
                            .putInt(DriveRestHelper.KEY_INTERVAL_HOURS, Math.max(1, intervalHours))
                            .putString(DriveRestHelper.KEY_ACCOUNT_EMAIL, email)
                            .putBoolean(DriveRestHelper.KEY_NEEDS_REAUTH, false)
                            .putString(DriveRestHelper.KEY_LAST_ERROR, "")
                            .apply();

                        DriveBackupWorker.schedulePeriodicBackup(ctx, Math.max(1, intervalHours));

                        JSObject ret = new JSObject();
                        ret.put("connected", true);
                        ret.put("email", email);
                        call.resolve(ret);
                    } catch (Exception ex) {
                        call.reject(ex.getMessage() != null ? ex.getMessage() : "Drive connect failed");
                    }
                });
            }

            @Override
            public void onError(String message) {
                call.reject(message);
            }
        });
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        Context ctx = getContext();
        DriveBackupWorker.cancelPeriodicBackup(ctx);
        DriveRestHelper.deleteSnapshot(ctx);
        DriveRestHelper.getPrefs(ctx).edit().clear().apply();

        JSObject ret = new JSObject();
        ret.put("connected", false);
        call.resolve(ret);
    }

    @PluginMethod
    public void saveSnapshot(PluginCall call) {
        String json = call.getString("json");
        if (json == null || json.trim().isEmpty()) {
            call.reject("Missing snapshot json");
            return;
        }
        executor.execute(() -> {
            try {
                DriveRestHelper.writeSnapshot(getContext(), json);
                JSObject ret = new JSObject();
                ret.put("saved", true);
                call.resolve(ret);
            } catch (Exception ex) {
                call.reject(ex.getMessage() != null ? ex.getMessage() : "Snapshot write failed");
            }
        });
    }

    @PluginMethod
    public void configureSchedule(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", true));
        int intervalHours = Math.max(1, call.getInt("intervalHours", DriveRestHelper.DEFAULT_INTERVAL_HOURS));
        Context ctx = getContext();
        DriveRestHelper.getPrefs(ctx).edit()
            .putBoolean(DriveRestHelper.KEY_ENABLED, enabled)
            .putInt(DriveRestHelper.KEY_INTERVAL_HOURS, intervalHours)
            .apply();

        if (enabled) {
            DriveBackupWorker.schedulePeriodicBackup(ctx, intervalHours);
        } else {
            DriveBackupWorker.cancelPeriodicBackup(ctx);
        }

        JSObject ret = new JSObject();
        ret.put("enabled", enabled);
        ret.put("intervalHours", intervalHours);
        call.resolve(ret);
    }

    @PluginMethod
    public void backupNow(PluginCall call) {
        MainActivity mainActivity = getMainActivityOrReject(call);
        if (mainActivity == null) return;

        String json = call.getString("json", "");
        boolean interactive = Boolean.TRUE.equals(call.getBoolean("interactive", true));

        mainActivity.requestDriveAuthorization(interactive, new MainActivity.DriveAuthCallback() {
            @Override
            public void onToken(String accessToken) {
                executor.execute(() -> {
                    try {
                        Context ctx = getContext();
                        SharedPreferences prefs = DriveRestHelper.getPrefs(ctx);
                        String payload = (json != null && !json.trim().isEmpty())
                            ? json
                            : DriveRestHelper.readSnapshot(ctx);
                        if (payload == null || payload.trim().isEmpty()) {
                            call.reject("Empty backup payload");
                            return;
                        }
                        DriveRestHelper.writeSnapshot(ctx, payload);

                        String cachedFileId = prefs.getString(DriveRestHelper.KEY_FILE_ID, "");
                        DriveRestHelper.UploadResult uploaded = DriveRestHelper.uploadBackupJson(
                            accessToken,
                            payload,
                            cachedFileId
                        );

                        String email = prefs.getString(DriveRestHelper.KEY_ACCOUNT_EMAIL, "");
                        if (email == null || email.isEmpty()) {
                            email = DriveRestHelper.fetchUserEmail(accessToken);
                        }

                        String nowIso = DriveRestHelper.nowUtcIso();
                        prefs.edit()
                            .putString(DriveRestHelper.KEY_FILE_ID, uploaded.fileId)
                            .putString(DriveRestHelper.KEY_LAST_BACKUP_AT, nowIso)
                            .putString(DriveRestHelper.KEY_ACCOUNT_EMAIL, email)
                            .putString(DriveRestHelper.KEY_LAST_ERROR, "")
                            .putBoolean(DriveRestHelper.KEY_NEEDS_REAUTH, false)
                            .apply();

                        JSObject ret = new JSObject();
                        ret.put("ok", true);
                        ret.put("fileId", uploaded.fileId);
                        ret.put("backedUpAt", nowIso);
                        ret.put("email", email);
                        call.resolve(ret);
                    } catch (Exception ex) {
                        DriveRestHelper.getPrefs(getContext()).edit()
                            .putString(DriveRestHelper.KEY_LAST_ERROR, ex.getMessage())
                            .apply();
                        call.reject(ex.getMessage() != null ? ex.getMessage() : "Drive backup failed");
                    }
                });
            }

            @Override
            public void onError(String message) {
                call.reject(message);
            }
        });
    }

    @PluginMethod
    public void restoreLatest(PluginCall call) {
        MainActivity mainActivity = getMainActivityOrReject(call);
        if (mainActivity == null) return;

        mainActivity.requestDriveAuthorization(true, new MainActivity.DriveAuthCallback() {
            @Override
            public void onToken(String accessToken) {
                executor.execute(() -> {
                    try {
                        Context ctx = getContext();
                        SharedPreferences prefs = DriveRestHelper.getPrefs(ctx);
                        String cachedFileId = prefs.getString(DriveRestHelper.KEY_FILE_ID, "");
                        DriveRestHelper.DownloadResult downloaded = DriveRestHelper.downloadLatestBackupJson(
                            accessToken,
                            cachedFileId
                        );
                        String email = DriveRestHelper.fetchUserEmail(accessToken);

                        prefs.edit()
                            .putString(DriveRestHelper.KEY_FILE_ID, downloaded.fileId)
                            .putString(DriveRestHelper.KEY_ACCOUNT_EMAIL, email)
                            .putBoolean(DriveRestHelper.KEY_NEEDS_REAUTH, false)
                            .putString(DriveRestHelper.KEY_LAST_ERROR, "")
                            .apply();

                        JSObject ret = new JSObject();
                        ret.put("ok", true);
                        ret.put("fileId", downloaded.fileId);
                        ret.put("json", downloaded.json);
                        ret.put("email", email);
                        call.resolve(ret);
                    } catch (Exception ex) {
                        call.reject(ex.getMessage() != null ? ex.getMessage() : "Drive restore failed");
                    }
                });
            }

            @Override
            public void onError(String message) {
                call.reject(message);
            }
        });
    }

    private MainActivity getMainActivityOrReject(PluginCall call) {
        if (!(getActivity() instanceof MainActivity)) {
            call.reject("Activity unavailable");
            return null;
        }
        return (MainActivity) getActivity();
    }
}
