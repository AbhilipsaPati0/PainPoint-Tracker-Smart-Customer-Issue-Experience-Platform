// ============================================================
//  api.js — PainPoint Tracker Frontend API Client
//  Replaces: firebase-config.js, auth.js, issues.js,
//            comments.js, dashboard.js
//
//  Include this ONE file on every HTML page:
//  <script src="js/api.js"></script>
// ============================================================

const API = (() => {

  const BASE = 'http://localhost:3001/api';

  // ── Token helpers ─────────────────────────────────────────
  function getToken()       { return localStorage.getItem('ppt-token'); }
  function setToken(t)      { localStorage.setItem('ppt-token', t); }
  function removeToken()    { localStorage.removeItem('ppt-token'); localStorage.removeItem('ppt-user'); }
  function getUser()        { try { return JSON.parse(localStorage.getItem('ppt-user')); } catch { return null; } }
  function setUser(u)       { localStorage.setItem('ppt-user', JSON.stringify(u)); }

  // ── Fetch wrapper ─────────────────────────────────────────
  async function req(method, path, body = null, isFormData = false) {
    const headers = {};
    const token   = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (!isFormData && body) headers['Content-Type'] = 'application/json';

    const res = await fetch(BASE + path, {
      method,
      headers,
      body: body ? (isFormData ? body : JSON.stringify(body)) : undefined,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  // ── Auth ──────────────────────────────────────────────────
  async function register(name, email, password) {
    const data = await req('POST', '/auth/register', { name, email, password });
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }

  async function login(email, password) {
    const data = await req('POST', '/auth/login', { email, password });
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }

  function logout() {
    removeToken();
    window.location.href = 'login.html';
  }

  function isLoggedIn()  { return !!getToken(); }
  function isAdmin()     { const u = getUser(); return u && u.role === 'admin'; }
  function currentUser() { return getUser(); }

  // ── Issues ────────────────────────────────────────────────
  async function getIssues(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return req('GET', `/issues?${qs}`);
  }

  async function getIssue(id) {
    return req('GET', `/issues/${id}`);
  }

  async function createIssue(formData) {
    return req('POST', '/issues', formData, true);
  }

  async function updateStatus(id, status) {
    return req('PATCH', `/issues/${id}/status`, { status });
  }

  async function deleteIssue(id) {
    return req('DELETE', `/issues/${id}`);
  }

  async function toggleUpvote(id) {
    return req('POST', `/issues/${id}/upvote`);
  }

  async function getUpvoteStatus(id) {
    return req('GET', `/issues/${id}/upvote`);
  }

  // ── Comments ──────────────────────────────────────────────
  async function getComments(issueId) {
    return req('GET', `/issues/${issueId}/comments`);
  }

  async function postComment(issueId, text) {
    return req('POST', `/issues/${issueId}/comments`, { text });
  }

  async function deleteComment(commentId) {
    return req('DELETE', `/comments/${commentId}`);
  }

  // ── Admin ─────────────────────────────────────────────────
  async function getStats() {
    return req('GET', '/admin/stats');
  }

  async function getAdminIssues(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return req('GET', `/admin/issues?${qs}`);
  }

  return {
    // auth
    register, login, logout, isLoggedIn, isAdmin, currentUser, getToken, getUser,
    // issues
    getIssues, getIssue, createIssue, updateStatus, deleteIssue, toggleUpvote, getUpvoteStatus,
    // comments
    getComments, postComment, deleteComment,
    // admin
    getStats, getAdminIssues,
  };
})();

// ============================================================
//  PAGE CONTROLLERS — auto-run based on current page
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {

  const page = location.pathname.split('/').pop() || 'index.html';
  const user = API.currentUser();

  // ── Navbar state ────────────────────────────────────────
  document.querySelectorAll('.nav-user-name').forEach(el => {
    el.textContent = user ? (user.name || user.email) : '';
  });
  document.querySelectorAll('.nav-logged-in').forEach(el  => el.classList.toggle('d-none', !user));
  document.querySelectorAll('.nav-logged-out').forEach(el => el.classList.toggle('d-none', !!user));
  document.querySelectorAll('.admin-only').forEach(el     => el.style.display = (user && user.role === 'admin') ? '' : 'none');
  document.querySelectorAll('.logout-btn').forEach(btn    => btn.addEventListener('click', API.logout));
  if (user) {
    document.querySelectorAll('#navAvatar, #adminAvatar').forEach(el => {
      el.textContent = (user.name || user.email).charAt(0).toUpperCase();
    });
  }

  // ── Route controllers ────────────────────────────────────
  if (page === 'login.html')          initLoginPage();
  if (page === 'register.html')       initRegisterPage();
  if (page === 'explore.html')        initExplorePage();
  if (page === 'submit.html')         initSubmitPage();
  if (page === 'issue-details.html')  initIssueDetailsPage();
  if (page === 'dashboard.html')      initDashboardPage();

});

// ============================================================
//  LOGIN PAGE
// ============================================================
function initLoginPage() {
  if (API.isLoggedIn()) { location.href = 'explore.html'; return; }

  const form     = document.getElementById('loginForm');
  const alertEl  = document.getElementById('loginAlert');
  const alertMsg = document.getElementById('loginAlertMsg');
  const btn      = document.getElementById('loginBtn');
  const btnText  = document.getElementById('loginBtnText');
  const btnLoad  = document.getElementById('loginBtnLoading');

  // Password toggle
  document.getElementById('toggleLoginPwd')?.addEventListener('click', () => {
    const inp = document.getElementById('loginPassword');
    inp.type  = inp.type === 'password' ? 'text' : 'password';
    document.querySelector('#toggleLoginPwd i').className =
      inp.type === 'text' ? 'bi bi-eye-slash' : 'bi bi-eye';
  });

  form?.addEventListener('submit', async e => {
    e.preventDefault();
    alertEl.classList.add('d-none');
    const email    = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    if (!email || !password) return showAlert(alertEl, alertMsg, 'Please fill in all fields.');

    btn.disabled = true;
    btnText.classList.add('d-none');
    btnLoad.classList.remove('d-none');

    try {
      await API.login(email, password);
      location.href = 'explore.html';
    } catch (err) {
      showAlert(alertEl, alertMsg, err.message);
    } finally {
      btn.disabled = false;
      btnText.classList.remove('d-none');
      btnLoad.classList.add('d-none');
    }
  });
}

// ============================================================
//  REGISTER PAGE
// ============================================================
function initRegisterPage() {
  if (API.isLoggedIn()) { location.href = 'explore.html'; return; }

  const form     = document.getElementById('registerForm');
  const alertEl  = document.getElementById('registerAlert');
  const alertMsg = document.getElementById('registerAlertMsg');
  const successEl= document.getElementById('registerSuccess');
  const pwdInput = document.getElementById('registerPassword');
  const cfmInput = document.getElementById('registerConfirmPassword');
  const strengthBar  = document.getElementById('passwordStrengthBar');
  const strengthText = document.getElementById('passwordStrengthText');
  const matchHint    = document.getElementById('passwordMatchHint');

  // Strength meter
  pwdInput?.addEventListener('input', () => {
    const v = pwdInput.value;
    let score = 0;
    if (v.length >= 8) score++;
    if (/[A-Z]/.test(v)) score++;
    if (/[0-9]/.test(v)) score++;
    if (/[^A-Za-z0-9]/.test(v)) score++;
    const levels = [
      { label: 'Too short', color: '#ff4d6d', width: '15%' },
      { label: 'Weak',      color: '#ffb830', width: '35%' },
      { label: 'Fair',      color: '#ffb830', width: '60%' },
      { label: 'Good',      color: '#00d2af', width: '80%' },
      { label: 'Strong',    color: '#00d2af', width: '100%'},
    ];
    const lvl = v.length === 0 ? { label: '', color: 'transparent', width: '0%' } : levels[score];
    if (strengthBar) { strengthBar.style.width = lvl.width; strengthBar.style.backgroundColor = lvl.color; }
    if (strengthText){ strengthText.textContent = lvl.label; strengthText.style.color = lvl.color; }
  });

  // Match hint
  cfmInput?.addEventListener('input', () => {
    if (!matchHint) return;
    if (!cfmInput.value) { matchHint.textContent = ''; return; }
    const match = cfmInput.value === pwdInput.value;
    matchHint.textContent = match ? '✓ Passwords match' : '✗ Passwords do not match';
    matchHint.style.color  = match ? '#00d2af' : '#ff4d6d';
  });

  form?.addEventListener('submit', async e => {
    e.preventDefault();
    alertEl?.classList.add('d-none');
    successEl?.classList.add('d-none');

    const name     = document.getElementById('registerName').value.trim();
    const email    = document.getElementById('registerEmail').value.trim();
    const password = pwdInput.value;
    const confirm  = cfmInput.value;

    if (!name || !email || !password || !confirm)
      return showAlert(alertEl, alertMsg, 'Please fill in all required fields.');
    if (password !== confirm)
      return showAlert(alertEl, alertMsg, 'Passwords do not match.');
    if (password.length < 6)
      return showAlert(alertEl, alertMsg, 'Password must be at least 6 characters.');

    const submitBtn = form.querySelector('[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating account...';

    try {
      await API.register(name, email, password);
      successEl?.classList.remove('d-none');
      setTimeout(() => location.href = 'explore.html', 1500);
    } catch (err) {
      showAlert(alertEl, alertMsg, err.message);
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create Account';
    }
  });
}

// ============================================================
//  EXPLORE PAGE
// ============================================================
async function initExplorePage() {
  let currentPage = 1, currentFilter = 'all', currentSort = 'newest',
      currentStatus = 'all', currentSearch = '';

  const feed = document.getElementById('issuesFeed');

  // Remove skeletons
  setTimeout(() => {
    ['skeletonCard1','skeletonCard2','skeletonCard3'].forEach(id => document.getElementById(id)?.remove());
  }, 400);

  await loadFeed(true);

  // Search
  let searchTimer;
  document.getElementById('searchInput')?.addEventListener('input', e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { currentSearch = e.target.value.trim(); loadFeed(true); }, 350);
  });

  // Filters
  document.querySelectorAll('.filter-chip[data-filter]').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentFilter = chip.dataset.filter;
      loadFeed(true);
    });
  });
  document.getElementById('statusFilter')?.addEventListener('change', e => { currentStatus = e.target.value; loadFeed(true); });
  document.getElementById('sortSelect')?.addEventListener('change',   e => { currentSort   = e.target.value; loadFeed(true); });
  document.getElementById('loadMoreBtn')?.addEventListener('click',   () => loadFeed(false));

  async function loadFeed(reset) {
    if (reset) { currentPage = 1; feed.innerHTML = spinnerHTML(); }
    try {
      const data = await API.getIssues({
        category: currentFilter, status: currentStatus,
        sort: currentSort, search: currentSearch,
        page: currentPage, limit: 9,
      });
      if (reset) feed.innerHTML = '';
      if (!data.issues.length && reset) {
        document.getElementById('emptyState')?.classList.remove('d-none');
        document.getElementById('loadMoreBtn')?.classList.add('d-none');
        document.getElementById('issuesShownCount') && (document.getElementById('issuesShownCount').textContent = '0');
        return;
      }
      document.getElementById('emptyState')?.classList.add('d-none');
      data.issues.forEach(issue => feed.insertAdjacentHTML('beforeend', issueCardHTML(issue)));
      bindUpvoteButtons();
      const shownEl = document.getElementById('issuesShownCount');
      if (shownEl) shownEl.textContent = parseInt(shownEl.textContent || 0) + data.issues.length;
      if (data.issues.length === 1 || currentPage * 9 >= data.total) {
        document.getElementById('loadMoreBtn')?.classList.add('d-none');
      } else {
        document.getElementById('loadMoreBtn')?.classList.remove('d-none');
        currentPage++;
      }
      document.getElementById('issuesTotalCount') && (document.getElementById('issuesTotalCount').textContent = data.total);
    } catch (err) {
      feed.innerHTML = `<div class="col-12 text-center text-danger py-4">${err.message}</div>`;
    }
  }
}

