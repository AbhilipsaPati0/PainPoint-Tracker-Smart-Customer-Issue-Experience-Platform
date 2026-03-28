const API = "http://localhost:5000";

function goRegister() {
  window.location.href = "register.html";
}

function goLogin() {
  window.location.href = "login.html";
}

async function register() {
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;
  const role = document.getElementById("role").value;

  if (!username || !password) {
    alert("Fill all fields!");
    return;
  }

  const res = await fetch(`${API}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, role }),
  });

  const data = await res.json();

  if (res.status !== 200) {
    alert(data.message);
    return;
  }

  alert("Registered Successfully!");
  goLogin();
}

async function login() {
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  const res = await fetch(`${API}/login`, {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ username, password })
  });

  const data = await res.json();

  if (res.status !== 200) {
    alert(data.message);
    return;
  }

  localStorage.setItem("token", data.token);
  window.location.href = "index.html";
}

/* PASSWORD TOGGLE */
function togglePassword() {
  const passwordInput = document.getElementById("password");
  const eye = document.querySelector(".eye-icon");

  if (!passwordInput) return;

  if (passwordInput.type === "password") {
    passwordInput.type = "text";
    eye.textContent = "🙈";
  } else {
    passwordInput.type = "password";
    eye.textContent = "👁️";
  }
}

/* THEME TOGGLE */
window.addEventListener("load", function () {
  if (localStorage.getItem("theme") === "light") {
    document.body.classList.add("light-mode");
    const btn = document.querySelector(".theme-btn");
    if (btn) btn.textContent = "☀️";
  }
});

function toggleTheme() {
  const btn = document.querySelector(".theme-btn");

  document.body.classList.toggle("light-mode");

  if (document.body.classList.contains("light-mode")) {
    localStorage.setItem("theme", "light");
    if (btn) btn.textContent = "☀️";
  } else {
    localStorage.setItem("theme", "dark");
    if (btn) btn.textContent = "🌙";
  }
}