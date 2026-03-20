// ============================================================
//  dashboard.js
//  PainPoint Tracker – Admin Analytics Dashboard
//  Used by: dashboard.html
//  Requires: Chart.js CDN already loaded in HTML
// ============================================================

import { db } from "./firebase-config.js";
import {
  collection, getDocs, doc, updateDoc, deleteDoc,
  query, orderBy, limit, where, startAfter,
  getDoc, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ─── Constants ───────────────────────────────────────────────

const ISSUES_COL  = "issues";
const PAGE_SIZE   = 10;

// ─── State ───────────────────────────────────────────────────

let allIssues      = [];    // cached for client-side search/filter
let filteredIssues = [];
let currentPage    = 1;
let tableSearch    = "";
let tableStatus    = "all";

// ─── Entry point ─────────────────────────────────────────────

window.addEventListener("DOMContentLoaded", () => {
  waitForAuth();
});

function waitForAuth() {
  // auth.js sets window.currentUser via onAuthStateChanged.
  // Poll until it resolves (max ~3s), then verify admin.
  let attempts = 0;
  const check = setInterval(() => {
    attempts++;
    if (window.currentUser !== undefined) {
      clearInterval(check);
      if (!window.currentUser || window.currentUserRole !== "admin") {
        window.location.href = "explore.html";
        return;
      }
      initDashboard();
    }
    if (attempts > 30) {
      clearInterval(check);
      window.location.href = "login.html";
    }
  }, 100);
}

async function initDashboard() {
  await loadAllIssues();
  renderStatCards();
  renderCharts();
  renderTable();
  bindSidebarNav();
  bindTableControls();
  bindQuickStatusModal();
  startRealtimeStatUpdates();
}

// ─── Load all issues ─────────────────────────────────────────

async function loadAllIssues() {
  const snap = await getDocs(
    query(collection(db, ISSUES_COL), orderBy("createdAt", "desc"))
  );
  allIssues = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  filteredIssues = [...allIssues];
}

// ─── Stat cards ──────────────────────────────────────────────

function renderStatCards() {
  const total    = allIssues.length;
  const pending  = allIssues.filter(i => i.status === "pending").length;
  const progress = allIssues.filter(i => i.status === "in-progress").length;
  const resolved = allIssues.filter(i => i.status === "resolved").length;
  const rate     = total > 0 ? Math.round((resolved / total) * 100) : 0;

  // Avg response time (days from createdAt to updatedAt for resolved issues)
  const resolvedIssues = allIssues.filter(i => i.status === "resolved" && i.createdAt && i.updatedAt);
  let avgDays = 0;
  if (resolvedIssues.length) {
    const totalMs = resolvedIssues.reduce((acc, i) => {
      return acc + (i.updatedAt.toMillis() - i.createdAt.toMillis());
    }, 0);
    avgDays = (totalMs / resolvedIssues.length / 86400000).toFixed(1);
  }

  animateCount("statTotal",          total);
  animateCount("statPending",        pending);
  animateCount("statProgress",       progress);
  animateCount("statResolved",       resolved);
  animateCount("statResolutionRate", rate, "%");
  document.getElementById("statAvgResponse").textContent = avgDays > 0 ? `${avgDays}d` : "—";
}

function animateCount(id, target, suffix = "") {
  const el = document.getElementById(id);
  if (!el) return;
  let current = 0;
  const step  = Math.ceil(target / 40);
  const timer = setInterval(() => {
    current = Math.min(current + step, target);
    el.textContent = current + suffix;
    if (current >= target) clearInterval(timer);
  }, 30);
}

// ─── Charts ──────────────────────────────────────────────────

function renderCharts() {
  renderIssuesOverTimeChart();
  renderCategoryDonutChart();
  renderStatusBarChart();
}

function chartDefaults() {
  return {
    color:       "#a0aec0",
    borderColor: "#1e2a3a",
    plugins: {
      legend: {
        labels: { color: "#a0aec0", font: { family: "DM Sans" } }
      },
      tooltip: {
        backgroundColor: "#0f1929",
        titleColor:      "#fff",
        bodyColor:       "#a0aec0",
        borderColor:     "#1e2a3a",
        borderWidth:     1,
      }
    }
  };
}

function renderIssuesOverTimeChart() {
  const ctx = document.getElementById("issuesOverTimeChart");
  if (!ctx || !window.Chart) return;

  // Group by day for last 14 days
  const now   = Date.now();
  const days  = 14;
  const buckets = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * 86400000);
    buckets[d.toLocaleDateString("en-IN", { month:"short", day:"numeric" })] = 0;
  }
  allIssues.forEach(issue => {
    if (!issue.createdAt) return;
    const d = new Date(issue.createdAt.toMillis());
    const key = d.toLocaleDateString("en-IN", { month:"short", day:"numeric" });
    if (key in buckets) buckets[key]++;
  });

  new Chart(ctx, {
    type: "line",
    data: {
      labels:   Object.keys(buckets),
      datasets: [{
        label:           "Issues Submitted",
        data:            Object.values(buckets),
        borderColor:     "#00c9a7",
        backgroundColor: "rgba(0,201,167,0.1)",
        pointBackgroundColor: "#00c9a7",
        tension:         0.4,
        fill:            true,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { ticks: { color: "#a0aec0" }, grid: { color: "#1e2a3a" } },
        y: { ticks: { color: "#a0aec0", stepSize: 1 }, grid: { color: "#1e2a3a" }, beginAtZero: true },
      },
      ...chartDefaults(),
    }
  });
}

