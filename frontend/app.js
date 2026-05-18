// FreeCaption - frontend logic
const $ = (sel) => document.querySelector(sel);
const fileInput = $("#fileInput");
const dropzone = $("#dropzone");
const browseBtn = $("#browseBtn");
const languageSel = $("#language");
const jobsEl = $("#jobs");
const jobsSection = $("#jobsSection");
const healthEl = $("#health");
const openOutputBtn = $("#openOutput");

const activeStreams = new Map();
const renderedJobs = new Map();

// --- Health check ---
async function checkHealth() {
  try {
    const r = await fetch("/api/health");
    const j = await r.json();
    const gpu = j.gpu ? `GPU: ${j.gpu_name || "var"}` : "CPU modu";
    healthEl.innerHTML = `<span class="status-dot ok"></span><span>${gpu}</span>`;
  } catch {
    healthEl.innerHTML = `<span class="status-dot err"></span><span>Sunucuya ulaşılamıyor</span>`;
  }
}
checkHealth();

// --- File picker & drag&drop ---
browseBtn.addEventListener("click", (e) => { e.stopPropagation(); fileInput.click(); });
dropzone.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", (e) => {
  const files = Array.from(e.target.files || []);
  files.forEach(uploadFile);
  fileInput.value = "";
});

["dragenter", "dragover"].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault(); e.stopPropagation();
    dropzone.classList.add("is-drag");
  })
);
["dragleave", "drop"].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault(); e.stopPropagation();
    if (ev === "dragleave" && e.target !== dropzone) return;
    dropzone.classList.remove("is-drag");
  })
);
dropzone.addEventListener("drop", (e) => {
  const files = Array.from(e.dataTransfer?.files || []);
  files.forEach(uploadFile);
});

openOutputBtn?.addEventListener("click", async () => {
  try { await fetch("/api/open-output"); } catch {}
});

// --- Upload ---
async function uploadFile(file) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("language", languageSel.value || "auto");

  const tempId = "tmp-" + Math.random().toString(36).slice(2, 8);
  const tempJob = {
    id: tempId,
    filename: file.name,
    status: "uploading",
    stage: "Yükleniyor",
    progress: 0,
  };
  renderJob(tempJob, true);
  jobsSection.classList.remove("hidden");

  try {
    const r = await fetch("/api/upload", { method: "POST", body: fd });
    if (!r.ok) throw new Error("Yükleme hatası");
    const job = await r.json();
    removeJobCard(tempId);
    renderJob(job);
    streamJob(job.id);
  } catch (err) {
    const card = renderedJobs.get(tempId);
    if (card) {
      card.querySelector(".job-status").textContent = "Hata";
      card.querySelector(".job-status").classList.add("error");
      card.querySelector(".job-meta").textContent = err.message;
    }
  }
}

// --- SSE progress ---
function streamJob(jobId) {
  if (activeStreams.has(jobId)) return;
  const es = new EventSource(`/api/stream/${jobId}`);
  activeStreams.set(jobId, es);
  es.onmessage = (ev) => {
    try {
      const j = JSON.parse(ev.data);
      if (j.error) { es.close(); activeStreams.delete(jobId); return; }
      renderJob(j);
      if (j.status === "done" || j.status === "error") {
        es.close(); activeStreams.delete(jobId);
      }
    } catch {}
  };
  es.onerror = () => { es.close(); activeStreams.delete(jobId); };
}

// --- Render ---
function renderJob(job, isTemp = false) {
  let card = renderedJobs.get(job.id);
  if (!card) {
    card = document.createElement("div");
    card.className = "job";
    card.dataset.id = job.id;
    jobsEl.prepend(card);
    renderedJobs.set(job.id, card);
  }

  const statusClass = job.status === "done" ? "done" : job.status === "error" ? "error" : "";
  const statusText = (() => {
    switch (job.status) {
      case "queued": return "Sırada";
      case "uploading": return "Yükleniyor";
      case "running": return job.stage || "İşleniyor";
      case "done": return "Tamamlandı";
      case "error": return "Hata";
      default: return job.status || "...";
    }
  })();

  const pct = Math.round((job.progress || 0) * 100);
  const indet = job.status === "uploading" || (job.status === "running" && pct < 5);
  const elapsed = job.elapsed ? `${job.elapsed}s` : "";
  const lang = job.detected_language ? ` · ${job.detected_language.toUpperCase()}` : "";
  const dur = job.duration ? ` · ${formatDuration(job.duration)}` : "";

  card.innerHTML = `
    <div class="job-row">
      <div class="min-w-0 flex-1">
        <div class="job-name truncate">${escapeHtml(job.filename || "(dosya)")}</div>
        <div class="job-meta">${escapeHtml(job.stage || "")} ${lang}${dur} ${elapsed ? " · " + elapsed : ""}</div>
      </div>
      <div class="job-status ${statusClass}">${escapeHtml(statusText)}</div>
    </div>
    <div class="bar ${indet ? "indeterminate" : ""}">
      <div class="bar-fill" style="width:${indet ? 0 : pct}%"></div>
    </div>
    ${job.status === "done" ? `
      <div class="actions">
        <a class="btn primary" href="${job.srt_url}" download>⬇️ SRT indir</a>
        <a class="btn" href="${job.txt_url}" download>📄 TXT indir</a>
        <button class="btn" data-copy="${job.srt_url}">📋 Yolu kopyala</button>
      </div>
    ` : job.status === "error" ? `
      <div class="job-meta" style="color:#fca5a5;margin-top:8px">${escapeHtml(job.error || "")}</div>
    ` : ""}
  `;

  card.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(window.location.origin + btn.dataset.copy);
        btn.textContent = "✓ Kopyalandı";
        setTimeout(() => (btn.textContent = "📋 Yolu kopyala"), 1500);
      } catch {}
    });
  });
}

function removeJobCard(id) {
  const card = renderedJobs.get(id);
  if (card) { card.remove(); renderedJobs.delete(id); }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[m]));
}

function formatDuration(sec) {
  if (!sec) return "";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
