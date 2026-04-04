import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { describe, it, expect, vi } from 'vitest';

// ── Mock Layout to just render Outlet ────────────────────────────────
vi.mock('../components/Layout', () => ({
  default: () => <Outlet />,
}));

vi.mock('../components/LoadingSpinner', () => ({
  default: () => <div data-testid="loading-spinner">Loading</div>,
}));

// Mock all page modules so they don't pull in real dependencies
vi.mock('../pages/Home', () => ({ default: () => <div data-testid="page-Home">Home</div> }));
vi.mock('../pages/Category', () => ({ default: () => <div data-testid="page-Category">Category</div> }));
vi.mock('../pages/NewThread', () => ({ default: () => <div data-testid="page-NewThread">NewThread</div> }));
vi.mock('../pages/Thread', () => ({ default: () => <div data-testid="page-Thread">Thread</div> }));
vi.mock('../pages/UserProfile', () => ({ default: () => <div data-testid="page-UserProfile">UserProfile</div> }));
vi.mock('../pages/Identity', () => ({ default: () => <div data-testid="page-Identity">Identity</div> }));
vi.mock('../pages/Admin', () => ({ default: () => <div data-testid="page-Admin">Admin</div> }));
vi.mock('../pages/ThemeAdmin', () => ({ default: () => <div data-testid="page-ThemeAdmin">ThemeAdmin</div> }));
vi.mock('../pages/Dashboard', () => ({ default: () => <div data-testid="page-Dashboard">Dashboard</div> }));
vi.mock('../pages/Settings', () => ({ default: () => <div data-testid="page-Settings">Settings</div> }));
vi.mock('../pages/Setup', () => ({ default: () => <div data-testid="page-Setup">Setup</div> }));
vi.mock('../pages/Wallet', () => ({ default: () => <div data-testid="page-Wallet">Wallet</div> }));
vi.mock('../pages/Marketplace', () => ({ default: () => <div data-testid="page-Marketplace">Marketplace</div> }));
vi.mock('../pages/EscrowDashboard', () => ({ default: () => <div data-testid="page-EscrowDashboard">EscrowDashboard</div> }));
vi.mock('../pages/Subscription', () => ({ default: () => <div data-testid="page-Subscription">Subscription</div> }));
vi.mock('../pages/Users', () => ({ default: () => <div data-testid="page-Users">Users</div> }));

const { default: App } = await import('../App');

// ── Tests ────────────────────────────────────────────────────────────

describe('App routes', () => {
  const routes = [
    ['/', 'page-Home'],
    ['/c/123', 'page-Category'],
    ['/t/456', 'page-Thread'],
    ['/identity', 'page-Identity'],
    ['/wallet', 'page-Wallet'],
    ['/admin', 'page-Admin'],
    ['/setup', 'page-Setup'],
    ['/marketplace', 'page-Marketplace'],
    ['/escrow', 'page-EscrowDashboard'],
    ['/subscription', 'page-Subscription'],
    ['/settings', 'page-Settings'],
    ['/dashboard', 'page-Dashboard'],
    ['/users', 'page-Users'],
  ];

  for (const [path, testId] of routes) {
    it(`renders ${testId} on ${path}`, async () => {
      render(
        <MemoryRouter initialEntries={[path]}>
          <App />
        </MemoryRouter>,
      );
      expect(await screen.findByTestId(testId)).toBeInTheDocument();
    });
  }

  it('Suspense wraps lazy routes (pages load asynchronously)', async () => {
    // Verify that rendering works through Suspense boundaries
    // If Suspense was misconfigured, findByTestId would fail
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByTestId('page-Home')).toBeInTheDocument();
  });
});
