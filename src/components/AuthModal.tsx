'use client';

import { useState } from 'react';
import { signIn, signUp, signOut } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

interface AuthModalProps {
  onClose: () => void;
}

type Mode = 'login' | 'register';

export default function AuthModal({ onClose }: AuthModalProps) {
  const { user } = useAuth();
  const [mode, setMode]       = useState<Mode>('login');
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      if (mode === 'login') {
        const { error: err } = await signIn(email, password);
        if (err) throw err;
        onClose();
      } else {
        const { error: err } = await signUp(email, password);
        if (err) throw err;
        setSuccess('Compte créé ! Vérifiez votre email pour confirmer votre adresse.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue';
      if (msg.includes('Invalid login credentials')) {
        setError('Email ou mot de passe incorrect.');
      } else if (msg.includes('User already registered')) {
        setError('Cet email est déjà utilisé. Connectez-vous.');
      } else if (msg.includes('Password should be')) {
        setError('Le mot de passe doit faire au moins 6 caractères.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    onClose();
  };

  // ── Vue connecté ──────────────────────────────────────────────────────────
  if (user) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-black text-gray-900 dark:text-white">Mon compte</h2>
            <button onClick={onClose}
              className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700">
              ✕
            </button>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-4 mb-6 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
              {user.email?.[0]?.toUpperCase() ?? '?'}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">{user.email}</p>
              <p className="text-xs text-blue-600 dark:text-blue-400">✅ Trajets synchronisés</p>
            </div>
          </div>

          <button
            onClick={handleSignOut}
            className="w-full py-3 rounded-2xl border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 font-semibold text-sm hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            Se déconnecter
          </button>
        </div>
      </div>
    );
  }

  // ── Vue non connecté ──────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-sm">
        {/* Header */}
        <div className="p-6 pb-0 flex items-center justify-between">
          <h2 className="text-lg font-black text-gray-900 dark:text-white">
            {mode === 'login' ? 'Connexion' : 'Créer un compte'}
          </h2>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700">
            ✕
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Pitch */}
          <p className="text-xs text-gray-500 dark:text-gray-400">
            💾 Vos trajets seront sauvegardés en ligne et accessibles depuis tous vos appareils.
          </p>

          {/* Succès */}
          {success && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-2xl p-3 text-xs text-green-700 dark:text-green-300">
              {success}
            </div>
          )}

          {/* Erreur */}
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-3 text-xs text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1 block">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="vous@exemple.com"
                className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1 block">
                Mot de passe
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                placeholder={mode === 'register' ? '6 caractères minimum' : '••••••••'}
                minLength={6}
                className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-500 to-blue-600 text-white font-bold py-3 rounded-2xl disabled:opacity-60 flex items-center justify-center gap-2 text-sm"
            >
              {loading ? (
                <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Chargement…</>
              ) : mode === 'login' ? 'Se connecter' : 'Créer le compte'}
            </button>
          </form>

          {/* Toggle mode */}
          <button
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); setSuccess(null); }}
            className="w-full text-xs text-gray-500 dark:text-gray-400 hover:text-blue-500 transition-colors"
          >
            {mode === 'login'
              ? "Pas encore de compte ? S'inscrire"
              : 'Déjà un compte ? Se connecter'}
          </button>

          <button onClick={onClose} className="w-full text-xs text-gray-400 dark:text-gray-600 hover:text-gray-600">
            Continuer sans compte
          </button>
        </div>
      </div>
    </div>
  );
}
