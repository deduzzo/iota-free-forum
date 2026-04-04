import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart3, FileText, Plus, X, Loader2, Vote,
} from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { api } from '../api/endpoints';
import { useIdentity } from '../hooks/useIdentity';
import { useWallet } from '../hooks/useWallet';
import LoadingSpinner from '../components/LoadingSpinner';
import PollCard from '../components/PollCard';
import ProposalCard from '../components/ProposalCard';
import { useTranslation } from 'react-i18next';

export default function Governance() {
  const { t } = useTranslation();
  const { identity, unlocked } = useIdentity();
  const { createPoll, createProposal } = useWallet();

  const [tab, setTab] = useState('polls');
  const [showCreatePoll, setShowCreatePoll] = useState(false);
  const [showCreateProposal, setShowCreateProposal] = useState(false);

  // ── Polls ──
  const { data: pollsData, loading: pollsLoading, reload: reloadPolls } = useApi(
    () => api.getPolls(1, 'all'),
    [],
    ['poll'],
  );

  // ── Proposals ──
  const { data: proposalsData, loading: proposalsLoading, reload: reloadProposals } = useApi(
    () => api.getProposals(1, 'all'),
    [],
    ['proposal'],
  );

  // ── Create Poll form ──
  const [pollTitle, setPollTitle] = useState('');
  const [pollDescription, setPollDescription] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [pollDeadlineHours, setPollDeadlineHours] = useState(24);
  const [creatingPoll, setCreatingPoll] = useState(false);

  function addPollOption() {
    if (pollOptions.length < 10) setPollOptions([...pollOptions, '']);
  }

  function removePollOption(idx) {
    if (pollOptions.length > 2) setPollOptions(pollOptions.filter((_, i) => i !== idx));
  }

  function updatePollOption(idx, val) {
    const updated = [...pollOptions];
    updated[idx] = val;
    setPollOptions(updated);
  }

  async function handleCreatePoll() {
    const validOptions = pollOptions.filter((o) => o.trim());
    if (!pollTitle.trim() || validOptions.length < 2) return;
    setCreatingPoll(true);
    try {
      const deadlineMs = Date.now() + pollDeadlineHours * 3600000;
      await createPoll(
        { title: pollTitle.trim(), description: pollDescription.trim(), options: validOptions },
        deadlineMs,
      );
      setShowCreatePoll(false);
      setPollTitle('');
      setPollDescription('');
      setPollOptions(['', '']);
      setPollDeadlineHours(24);
      setTimeout(reloadPolls, 2000);
    } catch (err) {
      console.error('[Governance] create poll error:', err);
    } finally {
      setCreatingPoll(false);
    }
  }

  // ── Create Proposal form ──
  const [proposalTitle, setProposalTitle] = useState('');
  const [proposalDescription, setProposalDescription] = useState('');
  const [proposalQuorum, setProposalQuorum] = useState(5);
  const [proposalDeadlineHours, setProposalDeadlineHours] = useState(72);
  const [creatingProposal, setCreatingProposal] = useState(false);

  async function handleCreateProposal() {
    if (!proposalTitle.trim()) return;
    setCreatingProposal(true);
    try {
      const deadlineMs = Date.now() + proposalDeadlineHours * 3600000;
      await createProposal(
        { title: proposalTitle.trim(), description: proposalDescription.trim() },
        proposalQuorum,
        deadlineMs,
      );
      setShowCreateProposal(false);
      setProposalTitle('');
      setProposalDescription('');
      setProposalQuorum(5);
      setProposalDeadlineHours(72);
      setTimeout(reloadProposals, 2000);
    } catch (err) {
      console.error('[Governance] create proposal error:', err);
    } finally {
      setCreatingProposal(false);
    }
  }

  // ── User vote lookup ──
  const getUserVoteForPoll = useCallback((poll, votes) => {
    if (!identity?.userId || !votes) return undefined;
    const v = votes.find((v) => v.voterId === identity.userId);
    return v ? v.optionIndex : undefined;
  }, [identity?.userId]);

  const getUserVoteForProposal = useCallback((votes) => {
    if (!identity?.userId || !votes) return undefined;
    const v = votes.find((v) => v.voterId === identity.userId);
    return v ? v.voteYes : undefined;
  }, [identity?.userId]);

  const tabs = [
    { key: 'polls', label: t('governance.polls', 'Polls'), icon: BarChart3 },
    { key: 'proposals', label: t('governance.proposals', 'Proposals'), icon: FileText },
  ];

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-6"
      >
        <div>
          <h1
            className="text-3xl font-bold"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            {t('governance.title', 'Governance')}
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
            {t('governance.subtitle', 'Community polls and proposals on-chain')}
          </p>
        </div>
        {identity && unlocked && (
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => tab === 'polls' ? setShowCreatePoll(true) : setShowCreateProposal(true)}
            className="btn-primary flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
          >
            <Plus size={16} />
            {tab === 'polls'
              ? t('governance.createPoll', 'Create Poll')
              : t('governance.createProposal', 'Create Proposal')}
          </motion.button>
        )}
      </motion.div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl" style={{ background: 'var(--color-surface)' }}>
        {tabs.map((tb) => {
          const Icon = tb.icon;
          const isActive = tab === tb.key;
          return (
            <button
              key={tb.key}
              onClick={() => setTab(tb.key)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200"
              style={{
                background: isActive ? 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))' : 'transparent',
                color: isActive ? '#fff' : 'var(--color-text-muted)',
              }}
            >
              <Icon size={16} />
              {tb.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        {tab === 'polls' && (
          <motion.div
            key="polls"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-4"
          >
            {pollsLoading && <LoadingSpinner size={32} className="min-h-[30vh]" />}
            {!pollsLoading && (!pollsData?.polls || pollsData.polls.length === 0) && (
              <div className="glass-card flex flex-col items-center py-12 gap-3">
                <BarChart3 size={40} style={{ color: 'var(--color-text-muted)' }} />
                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  {t('governance.noPolls', 'No polls yet. Create the first one!')}
                </p>
              </div>
            )}
            {pollsData?.polls?.map((poll) => (
              <PollCard
                key={poll.id}
                poll={poll}
                votesByOption={[]}
                totalVotes={poll.totalVotes || 0}
                userVote={undefined}
                onVoted={reloadPolls}
              />
            ))}
          </motion.div>
        )}

        {tab === 'proposals' && (
          <motion.div
            key="proposals"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-4"
          >
            {proposalsLoading && <LoadingSpinner size={32} className="min-h-[30vh]" />}
            {!proposalsLoading && (!proposalsData?.proposals || proposalsData.proposals.length === 0) && (
              <div className="glass-card flex flex-col items-center py-12 gap-3">
                <Vote size={40} style={{ color: 'var(--color-text-muted)' }} />
                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  {t('governance.noProposals', 'No proposals yet. Submit the first one!')}
                </p>
              </div>
            )}
            {proposalsData?.proposals?.map((p) => (
              <ProposalCard
                key={p.id}
                proposal={p}
                yesVotes={p.yesVotes || 0}
                noVotes={p.noVotes || 0}
                totalVotes={p.totalVotes || 0}
                userVote={undefined}
                onVoted={reloadProposals}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create Poll Modal */}
      <AnimatePresence>
        {showCreatePoll && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60"
              onClick={() => setShowCreatePoll(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative glass-card w-full max-w-lg max-h-[85vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
                  {t('governance.createPoll', 'Create Poll')}
                </h2>
                <button onClick={() => setShowCreatePoll(false)} className="p-1 rounded-lg hover:bg-white/10">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--color-text-muted)' }}>
                    {t('governance.pollTitle', 'Title')}
                  </label>
                  <input
                    value={pollTitle}
                    onChange={(e) => setPollTitle(e.target.value)}
                    placeholder={t('governance.pollTitlePlaceholder', 'What do you want to ask?')}
                    className="w-full px-4 py-2.5 rounded-xl border bg-transparent outline-none text-sm"
                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--color-text-muted)' }}>
                    {t('governance.description', 'Description')} ({t('common.optional', 'optional')})
                  </label>
                  <textarea
                    value={pollDescription}
                    onChange={(e) => setPollDescription(e.target.value)}
                    rows={2}
                    className="w-full px-4 py-2.5 rounded-xl border bg-transparent outline-none text-sm resize-none"
                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--color-text-muted)' }}>
                    {t('governance.options', 'Options')}
                  </label>
                  <div className="space-y-2">
                    {pollOptions.map((opt, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          value={opt}
                          onChange={(e) => updatePollOption(idx, e.target.value)}
                          placeholder={`${t('governance.option', 'Option')} ${idx + 1}`}
                          className="flex-1 px-4 py-2 rounded-xl border bg-transparent outline-none text-sm"
                          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                        />
                        {pollOptions.length > 2 && (
                          <button onClick={() => removePollOption(idx)} className="p-1 rounded hover:bg-white/10">
                            <X size={16} style={{ color: 'var(--color-danger)' }} />
                          </button>
                        )}
                      </div>
                    ))}
                    {pollOptions.length < 10 && (
                      <button
                        onClick={addPollOption}
                        className="text-xs flex items-center gap-1 hover:underline"
                        style={{ color: 'var(--color-primary)' }}
                      >
                        <Plus size={14} /> {t('governance.addOption', 'Add option')}
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--color-text-muted)' }}>
                    {t('governance.deadline', 'Deadline')}
                  </label>
                  <select
                    value={pollDeadlineHours}
                    onChange={(e) => setPollDeadlineHours(Number(e.target.value))}
                    className="w-full px-4 py-2.5 rounded-xl border bg-transparent outline-none text-sm"
                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                  >
                    <option value={1}>1 {t('governance.hour', 'hour')}</option>
                    <option value={6}>6 {t('governance.hours', 'hours')}</option>
                    <option value={12}>12 {t('governance.hours', 'hours')}</option>
                    <option value={24}>1 {t('governance.day', 'day')}</option>
                    <option value={72}>3 {t('governance.days', 'days')}</option>
                    <option value={168}>7 {t('governance.days', 'days')}</option>
                    <option value={720}>30 {t('governance.days', 'days')}</option>
                  </select>
                </div>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleCreatePoll}
                  disabled={creatingPoll || !pollTitle.trim() || pollOptions.filter((o) => o.trim()).length < 2}
                  className="w-full btn-primary py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  {creatingPoll && <Loader2 size={16} className="animate-spin" />}
                  {creatingPoll ? t('common.loading', 'Loading...') : t('governance.createPoll', 'Create Poll')}
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Create Proposal Modal */}
      <AnimatePresence>
        {showCreateProposal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60"
              onClick={() => setShowCreateProposal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative glass-card w-full max-w-lg max-h-[85vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
                  {t('governance.createProposal', 'Create Proposal')}
                </h2>
                <button onClick={() => setShowCreateProposal(false)} className="p-1 rounded-lg hover:bg-white/10">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--color-text-muted)' }}>
                    {t('governance.proposalTitle', 'Title')}
                  </label>
                  <input
                    value={proposalTitle}
                    onChange={(e) => setProposalTitle(e.target.value)}
                    placeholder={t('governance.proposalTitlePlaceholder', 'Proposal title...')}
                    className="w-full px-4 py-2.5 rounded-xl border bg-transparent outline-none text-sm"
                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--color-text-muted)' }}>
                    {t('governance.description', 'Description')}
                  </label>
                  <textarea
                    value={proposalDescription}
                    onChange={(e) => setProposalDescription(e.target.value)}
                    rows={4}
                    placeholder={t('governance.proposalDescPlaceholder', 'Describe the proposal in detail...')}
                    className="w-full px-4 py-2.5 rounded-xl border bg-transparent outline-none text-sm resize-none"
                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--color-text-muted)' }}>
                      {t('governance.quorum', 'Quorum')}
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={proposalQuorum}
                      onChange={(e) => setProposalQuorum(Number(e.target.value) || 1)}
                      className="w-full px-4 py-2.5 rounded-xl border bg-transparent outline-none text-sm"
                      style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--color-text-muted)' }}>
                      {t('governance.deadline', 'Deadline')}
                    </label>
                    <select
                      value={proposalDeadlineHours}
                      onChange={(e) => setProposalDeadlineHours(Number(e.target.value))}
                      className="w-full px-4 py-2.5 rounded-xl border bg-transparent outline-none text-sm"
                      style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                    >
                      <option value={24}>1 {t('governance.day', 'day')}</option>
                      <option value={72}>3 {t('governance.days', 'days')}</option>
                      <option value={168}>7 {t('governance.days', 'days')}</option>
                      <option value={336}>14 {t('governance.days', 'days')}</option>
                      <option value={720}>30 {t('governance.days', 'days')}</option>
                    </select>
                  </div>
                </div>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleCreateProposal}
                  disabled={creatingProposal || !proposalTitle.trim()}
                  className="w-full btn-primary py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  {creatingProposal && <Loader2 size={16} className="animate-spin" />}
                  {creatingProposal ? t('common.loading', 'Loading...') : t('governance.createProposal', 'Create Proposal')}
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
