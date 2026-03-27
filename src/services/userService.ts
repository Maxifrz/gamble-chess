import {
  doc, getDoc, setDoc, onSnapshot, serverTimestamp, db, handleFirestoreError, OperationType
} from '../lib/firebase';

export const createUserProfile = async (uid: string, data: { username: string, email: string }, merge = false) => {
  const userRef = doc(db, 'users', uid);
  try {
    const existing = await getDoc(userRef);
    
    const isAdmin = data.email === 'Maxi.Fritz2405@gmail.com';
    
    if (existing.exists()) {
      // Ensure the admin role is set even if the user already exists
      if (isAdmin && existing.data()?.role !== 'admin') {
        await setDoc(userRef, { role: 'admin' }, { merge: true });
      }
      // Update last active
      await setDoc(userRef, { lastActive: serverTimestamp() }, { merge: true });
      return;
    }

    await setDoc(userRef, {
      username: data.username || 'Player',
      email: data.email,
      balance: 10, // Starting balance
      elo: 1200,
      winRate: 0,
      totalMatches: 0,
      totalWins: 0,
      winStreak: 0,
      role: isAdmin ? 'admin' : 'user',
      createdAt: serverTimestamp(),
      lastActive: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${uid}`);
  }
};

export const getUserProfile = async (uid: string) => {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${uid}`);
  }
};

export const subscribeToUserProfile = (uid: string, callback: (data: any) => void) => {
  const userRef = doc(db, 'users', uid);
  return onSnapshot(userRef, (snap) => {
    if (snap.exists()) callback({ id: snap.id, ...snap.data() });
  }, (error) => {
    handleFirestoreError(error, OperationType.GET, `users/${uid}`);
  });
};
