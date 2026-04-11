import { usePrivy } from '@privy-io/react-auth';
import { useAuth } from '../contexts/AuthContext';
import { Navigate } from 'react-router-dom';

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V7l-9-5z" fill="url(#shield-gradient)" />
      <path d="M9 12l2 2 4-4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <defs>
        <linearGradient id="shield-gradient" x1="3" y1="2" x2="21" y2="23" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7c3aed" />
          <stop offset="1" stopColor="#4f46e5" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function Login() {
  const { login, ready } = usePrivy();
  const { isAuthenticated } = useAuth();

  if (isAuthenticated && ready) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="flex flex-col items-center justify-between w-full min-h-dvh bg-[#0f0f1a] px-6 py-12">
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="relative mb-10">
          <div className="absolute inset-0 rounded-full bg-violet-600/30 blur-3xl scale-[2.5]" />
          <div className="relative flex items-center justify-center w-24 h-24 rounded-3xl bg-gradient-to-br from-violet-600/20 to-indigo-600/20 border border-violet-500/20">
            <ShieldIcon />
          </div>
        </div>
        <h1 className="text-3xl font-bold text-white tracking-tight mb-2">
          Aegis
        </h1>
        <p className="text-base text-white/40 text-center max-w-[220px] leading-relaxed">
          Your secure onchain identity, powered by Google
        </p>
      </div>

      <div className="w-full max-w-sm flex flex-col gap-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex-1 h-px bg-white/[0.08]" />
          <span className="text-xs text-white/25 font-medium">Get started</span>
          <div className="flex-1 h-px bg-white/[0.08]" />
        </div>

        <button
          onClick={login}
          disabled={!ready}
          className="
            group flex items-center justify-center gap-3
            w-full py-4 px-6 rounded-2xl
            bg-white hover:bg-white/95 active:bg-white/90
            text-gray-800 font-semibold text-[15px]
            transition-all duration-150
            shadow-[0_8px_32px_rgba(124,58,237,0.3)]
            hover:shadow-[0_8px_40px_rgba(124,58,237,0.45)]
            active:scale-[0.98]
            disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100
          "
        >
          <GoogleIcon />
          Continue with Google
        </button>

        <p className="text-center text-[11px] text-white/20 leading-relaxed px-2">
          A wallet is created automatically if you don't have one.
        </p>
      </div>
    </div>
  );
}
