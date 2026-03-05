// firebase.js
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDjdPBhejFoFYXyX3E2bzEpwKbnwZYIGAc",
  authDomain: "boostifyx-65a44.firebaseapp.com",
  projectId: "boostifyx-65a44",
  storageBucket: "boostifyx-65a44.firebasestorage.app",
  messagingSenderId: "931864839863",
  appId: "1:931864839863:web:a6301bdbf22067b58c6f32"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and Firestore
const auth = getAuth(app);
const db = getFirestore(app);

// Export the initialized services for use in other modules
export { auth, db };
