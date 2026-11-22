package ma.carnetcredit.app;

import android.content.Context;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView != null) {
            webView.addJavascriptInterface(new AndroidPrintBridge(), "AndroidPrintBridge");
        }
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
