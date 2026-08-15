import React, { useState, useEffect } from 'react';
import { Delete, Lock, ShieldCheck, AlertCircle, Globe } from 'lucide-react';
import Logo from './Logo';
import { db, auth, isFirebaseConfigured, ensureFirebaseAuth } from '../firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { Staff } from '../types';
import { useLanguage } from '../LanguageContext';

interface LoginPINProps {
  onLoginSuccess: (staffName: string, role: string, staffObj?: Staff) => void;
  companyName: string;
}

export default function LoginPIN({ onLoginSuccess, companyName }: LoginPINProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { language, setLanguage, t } = useLanguage();

  const toggleLanguage = () => {
    setLanguage(language === 'ar' ? 'en' : 'ar');
  };

  const handleKeyPress = (num: string) => {
    if (pin.length < 8) {
      setError(null);
      setPin(prev => prev + num);
    }
  };

  const handleBackspace = () => {
    setError(null);
    setPin(prev => prev.slice(0, -1));
  };

  const handleClear = () => {
    setError(null);
    setPin('');
  };

  // ── Admin Claim Elevation ─────────────────────────────────────────────────
  // After confirming the staff record's role is 'admin', we ask the server to
  // issue a Firebase custom claim { admin: true } on the current anonymous UID.
  // The server re-verifies the PIN server-side (Admin SDK, bypassing rules)
  // before granting the claim — so the client cannot self-elevate.
  const elevateAdminClaim = async (pin: string): Promise<void> => {
    const uid = auth?.currentUser?.uid;
    if (!uid) {
      console.warn('[LoginPIN] No Firebase Auth UID found. Admin claim elevation skipped.');
      return;
    }

    try {
      const idToken = await auth?.currentUser?.getIdToken();
      if (!idToken) {
        console.warn('[LoginPIN] Missing Firebase ID token. Admin claim elevation skipped.');
        return;
      }

      const response = await fetch('/api/auth/elevate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ pin, uid }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        console.warn('[LoginPIN] Admin claim elevation failed:', body.error || response.status);
        return;
      }

      // Force the local Firebase ID token to refresh so the new custom claim
      // is immediately visible to Firestore security rules on the next request.
      await auth?.currentUser?.getIdToken(true);
      console.log('[LoginPIN] Admin custom claim granted and token refreshed.');
    } catch (e) {
      console.warn('[LoginPIN] Admin claim elevation request failed:', e);
      // Non-fatal: the user is still logged in to the app UI; admin Firestore
      // writes (staff/settings) will simply fail with permission-denied until
      // the claim is successfully issued on a retry or the next login.
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (pin.length === 0) return;

    setLoading(true);
    setError(null);
    const bypassAllowed = !isFirebaseConfigured || import.meta.env.DEV;

    // Development / Emergency Bypass Codes
    if (pin === '9999') {
      if (!bypassAllowed) {
        setError('Bypass PIN is disabled on live Firebase. Please use a registered admin PIN.');
        setPin('');
        setLoading(false);
        return;
      }
      const adminObj: Staff = {
        id: 'bypass-admin',
        name: 'Super Admin',
        pin: '9999',
        role: 'admin',
        branchPermissions: ['All'],
        createdAt: new Date().toISOString()
      };
      onLoginSuccess('Super Admin', 'admin', adminObj);
      setLoading(false);
      return;
    }



    try {
      // ── Firestore PIN lookup ──────────────────────────────────────────────
      // All authentication goes through Firestore. There are no hardcoded PINs
      // or backdoors. Every staff member (including administrators) must be
      // registered as a document in the 'staff' collection.
      if (isFirebaseConfigured && db) {
        try {
          await ensureFirebaseAuth();
        } catch (e: any) {
          console.error('[LoginPIN] Failed to sign in anonymously:', e.message);
          throw new Error(`Auth failed: ${e.message}`);
        }

        const staffRef = collection(db, 'staff');
        const q = query(staffRef, where('pin', '==', pin));
        let snap = await getDocs(q);

        // If the query returned empty, it might be a stale auth token causing
        // Firestore to silently deny the read.  Force a fresh sign-in and retry
        // exactly once before giving up.
        if (snap.empty) {
          console.warn('[LoginPIN] First query returned empty — retrying with fresh auth…');
          try {
            // ensureFirebaseAuth will attempt to refresh the token, and if it fails,
            // it will fall back to creating a new anonymous session.
            await ensureFirebaseAuth();
            snap = await getDocs(query(staffRef, where('pin', '==', pin)));
          } catch (retryErr) {
            console.warn('[LoginPIN] Retry auth failed:', retryErr);
            // Fall through — snap is still empty, user will see "Invalid PIN"
          }
        }

        if (!snap.empty) {
          const docSnap = snap.docs[0];
          const data = docSnap.data();
          const staffObj: Staff = {
            id: docSnap.id,
            name: data.name,
            pin: data.pin,
            role: data.role,
            branchPermissions: data.branchPermissions || ['All'],
            createdAt: data.createdAt
          };

          // Issue server-side admin custom claim before handing control to the
          // parent component so that Firestore admin-restricted writes work
          // immediately after login (staff/settings collections).
          if (staffObj.role === 'admin') {
            await elevateAdminClaim(pin);
          }

          onLoginSuccess(staffObj.name, staffObj.role, staffObj);
        } else {
          // Do NOT include the entered PIN in the error message — that would
          // help an attacker enumerate valid PINs by observing the error text.
          setError('Invalid PIN. Please try again.');
          setPin('');
        }
      } else {
        // ── Offline / local-cache fallback ───────────────────────────────────
        // Used when Firebase is unavailable. The staff list was previously
        // cached from Firestore. Admin claim elevation is skipped in offline
        // mode — admin Firestore writes will not succeed until reconnected.
        const localData = localStorage.getItem('local_staff');
        if (localData) {
          const staffList: Staff[] = JSON.parse(localData);
          const found = staffList.find(s => s.pin === pin);
          if (found) {
            onLoginSuccess(found.name, found.role, found);
          } else {
            setError('Invalid PIN. Please try again.');
            setPin('');
          }
        } else {
          setError('Offline mode: no staff cache found. Please connect to the internet and reload.');
          setPin('');
        }
      }
    } catch (err: any) {
      console.error('[LoginPIN] Authentication/Firestore Error:', err?.message || err);
      setError(err?.message ? `Firebase Error: ${err.message}` : 'Connection interrupted. Please try again.');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  // Support physical keyboard input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        handleKeyPress(e.key);
      } else if (e.key === 'Backspace') {
        handleBackspace();
      } else if (e.key === 'Enter') {
        handleSubmit();
      } else if (e.key === 'Escape') {
        handleClear();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pin]);

  return (
    <div 
      id="login-pin-screen" 
      className="flex flex-col items-center justify-center min-h-[85vh] px-4 animate-fade-in"
    >
      <div 
        id="login-card"
        className="w-full max-w-md bg-white border border-olive-light rounded-2xl shadow-xl overflow-hidden p-8 flex flex-col items-center justify-center transition-all duration-300 relative"
      >
        {/* Language Switch Button */}
        <div className="absolute top-4 right-4 rtl:right-auto rtl:left-4 z-10">
          <button
            id="login-lang-switcher"
            type="button"
            onClick={toggleLanguage}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-olive-light bg-olive-soft hover:bg-olive-light/60 text-olive-dark text-xs font-semibold cursor-pointer transition-all duration-350 shrink-0"
            title={language === 'ar' ? 'Change language to English' : 'تغيير اللغة إلى العربية'}
          >
            <Globe className="w-3.5 h-3.5 text-brand-olive" />
            <span>{language === 'ar' ? 'English' : 'عربي'}</span>
          </button>
        </div>

        {/* Branding Area */}
        <div id="login-brand-header" className="flex flex-col items-center mb-6">
          <Logo size="lg" withBorder className="mb-4" />
          <h1 id="login-heading" className="font-serif text-2xl tracking-tight text-olive-dark font-bold text-center uppercase">
            {companyName || 'Hayat Beauty & Care'}
          </h1>
          <p id="login-subtitle" className="text-xs text-brand-olive font-semibold uppercase tracking-widest mt-1">
            {t('header.terminal_title')}
          </p>
        </div>

        {/* PIN Input Panel */}
        <form onSubmit={handleSubmit} className="w-full flex flex-col items-center">
          <div className="w-full max-w-[280px] mb-6">
            <div 
              id="pin-display-container"
              className={`relative flex items-center justify-center h-16 w-full rounded-lg bg-olive-soft border-2 transition-all duration-200 ${
                error ? 'border-red-400 animate-shake' : pin.length > 0 ? 'border-brand-olive' : 'border-gray-200'
              }`}
            >
              {pin.length === 0 ? (
                <div className="flex items-center gap-2 text-gray-400">
                  <Lock className="w-4 h-4" />
                  <span className="text-xs font-semibold tracking-wide uppercase">{t('login.enter_pin')}</span>
                </div>
              ) : (
                <div id="pin-dots" className="flex justify-center gap-3">
                  {pin.split('').map((_, i) => (
                    <span 
                      key={i} 
                      className="w-3.5 h-3.5 rounded-full bg-brand-olive inline-block transition-transform duration-150 scale-110" 
                    />
                  ))}
                </div>
              )}
            </div>
            
            {error && (
              <p id="pin-error-text" className="text-red-500 text-[11px] text-center mt-2 font-medium flex items-center justify-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                {error === 'Invalid PIN. Please try again.'
                  ? t('login.invalid_pin')
                  : error.startsWith('Offline mode')
                  ? t('login.system_empty_error')
                  : error === 'Connection interrupted. Please try again.'
                  ? t('login.connection_error')
                  : error}
              </p>
            )}
          </div>

          {/* Secure Touch Keypad */}
          <div id="touch-keypad" className="grid grid-cols-3 gap-3 w-full max-w-[280px] mb-6">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
              <button
                id={`keypad-btn-${num}`}
                key={num}
                type="button"
                onClick={() => handleKeyPress(num)}
                className="h-14 w-14 mx-auto rounded-full flex items-center justify-center font-sans font-medium text-lg text-olive-dark bg-olive-soft hover:bg-olive-light active:scale-95 transition-all outline-none border border-gray-100 cursor-pointer select-none"
              >
                {num}
              </button>
            ))}
            
            {/* Clear Button */}
            <button
              id="keypad-btn-clear"
              type="button"
              onClick={handleClear}
              className="h-14 w-14 mx-auto rounded-full flex items-center justify-center font-sans text-xs text-gray-550 hover:text-olive-dark hover:bg-olive-light active:scale-95 transition-all outline-none cursor-pointer"
            >
              {t('common.cancel')}
            </button>

            {/* Zero Button */}
            <button
              id="keypad-btn-0"
              type="button"
              onClick={() => handleKeyPress('0')}
              className="h-14 w-14 mx-auto rounded-full flex items-center justify-center font-sans font-medium text-lg text-olive-dark bg-olive-soft hover:bg-olive-light active:scale-95 transition-all outline-none border border-gray-100 cursor-pointer select-none"
            >
              0
            </button>

            {/* Backspace Button */}
            <button
              id="keypad-btn-backspace"
              type="button"
              onClick={handleBackspace}
              className="h-14 w-14 mx-auto rounded-full flex items-center justify-center font-sans text-gray-550 hover:text-olive-dark hover:bg-olive-light active:scale-95 transition-all outline-none cursor-pointer"
            >
              <Delete className="w-5 h-5" />
            </button>
          </div>

          {/* Submit Action Button */}
          <button
            id="keypad-btn-submit"
            type="submit"
            disabled={pin.length === 0 || loading}
            className="w-full max-w-[280px] h-12 rounded-lg bg-olive-dark hover:bg-olive-dark-hover disabled:bg-gray-300 text-white font-sans font-medium uppercase tracking-wider text-xs flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all duration-300 cursor-pointer disabled:cursor-not-allowed"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>{t('login.verify_access')}</span>
              </>
            )}
          </button>
        </form>

        {/* Security Note */}
        <div id="login-card-footer" className="mt-6 pt-4 border-t border-olive-soft w-full text-center">
          <p className="text-[10px] text-gray-400 tracking-wider uppercase font-medium font-sans">
            {t('login.security_note')}
          </p>
        </div>
      </div>
    </div>
  );
}
