import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User
} from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import { createUserProfile } from './userService';

export const signUp = async (email: string, password: string, username: string) => {
  try {
    const { user } = await createUserWithEmailAndPassword(auth, email, password);
    await createUserProfile(user.uid, { username, email });
    return { success: true, user };
  } catch (error: any) {
    return { success: false, error: parseAuthError(error.code) };
  }
};

export const signIn = async (email: string, password: string) => {
  try {
    const { user } = await signInWithEmailAndPassword(auth, email, password);
    return { success: true, user };
  } catch (error: any) {
    return { success: false, error: parseAuthError(error.code) };
  }
};

export const signInWithGoogle = async () => {
  try {
    const { user } = await signInWithPopup(auth, googleProvider);
    await createUserProfile(user.uid, {
      username: user.displayName || 'Player',
      email: user.email || '',
    }, true);
    return { success: true, user };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

export const logOut = () => signOut(auth);

export const subscribeToAuthChanges = (callback: (user: User | null) => void) => {
  return onAuthStateChanged(auth, callback);
};

const parseAuthError = (code: string) => {
  const messages: Record<string, string> = {
    'auth/email-already-in-use': 'That email is already registered.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/user-not-found': 'No account found with that email.',
    'auth/wrong-password': 'Incorrect password. Try again.',
    'auth/too-many-requests': 'Too many attempts. Please wait.',
  };
  return messages[code] || 'Something went wrong. Please try again.';
};
