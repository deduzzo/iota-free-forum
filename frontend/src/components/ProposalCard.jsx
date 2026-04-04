import { useState } from 'react';
import { motion } from 'framer-motion';
import { Clock, CheckCircle2, XCircle, Loader2, Lock, Vote, Target } from 'lucide-react';
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

const STATUS_LABELS = {
  0: { key: 'active', color: 'var(--color-primary)', bg: 'rgba(0,240,255,0.12)' },
  1: { key: 'passed', color: 'var(--color-success)', bg: 'rgba(0,255,136,0.12)' },
  2: { key: 'rejected', color: 'var(--color-danger)', bg: 'rgba(255,68,68,0.12)' },
  3: { key: 'expired', color: 'var(--color-warning)', bg: 'rgba(255,170,0,0.12)' },
};

/**
 * Proposal card with yes/no vote, quorum progress, status badge.
 */
export default function ProposalCard({ proposal, yesVotes = 0, noVotes = 0, totalVotes = 0, userVote, onVoted }) {
  const { t } = useTranslation();
  const { identity } = useIdentity();
  const { voteProposal } = useWallet();
  const [voting, setVoting] = useState(false);

  const proposalData = proposal?.parsedData || {};
  const statusInfo = STATUS_LABELS[proposal?.status] || STATUS_LABELS[0];
  const isActive = proposal?.status === 0;
  const isExpired = proposal?.deadline && new Date(proposal.deadline) < new Date();
  const hasVoted = userVote != null;
  const canVote = identity && isActive && !isExpired && !hasVoted;

  const quorum = proposal?.quorum || 1;
  const quorumPct = Math.min(100, Math.round((totalVotes / quorum) * 100));
  const yesPct = totalVotes > 0 ? Math.round((yesVotes / totalVotes) * 100) : 0;
  const noPct = totalVotes > 0 ? Math.round((noVotes / totalVotes) * 100) : 0;

  async function handleVote(voteYes) {
    if (!canVote || voting) return;
    setVoting(true);
    try {
      await voteProposal(proposal.id, voteYes);
      onVoted?.();
    } catch (err) {
      console.error('[ProposalCard] vote error:', err);
    } finally {
      setVoting(false);
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
            {proposalData.title || proposalData.description?.slice(0, 60) || proposal?.id?.slice(0, 16)}
          </h3>
          {proposalData.description && (
            <p className="text-sm mb-2" style={{ color: 'var(--color-text-muted)' }}>
              {proposalData.description}
            </p>
          )}
        </div>
        <span
          className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider shrink-0"
          style={{ background: statusInfo.bg, color: statusInfo.color }}
        >
          {t(`governance.status.${statusInfo.key}`, statusInfo.key)}
        </span>
      </div>

      {/* Quorum progress */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="flex items-center gap-1" style={{ color: 'var(--color-text-muted)' }}>
            <Target size={12} /> {t('governance.quorum', 'Quorum')}: {totalVotes}/{quorum}
          </span>
          <span className="font-mono font-bold" style={{ color: quorumPct >= 100 ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
            {quorumPct}%
          </span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--color-border)' }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${quorumPct}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="h-full rounded-full"
            style={{
              background: quorumPct >= 100
                ? 'linear-gradient(90deg, var(--color-success), #00cc88)'
                : 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))',
            }}
          />
        </div>
      </div>

      {/* Yes / No bars */}
      <div className="space-y-2 mb-4">
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="flex items-center gap-1" style={{ color: 'var(--color-success)' }}>
              <CheckCircle2 size={12} /> {t('governance.yes', 'Yes')} ({yesVotes})
            </span>
            <span className="font-mono" style={{ color: 'var(--color-text-muted)' }}>{yesPct}%</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-border)' }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${yesPct}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
              className="h-full rounded-full"
              style={{ background: 'var(--color-success)' }}
            />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="flex items-center gap-1" style={{ color: 'var(--color-danger)' }}>
              <XCircle size={12} /> {t('governance.no', 'No')} ({noVotes})
            </span>
            <span className="font-mono" style={{ color: 'var(--color-text-muted)' }}>{noPct}%</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-border)' }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${noPct}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
              className="h-full rounded-full"
              style={{ background: 'var(--color-danger)' }}
            />
          </div>
        </div>
      </div>

      {/* Vote buttons */}
      {canVote && (
        <div className="flex items-center gap-3 mb-4">
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => handleVote(true)}
            disabled={voting}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm border transition-all disabled:opacity-50"
            style={{ borderColor: 'var(--color-success)', color: 'var(--color-success)', background: 'rgba(0,255,136,0.06)' }}
          >
            {voting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            {t('governance.voteYes', 'Vote Yes')}
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => handleVote(false)}
            disabled={voting}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm border transition-all disabled:opacity-50"
            style={{ borderColor: 'var(--color-danger)', color: 'var(--color-danger)', background: 'rgba(255,68,68,0.06)' }}
          >
            {voting ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
            {t('governance.voteNo', 'Vote No')}
          </motion.button>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between text-xs" style={{ color: 'var(--color-text-muted)' }}>
        <div className="flex items-center gap-1">
          <Vote size={12} />
          {totalVotes} {t('governance.votes', 'votes')}
        </div>
        <div className="flex items-center gap-3">
          {hasVoted && (
            <span className="flex items-center gap-1" style={{ color: 'var(--color-success)' }}>
              <CheckCircle2 size={12} /> {t('governance.youVoted', 'You voted')}
            </span>
          )}
          {!isExpired && isActive && (
            <span className="flex items-center gap-1">
              <Clock size={12} /> {formatDeadline(proposal?.deadline)}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
