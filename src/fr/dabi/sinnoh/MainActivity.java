package fr.dabi.sinnoh;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.ByteArrayInputStream;

/**
 * Hosts the offline web UI bundled in {@code assets/} and the opt-in Eden memory reader.
 *
 * <p>The UI is served on a private HTTPS origin so that it gets a regular web security context
 * (localStorage, CSP) without file access. Nothing is fetched from the network.
 */
public final class MainActivity extends Activity {

  private static final String APP_HOST = "sinnoh.local";
  private static final String HOME_URL = "https://" + APP_HOST + "/index.html";
  /** The UI drives the bridge by navigating to these paths; they are never loaded. */
  private static final String BRIDGE_PATH_PREFIX = "/bridge/";
  private static final String BRIDGE_CONNECT_PATH = "/bridge/connect";
  private static final int BACKGROUND_COLOR = 0xff0e1015;

  private WebView web;
  private MemoryBridge bridge;
  private boolean bridgeEnabled;

  @Override
  public void onCreate(Bundle state) {
    super.onCreate(state);
    getWindow()
      .getDecorView()
      .setSystemUiVisibility(
        View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
      );
    web = new WebView(this);
    bridge = new MemoryBridge(snapshot -> runOnUiThread(() -> deliver(snapshot.toString())));
    configureAppearance();
    configureSettings();
    web.setWebChromeClient(new WebChromeClient());
    web.setWebViewClient(new LocalContentClient());
    setContentView(web);
    web.loadUrl(HOME_URL);
  }

  private void configureAppearance() {
    // Keep controller and keyboard focus without Android's translucent overlay.
    // This is drawn over the entire native view, outside the HTML/CSS renderer.
    web.setDefaultFocusHighlightEnabled(false);
    web.setBackgroundColor(BACKGROUND_COLOR);
    web.setVerticalScrollBarEnabled(false);
    web.setHorizontalScrollBarEnabled(false);
    web.setOverScrollMode(View.OVER_SCROLL_NEVER);
    web.setVerticalFadingEdgeEnabled(false);
    web.setHorizontalFadingEdgeEnabled(false);
    web.setFadingEdgeLength(0);
  }

  private void configureSettings() {
    WebSettings settings = web.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    settings.setBuiltInZoomControls(true);
    settings.setDisplayZoomControls(false);
    settings.setAllowFileAccess(false);
    settings.setAllowContentAccess(false);
    boolean debuggable = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
    WebView.setWebContentsDebuggingEnabled(debuggable);
  }

  /** Hands a bridge snapshot, already serialized as JSON, to the web UI. */
  private void deliver(String snapshotJson) {
    web.evaluateJavascript("window.receiveBattleSnapshot && window.receiveBattleSnapshot(" + snapshotJson + ")", null);
  }

  private static boolean isAppOrigin(Uri uri) {
    return "https".equals(uri.getScheme()) && APP_HOST.equals(uri.getHost());
  }

  private static String mimeType(String path) {
    if (path.endsWith(".js")) return "application/javascript";
    if (path.endsWith(".css")) return "text/css";
    if (path.endsWith(".png")) return "image/png";
    if (path.endsWith(".ttf")) return "font/ttf";
    return "text/html";
  }

  /** Serves bundled assets, routes bridge commands and sends source links to the browser. */
  private final class LocalContentClient extends WebViewClient {

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
      Uri uri = request.getUrl();
      String path = uri.getPath();
      if (isAppOrigin(uri) && path != null && !path.contains("..")) {
        try {
          return new WebResourceResponse(mimeType(path), "UTF-8", getAssets().open(path.substring(1)));
        } catch (Exception missing) {
          // Unknown asset or malformed path: answered by the 404 below.
        }
      }
      return new WebResourceResponse(
        "text/plain",
        "UTF-8",
        404,
        "Not Found",
        null,
        new ByteArrayInputStream(new byte[0])
      );
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
      Uri uri = request.getUrl();
      if (isBridgeCommand(request)) {
        bridgeEnabled = BRIDGE_CONNECT_PATH.equals(uri.getPath());
        if (bridgeEnabled) bridge.start();
        else bridge.stop();
        return true;
      }
      if (APP_HOST.equals(uri.getHost())) return false;
      if ("https".equals(uri.getScheme())) startActivity(new Intent(Intent.ACTION_VIEW, uri));
      return true;
    }

    /** Only the app's own page may start or stop the memory reader. */
    private boolean isBridgeCommand(WebResourceRequest request) {
      Uri uri = request.getUrl();
      String current = web.getUrl();
      return (
        request.isForMainFrame() &&
        isAppOrigin(uri) &&
        current != null &&
        current.startsWith("https://" + APP_HOST + "/") &&
        uri.getPath().startsWith(BRIDGE_PATH_PREFIX)
      );
    }
  }

  @Override
  public void onPause() {
    if (bridge != null) bridge.stop();
    super.onPause();
  }

  @Override
  public void onResume() {
    super.onResume();
    if (bridgeEnabled && bridge != null) bridge.start();
  }

  @Override
  public void onDestroy() {
    if (bridge != null) bridge.stop();
    super.onDestroy();
  }

  @Override
  public void onBackPressed() {
    web.evaluateJavascript("window.goHome && window.goHome()", null);
  }
}
