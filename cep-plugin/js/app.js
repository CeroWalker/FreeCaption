// FreeCaption CEP Panel - v1.0
// Python backend (lokal) <-> CEP UI <-> ExtendScript (Premiere DOM)

(function () {
  "use strict";

  // ===== STORAGE PERSISTENCE (Node fs + localStorage fallback for Mac/Win) =====
  function getConfigFile() {
    try {
      if (typeof require === "function") {
        var os = require("os");
        var path = require("path");
        var home = os.homedir ? os.homedir() : (process.env.HOME || process.env.USERPROFILE);
        if (home) return path.join(home, ".freecaption_config.json");
      }
    } catch (e) {}
    return null;
  }

  function readDiskConfig() {
    try {
      var fp = getConfigFile();
      if (fp && require("fs").existsSync(fp)) {
        var data = require("fs").readFileSync(fp, "utf8");
        return JSON.parse(data) || {};
      }
    } catch (e) {}
    return {};
  }

  function writeDiskConfig(cfg) {
    try {
      var fp = getConfigFile();
      if (fp) {
        require("fs").writeFileSync(fp, JSON.stringify(cfg, null, 2), "utf8");
      }
    } catch (e) {}
  }

  function getStorageItem(key) {
    try {
      var val = localStorage.getItem(key);
      if (val !== null && val !== undefined && val !== "") return val;
    } catch (e) {}
    var disk = readDiskConfig();
    if (disk && disk[key] !== undefined && disk[key] !== null) {
      try { localStorage.setItem(key, disk[key]); } catch (e) {}
      return disk[key];
    }
    return null;
  }

  function setStorageItem(key, val) {
    try { localStorage.setItem(key, val); } catch (e) {}
    var disk = readDiskConfig();
    disk[key] = val;
    writeDiskConfig(disk);
  }

  function removeStorageItem(key) {
    try { localStorage.removeItem(key); } catch (e) {}
    var disk = readDiskConfig();
    if (disk && disk[key] !== undefined) {
      delete disk[key];
      writeDiskConfig(disk);
    }
  }

  window.FC_getStorageItem = getStorageItem;
  window.FC_setStorageItem = setStorageItem;
  window.FC_removeStorageItem = removeStorageItem;

  // ===== API CONFIG =====
  function normalizeUrl(u) {
    if (!u) return "";
    u = u.trim().replace(/\/$/, "");
    if (!u) return "";
    // http:// veya https:// yoksa http:// ekle (cogu kullanim plain HTTP IP)
    if (!/^https?:\/\//i.test(u)) u = "http://" + u;
    return u;
  }
  function loadApi() {
    try {
      var url = getStorageItem("fc_api_url");
      if (url && url.length > 0) {
        var n = normalizeUrl(url);
        if (n !== url) { setStorageItem("fc_api_url", n); }
        return n;
      }
    } catch (e) {}
    return "http://127.0.0.1:7860";
  }
  function loadApiKey() {
    try { return getStorageItem("fc_api_key") || ""; } catch (e) { return ""; }
  }
  var API = loadApi();
  var API_KEY = loadApiKey();
  window.FC_API = API;
  window.FC_API_KEY = API_KEY;

  // fetch wrapper — API key header'i otomatik
  function fcFetch(path, opts) {
    opts = opts || {};
    opts.headers = opts.headers || {};
    if (API_KEY) opts.headers["X-API-Key"] = API_KEY;
    return fetch(API + path, opts);
  }
  window.FC_fetch = fcFetch;

  var cs = new CSInterface();

  var $ = function (id) { return document.getElementById(id); };

  // DOM refs
  var healthEl = $("health");
  var healthText = $("healthText");
  var seqNameEl = $("seqName");
  var selInfoEl = $("selInfo");
  var refreshBtn = $("refreshBtn");
  var clearCaptionBtn = $("clearCaptionBtn");
  var helpBtn = $("helpBtn");
  var languageSel = $("language");
  var styleSeg = $("styleSeg");
  var placementSeg = $("placementSeg");
  var outputDirMode = $("outputDirMode");
  var customDirRow = $("customDirRow");
  var customDirInput = $("customDirInput");
  var customDirBtn = $("customDirBtn");
  var autoPlaceChk = $("autoPlace");
  var generateBtn = $("generateBtn");
  var jobBox = $("jobBox");
  var jobName = $("jobName");
  var jobStatus = $("jobStatus");
  var jobStage = $("jobStage");
  var bar = $("bar");
  var jobError = $("jobError");
  var ghLink = $("ghLink");
  var webLink = $("webLink");

  // Onboarding
  var onboarding = $("onboarding");
  var obStep1Status = $("obStep1Status");
  var obClose = $("obClose");

  // State
  var lastClipInfo = null;
  var currentMaxChars = 22;
  var currentPlacement = "sequence_start";
  var projectDir = null; // Premiere proje klasoru

  // ===== ExtendScript bridge =====
  function evalJSX(fnCall) {
    return new Promise(function (resolve, reject) {
      cs.evalScript(fnCall, function (result) {
        if (result === "EvalScript error.") {
          reject(new Error("EvalScript error: " + fnCall));
          return;
        }
        try { resolve(JSON.parse(result)); }
        catch (e) { resolve(result); }
      });
    });
  }

  // ===== Settings persistence =====
  function loadSetting(key, fallback) {
    try { var v = getStorageItem("fc_" + key); return v === null ? fallback : v; }
    catch (e) { return fallback; }
  }
  function saveSetting(key, val) {
    setStorageItem("fc_" + key, val);
  }

  // ===== External links =====
  function openExternal(url) {
    try { cs.openURLInDefaultBrowser(url); } catch (e) { window.open(url); }
  }
  if (ghLink) ghLink.addEventListener("click", function (e) { e.preventDefault(); openExternal(ghLink.href); });
  if (webLink) webLink.addEventListener("click", function (e) { e.preventDefault(); openExternal(webLink.href); });

  // ===== Health check =====
  function checkHealth() {
    return fcFetch("/api/health", { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        healthEl.classList.add("ok");
        healthEl.classList.remove("err");
        healthText.textContent = j.gpu ? ("GPU: " + (j.gpu_name || "var")) : "CPU modu";
        if (obStep1Status) {
          obStep1Status.textContent = "✓ Sunucu çalışıyor" + (j.gpu ? " (GPU)" : " (CPU)");
          obStep1Status.className = "ob-step-status ok";
        }
        return true;
      })
      .catch(function () {
        healthEl.classList.remove("ok");
        healthEl.classList.add("err");
        healthText.textContent = "Sunucu kapalı";
        if (obStep1Status) {
          obStep1Status.textContent = "✗ Sunucu kapalı. Panel'deki 'Sunucu Başlat' tuşuna bas.";
          obStep1Status.className = "ob-step-status err";
        }
        return false;
      });
  }
  setInterval(checkHealth, 5000);
  checkHealth();

  // ===== Tab switching =====
  var tabBtns = document.querySelectorAll(".tab-btn");
  var tabPanels = document.querySelectorAll(".tab-panel");
  tabBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var target = btn.dataset.tab;
      tabBtns.forEach(function (b) { b.classList.remove("is-active"); });
      tabPanels.forEach(function (p) { p.classList.remove("is-active"); });
      btn.classList.add("is-active");
      var panel = document.getElementById("tab-" + target);
      if (panel) panel.classList.add("is-active");
      setStorageItem("fc_active_tab", target);
    });
  });
  // Son seçili tab'ı geri yükle
  try {
    var savedTab = getStorageItem("fc_active_tab");
    if (savedTab) {
      var btn = document.querySelector('.tab-btn[data-tab="' + savedTab + '"]');
      if (btn) btn.click();
    }
  } catch (e) {}

  // ===== SUNUCU KONTROL =====
  var srvStartBtn = $("srvStartBtn");
  var srvStopBtn = $("srvStopBtn");
  var srvPurgeBtn = $("srvPurgeBtn");
  var serverStatusEl = $("serverStatus");

  function setServerStatus(text, klass) {
    if (serverStatusEl) {
      serverStatusEl.textContent = text;
      serverStatusEl.className = "server-status" + (klass ? " " + klass : "");
    }
  }

  if (srvStartBtn) srvStartBtn.addEventListener("click", function () {
    if (typeof process !== "undefined" && process.platform === "darwin") {
      setServerStatus("macOS'ta yerel başlatma desteklenmiyor. Lütfen VDS sunucusuna bağlanın.", "err");
      return;
    }
    setServerStatus("Başlatılıyor…", "busy");
    // Lokal sunucu yolu kullanıcı tarafından ayarlanabilir (⚙ Sunucu Ayarları → Lokal mod)
    // VDS modunda bu buton kullanılmaz; URL uzak sunucuya işaret eder.
    var batPath = getStorageItem("fc_local_start_bat") || "";
    if (!batPath) {
      setServerStatus("Lokal sunucu yolu ayarlanmamış. VDS kullanılıyorsa bu buton gereksiz.", "err");
      return;
    }
    var workDir = batPath.replace(/[\\\/][^\\\/]+$/, "");
    var launched = false;
    var lastErr = "";

    // YOL 1: CEP'in resmi process API'si (en güvenilir)
    try {
      if (window.cep && window.cep.process && typeof window.cep.process.createProcess === "function") {
        // cmd /c start ile yeni görünür terminal aç
        var res = window.cep.process.createProcess(
          "cmd.exe", "/c",
          "start", "FreeCaption Server",
          "cmd.exe", "/k", batPath
        );
        console.log("[CEP] cep.process.createProcess result:", res);
        // res: { err: 0, data: <pid> } başarılı
        if (res && (res.err === 0 || typeof res === "number")) {
          launched = true;
        } else {
          lastErr = "cep.process err=" + (res && res.err);
        }
      }
    } catch (e1) { lastErr = "cep.process ex: " + e1.message; }

    // YOL 2: Node.js child_process (fallback)
    if (!launched) {
      try {
        var cp = require("child_process");
        var child = cp.spawn("cmd.exe",
          ["/c", "start", "FreeCaption Server", "cmd.exe", "/k", batPath],
          { cwd: workDir, detached: true, stdio: "ignore", windowsHide: false }
        );
        child.unref();
        launched = true;
      } catch (e2) { lastErr += " | child_process ex: " + e2.message; }
    }

    // YOL 3: exec (son çare)
    if (!launched) {
      try {
        var cp2 = require("child_process");
        cp2.exec('start "FreeCaption" cmd /k "' + batPath + '"', { cwd: workDir });
        launched = true;
      } catch (e3) { lastErr += " | exec ex: " + e3.message; }
    }

    if (launched) {
      setServerStatus("Terminal açıldı, modeller yükleniyor (10-30sn)…", "busy");
      // Health check'i birden fazla kez tetikle
      setTimeout(function () { checkHealth(); }, 5000);
      setTimeout(function () { checkHealth(); }, 10000);
      setTimeout(function () { checkHealth(); }, 20000);
    } else {
      console.error("[CEP] Tüm başlatma yolları başarısız:", lastErr);
      setServerStatus("✗ Başlatılamadı: " + lastErr, "err");
    }
  });

  if (srvStopBtn) srvStopBtn.addEventListener("click", function () {
    if (!confirm("Sunucuyu kapat? Aktif iş varsa kaybolur.")) return;
    setServerStatus("Kapatılıyor…", "busy");
    fcFetch("/api/shutdown", { method: "POST" })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j.ok) setServerStatus("Sunucu kapandı.", "err");
        else setServerStatus("Kapatma hatası: " + j.error, "err");
      }).catch(function () {
        // Genelde shutdown sonrası response gelmez — bu normal
        setServerStatus("Sunucu kapandı.", "err");
      });
  });

  if (srvPurgeBtn) srvPurgeBtn.addEventListener("click", function () {
    setServerStatus("RAM temizleniyor…", "busy");
    fcFetch("/api/unload", { method: "POST" })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j.ok) {
          setServerStatus("✓ RAM temizlendi (Whisper unload).", "ok");
          setTimeout(checkHealth, 1500);
        } else {
          setServerStatus("Hata: " + (j.error || "?"), "err");
        }
      }).catch(function (e) {
        setServerStatus("Bağlantı hatası: " + e.message, "err");
      });
  });

  // ===== ExtendScript bridge testi (panel acilir acilmaz) =====
  setTimeout(function () {
    evalJSX("fcPing()")
      .then(function (r) {
        console.log("[CEP] fcPing OK:", r);
        // UI'da gorulebilir
        if (r && r.ok) {
          seqNameEl.textContent = "✓ Bridge OK";
          seqNameEl.style.color = "#22c55e";
        }
      })
      .catch(function (e) {
        console.error("[CEP] fcPing FAIL:", e.message);
        // UI'da gorulebilir hata
        seqNameEl.textContent = "✗ JSX yuklenmiyor";
        seqNameEl.style.color = "#ef4444";
        selInfoEl.textContent = "main.jsx parse hata";
      });
  }, 800);

  // ===== Eklenti Otomatik Guncelleme (GitHub'tan) =====
  var GITHUB_REPO = "CeroWalker/FreeCaption";
  var GITHUB_BRANCH = "main";

  function getInstalledCommit() {
    try {
      var fs = require("fs");
      var path = require("path");
      var ext = getExtensionDir();
      var versionFile = path.join(ext, ".fc_commit");
      if (fs.existsSync(versionFile)) return fs.readFileSync(versionFile, "utf8").trim();
    } catch (e) {}
    return null;
  }

  function getExtensionDir() {
    try {
      // CEP eklentinin gerçek konumunu öğrenmek için __dirname benzeri
      // window.location pathname'i kullan
      var loc = window.location.pathname.replace(/\\/g, "/");
      // .../FreeCaption/index.html → .../FreeCaption
      var dir = loc.substring(0, loc.lastIndexOf("/"));
      // Windows mutlak yolu (file:///C:/...)
      if (/^\/[A-Za-z]:\//.test(dir)) dir = dir.substring(1);
      if (typeof process !== "undefined" && process.platform === "darwin") {
        return dir;
      }
      return dir.replace(/\//g, "\\");
    } catch (e) {
      // Fallback
      if (typeof process !== "undefined" && process.platform === "darwin") {
        return process.env.HOME + "/Library/Application Support/Adobe/CEP/extensions/FreeCaption";
      }
      return process.env.APPDATA + "\\Adobe\\CEP\\extensions\\FreeCaption";
    }
  }

  function updatePlugin() {
    var updateBtn = $("updateBtn");
    if (updateBtn) updateBtn.disabled = true;
    showToast("Güncelleme indiriliyor…");

    try {
      var https = require("https");
      var fs = require("fs");
      var path = require("path");
      var os = require("os");
      var cp = require("child_process");

      // 1) Son commit SHA'sini API'den al (rate limit'siz GitHub raw API)
      var apiUrl = "https://api.github.com/repos/" + GITHUB_REPO + "/commits/" + GITHUB_BRANCH;
      https.get(apiUrl, { headers: { "User-Agent": "FreeCaption-Updater" } }, function (res) {
        var data = "";
        res.on("data", function (c) { data += c; });
        res.on("end", function () {
          var sha;
          try { sha = JSON.parse(data).sha; } catch (e) { sha = null; }
          if (!sha) {
            showToast("✗ GitHub commit alınamadı", true);
            if (updateBtn) updateBtn.disabled = false;
            return;
          }
          var installed = getInstalledCommit();
          if (installed === sha) {
            showToast("✓ Zaten en güncel: " + sha.substring(0, 7));
            if (updateBtn) updateBtn.disabled = false;
            return;
          }
          downloadAndApply(sha, updateBtn);
        });
      }).on("error", function (e) {
        showToast("✗ GitHub baglantisi: " + e.message, true);
        if (updateBtn) updateBtn.disabled = false;
      });
    } catch (e) {
      showToast("✗ " + e.message, true);
      if (updateBtn) updateBtn.disabled = false;
    }
  }

  function downloadAndApply(sha, updateBtn) {
    try {
      var os = require("os");
      var path = require("path");
      var fs = require("fs");
      var cp = require("child_process");

      var zipUrl = "https://github.com/" + GITHUB_REPO + "/archive/" + sha + ".zip";
      var tempZip = path.join(os.tmpdir(), "fc_update_" + Date.now() + ".zip");
      var extractDir = path.join(os.tmpdir(), "fc_update_" + Date.now());
      var extDir = getExtensionDir();

      showToast("ZIP indiriliyor…");

      var isMac = (typeof process !== "undefined" && process.platform === "darwin");
      if (isMac) {
        var shCmd =
          "curl -L '" + zipUrl + "' -o '" + tempZip + "' && " +
          "mkdir -p '" + extractDir + "' && " +
          "unzip -q '" + tempZip + "' -d '" + extractDir + "' && " +
          "src_dir=$(find '" + extractDir + "' -maxdepth 1 -type d | grep -v '^" + extractDir + "$' | head -n 1) && " +
          "cp -R \"$src_dir/cep-plugin/\"* '" + extDir + "' && " +
          "echo -n '" + sha + "' > '" + extDir + "/.fc_commit' && " +
          "rm -rf '" + tempZip + "' '" + extractDir + "'";

        cp.exec(shCmd, { maxBuffer: 100 * 1024 * 1024 }, function (err, stdout, stderr) {
          if (err) {
            showToast("✗ Güncelleme hata: " + (stderr || err.message).slice(0, 150), true);
            if (updateBtn) updateBtn.disabled = false;
            return;
          }
          showToast("✓ Güncellendi → " + sha.substring(0, 7) + " · Panel yeniden yükleniyor…");
          setTimeout(function () { window.location.reload(); }, 1500);
        });
      } else {
        // PowerShell ile indir + aç + kopyala (CEP'te node https büyük ZIP'lerde yavaş)
        var psCmd =
          "Invoke-WebRequest '" + zipUrl + "' -OutFile '" + tempZip + "' -UseBasicParsing; " +
          "Expand-Archive '" + tempZip + "' '" + extractDir + "' -Force; " +
          "$src = Get-ChildItem '" + extractDir + "' -Directory | Select-Object -First 1; " +
          "Copy-Item -Path \"$($src.FullName)\\cep-plugin\\*\" -Destination '" + extDir + "' -Recurse -Force; " +
          "Set-Content -Path '" + extDir + "\\.fc_commit' -Value '" + sha + "' -Encoding ASCII -NoNewline; " +
          "Remove-Item '" + tempZip + "','" + extractDir + "' -Recurse -Force";

        cp.exec('powershell -NoProfile -ExecutionPolicy Bypass -Command "' + psCmd.replace(/"/g, '\\"') + '"',
          { maxBuffer: 100 * 1024 * 1024 },
          function (err, stdout, stderr) {
            if (err) {
              showToast("✗ Güncelleme hata: " + (stderr || err.message).slice(0, 150), true);
              if (updateBtn) updateBtn.disabled = false;
              return;
            }
            showToast("✓ Güncellendi → " + sha.substring(0, 7) + " · Panel yeniden yükleniyor…");
            setTimeout(function () { window.location.reload(); }, 1500);
          });
      }
    } catch (e) {
      showToast("✗ " + e.message, true);
      if (updateBtn) updateBtn.disabled = false;
    }
  }

  var updateBtn = $("updateBtn");
  if (updateBtn) updateBtn.addEventListener("click", function () {
    if (!confirm("Eklentiyi GitHub'tan en son sürüme güncelle?\n\nReposi: " + GITHUB_REPO + "\nPanel yeniden yüklenecek.")) return;
    updatePlugin();
  });

  // ===== Sunucu Ayarlari (URL + API Key) =====
  var settingsBtn = $("settingsBtn");
  if (settingsBtn) {
    settingsBtn.addEventListener("click", function () {
      var currentUrl = API;
      var currentKey = API_KEY;
      var newUrl = prompt(
        "Sunucu URL (lokal: http://127.0.0.1:7860 — VDS: https://api.YOURDOMAIN.com):",
        currentUrl
      );
      if (newUrl === null) return; // iptal
      newUrl = normalizeUrl(newUrl);
      if (!newUrl) {
        removeStorageItem("fc_api_url");
        API = "http://127.0.0.1:7860";
      } else {
        setStorageItem("fc_api_url", newUrl);
        API = newUrl;
      }
      window.FC_API = API;

      var newKey = prompt(
        "API Key (VDS icin .env'den; lokal'de bos birakabilirsin):",
        currentKey
      );
      if (newKey !== null) {
        newKey = newKey.trim();
        try {
          if (newKey) setStorageItem("fc_api_key", newKey);
          else removeStorageItem("fc_api_key");
        } catch (e) {}
        API_KEY = newKey;
        window.FC_API_KEY = API_KEY;
      }

      showToast("✓ Sunucu ayarlari kaydedildi: " + API);
      setTimeout(checkHealth, 300);
    });
  }

  // ===== Onboarding =====
  function showOnboarding() { onboarding.classList.remove("hidden"); }
  function hideOnboarding() {
    onboarding.classList.add("hidden");
    saveSetting("seen_onboarding", "1");
  }
  obClose.addEventListener("click", hideOnboarding);
  helpBtn.addEventListener("click", showOnboarding);
  if (!loadSetting("seen_onboarding", null)) {
    setTimeout(showOnboarding, 600);
  }

  // ===== Segmented pickers =====
  function bindSeg(segEl, callback) {
    if (!segEl) return;
    var segs = segEl.querySelectorAll(".seg");
    segs.forEach(function (btn) {
      btn.addEventListener("click", function () {
        segs.forEach(function (b) { b.classList.remove("is-active"); });
        btn.classList.add("is-active");
        callback(btn);
      });
    });
  }
  bindSeg(styleSeg, function (btn) {
    currentMaxChars = parseInt(btn.dataset.chars, 10) || 22;
    saveSetting("max_chars", String(currentMaxChars));
  });
  bindSeg(placementSeg, function (btn) {
    currentPlacement = btn.dataset.mode || "sequence_start";
    saveSetting("placement", currentPlacement);
  });

  var autoCutChk = $("autoCut");
  var silenceThresholdInput = $("silenceThreshold");
  var silenceThresholdRow = $("silenceThresholdRow");

  function toggleSilenceThreshold() {
    if (autoCutChk.checked) silenceThresholdRow.classList.remove("hidden");
    else silenceThresholdRow.classList.add("hidden");
  }

  autoCutChk.addEventListener("change", function () {
    saveSetting("auto_cut", autoCutChk.checked ? "1" : "0");
    toggleSilenceThreshold();
  });

  silenceThresholdInput.addEventListener("change", function () {
    saveSetting("silence_threshold", silenceThresholdInput.value);
  });

  // Restore preferences
  (function restore() {
    var savedChars = loadSetting("max_chars", null);
    if (savedChars) {
      currentMaxChars = parseInt(savedChars, 10);
      var match = styleSeg.querySelector('.seg[data-chars="' + savedChars + '"]');
      if (match) {
        styleSeg.querySelectorAll(".seg").forEach(function (b) { b.classList.remove("is-active"); });
        match.classList.add("is-active");
      }
    }
    var savedPl = loadSetting("placement", null);
    if (savedPl) {
      currentPlacement = savedPl;
      var pm = placementSeg.querySelector('.seg[data-mode="' + savedPl + '"]');
      if (pm) {
        placementSeg.querySelectorAll(".seg").forEach(function (b) { b.classList.remove("is-active"); });
        pm.classList.add("is-active");
      }
    }
    var savedLang = loadSetting("language", null);
    if (savedLang && languageSel.querySelector('option[value="' + savedLang + '"]')) {
      languageSel.value = savedLang;
    }
    var savedOutMode = loadSetting("output_mode", null);
    if (savedOutMode && outputDirMode.querySelector('option[value="' + savedOutMode + '"]')) {
      outputDirMode.value = savedOutMode;
    }
    var savedCustom = loadSetting("custom_dir", null);
    if (savedCustom) customDirInput.value = savedCustom;
    toggleCustomDir();

    var savedAutoCut = loadSetting("auto_cut", null);
    if (savedAutoCut === "1") {
      autoCutChk.checked = true;
    } else if (savedAutoCut === "0") {
      autoCutChk.checked = false;
    }
    toggleSilenceThreshold();

    var savedSilenceThreshold = loadSetting("silence_threshold", null);
    if (savedSilenceThreshold) {
      silenceThresholdInput.value = savedSilenceThreshold;
    }
  })();

  languageSel.addEventListener("change", function () { saveSetting("language", languageSel.value); });
  outputDirMode.addEventListener("change", function () {
    saveSetting("output_mode", outputDirMode.value);
    toggleCustomDir();
  });
  customDirInput.addEventListener("change", function () { saveSetting("custom_dir", customDirInput.value); });

  function toggleCustomDir() {
    if (outputDirMode.value === "custom") customDirRow.classList.remove("hidden");
    else customDirRow.classList.add("hidden");
  }

  // Folder picker (CEP'te node.js fs varsa folder secimi yapilabilir)
  customDirBtn.addEventListener("click", function () {
    try {
      // CEP'te node entegrasyonu varsa Electron-style dialog yok, basit prompt
      var v = prompt("Tam klasör yolu (örn. C:\\Users\\...\\Klasor):", customDirInput.value || "");
      if (v) {
        customDirInput.value = v;
        saveSetting("custom_dir", v);
      }
    } catch (e) {}
  });

  // ===== Premiere proje dizini =====
  function refreshProjectDir() {
    evalJSX("getProjectDir()").then(function (r) {
      projectDir = (r && r.ok) ? r.dir : null;
    }).catch(function () { projectDir = null; });
  }
  refreshProjectDir();
  setInterval(refreshProjectDir, 10000);

  // ===== Sequence info =====
  var _probeLogged = false;
  function refreshSequenceInfo() {
    evalJSX("getSelectedClipInfo()").then(function (info) {
      if (info && info.ok) {
        if (info.itemName) info.itemName = decodeURIComponent(info.itemName);
        if (info.mediaPath) info.mediaPath = decodeURIComponent(info.mediaPath);
        if (info.seqName) info.seqName = decodeURIComponent(info.seqName);
        if (info.videoPath) info.videoPath = decodeURIComponent(info.videoPath);
        if (info.videoName) info.videoName = decodeURIComponent(info.videoName);
        if (info.audioPath) info.audioPath = decodeURIComponent(info.audioPath);
        if (info.audioName) info.audioName = decodeURIComponent(info.audioName);
        if (info.clips && info.clips.length) {
          for (var ci = 0; ci < info.clips.length; ci++) {
            if (info.clips[ci].itemName) info.clips[ci].itemName = decodeURIComponent(info.clips[ci].itemName);
            if (info.clips[ci].mediaPath) info.clips[ci].mediaPath = decodeURIComponent(info.clips[ci].mediaPath);
            if (info.clips[ci].videoPath) info.clips[ci].videoPath = decodeURIComponent(info.clips[ci].videoPath);
            if (info.clips[ci].videoName) info.clips[ci].videoName = decodeURIComponent(info.clips[ci].videoName);
            if (info.clips[ci].audioPath) info.clips[ci].audioPath = decodeURIComponent(info.clips[ci].audioPath);
            if (info.clips[ci].audioName) info.clips[ci].audioName = decodeURIComponent(info.clips[ci].audioName);
          }
        }
      }
      // V7 probe: ilk gelen probe raporunu console'a tam yaz
      if (info && info.probe && !_probeLogged) {
        console.log("[CEP] V7 PROBE FULL:", info);
        _probeLogged = true;
      }
      var btnSpan = generateBtn ? generateBtn.querySelector("span") : null;
      if (!info || !info.ok) {
        seqNameEl.textContent = (info && info.t4_seqName) || (info && info.seqName) || "—";
        if (btnSpan) btnSpan.textContent = "Altyazı Üret";
        // V7: en son test (tX_ERR veya tX_xxx) bilgisini panele yaz
        var msg = "—";
        if (info) {
          if (info.error) msg = info.error;
          // Hangi T_ERR varsa onu goster
          var keys = ["t9_ERR", "t8_ERR", "t7_ERR", "t6_ERR", "t5_ERR", "t4_ERR", "t3_ERR", "t2_ERR", "t1_ERR"];
          for (var i = 0; i < keys.length; i++) {
            if (info[keys[i]]) { msg = keys[i] + ": " + info[keys[i]]; break; }
          }
          // Hicbir hata yoksa son durumu goster
          if (msg === "—" && info.t6_selLen !== undefined) {
            msg = "Sel: " + info.t6_selLen + " | VT: " + (info.t7_vtCount || 0);
          }
        }
        selInfoEl.textContent = msg;
        selInfoEl.title = JSON.stringify(info || {}, null, 2);
        lastClipInfo = null;
        return;
      }
      seqNameEl.textContent = info.seqName || info.t4_seqName || "Aktif";
      var clipCount = (info.count !== undefined) ? info.count : (info.clips ? info.clips.length : 1);
      if (clipCount > 1) {
        if (btnSpan) btnSpan.textContent = "Altyazı Üret (" + clipCount + " Klip)";
        selInfoEl.textContent = clipCount + " klip seçildi";
      } else {
        if (btnSpan) btnSpan.textContent = "Altyazı Üret";
        var dur = info.duration ? (info.duration.toFixed(1) + "s") : "";
        var name = info.itemName ? (" · " + info.itemName) : "";
        selInfoEl.textContent = "1 klip · " + dur + name;
      }
      selInfoEl.title = info.mediaPath || "";
      lastClipInfo = info;
      // Tab 2'ye SEQUENCE FPS + DIMENSION + clip start paylas (PNG export icin kritik)
      try {
        if (info.seqFps) window.FC_LAST_SEQ_FPS = info.seqFps;
        if (info.seqWidth) window.FC_LAST_SEQ_WIDTH = info.seqWidth;
        if (info.seqHeight) window.FC_LAST_SEQ_HEIGHT = info.seqHeight;
        if (typeof info.startTime === "number") window.FC_LAST_CLIP_SEQ_START = info.startTime;
      } catch (e) {}
    }).catch(function (e) {
      seqNameEl.textContent = "—";
      selInfoEl.textContent = "JSX err: " + (e.message || e);
      var bSpanErr = generateBtn ? generateBtn.querySelector("span") : null;
      if (bSpanErr) bSpanErr.textContent = "Altyazı Üret";
      console.error("[CEP] getSelectedClipInfo:", e);
    });
  }
  refreshBtn.addEventListener("click", refreshSequenceInfo);
  setInterval(refreshSequenceInfo, 1500);
  refreshSequenceInfo();

  // ===== C1 Temizle =====
  clearCaptionBtn.addEventListener("click", function () {
    if (!confirm("Caption track'lerdeki TÜM altyazıları sil?")) return;
    clearCaptionBtn.disabled = true;
    var oldHTML = clearCaptionBtn.innerHTML;
    clearCaptionBtn.innerHTML = "Siliniyor…";
    evalJSX("clearCaptionTracks()").then(function (r) {
      clearCaptionBtn.innerHTML = oldHTML;
      clearCaptionBtn.disabled = false;
      if (r && r.ok) showToast("✓ " + (r.cleared || 0) + " caption silindi");
      else showToast("✗ " + ((r && r.error) || "Hata"), true);
      if (r && r.log) console.log("[CEP] clear log:", r.log.join("\n"));
    }).catch(function (e) {
      clearCaptionBtn.innerHTML = oldHTML;
      clearCaptionBtn.disabled = false;
      showToast("✗ " + e.message, true);
    });
  });

  // ===== UPLOAD AKISI (VDS modu icin) =====
  // Lokal API: /api/clip ile media_path gonder
  // Remote API: ffmpeg ile WAV ekstrakt + /api/upload + job poll + SRT indir
  function isRemoteMode() {
    return !/(127\.0\.0\.1|localhost)/.test(API);
  }

  // ffmpeg yolunu bul (PATH veya WinGet)
  function findFfmpegPath() {
    try {
      var fs = require("fs");
      var path = require("path");

      if (typeof process !== "undefined" && process.platform === "darwin") {
        var macCandidates = [
          "/opt/homebrew/bin/ffmpeg",
          "/usr/local/bin/ffmpeg",
          "/usr/bin/ffmpeg"
        ];
        for (var i = 0; i < macCandidates.length; i++) {
          if (fs.existsSync(macCandidates[i])) return macCandidates[i];
        }
        return "ffmpeg"; // PATH fallback
      }

      var candidates = [
        process.env.LOCALAPPDATA + "\\Microsoft\\WinGet\\Links\\ffmpeg.exe",
        "C:\\ffmpeg\\bin\\ffmpeg.exe",
        "C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe",
      ];
      for (var i = 0; i < candidates.length; i++) {
        if (candidates[i] && fs.existsSync(candidates[i])) return candidates[i];
      }
    } catch (e) {}
    return "ffmpeg"; // PATH'te varsay
  }

  function extractWav(mediaPath, inPoint, outPoint, callback) {
    try {
      // CEP Node API kontrol — require window scope'unda olabilir (mixed-context)
      var req = (typeof require === "function") ? require : (typeof window.cep_node !== "undefined" ? window.cep_node.require : null);
      if (!req) {
        return callback(new Error("CEP Node integrasyonu aktif degil — manifest.xml'e --mixed-context ekle, eklentiyi yeniden yukle"));
      }
      var cp = req("child_process");
      var path = req("path");
      var os = req("os");
      var ffmpeg = findFfmpegPath();
      var tempWav = path.join(os.tmpdir(), "fc_upload_" + Date.now() + ".wav");
      var args = [];
      // -ss ve -to: input ÖNCESI hizli seek
      if (inPoint && inPoint > 0) { args.push("-ss"); args.push(String(inPoint)); }
      if (outPoint && outPoint > inPoint) { args.push("-to"); args.push(String(outPoint)); }
      args.push("-i", mediaPath, "-vn", "-ac", "1", "-ar", "16000", "-y", tempWav);
      console.log("[CEP] ffmpeg", ffmpeg, args.join(" "));
      cp.execFile(ffmpeg, args, { maxBuffer: 200 * 1024 * 1024 }, function (err, stdout, stderr) {
        if (err) {
          var errMsg = stderr ? stderr.trim().split(/\r?\n/).slice(-3).join("\n") : err.message;
          return callback(new Error("ffmpeg fail:\n" + errMsg + "\nCommand: " + ffmpeg + " " + args.join(" ")));
        }
        callback(null, tempWav);
      });
    } catch (e) { callback(e); }
  }

  function uploadAndTranscribe(wavPath, language, maxCharsPerLine, onStage, onDone, clipInPoint, clipInfo) {
    try {
      var req = (typeof require === "function") ? require : (typeof window.cep_node !== "undefined" ? window.cep_node.require : null);
      if (!req) return onDone(null, null, new Error("Node API yok"));
      var fs = req("fs");
      onStage("WAV yukleniyor (" + Math.round(fs.statSync(wavPath).size / 1024 / 1024) + " MB)…");
      var wavBuf = fs.readFileSync(wavPath);
      var blob = new Blob([wavBuf], { type: "audio/wav" });
      var fd = new FormData();
      fd.append("file", blob, "clip.wav");
      fd.append("in_point", String(clipInPoint || 0));
      if (language) fd.append("language", language);
      if (maxCharsPerLine && maxCharsPerLine > 0) {
        fd.append("max_chars_per_line", String(maxCharsPerLine));
      }
      fd.append("max_words_per_line", "99");
      fd.append("auto_cut", autoCutChk.checked ? "true" : "false");
      fd.append("silence_threshold", String(parseFloat(silenceThresholdInput.value) || 0.4));
      
      var info = clipInfo || lastClipInfo;
      if (info) {
        fd.append("fps", String(info.seqFps || (lastClipInfo && lastClipInfo.seqFps) || 30.0));
        fd.append("width", String(info.seqWidth || (lastClipInfo && lastClipInfo.seqWidth) || 1920));
        fd.append("height", String(info.seqHeight || (lastClipInfo && lastClipInfo.seqHeight) || 1080));
        if (info.videoName || info.videoPath) {
          var vName = info.videoName || (info.videoPath ? info.videoPath.split(/[\\/]/).pop() : "");
          fd.append("video_file_name", vName);
          if (info.videoPath) fd.append("video_path", info.videoPath);
        }
        if (info.audioPath) {
          fd.append("audio_path", info.audioPath);
        }
      }

      fcFetch("/api/upload", { method: "POST", body: fd })
        .then(function (r) {
          if (!r.ok) return r.text().then(function (t) { throw new Error("Upload " + r.status + ": " + t); });
          return r.json();
        })
        .then(function (job) {
          onStage("Transkripsiyon basladi (job=" + job.id + ")");
          pollServerJob(job.id, onStage, onDone, wavPath);
        })
        .catch(function (e) { onDone(null, null, e); });
    } catch (e) { onDone(null, null, e); }
  }

  function pollServerJob(jobId, onStage, onDone, wavPathToClean) {
    var done = false;
    function tick() {
      if (done) return;
      fcFetch("/api/job/" + jobId, { cache: "no-store" })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          var pct = Math.round((j.progress || 0) * 100);
          onStage((j.stage || "isleniyor") + " · %" + pct, j);
          if (j.status === "done") {
            done = true;
            // SRT indir
            fcFetch("/download/" + jobId + "/srt")
              .then(function (r) { return r.text(); })
              .then(function (srtText) {
                // wav temizle
                try { require("fs").unlinkSync(wavPathToClean); } catch (e) {}
                onDone(srtText, j);
              })
              .catch(function (e) { onDone(null, j, e); });
          } else if (j.status === "error") {
            done = true;
            try { require("fs").unlinkSync(wavPathToClean); } catch (e) {}
            onDone(null, j, new Error(j.error || "Sunucu hatasi"));
          } else {
            setTimeout(tick, 800);
          }
        }).catch(function (e) {
          done = true;
          onDone(null, null, e);
        });
    }
    tick();
  }

  function saveSrtLocal(srtText, baseName) {
    try {
      var fs = require("fs");
      var path = require("path");
      var os = require("os");
      // Output klasoru karari: project > custom > default
      var outDir = null;
      var mode = outputDirMode.value;
      if (mode === "project" && projectDir) outDir = projectDir;
      else if (mode === "custom" && customDirInput.value) outDir = customDirInput.value.trim();
      if (!outDir) outDir = path.join(os.homedir(), "Documents", "FreeCaption");
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
      var stamp = new Date().toTimeString().slice(0,8).replace(/:/g, "");
      var name = (baseName || "subtitle") + "_" + currentMaxChars + "c_" + stamp + ".srt";
      var fullPath = path.join(outDir, name);
      fs.writeFileSync(fullPath, srtText, "utf8");
      return fullPath;
    } catch (e) {
      console.error("[CEP] SRT save fail:", e);
      return null;
    }
  }

  function saveXmlLocal(xmlText, baseName) {
    try {
      var fs = require("fs");
      var path = require("path");
      var os = require("os");
      var outDir = null;
      var mode = outputDirMode.value;
      if (mode === "project" && projectDir) outDir = projectDir;
      else if (mode === "custom" && customDirInput.value) outDir = customDirInput.value.trim();
      if (!outDir) outDir = path.join(os.homedir(), "Documents", "FreeCaption");
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
      var stamp = new Date().toTimeString().slice(0,8).replace(/:/g, "");
      var name = (baseName || "subtitle") + "_" + stamp + ".xml";
      var fullPath = path.join(outDir, name);
      fs.writeFileSync(fullPath, xmlText, "utf8");
      return fullPath;
    } catch (e) {
      console.error("[CEP] XML save fail:", e);
      return null;
    }
  }

  function pathToUrl(filePath) {
    if (!filePath) return "";
    var p = filePath.replace(/\\/g, "/");
    if (!/^file:\/\//i.test(p)) {
      if (/^[a-zA-Z]:/.test(p)) {
        p = "file:///" + p;
      } else {
        if (p.charAt(0) !== "/") p = "/" + p;
        p = "file://" + p;
      }
    }
    return encodeURI(p);
  }

  function escapeXml(unsafe) {
    return unsafe.replace(/[<>&'"]/g, function (c) {
      switch (c) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case '\'': return '&apos;';
        case '"': return '&quot;';
      }
    });
  }

  function fixXmlPaths(xmlText, optsOrVideoPath, audioPathOrName, vName, aName, tempWavName) {
    var vPath = "";
    var aPath = "";
    var videoFileName = "";
    var audioFileName = "";
    var twName = tempWavName || "";

    if (typeof optsOrVideoPath === "object" && optsOrVideoPath !== null) {
      vPath = optsOrVideoPath.videoPath || optsOrVideoPath.mediaPath || "";
      aPath = optsOrVideoPath.audioPath || optsOrVideoPath.mediaPath || "";
      videoFileName = optsOrVideoPath.videoName || (vPath ? vPath.split(/[\\/]/).pop() : "");
      audioFileName = optsOrVideoPath.audioName || (aPath ? aPath.split(/[\\/]/).pop() : "");
      twName = optsOrVideoPath.tempWavName || "";
    } else {
      vPath = optsOrVideoPath || "";
      if (audioPathOrName && (audioPathOrName.indexOf("/") !== -1 || audioPathOrName.indexOf("\\") !== -1)) {
        aPath = audioPathOrName;
        videoFileName = vName || (vPath ? vPath.split(/[\\/]/).pop() : "");
        audioFileName = aName || (aPath ? aPath.split(/[\\/]/).pop() : "");
      } else {
        aPath = vPath;
        videoFileName = audioPathOrName || (vPath ? vPath.split(/[\\/]/).pop() : "");
        audioFileName = videoFileName;
        twName = vName || "";
      }
    }

    if (!vPath && !aPath) return xmlText;
    var vUrl = pathToUrl(vPath || aPath);
    var aUrl = pathToUrl(aPath || vPath);
    var vFinalName = videoFileName || (vPath ? vPath.split(/[\\/]/).pop() : "");
    var aFinalName = audioFileName || (aPath ? aPath.split(/[\\/]/).pop() : "");

    var hasFile2 = xmlText.indexOf('id="file-2"') !== -1;

    if (hasFile2) {
      // file-1 = video
      xmlText = xmlText.replace(/(<file id="file-1">[\s\S]*?<\/file>)/, function (m) {
        var res = m.replace(/<pathurl>[\s\S]*?<\/pathurl>/, function () { return '<pathurl>' + escapeXml(vUrl) + '</pathurl>'; });
        res = res.replace(/<name>[\s\S]*?<\/name>/, function () { return '<name>' + escapeXml(vFinalName) + '</name>'; });
        return res;
      });
      // file-2 = audio
      xmlText = xmlText.replace(/(<file id="file-2">[\s\S]*?<\/file>)/, function (m) {
        var res = m.replace(/<pathurl>[\s\S]*?<\/pathurl>/, function () { return '<pathurl>' + escapeXml(aUrl) + '</pathurl>'; });
        res = res.replace(/<name>[\s\S]*?<\/name>/, function () { return '<name>' + escapeXml(aFinalName) + '</name>'; });
        return res;
      });
    } else {
      // Tek dosya (hem video hem ses aynı dosya veya tek medya)
      var targetUrl = vUrl || aUrl;
      var targetName = vFinalName || aFinalName;
      xmlText = xmlText.replace(/<pathurl>[\s\S]*?<\/pathurl>/g, function () {
        return '<pathurl>' + escapeXml(targetUrl) + '</pathurl>';
      });
      if (twName) {
        var tempWavNameEscaped = twName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        var re = new RegExp('<name>' + tempWavNameEscaped + '</name>', 'g');
        xmlText = xmlText.replace(re, function () {
          return '<name>' + escapeXml(targetName) + '</name>';
        });
      }
    }
    return xmlText;
  }

  function importAndPlaceXml(job, clipInfo) {
    if (!job || !job.xml_url) return;
    var info = clipInfo || lastClipInfo || {};
    var baseName = info.itemName
      ? info.itemName.replace(/\.[^.]+$/, "")
      : (info.videoName ? info.videoName.replace(/\.[^.]+$/, "") : "subtitle");
      
    fcFetch(job.xml_url)
      .then(function (rx) { return rx.text(); })
      .then(function (xmlText) {
        var localVideoPath = info.videoPath || info.mediaPath;
        var localAudioPath = info.audioPath || info.mediaPath;
        var localVideoName = info.videoName || (localVideoPath ? localVideoPath.split(/[\\/]/).pop() : "");
        var localAudioName = info.audioName || (localAudioPath ? localAudioPath.split(/[\\/]/).pop() : "");
        
        // Sunucu gecici ses dosya ismi: job.id + "_" + (job.filename || "")
        var tempWavName = job.id + "_" + (job.filename || "");

        xmlText = fixXmlPaths(xmlText, {
          videoPath: localVideoPath,
          audioPath: localAudioPath,
          videoName: localVideoName,
          audioName: localAudioName,
          tempWavName: tempWavName
        });

        var localXml = saveXmlLocal(xmlText, baseName);
        if (localXml) {
          evalJSX('importXml("' + encodeURIComponent(localXml) + '")')
            .then(function (rXML) {
              console.log("[CEP] importXml result:", rXML);
              showToast("✓ Auto-Cut sekansı açıldı!");
            })
            .catch(function (eXml) {
              console.error("[CEP] XML import error:", eXml);
            });
        }
      })
      .catch(function (exXML) {
        console.error("[CEP] XML download/import error:", exXML);
      });
  }

  // ===== Generate =====
  generateBtn.addEventListener("click", function () {
    console.log("[CEP] generateBtn clicked");
    generateBtn.disabled = true;
    jobError.classList.add("hidden");

    // UI'ya hemen bir job kartı göster (kullanıcı tepki gördüğünden emin olsun)
    showJob("İşleniyor…");
    jobStage.textContent = "Klip ve sunucu kontrol ediliyor…";

    // ÖNCE klip selection'ı taze al
    evalJSX("getSelectedClipInfo()")
      .catch(function (e) {
        console.warn("[CEP] getSelectedClipInfo failed:", e);
        return null;
      })
      .then(function (info) {
        console.log("[CEP] getSelectedClipInfo:", info);
        if (info && info.ok) {
          lastClipInfo = info;
          if (lastClipInfo.mediaPath) lastClipInfo.mediaPath = decodeURIComponent(lastClipInfo.mediaPath);
          if (lastClipInfo.itemName) lastClipInfo.itemName = decodeURIComponent(lastClipInfo.itemName);
          if (lastClipInfo.seqName) lastClipInfo.seqName = decodeURIComponent(lastClipInfo.seqName);
          if (lastClipInfo.videoPath) lastClipInfo.videoPath = decodeURIComponent(lastClipInfo.videoPath);
          if (lastClipInfo.videoName) lastClipInfo.videoName = decodeURIComponent(lastClipInfo.videoName);
          if (lastClipInfo.audioPath) lastClipInfo.audioPath = decodeURIComponent(lastClipInfo.audioPath);
          if (lastClipInfo.audioName) lastClipInfo.audioName = decodeURIComponent(lastClipInfo.audioName);
          if (lastClipInfo.clips && lastClipInfo.clips.length) {
            for (var ci = 0; ci < lastClipInfo.clips.length; ci++) {
              var cci = lastClipInfo.clips[ci];
              if (cci.itemName) cci.itemName = decodeURIComponent(cci.itemName);
              if (cci.mediaPath) cci.mediaPath = decodeURIComponent(cci.mediaPath);
              if (cci.videoPath) cci.videoPath = decodeURIComponent(cci.videoPath);
              if (cci.videoName) cci.videoName = decodeURIComponent(cci.videoName);
              if (cci.audioPath) cci.audioPath = decodeURIComponent(cci.audioPath);
              if (cci.audioName) cci.audioName = decodeURIComponent(cci.audioName);
            }
          }
        }
        return checkHealth();
      })
      .then(function (ok) {
      console.log("[CEP] checkHealth ok:", ok);
      if (!ok) { failJob("Sunucu çalışmıyor. Panel'deki 'Sunucu Başlat' tuşuna bas."); generateBtn.disabled = false; return; }
      if (!lastClipInfo || !lastClipInfo.mediaPath) {
        failJob("Klip seçili değil.\n\nTimeline'da bir klibe (video veya ses) TIKLA, klip mavi vurgulanmalı. Sonra Altyazı Üret'e bas.");
        generateBtn.disabled = false;
        return;
      }

      // Output dir karari
      var outDir = null;
      var mode = outputDirMode.value;
      if (mode === "project") {
        if (projectDir) {
          outDir = projectDir;
        } else {
          // Proje kaydedilmemis → default
          console.warn("[CEP] Proje kaydedilmemis, default output kullaniliyor");
        }
      } else if (mode === "custom") {
        if (customDirInput.value && customDirInput.value.trim()) {
          outDir = customDirInput.value.trim();
        }
      }

      var lang = languageSel.value === "auto" ? null : languageSel.value;

      // ===== ÇOKLU KLİP (BATCH PROCESSING) KONTROLÜ =====
      var isBatch = lastClipInfo.clips && lastClipInfo.clips.length > 1;

      if (isBatch) {
        var batchClips = lastClipInfo.clips;
        var totalClips = batchClips.length;
        var batchErrors = [];
        console.log("[CEP] BATCH PROCESSING START: " + totalClips + " clips");
        showJob(totalClips + " klip");

        function processBatchIndex(idx) {
          if (idx >= totalClips) {
            generateBtn.disabled = false;
            jobBox.classList.remove("hidden");
            if (bar && bar.parentElement) bar.parentElement.classList.remove("indet");
            var errCount = batchErrors.length;
            var successCount = totalClips - errCount;

            if (errCount === 0) {
              updateJobUI({ status: "done", stage: "Tüm klipler tamamlandı (" + totalClips + "/" + totalClips + ")", progress: 1.0 });
              jobStatus.textContent = "Tamamlandı";
              jobStatus.className = "badge done";
              showToast("✓ " + totalClips + " klip altyazısı başarıyla oluşturuldu");
            } else {
              var summary = totalClips + " klipten " + successCount + " tanesi tamamlandı, " + errCount + " tanesi hata aldı.";
              jobStatus.textContent = successCount === 0 ? "Hata" : "Kısmen Tamamlandı";
              jobStatus.className = successCount === 0 ? "badge error" : "badge warn";
              jobStage.textContent = summary;
              var errorDetails = summary + "\n\n" + batchErrors.map(function (e) {
                return "• " + e.clip + ": " + e.error;
              }).join("\n");
              jobError.textContent = errorDetails;
              jobError.classList.remove("hidden");
              showToast((successCount === 0 ? "✗ " : "⚠ ") + summary);
            }
            return;
          }

          var curClip = batchClips[idx];
          var clipName = curClip.itemName || ("Klip " + (idx + 1));
          var clipPrefix = "İşleniyor (Klip " + (idx + 1) + "/" + totalClips + ": " + clipName + ")";
          jobStage.textContent = clipPrefix + "…";
          jobName.textContent = clipName;

          function handleBatchError(errText) {
            console.error("[CEP] " + clipPrefix + " HATA:", errText);
            batchErrors.push({ clip: clipName, error: errText });
            processBatchIndex(idx + 1);
          }

          if (isRemoteMode()) {
            var bMedia = curClip.audioPath || curClip.mediaPath;
            var bIn = (curClip.hasAudio && curClip.audioIn !== undefined) ? curClip.audioIn : (curClip.inPoint || 0);
            var bOut = (curClip.hasAudio && curClip.audioOut !== undefined) ? curClip.audioOut : (curClip.outPoint || 0);

            extractWav(bMedia, bIn, bOut, function (errW, wavPath) {
              if (errW) {
                handleBatchError("FFmpeg: " + (errW.message || errW));
                return;
              }
              uploadAndTranscribe(wavPath, lang, currentMaxChars, function (stage, j) {
                jobStage.textContent = clipPrefix + " · " + stage;
                if (j) updateJobUI(j);
              }, function (srtText, finalJob, errU) {
                if (errU || !srtText) {
                  handleBatchError("Sunucu: " + (errU ? (errU.message || errU) : "SRT boş döndü"));
                  return;
                }
                var baseName = curClip.itemName ? curClip.itemName.replace(/\.[^.]+$/, "") : ("clip_" + (idx + 1));
                var localSrt = saveSrtLocal(srtText, baseName);
                if (!localSrt) {
                  handleBatchError("SRT lokale kaydedilemedi");
                  return;
                }
                if (autoPlaceChk.checked) {
                  placeOnTimeline({ srt_path_abs: localSrt }, "explicit", curClip.startTime);
                }
                if (autoCutChk.checked && finalJob) {
                  importAndPlaceXml(finalJob, curClip);
                }
                processBatchIndex(idx + 1);
              }, bIn, curClip);
            });
          } else {
            // Local Mode
            var batchPayload = {
              media_path: curClip.audioPath || curClip.mediaPath,
              video_path: curClip.videoPath || null,
              audio_path: curClip.audioPath || null,
              in_point: (curClip.hasAudio && curClip.audioIn !== undefined) ? curClip.audioIn : (curClip.inPoint || 0),
              out_point: (curClip.hasAudio && curClip.audioOut !== undefined) ? curClip.audioOut : (curClip.outPoint || 0),
              sequence_offset: curClip.startTime || 0,
              language: lang,
              max_words_per_line: 99,
              max_chars_per_line: currentMaxChars,
              output_dir: outDir,
              auto_cut: autoCutChk.checked,
              silence_threshold: parseFloat(silenceThresholdInput.value) || 0.4,
              fps: lastClipInfo.seqFps || 30.0,
              width: lastClipInfo.seqWidth || 1920,
              height: lastClipInfo.seqHeight || 1080
            };
            fcFetch("/api/clip", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(batchPayload)
            }).then(function (r) {
              if (!r.ok) return r.text().then(function (t) { throw new Error("Sunucu " + r.status + ": " + t); });
              return r.json();
            }).then(function (job) {
              pollJobWithCb(job.id, function (stage, j) {
                jobStage.textContent = clipPrefix + " · " + stage;
                if (j) updateJobUI(j);
              }, function (errP, finalJob) {
                if (errP) {
                  handleBatchError("İşlem: " + (errP.message || errP));
                  return;
                }
                if (autoPlaceChk.checked && finalJob) {
                  placeOnTimeline(finalJob, "explicit", curClip.startTime);
                }
                if (autoCutChk.checked && finalJob) {
                  importAndPlaceXml(finalJob, curClip);
                }
                processBatchIndex(idx + 1);
              });
            }).catch(function (e) {
              handleBatchError("İstek hatası: " + (e.message || String(e)));
            });
          }
        }

        processBatchIndex(0);
        return;
      }

      // ===== TEK KLİP AKIŞI (ORİJİNAL AKIŞ KORUNUR) =====
      showJob(lastClipInfo.videoPath || lastClipInfo.mediaPath);

      // ===== REMOTE MODE: WAV ekstrakt + upload + poll + SRT indir =====
      if (isRemoteMode()) {
        console.log("[CEP] REMOTE MODE: " + API);
        jobStage.textContent = "Ses cikariliyor (FFmpeg)…";
        var sAudio = lastClipInfo.audioPath || lastClipInfo.mediaPath;
        var sIn = (lastClipInfo.hasAudio && lastClipInfo.audioIn !== undefined) ? lastClipInfo.audioIn : (lastClipInfo.inPoint || 0);
        var sOut = (lastClipInfo.hasAudio && lastClipInfo.audioOut !== undefined) ? lastClipInfo.audioOut : (lastClipInfo.outPoint || 0);

        extractWav(sAudio, sIn, sOut, function (errW, wavPath) {
          if (errW) {
            var isMac = typeof process !== "undefined" && process.platform === "darwin";
            var installHelp = isMac 
              ? "FFmpeg bulunamadi. Terminal'den 'brew install ffmpeg' ile kurabilirsin." 
              : "FFmpeg PATH'te olmali. 'winget install ffmpeg' ile kurabilirsin.";
            failJob("FFmpeg hata: " + errW.message + "\n\n" + installHelp);
            generateBtn.disabled = false;
            return;
          }
          console.log("[CEP] WAV ready:", wavPath);
          uploadAndTranscribe(wavPath, lang, currentMaxChars, function (stage, j) {
            jobStage.textContent = stage;
            if (j) updateJobUI(j);
          }, function (srtText, finalJob, errU) {
            if (errU || !srtText) {
              failJob("Sunucu hata: " + (errU ? errU.message : "SRT bos"));
              generateBtn.disabled = false;
              return;
            }
            // SRT'i lokale yaz
            var baseName = lastClipInfo.itemName
              ? lastClipInfo.itemName.replace(/\.[^.]+$/, "")
              : "subtitle";
            var localSrt = saveSrtLocal(srtText, baseName);
            if (!localSrt) {
              failJob("SRT lokale kaydedilemedi.");
              generateBtn.disabled = false;
              return;
            }
            // pollJob ile uyumlu son durumu UI'a yansit
            updateJobUI({ status: "done", stage: "Tamamlandi", progress: 1.0 });
            jobBox.classList.remove("hidden");
            jobStatus.textContent = "Tamamlandı";
            jobStatus.className = "badge done";
            // Timeline'a yerlestir
            if (autoPlaceChk.checked) placeOnTimeline({ srt_path_abs: localSrt });

            // XML'i indir ve yerleştir (Remote Mode)
            if (autoCutChk.checked) importAndPlaceXml(finalJob, lastClipInfo);
            generateBtn.disabled = false;
          }, sIn, lastClipInfo);
        });
        return;
      }

      // ===== LOCAL MODE: eski /api/clip yolu =====
      var payload = {
        media_path: lastClipInfo.audioPath || lastClipInfo.mediaPath,
        video_path: lastClipInfo.videoPath || null,
        audio_path: lastClipInfo.audioPath || null,
        in_point: (lastClipInfo.hasAudio && lastClipInfo.audioIn !== undefined) ? lastClipInfo.audioIn : (lastClipInfo.inPoint || 0),
        out_point: (lastClipInfo.hasAudio && lastClipInfo.audioOut !== undefined) ? lastClipInfo.audioOut : (lastClipInfo.outPoint || 0),
        sequence_offset: lastClipInfo.startTime || 0,
        language: lang,
        max_words_per_line: 99,
        max_chars_per_line: currentMaxChars,
        output_dir: outDir,
        auto_cut: autoCutChk.checked,
        silence_threshold: parseFloat(silenceThresholdInput.value) || 0.4,
        fps: lastClipInfo.seqFps || 30.0,
        width: lastClipInfo.seqWidth || 1920,
        height: lastClipInfo.seqHeight || 1080
      };

      console.log("[CEP] LOCAL payload:", payload);
      jobStage.textContent = "Sunucuya gönderiliyor…";
      fcFetch("/api/clip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }).then(function (r) {
        console.log("[CEP] /api/clip response:", r.status);
        if (!r.ok) return r.text().then(function (t) { throw new Error("Sunucu " + r.status + ": " + t); });
        return r.json();
      }).then(function (job) {
        console.log("[CEP] job started:", job);
        showJob(payload.video_path || payload.media_path);
        pollJob(job.id);
      }).catch(function (e) {
        console.error("[CEP] fetch error:", e);
        failJob(e.message || String(e));
        generateBtn.disabled = false;
      });
    })
    .catch(function (e) {
      // En dış catch — promise chain'de takılma olursa
      console.error("[CEP] generate chain error:", e);
      failJob("Beklenmedik hata: " + (e.message || e));
      generateBtn.disabled = false;
    });
  });

  function showJob(path) {
    jobBox.classList.remove("hidden");
    jobName.textContent = path.split(/[\\/]/).pop();
    jobStatus.textContent = "Sırada";
    jobStatus.className = "badge";
    jobStage.textContent = "Hazırlanıyor";
    bar.style.width = "0%";
    bar.parentElement.classList.add("indet");
    jobError.classList.add("hidden");
    jobError.removeAttribute("style"); // varsa eski success style temizle
  }

  function failJob(msg) {
    jobBox.classList.remove("hidden");
    jobStatus.textContent = "Hata";
    jobStatus.className = "badge error";
    jobError.textContent = msg;
    jobError.classList.remove("hidden");
    bar.parentElement.classList.remove("indet");
  }

  function pollJob(jobId) {
    var done = false;
    function tick() {
      if (done) return;
      fcFetch("/api/job/" + jobId, { cache: "no-store" })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          updateJobUI(j);
          if (j.status === "done") {
            done = true;
            if (autoPlaceChk.checked) placeOnTimeline(j);
            if (autoCutChk.checked) importAndPlaceXml(j, lastClipInfo);
            generateBtn.disabled = false;
          } else if (j.status === "error") {
            done = true; failJob(j.error || "Bilinmeyen hata"); generateBtn.disabled = false;
          } else { setTimeout(tick, 600); }
        }).catch(function (e) {
          done = true; failJob(e.message); generateBtn.disabled = false;
        });
    }
    tick();
  }

  function updateJobUI(j) {
    jobStatus.className = "badge";
    var label = "İşleniyor";
    if (j.status === "queued") label = "Sırada";
    else if (j.status === "done") { label = "Tamamlandı"; jobStatus.classList.add("done"); }
    else if (j.status === "error") { label = "Hata"; jobStatus.classList.add("error"); }
    jobStatus.textContent = label;
    jobStage.textContent = j.stage || "—";
    var pct = Math.round((j.progress || 0) * 100);
    if (pct > 3) bar.parentElement.classList.remove("indet");
    bar.style.width = pct + "%";
  }

  function pollJobWithCb(jobId, onStage, onDone) {
    var done = false;
    function tick() {
      if (done) return;
      fcFetch("/api/job/" + jobId, { cache: "no-store" })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (onStage) onStage(j.stage || "isleniyor", j);
          else updateJobUI(j);
          if (j.status === "done") {
            done = true;
            onDone(null, j);
          } else if (j.status === "error") {
            done = true;
            onDone(new Error(j.error || "Bilinmeyen hata"), j);
          } else {
            setTimeout(tick, 600);
          }
        }).catch(function (e) {
          done = true;
          onDone(e, null);
        });
    }
    tick();
  }

  function placeOnTimeline(job, placementMode, explicitSeconds) {
    var srtPath = (typeof job === "string") ? job : (job ? job.srt_path_abs : null);
    if (!srtPath) { failJob("SRT yolu yok"); return Promise.resolve(null); }
    // Tab 2'ye son uretilen SRT yolunu + clibin sekanstaki konumunu bildir
    try {
      window.FC_LAST_SRT_PATH = srtPath;
      // Clibin sekanstaki baslangic saati (PNG sequence import konumu)
      var seqStart = (typeof explicitSeconds === "number")
        ? explicitSeconds
        : ((lastClipInfo && lastClipInfo.startTime) ? lastClipInfo.startTime : 0);
      window.FC_LAST_CLIP_SEQ_START = seqStart;
    } catch (e) {}

    var mode = placementMode || currentPlacement;
    var expSec = (typeof explicitSeconds === "number") ? explicitSeconds : 0;
    var jsxCall = 'importAndPlaceSubtitle("' + encodeURIComponent(srtPath) + '", "' + mode + '", ' + expSec + ')';

    return evalJSX(jsxCall).then(function (r) {
      console.log("[CEP] importAndPlace result:", r);
      if (r && r.ok) {
        jobStage.textContent = "✓ Yerleştirildi · " + (r.method || "");
        jobError.classList.add("hidden");
      } else {
        var msg = "";
        if (r && r.noCaptionTrack) {
          msg = "Caption track oluşturulamadı.\n\nBin'deki " + (r.itemName || "SRT") +
                " dosyasını timeline'a sürükle — Premiere otomatik caption track yapar.";
        } else {
          msg = "Bin'e eklendi, timeline insert başarısız.";
          if (r && r.errors && r.errors.length) {
            msg += "\n\nHata:\n" + r.errors.slice(0, 3).join("\n");
          }
        }
        jobError.textContent = msg;
        jobError.classList.remove("hidden");
        if (r && r.log) console.log("[CEP] JSX log:\n" + r.log.join("\n"));
      }
      return r;
    }).catch(function (e) {
      jobError.textContent = "ExtendScript hata: " + e.message;
      jobError.classList.remove("hidden");
      return null;
    });
  }

  // ===== Toast =====
  function showToast(msg, isErr) {
    var t = document.createElement("div");
    t.textContent = msg;
    Object.assign(t.style, {
      position: "fixed", bottom: "20px", left: "50%",
      transform: "translateX(-50%)",
      background: isErr ? "rgba(239,68,68,0.95)" : "rgba(34,197,94,0.95)",
      color: "#fff", padding: "9px 14px", borderRadius: "9px",
      fontSize: "11.5px", fontWeight: "600", zIndex: "2000",
      boxShadow: "0 12px 32px rgba(0,0,0,0.5)"
    });
    document.body.appendChild(t);
    setTimeout(function () {
      t.style.opacity = "0"; t.style.transition = "opacity 0.3s";
      setTimeout(function () { t.remove(); }, 300);
    }, 2400);
  }
})();