function bindUpvoteButtons() {
  document.querySelectorAll('.upvote-btn:not([data-bound])').forEach(btn => {
    btn.dataset.bound = '1';
    btn.addEventListener('click', async e => {
      e.preventDefault(); e.stopPropagation();
      if (!API.isLoggedIn()) { location.href = 'login.html'; return; }
      const id = btn.dataset.id;
      const countEl = btn.querySelector('.vote-count');
      const voted   = btn.classList.contains('voted');
      btn.classList.toggle('voted', !voted);
      countEl.textContent = parseInt(countEl.textContent) + (voted ? -1 : 1);
      try {
        await API.toggleUpvote(id);
      } catch {
        btn.classList.toggle('voted', voted);
        countEl.textContent = parseInt(countEl.textContent) + (voted ? 1 : -1);
      }
    });
  });
}

// ============================================================
//  SUBMIT PAGE
// ============================================================
function initSubmitPage() {
  if (!API.isLoggedIn()) { location.href = 'login.html?redirect=submit.html'; return; }

  const form = document.getElementById('submitIssueForm');
  if (!form) return;

  // Image preview
  const uploadZone = document.getElementById('uploadZone');
  const imageInput = document.getElementById('issueImage');
  const preview    = document.getElementById('imagePreview');

  uploadZone?.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
  uploadZone?.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
  uploadZone?.addEventListener('drop', e => {
    e.preventDefault(); uploadZone.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });
  uploadZone?.addEventListener('click', () => imageInput?.click());
  imageInput?.addEventListener('change', () => { if (imageInput.files[0]) handleFile(imageInput.files[0]); });

  function handleFile(file) {
    if (!file.type.startsWith('image/')) return alert('Please select an image file.');
    if (file.size > 5 * 1024 * 1024) return alert('Image must be under 5 MB.');
    const reader = new FileReader();
    reader.onload = e => { if (preview) { preview.src = e.target.result; preview.classList.remove('d-none'); } };
    reader.readAsDataURL(file);
    form._imageFile = file;
    document.getElementById('reviewAttachment') && (document.getElementById('reviewAttachment').textContent = file.name);
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const submitBtn = document.getElementById('submitBtn');
    submitBtn.disabled = true;
    const btnText = submitBtn.querySelector('.btn-text');
    const btnLoad = submitBtn.querySelector('.btn-loading');
    if (btnText) btnText.classList.add('d-none');
    if (btnLoad) btnLoad.classList.remove('d-none');

    try {
      const fd = new FormData();
      fd.append('title',       document.getElementById('issueTitle').value.trim());
      fd.append('category',    document.getElementById('selectedCategory').value);
      fd.append('description', document.getElementById('issueDescription').value.trim());
      fd.append('severity',    document.getElementById('issueSeverity').value);
      fd.append('platform',    document.getElementById('issuePlatform')?.value || '');
      fd.append('steps',       document.getElementById('issueSteps')?.value.trim() || '');
      fd.append('is_public',   document.getElementById('issuePublic')?.checked ? 'true' : 'false');
      if (form._imageFile) fd.append('image', form._imageFile);

      const issue = await API.createIssue(fd);
      location.href = `issue-details.html?id=${issue.id}&submitted=1`;
    } catch (err) {
      alert('Failed to submit: ' + err.message);
      submitBtn.disabled = false;
      if (btnText) btnText.classList.remove('d-none');
      if (btnLoad) btnLoad.classList.add('d-none');
    }
  });
}

