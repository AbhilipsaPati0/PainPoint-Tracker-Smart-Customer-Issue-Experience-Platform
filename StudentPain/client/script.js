const API = "http://localhost:5000";
const token = localStorage.getItem("token");

if (!token) location.href = "login.html";

function parseJWT(token) {
  return JSON.parse(atob(token.split(".")[1]));
}

let user = null;
try {
  user = parseJWT(token);
} catch {
  logout();
}

// Welcome text
if (user) {
  document.getElementById("welcome").innerText =
    "Welcome, " + user.username + " (" + user.role + ")";
}

// 🔥 MAIN FETCH (ONLY ONE FUNCTION)
async function fetchIssues() {
  document.getElementById("loading").style.display = "block";

  const res = await fetch(`${API}/issues`, {
    headers: { Authorization: token },
  });

  let data = await res.json();

  document.getElementById("loading").style.display = "none";

  const search = document.getElementById("search").value.toLowerCase();
  const statusFilter = document.getElementById("statusFilter").value;

  // FILTER
  data = data.filter(
    (i) =>
      i.title.toLowerCase().includes(search) &&
      (!statusFilter || i.status === statusFilter),
  );

  // STATS
  document.getElementById("total").innerText = data.length;
  document.getElementById("openCount").innerText = data.filter(
    (i) => i.status === "Open",
  ).length;
  document.getElementById("resolvedCount").innerText = data.filter(
    (i) => i.status === "Resolved",
  ).length;

  const table = document.getElementById("tableBody");
  const empty = document.getElementById("empty");

  table.innerHTML = "";

  if (data.length === 0) {
    empty.style.display = "block";
    return;
  } else {
    empty.style.display = "none";
  }

  data.forEach((i) => {
    table.innerHTML += `
      <tr>
        <td>${i.createdBy}</td>
        <td>${i.title}</td>
        <td>${i.category}</td>
        <td>${i.priority}</td>
        <td class="${i.status.toLowerCase()}">${i.status}</td>
        <td>${new Date(i.createdAt).toLocaleDateString()}</td>
        <td>
          ${
            user && user.role === "admin"
              ? `
              <button class="btn pending-btn" onclick="updateStatus(${i.id}, 'Pending')">⏳</button>
              <button class="btn resolve-btn" onclick="updateStatus(${i.id}, 'Resolved')">✔</button>
              <button class="btn reject-btn" onclick="updateStatus(${i.id}, 'Rejected')">❌</button>
              <button class="btn delete-btn" onclick="deleteIssue(${i.id})">🗑</button>
            `
              : "<span style='color:gray'>User</span>"
          }
        </td>
      </tr>
    `;
  });
}

// ADD ISSUE
async function addIssue() {
  const title = document.getElementById("title").value;
  const student = document.getElementById("student").value;
  const category = document.getElementById("category").value;
  const priority = document.getElementById("priority").value;

  if (!title || !student) {
    alert("Please fill all fields");
    return;
  }

  await fetch(`${API}/issues`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: token,
    },
    body: JSON.stringify({ title, student, category, priority }),
  });

  // Clear form
  document.getElementById("title").value = "";
  document.getElementById("student").value = "";

  fetchIssues();
}

// UPDATE
async function updateStatus(id, status) {
  await fetch(`${API}/issues/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: token,
    },
    body: JSON.stringify({ status }),
  });

  fetchIssues();
}

// DELETE
async function deleteIssue(id) {
  await fetch(`${API}/issues/${id}`, {
    method: "DELETE",
    headers: { Authorization: token },
  });

  fetchIssues();
}

// LOGOUT
function logout() {
  localStorage.removeItem("token");
  location.href = "login.html";
}

// INIT
fetchIssues();
