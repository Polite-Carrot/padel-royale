package com.politecarrot.padelroyale;

import android.os.Build;
import android.os.Bundle;
import android.view.ActionMode;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

/**
 * Samsung's One UI WebView ignores CSS user-select: none and web-side
 * preventDefault on selectstart on long-press, so the OS-level text selection
 * UI still fires. Android 15+ (API 35+) also forces edge-to-edge, drawing the
 * WebView under the status and nav bars, so env(safe-area-inset-*) reads zero.
 * These native overrides fix both at the only layer that respects them.
 */
public class MainActivity extends BridgeActivity {

    // The HUD is laid out in px; the system font-size slider would deform it, so pin text scale.
    private static final int TEXT_ZOOM_PERCENT = 100;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WebView webView = getBridge().getWebView();
        if (webView == null) return;

        webView.getSettings().setTextZoom(TEXT_ZOOM_PERCENT);

        // Kill long-press text selection / context menus (Samsung One UI ignores the CSS).
        webView.setLongClickable(false);
        webView.setHapticFeedbackEnabled(false);
        webView.setOnLongClickListener(v -> true);
        webView.setOnCreateContextMenuListener((menu, v, info) -> menu.clear());

        // Android 14 and below already reserve system-bar space at the decor level; padding there
        // too would double up and leave a black strip. Android 15+ is edge-to-edge, so pad only there.
        if (Build.VERSION.SDK_INT >= 35) {
            ViewCompat.setOnApplyWindowInsetsListener(webView, (v, insets) -> {
                Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
                v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return WindowInsetsCompat.CONSUMED;
            });
        }
    }

    // Second layer against the floating copy/paste ActionMode some WebView builds raise on double-tap.
    @Override
    public ActionMode onWindowStartingActionMode(ActionMode.Callback callback, int type) {
        if (type == ActionMode.TYPE_FLOATING) return null;
        return super.onWindowStartingActionMode(callback, type);
    }

    @Override
    public ActionMode onWindowStartingActionMode(ActionMode.Callback callback) {
        return null;
    }
}