// ============================================================
//  ISSUE DETAILS PAGE
// ============================================================
async function initIssueDetailsPage() {
  const id = new URLSearchParams(location.search).get('id');
  if (!id) { location.href = 'explore.html'; return; }

  try {
    const issue = await API.getIssue(id);
    populateIssue(issue);
    await loadComments(id);
    initUpvoteButton(issue);
    if (API.isAdmin()) initAdminPanel(issue);
    if (API.isLoggedIn()) initCommentForm(id);
  } catch (err) {
    document.querySelector('.issue-detail-page')?.insertAdjacentHTML(
      'beforeend', `<p class="text-danger mt-4">${err.message}</p>`
    );
  }

  function populateIssue(issue) {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('issueTitleMain',    issue.title);
    set('issueDescription',  issue.description);
    set('issueAuthorName',   issue.author_name);
    set('issueCreatedAt',    timeAgo(issue.created_at));
    set('issueViewCount',    issue.view_count);
    set('issueCommentCount', issue.comments_count);
    set('voteCount',         issue.upvotes);
    set('infoStatus',        issue.status);
    set('infoCategory',      issue.category);
    set('infoSeverity',      issue.severity);
    set('issueId',           String(issue.id).padStart(6, '0'));
    set('issueDate',         new Date(issue.created_at).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }));

    const catEl = document.getElementById('issueCategoryBadge');
    if (catEl) { catEl.className = `badge-category cat-${(issue.category||'ux').toLowerCase()}`; catEl.textContent = issue.category; }

    const stEl = document.getElementById('issueStatusBadge');
    if (stEl) { stEl.className = statusBadgeClass(issue.status); stEl.textContent = issue.status; }

    if (issue.steps) {
      const stepsEl = document.getElementById('issueSteps');
      if (stepsEl) { stepsEl.textContent = issue.steps; stepsEl.closest('section')?.classList.remove('d-none'); }
    }
    if (issue.platform) {
      const platEl = document.getElementById('issuePlatformWrap');
      if (platEl) { platEl.textContent = issue.platform; platEl.closest('section')?.classList.remove('d-none'); }
    }
    if (issue.image_url) {
      const imgEl = document.getElementById('issueImageWrap');
      if (imgEl) { imgEl.src = issue.image_url; imgEl.classList.remove('d-none'); }
    }
  }

  async function loadComments(issueId) {
    const list = document.getElementById('commentsList');
    if (!list) return;
    try {
      const comments = await API.getComments(issueId);
      list.innerHTML = '';
      if (!comments.length) {
        list.innerHTML = `<div class="text-center text-muted py-4"><i class="bi bi-chat-square-dots fs-2 d-block mb-2 opacity-50"></i>No comments yet. Be the first!</div>`;
        return;
      }
      comments.forEach(c => list.insertAdjacentHTML('beforeend', commentHTML(c)));
      bindDeleteComments(issueId);
    } catch {}
  }

  function initUpvoteButton(issue) {
    const btn = document.getElementById('upvoteBtn');
    if (!btn) return;
    if (API.isLoggedIn()) {
      API.getUpvoteStatus(issue.id).then(({ voted }) => { if (voted) btn.classList.add('voted'); }).catch(() => {});
    }
    btn.addEventListener('click', async () => {
      if (!API.isLoggedIn()) { location.href = 'login.html'; return; }
      const voted  = btn.classList.contains('voted');
      const cntEl  = document.getElementById('voteCount');
      btn.classList.toggle('voted', !voted);
      cntEl.textContent = parseInt(cntEl.textContent) + (voted ? -1 : 1);
      try { await API.toggleUpvote(issue.id); }
      catch { btn.classList.toggle('voted', voted); cntEl.textContent = parseInt(cntEl.textContent) + (voted ? 1 : -1); }
    });
  }

  function initCommentForm(issueId) {
    document.getElementById('loginToComment')?.classList.add('d-none');
    document.getElementById('commentInputArea')?.classList.remove('d-none');
    const btn = document.getElementById('submitCommentBtn');
    const box = document.getElementById('commentText');
    box?.addEventListener('input', () => {
      const cc = document.getElementById('commentCounter');
      if (cc) cc.textContent = `${box.value.length}/500`;
    });
    btn?.addEventListener('click', async () => {
      const text = box?.value.trim();
      if (!text) return;
      btn.disabled = true; btn.textContent = 'Posting…';
      try {
        await API.postComment(issueId, text);
        box.value = '';
        const cc = document.getElementById('commentCounter');
        if (cc) cc.textContent = '0/500';
        await loadComments(issueId);
        const cnt = document.getElementById('issueCommentCount');
        if (cnt) cnt.textContent = parseInt(cnt.textContent || 0) + 1;
      } catch (err) { alert('Failed: ' + err.message); }
      finally { btn.disabled = false; btn.textContent = 'Post Comment'; }
    });
  }

  function initAdminPanel(issue) {
    const panel = document.getElementById('adminStatusPanel');
    if (!panel) return;
    panel.classList.remove('d-none');
    const sel = document.getElementById('adminStatusSelect');
    if (sel) sel.value = issue.status;
    document.getElementById('updateStatusBtn')?.addEventListener('click', async () => {
      try {
        const updated = await API.updateStatus(issue.id, sel.value);
        document.getElementById('issueStatusBadge').className   = statusBadgeClass(updated.status);
        document.getElementById('issueStatusBadge').textContent = updated.status;
        document.getElementById('infoStatus').textContent       = updated.status;
        showToast('Status updated!', 'success');
      } catch (err) { showToast(err.message, 'error'); }
    });
    document.getElementById('deleteIssueBtn')?.addEventListener('click', async () => {
      if (!confirm('Delete this issue permanently?')) return;
      try { await API.deleteIssue(issue.id); location.href = 'explore.html'; }
      catch (err) { showToast(err.message, 'error'); }
    });
  }

  function bindDeleteComments(issueId) {
    document.querySelectorAll('.delete-comment-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete comment?')) return;
        try {
          await API.deleteComment(btn.dataset.commentId);
          await loadComments(issueId);
        } catch (err) { showToast(err.message, 'error'); }
      });
    });
  }
}

