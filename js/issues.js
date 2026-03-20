// ============================================================
//  issues.js
//  PainPoint Tracker – Issues CRUD, Feed, Filters, Upvoting
//  Used by: explore.html, submit.html, issue-details.html
// ============================================================

import { db, storage } from "./firebase-config.js";
import {
  collection, addDoc, getDoc, getDocs, updateDoc, deleteDoc,
  doc, query, where, orderBy, limit, startAfter,
  arrayUnion, arrayRemove, increment, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  ref, uploadBytesResumable, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

// ─── Constants ───────────────────────────────────────────────

const ISSUES_PER_PAGE = 9;
const ISSUES_COL      = "issues";

// ─── Shared state ────────────────────────────────────────────

let lastVisibleDoc   = null;
let currentFilter    = "all";
let currentSort      = "newest";
let currentStatus    = "all";
let currentSearch    = "";

// ─── Utility: build an issue card HTML ───────────────────────

function categoryColor(cat) {
  const map = {
    ux:        "cat-ux",
    billing:   "cat-billing",
    technical: "cat-technical",
    support:   "cat-support",
    delivery:  "cat-delivery",
  };
  return map[cat?.toLowerCase()] || "cat-ux";
}

function severityBadge(sev) {
  const map = {
    critical: "badge bg-danger",
    high:     "badge bg-warning text-dark",
    medium:   "badge bg-info text-dark",
    low:      "badge bg-secondary",
  };
  return map[sev?.toLowerCase()] || "badge bg-secondary";
}

function statusBadge(status) {
  const map = {
    pending:    "badge-status badge-pending",
    "in-progress": "badge-status badge-progress",
    resolved:   "badge-status badge-resolved",
  };
  return map[status] || "badge-status badge-pending";
}

function timeAgo(ts) {
  if (!ts) return "";
  const now  = Date.now();
  const then = ts.toMillis ? ts.toMillis() : ts;
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function buildIssueCard(issue, id) {
  const hasVoted = window.currentUser &&
    (issue.upvoters || []).includes(window.currentUser.uid);
  return `
    <div class="col-md-6 col-lg-4">
      <div class="issue-card" data-id="${id}">
        <div class="d-flex justify-content-between align-items-start mb-2">
          <span class="badge-category ${categoryColor(issue.category)}">${issue.category || "General"}</span>
          <span class="${statusBadge(issue.status)}">${issue.status || "Pending"}</span>
        </div>
        <h6 class="issue-title mb-2">
          <a href="issue-details.html?id=${id}" class="text-white text-decoration-none stretched-link">
            ${escapeHtml(issue.title)}
          </a>
        </h6>
        <p class="issue-excerpt text-muted small mb-3">
          ${escapeHtml((issue.description || "").substring(0, 120))}${issue.description?.length > 120 ? "…" : ""}
        </p>
        <div class="d-flex justify-content-between align-items-center">
          <div class="d-flex align-items-center gap-2">
            <button class="btn-icon upvote-btn ${hasVoted ? "voted" : ""}"
                    data-id="${id}" data-count="${issue.upvotes || 0}"
                    title="Upvote">
              <i class="bi bi-arrow-up"></i>
              <span class="vote-count">${issue.upvotes || 0}</span>
            </button>
            <span class="text-muted small"><i class="bi bi-chat me-1"></i>${issue.commentsCount || 0}</span>
          </div>
          <span class="text-muted small">${timeAgo(issue.createdAt)}</span>
        </div>
        <div class="mt-2">
          <span class="${severityBadge(issue.severity)}">${issue.severity || "Medium"}</span>
        </div>
      </div>
    </div>`;
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str || "";
  return d.innerHTML;
}

// ─── EXPLORE PAGE ────────────────────────────────────────────

const issuesFeed = document.getElementById("issuesFeed");
if (issuesFeed) {
  initExplorePage();
}

async function initExplorePage() {
  // Remove skeleton loaders
  setTimeout(() => {
    document.getElementById("skeletonCard1")?.remove();
    document.getElementById("skeletonCard2")?.remove();
    document.getElementById("skeletonCard3")?.remove();
  }, 800);

  await loadIssues(true);

  // Search
  const searchInput = document.getElementById("searchInput");
  let searchTimer;
  searchInput?.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      currentSearch = searchInput.value.trim().toLowerCase();
      loadIssues(true);
    }, 350);
  });

  // Category filter chips
  document.querySelectorAll(".filter-chip[data-filter]").forEach(chip => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".filter-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      currentFilter = chip.dataset.filter;
      loadIssues(true);
    });
  });

  // Status & sort dropdowns
  document.getElementById("statusFilter")?.addEventListener("change", (e) => {
    currentStatus = e.target.value;
    loadIssues(true);
  });
  document.getElementById("sortSelect")?.addEventListener("change", (e) => {
    currentSort = e.target.value;
    loadIssues(true);
  });

  // Grid / list toggle
  document.getElementById("viewGrid")?.addEventListener("click", () => {
    issuesFeed.classList.remove("list-view");
    document.getElementById("viewGrid").classList.add("active");
    document.getElementById("viewList").classList.remove("active");
  });
  document.getElementById("viewList")?.addEventListener("click", () => {
    issuesFeed.classList.add("list-view");
    document.getElementById("viewList").classList.add("active");
    document.getElementById("viewGrid").classList.remove("active");
  });

  // Load more
  document.getElementById("loadMoreBtn")?.addEventListener("click", () => loadIssues(false));
}

