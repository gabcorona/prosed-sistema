// firebase-config.js — importado pelo admin e pelo formulário
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc,
         updateDoc, deleteDoc, query, where, orderBy, onSnapshot, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey:            "AIzaSyA2Xee7E8r2YfGEsMunsjw7qk8GEH0p1DQ",
  authDomain:        "prosed-concurso.firebaseapp.com",
  projectId:         "prosed-concurso",
  storageBucket:     "prosed-concurso.firebasestorage.app",
  messagingSenderId: "660448637371",
  appId:             "1:660448637371:web:cfc64e9c4f39d3e74e549e"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

export { db, collection, doc, getDoc, getDocs, setDoc, addDoc,
         updateDoc, deleteDoc, query, where, orderBy, onSnapshot, serverTimestamp };
