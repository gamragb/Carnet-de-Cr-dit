package ma.carnetcredit.app;

import android.content.Context;
import android.content.SharedPreferences;
import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import org.json.JSONArray;
import org.json.JSONObject;

public final class DriveRestHelper {
    public static final String DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
    public static final String PREFS_NAME = "carnet_drive_backup_prefs";
    public static final String KEY_ENABLED = "enabled";
    public static final String KEY_INTERVAL_HOURS = "interval_hours";
    public static final String KEY_FILE_ID = "file_id";
    public static final String KEY_ACCOUNT_EMAIL = "account_email";
    public static final String KEY_LAST_BACKUP_AT = "last_backup_at";
    public static final String KEY_LAST_ERROR = "last_error";
    public static final String KEY_NEEDS_REAUTH = "needs_reauth";

    public static final String KEY_EMAIL_BACKUP_ENABLED = "email_backup_enabled";
    public static final String KEY_EMAIL_BACKUP_ADDRESS = "email_backup_address";
    public static final String KEY_EMAIL_INTERVAL_HOURS = "email_interval_hours";
    public static final String KEY_EMAIL_LAST_BACKUP_AT = "email_last_backup_at";
    public static final String KEY_EMAIL_LAST_ERROR = "email_last_error";
    public static final String KEY_EMAIL_NEEDS_ACTIVATION = "email_needs_activation";

    public static final int DEFAULT_INTERVAL_HOURS = 10;
    public static final String BACKUP_FOLDER_NAME = "Carnet de Credit Backups";
    public static final String BACKUP_FILE_NAME = "carnet-credit-auto-backup.json";
    private static final String SNAPSHOT_FILE_NAME = "carnet_drive_backup_snapshot.json";
    private static final String EMAIL_PAYLOAD_FILE_NAME = "carnet_email_backup_payload.json";

    private DriveRestHelper() {}

