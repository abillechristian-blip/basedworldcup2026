import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyA_o5UZCT3ABAEbTu4uSygQzEat7i4NVqQ",
  authDomain: "basedwc2026.firebaseapp.com",
  databaseURL: "https://basedwc2026-default-rtdb.firebaseio.com",
  projectId: "basedwc2026",
  storageBucket: "basedwc2026.firebasestorage.app",
  messagingSenderId: "346613525837",
  appId: "1:346613525837:web:9c82268ff72aa1dad0db04",
  measurementId: "G-1WRPLZP57S"
};

const app = initializeApp(firebaseConfig);
const db  = getDatabase(app);

// Save all app state to Firebase
export function saveState(players, teamPoints) {
  set(ref(db, "wc2026"), { players, teamPoints });
}

// Listen for real-time updates from Firebase
export function listenState(callback) {
  onValue(ref(db, "wc2026"), (snapshot) => {
    const data = snapshot.val();
    if (data) callback(data);
  });
}
