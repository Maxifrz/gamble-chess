import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import { subscribeToAuthChanges } from '../services/authService';
import { getUserProfile, subscribeToUserProfile } from '../services/userService';

interface AuthContextType {
  firebaseUser: User | null;
  userProfile: any | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  firebaseUser: null,
  userProfile: null,
  loading: true,
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = subscribeToAuthChanges(async (fbUser) => {
      setFirebaseUser(fbUser);

      if (fbUser) {
        // Initial fetch
        const profile = await getUserProfile(fbUser.uid);
        setUserProfile(profile);

        // Real-time listener
        if (unsubscribeProfile) unsubscribeProfile();
        unsubscribeProfile = subscribeToUserProfile(fbUser.uid, (updatedProfile) => {
          setUserProfile(updatedProfile);
        });
      } else {
        setUserProfile(null);
        if (unsubscribeProfile) {
          unsubscribeProfile();
          unsubscribeProfile = null;
        }
      }

      setLoading(false);
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ firebaseUser, userProfile, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
