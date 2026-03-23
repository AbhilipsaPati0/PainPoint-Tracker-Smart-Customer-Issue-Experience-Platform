// ============================================================
//  firebase-config.js
//  PainPoint Tracker – Firebase App Initialization
//  ⚠️  Replace the firebaseConfig object below with your own
//      project credentials from the Firebase Console.
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

// ─── 🔑 YOUR FIREBASE PROJECT CONFIG ───────────────────────
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyD3rYivUSDypVGJ_day6Ty2kKJ0toqGN2I",
  authDomain: "painpointtracker.firebaseapp.com",
  projectId: "painpointtracker",
  storageBucket: "painpointtracker.firebasestorage.app",
  messagingSenderId: "613625718191",
  appId: "1:613625718191:web:c29155a249610db8d23b5a",
  measurementId: "G-5P62Y22RB6"
};

// Initialize Firebase
const analytics = getAnalytics(app);
// ───────────────────────────────────────────────────────────

const app       = initializeApp(firebaseConfig);
const auth      = getAuth(app);
const db        = getFirestore(app);
const storage   = getStorage(app);
const googleProvider = new GoogleAuthProvider();

export { app, auth, db, storage, googleProvider };
