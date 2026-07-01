import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAwl4fdlX8K3L-4MvUv_SuKbJa_8gugpjo",
  authDomain: "absensi-web-81e51.firebaseapp.com",
  projectId: "absensi-web-81e51",
  storageBucket: "absensi-web-81e51.firebasestorage.app",
  messagingSenderId: "546156747769",
  appId: "1:546156747769:web:ae54e57475b9de7acd3b28",
  measurementId: "G-4RDFSE2KEJ"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export { app, auth, db };
