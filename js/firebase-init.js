// Firebase 초기화
// 사용자 안내: firebase init 후 받은 config 값으로 교체하세요.
// 콘솔 → 프로젝트 설정 → 일반 → 내 앱 → SDK 설정 및 구성

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, addDoc, setDoc,
  updateDoc, deleteDoc, query, where, orderBy, limit, onSnapshot,
  serverTimestamp, Timestamp, increment
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";

// ▼ 여기를 실제 값으로 교체 ─────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyC34CIeA5xDPS2DQMSscO6hyXgI6tMgke8",
  authDomain: "eastar-change-mgmt.firebaseapp.com",
  projectId: "eastar-change-mgmt",
  storageBucket: "eastar-change-mgmt.firebasestorage.app",
  messagingSenderId: "93898954000",
  appId: "1:93898954000:web:2b687fc627d3e34f59c195",
  measurementId: "G-4G9002MGKN"
};
// ─────────────────────────────────────────────────

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export {
  db, auth,
  collection, doc, getDoc, getDocs, addDoc, setDoc,
  updateDoc, deleteDoc, query, where, orderBy, limit, onSnapshot,
  serverTimestamp, Timestamp, increment,
  signInWithEmailAndPassword, signOut, onAuthStateChanged
};
