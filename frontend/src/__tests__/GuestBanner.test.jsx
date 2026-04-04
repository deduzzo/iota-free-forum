import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

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
        // Filter out framer-motion-specific props
        const htmlProps = {};
        for (const [k, v] of Object.entries(rest)) {
          if (!['initial', 'animate', 'exit', 'transition', 'whileHover', 'whileTap'].includes(k)) {
            htmlProps[k] = v;
          }
        }
        return React.createElement(prop, { ...htmlProps, ref }, children);
      }),
  });
  return {
    motion,
    AnimatePresence: ({ children }) => children,
  };
});

const { default: GuestBanner } = await import('../components/GuestBanner');

// ── Tests ────────────────────────────────────────────────────────────

describe('GuestBanner', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('renders the banner with CTA text', () => {
    render(
      <MemoryRouter>
        <GuestBanner />
      </MemoryRouter>,
    );
    expect(screen.getByText('Want to participate? Create your wallet in 2 minutes')).toBeInTheDocument();
    expect(screen.getByText('Create Wallet')).toBeInTheDocument();
  });

  it('is hidden after dismiss (sessionStorage)', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MemoryRouter>
        <GuestBanner />
      </MemoryRouter>,
    );

    // Click the dismiss X button (it has no text, find by role)
    const buttons = container.querySelectorAll('button');
    // The dismiss button is the last one
    const dismissButton = buttons[buttons.length - 1];
    await user.click(dismissButton);

    expect(sessionStorage.getItem('guest_banner_dismissed')).toBe('true');
    // Banner should not be visible after dismiss
    expect(screen.queryByText('Create Wallet')).not.toBeInTheDocument();
  });

  it('is hidden if sessionStorage already has dismiss flag', () => {
    sessionStorage.setItem('guest_banner_dismissed', 'true');
    render(
      <MemoryRouter>
        <GuestBanner />
      </MemoryRouter>,
    );
    expect(screen.queryByText('Create Wallet')).not.toBeInTheDocument();
  });

  it('click "Create Wallet" navigates to /identity', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <GuestBanner />
      </MemoryRouter>,
    );

    await user.click(screen.getByText('Create Wallet'));
    expect(mockNavigate).toHaveBeenCalledWith('/identity');
  });
});