// ============================================================
//  DASHBOARD PAGE
// ============================================================
async function initDashboardPage() {
  const guard = document.getElementById('dashboardGuard');

  if (!API.isLoggedIn()) {
    location.href = 'login.html?redirect=dashboard.html'; return;
  }
  if (!API.isAdmin()) {
    if (guard) {
      guard.querySelector('.guard-title').textContent = 'Access Denied';
      guard.querySelector('.guard-sub').textContent   = 'You do not have admin privileges.';
      guard.querySelector('.guard-icon').textContent  = '⛔';
      guard.querySelector('.spinner') && (guard.querySelector('.spinner').style.display = 'none');
      const btn = Object.assign(document.createElement('a'), { href:'explore.html', className:'btn-teal', textContent:'← Back to Feed' });
      btn.style.cssText = 'margin-top:8px;padding:10px 24px;text-decoration:none;border-radius:8px;font-weight:700;';
      guard.appendChild(btn);
    }
    return;
  }

  // Admin confirmed — hide guard
  if (guard) guard.style.display = 'none';

  const user = API.currentUser();
  document.getElementById('adminAvatar') && (document.getElementById('adminAvatar').textContent = (user?.name || 'A').charAt(0).toUpperCase());

  // Sidebar nav
  document.querySelectorAll('.sidebar-nav-item[data-section]').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.sidebar-nav-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      document.querySelectorAll('.dashboard-section').forEach(s => s.classList.toggle('d-none', s.id !== item.dataset.section));
    });
  });

  try {
    const stats = await API.getStats();
    renderStats(stats);
    renderCharts(stats);
    renderTopPainPoints(stats.topIssues);
  } catch (err) { console.error('Stats error:', err); }

  await loadAdminTable();
  bindTableControls();
  bindQuickStatusModal();
}

