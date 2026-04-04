import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock, Shield, AlertTriangle, CheckCircle, XCircle,
  ArrowRight, Star, Send, MessageSquare,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import IdentityBadge from './IdentityBadge';

const STATUS_CONFIG = {
  created: { color: 'var(--color-primary)', bg: 'rgba(0,240,255,0.1)', icon: Clock },
  funded: { color: 'var(--color-warning)', bg: 'rgba(255,170,0,0.1)', icon: Shield },
  delivered: { color: 'var(--color-success)', bg: 'rgba(0,255,136,0.1)', icon: CheckCircle },
  disputed: { color: 'var(--color-danger)', bg: 'rgba(255,68,68,0.1)', icon: AlertTriangle },
  resolved: { color: 'var(--color-text-muted)', bg: 'rgba(128,128,128,0.1)', icon: CheckCircle },
};

function formatCountdown(deadline) {
  if (!deadline) return '--';
  const diff = new Date(deadline).getTime() - Date.now();
  if (diff <= 0) return 'Expired';
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  const mins = Math.floor((diff % 3600000) / 60000);
  return `${hours}h ${mins}m`;
}

function RatingForm({ onSubmit, submitting }) {
  const { t } = useTranslation();
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      className="mt-3 pt-3 border-t"
      style={{ borderColor: 'var(--color-border)' }}
    >
      <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-text)' }}>
        {t('escrow.rateThisTrade')}
      </p>

      {/* Star rating */}
      <div className="flex items-center gap-1 mb-2">
        {[1, 2, 3, 4, 5].map((star) => (
          <motion.button
            key={star}
            whileHover={{ scale: 1.2 }}
            whileTap={{ scale: 0.9 }}
            onMouseEnter={() => setHoverRating(star)}
            onMouseLeave={() => setHoverRating(0)}
            onClick={() => setRating(star)}
          >
            <Star
              size={20}
              fill={(hoverRating || rating) >= star ? 'var(--color-warning)' : 'transparent'}
              style={{
                color: (hoverRating || rating) >= star ? 'var(--color-warning)' : 'var(--color-text-muted)',
              }}
            />
          </motion.button>
        ))}
        {rating > 0 && (
          <span className="text-xs ml-2" style={{ color: 'var(--color-text-muted)' }}>
            {rating}/5
          </span>
        )}
      </div>

      {/* Comment */}
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder={t('escrow.ratingComment')}
        rows={2}
        className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none text-xs resize-none"
        style={{
          borderColor: 'var(--color-border)',
          color: 'var(--color-text)',
        }}
      />

      <div className="flex justify-end mt-2">
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => onSubmit({ rating, comment })}
          disabled={submitting || rating === 0}
          className="btn-primary px-4 py-1.5 rounded-lg text-xs disabled:opacity-40"
        >
          {submitting ? t('escrow.submitting') : t('escrow.submitRating')}
        </motion.button>
      </div>
    </motion.div>
  );
}

