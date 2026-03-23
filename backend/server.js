// ============================================================
//  server.js — PainPoint Tracker Backend
//  Stack : Node.js + Express + SQLite (better-sqlite3)
//  Auth  : JWT (stored in localStorage on frontend)
//  Run   : node server.js   (or: npm run dev)
//  Port  : 3001
// ============================================================

const express  = require('express');
const cors     = require('cors');
const path     = require('path');
const fs       = require('fs');
const jwt      = require('jsonwebtoken');
const bcrypt   = require('bcryptjs');
const multer   = require('multer');
const Database = require('better-sqlite3');

const app  = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'painpoint-secret-key-change-in-production';

// ── Middleware ───────────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve the frontend HTML/CSS/JS files from the parent folder
app.use(express.static(path.join(__dirname, '..')));

// Serve uploaded images
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOADS_DIR));

// ── File Upload (Multer) ─────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename:    (req, file, cb) => {
    const ext  = path.extname(file.originalname);
    const name = `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
    cb(null, name);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

// ── Database Setup ───────────────────────────────────────────
const DB_PATH = path.join(__dirname, 'painpoint.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Create Tables ────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    email       TEXT    NOT NULL UNIQUE,
    password    TEXT    NOT NULL,
    role        TEXT    NOT NULL DEFAULT 'user',
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS issues (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    title         TEXT    NOT NULL,
    description   TEXT    NOT NULL,
    category      TEXT    NOT NULL DEFAULT 'general',
    severity      TEXT    NOT NULL DEFAULT 'medium',
    platform      TEXT,
    steps         TEXT,
    image_url     TEXT,
    status        TEXT    NOT NULL DEFAULT 'pending',
    is_public     INTEGER NOT NULL DEFAULT 1,
    upvotes       INTEGER NOT NULL DEFAULT 0,
    view_count    INTEGER NOT NULL DEFAULT 0,
    comments_count INTEGER NOT NULL DEFAULT 0,
    author_id     INTEGER NOT NULL,
    author_name   TEXT    NOT NULL,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (author_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS upvotes (
    user_id   INTEGER NOT NULL,
    issue_id  INTEGER NOT NULL,
    PRIMARY KEY (user_id, issue_id),
    FOREIGN KEY (user_id)  REFERENCES users(id),
    FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS comments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    issue_id    INTEGER NOT NULL,
    text        TEXT    NOT NULL,
    author_id   INTEGER NOT NULL,
    author_name TEXT    NOT NULL,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (issue_id)   REFERENCES issues(id) ON DELETE CASCADE,
    FOREIGN KEY (author_id)  REFERENCES users(id)
  );
`);

// ── Admin emails — auto-assigned on register ──────────────────
const ADMIN_EMAILS = [
  'abhilipsapati9@gmail.com',
  'sagnikasubhadarshini@gmail.com',
];

// ── Auth Middleware ──────────────────────────────────────────
function authRequired(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function adminRequired(req, res, next) {
  authRequired(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  });
}

// ============================================================
//  AUTH ROUTES
// ============================================================

// POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ error: 'Name, email and password are required' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing)
    return res.status(409).json({ error: 'An account with this email already exists' });

  const hashed = await bcrypt.hash(password, 10);
  const role   = ADMIN_EMAILS.includes(email.toLowerCase()) ? 'admin' : 'user';

  const result = db.prepare(
    'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)'
  ).run(name, email.toLowerCase(), hashed, role);

  const token = jwt.sign(
    { id: result.lastInsertRowid, name, email: email.toLowerCase(), role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({ token, user: { id: result.lastInsertRowid, name, email: email.toLowerCase(), role } });
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email and password are required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user)
    return res.status(401).json({ error: 'No account found with this email' });

  const match = await bcrypt.compare(password, user.password);
  if (!match)
    return res.status(401).json({ error: 'Incorrect password' });

  const token = jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

// GET /api/auth/me
app.get('/api/auth/me', authRequired, (req, res) => {
  const user = db.prepare('SELECT id, name, email, role, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// ============================================================
//  ISSUES ROUTES
// ============================================================

// GET /api/issues — public feed with filter/sort/pagination
app.get('/api/issues', (req, res) => {
  const {
    category, status, sort = 'newest',
    search = '', page = 1, limit = 9,
  } = req.query;

  let where = ['i.is_public = 1'];
  const params = [];

  if (category && category !== 'all') {
    where.push('i.category = ?'); params.push(category);
  }
  if (status && status !== 'all') {
    where.push('i.status = ?'); params.push(status);
  }
  if (search) {
    where.push('(i.title LIKE ? OR i.description LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  const orderBy = sort === 'popular' ? 'i.upvotes DESC'
                : sort === 'oldest'  ? 'i.created_at ASC'
                : 'i.created_at DESC';

  const offset = (parseInt(page) - 1) * parseInt(limit);
  const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const total  = db.prepare(`SELECT COUNT(*) as c FROM issues i ${whereSQL}`).get(...params).c;
  const issues = db.prepare(
    `SELECT i.*, u.name as author_name
     FROM issues i
     LEFT JOIN users u ON i.author_id = u.id
     ${whereSQL}
     ORDER BY ${orderBy}
     LIMIT ? OFFSET ?`
  ).all(...params, parseInt(limit), offset);

  res.json({ issues, total, page: parseInt(page), limit: parseInt(limit) });
});

// GET /api/issues/:id — single issue
app.get('/api/issues/:id', (req, res) => {
  const issue = db.prepare(
    `SELECT i.*, u.name as author_name
     FROM issues i LEFT JOIN users u ON i.author_id = u.id
     WHERE i.id = ?`
  ).get(req.params.id);

  if (!issue) return res.status(404).json({ error: 'Issue not found' });

  // Increment view count
  db.prepare('UPDATE issues SET view_count = view_count + 1 WHERE id = ?').run(issue.id);

  res.json(issue);
});

// POST /api/issues — create issue (auth required)
app.post('/api/issues', authRequired, upload.single('image'), (req, res) => {
  const { title, description, category, severity, platform, steps, is_public } = req.body;
  if (!title || !description || !category)
    return res.status(400).json({ error: 'Title, description and category are required' });

  const image_url = req.file ? `/uploads/${req.file.filename}` : null;

  const result = db.prepare(`
    INSERT INTO issues (title, description, category, severity, platform, steps, image_url, is_public, author_id, author_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    title, description, category,
    severity || 'medium', platform || null, steps || null,
    image_url, is_public === 'false' ? 0 : 1,
    req.user.id, req.user.name
  );

  const issue = db.prepare('SELECT * FROM issues WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(issue);
});

// PATCH /api/issues/:id/status — admin updates status
app.patch('/api/issues/:id/status', adminRequired, (req, res) => {
  const { status } = req.body;
  const allowed = ['pending', 'in-progress', 'resolved'];
  if (!allowed.includes(status))
    return res.status(400).json({ error: 'Invalid status' });

  db.prepare("UPDATE issues SET status = ?, updated_at = datetime('now') WHERE id = ?")
    .run(status, req.params.id);

  const issue = db.prepare('SELECT * FROM issues WHERE id = ?').get(req.params.id);
  if (!issue) return res.status(404).json({ error: 'Issue not found' });
  res.json(issue);
});

// DELETE /api/issues/:id — admin deletes issue
app.delete('/api/issues/:id', adminRequired, (req, res) => {
  const issue = db.prepare('SELECT id FROM issues WHERE id = ?').get(req.params.id);
  if (!issue) return res.status(404).json({ error: 'Issue not found' });
  db.prepare('DELETE FROM issues WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// POST /api/issues/:id/upvote — toggle upvote
app.post('/api/issues/:id/upvote', authRequired, (req, res) => {
  const issueId = parseInt(req.params.id);
  const userId  = req.user.id;

  const existing = db.prepare('SELECT 1 FROM upvotes WHERE user_id = ? AND issue_id = ?').get(userId, issueId);

  if (existing) {
    db.prepare('DELETE FROM upvotes WHERE user_id = ? AND issue_id = ?').run(userId, issueId);
    db.prepare('UPDATE issues SET upvotes = MAX(0, upvotes - 1) WHERE id = ?').run(issueId);
    return res.json({ voted: false });
  } else {
    db.prepare('INSERT INTO upvotes (user_id, issue_id) VALUES (?, ?)').run(userId, issueId);
    db.prepare('UPDATE issues SET upvotes = upvotes + 1 WHERE id = ?').run(issueId);
    return res.json({ voted: true });
  }
});

// GET /api/issues/:id/upvote — check if current user voted
app.get('/api/issues/:id/upvote', authRequired, (req, res) => {
  const voted = db.prepare(
    'SELECT 1 FROM upvotes WHERE user_id = ? AND issue_id = ?'
  ).get(req.user.id, req.params.id);
  res.json({ voted: !!voted });
});

// ============================================================
//  COMMENTS ROUTES
// ============================================================

// GET /api/issues/:id/comments
app.get('/api/issues/:id/comments', (req, res) => {
  const comments = db.prepare(
    'SELECT * FROM comments WHERE issue_id = ? ORDER BY created_at ASC'
  ).all(req.params.id);
  res.json(comments);
});

// POST /api/issues/:id/comments
app.post('/api/issues/:id/comments', authRequired, (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim())
    return res.status(400).json({ error: 'Comment text is required' });

  const issueId = parseInt(req.params.id);
  const issue   = db.prepare('SELECT id FROM issues WHERE id = ?').get(issueId);
  if (!issue) return res.status(404).json({ error: 'Issue not found' });

  const result = db.prepare(
    'INSERT INTO comments (issue_id, text, author_id, author_name) VALUES (?, ?, ?, ?)'
  ).run(issueId, text.trim(), req.user.id, req.user.name);

  db.prepare('UPDATE issues SET comments_count = comments_count + 1 WHERE id = ?').run(issueId);

  const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(comment);
});

// DELETE /api/comments/:id
app.delete('/api/comments/:id', authRequired, (req, res) => {
  const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(req.params.id);
  if (!comment) return res.status(404).json({ error: 'Comment not found' });

  if (comment.author_id !== req.user.id && req.user.role !== 'admin')
    return res.status(403).json({ error: 'Not allowed' });

  db.prepare('DELETE FROM comments WHERE id = ?').run(req.params.id);
  db.prepare('UPDATE issues SET comments_count = MAX(0, comments_count - 1) WHERE id = ?')
    .run(comment.issue_id);

  res.json({ success: true });
});

// ============================================================
//  ADMIN ROUTES
// ============================================================

// GET /api/admin/stats
app.get('/api/admin/stats', adminRequired, (req, res) => {
  const total    = db.prepare("SELECT COUNT(*) as c FROM issues").get().c;
  const pending  = db.prepare("SELECT COUNT(*) as c FROM issues WHERE status = 'pending'").get().c;
  const progress = db.prepare("SELECT COUNT(*) as c FROM issues WHERE status = 'in-progress'").get().c;
  const resolved = db.prepare("SELECT COUNT(*) as c FROM issues WHERE status = 'resolved'").get().c;
  const users    = db.prepare("SELECT COUNT(*) as c FROM users").get().c;

  const rate = total > 0 ? Math.round((resolved / total) * 100) : 0;

  // Issues per day for last 14 days
  const trend = db.prepare(`
    SELECT date(created_at) as day, COUNT(*) as count
    FROM issues
    WHERE created_at >= date('now', '-14 days')
    GROUP BY date(created_at)
    ORDER BY day ASC
  `).all();

  // Top 5 by upvotes
  const topIssues = db.prepare(
    'SELECT id, title, upvotes FROM issues ORDER BY upvotes DESC LIMIT 5'
  ).all();

  // Category breakdown
  const byCategory = db.prepare(
    'SELECT category, COUNT(*) as count FROM issues GROUP BY category'
  ).all();

  res.json({ total, pending, progress, resolved, users, rate, trend, topIssues, byCategory });
});

// GET /api/admin/issues — all issues for table (no public filter)
app.get('/api/admin/issues', adminRequired, (req, res) => {
  const { search = '', status = 'all', page = 1, limit = 10 } = req.query;

  let where  = [];
  const params = [];

  if (status !== 'all') { where.push('status = ?'); params.push(status); }
  if (search) {
    where.push('(title LIKE ? OR author_name LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const offset   = (parseInt(page) - 1) * parseInt(limit);
  const total    = db.prepare(`SELECT COUNT(*) as c FROM issues ${whereSQL}`).get(...params).c;
  const issues   = db.prepare(
    `SELECT * FROM issues ${whereSQL} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, parseInt(limit), offset);

  res.json({ issues, total });
});

// ============================================================
//  SERVE FRONTEND on any unmatched route
// ============================================================
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// ── Start ────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✅  PainPoint Tracker backend running`);
  console.log(`   Local:   http://localhost:${PORT}`);
  console.log(`   DB:      ${DB_PATH}`);
  console.log(`\n   Open http://localhost:${PORT} in your browser\n`);
});
