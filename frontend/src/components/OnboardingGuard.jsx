import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useIdentity } from '../hooks/useIdentity';

/**
 * Guest-friendly onboarding guard:
 * - Auto-detects forum by calling /api/v1/categories on mount
 * - If the API responds OK, sets forum_setup_done in localStorage
 * - Only PROTECTED routes require a wallet (identity)
 * - All other routes pass freely for guests (no wallet needed)
 * - If a guest hits a protected route, redirect to /identity with a message
 *
 * Whitelisted routes always pass: /setup, /identity, /settings
 * Protected routes (require wallet): /c/:id/new, /wallet, /marketplace, /escrow, /admin, /subscription
 */

const SETUP_KEY = 'forum_setup_done';
const WHITELIST = ['/setup', '/identity', '/settings'];

// Routes that require a wallet (identity) to access
const PROTECTED_ROUTES = ['/wallet', '/marketplace', '/escrow', '/admin', '/subscription'];

// Check if a path matches a protected route pattern
function isProtectedRoute(pathname) {
  // Exact prefix matches
  if (PROTECTED_ROUTES.some(p => pathname.startsWith(p))) return true;
  // /c/:id/new pattern (new thread)
  if (/^\/c\/[^/]+\/new$/.test(pathname)) return true;
  return false;
}

export default function OnboardingGuard({ children }) {
  const { identity, loading } = useIdentity();
  const location = useLocation();
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);

  // Auto-detect forum: call /api/v1/categories to check if forum is set up
  useEffect(() => {
    const setupDone = localStorage.getItem(SETUP_KEY);
    if (setupDone) return; // Already detected

    fetch('/api/v1/categories')
      .then(res => {
        if (res.ok) {
          localStorage.setItem(SETUP_KEY, 'true');
        }
      })
      .catch(() => {
        // Ignore — forum not reachable, will go to /setup
      });
  }, []);

  useEffect(() => {
    if (loading) return;

    const currentPath = location.pathname;

    // Don't redirect if already on a whitelisted page
    if (WHITELIST.some(p => currentPath.startsWith(p))) {
      setChecked(true);
      return;
    }

    const setupDone = localStorage.getItem(SETUP_KEY);

    // Step 1: No setup done yet -> go to /setup
    if (!setupDone) {
      navigate('/setup', { replace: true });
      return;
    }

    // Step 2: If this is a protected route and user has no wallet -> redirect to /identity
    if (isProtectedRoute(currentPath) && !identity) {
      navigate('/identity', {
        replace: true,
        state: { fromProtected: true },
      });
      return;
    }

    // Step 3: Has wallet but no username -> go to /identity (only if they have a wallet)
    if (identity && identity.address && !identity.username) {
      navigate('/identity', { replace: true });
      return;
    }

    // All good — guests can browse freely on non-protected routes
    setChecked(true);
  }, [identity, loading, location.pathname, navigate]);

  if (loading || !checked) {
    // Show nothing while checking — avoids flash
    return null;
  }

  return children;
}