async function loadIssues(reset = false) {
  if (reset) {
    lastVisibleDoc = null;
    issuesFeed.innerHTML = `<div class="col-12 text-center py-5">
      <div class="spinner-border text-teal" role="status"></div>
    </div>`;
  }

  // Build Firestore query
  const constraints = [];
  if (currentFilter !== "all") constraints.push(where("category", "==", currentFilter));
  if (currentStatus !== "all") constraints.push(where("status",   "==", currentStatus));

  const sortField = currentSort === "popular" ? "upvotes" :
                    currentSort === "oldest"  ? "createdAt" : "createdAt";
  const sortDir   = currentSort === "oldest"  ? "asc" : "desc";

  constraints.push(orderBy(sortField, sortDir));
  constraints.push(limit(ISSUES_PER_PAGE));
  if (lastVisibleDoc) constraints.push(startAfter(lastVisibleDoc));

  const q    = query(collection(db, ISSUES_COL), ...constraints);
  const snap = await getDocs(q);

  if (reset) issuesFeed.innerHTML = "";

  if (snap.empty && reset) {
    document.getElementById("emptyState")?.classList.remove("d-none");
    document.getElementById("loadMoreBtn")?.classList.add("d-none");
    document.getElementById("issuesShownCount").textContent = "0";
    return;
  }

  document.getElementById("emptyState")?.classList.add("d-none");

  let shown = 0;
  snap.forEach(docSnap => {
    const issue = docSnap.data();
    if (currentSearch) {
      const text = `${issue.title} ${issue.description} ${issue.category}`.toLowerCase();
      if (!text.includes(currentSearch)) return;
    }
    issuesFeed.insertAdjacentHTML("beforeend", buildIssueCard(issue, docSnap.id));
    shown++;
  });

  lastVisibleDoc = snap.docs[snap.docs.length - 1];

  // Update count display
  const shownEl = document.getElementById("issuesShownCount");
  if (shownEl) shownEl.textContent = parseInt(shownEl.textContent || 0) + shown;

  // Hide load-more if fewer results than page size
  if (snap.docs.length < ISSUES_PER_PAGE) {
    document.getElementById("loadMoreBtn")?.classList.add("d-none");
  } else {
    document.getElementById("loadMoreBtn")?.classList.remove("d-none");
  }

  // Bind upvote buttons
  bindUpvoteButtons();
}

// ─── UPVOTING ────────────────────────────────────────────────

function bindUpvoteButtons() {
  document.querySelectorAll(".upvote-btn:not([data-bound])").forEach(btn => {
    btn.dataset.bound = "1";
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!window.currentUser) {
        window.location.href = "login.html";
        return;
      }
      const issueId  = btn.dataset.id;
      const uid      = window.currentUser.uid;
      const voted    = btn.classList.contains("voted");
      const countEl  = btn.querySelector(".vote-count");
      const issueRef = doc(db, ISSUES_COL, issueId);

      // Optimistic UI
      const delta = voted ? -1 : 1;
      btn.classList.toggle("voted", !voted);
      countEl.textContent = parseInt(countEl.textContent) + delta;

      try {
        await updateDoc(issueRef, {
          upvotes:   increment(delta),
          upvoters: voted ? arrayRemove(uid) : arrayUnion(uid),
        });
      } catch (err) {
        // Revert on failure
        btn.classList.toggle("voted", voted);
        countEl.textContent = parseInt(countEl.textContent) - delta;
        console.error("Upvote failed:", err);
      }
    });
  });
}

