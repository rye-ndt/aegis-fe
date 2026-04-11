import React from 'react';

type Props = {
  mode: 'create' | 'unlock';
  onSubmit: (password: string) => void;
  error?: string;
};

export function PasswordDialog({ mode, onSubmit, error }: Props) {
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');

  const isValid =
    mode === 'create' ? password.length >= 8 && password === confirm : password.length >= 1;

  const handleSubmit = () => { if (isValid) onSubmit(password); };
  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleSubmit(); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6">
      <div className="w-full max-w-sm bg-[#0f0f1a] border border-white/10 rounded-2xl p-6 flex flex-col gap-4">
        <h2 className="text-base font-semibold text-white">
          {mode === 'create' ? 'Set a delegation key password' : 'Unlock your delegation key'}
        </h2>
        <p className="text-xs text-white/40 leading-relaxed">
          {mode === 'create'
            ? 'This password encrypts your signing key stored in Telegram. Minimum 8 characters. Cannot be recovered if lost.'
            : 'Enter the password you set when you first connected.'}
        </p>

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/25 outline-none focus:border-violet-500/60"
        />

        {mode === 'create' && (
          <input
            type="password"
            placeholder="Confirm password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/25 outline-none focus:border-violet-500/60"
          />
        )}

        {error && <p className="text-xs text-red-400">{error}</p>}
        {mode === 'create' && password.length > 0 && password.length < 8 && (
          <p className="text-xs text-white/30">At least 8 characters required</p>
        )}

        <button
          onClick={handleSubmit}
          disabled={!isValid}
          className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors"
        >
          {mode === 'create' ? 'Create key' : 'Unlock'}
        </button>
      </div>
    </div>
  );
}
