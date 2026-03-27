import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";

// Load config
const configPath = "./firebase-applet-config.json";
if (!fs.existsSync(configPath)) {
  console.error("Config file not found");
  process.exit(1);
}

const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));

const adminApp = admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: firebaseConfig.projectId,
});

const firestore = getFirestore(adminApp, firebaseConfig.firestoreDatabaseId);

async function makeAdmin() {
  const email = "Maxi.Fritz2405@gmail.com";
  console.log(`Searching for user with email: ${email}`);
  
  const usersRef = firestore.collection("users");
  const snapshot = await usersRef.where("email", "==", email).get();
  
  if (snapshot.empty) {
    console.log("User not found in Firestore. They might need to log in first.");
    
    // Check Firebase Auth directly
    try {
      const authUser = await admin.auth().getUserByEmail(email);
      console.log(`Found user in Firebase Auth: ${authUser.uid}. Creating Firestore document...`);
      
      await usersRef.doc(authUser.uid).set({
        email: email,
        username: "Admin",
        role: "admin",
        balance: 10,
        elo: 1200,
        winRate: 0,
        totalMatches: 0,
        totalWins: 0,
        winStreak: 0,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastActive: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      
      console.log("Successfully created admin document.");
    } catch (e: any) {
      console.error("User not found in Firebase Auth either:", e.message);
    }
    
    process.exit(0);
  }
  
  for (const doc of snapshot.docs) {
    console.log(`Updating user ${doc.id}...`);
    await doc.ref.update({ role: "admin" });
    console.log("Successfully updated role to admin.");
  }
}

makeAdmin().catch(console.error);
