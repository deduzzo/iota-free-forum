import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import LoadingSpinner from './components/LoadingSpinner';

/* ── Lazy-loaded pages ────────────────────────────────────────── */
const Home = lazy(() => import('./pages/Home'));
const Category = lazy(() => import('./pages/Category'));
const NewThread = lazy(() => import('./pages/NewThread'));
const Thread = lazy(() => import('./pages/Thread'));
const UserProfile = lazy(() => import('./pages/UserProfile'));
const Identity = lazy(() => import('./pages/Identity'));
const Admin = lazy(() => import('./pages/Admin'));
const ThemeAdmin = lazy(() => import('./pages/ThemeAdmin'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Settings = lazy(() => import('./pages/Settings'));
const Setup = lazy(() => import('./pages/Setup'));
const Wallet = lazy(() => import('./pages/Wallet'));
const Marketplace = lazy(() => import('./pages/Marketplace'));
const EscrowDashboard = lazy(() => import('./pages/EscrowDashboard'));
const Subscription = lazy(() => import('./pages/Subscription'));
const Users = lazy(() => import('./pages/Users'));
const Notifications = lazy(() => import('./pages/Notifications'));
const Messages = lazy(() => import('./pages/Messages'));
const AuditDashboard = lazy(() => import('./pages/AuditDashboard'));
const Governance = lazy(() => import('./pages/Governance'));
const AgentTesters = lazy(() => import('./pages/AgentTesters'));

/* ── Suspense fallback ────────────────────────────────────────── */
function PageFallback() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-4">
        <LoadingSpinner size={48} />
        <span
          className="text-sm font-mono tracking-wider animate-pulse"
          style={{ color: 'var(--color-primary)' }}
        >
          Loading...
        </span>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Suspense fallback={<PageFallback />}><Home /></Suspense>} />
        <Route path="/c/:id" element={<Suspense fallback={<PageFallback />}><Category /></Suspense>} />
        <Route path="/c/:id/new" element={<Suspense fallback={<PageFallback />}><NewThread /></Suspense>} />
        <Route path="/t/:id" element={<Suspense fallback={<PageFallback />}><Thread /></Suspense>} />
        <Route path="/u/:id" element={<Suspense fallback={<PageFallback />}><UserProfile /></Suspense>} />
        <Route path="/users" element={<Suspense fallback={<PageFallback />}><Users /></Suspense>} />
        <Route path="/identity" element={<Suspense fallback={<PageFallback />}><Identity /></Suspense>} />
        <Route path="/admin" element={<Suspense fallback={<PageFallback />}><Admin /></Suspense>} />
        <Route path="/admin/theme" element={<Suspense fallback={<PageFallback />}><ThemeAdmin /></Suspense>} />
        <Route path="/dashboard" element={<Suspense fallback={<PageFallback />}><Dashboard /></Suspense>} />
        <Route path="/settings" element={<Suspense fallback={<PageFallback />}><Settings /></Suspense>} />
        <Route path="/setup" element={<Suspense fallback={<PageFallback />}><Setup /></Suspense>} />
        <Route path="/wallet" element={<Suspense fallback={<PageFallback />}><Wallet /></Suspense>} />
        <Route path="/marketplace" element={<Suspense fallback={<PageFallback />}><Marketplace /></Suspense>} />
        <Route path="/escrow" element={<Suspense fallback={<PageFallback />}><EscrowDashboard /></Suspense>} />
        <Route path="/subscription" element={<Suspense fallback={<PageFallback />}><Subscription /></Suspense>} />
        <Route path="/notifications" element={<Suspense fallback={<PageFallback />}><Notifications /></Suspense>} />
        <Route path="/messages" element={<Suspense fallback={<PageFallback />}><Messages /></Suspense>} />
        <Route path="/admin/audit" element={<Suspense fallback={<PageFallback />}><AuditDashboard /></Suspense>} />
        <Route path="/governance" element={<Suspense fallback={<PageFallback />}><Governance /></Suspense>} />
        <Route path="/admin/agents" element={<Suspense fallback={<PageFallback />}><AgentTesters /></Suspense>} />
      </Route>
    </Routes>
  );
}
