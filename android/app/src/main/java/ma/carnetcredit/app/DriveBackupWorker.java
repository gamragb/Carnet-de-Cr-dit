package ma.carnetcredit.app;

import android.content.Context;
import android.content.SharedPreferences;
import androidx.annotation.NonNull;
import androidx.work.BackoffPolicy;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.Scope;
import com.google.android.gms.tasks.Tasks;
import java.io.IOException;
import java.util.Collections;
import java.util.concurrent.TimeUnit;

public class DriveBackupWorker extends Worker {
    public static final String UNIQUE_WORK_NAME = "carnet_credit_drive_auto_backup";

    public DriveBackupWorker(@NonNull Context context, @NonNull WorkerParameters workerParams) {
        super(context, workerParams);
    }

    public static void schedulePeriodicBackup(Context context, int intervalHours) {
        int safeHours = Math.max(1, intervalHours);
        Constraints constraints = new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build();

        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(
            DriveBackupWorker.class,
            safeHours,
            TimeUnit.HOURS
        )
            .setConstraints(constraints)
            .setInitialDelay(safeHours, TimeUnit.HOURS)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.MINUTES)
            .build();

        WorkManager.getInstance(context.getApplicationContext()).enqueueUniquePeriodicWork(
            UNIQUE_WORK_NAME,
            ExistingPeriodicWorkPolicy.UPDATE,
            request
        );
    }

    public static void cancelPeriodicBackup(Context context) {
        WorkManager.getInstance(context.getApplicationContext()).cancelUniqueWork(UNIQUE_WORK_NAME);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context appContext = getApplicationContext();
        SharedPreferences prefs = DriveRestHelper.getPrefs(appContext);
        if (!prefs.getBoolean(DriveRestHelper.KEY_ENABLED, false)) {
            return Result.success();
        }

        String snapshotJson;
        try {
            snapshotJson = DriveRestHelper.readSnapshot(appContext);
        } catch (IOException e) {
            prefs.edit().putString(DriveRestHelper.KEY_LAST_ERROR, e.getMessage()).apply();
            return Result.failure();
        }
        if (snapshotJson == null || snapshotJson.trim().isEmpty()) {
            return Result.success();
        }

        try {
            AuthorizationRequest authRequest = AuthorizationRequest.builder()
                .setRequestedScopes(
                    Collections.singletonList(new Scope(DriveRestHelper.DRIVE_FILE_SCOPE))
                )
                .build();

            AuthorizationResult authResult = Tasks.await(
                Identity.getAuthorizationClient(appContext).authorize(authRequest),
                30,
                TimeUnit.SECONDS
            );

            if (authResult == null || authResult.hasResolution() || authResult.getAccessToken() == null) {
                prefs.edit()
                    .putBoolean(DriveRestHelper.KEY_NEEDS_REAUTH, true)
                    .putString(DriveRestHelper.KEY_LAST_ERROR, "AUTH_REQUIRED")
                    .apply();
                return Result.success();
            }

            String token = authResult.getAccessToken();
            String cachedFileId = prefs.getString(DriveRestHelper.KEY_FILE_ID, "");
            DriveRestHelper.UploadResult uploaded = DriveRestHelper.uploadBackupJson(
                token,
                snapshotJson,
                cachedFileId
            );

            String nowIso = DriveRestHelper.nowUtcIso();
            prefs.edit()
                .putString(DriveRestHelper.KEY_FILE_ID, uploaded.fileId)
                .putString(DriveRestHelper.KEY_LAST_BACKUP_AT, nowIso)
                .putString(DriveRestHelper.KEY_LAST_ERROR, "")
                .putBoolean(DriveRestHelper.KEY_NEEDS_REAUTH, false)
                .apply();

            return Result.success();
        } catch (IOException ioEx) {
            prefs.edit().putString(DriveRestHelper.KEY_LAST_ERROR, ioEx.getMessage()).apply();
            return Result.retry();
        } catch (Exception ex) {
            prefs.edit().putString(DriveRestHelper.KEY_LAST_ERROR, ex.getMessage()).apply();
            return Result.retry();
        }
    }
}
