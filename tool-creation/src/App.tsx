import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { ToolBuilder } from './pages/ToolBuilder';
import { ToolDetail } from './pages/ToolDetail';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isReady, isAuthenticated } = useAuth();
  
  if (!isReady) {
    return (
      <div className="flex items-center justify-center w-full min-h-dvh bg-[#0f0f1a]">
        <div className="w-8 h-8 rounded-full border-2 border-violet-500/20 border-t-violet-500 animate-spin" />
      </div>
    );
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
}

function GlobalBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none z-[-1] overflow-hidden bg-[#0a0a10]">
      {/* Top right blue/violet glow */}
      <div className="absolute top-[-20%] right-[-10%] w-[70vw] h-[70vw] rounded-full bg-violet-600/10 blur-[120px] mix-blend-screen" />
      {/* Bottom left indigo glow */}
      <div className="absolute bottom-[-20%] left-[-10%] w-[60vw] h-[60vw] rounded-full bg-indigo-600/10 blur-[120px] mix-blend-screen" />
      {/* Subtle center highlight */}
      <div className="absolute top-[20%] left-[30%] w-[40vw] h-[40vw] rounded-full bg-fuchsia-500/5 blur-[100px] mix-blend-screen" />
      {/* Noise overlay for texture */}
      <div className="absolute inset-0 opacity-[0.015] mix-blend-overlay pointer-events-none" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }}></div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <GlobalBackground />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/tools/new" element={<ProtectedRoute><ToolBuilder /></ProtectedRoute>} />
          <Route path="/tools/:toolId" element={<ProtectedRoute><ToolDetail /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
