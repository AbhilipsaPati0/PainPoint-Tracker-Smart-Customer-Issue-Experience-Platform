// ============================================================
//  auth.js
//  PainPoint Tracker – Authentication Logic
//  Handles: Login, Register, Google Sign-In, Password Reset,
//           Auth State Guard, Logout
// ============================================================

import { auth, db, googleProvider } from "./firebase-config.js";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, setDoc, getDoc, getDocs, collection, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ─── Admin Emails ────────────────────────────────────────────
// Users who register with these emails automatically get admin role.

const ADMIN_EMAILS = [
  "abhilipsapati9@gmail.com",
  "sagnikasubhadarshini@gmail.com",
];

// ─── Helpers ────────────────────────────────────────────────

function showAlert(alertEl, msgEl, message, type = "danger") {
  alertEl.className = `alert alert-${type}`;
  msgEl.textContent = message;
  alertEl.classList.remove("d-none");
}

function setLoading(btn, textEl, loadingEl, isLoading) {
  btn.disabled = isLoading;
  textEl.classList.toggle("d-none", isLoading);
  loadingEl.classList.toggle("d-none", !isLoading);
}

function friendlyError(code) {
  const map = {
    "auth/user-not-found":       "No account found with this email.",
    "auth/wrong-password":       "Incorrect password. Please try again.",
    "auth/invalid-email":        "Please enter a valid email address.",
    "auth/email-already-in-use": "An account with this email already exists.",
    "auth/weak-password":        "Password must be at least 6 characters.",
    "auth/too-many-requests":    "Too many attempts. Please try again later.",
    "auth/popup-closed-by-user": "Google sign-in was cancelled.",
    "auth/network-request-failed": "Network error. Check your connection.",
  };
  return map[code] || "Something went wrong. Please try again.";
}

// ─── Create Firestore user profile ──────────────────────────

async function createUserProfile(user, extraData = {}) {
  const userRef = doc(db, "users", user.uid);
  const snap    = await getDoc(userRef);
  const isAdmin = ADMIN_EMAILS.includes(user.email?.toLowerCase());

  if (!snap.exists()) {
    // New user — assign role based on ADMIN_EMAILS list
    await setDoc(userRef, {
      uid:         user.uid,
      name:        user.displayName || extraData.name || "Anonymous",
      email:       user.email,
      role:        isAdmin ? "admin" : "user",
      photoURL:    user.photoURL || "",
      createdAt:   serverTimestamp(),
      issuesCount: 0,
    });
  } else if (isAdmin && snap.data().role !== "admin") {
    // Existing user whose email is in the admin list — upgrade silently
    // (handles Google sign-in on a pre-existing account)
    await setDoc(userRef, { role: "admin" }, { merge: true });
  }
}

// ─── LOGIN PAGE ──────────────────────────────────────────────

const loginForm = document.getElementById("loginForm");
if (loginForm) {
  const emailInput   = document.getElementById("loginEmail");
  const passwordInput= document.getElementById("loginPassword");
  const rememberMe   = document.getElementById("rememberMe");
  const alertEl      = document.getElementById("loginAlert");
  const alertMsg     = document.getElementById("loginAlertMsg");
  const loginBtn     = document.getElementById("loginBtn");
  const loginBtnText = document.getElementById("loginBtnText");
  const loginBtnLoad = document.getElementById("loginBtnLoading");

  // Password visibility toggle
  document.getElementById("toggleLoginPwd")?.addEventListener("click", () => {
    const isText = passwordInput.type === "text";
    passwordInput.type = isText ? "password" : "text";
    document.getElementById("toggleLoginPwd").innerHTML =
      isText ? '<i class="bi bi-eye"></i>' : '<i class="bi bi-eye-slash"></i>';
  });

  // Forgot password
  document.getElementById("forgotPasswordLink")?.addEventListener("click", async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    if (!email) {
      showAlert(alertEl, alertMsg, "Enter your email above first.", "warning");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      showAlert(alertEl, alertMsg, "Password reset email sent! Check your inbox.", "success");
    } catch (err) {
      showAlert(alertEl, alertMsg, friendlyError(err.code));
    }
  });

  // Google sign-in
  document.getElementById("googleSignInBtn")?.addEventListener("click", async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      await createUserProfile(result.user);
      window.location.href = "explore.html";
    } catch (err) {
      showAlert(alertEl, alertMsg, friendlyError(err.code));
    }
  });

  // Email / password login
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    alertEl.classList.add("d-none");
    const email    = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !password) {
      showAlert(alertEl, alertMsg, "Please fill in all fields.");
      return;
    }
    setLoading(loginBtn, loginBtnText, loginBtnLoad, true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      window.location.href = "explore.html";
    } catch (err) {
      showAlert(alertEl, alertMsg, friendlyError(err.code));
    } finally {
      setLoading(loginBtn, loginBtnText, loginBtnLoad, false);
    }
  });
}

// ─── REGISTER PAGE ───────────────────────────────────────────