async function loadAdminTable(params = {}) {
  try {
    const data = await API.getAdminIssues(params);
    const tbody = document.getElementById('issuesTableBody');
    if (!tbody) return;
    tbody.innerHTML = data.issues.length
      ? data.issues.map(issue => adminRowHTML(issue)).join('')
      : `<tr><td colspan="7" class="text-center text-muted py-4">No issues found</td></tr>`;
    document.getElementById('tableTotal') && (document.getElementById('tableTotal').textContent = data.total);
    bindTableRowActions();
  } catch (err) { console.error(err); }
}

function renderStats(s) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  animateCount('statTotal',          s.total);
  animateCount('statPending',        s.pending);
  animateCount('statProgress',       s.progress);
  animateCount('statResolved',       s.resolved);
  animateCount('statResolutionRate', s.rate, '%');
  set('statAvgResponse', '—');
}

function animateCount(id, target, suffix = '') {
  const el = document.getElementById(id); if (!el) return;
  let cur = 0; const step = Math.ceil(target / 40);
  const t = setInterval(() => { cur = Math.min(cur + step, target); el.textContent = cur + suffix; if (cur >= target) clearInterval(t); }, 30);
}

function renderCharts(stats) {
  if (!window.Chart) return;

  // Issues over time
  const ctx1 = document.getElementById('issuesOverTimeChart');
  if (ctx1) {
    const labels = stats.trend.map(d => d.day);
    const data   = stats.trend.map(d => d.count);
    new Chart(ctx1, { type: 'line', data: { labels, datasets: [{ label: 'Issues', data, borderColor: '#00d2af', backgroundColor: 'rgba(0,210,175,0.1)', tension: 0.4, fill: true }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#7a8fa8' }, grid: { color: '#1e2a3a' } }, y: { ticks: { color: '#7a8fa8', stepSize: 1 }, grid: { color: '#1e2a3a' }, beginAtZero: true } } } });
  }

  // Category donut
  const ctx2 = document.getElementById('categoryDonutChart');
  if (ctx2 && stats.byCategory.length) {
    new Chart(ctx2, { type: 'doughnut', data: { labels: stats.byCategory.map(c => c.category), datasets: [{ data: stats.byCategory.map(c => c.count), backgroundColor: ['#00d2af','#a78bfa','#ffb830','#ff4d6d','#60a5fa'], borderColor: 'transparent' }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { labels: { color: '#7a8fa8' } } } } });
  }

  // Status bar
  const ctx3 = document.getElementById('statusBarChart');
  if (ctx3) {
    new Chart(ctx3, { type: 'bar', data: { labels: ['Pending','In Progress','Resolved'], datasets: [{ data: [stats.pending, stats.progress, stats.resolved], backgroundColor: ['#ffb830','#a78bfa','#00d2af'], borderRadius: 6 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#7a8fa8' }, grid: { display: false } }, y: { ticks: { color: '#7a8fa8', stepSize: 1 }, grid: { color: '#1e2a3a' }, beginAtZero: true } } } });
  }
}

function renderTopPainPoints(issues) {
  const container = document.getElementById('topPainPoints'); if (!container) return;
  const max = issues[0]?.upvotes || 1;
  container.innerHTML = issues.map((issue, i) => `
    <div class="pain-point-item">
      <div class="pain-rank rank-${i < 3 ? i+1 : 'other'}">${i+1}</div>
      <div class="pain-point-info">
        <div class="pain-point-title">${esc(issue.title?.substring(0,50))}${issue.title?.length > 50 ? '…' : ''}</div>
        <div class="pain-bar-wrap">
          <div class="pain-bar"><div class="pain-bar-fill" style="width:${Math.round((issue.upvotes/max)*100)}%"></div></div>
          <span class="pain-votes">${issue.upvotes} votes</span>
        </div>
      </div>
    </div>`).join('');
}

function bindTableControls() {
  let timer;
  document.getElementById('tableSearch')?.addEventListener('input', e => {
    clearTimeout(timer);
    timer = setTimeout(() => loadAdminTable({ search: e.target.value, status: document.getElementById('tableStatusFilter')?.value || 'all' }), 300);
  });
  document.getElementById('tableStatusFilter')?.addEventListener('change', e => {
    loadAdminTable({ status: e.target.value, search: document.getElementById('tableSearch')?.value || '' });
  });
  document.getElementById('exportCsvBtn')?.addEventListener('click', exportCsv);
}

function bindTableRowActions() {
  document.querySelectorAll('.quick-status-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = document.getElementById('quickStatusModal');
      modal._issueId = btn.dataset.id;
      document.getElementById('modalIssueId').textContent        = String(btn.dataset.id).padStart(6,'0');
      document.getElementById('modalStatusSelect').value         = btn.dataset.status;
      new bootstrap.Modal(modal).show();
    });
  });
  document.querySelectorAll('.delete-issue-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this issue permanently?')) return;
      try { await API.deleteIssue(btn.dataset.id); loadAdminTable(); showToast('Deleted.', 'success'); }
      catch (err) { showToast(err.message, 'error'); }
    });
  });
}

function bindQuickStatusModal() {
  document.getElementById('modalUpdateBtn')?.addEventListener('click', async () => {
    const modal   = document.getElementById('quickStatusModal');
    const issueId = modal._issueId;
    const status  = document.getElementById('modalStatusSelect').value;
    try {
      await API.updateStatus(issueId, status);
      bootstrap.Modal.getInstance(modal)?.hide();
      loadAdminTable();
      showToast(`Status updated to "${status}".`, 'success');
    } catch (err) { showToast(err.message, 'error'); }
  });
}

async function exportCsv() {
  try {
    const data = await API.getAdminIssues({ limit: 9999 });
    const rows = [
      ['ID','Title','Category','Status','Severity','Author','Upvotes','Comments','Created At'],
      ...data.issues.map(i => [i.id, `"${(i.title||'').replace(/"/g,'""')}"`, i.category, i.status, i.severity, `"${(i.author_name||'').replace(/"/g,'""')}"`, i.upvotes, i.comments_count, i.created_at])
    ];
    const blob = new Blob([rows.map(r => r.join(',')).join('\n')], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), { href: url, download: `painpoint-export-${Date.now()}.csv` }).click();
    URL.revokeObjectURL(url);
    showToast('CSV exported!', 'success');
  } catch (err) { showToast(err.message, 'error'); }
}

