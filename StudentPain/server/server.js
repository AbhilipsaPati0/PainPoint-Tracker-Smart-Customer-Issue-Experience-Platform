const express = require("express");
const fs = require("fs");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const path = require("path");

const app = express();
app.use(express.json());
app.use(cors());

const DATA_FILE = path.join(__dirname, "data.json");
const USER_FILE = path.join(__dirname, "users.json");
const SECRET = "secret123";

// ---------- FILE HELPERS ----------
const readFile = (file) => {
  try {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, "[]");
      return [];
    }
    const data = fs.readFileSync(file, "utf-8").trim();
    return data ? JSON.parse(data) : [];
  } catch {
    fs.writeFileSync(file, "[]");
    return [];
  }
};

const writeFile = (file, data) => {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
};

// ---------- AUTH ----------
const auth = (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ message: "No token" });

  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(403).json({ message: "Invalid token" });
  }
};

// ---------- REGISTER ----------
app.post("/register", async (req, res) => {
  const users = readFile(USER_FILE);
  const { username, password, role } = req.body;

  if (users.find((u) => u.username === username)) {
    return res.status(400).json({ message: "User exists" });
  }

  const hashed = await bcrypt.hash(password, 10);

  users.push({
    id: Date.now(),
    username,
    password: hashed,
    role: role || "user",
  });

  writeFile(USER_FILE, users);
  res.json({ message: "Registered" });
});

// ---------- LOGIN ----------
app.post("/login", async (req, res) => {
  const users = readFile(USER_FILE);
  const { username, password } = req.body;

  const user = users.find((u) => u.username === username);
  if (!user) return res.status(400).json({ message: "User not found" });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(400).json({ message: "Wrong password" });

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    SECRET,
  );

  res.json({ token });
});

// ---------- ISSUES ----------
app.get("/issues", auth, (req, res) => {
  const data = readFile(DATA_FILE);

  if (req.user.role === "admin") return res.json(data);

  res.json(data.filter((i) => i.createdBy === req.user.username));
});

app.post("/issues", auth, (req, res) => {
  const data = readFile(DATA_FILE);

  const issue = {
    id: Date.now(),
    ...req.body,
    status: "Open",
    createdBy: req.user.username,
    createdAt: new Date(),
  };

  data.push(issue);
  writeFile(DATA_FILE, data);

  res.json(issue);
});

app.put("/issues/:id", auth, (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin only" });
  }

  let data = readFile(DATA_FILE);

  data = data.map((i) => (i.id == req.params.id ? { ...i, ...req.body } : i));

  writeFile(DATA_FILE, data);
  res.json({ message: "Updated" });
});

app.delete("/issues/:id", auth, (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin only" });
  }

  let data = readFile(DATA_FILE);
  data = data.filter((i) => i.id != req.params.id);

  writeFile(DATA_FILE, data);
  res.json({ message: "Deleted" });
});
// ---------- GET USERS (ADMIN ONLY) ----------
app.get("/users", auth, (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin only" });
  }

  const users = readFile(USER_FILE);

  // Hide passwords for security
  const safeUsers = users.map(u => ({
    id: u.id,
    username: u.username,
    role: u.role
  }));

  res.json(safeUsers);
});
app.listen(5000, () => console.log("Server running on port 5000"));