const registerForm = document.getElementById("registerForm");
if (registerForm) {
  const nameInput    = document.getElementById("registerName");
  const emailInput   = document.getElementById("registerEmail");
  const roleSelect   = document.getElementById("registerRole");
  const passwordInput= document.getElementById("registerPassword");
  const confirmInput = document.getElementById("registerConfirmPassword");
  const alertEl      = document.getElementById("registerAlert");
  const alertMsg     = document.getElementById("registerAlertMsg");
  const successEl    = document.getElementById("registerSuccess");
  const strengthBar  = document.getElementById("passwordStrengthBar");
  const strengthText = document.getElementById("passwordStrengthText");
  const matchHint    = document.getElementById("passwordMatchHint");

  // Password strength meter
  passwordInput?.addEventListener("input", () => {
    const val = passwordInput.value;
    let score = 0;
    if (val.length >= 8)             score++;
    if (/[A-Z]/.test(val))           score++;
    if (/[0-9]/.test(val))           score++;
    if (/[^A-Za-z0-9]/.test(val))   score++;
    const levels = [
      { label: "Too short",  color: "#f43f5e", width: "15%" },
      { label: "Weak",       color: "#f59e0b", width: "35%" },
      { label: "Fair",       color: "#f59e0b", width: "60%" },
      { label: "Good",       color: "#00c9a7", width: "80%" },
      { label: "Strong",     color: "#00c9a7", width: "100%" },
    ];
    const lvl = val.length === 0 ? { label: "", color: "transparent", width: "0%" } : levels[score];
    strengthBar.style.width = lvl.width;
    strengthBar.style.backgroundColor = lvl.color;
    strengthText.textContent = lvl.label;
    strengthText.style.color = lvl.color;
  });

  // Password match hint
  confirmInput?.addEventListener("input", () => {
    if (!matchHint) return;
    if (confirmInput.value === "") { matchHint.textContent = ""; return; }
    if (confirmInput.value === passwordInput.value) {
      matchHint.textContent = "✓ Passwords match";
      matchHint.style.color = "#00c9a7";
    } else {
      matchHint.textContent = "✗ Passwords do not match";
      matchHint.style.color = "#f43f5e";
    }
  });

  // Google register
  document.getElementById("googleRegisterBtn")?.addEventListener("click", async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      await createUserProfile(result.user);
      window.location.href = "explore.html";
    } catch (err) {
      showAlert(alertEl, alertMsg, friendlyError(err.code));
    }
  });

  // Email register
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    alertEl?.classList.add("d-none");
    successEl?.classList.add("d-none");

    const name     = nameInput.value.trim();
    const email    = emailInput.value.trim();
    const role     = roleSelect?.value || "user";
    const password = passwordInput.value;
    const confirm  = confirmInput.value;

    if (!name || !email || !password || !confirm) {
      showAlert(alertEl, alertMsg, "Please fill in all required fields.");
      return;
    }
    if (password !== confirm) {
      showAlert(alertEl, alertMsg, "Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      showAlert(alertEl, alertMsg, "Password must be at least 6 characters.");
      return;
    }

    const submitBtn  = registerForm.querySelector('[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = "Creating account...";

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: name });
      await createUserProfile(cred.user, { name, role });
      successEl?.classList.remove("d-none");
      setTimeout(() => { window.location.href = "explore.html"; }, 1500);
    } catch (err) {
      showAlert(alertEl, alertMsg, friendlyError(err.code));
      submitBtn.disabled = false;
      submitBtn.textContent = "Create Account";
    }
  });
}

// ─── LOGOUT ──────────────────────────────────────────────────

document.querySelectorAll(".logout-btn").forEach(btn => {
  btn.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "login.html";
  });
});

// ─── AUTH STATE OBSERVER ─────────────────────────────────────
// Updates navbar UI and protects pages that require login.

const PROTECTED_PAGES = ["submit.html", "dashboard.html", "issue-details.html"];
const GUEST_ONLY      = ["login.html", "register.html"];

onAuthStateChanged(auth, async (user) => {
  const page = window.location.pathname.split("/").pop() || "index.html";

  if (user) {
    // Redirect away from login/register if already signed in
    if (GUEST_ONLY.includes(page)) {
      window.location.href = "explore.html";
      return;
    }

    // Fetch role from Firestore
    let role = "user";
    try {
      const snap = await getDoc(doc(db, "users", user.uid));
      if (snap.exists()) role = snap.data().role;
    } catch (_) {}

    // Show/hide admin-only elements
    document.querySelectorAll(".admin-only").forEach(el => {
      el.style.display = role === "admin" ? "" : "none";
    });

    // Navbar: show user name + logout, hide login/register links
    document.querySelectorAll(".nav-user-name").forEach(el => {
      el.textContent = user.displayName || user.email;
    });
    document.querySelectorAll(".nav-logged-in").forEach(el => el.classList.remove("d-none"));
    document.querySelectorAll(".nav-logged-out").forEach(el => el.classList.add("d-none"));

    // Hide "login to comment" prompt on issue-details
    document.getElementById("loginToComment")?.classList.add("d-none");
    document.getElementById("commentInputArea")?.classList.remove("d-none");

    // Expose current user globally so other scripts can access it
    window.currentUser = user;
    window.currentUserRole = role;

  } else {
    // Redirect to login if on a protected page
    if (PROTECTED_PAGES.includes(page)) {
      window.location.href = `login.html?redirect=${encodeURIComponent(page)}`;
      return;
    }
    document.querySelectorAll(".nav-logged-in").forEach(el => el.classList.add("d-none"));
    document.querySelectorAll(".nav-logged-out").forEach(el => el.classList.remove("d-none"));
    document.querySelectorAll(".admin-only").forEach(el => el.style.display = "none");

    document.getElementById("loginToComment")?.classList.remove("d-none");
    document.getElementById("commentInputArea")?.classList.add("d-none");

    window.currentUser = null;
    window.currentUserRole = null;
  }
});

export { createUserProfile };