// ============================================================
//  HTML BUILDERS
// ============================================================
function issueCardHTML(issue) {
  return `
  <div class="col-md-6 col-lg-4">
    <div class="issue-card" onclick="location.href='issue-details.html?id=${issue.id}'">
      <div class="d-flex justify-content-between align-items-start mb-2">
        <span class="badge-category cat-${(issue.category||'ux').toLowerCase()}">${issue.category}</span>
        <span class="${statusBadgeClass(issue.status)}">${issue.status}</span>
      </div>
      <h6 class="issue-title mb-2">${esc(issue.title)}</h6>
      <p class="issue-excerpt text-muted small mb-3">${esc((issue.description||'').substring(0,120))}${(issue.description||'').length > 120 ? '…' : ''}</p>
      <div class="d-flex justify-content-between align-items-center">
        <div class="d-flex align-items-center gap-2">
          <button class="btn-icon upvote-btn" data-id="${issue.id}" data-count="${issue.upvotes}" onclick="event.stopPropagation()">
            <i class="bi bi-arrow-up"></i> <span class="vote-count">${issue.upvotes}</span>
          </button>
          <span class="text-muted small"><i class="bi bi-chat me-1"></i>${issue.comments_count}</span>
        </div>
        <span class="text-muted small">${timeAgo(issue.created_at)}</span>
      </div>
    </div>
  </div>`;
}

