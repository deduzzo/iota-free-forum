import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, Clock, CheckCircle2, Loader2, Lock } from 'lucide-react';
import { useWallet } from '../hooks/useWallet';
import { useIdentity } from '../hooks/useIdentity';
import { useTranslation } from 'react-i18next';

function formatDeadline(deadline) {
  if (!deadline) return '';
  const d = new Date(deadline);
  const now = new Date();
  const diff = d - now;
  if (diff <= 0) return 'Expired';
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  const mins = Math.floor((diff % 3600000) / 60000);
  return `${hours}h ${mins}m`;
}

/**
 * Poll card with vote options, progress bars, deadline countdown.
 */
export default function PollCard({ poll, votesByOption, totalVotes, userVote, onVoted }) {
  const { t } = useTranslation();
  const { identity } = useIdentity();
  const { votePoll } = useWallet();
  const [voting, setVoting] = useState(false);
  const [selectedOption, setSelectedOption] = useState(null);

  const pollData = poll?.parsedData || {};
  const options = pollData.options || [];
  const isClosed = poll?.closed === 1;
  const isExpired = poll?.deadline && new Date(poll.deadline) < new Date();
  const hasVoted = userVote != null;
  const canVote = identity && !isClosed && !isExpired && !hasVoted;

  // Build vote counts per option
  const optionVotes = useMemo(() => {
    const map = {};
    (votesByOption || []).forEach((v) => { map[v.optionIndex] = v.voteCount; });
    return map;
  }, [votesByOption]);

  async function handleVote(idx) {
    if (!canVote || voting) return;
    setSelectedOption(idx);
    setVoting(true);
    try {
      await votePoll(poll.id, idx);
      onVoted?.();
    } catch (err) {
      console.error('[PollCard] vote error:', err);
    } finally {
      setVoting(false);
      setSelectedOption(null);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0">
          <h3
            className="text-lg font-bold mb-1"
            style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-text)' }}
          >
            {pollData.title || poll?.id?.slice(0, 16)}
          </h3>
          {pollData.description && (
            <p className="text-sm mb-2" style={{ color: 'var(--color-text-muted)' }}>
              {pollData.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {(isClosed || isExpired) ? (
            <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full" style={{ background: 'rgba(255,68,68,0.12)', color: 'var(--color-danger)' }}>
              <Lock size={12} /> {t('governance.closed', 'Closed')}
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full" style={{ background: 'rgba(0,240,255,0.1)', color: 'var(--color-primary)' }}>
              <Clock size={12} /> {formatDeadline(poll?.deadline)}
            </span>
          )}
        </div>
      </div>

      {/* Options */}
      <div className="space-y-3">
        {options.map((opt, idx) => {
          const votes = optionVotes[idx] || 0;
          const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
          const isSelected = hasVoted && userVote === idx;

          return (
            <motion.button
              key={idx}
              whileHover={canVote ? { scale: 1.01 } : {}}
              whileTap={canVote ? { scale: 0.99 } : {}}
              onClick={() => handleVote(idx)}
              disabled={!canVote || voting}
              className="w-full relative overflow-hidden rounded-xl border p-3 text-left transition-all duration-300"
              style={{
                borderColor: isSelected ? 'var(--color-primary)' : 'var(--color-border)',
                background: isSelected ? 'rgba(0,240,255,0.06)' : 'transparent',
                cursor: canVote ? 'pointer' : 'default',
              }}
            >
              {/* Progress bar background */}
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                className="absolute inset-0 rounded-xl"
                style={{
                  background: isSelected
                    ? 'linear-gradient(90deg, rgba(0,240,255,0.15), rgba(0,240,255,0.05))'
                    : 'linear-gradient(90deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))',
                }}
              />

              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {voting && selectedOption === idx ? (
                    <Loader2 size={14} className="animate-spin" style={{ color: 'var(--color-primary)' }} />
                  ) : isSelected ? (
                    <CheckCircle2 size={14} style={{ color: 'var(--color-primary)' }} />
                  ) : null}
                  <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                    {typeof opt === 'string' ? opt : opt.label || `Option ${idx + 1}`}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs font-mono" style={{ color: 'var(--color-text-muted)' }}>
                  <span>{votes}</span>
                  <span className="font-bold" style={{ color: pct > 50 ? 'var(--color-primary)' : 'var(--color-text-muted)' }}>
                    {pct}%
                  </span>
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-4 text-xs" style={{ color: 'var(--color-text-muted)' }}>
        <div className="flex items-center gap-1">
          <BarChart3 size={12} />
          {totalVotes || 0} {t('governance.votes', 'votes')}
        </div>
        {hasVoted && (
          <span className="flex items-center gap-1" style={{ color: 'var(--color-success)' }}>
            <CheckCircle2 size={12} /> {t('governance.youVoted', 'You voted')}
          </span>
        )}
      </div>
    </motion.div>
  );
}
