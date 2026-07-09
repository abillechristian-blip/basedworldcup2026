import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyA_o5UZCT3ABAEbTu4uSygQzEat7i4NVqQ",
  authDomain: "basedwc2026.firebaseapp.com",
  projectId: "basedwc2026",
  storageBucket: "basedwc2026.firebasestorage.app",
  messagingSenderId: "346613525837",
  appId: "1:346613525837:web:9c82268ff72aa1dad0db04",
  databaseURL: "https://basedwc2026-default-rtdb.firebaseio.com",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

let saveTimer = null;
export function saveState(players, teamPoints) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    set(ref(db, "wc2026"), { players, teamPoints });
  }, 500);
}

export function listenState(callback) {
  onValue(ref(db, "wc2026"), (snap) => {
    callback(snap.val());
  });
}
