// ============================================================
//  comments.js
//  PainPoint Tracker – Real-time Comments
//  Used by: issue-details.html
// ============================================================

import { db } from "./firebase-config.js";
import {
  collection, addDoc, getDocs, deleteDoc,
  doc, query, orderBy, onSnapshot,
  serverTimestamp, increment, updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ─── Only run on issue-details.html ─────────────────────────

const commentsList = document.getElementById("commentsList");
if (!commentsList) { /* not on this page */ }
else { initComments(); }

function initComments() {
  const params  = new URLSearchParams(window.location.search);
  const issueId = params.get("id");
  if (!issueId) return;

  const commentsRef = collection(db, "issues", issueId, "comments");
  const issueRef    = doc(db, "issues", issueId);

  // ─── Real-time listener ────────────────────────────────────
  const q = query(commentsRef, orderBy("createdAt", "asc"));
  onSnapshot(q, (snap) => {
    commentsList.innerHTML = "";
    if (snap.empty) {
      commentsList.innerHTML = `
        <div class="text-center text-muted py-4" id="noCommentsMsg">
          <i class="bi bi-chat-square-dots fs-2 d-block mb-2 opacity-50"></i>
          No comments yet. Be the first to share your thoughts!
        </div>`;
      document.getElementById("issueCommentCount").textContent = "0";
      return;
    }
    let count = 0;
    snap.forEach(docSnap => {
      commentsList.insertAdjacentHTML("beforeend", buildCommentHTML(docSnap.id, docSnap.data()));
      count++;
    });
    document.getElementById("issueCommentCount").textContent = count;
    bindDeleteButtons(issueId);
  });

  // ─── Submit comment ────────────────────────────────────────
  const submitBtn  = document.getElementById("submitCommentBtn");
  const commentBox = document.getElementById("commentText");
  const charCount  = document.getElementById("commentCounter");

  commentBox?.addEventListener("input", () => {
    const len = commentBox.value.length;
    if (charCount) charCount.textContent = `${len}/500`;
  });

  submitBtn?.addEventListener("click", async () => {
    if (!window.currentUser) {
      window.location.href = "login.html";
      return;
    }
    const text = commentBox?.value.trim();
    if (!text) return;

    // Optimistic UI: disable button while submitting
    submitBtn.disabled    = true;
    submitBtn.textContent = "Posting…";

    try {
      await addDoc(commentsRef, {
        text:       text,
        authorId:   window.currentUser.uid,
        authorName: window.currentUser.displayName || "Anonymous",
        authorPhoto:window.currentUser.photoURL || "",
        createdAt:  serverTimestamp(),
        likes:      0,
        likedBy:    [],
      });
      // Increment comment count on issue doc
      await updateDoc(issueRef, { commentsCount: increment(1) });
      commentBox.value = "";
      if (charCount) charCount.textContent = "0/500";
    } catch (err) {
      console.error("Comment failed:", err);
      alert("Failed to post comment. Please try again.");
    } finally {
      submitBtn.disabled    = false;
      submitBtn.textContent = "Post Comment";
    }
  });
}

// ─── Build comment HTML ──────────────────────────────────────

function buildCommentHTML(commentId, data) {
  const isOwn  = window.currentUser?.uid === data.authorId;
  const isAdmin= window.currentUserRole === "admin";
  const canDel = isOwn || isAdmin;
  const initials = (data.authorName || "?").split(" ")
    .map(w => w[0]).join("").toUpperCase().substring(0, 2);
  const timeStr = data.createdAt?.toDate?.()
    .toLocaleString("en-IN", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" }) || "just now";

  return `
    <div class="comment-item" data-comment-id="${commentId}">
      <div class="comment-avatar">${initials}</div>
      <div class="comment-body flex-grow-1">
        <div class="d-flex justify-content-between align-items-center mb-1">
          <div>
            <span class="fw-semibold text-white small">${escapeHtml(data.authorName || "Anonymous")}</span>
            ${isOwn ? '<span class="badge bg-teal ms-1" style="font-size:.65rem;background:#00c9a720;color:#00c9a7">You</span>' : ""}
            ${data.authorId === "admin" || window.currentUserRole === "admin" && isOwn
              ? '<span class="badge ms-1" style="font-size:.65rem;background:#6366f120;color:#6366f1">Admin</span>' : ""}
          </div>
          <span class="text-muted" style="font-size:.75rem">${timeStr}</span>
        </div>
        <p class="mb-0 text-light" style="font-size:.9rem;line-height:1.5">${escapeHtml(data.text)}</p>
      </div>
      ${canDel ? `<button class="btn-icon delete-comment-btn ms-2" data-comment-id="${commentId}" title="Delete comment">
        <i class="bi bi-trash3" style="font-size:.8rem;color:#f43f5e"></i>
      </button>` : ""}
    </div>`;
}

// ─── Delete comment ──────────────────────────────────────────

function bindDeleteButtons(issueId) {
  document.querySelectorAll(".delete-comment-btn:not([data-bound])").forEach(btn => {
    btn.dataset.bound = "1";
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this comment?")) return;
      const commentId = btn.dataset.commentId;
      const issueRef  = doc(db, "issues", issueId);
      try {
        await deleteDoc(doc(db, "issues", issueId, "comments", commentId));
        await updateDoc(issueRef, { commentsCount: increment(-1) });
      } catch (err) {
        console.error("Delete comment failed:", err);
      }
    });
  });
}

// ─── Helper ──────────────────────────────────────────────────

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str || "";
  return d.innerHTML;
}
