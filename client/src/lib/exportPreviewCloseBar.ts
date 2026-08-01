// Shared "Close Preview" bar for every PDF export preview window
// (window.open("", "_blank") + document.write(html), then window.print()).
// Insert the returned HTML right before </body></html> in every export
// builder — keeps all export previews consistent and means a fix here
// (e.g. the invalid-transform CSS bug this was previously bitten by)
// only needs to happen in one place.
export function buildExportPreviewCloseBar(): string {
  return `
<!-- Close button: visible on screen, hidden during print -->
<div id="close-bar" style="position:fixed;bottom:0;left:0;right:0;padding:12px 16px;background:#1e293b;display:flex;justify-content:flex-end;gap:12px;z-index:9999;box-shadow:0 -2px 8px rgba(0,0,0,0.4)">
  <button id="close-btn" onclick="closePreview()" style="background:#3b82f6;color:#fff;border:none;border-radius:6px;padding:10px 24px;font-size:14px;font-weight:700;cursor:pointer;font-family:system-ui,sans-serif">&#x2715; Close Preview</button>
  <button onclick="window.print()" style="background:#22c55e;color:#fff;border:none;border-radius:6px;padding:10px 24px;font-size:14px;font-weight:700;cursor:pointer;font-family:system-ui,sans-serif">&#128438; Print / Save PDF</button>
</div>
<div style="height:60px"></div>
<style>#close-bar{display:flex !important} @media print{#close-bar{display:none !important}}</style>
<script>
function closePreview(){
  window.close();
  setTimeout(function(){
    if (!window.closed) {
      var btn = document.getElementById('close-btn');
      if (btn) btn.outerHTML = '<span style="color:#fff;font-size:13px;font-family:system-ui,sans-serif;padding:10px 4px">Can\\'t auto-close this tab — use your browser\\'s back or tab-close control.</span>';
    }
  }, 250);
}
</script>`;
}