    public static SharedPreferences getPrefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    public static String nowUtcIso() {
        SimpleDateFormat fmt = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US);
        fmt.setTimeZone(TimeZone.getTimeZone("UTC"));
        return fmt.format(new Date());
    }

    public static void writeSnapshot(Context context, String jsonContent) throws IOException {
        File dir = context.getApplicationContext().getFilesDir();
        File tmp = new File(dir, SNAPSHOT_FILE_NAME + ".tmp");
        File target = new File(dir, SNAPSHOT_FILE_NAME);
        try (FileOutputStream fos = new FileOutputStream(tmp)) {
            fos.write(jsonContent.getBytes(StandardCharsets.UTF_8));
            fos.getFD().sync();
        }
        if (target.exists() && !target.delete()) {
            // Fall through to rename/overwrite
        }
        if (!tmp.renameTo(target)) {
            try (FileOutputStream fos = new FileOutputStream(target)) {
                fos.write(jsonContent.getBytes(StandardCharsets.UTF_8));
            }
            // Clean up temp file if rename failed
            //noinspection ResultOfMethodCallIgnored
            tmp.delete();
        }
    }

    public static String readSnapshot(Context context) throws IOException {
        File target = new File(context.getApplicationContext().getFilesDir(), SNAPSHOT_FILE_NAME);
        if (!target.exists() || target.length() == 0) {
            return null;
        }
        try (FileInputStream fis = new FileInputStream(target);
             ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = fis.read(buf)) != -1) {
                out.write(buf, 0, n);
            }
            return out.toString(StandardCharsets.UTF_8.name());
        }
    }

    public static void deleteSnapshot(Context context) {
        File target = new File(context.getApplicationContext().getFilesDir(), SNAPSHOT_FILE_NAME);
        if (target.exists()) {
            //noinspection ResultOfMethodCallIgnored
            target.delete();
        }
    }

    public static void writeEmailPayload(Context context, String payloadJson) throws IOException {
        File dir = context.getApplicationContext().getFilesDir();
        File tmp = new File(dir, EMAIL_PAYLOAD_FILE_NAME + ".tmp");
        File target = new File(dir, EMAIL_PAYLOAD_FILE_NAME);
        try (FileOutputStream fos = new FileOutputStream(tmp)) {
            fos.write(payloadJson.getBytes(StandardCharsets.UTF_8));
            fos.getFD().sync();
        }
        if (target.exists() && !target.delete()) {
            // Fall through
        }
        if (!tmp.renameTo(target)) {
            try (FileOutputStream fos = new FileOutputStream(target)) {
                fos.write(payloadJson.getBytes(StandardCharsets.UTF_8));
            }
            //noinspection ResultOfMethodCallIgnored
            tmp.delete();
        }
    }

    public static String readEmailPayload(Context context) throws IOException {
        File target = new File(context.getApplicationContext().getFilesDir(), EMAIL_PAYLOAD_FILE_NAME);
        if (!target.exists() || target.length() == 0) {
            return null;
        }
        try (FileInputStream fis = new FileInputStream(target);
             ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = fis.read(buf)) != -1) {
                out.write(buf, 0, n);
            }
            return out.toString(StandardCharsets.UTF_8.name());
        }
    }

    public static void deleteEmailPayload(Context context) {
        File target = new File(context.getApplicationContext().getFilesDir(), EMAIL_PAYLOAD_FILE_NAME);
        if (target.exists()) {
            //noinspection ResultOfMethodCallIgnored
            target.delete();
        }
    }

    public static String refreshEmailPayloadTimestamp(String payloadJson, String utcIso) {
        if (payloadJson == null || payloadJson.trim().isEmpty()) {
            return payloadJson;
        }
        try {
            JSONObject obj = new JSONObject(payloadJson);
            String datePart = utcIso.length() >= 10 ? utcIso.substring(0, 10) : utcIso;
            String timePart = utcIso.length() >= 16 ? utcIso.substring(11, 16) : "";
            String stamp = timePart.isEmpty() ? datePart : (datePart + " • " + timePart + " UTC");

            if (obj.has("_subject")) {
                String subj = obj.optString("_subject", "");
                String updatedSubj = subj.replaceAll("\\d{4}-\\d{2}-\\d{2}$", datePart);
                obj.put("_subject", updatedSubj);
            }
            if (obj.has("تاريخ ووقت النسخة")) {
                obj.put("تاريخ ووقت النسخة", stamp);
            }
            if (obj.has("Date & Heure de sauvegarde")) {
                obj.put("Date & Heure de sauvegarde", stamp);
            }
            return obj.toString();
        } catch (Exception ignored) {
            return payloadJson;
        }
    }

    public static EmailSendResult sendBackupToEmail(String targetEmail, String payloadJson) throws Exception {
        String cleanEmail = targetEmail != null ? targetEmail.trim() : "";
        if (cleanEmail.isEmpty()) {
            throw new IOException("INVALID_EMAIL");
        }
        String nowIso = nowUtcIso();
        String freshPayload = refreshEmailPayloadTimestamp(payloadJson, nowIso);
        String urlStr = "https://formsubmit.co/ajax/" + URLEncoder.encode(cleanEmail, "UTF-8");
        byte[] body = freshPayload.getBytes(StandardCharsets.UTF_8);

        HttpURLConnection conn = null;
        try {
            URL url = new URL(urlStr);
            conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(20000);
            conn.setReadTimeout(30000);
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
            conn.setRequestProperty("Accept", "application/json");
            conn.setRequestProperty("Origin", "https://gamragb.github.io");
            conn.setRequestProperty("Referer", "https://gamragb.github.io/Carnet-de-Cr-dit/");
            conn.setRequestProperty(
                "User-Agent",
                "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124.0.0.0 Mobile Safari/537.36"
            );
            conn.setDoOutput(true);
            conn.setFixedLengthStreamingMode(body.length);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(body);
                os.flush();
            }

            int code = conn.getResponseCode();
            InputStream stream = code >= 200 && code < 400 ? conn.getInputStream() : conn.getErrorStream();
            String respBody = readStream(stream);
            String lower = respBody.toLowerCase(Locale.US);
            boolean needsActivation = lower.contains("activat") || lower.contains("confirm") || lower.contains("verify");

            if ((code < 200 || code >= 300) && !needsActivation) {
                throw new IOException("Email delivery error (" + code + "): " + respBody);
            }
            // Check JSON body success=false as well
            try {
                JSONObject jsonResp = new JSONObject(respBody);
                Object successVal = jsonResp.opt("success");
                boolean explicitFalse = Boolean.FALSE.equals(successVal) || "false".equalsIgnoreCase(String.valueOf(successVal));
                if (explicitFalse && !needsActivation) {
                    String msg = jsonResp.optString("message", "Email delivery rejected");
                    throw new IOException(msg);
                }
            } catch (IOException ioEx) {
                throw ioEx;
            } catch (Exception ignored) {
                // Non-JSON 2xx response
            }
            return new EmailSendResult(needsActivation, nowIso);
        } finally {
            if (conn != null) {
                conn.disconnect();
            }
        }
    }

    public static String fetchUserEmail(String accessToken) {
        try {
            HttpResponse res = request(
                "GET",
                "https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,displayName)",
                accessToken,
                null,
                null,
                null
            );
            if (res.code >= 200 && res.code < 300) {
                JSONObject root = new JSONObject(res.body);
                JSONObject user = root.optJSONObject("user");
                if (user != null) {
                    String email = user.optString("emailAddress", "").trim();
                    if (!email.isEmpty()) return email;
                    return user.optString("displayName", "").trim();
                }
            }
        } catch (Exception ignored) {
            // Non-critical metadata
        }
        return "";
    }

    public static UploadResult uploadBackupJson(
        String accessToken,
        String jsonContent,
        String cachedFileId
    ) throws Exception {
        String fileId = cachedFileId != null ? cachedFileId.trim() : "";

        // 1. Try direct update on cached fileId
        if (!fileId.isEmpty()) {
            UploadResult updated = tryUpdateExistingFile(accessToken, fileId, jsonContent);
            if (updated != null) {
                return updated;
            }
        }

        // 2. Find or create folder, then search for existing backup file inside it
        String folderId = findOrCreateFolder(accessToken);
        String existingId = findBackupFileId(accessToken, folderId);
        if (existingId != null && !existingId.isEmpty()) {
            UploadResult updated = tryUpdateExistingFile(accessToken, existingId, jsonContent);
            if (updated != null) {
                return updated;
            }
        }

        // 3. Create new multipart file inside backup folder
        String boundary = "carnet_drive_boundary_" + System.currentTimeMillis();
        JSONObject metadata = new JSONObject();
        metadata.put("name", BACKUP_FILE_NAME);
        metadata.put("mimeType", "application/json");
        if (folderId != null && !folderId.isEmpty()) {
            JSONArray parents = new JSONArray();
            parents.put(folderId);
            metadata.put("parents", parents);
        }

        StringBuilder multipart = new StringBuilder();
        multipart.append("--").append(boundary).append("\r\n");
        multipart.append("Content-Type: application/json; charset=UTF-8\r\n\r\n");
        multipart.append(metadata.toString()).append("\r\n");
        multipart.append("--").append(boundary).append("\r\n");
        multipart.append("Content-Type: application/json; charset=UTF-8\r\n\r\n");
        multipart.append(jsonContent).append("\r\n");
        multipart.append("--").append(boundary).append("--");

        HttpResponse createRes = request(
            "POST",
            "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime",
            accessToken,
            "multipart/related; boundary=" + boundary,
            null,
            multipart.toString().getBytes(StandardCharsets.UTF_8)
        );
        if (createRes.code < 200 || createRes.code >= 300) {
            throw new IOException("Drive upload failed (" + createRes.code + "): " + createRes.body);
        }
        JSONObject created = new JSONObject(createRes.body);
        return new UploadResult(
            created.optString("id", ""),
            created.optString("modifiedTime", nowUtcIso())
        );
    }

    public static DownloadResult downloadLatestBackupJson(
        String accessToken,
        String cachedFileId
    ) throws Exception {
        String fileId = cachedFileId != null ? cachedFileId.trim() : "";

        if (!fileId.isEmpty()) {
            HttpResponse direct = request(
                "GET",
                "https://www.googleapis.com/drive/v3/files/" + URLEncoder.encode(fileId, "UTF-8") + "?alt=media",
                accessToken,
                null,
                null,
                null
            );
            if (direct.code >= 200 && direct.code < 300) {
                return new DownloadResult(fileId, direct.body, nowUtcIso());
            }
        }

        String folderId = findFolderId(accessToken);
        String foundId = findBackupFileId(accessToken, folderId);
        if (foundId == null || foundId.isEmpty()) {
            throw new IOException("NO_DRIVE_BACKUP_FOUND");
        }

        HttpResponse download = request(
            "GET",
            "https://www.googleapis.com/drive/v3/files/" + URLEncoder.encode(foundId, "UTF-8") + "?alt=media",
            accessToken,
            null,
            null,
            null
        );
        if (download.code < 200 || download.code >= 300) {
            throw new IOException("Drive download failed (" + download.code + "): " + download.body);
        }
        return new DownloadResult(foundId, download.body, nowUtcIso());
    }

    private static UploadResult tryUpdateExistingFile(
        String accessToken,
        String fileId,
        String jsonContent
    ) throws Exception {
        HttpResponse res = request(
            "POST",
            "https://www.googleapis.com/upload/drive/v3/files/"
                + URLEncoder.encode(fileId, "UTF-8")
                + "?uploadType=media&fields=id,modifiedTime",
            accessToken,
            "application/json; charset=UTF-8",
            "PATCH",
            jsonContent.getBytes(StandardCharsets.UTF_8)
        );
        if (res.code == 404) {
            return null;
        }
        if (res.code < 200 || res.code >= 300) {
            throw new IOException("Drive update failed (" + res.code + "): " + res.body);
        }
        JSONObject obj = new JSONObject(res.body);
        return new UploadResult(
            obj.optString("id", fileId),
            obj.optString("modifiedTime", nowUtcIso())
        );
    }

    private static String findFolderId(String accessToken) throws Exception {
        String q = "name='" + BACKUP_FOLDER_NAME
            + "' and mimeType='application/vnd.google-apps.folder' and trashed=false";
        String url = "https://www.googleapis.com/drive/v3/files?spaces=drive&pageSize=1&fields=files(id)&q="
            + URLEncoder.encode(q, "UTF-8");
        HttpResponse res = request("GET", url, accessToken, null, null, null);
        if (res.code >= 200 && res.code < 300) {
            JSONArray files = new JSONObject(res.body).optJSONArray("files");
            if (files != null && files.length() > 0) {
                return files.getJSONObject(0).optString("id", "");
            }
        }
        return "";
    }

    private static String findOrCreateFolder(String accessToken) throws Exception {
        String existing = findFolderId(accessToken);
        if (existing != null && !existing.isEmpty()) {
            return existing;
        }
        JSONObject meta = new JSONObject();
        meta.put("name", BACKUP_FOLDER_NAME);
        meta.put("mimeType", "application/vnd.google-apps.folder");
        HttpResponse create = request(
            "POST",
            "https://www.googleapis.com/drive/v3/files?fields=id",
            accessToken,
            "application/json; charset=UTF-8",
            null,
            meta.toString().getBytes(StandardCharsets.UTF_8)
        );
        if (create.code >= 200 && create.code < 300) {
            return new JSONObject(create.body).optString("id", "");
        }
        return "";
    }

    private static String findBackupFileId(String accessToken, String folderId) throws Exception {
        String q;
        if (folderId != null && !folderId.isEmpty()) {
            q = "name='" + BACKUP_FILE_NAME + "' and '" + folderId + "' in parents and trashed=false";
        } else {
            q = "name='" + BACKUP_FILE_NAME + "' and trashed=false";
        }
        String url = "https://www.googleapis.com/drive/v3/files?spaces=drive&orderBy=modifiedTime%20desc&pageSize=1&fields=files(id)&q="
            + URLEncoder.encode(q, "UTF-8");
        HttpResponse res = request("GET", url, accessToken, null, null, null);
        if (res.code >= 200 && res.code < 300) {
            JSONArray files = new JSONObject(res.body).optJSONArray("files");
            if (files != null && files.length() > 0) {
                return files.getJSONObject(0).optString("id", "");
            }
        }
        // Fallback search without folder constraint
        if (folderId != null && !folderId.isEmpty()) {
            return findBackupFileId(accessToken, "");
        }
        return "";
    }

    private static HttpResponse request(
        String method,
        String urlStr,
        String accessToken,
        String contentType,
        String methodOverride,
        byte[] body
    ) throws IOException {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(urlStr);
            conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(20000);
            conn.setReadTimeout(30000);
            conn.setRequestMethod(method);
            conn.setRequestProperty("Authorization", "Bearer " + accessToken);
            if (methodOverride != null) {
                conn.setRequestProperty("X-HTTP-Method-Override", methodOverride);
            }
            if (contentType != null) {
                conn.setRequestProperty("Content-Type", contentType);
            }
            if (body != null) {
                conn.setDoOutput(true);
                conn.setFixedLengthStreamingMode(body.length);
                try (OutputStream os = conn.getOutputStream()) {
                    os.write(body);
                    os.flush();
                }
            }

            int code = conn.getResponseCode();
            InputStream stream = code >= 200 && code < 400 ? conn.getInputStream() : conn.getErrorStream();
            String responseBody = readStream(stream);
            return new HttpResponse(code, responseBody);
        } finally {
            if (conn != null) {
                conn.disconnect();
            }
        }
    }

    private static String readStream(InputStream stream) throws IOException {
        if (stream == null) return "";
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                if (sb.length() > 0) sb.append('\n');
                sb.append(line);
            }
            return sb.toString();
        }
    }

    private static final class HttpResponse {
        final int code;
        final String body;

        HttpResponse(int code, String body) {
            this.code = code;
            this.body = body;
        }
    }

    public static final class UploadResult {
        public final String fileId;
        public final String modifiedTime;

        public UploadResult(String fileId, String modifiedTime) {
            this.fileId = fileId;
            this.modifiedTime = modifiedTime;
        }
    }

    public static final class DownloadResult {
        public final String fileId;
        public final String json;
        public final String downloadedAt;

        public DownloadResult(String fileId, String json, String downloadedAt) {
            this.fileId = fileId;
            this.json = json;
            this.downloadedAt = downloadedAt;
        }
    }

    public static final class EmailSendResult {
        public final boolean needsActivation;
        public final String sentAt;

        public EmailSendResult(boolean needsActivation, String sentAt) {
            this.needsActivation = needsActivation;
            this.sentAt = sentAt;
        }
    }
}