// ─── SUBMIT ISSUE PAGE ───────────────────────────────────────

const submitForm = document.getElementById("submitIssueForm");
if (submitForm) {
  initSubmitPage();
}

function initSubmitPage() {
  const uploadZone = document.getElementById("uploadZone");
  const imageInput = document.getElementById("issueImage");
  const preview    = document.getElementById("imagePreview");
  let   uploadedImageUrl = null;

  // Drag-and-drop
  uploadZone?.addEventListener("dragover", (e) => {
    e.preventDefault();
    uploadZone.classList.add("drag-over");
  });
  uploadZone?.addEventListener("dragleave", () => uploadZone.classList.remove("drag-over"));
  uploadZone?.addEventListener("drop", (e) => {
    e.preventDefault();
    uploadZone.classList.remove("drag-over");
    const file = e.dataTransfer.files[0];
    if (file) handleImageFile(file);
  });
  uploadZone?.addEventListener("click", () => imageInput?.click());
  imageInput?.addEventListener("change", () => {
    if (imageInput.files[0]) handleImageFile(imageInput.files[0]);
  });

  function handleImageFile(file) {
    if (!file.type.startsWith("image/")) {
      alert("Please select an image file."); return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert("Image must be under 5 MB."); return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      if (preview) {
        preview.src = e.target.result;
        preview.classList.remove("d-none");
      }
      document.getElementById("reviewAttachment").textContent = file.name;
    };
    reader.readAsDataURL(file);
    // Store file for upload on submit
    submitForm._pendingFile = file;
  }

  submitForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!window.currentUser) {
      window.location.href = "login.html?redirect=submit.html";
      return;
    }

    const submitBtn  = document.getElementById("submitBtn");
    const btnText    = submitBtn.querySelector(".btn-text")  || submitBtn;
    const btnLoading = submitBtn.querySelector(".btn-loading");
    submitBtn.disabled = true;
    if (btnLoading) btnLoading.classList.remove("d-none");
    if (btnText && btnText !== submitBtn) btnText.classList.add("d-none");

    try {
      // Upload image if present
      if (submitForm._pendingFile) {
        const storageRef = ref(storage, `issue-images/${Date.now()}_${submitForm._pendingFile.name}`);
        const uploadTask = uploadBytesResumable(storageRef, submitForm._pendingFile);
        await new Promise((res, rej) => {
          uploadTask.on("state_changed", null, rej, async () => {
            uploadedImageUrl = await getDownloadURL(uploadTask.snapshot.ref);
            res();
          });
        });
      }

      const issueData = {
        title:       document.getElementById("issueTitle").value.trim(),
        category:    document.getElementById("selectedCategory").value,
        description: document.getElementById("issueDescription").value.trim(),
        severity:    document.getElementById("issueSeverity").value,
        platform:    document.getElementById("issuePlatform")?.value || "",
        steps:       document.getElementById("issueSteps")?.value.trim() || "",
        imageUrl:    uploadedImageUrl || "",
        isPublic:    document.getElementById("issuePublic")?.checked ?? true,
        status:      "pending",
        upvotes:     0,
        upvoters:    [],
        commentsCount: 0,
        viewCount:   0,
        authorId:    window.currentUser.uid,
        authorName:  window.currentUser.displayName || "Anonymous",
        createdAt:   serverTimestamp(),
        updatedAt:   serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, ISSUES_COL), issueData);

      // Increment user's issue count
      await updateDoc(doc(db, "users", window.currentUser.uid), {
        issuesCount: increment(1)
      });

      window.location.href = `issue-details.html?id=${docRef.id}&submitted=1`;

    } catch (err) {
      console.error("Submit error:", err);
      alert("Failed to submit issue. Please try again.");
      submitBtn.disabled = false;
      if (btnLoading) btnLoading.classList.add("d-none");
      if (btnText && btnText !== submitBtn) btnText.classList.remove("d-none");
    }
  });
}

// ─── ISSUE DETAILS PAGE ──────────────────────────────────────

const issueTitleMain = document.getElementById("issueTitleMain");
if (issueTitleMain) {
  initIssueDetailsPage();
}