function renderCategoryDonutChart() {
  const ctx = document.getElementById("categoryDonutChart");
  if (!ctx || !window.Chart) return;

  const catMap = {};
  allIssues.forEach(i => {
    const c = i.category || "Other";
    catMap[c] = (catMap[c] || 0) + 1;
  });

  new Chart(ctx, {
    type: "doughnut",
    data: {
      labels:   Object.keys(catMap),
      datasets: [{
        data:            Object.values(catMap),
        backgroundColor: ["#00c9a7","#6366f1","#f59e0b","#f43f5e","#38bdf8"],
        borderColor:     "#0a0f1e",
        borderWidth:     3,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "65%",
      ...chartDefaults(),
    }
  });
}

function renderStatusBarChart() {
  const ctx = document.getElementById("statusBarChart");
  if (!ctx || !window.Chart) return;

  const pending  = allIssues.filter(i => i.status === "pending").length;
  const progress = allIssues.filter(i => i.status === "in-progress").length;
  const resolved = allIssues.filter(i => i.status === "resolved").length;

  new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["Pending", "In Progress", "Resolved"],
      datasets: [{
        label:           "Issues",
        data:            [pending, progress, resolved],
        backgroundColor: ["#f59e0b", "#6366f1", "#00c9a7"],
        borderRadius:    6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { ticks: { color: "#a0aec0" }, grid: { display: false } },
        y: { ticks: { color: "#a0aec0", stepSize: 1 }, grid: { color: "#1e2a3a" }, beginAtZero: true },
      },
      ...chartDefaults(),
      plugins: { ...chartDefaults().plugins, legend: { display: false } },
    }
  });
}

// ─── Issues Table ─────────────────────────────────────────────

function renderTable() {
  applyTableFilters();
  renderTablePage();
  renderTopPainPoints();
}

function applyTableFilters() {
  filteredIssues = allIssues.filter(issue => {
    const matchSearch = !tableSearch ||
      `${issue.title} ${issue.category} ${issue.authorName}`.toLowerCase().includes(tableSearch);
    const matchStatus = tableStatus === "all" || issue.status === tableStatus;
    return matchSearch && matchStatus;
  });
  currentPage = 1;
}

function renderTablePage() {
  const tbody     = document.getElementById("issuesTableBody");
  const totalEl   = document.getElementById("tableTotal");
  const showingEl = document.getElementById("tableShowing");
  if (!tbody) return;

  const start = (currentPage - 1) * PAGE_SIZE;
  const end   = Math.min(start + PAGE_SIZE, filteredIssues.length);
  const page  = filteredIssues.slice(start, end);

  tbody.innerHTML = page.length === 0
    ? `<tr><td colspan="7" class="text-center text-muted py-4">No issues found</td></tr>`
    : page.map(issue => buildTableRow(issue)).join("");

  if (totalEl)   totalEl.textContent   = filteredIssues.length;
  if (showingEl) showingEl.textContent = `${start + 1}–${end}`;

  // Pagination buttons
  document.getElementById("prevPage").disabled = currentPage === 1;
  document.getElementById("nextPage").disabled = end >= filteredIssues.length;

  bindTableRowActions();
}

