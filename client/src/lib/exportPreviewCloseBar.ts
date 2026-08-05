// Shared "Close Preview" bar for every PDF export preview window
// (window.open("", "_blank") + document.write(html), then window.print()).
// Insert the returned HTML right before </body></html> in every export
// builder — keeps all export previews consistent and means a fix here
// (e.g. the invalid-transform CSS bug this was previously bitten by)
// only needs to happen in one place.
//
// Sizing note: these are the only controls in the preview window, and they're
// used on phones and tablets in the field, so they're sized as proper touch
// targets (>=48px tall, 44px being the platform minimum) rather than the
// desktop-style compact buttons they used to be. On narrow screens the two
// buttons split the full width evenly — equal-sized rather than hugging their
// label text, so they stay symmetrical and easy to hit. The bottom spacer has
// to track the bar's height at each breakpoint, otherwise the fixed bar covers
// the last of the document.
export function buildExportPreviewCloseBar(): string {
  return `
<!-- Close/print bar: visible on screen, hidden during print -->
<div id="close-bar">
  <button id="close-btn" class="epc-btn epc-close" onclick="closePreview()">&#x2715; Close Preview</button>
  <button class="epc-btn epc-print" onclick="window.print()">&#128438; Print / Save PDF</button>
</div>
<div id="close-bar-spacer"></div>
<style>
  #close-bar {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 12px 16px;
    padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
    background: #1e293b;
    display: flex !important;
    justify-content: flex-end;
    /* stretch, not center: if one label wraps to two lines the buttons still
       come out the same height instead of one sitting taller than the other. */
    align-items: stretch;
    gap: 12px;
    z-index: 9999;
    box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.4);
  }
  #close-bar-spacer { height: 84px; }
  .epc-btn {
    -webkit-appearance: none;
    appearance: none;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    color: #fff;
    border: none;
    border-radius: 10px;
    min-height: 52px;
    /* equal min-width so the two sit as a matched pair rather than each
       hugging its own label length. */
    min-width: 240px;
    padding: 14px 28px;
    font-size: 17px;
    font-weight: 700;
    line-height: 1.2;
    font-family: system-ui, sans-serif;
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }
  .epc-btn:active { filter: brightness(0.9); }
  .epc-close { background: #3b82f6; }
  .epc-print { background: #22c55e; }

  /* Phones/small tablets: give the two buttons the full width, split evenly,
     so each is a large symmetrical target instead of a small text-hugging one. */
  @media (max-width: 640px) {
    #close-bar {
      justify-content: stretch;
      gap: 10px;
      padding: 10px 12px;
      padding-bottom: calc(10px + env(safe-area-inset-bottom, 0px));
    }
    .epc-btn {
      flex: 1 1 0;
      min-width: 0;
      min-height: 56px;
      padding: 14px 8px;
      font-size: 15px;
    }
    #close-bar-spacer { height: 88px; }
  }

  @media print {
    #close-bar { display: none !important; }
    #close-bar-spacer { display: none !important; }
  }
</style>
<script>
function closePreview(){
  window.close();
  setTimeout(function(){
    if (!window.closed) {
      var btn = document.getElementById('close-btn');
      if (btn) btn.outerHTML = '<span style="color:#fff;font-size:14px;font-family:system-ui,sans-serif;padding:10px 4px;line-height:1.4">Can\\'t auto-close this tab — use your browser\\'s back or tab-close control.</span>';
    }
  }, 250);
}
</script>`;
}
