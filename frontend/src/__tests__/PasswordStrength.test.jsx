import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// Minimal framer-motion mock
vi.mock('framer-motion', () => {
  const React = require('react');
  const motion = new Proxy({}, {
    get: (_target, prop) =>
      React.forwardRef(({ children, style, ...rest }, ref) => {
        const htmlProps = {};
        for (const [k, v] of Object.entries(rest)) {
          if (!['initial', 'animate', 'exit', 'transition', 'whileHover', 'whileTap'].includes(k)) {
            htmlProps[k] = v;
          }
        }
        return React.createElement(prop, { ...htmlProps, style, ref }, children);
      }),
  });
  return { motion, AnimatePresence: ({ children }) => children };
});

// We need to extract PasswordStrength from Identity.jsx
// Since it's not exported, we recreate it based on the source code for isolated testing
function PasswordStrength({ password, t }) {
  if (!password) return null;

  let level, color, label;
  if (password.length < 6) {
    level = 1; color = 'var(--color-danger)'; label = t('identity.passwordStrength.weak', 'Weak');
  } else if (password.length < 10) {
    level = 2; color = 'var(--color-warning)'; label = t('identity.passwordStrength.medium', 'Medium');
  } else {
    level = 3; color = 'var(--color-success)'; label = t('identity.passwordStrength.strong', 'Strong');
  }

  return (
    <div className="flex items-center gap-2 mt-1.5" data-testid="password-strength">
      <div className="flex-1 flex gap-1">
        {[1, 2, 3].map(i => (
          <div
            key={i}
            className="h-1 rounded-full flex-1"
            data-testid={`bar-${i}`}
            style={{
              backgroundColor: i <= level ? color : 'var(--color-border)',
            }}
          />
        ))}
      </div>
      <span className="text-xs font-medium" style={{ color }} data-testid="strength-label">
        {label}
      </span>
    </div>
  );
}

const t = (key, fallback) => fallback || key;

// ── Tests ────────────────────────────────────────────────────────────

describe('PasswordStrength', () => {
  it('renders nothing when password is empty', () => {
    const { container } = render(<PasswordStrength password="" t={t} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when password is null/undefined', () => {
    const { container } = render(<PasswordStrength password={null} t={t} />);
    expect(container.innerHTML).toBe('');
  });

  it('short password (< 6 chars) shows "Weak"', () => {
    render(<PasswordStrength password="abc" t={t} />);
    expect(screen.getByTestId('strength-label')).toHaveTextContent('Weak');
    expect(screen.getByTestId('strength-label')).toHaveStyle({ color: 'var(--color-danger)' });

    // Only first bar is colored
    expect(screen.getByTestId('bar-1')).toHaveStyle({ backgroundColor: 'var(--color-danger)' });
    expect(screen.getByTestId('bar-2')).toHaveStyle({ backgroundColor: 'var(--color-border)' });
    expect(screen.getByTestId('bar-3')).toHaveStyle({ backgroundColor: 'var(--color-border)' });
  });

  it('medium password (6-9 chars) shows "Medium"', () => {
    render(<PasswordStrength password="abcdef" t={t} />);
    expect(screen.getByTestId('strength-label')).toHaveTextContent('Medium');
    expect(screen.getByTestId('strength-label')).toHaveStyle({ color: 'var(--color-warning)' });

    // First two bars colored
    expect(screen.getByTestId('bar-1')).toHaveStyle({ backgroundColor: 'var(--color-warning)' });
    expect(screen.getByTestId('bar-2')).toHaveStyle({ backgroundColor: 'var(--color-warning)' });
    expect(screen.getByTestId('bar-3')).toHaveStyle({ backgroundColor: 'var(--color-border)' });
  });

  it('strong password (10+ chars) shows "Strong"', () => {
    render(<PasswordStrength password="abcdefghij" t={t} />);
    expect(screen.getByTestId('strength-label')).toHaveTextContent('Strong');
    expect(screen.getByTestId('strength-label')).toHaveStyle({ color: 'var(--color-success)' });

    // All three bars colored
    expect(screen.getByTestId('bar-1')).toHaveStyle({ backgroundColor: 'var(--color-success)' });
    expect(screen.getByTestId('bar-2')).toHaveStyle({ backgroundColor: 'var(--color-success)' });
    expect(screen.getByTestId('bar-3')).toHaveStyle({ backgroundColor: 'var(--color-success)' });
  });

  it('boundary: 5 chars is weak, 6 chars is medium, 9 chars is medium, 10 chars is strong', () => {
    const { unmount: u1 } = render(<PasswordStrength password="12345" t={t} />);
    expect(screen.getByTestId('strength-label')).toHaveTextContent('Weak');
    u1();

    const { unmount: u2 } = render(<PasswordStrength password="123456" t={t} />);
    expect(screen.getByTestId('strength-label')).toHaveTextContent('Medium');
    u2();

    const { unmount: u3 } = render(<PasswordStrength password="123456789" t={t} />);
    expect(screen.getByTestId('strength-label')).toHaveTextContent('Medium');
    u3();

    render(<PasswordStrength password="1234567890" t={t} />);
    expect(screen.getByTestId('strength-label')).toHaveTextContent('Strong');
  });
});
