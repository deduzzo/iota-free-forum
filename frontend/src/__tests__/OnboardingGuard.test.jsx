import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────

// Mock useIdentity
const mockNavigate = vi.fn();
let mockIdentity = null;
let mockLoading = false;

vi.mock('../hooks/useIdentity', () => ({
  useIdentity: () => ({
    identity: mockIdentity,
    loading: mockLoading,
  }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Lazy-import after mocks are set up
const { default: OnboardingGuard } = await import('../components/OnboardingGuard');

// ── Helpers ──────────────────────────────────────────────────────────

function renderGuard(path, children = <div data-testid="child">OK</div>) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <OnboardingGuard>{children}</OnboardingGuard>
    </MemoryRouter>,
  );
}

// ── Tests ────────────────────────────────────────────────────────────

describe('OnboardingGuard', () => {
  beforeEach(() => {
    mockIdentity = null;
    mockLoading = false;
    mockNavigate.mockClear();
    localStorage.setItem('forum_setup_done', 'true');

    // Mock fetch for auto-detect
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });
  });

  // ---- Guest on public routes ----
  it('guest can access / (home)', () => {
    renderGuard('/');
    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('guest can access /t/123 (thread)', () => {
    renderGuard('/t/123');
    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('guest can access /c/456 (category)', () => {
    renderGuard('/c/456');
    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  // ---- Guest redirected from protected routes ----
  it('guest is redirected from /wallet', () => {
    renderGuard('/wallet');
    expect(mockNavigate).toHaveBeenCalledWith('/identity', {
      replace: true,
      state: { fromProtected: true },
    });
  });

  it('guest is redirected from /admin', () => {
    renderGuard('/admin');
    expect(mockNavigate).toHaveBeenCalledWith('/identity', {
      replace: true,
      state: { fromProtected: true },
    });
  });

  it('guest is redirected from /escrow', () => {
    renderGuard('/escrow');
    expect(mockNavigate).toHaveBeenCalledWith('/identity', {
      replace: true,
      state: { fromProtected: true },
    });
  });

  it('guest is redirected from /marketplace', () => {
    renderGuard('/marketplace');
    expect(mockNavigate).toHaveBeenCalledWith('/identity', {
      replace: true,
      state: { fromProtected: true },
    });
  });

  it('guest is redirected from /c/:id/new (new thread)', () => {
    renderGuard('/c/abc/new');
    expect(mockNavigate).toHaveBeenCalledWith('/identity', {
      replace: true,
      state: { fromProtected: true },
    });
  });

  // ---- User with wallet passes everywhere ----
  it('user with wallet can access /wallet', () => {
    mockIdentity = { address: '0xABC', username: 'alice' };
    renderGuard('/wallet');
    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('user with wallet can access /admin', () => {
    mockIdentity = { address: '0xABC', username: 'alice' };
    renderGuard('/admin');
    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  // ---- No setup done -> redirect to /setup ----
  it('redirects to /setup when forum_setup_done is not set', () => {
    localStorage.removeItem('forum_setup_done');
    renderGuard('/');
    expect(mockNavigate).toHaveBeenCalledWith('/setup', { replace: true });
  });

  // ---- Auto-detect forum ----
  it('sets forum_setup_done in localStorage when API responds OK', async () => {
    localStorage.removeItem('forum_setup_done');
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

    renderGuard('/setup'); // whitelisted, won't redirect

    // Wait for the fetch effect to complete
    await vi.waitFor(() => {
      expect(localStorage.getItem('forum_setup_done')).toBe('true');
    });
  });

  // ---- Loading state shows nothing ----
  it('shows nothing while loading', () => {
    mockLoading = true;
    const { container } = renderGuard('/');
    expect(container.innerHTML).toBe('');
  });

  // ---- User with wallet but no username -> redirect to /identity ----
  it('redirects to /identity when user has wallet but no username', () => {
    mockIdentity = { address: '0xABC', username: null };
    renderGuard('/');
    expect(mockNavigate).toHaveBeenCalledWith('/identity', { replace: true });
  });
});
