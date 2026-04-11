import React, { createContext, useContext, useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';

interface AuthContextValue {
  isReady: boolean;
  isAuthenticated: boolean;
  token: string | null;
  userId: string | null;
}

const AuthContext = createContext<AuthContextValue>({
  isReady: false,
  isAuthenticated: false,
  token: null,
  userId: null,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, getAccessToken, user } = usePrivy();
  
  const [privyToken, setPrivyToken] = useState<string | null>(localStorage.getItem('privy_access_token'));
  
  useEffect(() => {
    if (ready && authenticated) {
      getAccessToken().then(token => {
        if (token) {
          localStorage.setItem('privy_access_token', token);
          setPrivyToken(token);
        }
      });
    } else if (ready && !authenticated) {
      localStorage.removeItem('privy_access_token');
      setPrivyToken(null);
    }
  }, [ready, authenticated, getAccessToken]);

  return (
    <AuthContext.Provider value={{
      isReady: ready,
      isAuthenticated: authenticated,
      token: privyToken,
      userId: user?.id || null 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
