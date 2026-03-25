// Import Firebase from CDN (important)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

// Your config
const firebaseConfig = {
  apiKey: "AIzaSyB9Yw4B-8Vd3yxZoLFTVBNsNDJ_3ldWgD4",
  authDomain: "painpoint-tracker-bf912.firebaseapp.com",
  projectId: "painpoint-tracker-bf912",
  storageBucket: "painpoint-tracker-bf912.firebasestorage.app",
  messagingSenderId: "644457921290",
  appId: "1:644457921290:web:c339591f8032857880d8f3",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export default app;