function commentHTML(c) {
  const user    = API.currentUser();
  const isOwn   = user && user.id === c.author_id;
  const isAdmin = API.isAdmin();
  const initials= (c.author_name||'?').split(' ').map(w=>w[0]).join('').toUpperCase().substring(0,2);
  return `
  <div class="comment-item">
    <div class="comment-avatar">${initials}</div>
    <div class="flex-grow-1">
      <div class="d-flex justify-content-between align-items-center mb-1">
        <span class="fw-semibold small">${esc(c.author_name)}</span>
        <span class="text-muted" style="font-size:.75rem">${timeAgo(c.created_at)}</span>
      </div>
      <p class="mb-0 small">${esc(c.text)}</p>
    </div>
    ${(isOwn||isAdmin) ? `<button class="btn-icon delete-comment-btn ms-2" data-comment-id="${c.id}" style="padding:4px 8px"><i class="bi bi-trash3" style="font-size:.75rem;color:#ff4d6d"></i></button>` : ''}
  </div>`;
}

function adminRowHTML(issue) {
  const date = new Date(issue.created_at).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
  return `
  <tr>
    <td><span class="text-muted small">${String(issue.id).padStart(6,'0')}</span></td>
    <td class="td-title"><a href="issue-details.html?id=${issue.id}" class="text-inherit text-decoration-none">${esc((issue.title||'').substring(0,55))}${(issue.title||'').length>55?'…':''}</a></td>
    <td><span class="badge-category cat-${(issue.category||'ux').toLowerCase()}">${issue.category}</span></td>
    <td><span class="${statusBadgeClass(issue.status)}">${issue.status}</span></td>
    <td><span class="text-muted small">${esc(issue.author_name||'—')}</span></td>
    <td><span class="text-muted small">${date}</span></td>
    <td>
      <div class="d-flex gap-1">
        <a href="issue-details.html?id=${issue.id}" class="btn-icon" title="View"><i class="bi bi-eye" style="font-size:.8rem"></i></a>
        <button class="btn-icon quick-status-btn" data-id="${issue.id}" data-status="${issue.status}" title="Edit status"><i class="bi bi-pencil" style="font-size:.8rem"></i></button>
        <button class="btn-icon delete-issue-btn" data-id="${issue.id}" title="Delete"><i class="bi bi-trash3" style="font-size:.8rem;color:#ff4d6d"></i></button>
      </div>
    </td>
  </tr>`;
}