async function initIssueDetailsPage() {
  const params  = new URLSearchParams(window.location.search);
  const issueId = params.get("id");
  if (!issueId) { window.location.href = "explore.html"; return; }

  // Increment view count
  const issueRef = doc(db, ISSUES_COL, issueId);
  try {
    await updateDoc(issueRef, { viewCount: increment(1) });
  } catch (_) {}

  // Fetch issue
  const snap = await getDoc(issueRef);
  if (!snap.exists()) {
    document.querySelector(".issue-detail-container")?.insertAdjacentHTML(
      "beforeend", `<p class="text-danger">Issue not found.</p>`
    );
    return;
  }

  const issue = snap.data();

  // Populate fields
  document.getElementById("issueTitleMain").textContent       = issue.title || "";
  document.getElementById("issueCategoryBadge").className     = `badge-category ${categoryColor(issue.category)}`;
  document.getElementById("issueCategoryBadge").textContent   = issue.category || "";
  document.getElementById("issueStatusBadge").className       = statusBadge(issue.status);
  document.getElementById("issueStatusBadge").textContent     = issue.status || "Pending";
  document.getElementById("issueDescription").textContent     = issue.description || "";
  document.getElementById("issueAuthorName").textContent      = issue.authorName || "Anonymous";
  document.getElementById("issueCreatedAt").textContent       = timeAgo(issue.createdAt);
  document.getElementById("issueViewCount").textContent       = issue.viewCount || 0;
  document.getElementById("voteCount").textContent            = issue.upvotes || 0;

  document.getElementById("infoStatus").textContent    = issue.status || "Pending";
  document.getElementById("infoCategory").textContent  = issue.category || "—";
  document.getElementById("infoSeverity").textContent  = issue.severity || "—";
  document.getElementById("issueId").textContent       = issueId.substring(0, 8).toUpperCase();
  document.getElementById("issueDate").textContent     = issue.createdAt?.toDate?.()
    .toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" }) || "";

  if (issue.steps) {
    document.getElementById("issueSteps").textContent = issue.steps;
    document.getElementById("issueSteps").closest("section")?.classList.remove("d-none");
  }
  if (issue.platform) {
    document.getElementById("issuePlatformWrap").textContent = issue.platform;
    document.getElementById("issuePlatformWrap").closest("section")?.classList.remove("d-none");
  }
  if (issue.imageUrl) {
    const imgEl = document.getElementById("issueImageWrap");
    if (imgEl) { imgEl.src = issue.imageUrl; imgEl.classList.remove("d-none"); }
  }

  // Upvote button
  const upvoteBtn = document.getElementById("upvoteBtn");
  if (upvoteBtn) {
    const hasVoted = window.currentUser &&
      (issue.upvoters || []).includes(window.currentUser.uid);
    if (hasVoted) upvoteBtn.classList.add("voted");

    upvoteBtn.addEventListener("click", async () => {
      if (!window.currentUser) { window.location.href = "login.html"; return; }
      const uid    = window.currentUser.uid;
      const voted  = upvoteBtn.classList.contains("voted");
      const delta  = voted ? -1 : 1;
      const cntEl  = document.getElementById("voteCount");
      upvoteBtn.classList.toggle("voted", !voted);
      cntEl.textContent = parseInt(cntEl.textContent) + delta;
      try {
        await updateDoc(issueRef, {
          upvotes:  increment(delta),
          upvoters: voted ? arrayRemove(uid) : arrayUnion(uid),
        });
      } catch (err) {
        upvoteBtn.classList.toggle("voted", voted);
        cntEl.textContent = parseInt(cntEl.textContent) - delta;
      }
    });
  }

  // Admin panel
  if (window.currentUserRole === "admin") {
    document.getElementById("adminStatusPanel")?.classList.remove("d-none");
    const select   = document.getElementById("adminStatusSelect");
    const updateBtn= document.getElementById("updateStatusBtn");
    const deleteBtn= document.getElementById("deleteIssueBtn");
    if (select) select.value = issue.status || "pending";

    updateBtn?.addEventListener("click", async () => {
      await updateDoc(issueRef, { status: select.value, updatedAt: serverTimestamp() });
      document.getElementById("issueStatusBadge").className   = statusBadge(select.value);
      document.getElementById("issueStatusBadge").textContent = select.value;
      document.getElementById("infoStatus").textContent       = select.value;
    });

    deleteBtn?.addEventListener("click", async () => {
      if (!confirm("Delete this issue permanently?")) return;
      await deleteDoc(issueRef);
      window.location.href = "explore.html";
    });
  }
}

export { buildIssueCard, timeAgo, categoryColor, statusBadge };
