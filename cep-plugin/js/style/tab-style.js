// FreeCaption Tab 2 - Stil Ver
// State + render loop + style controls + export

(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var cs = new CSInterface();

  // State (deep copy defaults)
  var style = JSON.parse(JSON.stringify(window.FC_DEFAULT_STYLE));
  var animation = JSON.parse(JSON.stringify(window.FC_DEFAULT_ANIMATION));
  var captions = [];
  var srtPath = null;
  var srtName = null;
  var totalDuration = 0;
  var currentTime = 0;
  var isPlaying = false;
  var playStart = 0;
  // Tek canvas + aspect toggle (16:9 / 9:16 / sekansla aynı)
  var canvas = null;
  var canvasCtx = null;
  var renderer = null;
  var animFrameId = null;
  var aspectMode = "16:9"; // "16:9" | "9:16" | "seq"

  // ---------- INIT ----------
  function init() {
    canvas = $("previewCanvas");
    if (!canvas) return;
    canvasCtx = canvas.getContext("2d");

    // localStorage'tan aspect tercihi
    try {
      var savedAsp = localStorage.getItem("fc_aspect");
      if (savedAsp === "16:9" || savedAsp === "9:16") {
        aspectMode = savedAsp;
      }
    } catch (e) {}

    applyCanvasSize();
    renderer = new window.FC_CaptionRenderer(canvasCtx, canvas.width, canvas.height);

    bindControls();
    bindPresets();
    bindAnimations();
    bindSrtLoad();
    bindPreview();
    bindExport();
    bindCollapsibles();
    bindExportFps();
    bindPositionPresets();
    bindFrameDragHandles();
    bindAspectToggle();
    bindFontCombobox();
    populateSystemFonts();

    syncControlsFromState();
    drawPreview();
  }

  function bindAspectToggle() {
    var seg = $("aspectSeg");
    if (!seg) return;
    var btns = seg.querySelectorAll(".aspect-btn");
    // Kayitli aspect'i UI'ya uygula
    btns.forEach(function (b) {
      b.classList.toggle("is-active", b.dataset.aspect === aspectMode);
    });
    applyAspectClass();
    btns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        aspectMode = btn.dataset.aspect;
        btns.forEach(function (b) { b.classList.remove("is-active"); });
        btn.classList.add("is-active");
        applyAspectClass();
        applyCanvasSize();
        // Renderer'i yeni boyuta gore yenile
        renderer = new window.FC_CaptionRenderer(canvasCtx, canvas.width, canvas.height);
        try { localStorage.setItem("fc_aspect", aspectMode); } catch (e) {}
        drawPreview();
      });
    });
  }

  function applyAspectClass() {
    var frame = $("previewFrame");
    if (!frame) return;
    frame.classList.remove("aspect-9-16", "aspect-1-1");
    if (aspectMode === "9:16") frame.classList.add("aspect-9-16");
    // 16:9 ve "seq" için default aspect-ratio (16/9 fallback)
  }

  function bindPositionPresets() {
    var btns = document.querySelectorAll(".pos-preset");
    btns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var y = parseFloat(btn.dataset.y);
        if (isNaN(y)) return;
        style.positionY = y;
        var pyEl = $("positionY");
        if (pyEl) pyEl.value = y;
        var labEl = $("positionYVal");
        if (labEl) labEl.textContent = Math.round(y * 100) + "%";
        btns.forEach(function (b) { b.classList.remove("is-active"); });
        btn.classList.add("is-active");
        updatePosHandles();
        drawPreview();
      });
    });
    updatePosHandles();
  }

  function bindFrameDragHandles() {
    var handle = $("frameHandleH");
    if (!handle) return;
    var dragging = false;
    function onMove(ev) {
      if (!dragging) return;
      var rect = handle.parentNode.getBoundingClientRect();
      var rel = (ev.clientY - rect.top) / rect.height;
      rel = Math.max(0, Math.min(1, rel));
      style.positionY = rel;
      var pyEl = $("positionY");
      if (pyEl) pyEl.value = rel;
      var labEl = $("positionYVal");
      if (labEl) labEl.textContent = Math.round(rel * 100) + "%";
      updatePosHandles();
      document.querySelectorAll(".pos-preset.is-active").forEach(function (b) {
        b.classList.remove("is-active");
      });
      drawPreview();
    }
    function onUp() {
      dragging = false;
      handle.classList.remove("is-dragging");
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    handle.addEventListener("mousedown", function (ev) {
      ev.preventDefault();
      dragging = true;
      handle.classList.add("is-dragging");
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      onMove(ev);
    });
  }

  function updatePosHandles() {
    var y = (typeof style.positionY === "number") ? style.positionY : 0.85;
    var pct = (y * 100).toFixed(1) + "%";
    var h = $("frameHandleH");
    if (h) h.style.top = pct;
  }

  // SISTEM FONTLARI: PowerShell ile Windows'un yuklu TUM family'lerini cek
  // (Premiere ile bire-bir ayni liste). Fallback: Windows Fonts klasoru + queryLocalFonts.
  // Custom combobox (fontComboList) ile gosterilir, datalist DEGIL.
  function populateSystemFonts() {
    // 0) localStorage cache (24 saat) - aninda combobox'a yuklenir
    try {
      var cached = localStorage.getItem("fc_system_fonts");
      var cachedAt = parseInt(localStorage.getItem("fc_system_fonts_at") || "0", 10);
      if (cached && (Date.now() - cachedAt) < 24 * 60 * 60 * 1000) {
        var names = JSON.parse(cached);
        if (names.length > 10) {
          fillFontList(null, names);
          // Yine de arka planda yenile
          fetchFontsFromPowerShell();
          return;
        }
      }
    } catch (eC) {}

    // 1) Önce hızlıca yaygin font + Windows Fonts dosya adlarini doldur (anlik UX)
    var quickList = quickFontFallback();
    fillFontList(null, quickList);

    // 2) Asıl is: PowerShell SystemFontFamilies (gerçek family name'leri)
    fetchFontsFromPowerShell();
  }

  function quickFontFallback() {
    var fonts = {};
    var common = [
      "Inter", "Arial", "Arial Black", "Bahnschrift", "Bebas Neue",
      "Calibri", "Cambria", "Candara", "Cascadia Code", "Comic Sans MS",
      "Consolas", "Constantia", "Corbel", "Courier New", "Ebrima",
      "Franklin Gothic", "Gabriola", "Gadugi", "Georgia", "Helvetica",
      "Impact", "Lato", "Leelawadee UI", "Lucida Console", "Lucida Sans Unicode",
      "Malgun Gothic", "Microsoft Sans Serif", "Microsoft YaHei", "Montserrat",
      "MS Gothic", "MV Boli", "Myanmar Text", "Nirmala UI", "Open Sans",
      "Oswald", "Palatino Linotype", "Poppins", "Raleway", "Roboto", "Roboto Mono",
      "Segoe Print", "Segoe Script", "Segoe UI", "Segoe UI Black", "Segoe UI Symbol",
      "SimSun", "Sitka", "Source Sans Pro", "Sylfaen", "Symbol", "Tahoma",
      "Times New Roman", "Trebuchet MS", "Verdana", "Webdings", "Wingdings",
      "Yu Gothic"
    ];
    common.forEach(function (f) { fonts[f] = true; });

    // Windows Fonts klasoru — dosya adi tahminleri
    try {
      var req = (typeof require === "function") ? require : (typeof window.cep_node !== "undefined" ? window.cep_node.require : null);
      if (req) {
        var fs = req("fs");
        var dirs = ["C:\\Windows\\Fonts"];
        if (process.env.LOCALAPPDATA) {
          dirs.push(process.env.LOCALAPPDATA + "\\Microsoft\\Windows\\Fonts");
        }
        dirs.forEach(function (dir) {
          try {
            fs.readdirSync(dir).forEach(function (file) {
              if (!/\.(ttf|otf|ttc)$/i.test(file)) return;
              var family = file.replace(/\.(ttf|otf|ttc)$/i, "")
                .replace(/[-_].*$/, "")
                .replace(/(Bold|Italic|Regular|Light|Medium|Black|Thin|Heavy|Semibold)$/i, "")
                .replace(/(BD|IT|BI|LT|MD|BK)$/i, "")
                .trim();
              if (family.length >= 2 && family.length < 40) fonts[family] = true;
            });
          } catch (eDir) {}
        });
      }
    } catch (eFS) {}

    return Object.keys(fonts);
  }

  function fetchFontsFromPowerShell() {
    try {
      var req = (typeof require === "function") ? require : (typeof window.cep_node !== "undefined" ? window.cep_node.require : null);
      if (!req) {
        console.warn("[CEP] Node require yok, font fetch atlandi");
        tryQueryLocalFonts();
        return;
      }
      var cp = req("child_process");

      // PowerShell tek satir: .NET PresentationCore.SystemFontFamilies (Premiere'in kullandigi ayni API)
      var psCmd = 'Add-Type -AssemblyName PresentationCore; [System.Windows.Media.Fonts]::SystemFontFamilies | ForEach-Object { $_.Source } | Sort-Object -Unique';

      cp.exec('powershell -NoProfile -ExecutionPolicy Bypass -Command "' + psCmd + '"',
        { maxBuffer: 5 * 1024 * 1024, timeout: 10000 },
        function (err, stdout, stderr) {
          if (err || !stdout) {
            console.warn("[CEP] PowerShell font listesi alinamadi:", err && err.message);
            // queryLocalFonts fallback (Chrome 103+ destekli Premiere'lerde calisir)
            tryQueryLocalFonts();
            return;
          }
          var names = stdout.split(/\r?\n/).map(function (s) { return s.trim(); })
            .filter(function (s) { return s.length >= 2 && s.length < 60; });
          if (names.length < 10) {
            console.warn("[CEP] PowerShell sadece " + names.length + " font dondu, fallback deniyor");
            tryQueryLocalFonts();
            return;
          }
          names.sort(function (a, b) { return a.toLowerCase().localeCompare(b.toLowerCase()); });
          fillFontList(null, names);
          try {
            localStorage.setItem("fc_system_fonts", JSON.stringify(names));
            localStorage.setItem("fc_system_fonts_at", String(Date.now()));
          } catch (eS) {}
          console.log("[CEP] " + names.length + " sistem fontu yuklendi (PowerShell)");
        });
    } catch (e) {
      console.warn("[CEP] fetchFontsFromPowerShell ex:", e);
    }
  }

  function tryQueryLocalFonts() {
    try {
      if (typeof window.queryLocalFonts === "function") {
        window.queryLocalFonts().then(function (arr) {
          var seen = {};
          arr.forEach(function (f) { if (f.family) seen[f.family] = true; });
          var names = Object.keys(seen).sort(function (a, b) {
            return a.toLowerCase().localeCompare(b.toLowerCase());
          });
          fillFontList(null, names);
          try {
            localStorage.setItem("fc_system_fonts", JSON.stringify(names));
            localStorage.setItem("fc_system_fonts_at", String(Date.now()));
          } catch (eS) {}
          console.log("[CEP] " + names.length + " font (queryLocalFonts)");
        }).catch(function () {});
      } else {
        console.warn("[CEP] queryLocalFonts API yok, sadece quick fallback liste kullanilacak");
      }
    } catch (eQ) {}
  }

  // Custom combobox state
  var fcFontNamesAll = [];          // tum font'lar (case-preserved)
  var fcFontFilterIdx = -1;          // klavye navigasyonu icin
  var fcFontFilteredCache = [];

  function fillFontList(_unused, names) {
    // Cagrildiginda yeni font listesi geldi — combobox'i besle
    if (!names || !names.length) return;
    fcFontNamesAll = names.slice();
    renderFontComboList("");
  }

  function renderFontComboList(query) {
    var ul = $("fontComboList");
    if (!ul) return;
    var q = (query || "").trim().toLowerCase();
    var filtered = q
      ? fcFontNamesAll.filter(function (n) { return n.toLowerCase().indexOf(q) !== -1; })
      : fcFontNamesAll.slice();
    fcFontFilteredCache = filtered;
    fcFontFilterIdx = -1;

    ul.innerHTML = "";
    if (filtered.length === 0) {
      var li = document.createElement("li");
      li.className = "no-results";
      li.textContent = "Sonuç yok — yazdığını font olarak kullan";
      ul.appendChild(li);
      return;
    }
    var current = (style.fontFamily || "").toLowerCase();
    var frag = document.createDocumentFragment();
    // Performans: max 200 göster
    var max = Math.min(filtered.length, 200);
    for (var i = 0; i < max; i++) {
      var name = filtered[i];
      var li2 = document.createElement("li");
      li2.textContent = name;
      li2.setAttribute("data-name", name);
      li2.setAttribute("role", "option");
      if (name.toLowerCase() === current) li2.classList.add("is-selected");
      frag.appendChild(li2);
    }
    if (filtered.length > 200) {
      var more = document.createElement("li");
      more.className = "no-results";
      more.textContent = "… +" + (filtered.length - 200) + " daha (yazarak filtrele)";
      frag.appendChild(more);
    }
    ul.appendChild(frag);
  }

  function bindFontCombobox() {
    var wrap = $("fontCombo");
    var input = $("styleFontFamily");
    var toggle = $("fontComboToggle");
    var list = $("fontComboList");
    if (!wrap || !input || !toggle || !list) return;

    function openList() {
      renderFontComboList(input.value);
      list.classList.remove("hidden");
      wrap.classList.add("is-open");
      // Selected scroll
      var sel = list.querySelector("li.is-selected");
      if (sel) sel.scrollIntoView({ block: "nearest" });
    }
    function closeList() {
      list.classList.add("hidden");
      wrap.classList.remove("is-open");
      fcFontFilterIdx = -1;
    }
    function commitFont(name) {
      input.value = name;
      style.fontFamily = name;
      try {
        localStorage.setItem("fc_last_font", name);
      } catch (e) {}
      drawPreview();
    }

    // Toggle dropdown
    toggle.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (list.classList.contains("hidden")) openList();
      else closeList();
    });

    // Input focus -> open
    input.addEventListener("focus", function () {
      openList();
    });

    // Input click -> open (focus yetersiz olabilir)
    input.addEventListener("click", function (e) {
      if (list.classList.contains("hidden")) openList();
    });

    // Typing -> filter + state.fontFamily update
    input.addEventListener("input", function () {
      style.fontFamily = input.value;
      drawPreview();
      if (list.classList.contains("hidden")) openList();
      else renderFontComboList(input.value);
    });

    // Keyboard navigation
    input.addEventListener("keydown", function (e) {
      var items = list.querySelectorAll("li[data-name]");
      if (e.key === "ArrowDown") {
        if (list.classList.contains("hidden")) { openList(); return; }
        e.preventDefault();
        fcFontFilterIdx = Math.min(items.length - 1, fcFontFilterIdx + 1);
        updateActive(items);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        fcFontFilterIdx = Math.max(0, fcFontFilterIdx - 1);
        updateActive(items);
      } else if (e.key === "Enter") {
        if (fcFontFilterIdx >= 0 && items[fcFontFilterIdx]) {
          e.preventDefault();
          commitFont(items[fcFontFilterIdx].getAttribute("data-name"));
          closeList();
        } else {
          closeList(); // kullanıcının yazdığı isim olduğu gibi kalır
        }
      } else if (e.key === "Escape") {
        closeList();
      }
    });

    function updateActive(items) {
      items.forEach(function (it, i) {
        it.classList.toggle("is-active", i === fcFontFilterIdx);
      });
      if (fcFontFilterIdx >= 0 && items[fcFontFilterIdx]) {
        items[fcFontFilterIdx].scrollIntoView({ block: "nearest" });
      }
    }

    // List item click
    list.addEventListener("click", function (e) {
      var li = e.target.closest("li[data-name]");
      if (!li) return;
      commitFont(li.getAttribute("data-name"));
      closeList();
      input.focus();
    });

    // Outside click -> close
    document.addEventListener("click", function (e) {
      if (!wrap.contains(e.target)) closeList();
    });

    // Son seçilen font'u geri yükle
    try {
      var lastFont = localStorage.getItem("fc_last_font");
      if (lastFont && lastFont.length > 0) {
        input.value = lastFont;
        style.fontFamily = lastFont;
      }
    } catch (e) {}
  }

  function bindExportFps() {
    var sel = $("exportFps");
    if (!sel) return;
    // Kaydedilmis tercihi yukle (yoksa default 25 — Premiere'in cogu default'u)
    try {
      var saved = localStorage.getItem("fc_export_fps");
      if (saved) {
        // Option mevcut mu kontrol
        var opts = sel.options;
        for (var i = 0; i < opts.length; i++) {
          if (opts[i].value === saved) { sel.value = saved; break; }
        }
      }
    } catch (e) {}
    sel.addEventListener("change", function () {
      try { localStorage.setItem("fc_export_fps", sel.value); } catch (e) {}
    });
  }

  function applyCanvasSize() {
    if (!canvas) return;
    var w, h;
    if (aspectMode === "9:16") {
      w = 1080; h = 1920;
    } else {
      w = 1920; h = 1080;
    }
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  function bindCollapsibles() {
    var heads = document.querySelectorAll(".section-head");
    heads.forEach(function (head) {
      head.addEventListener("click", function (e) {
        // Toggle veya inline-toggle tıklanmamışsa collapse et
        if (e.target.closest(".inline-toggle")) return;
        var targetId = head.dataset.target;
        if (!targetId) return;
        var body = $(targetId);
        if (!body) return;
        var hidden = body.classList.toggle("hidden");
        head.classList.toggle("collapsed", hidden);
      });
    });
  }

  // ---------- STYLE CONTROLS ----------
  function bindControls() {
    var bindings = [
      ["styleFontFamily", "fontFamily", "value"],
      ["styleFontSize", "fontSize", "number"],
      ["styleFontWeight", "fontWeight", "number"],
      ["styleTextColor", "textColor", "value"],
      ["styleTextTransform", "textTransform", "value"],
      ["strokeEnabled", "strokeEnabled", "checked"],
      ["strokeColor", "strokeColor", "value"],
      ["strokeWidth", "strokeWidth", "number"],
      ["strokeOpacity", "strokeOpacity", "number"],
      ["shadowEnabled", "shadowEnabled", "checked"],
      ["shadowColor", "shadowColor", "value"],
      ["shadowBlur", "shadowBlur", "number"],
      ["shadowOffsetY", "shadowOffsetY", "number"],
      ["shadowOpacity", "shadowOpacity", "number"],
      ["backgroundEnabled", "backgroundEnabled", "checked"],
      ["backgroundColor", "backgroundColor", "value"],
      ["backgroundOpacity", "backgroundOpacity", "number"],
      ["backgroundPadding", "backgroundPadding", "number"],
      ["backgroundRadius", "backgroundRadius", "number"],
      ["positionX", "positionX", "number"],
      ["positionY", "positionY", "number"],
      ["textAlign", "textAlign", "value"],
    ];

    // Slider değer göstergeleri
    var sliderLabels = {
      "strokeOpacity": ["strokeOpacityVal", function(v) { return Math.round(v * 100) + "%"; }],
      "shadowOpacity": ["shadowOpacityVal", function(v) { return Math.round(v * 100) + "%"; }],
      "backgroundOpacity": ["backgroundOpacityVal", function(v) { return Math.round(v * 100) + "%"; }],
      "backgroundPadding": ["backgroundPaddingVal", function(v) { return v + "px"; }],
      "backgroundRadius": ["backgroundRadiusVal", function(v) { return v + "px"; }],
      "positionX": ["positionXVal", function(v) { return Math.round(v * 100) + "%"; }],
      "positionY": ["positionYVal", function(v) { return Math.round(v * 100) + "%"; }],
    };
    bindings.forEach(function (b) {
      var el = $(b[0]);
      if (!el) return;
      // Mevcut değeri controle yükle
      var def = style[b[1]];
      if (b[2] === "checked") el.checked = !!def;
      else el.value = def;

      el.addEventListener("input", function () {
        var v;
        if (b[2] === "checked") v = el.checked;
        else if (b[2] === "number") v = parseFloat(el.value);
        else v = el.value;
        style[b[1]] = v;
        // Slider label guncelle
        if (sliderLabels[b[0]]) {
          var lab = $(sliderLabels[b[0]][0]);
          if (lab) lab.textContent = sliderLabels[b[0]][1](v);
        }
        // Position ozel: drag handle ve preset state senkronu
        if (b[0] === "positionY") {
          updatePosHandles();
          document.querySelectorAll(".pos-preset.is-active").forEach(function (pb) {
            pb.classList.remove("is-active");
          });
        }
        drawPreview();
      });
    });

    // Highlight color (animation)
    var hc = $("highlightColor");
    if (hc) {
      hc.value = animation.highlightColor;
      hc.addEventListener("input", function () {
        animation.highlightColor = hc.value;
        drawPreview();
      });
    }
  }

  // ---------- PRESETS ----------
  function bindPresets() {
    var btns = document.querySelectorAll(".preset-btn");
    btns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var key = btn.dataset.preset;
        var preset = window.FC_PRESETS[key];
        if (!preset) return;

        // Merge preset into state
        Object.keys(preset.style).forEach(function (k) { style[k] = preset.style[k]; });
        if (preset.animation) {
          Object.keys(preset.animation).forEach(function (k) { animation[k] = preset.animation[k]; });
        }

        // UI'yi senkronize et
        syncControlsFromState();
        syncAnimFromState();
        drawPreview();

        btns.forEach(function (b) { b.classList.remove("is-active"); });
        btn.classList.add("is-active");
      });
    });
  }

  function syncControlsFromState() {
    var pairs = [
      ["styleFontFamily", "fontFamily"], ["styleFontSize", "fontSize"],
      ["styleFontWeight", "fontWeight"], ["styleTextColor", "textColor"],
      ["styleTextTransform", "textTransform"],
      ["strokeEnabled", "strokeEnabled"], ["strokeColor", "strokeColor"],
      ["strokeWidth", "strokeWidth"], ["strokeOpacity", "strokeOpacity"],
      ["shadowEnabled", "shadowEnabled"], ["shadowColor", "shadowColor"],
      ["shadowBlur", "shadowBlur"], ["shadowOffsetY", "shadowOffsetY"],
      ["shadowOpacity", "shadowOpacity"],
      ["backgroundEnabled", "backgroundEnabled"], ["backgroundColor", "backgroundColor"],
      ["backgroundOpacity", "backgroundOpacity"],
      ["backgroundPadding", "backgroundPadding"],
      ["backgroundRadius", "backgroundRadius"],
      ["positionX", "positionX"], ["positionY", "positionY"], ["textAlign", "textAlign"],
    ];
    pairs.forEach(function (p) {
      var el = $(p[0]);
      if (!el) return;
      var val = style[p[1]];
      if (el.type === "checkbox") el.checked = !!val;
      else el.value = val;
    });
    // Slider labellari yeniden hesapla
    updateSliderLabels();
  }

  function updateSliderLabels() {
    var map = {
      "strokeOpacityVal": Math.round((style.strokeOpacity || 0) * 100) + "%",
      "shadowOpacityVal": Math.round((style.shadowOpacity || 0) * 100) + "%",
      "backgroundOpacityVal": Math.round((style.backgroundOpacity || 0) * 100) + "%",
      "backgroundPaddingVal": (style.backgroundPadding || 0) + "px",
      "backgroundRadiusVal": (style.backgroundRadius || 0) + "px",
    };
    Object.keys(map).forEach(function (k) {
      var el = $(k);
      if (el) el.textContent = map[k];
    });
  }

  // ---------- ANIMATION ----------
  function bindAnimations() {
    var btns = document.querySelectorAll(".anim-btn");
    btns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        btns.forEach(function (b) { b.classList.remove("is-active"); });
        btn.classList.add("is-active");
        animation.preset = btn.dataset.preset;
        drawPreview();
      });
    });
  }

  function syncAnimFromState() {
    var btns = document.querySelectorAll(".anim-btn");
    btns.forEach(function (b) {
      if (b.dataset.preset === animation.preset) b.classList.add("is-active");
      else b.classList.remove("is-active");
    });
    var hc = $("highlightColor");
    if (hc) hc.value = animation.highlightColor;
  }

  // ---------- SRT LOAD ----------
  function bindSrtLoad() {
    // Tab 1'de üretilen son SRT'yi al
    $("loadFromLastBtn").addEventListener("click", function () {
      // Tab 1'in app.js'inde lastSrtPath global olarak set edilir (sonra)
      var p = window.FC_LAST_SRT_PATH;
      if (!p) {
        setSrtInfo("Önce Tab 1'de altyazı üret.", false);
        return;
      }
      loadSrtFromPath(p);
    });

    $("loadFromFileBtn").addEventListener("click", function () {
      var p = prompt("SRT dosya yolunu yapıştır:", "");
      if (p) loadSrtFromPath(p);
    });
  }

  function loadSrtFromPath(p) {
    try {
      var fs = require("fs");
      var sourceInfo = "SRT";

      // ÖNCE aynı isimli JSON'ı dene (word-level timing'li, karaoke senkron için kritik)
      var jsonPath = p.replace(/\.srt$/i, ".json");
      var loaded = false;
      try {
        if (fs.existsSync(jsonPath)) {
          var jtext = fs.readFileSync(jsonPath, "utf8");
          captions = window.FC_parseWordJSON(jtext);
          if (captions.length > 0) {
            loaded = true;
            sourceInfo = "JSON (word-level senkron)";
          }
        }
      } catch (eJ) { console.warn("JSON yuklenmedi:", eJ); }

      // JSON yoksa SRT'ye fallback (eşit dağıtım — kayma olabilir)
      if (!loaded) {
        var text = fs.readFileSync(p, "utf8");
        captions = window.FC_parseSRT(text);
        sourceInfo = "SRT (segment-level, kayma olabilir)";
      }

      totalDuration = window.FC_getTotalDuration(captions);
      srtPath = p;
      srtName = p.split(/[\\/]/).pop();

      // Sekans boyutu artık biliniyor olabilir — canvas'ı senkronla
      applyCanvasSize();

      setSrtInfo("✓ " + srtName + " · " + captions.length + " caption · " +
        totalDuration.toFixed(1) + "s · " + sourceInfo, true);

      var slider = $("previewTime");
      slider.max = totalDuration;

      // İLK CAPTION'IN ORTASINA ATLA (kullanıcı hemen önizleme görsün)
      if (captions.length > 0) {
        var first = captions[0];
        currentTime = first.startTime + (first.endTime - first.startTime) / 2;
      } else {
        currentTime = 0;
      }
      slider.value = currentTime;
      updateTimeLabel();

      $("exportBtn").disabled = false;
      drawPreview();
    } catch (e) {
      setSrtInfo("SRT okunamadı: " + e.message, false);
    }
  }

  function setSrtInfo(msg, isOk) {
    var el = $("srtInfo");
    el.textContent = msg;
    el.classList.toggle("ready", !!isOk);
  }

  // ---------- PREVIEW ----------
  function bindPreview() {
    var slider = $("previewTime");
    slider.addEventListener("input", function () {
      currentTime = parseFloat(slider.value);
      updateTimeLabel();
      drawPreview();
    });

    $("previewPlayBtn").addEventListener("click", function () {
      if (isPlaying) stopPlayback();
      else startPlayback();
    });
  }

  function startPlayback() {
    if (!captions.length) return;
    isPlaying = true;
    $("playIcon").innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
    playStart = performance.now() - currentTime * 1000;
    loopPlay();
  }

  function stopPlayback() {
    isPlaying = false;
    $("playIcon").innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
    if (animFrameId) cancelAnimationFrame(animFrameId);
  }

  function loopPlay() {
    if (!isPlaying) return;
    currentTime = (performance.now() - playStart) / 1000;
    if (currentTime > totalDuration) {
      currentTime = 0;
      playStart = performance.now();
    }
    $("previewTime").value = currentTime;
    updateTimeLabel();
    drawPreview();
    animFrameId = requestAnimationFrame(loopPlay);
  }

  function updateTimeLabel() {
    var s = Math.floor(currentTime);
    var ms = Math.floor((currentTime - s) * 10);
    var mm = Math.floor(s / 60);
    var ss = s % 60;
    $("previewTimeLabel").textContent = mm + ":" + (ss < 10 ? "0" : "") + ss + "." + ms;
  }

  function drawPreview() {
    if (!renderer) return;
    var caption = null;
    var renderTime = currentTime;

    if (captions.length) {
      caption = window.FC_getCaptionAtTime(captions, currentTime);
      // O ana ait caption yoksa en yakın bul
      if (!caption) {
        var closest = captions[0];
        var minDiff = Math.abs(currentTime - closest.startTime);
        for (var i = 1; i < captions.length; i++) {
          var d = Math.abs(currentTime - captions[i].startTime);
          if (d < minDiff) { minDiff = d; closest = captions[i]; }
        }
        caption = closest;
        // Render time'ı bu caption'ın ortasına ayarla — animasyon doğru gözüksün
        renderTime = caption.startTime + (caption.endTime - caption.startTime) / 2;
      }
    } else {
      // SRT yok — demo
      caption = {
        id: "demo",
        text: "Önizleme · burada altyazınız",
        words: [
          { text: "Önizleme", startTime: 0, endTime: 0.5 },
          { text: "·", startTime: 0.5, endTime: 0.7 },
          { text: "burada", startTime: 0.7, endTime: 1.2 },
          { text: "altyazınız", startTime: 1.2, endTime: 1.8 },
        ],
        startTime: 0,
        endTime: 2,
      };
      renderTime = 1.5;
    }
    if (renderer) renderer.renderFrame(caption, renderTime, style, animation);
  }

  // ---------- EXPORT ----------
  function bindExport() {
    $("exportBtn").addEventListener("click", function () {
      doExport();
    });
  }

  function doExport() {
    if (!captions.length) {
      setExportInfo("Önce SRT yükle.", "err");
      return;
    }
    var btn = $("exportBtn");
    btn.disabled = true;

    var fs, path;
    try {
      fs = require("fs");
      path = require("path");
    } catch (e) {
      setExportInfo("CEP node.js erişimi yok: " + e.message, "err");
      btn.disabled = false;
      return;
    }

    // ExtendScript ile proje yolunu al → onun yanına klasör aç
    cs.evalScript("getProjectDir()", function (r) {
      var proj = null;
      try { proj = JSON.parse(r); } catch (e) {}
      var baseDir = (proj && proj.ok) ? proj.dir : null;

      if (!baseDir) {
        // Proje kaydedilmemiş → Documents\FreeCaption (kullanıcı home, taşınabilir)
        try {
          var os_ = require("os");
          var path_ = require("path");
          baseDir = path_.join(os_.homedir(), "Documents", "FreeCaption");
        } catch (eH) {
          baseDir = (process.env.USERPROFILE || "C:\\Users\\Public") + "\\Documents\\FreeCaption";
        }
        try { if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true }); } catch (e) {}
      }

      // Frame klasörü: fc_frames_HHMMSS
      var stamp = new Date().toTimeString().slice(0,8).replace(/:/g, "");
      var folderName = "fc_frames_" + stamp;
      var folder = baseDir + "\\" + folderName;
      try {
        fs.mkdirSync(folder, { recursive: true });
      } catch (e) {
        setExportInfo("Klasör oluşturulamadı: " + e.message, "err");
        btn.disabled = false;
        return;
      }

      // KAYMA FIX:
      // Premiere'in PNG sequence import default fps'i kullanici preference'ina bagli.
      // Kullanici UI'dan secer (Edit > Preferences > Media > Indeterminate Media Timebase'le eslesmeli).
      // PNG'leri o fps'te render edersek Premiere dogru hizla yorumlar -> kayma yok.
      var seqFps = (typeof window.FC_LAST_SEQ_FPS === "number" && window.FC_LAST_SEQ_FPS > 0)
        ? window.FC_LAST_SEQ_FPS : 30;
      var fpsSelectEl = $("exportFps");
      var fpsChoice = fpsSelectEl ? fpsSelectEl.value : "auto";
      var fps;
      if (fpsChoice === "auto") {
        fps = seqFps;
      } else {
        fps = parseFloat(fpsChoice);
      }
      var seqW = (typeof window.FC_LAST_SEQ_WIDTH === "number" && window.FC_LAST_SEQ_WIDTH > 0)
        ? window.FC_LAST_SEQ_WIDTH : 1920;
      var seqH = (typeof window.FC_LAST_SEQ_HEIGHT === "number" && window.FC_LAST_SEQ_HEIGHT > 0)
        ? window.FC_LAST_SEQ_HEIGHT : 1080;
      console.log("[CEP] Export config: fps=" + fps + " (choice=" + fpsChoice +
        ", seqFps=" + seqFps + ") " + seqW + "x" + seqH);

      var startTime = captions[0].startTime;
      var endTime = captions[captions.length - 1].endTime + 0.3;
      var totalFrames = Math.ceil((endTime - startTime) * fps);

      // KAYMA FIX: PNG'yi sekansta clibin gercek baslangic anina koy.
      // Tab 1'den paylasilan FC_LAST_CLIP_SEQ_START = clibin sekanstaki start time'i
      // Caption start time'i da SRT 0'indan deg, clibin baslangicindan saniye gosterir
      // → PNG insert konumu = clipSeqStart + caption[0].start
      var clipSeqStart = (typeof window.FC_LAST_CLIP_SEQ_START === "number")
        ? window.FC_LAST_CLIP_SEQ_START : 0;
      var pngInsertAt = clipSeqStart + startTime;
      console.log("[CEP] PNG insert konumu (sekansta):", pngInsertAt,
        "= clipSeqStart(" + clipSeqStart + ") + caption[0].start(" + startTime + ")");

      setExportInfo("PNG export (" + fps + "fps) başladı… 0 / " + totalFrames, null);

      // Render canvas — sekansın gerçek çözünürlüğünde (kayma/ölçek sorununu çözer)
      var expCanvas = document.createElement("canvas");
      expCanvas.width = seqW;
      expCanvas.height = seqH;
      var expCtx = expCanvas.getContext("2d", { alpha: true });
      var expRenderer = new window.FC_CaptionRenderer(expCtx, expCanvas.width, expCanvas.height);

      var firstFile = null;
      var frameIndex = 0;

      function exportNext() {
        if (frameIndex >= totalFrames) {
          // Tamamlandi
          setExportInfo("✓ " + totalFrames + " PNG üretildi · Premiere'e aktarılıyor…", "ok");
          // ExtendScript ile Premiere'e import
          // KAYMA FIX: clipSeqStart + caption start
          var jsx = 'importPngSequence("' + encodeURIComponent(firstFile) + '", ' + pngInsertAt + ', ' + fps + ')';
          cs.evalScript(jsx, function (jr) {
            console.log("[CEP] importPngSequence:", jr);
            var jp = null;
            try { jp = JSON.parse(jr); } catch (e) {}
            if (jp && jp.ok) {
              // KAYMA FIX raporu: fps interpretation hangi metodla calisti?
              var fpsReport = "";
              if (jp.interpretedFps && jp.interpretedFps > 0) {
                fpsReport = " · fps=" + jp.interpretedFps + " (override OK)";
              } else {
                fpsReport = " · ⚠ fps override BAŞARISIZ → Modify > Interpret Footage'tan " + fps + " yap";
              }
              setExportInfo("🎉 " + totalFrames + " frame · " + folderName +
                " · video track'e yerleşti" + fpsReport, "ok");
              // Detayli log alert (kullanici DevTools acmadan gorebilsin)
              if (jp.interpretMsg) {
                console.log("[CEP] interpret detay:", jp.interpretMsg);
                // Eger fps override fail olduysa kullaniciyi uyar
                if (!jp.interpretedFps || jp.interpretedFps === 0) {
                  alert("PNG frame rate override BAŞARISIZ.\n\nDetay:\n" + jp.interpretMsg +
                    "\n\nELLE DÜZELT:\nTimeline'daki PNG clip'e sağ tık → Modify → Interpret Footage" +
                    "\n→ 'Assume this frame rate' seç → " + fps + " yaz → OK.");
                }
              }
            } else {
              setExportInfo("PNG'ler hazır (" + folder + ") ama otomatik import başarısız: " +
                (jp && jp.error ? jp.error : "?"), "err");
            }
            btn.disabled = false;
          });
          return;
        }

        var t = startTime + frameIndex / fps;
        var caption = window.FC_getCaptionAtTime(captions, t);
        expCtx.clearRect(0, 0, expCanvas.width, expCanvas.height);
        if (caption) expRenderer.renderFrame(caption, t, style, animation);

        var dataUrl = expCanvas.toDataURL("image/png");
        var base64 = dataUrl.split(",")[1];
        var buffer = Buffer.from(base64, "base64");
        var num = String(frameIndex).padStart(6, "0");
        var filePath = folder + "\\frame_" + num + ".png";
        try {
          fs.writeFileSync(filePath, buffer);
          if (!firstFile) firstFile = filePath;
        } catch (e) {
          console.error("Frame yazımı fail:", e);
        }

        frameIndex++;
        if (frameIndex % 10 === 0) {
          setExportInfo("PNG export… " + frameIndex + " / " + totalFrames +
            " (%" + Math.round(frameIndex / totalFrames * 100) + ")", null);
        }
        // Browser donmasin diye microtask
        setTimeout(exportNext, 0);
      }
      exportNext();
    });
  }

  function setExportInfo(msg, kind) {
    var el = $("exportInfo");
    el.classList.remove("hidden", "ok", "err");
    if (kind) el.classList.add(kind);
    el.textContent = msg;
  }

  // Init
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    setTimeout(init, 100);
  }
})();