// ============================================================
//  UTILITIES
// ============================================================
function timeAgo(ts) {
  if (!ts) return '';
  const diff = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return `${Math.floor(diff/86400)}d ago`;
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

function statusBadgeClass(s) {
  return s === 'resolved' ? 'badge-status badge-resolved' : s === 'in-progress' ? 'badge-status badge-progress' : 'badge-status badge-pending';
}

function spinnerHTML() {
  return '<div class="col-12 text-center py-5"><div class="spinner spinner-teal"></div></div>';
}

function showAlert(el, msgEl, msg, type = 'danger') {
  if (!el || !msgEl) return;
  el.className = `alert alert-${type}`;
  msgEl.textContent = msg;
  el.classList.remove('d-none');
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer'); if (!container) return;
  const id    = `toast_${Date.now()}`;
  const icon  = type === 'success' ? 'bi-check-circle-fill' : 'bi-exclamation-circle-fill';
  const color = type === 'success' ? '#00d2af' : '#ff4d6d';
  container.insertAdjacentHTML('beforeend', `
    <div id="${id}" class="custom-toast toast-${type}">
      <i class="bi ${icon}" style="color:${color};font-size:16px"></i>
      <span class="toast-text">${esc(message)}</span>
      <button class="btn-icon ms-auto" style="padding:2px 6px;border:none;background:transparent;" onclick="document.getElementById('${id}').remove()">✕</button>
    </div>`);
  setTimeout(() => document.getElementById(id)?.remove(), 4000);
}