function buildTableRow(issue) {
  const date = issue.createdAt?.toDate?.()
    .toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" }) || "—";
  const statusClass = {
    "pending":     "badge-status badge-pending",
    "in-progress": "badge-status badge-progress",
    "resolved":    "badge-status badge-resolved",
  }[issue.status] || "badge-status badge-pending";

  return `
    <tr>
      <td><span class="text-muted small">${issue.id.substring(0, 8).toUpperCase()}</span></td>
      <td>
        <a href="issue-details.html?id=${issue.id}" class="text-white text-decoration-none fw-medium small">
          ${escapeHtml(issue.title?.substring(0, 60) || "—")}${issue.title?.length > 60 ? "…" : ""}
        </a>
      </td>
      <td><span class="badge-category cat-${(issue.category||"ux").toLowerCase()}">${issue.category || "—"}</span></td>
      <td><span class="${statusClass}">${issue.status || "Pending"}</span></td>
      <td><span class="text-muted small">${escapeHtml(issue.authorName || "—")}</span></td>
      <td><span class="text-muted small">${date}</span></td>
      <td>
        <div class="d-flex gap-1">
          <a href="issue-details.html?id=${issue.id}" class="btn-icon" title="View">
            <i class="bi bi-eye" style="font-size:.8rem"></i>
          </a>
          <button class="btn-icon quick-status-btn"
                  data-id="${issue.id}"
                  data-status="${issue.status}"
                  title="Quick edit status">
            <i class="bi bi-pencil" style="font-size:.8rem"></i>
          </button>
          <button class="btn-icon delete-issue-btn"
                  data-id="${issue.id}"
                  title="Delete">
            <i class="bi bi-trash3" style="font-size:.8rem;color:#f43f5e"></i>
          </button>
        </div>
      </td>
    </tr>`;
}

function bindTableRowActions() {
  // Quick status edit
  document.querySelectorAll(".quick-status-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.getElementById("modalIssueId").textContent  = btn.dataset.id.substring(0, 8).toUpperCase();
      document.getElementById("modalStatusSelect").value   = btn.dataset.status || "pending";
      document.getElementById("quickStatusModal")._issueId = btn.dataset.id;
      const modal = new bootstrap.Modal(document.getElementById("quickStatusModal"));
      modal.show();
    });
  });

  // Delete
  document.querySelectorAll(".delete-issue-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this issue permanently? This cannot be undone.")) return;
      try {
        await deleteDoc(doc(db, ISSUES_COL, btn.dataset.id));
        allIssues = allIssues.filter(i => i.id !== btn.dataset.id);
        applyTableFilters();
        renderTablePage();
        renderStatCards();
        showToast("Issue deleted.", "danger");
      } catch (err) {
        console.error(err);
        showToast("Failed to delete.", "danger");
      }
    });
  });
}

function renderTopPainPoints() {
  const container = document.getElementById("topPainPoints");
  if (!container) return;
  const sorted = [...allIssues].sort((a, b) => (b.upvotes || 0) - (a.upvotes || 0)).slice(0, 5);
  const max    = sorted[0]?.upvotes || 1;
  container.innerHTML = sorted.map((issue, i) => `
    <div class="pain-point-item d-flex align-items-center gap-3 mb-3">
      <span class="fw-bold text-muted" style="width:1.2rem">${i + 1}</span>
      <div class="flex-grow-1">
        <div class="d-flex justify-content-between mb-1">
          <span class="small text-white">${escapeHtml(issue.title?.substring(0, 45) || "—")}${issue.title?.length > 45 ? "…" : ""}</span>
          <span class="small text-teal fw-semibold">${issue.upvotes || 0} votes</span>
        </div>
        <div class="progress" style="height:4px;background:#1e2a3a">
          <div class="progress-bar" style="width:${Math.round(((issue.upvotes||0)/max)*100)}%;background:#00c9a7"></div>
        </div>
      </div>
    </div>`).join("");
}

// ─── Table controls ──────────────────────────────────────────

function bindTableControls() {
  let searchTimer;
  document.getElementById("tableSearch")?.addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      tableSearch = e.target.value.trim().toLowerCase();
      applyTableFilters();
      renderTablePage();
    }, 300);
  });

  document.getElementById("tableStatusFilter")?.addEventListener("change", (e) => {
    tableStatus = e.target.value;
    applyTableFilters();
    renderTablePage();
  });

  document.getElementById("prevPage")?.addEventListener("click", () => {
    if (currentPage > 1) { currentPage--; renderTablePage(); }
  });
  document.getElementById("nextPage")?.addEventListener("click", () => {
    if (currentPage * PAGE_SIZE < filteredIssues.length) { currentPage++; renderTablePage(); }
  });

  document.getElementById("exportCsvBtn")?.addEventListener("click", exportCsv);
}

