/* ============================================================
   NIGHT CITY — ICON SPRITE  (the real product iconography)
   Geometric 24×24 HUD glyphs lifted verbatim from app.js.
   Each glyph is built from layered paths:
     .frame → filled silhouette at ~22% opacity (the "plate")
     .line  → main 1.55px stroke outline
     .thin  → secondary .95px detail stroke
     .fill  → small solid accent blocks
   Color is driven by the CSS var --ic (defaults to --y).

   Vanilla usage:
     el.innerHTML = ncIcon('book', 'var(--c)');
   Available ids are listed in NC_ICONS below.
   ============================================================ */
(function (root) {
  const NC_ICONS = {
    // ---- page / district icons ----
    home:'<path class="frame" d="M4 10 12 3l8 7v10H5z"/><path class="line" d="M3 10 12 3l9 7M6 10v10h12V10M10 20v-6h4v6"/><path class="thin" d="M7 7h3M16 7h2"/>',
    bell:'<path class="frame" d="M7 8a5 5 0 0 1 10 0v5l3 4H4l3-4z"/><path class="line" d="M7 8a5 5 0 0 1 10 0v5l3 4H4l3-4zM10 20h4M12 3V1"/><path class="thin" d="M4 7 2 5M20 7l2-2M9 10h6"/>',
    // ---- thematic icons ----
    energy:'<path class="frame" d="M13 2 5 13h6l-1 9 9-13h-6z"/><path class="line" d="M13 2 5 13h6l-1 9 9-13h-6z"/><path class="thin" d="M8 13h5M12 7l-2 4"/>',
    water:'<path class="frame" d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/><path class="line" d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/><path class="thin" d="M9 15c.4 2 2 3 4 3"/>',
    book:'<path class="frame" d="M5 4h9l4 4v13H5z"/><path class="line" d="M5 4h9l4 4v13H5zM14 4v4h4"/><path class="thin" d="M8 10h7M8 13h8M8 16h6M6 6H3v12h2"/>',
    code:'<path class="frame" d="M4 5h16v13H4z"/><path class="line" d="M4 5h16v13H4zM7 9l3 3-3 3M12 15h5"/><path class="thin" d="M7 3v2M12 3v2M17 3v2M7 18v3M12 18v3M17 18v3"/>',
    guitar:'<path class="frame" d="M5 15 9 11l4 4-4 4z"/><path class="line" d="M5 15 9 11l4 4-4 4zM12 12l7-7M16 5l3 3M8 15h2"/><path class="thin" d="M14 10 10 6M17 7l3-3"/>',
    workout:'<path class="frame" d="M3 10h3v4H3zM18 10h3v4h-3zM8 9h8v6H8z"/><path class="line" d="M3 10h3v4H3zM18 10h3v4h-3zM6 12h12M8 9h8v6H8z"/><path class="thin" d="M10 7v10M14 7v10"/>',
    cardio:'<path class="frame" d="M12 20 5 13a4 4 0 0 1 6-5 4 4 0 0 1 6 5z"/><path class="line" d="M12 20 5 13a4 4 0 0 1 6-5 4 4 0 0 1 6 5zM5 13h4l2-4 3 7 2-3h3"/>',
    game:'<path class="frame" d="M5 10h14l2 5-3 4-4-3h-4l-4 3-3-4z"/><path class="line" d="M5 10h14l2 5-3 4-4-3h-4l-4 3-3-4zM7 14h5M9.5 11.5v5"/><path class="fill" d="M16 13h2v2h-2zM18.5 15.5h2v2h-2z"/>',
    mind:'<path class="frame" d="M12 4 20 9v7l-8 4-8-4V9z"/><path class="line" d="M12 4 20 9v7l-8 4-8-4V9zM8 12l4-3 4 3M8 12l4 4 4-4"/><path class="fill" d="M7 11h2v2H7zM11 8h2v2h-2zM15 11h2v2h-2zM11 15h2v2h-2z"/>',
    money:'<path class="frame" d="M8 7h8l3 5v7H5v-7z"/><path class="line" d="M8 7h8l3 5v7H5v-7zM9 7l1-3h4l1 3M12 11v5M10 12h4M10 16h4"/><path class="thin" d="M7 12h3M14 12h5"/>',
    card:'<path class="frame" d="M4 7h16v12H4z"/><path class="line" d="M4 7h16v12H4zM4 11h16M7 15h5"/><path class="thin" d="M15 15h2M7 5h3M14 5h3"/>',
    invest:'<path class="frame" d="M4 19h17V6H4z"/><path class="line" d="M5 18h16M5 18V6M8 15l4-4 3 2 5-7"/><path class="thin" d="M8 8h3M8 11h2M16 6h4v4"/>',
    cart:'<path class="frame" d="M7 8h14l-2 8H9z"/><path class="line" d="M3 5h3l3 11h10l2-8H7M10 20h1M18 20h1"/><path class="thin" d="M10 11h7M11 14h5"/>',
    homebase:'<path class="frame" d="M4 10 12 3l8 7v10H5z"/><path class="line" d="M3 10 12 3l9 7M6 10v10h12V10M10 20v-6h4v6"/><path class="thin" d="M7 7h3M16 7h2"/>',
    calendar:'<path class="frame" d="M5 5h14v16H5z"/><path class="line" d="M5 5h14v16H5zM5 9h14M8 3v4M16 3v4"/><path class="thin" d="M8 12h3M13 12h3M8 15h3M13 15h3"/>',
    food:'<path class="frame" d="M7 3h3v18H7zM15 3h3v18h-3z"/><path class="line" d="M8 3v18M5 3v6a3 3 0 0 0 6 0V3M16 3v18M16 3c3 2 3 7 0 10"/>',
    sleep:'<path class="frame" d="M5 13h14v6H5z"/><path class="line" d="M4 19V8M5 13h14v6H5zM7 13v-3h5v3M14 8h6"/><path class="thin" d="M15 5h5l-5 5h5"/>',
    target:'<path class="frame" d="M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z"/><path class="line" d="M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 11v2M11 12h2"/>',
    link:'<path class="frame" d="M6 6h9l3 3v9H6z"/><path class="line" d="M8 16 16 8M11 8h5v5M6 6h9l3 3v9H6z"/><path class="thin" d="M9 19H4V9h2"/>'
  };

  function ncIcon(id, color, cls) {
    const body = NC_ICONS[id] || NC_ICONS.link;
    return '<span class="nc-icon ' + (cls || '') + '" style="--ic:' + (color || 'var(--y)') +
      '" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false">' + body + '</svg></span>';
  }

  root.NC_ICONS = NC_ICONS;
  root.ncIcon = ncIcon;
})(typeof window !== 'undefined' ? window : this);