export default function EscrowCard({
  escrow,
  currentUserId,
  onMarkDelivered,
  onConfirm,
  onDispute,
  onVoteRelease,
  onVoteRefund,
  onClaimExpired,
  onRate,
}) {
  const { t } = useTranslation();
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const [showRating, setShowRating] = useState(false);
  const [claimLoading, setClaimLoading] = useState(false);

  const {
    id, buyer, seller, arbitrator,
    amount, status, deadline,
    votes = {},
    rated = false,
  } = escrow;

  const config = STATUS_CONFIG[status] || STATUS_CONFIG.created;
  const StatusIcon = config.icon;

  const isBuyer = currentUserId === buyer?.id || currentUserId === buyer;
  const isSeller = currentUserId === seller?.id || currentUserId === seller;
  const isArbitrator = currentUserId === arbitrator?.id || currentUserId === arbitrator;
  const isParty = isBuyer || isSeller || isArbitrator;
  const isExpired = deadline && new Date(deadline).getTime() < Date.now();

  // Vote progress
  const releaseVotes = votes.release || 0;
  const refundVotes = votes.refund || 0;
  const totalVotes = releaseVotes + refundVotes;

  async function handleClaimExpired() {
    if (!confirm(t('escrow.claimExpiredConfirm'))) return;
    setClaimLoading(true);
    try {
      await onClaimExpired?.(escrow.objectId || id);
    } catch (err) {
      console.error('[EscrowCard] Claim expired failed:', err);
    } finally {
      setClaimLoading(false);
    }
  }

  async function handleRate(data) {
    setRatingSubmitting(true);
    try {
      await onRate?.(id, data);
      setShowRating(false);
    } catch (err) {
      console.error('[EscrowCard] Rating failed:', err);
    } finally {
      setRatingSubmitting(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="glass-card"
    >
      {/* Header: status + amount */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
            style={{ backgroundColor: config.bg, color: config.color }}
          >
            <StatusIcon size={12} />
            {t(`escrow.status.${status}`)}
          </div>
          {deadline && status !== 'resolved' && (
            <span
              className="flex items-center gap-1 text-[10px]"
              style={{ color: 'var(--color-text-muted)' }}
            >
              <Clock size={10} />
              {formatCountdown(deadline)}
            </span>
          )}
        </div>
        <span className="font-mono text-sm font-bold" style={{ color: 'var(--color-primary)' }}>
          {amount} IOTA
        </span>
      </div>

      {/* Parties */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase" style={{ color: 'var(--color-text-muted)' }}>
            {t('escrow.buyer')}
          </span>
          <IdentityBadge
            userId={buyer?.id || buyer}
            username={buyer?.username}
            showUsername={!!buyer?.username}
            size="sm"
          />
        </div>
        <ArrowRight size={12} style={{ color: 'var(--color-text-muted)' }} />
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase" style={{ color: 'var(--color-text-muted)' }}>
            {t('escrow.seller')}
          </span>
          <IdentityBadge
            userId={seller?.id || seller}
            username={seller?.username}
            showUsername={!!seller?.username}
            size="sm"
          />
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          <Shield size={10} style={{ color: 'var(--color-warning)' }} />
          <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
            {t('escrow.arbitrator')}:
          </span>
          <IdentityBadge
            userId={arbitrator?.id || arbitrator}
            username={arbitrator?.username}
            showUsername={!!arbitrator?.username}
            size="sm"
          />
        </div>
      </div>

      {/* Vote progress (when disputed) */}
      {status === 'disputed' && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-[10px] mb-1">
            <span style={{ color: 'var(--color-success)' }}>
              {t('escrow.release')} ({releaseVotes}/2)
            </span>
            <span style={{ color: 'var(--color-danger)' }}>
              {t('escrow.refund')} ({refundVotes}/2)
            </span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-border)' }}>
            <div className="flex h-full">
              {releaseVotes > 0 && (
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(releaseVotes / 3) * 100}%` }}
                  className="h-full"
                  style={{ backgroundColor: 'var(--color-success)' }}
                />
              )}
              {refundVotes > 0 && (
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(refundVotes / 3) * 100}%` }}
                  className="h-full ml-auto"
                  style={{ backgroundColor: 'var(--color-danger)' }}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Seller: Mark Delivered */}
        {isSeller && status === 'funded' && (
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => onMarkDelivered?.(id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{
              backgroundColor: 'rgba(0,255,136,0.1)',
              color: 'var(--color-success)',
              border: '1px solid rgba(0,255,136,0.2)',
            }}
          >
            <Send size={12} />
            {t('escrow.markDelivered')}
          </motion.button>
        )}

        {/* Buyer: Confirm or Dispute */}
        {isBuyer && status === 'delivered' && (
          <>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => onConfirm?.(id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{
                backgroundColor: 'rgba(0,255,136,0.1)',
                color: 'var(--color-success)',
                border: '1px solid rgba(0,255,136,0.2)',
              }}
            >
              <CheckCircle size={12} />
              {t('escrow.confirm')}
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => onDispute?.(id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{
                backgroundColor: 'rgba(255,68,68,0.1)',
                color: 'var(--color-danger)',
                border: '1px solid rgba(255,68,68,0.2)',
              }}
            >
              <AlertTriangle size={12} />
              {t('escrow.dispute')}
            </motion.button>
          </>
        )}

        {/* Any party: Vote when disputed */}
        {isParty && status === 'disputed' && (
          <>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => onVoteRelease?.(id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{
                backgroundColor: 'rgba(0,255,136,0.1)',
                color: 'var(--color-success)',
                border: '1px solid rgba(0,255,136,0.2)',
              }}
            >
              <CheckCircle size={12} />
              {t('escrow.voteRelease')}
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => onVoteRefund?.(id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{
                backgroundColor: 'rgba(255,68,68,0.1)',
                color: 'var(--color-danger)',
                border: '1px solid rgba(255,68,68,0.2)',
              }}
            >
              <XCircle size={12} />
              {t('escrow.voteRefund')}
            </motion.button>
          </>
        )}

        {/* Buyer: Claim expired escrow */}
        {isBuyer && status !== 'resolved' && isExpired && (
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleClaimExpired}
            disabled={claimLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
            style={{
              backgroundColor: 'rgba(255,170,0,0.1)',
              color: 'var(--color-warning)',
              border: '1px solid rgba(255,170,0,0.2)',
            }}
          >
            <Clock size={12} />
            {claimLoading ? t('common.loading') : t('escrow.claimExpired')}
          </motion.button>
        )}

        {/* Rate after resolution */}
        {isParty && status === 'resolved' && !rated && (
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowRating(!showRating)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{
              backgroundColor: 'rgba(255,170,0,0.1)',
              color: 'var(--color-warning)',
              border: '1px solid rgba(255,170,0,0.2)',
            }}
          >
            <Star size={12} />
            {t('escrow.rateTrade')}
          </motion.button>
        )}

        {/* Escrow ID */}
        <span
          className="ml-auto text-[10px] font-mono"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {id?.slice(0, 12)}...
        </span>
      </div>

      {/* Rating form */}
      <AnimatePresence>
        {showRating && (
          <RatingForm onSubmit={handleRate} submitting={ratingSubmitting} />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