// ─── Quick status modal ──────────────────────────────────────

function bindQuickStatusModal() {
  document.getElementById("modalUpdateBtn")?.addEventListener("click", async () => {
    const modal   = document.getElementById("quickStatusModal");
    const issueId = modal._issueId;
    const status  = document.getElementById("modalStatusSelect").value;
    if (!issueId) return;
    try {
      await updateDoc(doc(db, ISSUES_COL, issueId), {
        status:    status,
        updatedAt: serverTimestamp(),
      });
      // Update local cache
      const idx = allIssues.findIndex(i => i.id === issueId);
      if (idx !== -1) allIssues[idx].status = status;
      applyTableFilters();
      renderTablePage();
      renderStatCards();
      bootstrap.Modal.getInstance(modal)?.hide();
      showToast(`Status updated to "${status}".`, "success");
    } catch (err) {
      console.error(err);
      showToast("Failed to update status.", "danger");
    }
  });

  document.getElementById("modalCancelBtn")?.addEventListener("click", () => {
    const modal = document.getElementById("quickStatusModal");
    bootstrap.Modal.getInstance(modal)?.hide();
  });
}

// ─── Sidebar section switching ───────────────────────────────

function bindSidebarNav() {
  document.querySelectorAll(".sidebar-nav-item[data-section]").forEach(item => {
    item.addEventListener("click", () => {
      document.querySelectorAll(".sidebar-nav-item").forEach(i => i.classList.remove("active"));
      item.classList.add("active");
      const target = item.dataset.section;
      document.querySelectorAll(".dashboard-section").forEach(sec => {
        sec.classList.toggle("d-none", sec.id !== target);
      });
    });
  });
}

// ─── Real-time stat updates ──────────────────────────────────

function startRealtimeStatUpdates() {
  // Listen to the issues collection for live count badges
  onSnapshot(collection(db, ISSUES_COL), (snap) => {
    allIssues = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    applyTableFilters();
    renderStatCards();
    // Note: charts are NOT re-rendered live to avoid flicker
    renderTopPainPoints();
  });
}

// ─── CSV Export ──────────────────────────────────────────────

function exportCsv() {
  const rows = [
    ["ID", "Title", "Category", "Status", "Severity", "Author", "Upvotes", "Comments", "Created At"],
    ...filteredIssues.map(issue => [
      issue.id,
      `"${(issue.title  || "").replace(/"/g, '""')}"`,
      issue.category || "",
      issue.status   || "",
      issue.severity || "",
      `"${(issue.authorName || "").replace(/"/g, '""')}"`,
      issue.upvotes  || 0,
      issue.commentsCount || 0,
      issue.createdAt?.toDate?.().toISOString() || "",
    ])
  ];
  const csv  = rows.map(r => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement("a"), {
    href:     url,
    download: `painpoint-tracker-export-${new Date().toISOString().split("T")[0]}.csv`
  });
  a.click();
  URL.revokeObjectURL(url);
  showToast("CSV exported successfully!", "success");
}

// ─── Toast helper ─────────────────────────────────────────────

function showToast(message, type = "success") {
  const container = document.getElementById("toastContainer");
  if (!container) return;
  const id   = `toast_${Date.now()}`;
  const icon = type === "success" ? "bi-check-circle-fill" : "bi-exclamation-circle-fill";
  const color= type === "success" ? "#00c9a7" : "#f43f5e";
  container.insertAdjacentHTML("beforeend", `
    <div id="${id}" class="toast align-items-center border-0 show mb-2"
         style="background:#0f1929;color:#fff;min-width:260px" role="alert">
      <div class="d-flex">
        <div class="toast-body d-flex align-items-center gap-2">
          <i class="bi ${icon}" style="color:${color}"></i>
          ${escapeHtml(message)}
        </div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto"
                data-bs-dismiss="toast" onclick="document.getElementById('${id}').remove()"></button>
      </div>
    </div>`);
  setTimeout(() => document.getElementById(id)?.remove(), 4000);
}

// ─── Utility ─────────────────────────────────────────────────

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str || "";
  return d.innerHTML;
}

window.showToast = showToast;
