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
        SharedPreferences prefs = DriveRestHelper.getPrefs(ctx);
        DriveRestHelper.deleteSnapshot(ctx);
        prefs.edit()
            .remove(DriveRestHelper.KEY_ENABLED)
            .remove(DriveRestHelper.KEY_INTERVAL_HOURS)
            .remove(DriveRestHelper.KEY_FILE_ID)
            .remove(DriveRestHelper.KEY_ACCOUNT_EMAIL)
            .remove(DriveRestHelper.KEY_LAST_BACKUP_AT)
            .remove(DriveRestHelper.KEY_LAST_ERROR)
            .remove(DriveRestHelper.KEY_NEEDS_REAUTH)
            .apply();

        boolean emailStillEnabled = prefs.getBoolean(DriveRestHelper.KEY_EMAIL_BACKUP_ENABLED, false);
        if (!emailStillEnabled) {
            DriveBackupWorker.cancelPeriodicBackup(ctx);
        }

        JSObject ret = new JSObject();
        ret.put("connected", false);
        call.resolve(ret);
    }

    @PluginMethod
    public void clearAllBackups(PluginCall call) {
        executor.execute(() -> {
            Context ctx = getContext();
            DriveBackupWorker.cancelPeriodicBackup(ctx);
            DriveRestHelper.deleteSnapshot(ctx);
            DriveRestHelper.deleteEmailPayload(ctx);
            DriveRestHelper.deleteEmailAttachment(ctx);
            DriveRestHelper.getPrefs(ctx).edit().clear().apply();

            JSObject ret = new JSObject();
            ret.put("cleared", true);
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void sendEmailNow(PluginCall call) {
        String email = call.getString("email", "");
        String payloadJson = call.getString("payloadJson", "");
        String attachmentJson = call.getString("attachmentJson", "");
        if (email == null || email.trim().isEmpty()) {
            call.reject("INVALID_EMAIL");
            return;
        }
        if (payloadJson == null || payloadJson.trim().isEmpty()) {
            call.reject("Empty email payload");
            return;
        }

        final String cleanEmail = email.trim();
        final String cleanAttachment = attachmentJson != null ? attachmentJson : "";
        executor.execute(() -> {
            try {
                Context ctx = getContext();
                DriveRestHelper.writeEmailPayload(ctx, payloadJson);
                if (!cleanAttachment.trim().isEmpty()) {
                    DriveRestHelper.writeEmailAttachment(ctx, cleanAttachment);
                }
                DriveRestHelper.EmailSendResult sent = DriveRestHelper.sendBackupToEmail(
                    cleanEmail,
                    payloadJson,
                    cleanAttachment
                );

                DriveRestHelper.getPrefs(ctx).edit()
                    .putString(DriveRestHelper.KEY_EMAIL_BACKUP_ADDRESS, cleanEmail)
                    .putString(DriveRestHelper.KEY_EMAIL_LAST_BACKUP_AT, sent.sentAt)
                    .putBoolean(DriveRestHelper.KEY_EMAIL_NEEDS_ACTIVATION, sent.needsActivation)
                    .putString(DriveRestHelper.KEY_EMAIL_LAST_ERROR, "")
                    .apply();

                JSObject ret = new JSObject();
                ret.put("sentAt", sent.sentAt);
                ret.put("email", cleanEmail);
                ret.put("needsActivation", sent.needsActivation);
                call.resolve(ret);
            } catch (Exception ex) {
                DriveRestHelper.getPrefs(getContext()).edit()
                    .putString(DriveRestHelper.KEY_EMAIL_LAST_ERROR, ex.getMessage())
                    .apply();
                call.reject(ex.getMessage() != null ? ex.getMessage() : "Email backup failed");
            }
        });
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
        SharedPreferences prefs = DriveRestHelper.getPrefs(ctx);
        prefs.edit()
            .putBoolean(DriveRestHelper.KEY_ENABLED, enabled)
            .putInt(DriveRestHelper.KEY_INTERVAL_HOURS, intervalHours)
            .apply();

        boolean emailEnabled = prefs.getBoolean(DriveRestHelper.KEY_EMAIL_BACKUP_ENABLED, false);
        if (enabled || emailEnabled) {
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
    public void configureEmailBackup(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        String email = call.getString("email", "");
        int intervalHours = Math.max(1, call.getInt("intervalHours", DriveRestHelper.DEFAULT_INTERVAL_HOURS));
        String payloadJson = call.getString("payloadJson", "");
        String attachmentJson = call.getString("attachmentJson", "");

        executor.execute(() -> {
            try {
                Context ctx = getContext();
                SharedPreferences prefs = DriveRestHelper.getPrefs(ctx);
                String cleanEmail = email != null ? email.trim() : "";
                boolean effectiveEnabled = enabled && !cleanEmail.isEmpty();

                if (payloadJson != null && !payloadJson.trim().isEmpty()) {
                    DriveRestHelper.writeEmailPayload(ctx, payloadJson);
                } else if (!effectiveEnabled) {
                    DriveRestHelper.deleteEmailPayload(ctx);
                }

                if (attachmentJson != null && !attachmentJson.trim().isEmpty()) {
                    DriveRestHelper.writeEmailAttachment(ctx, attachmentJson);
                } else if (!effectiveEnabled) {
                    DriveRestHelper.deleteEmailAttachment(ctx);
                }

                prefs.edit()
                    .putBoolean(DriveRestHelper.KEY_EMAIL_BACKUP_ENABLED, effectiveEnabled)
                    .putString(DriveRestHelper.KEY_EMAIL_BACKUP_ADDRESS, cleanEmail)
                    .putInt(DriveRestHelper.KEY_EMAIL_INTERVAL_HOURS, intervalHours)
                    .apply();

                boolean driveEnabled = prefs.getBoolean(DriveRestHelper.KEY_ENABLED, false);
                if (effectiveEnabled || driveEnabled) {
                    DriveBackupWorker.schedulePeriodicBackup(ctx, intervalHours);
                } else {
                    DriveBackupWorker.cancelPeriodicBackup(ctx);
                }

                JSObject ret = new JSObject();
                ret.put("enabled", effectiveEnabled);
                ret.put("email", cleanEmail);
                ret.put("intervalHours", intervalHours);
                call.resolve(ret);
            } catch (Exception ex) {
                call.reject(ex.getMessage() != null ? ex.getMessage() : "Email backup config failed");
            }
        });
    }

    @PluginMethod
    public void getEmailStatus(PluginCall call) {
        SharedPreferences prefs = DriveRestHelper.getPrefs(getContext());
        JSObject ret = new JSObject();
        ret.put("enabled", prefs.getBoolean(DriveRestHelper.KEY_EMAIL_BACKUP_ENABLED, false));
        ret.put("email", prefs.getString(DriveRestHelper.KEY_EMAIL_BACKUP_ADDRESS, ""));
        ret.put(
            "intervalHours",
            prefs.getInt(DriveRestHelper.KEY_EMAIL_INTERVAL_HOURS, DriveRestHelper.DEFAULT_INTERVAL_HOURS)
        );
        ret.put("lastBackupAt", prefs.getString(DriveRestHelper.KEY_EMAIL_LAST_BACKUP_AT, ""));
        ret.put("lastError", prefs.getString(DriveRestHelper.KEY_EMAIL_LAST_ERROR, ""));
        ret.put("needsActivation", prefs.getBoolean(DriveRestHelper.KEY_EMAIL_NEEDS_ACTIVATION, false));
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
