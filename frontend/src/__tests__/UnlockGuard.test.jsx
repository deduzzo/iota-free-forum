import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────

let mockIdentity = null;
let mockUnlocked = false;
const mockUnlockIdentity = vi.fn();

vi.mock('../hooks/useIdentity', () => ({
  useIdentity: () => ({
    identity: mockIdentity,
    unlocked: mockUnlocked,
    unlockIdentity: mockUnlockIdentity,
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key, fallback) => fallback || key,
  }),
}));

// Minimal framer-motion mock
vi.mock('framer-motion', () => {
  const React = require('react');
  const motion = new Proxy({}, {
    get: (_target, prop) =>
      React.forwardRef(({ children, ...rest }, ref) => {
        const htmlProps = {};
        for (const [k, v] of Object.entries(rest)) {
          if (!['initial', 'animate', 'exit', 'transition', 'whileHover', 'whileTap'].includes(k)) {
            htmlProps[k] = v;
          }
        }
        return React.createElement(prop, { ...htmlProps, ref }, children);
      }),
  });
  return { motion, AnimatePresence: ({ children }) => children };
});

const { default: UnlockGuard } = await import('../components/UnlockGuard');

// ── Tests ────────────────────────────────────────────────────────────

describe('UnlockGuard', () => {
  beforeEach(() => {
    mockIdentity = null;
    mockUnlocked = false;
    mockUnlockIdentity.mockClear();
  });

  it('guest (no wallet) sees children directly', () => {
    mockIdentity = null;
    render(
      <UnlockGuard>
        <div data-testid="child">Content</div>
      </UnlockGuard>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('wallet present + unlocked sees children', () => {
    mockIdentity = { address: '0xABC' };
    mockUnlocked = true;
    render(
      <UnlockGuard>
        <div data-testid="child">Content</div>
      </UnlockGuard>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('wallet present + locked shows unlock form', () => {
    mockIdentity = { address: '0xABC' };
    mockUnlocked = false;
    render(
      <UnlockGuard>
        <div data-testid="child">Content</div>
      </UnlockGuard>,
    );
    expect(screen.queryByTestId('child')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Password wallet')).toBeInTheDocument();
    expect(screen.getByText('Sblocca')).toBeInTheDocument();
  });

  it('submitting correct password calls unlockIdentity', async () => {
    mockIdentity = { address: '0xABC' };
    mockUnlocked = false;
    mockUnlockIdentity.mockResolvedValue(true);
    const user = userEvent.setup();

    render(
      <UnlockGuard>
        <div>Content</div>
      </UnlockGuard>,
    );

    await user.type(screen.getByPlaceholderText('Password wallet'), 'mypassword');
    await user.click(screen.getByText('Sblocca'));

    expect(mockUnlockIdentity).toHaveBeenCalledWith('mypassword');
  });

  it('wrong password shows error message', async () => {
    mockIdentity = { address: '0xABC' };
    mockUnlocked = false;
    mockUnlockIdentity.mockRejectedValue(new Error('wrong'));
    const user = userEvent.setup();

    render(
      <UnlockGuard>
        <div>Content</div>
      </UnlockGuard>,
    );

    await user.type(screen.getByPlaceholderText('Password wallet'), 'bad');
    await user.click(screen.getByText('Sblocca'));

    await screen.findByText('Password errata');
  });

  it('"Ricordami" checkbox sets sessionStorage on successful unlock', async () => {
    mockIdentity = { address: '0xABC' };
    mockUnlocked = false;
    mockUnlockIdentity.mockResolvedValue(true);
    const user = userEvent.setup();

    render(
      <UnlockGuard>
        <div>Content</div>
      </UnlockGuard>,
    );

    // Check "remember me"
    await user.click(screen.getByText('Ricordami su questo dispositivo'));
    await user.type(screen.getByPlaceholderText('Password wallet'), 'mypassword');
    await user.click(screen.getByText('Sblocca'));

    await vi.waitFor(() => {
      expect(sessionStorage.getItem('wallet_remember')).toBe('true');
    });
  });

  it('skips unlock if sessionStorage has wallet_remember', () => {
    mockIdentity = { address: '0xABC' };
    mockUnlocked = false;
    sessionStorage.setItem('wallet_remember', 'true');

    render(
      <UnlockGuard>
        <div data-testid="child">Content</div>
      </UnlockGuard>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });
});
