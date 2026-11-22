package ma.carnetcredit.app;

import android.app.Activity;
import android.content.Context;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import com.getcapacitor.BridgeActivity;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.Scope;
import java.util.Collections;

public class MainActivity extends BridgeActivity {
    public interface DriveAuthCallback {
        void onToken(String accessToken);
        void onError(String message);
    }

    private ActivityResultLauncher<IntentSenderRequest> driveAuthLauncher;
    private DriveAuthCallback pendingDriveAuthCallback;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(GoogleDrivePlugin.class);
        super.onCreate(savedInstanceState);

        driveAuthLauncher = registerForActivityResult(
            new ActivityResultContracts.StartIntentSenderForResult(),
            result -> {
                DriveAuthCallback cb = pendingDriveAuthCallback;
                pendingDriveAuthCallback = null;
                if (cb == null) return;

                if (result.getResultCode() == Activity.RESULT_OK && result.getData() != null) {
                    try {
                        AuthorizationResult authResult = Identity.getAuthorizationClient(this)
                            .getAuthorizationResultFromIntent(result.getData());
                        String token = authResult.getAccessToken();
                        if (token != null && !token.isEmpty()) {
                            cb.onToken(token);
                        } else {
                            cb.onError("AUTH_NO_TOKEN");
                        }
                    } catch (Exception ex) {
                        cb.onError(ex.getMessage() != null ? ex.getMessage() : "AUTH_INTENT_ERROR");
                    }
                } else {
                    cb.onError("AUTH_CANCELLED");
                }
            }
        );

        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView != null) {
            webView.addJavascriptInterface(new AndroidPrintBridge(), "AndroidPrintBridge");
        }
    }

    public void requestDriveAuthorization(boolean interactive, DriveAuthCallback callback) {
        runOnUiThread(() -> {
            AuthorizationRequest authRequest = AuthorizationRequest.builder()
                .setRequestedScopes(
                    Collections.singletonList(new Scope(DriveRestHelper.DRIVE_FILE_SCOPE))
                )
                .build();

            Identity.getAuthorizationClient(this)
                .authorize(authRequest)
                .addOnSuccessListener(authResult -> {
                    if (authResult.hasResolution() && authResult.getPendingIntent() != null) {
                        if (!interactive) {
                            callback.onError("AUTH_REQUIRED");
                            return;
                        }
                        if (pendingDriveAuthCallback != null) {
                            callback.onError("AUTH_IN_PROGRESS");
                            return;
                        }
                        try {
                            pendingDriveAuthCallback = callback;
                            IntentSenderRequest senderReq = new IntentSenderRequest.Builder(
                                authResult.getPendingIntent().getIntentSender()
                            ).build();
                            driveAuthLauncher.launch(senderReq);
                        } catch (Exception ex) {
                            pendingDriveAuthCallback = null;
                            callback.onError(ex.getMessage() != null ? ex.getMessage() : "AUTH_LAUNCH_ERROR");
                        }
                    } else if (authResult.getAccessToken() != null && !authResult.getAccessToken().isEmpty()) {
                        callback.onToken(authResult.getAccessToken());
                    } else {
                        callback.onError("AUTH_NO_TOKEN");
                    }
                })
                .addOnFailureListener(ex -> {
                    callback.onError(ex.getMessage() != null ? ex.getMessage() : "AUTH_FAILED");
                });
        });
    }

    private class AndroidPrintBridge {
        @JavascriptInterface
        public void printPage() {
            runOnUiThread(() -> {
                WebView webView = getBridge() != null ? getBridge().getWebView() : null;
                PrintManager printManager = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                if (webView != null && printManager != null) {
                    PrintDocumentAdapter adapter =
                        webView.createPrintDocumentAdapter("Carnet_Credit_Releve");
                    printManager.print(
                        "Carnet de Credit - Releve",
                        adapter,
                        new PrintAttributes.Builder().build()
                    );
                }
            });
        }
    }
}
