import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
  Bot, Play, Pause, Square, Activity, AlertTriangle, CheckCircle2,
  XCircle, Users, Zap, Clock, Settings2, MessageSquare, Bug,
  Lightbulb, ChevronDown, RefreshCw,
} from 'lucide-react';
import { useIdentity } from '../hooks/useIdentity';
import { api } from '../api/endpoints';

// ── Personality colors & icons ──────────────────────────────────────────────

const PERSONALITY_COLORS = {
  explorer: { bg: 'rgba(59, 130, 246, 0.15)', border: 'rgba(59, 130, 246, 0.4)', text: '#60a5fa' },
  lurker: { bg: 'rgba(107, 114, 128, 0.15)', border: 'rgba(107, 114, 128, 0.4)', text: '#9ca3af' },
  trader: { bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.4)', text: '#fbbf24' },
  troll: { bg: 'rgba(239, 68, 68, 0.15)', border: 'rgba(239, 68, 68, 0.4)', text: '#f87171' },
  normal: { bg: 'rgba(34, 197, 94, 0.15)', border: 'rgba(34, 197, 94, 0.4)', text: '#4ade80' },
};

const SEVERITY_COLORS = {
  low: { bg: 'rgba(59, 130, 246, 0.15)', text: '#60a5fa' },
  medium: { bg: 'rgba(245, 158, 11, 0.15)', text: '#fbbf24' },
  high: { bg: 'rgba(239, 68, 68, 0.15)', text: '#f87171' },
};

const STATUS_ICONS = {
  running: { icon: Activity, color: '#4ade80' },
  paused: { icon: Pause, color: '#fbbf24' },
  stopped: { icon: Square, color: '#9ca3af' },
  ready: { icon: CheckCircle2, color: '#60a5fa' },
  initializing: { icon: RefreshCw, color: '#a78bfa' },
  funded: { icon: Zap, color: '#fbbf24' },
  fund_failed: { icon: XCircle, color: '#f87171' },
  register_failed: { icon: XCircle, color: '#f87171' },
};

const MODULES = [
  { id: 'forum', label: 'Forum' },
  { id: 'payments', label: 'Payments' },
  { id: 'escrow', label: 'Escrow' },
  { id: 'social', label: 'Social' },
  { id: 'edgecases', label: 'Edge Cases' },
];

const PERSONALITIES = ['random', 'balanced', 'explorer', 'lurker', 'trader', 'troll', 'normal'];

const DURATIONS = [
  { value: 60, label: '1 min' },
  { value: 300, label: '5 min' },
  { value: 600, label: '10 min' },
  { value: 1800, label: '30 min' },
  { value: 3600, label: '1 hour' },
  { value: 0, label: 'Unlimited' },
];

const FREQUENCIES = [
  { value: 5, label: '5s' },
  { value: 10, label: '10s' },
  { value: 15, label: '15s' },
  { value: 30, label: '30s' },
  { value: 60, label: '60s' },
];

// ── Glass card wrapper ──────────────────────────────────────────────────────

function GlassCard({ children, className = '' }) {
  return (
    <div
      className={`rounded-xl border p-4 ${className}`}
      style={{
        background: 'var(--color-surface, rgba(255,255,255,0.03))',
        borderColor: 'var(--color-border, rgba(255,255,255,0.08))',
        backdropFilter: 'blur(12px)',
      }}
    >
      {children}
    </div>
  );
}

// ── Mini bar chart (no library) ─────────────────────────────────────────────

function MiniBarChart({ data, maxBars = 30 }) {
  const bars = data.slice(-maxBars);
  const max = Math.max(...bars, 1);

  return (
    <div className="flex items-end gap-0.5 h-16">
      {bars.map((val, i) => (
        <motion.div
          key={i}
          initial={{ height: 0 }}
          animate={{ height: `${(val / max) * 100}%` }}
          transition={{ duration: 0.3 }}
          className="flex-1 rounded-t-sm min-w-[3px]"
          style={{
            background: val > 0
              ? 'linear-gradient(to top, var(--color-primary), var(--color-accent, var(--color-primary)))'
              : 'rgba(255,255,255,0.05)',
            opacity: 0.5 + (val / max) * 0.5,
          }}
          title={`${val} actions`}
        />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════

export default function AgentTesters() {
  const { t } = useTranslation();
  const { identity, unlocked, getAuthHeaders } = useIdentity();

  // ── Config state ────────────────────────────────────────────────────────
  const [agentCount, setAgentCount] = useState(5);
  const [duration, setDuration] = useState(300);
  const [frequency, setFrequency] = useState(10);
  const [personality, setPersonality] = useState('random');
  const [modules, setModules] = useState(['forum', 'payments', 'escrow', 'social', 'edgecases']);

  // ── Runtime state ──────────────────────────────────────────────────────
  const [status, setStatus] = useState(null);
  const [feedback, setFeedback] = useState([]);
  const [activityLog, setActivityLog] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');

  // ── Actions/minute chart data ──────────────────────────────────────────
  const [chartData, setChartData] = useState(new Array(30).fill(0));
  const actionCountRef = useRef(0);
  const chartIntervalRef = useRef(null);

  const isRunning = status?.running;
  const isPaused = status?.paused;

  // ── Poll status while running ──────────────────────────────────────────
  useEffect(() => {
    if (!identity?.address) return;

    let interval;
    const poll = async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await api.getAgentsStatus(headers);
        if (res.success) {
          setStatus(res);
          setActivityLog(res.activityLog || []);
          // Update action count for chart
          actionCountRef.current = res.stats?.actions || 0;
        }
      } catch { /* ignore */ }
    };

    poll(); // initial
    if (isRunning) {
      interval = setInterval(poll, 3000);
    }

    return () => clearInterval(interval);
  }, [identity?.address, isRunning]);

  // ── Chart ticker (every 10s, record actions delta) ─────────────────────
  useEffect(() => {
    let lastCount = actionCountRef.current;

    chartIntervalRef.current = setInterval(() => {
      const current = actionCountRef.current;
      const delta = current - lastCount;
      lastCount = current;

      setChartData(prev => {
        const next = [...prev, delta];
        if (next.length > 30) next.shift();
        return next;
      });
    }, 10000);

    return () => clearInterval(chartIntervalRef.current);
  }, []);

  // ── Module toggle ──────────────────────────────────────────────────────
  const toggleModule = (id) => {
    setModules(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
  };

  // ── Actions ────────────────────────────────────────────────────────────

  const handleStart = useCallback(async () => {
    if (!identity?.address || !unlocked) return;
    setLoading(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await api.startAgents(headers, {
        count: agentCount,
        duration,
        frequency,
        personality,
        modules,
      });
      if (res.success) {
        setStatus(res.status);
        setChartData(new Array(30).fill(0));
      } else {
        setError(res.error || 'Failed to start agents');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [identity?.address, unlocked, getAuthHeaders, agentCount, duration, frequency, personality, modules]);

  const handleStop = useCallback(async () => {
    if (!identity?.address || !unlocked) return;
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await api.stopAgents(headers);
      if (res.success) setStatus(res.status);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [identity?.address, unlocked, getAuthHeaders]);

  const handlePause = useCallback(async () => {
    if (!identity?.address || !unlocked) return;
    try {
      const headers = await getAuthHeaders();
      const res = await api.pauseAgents(headers);
      if (res.success) setStatus(res.status);
    } catch (err) {
      setError(err.message);
    }
  }, [identity?.address, unlocked, getAuthHeaders]);

  const fetchFeedback = useCallback(async () => {
    if (!identity?.address || !unlocked) return;
    try {
      const headers = await getAuthHeaders();
      const res = await api.getAgentsFeedback(headers);
      if (res.success) setFeedback(res.feedback || []);
    } catch { /* ignore */ }
  }, [identity?.address, unlocked, getAuthHeaders]);

  // Fetch feedback when switching to that tab
  useEffect(() => {
    if (activeTab === 'feedback') fetchFeedback();
  }, [activeTab, fetchFeedback]);

  // ── Guard: not admin ───────────────────────────────────────────────────
  if (!unlocked) {
    return (
      <div className="max-w-4xl mx-auto text-center py-20">
        <Bot size={48} className="mx-auto mb-4 opacity-40" />
        <p className="opacity-60">{t('agents.unlockRequired', 'Unlock your wallet to access Agent Testers')}</p>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════════════

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3"
      >
        <Bot size={28} style={{ color: 'var(--color-primary)' }} />
        <h1 className="text-2xl font-bold">{t('agents.title', 'Agent Beta Testers')}</h1>
        {isRunning && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="px-2 py-0.5 rounded-full text-xs font-mono"
            style={{
              background: isPaused ? 'rgba(245, 158, 11, 0.2)' : 'rgba(34, 197, 94, 0.2)',
              color: isPaused ? '#fbbf24' : '#4ade80',
            }}
          >
            {isPaused ? t('agents.status.paused', 'PAUSED') : t('agents.status.running', 'RUNNING')}
          </motion.span>
        )}
      </motion.div>

      {error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="p-3 rounded-lg border flex items-center gap-2"
          style={{ background: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.3)', color: '#f87171' }}
        >
          <AlertTriangle size={16} />
          <span className="text-sm">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto opacity-60 hover:opacity-100">
            <XCircle size={14} />
          </button>
        </motion.div>
      )}

      {/* ── Config + Controls ──────────────────────────────────────────── */}
      <GlassCard>
        <div className="flex items-center gap-2 mb-4">
          <Settings2 size={18} style={{ color: 'var(--color-primary)' }} />
          <h2 className="font-semibold">{t('agents.configuration', 'Configuration')}</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          {/* Agent count slider */}
          <div>
            <label className="text-xs opacity-60 block mb-1">{t('agents.count', 'Agents')}: {agentCount}</label>
            <input
              type="range"
              min="1"
              max="50"
              value={agentCount}
              onChange={e => setAgentCount(Number(e.target.value))}
              disabled={isRunning}
              className="w-full accent-[var(--color-primary)]"
            />
            <div className="flex justify-between text-xs opacity-40">
              <span>1</span><span>50</span>
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="text-xs opacity-60 block mb-1">{t('agents.duration', 'Duration')}</label>
            <select
              value={duration}
              onChange={e => setDuration(Number(e.target.value))}
              disabled={isRunning}
              className="w-full rounded-lg px-3 py-2 text-sm border"
              style={{
                background: 'var(--color-surface, rgba(0,0,0,0.3))',
                borderColor: 'var(--color-border)',
                color: 'inherit',
              }}
            >
              {DURATIONS.map(d => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>

          {/* Frequency */}
          <div>
            <label className="text-xs opacity-60 block mb-1">{t('agents.frequency', 'Frequency')}</label>
            <select
              value={frequency}
              onChange={e => setFrequency(Number(e.target.value))}
              disabled={isRunning}
              className="w-full rounded-lg px-3 py-2 text-sm border"
              style={{
                background: 'var(--color-surface, rgba(0,0,0,0.3))',
                borderColor: 'var(--color-border)',
                color: 'inherit',
              }}
            >
              {FREQUENCIES.map(f => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>

          {/* Personality */}
          <div>
            <label className="text-xs opacity-60 block mb-1">{t('agents.personality.label', 'Personality')}</label>
            <select
              value={personality}
              onChange={e => setPersonality(e.target.value)}
              disabled={isRunning}
              className="w-full rounded-lg px-3 py-2 text-sm border"
              style={{
                background: 'var(--color-surface, rgba(0,0,0,0.3))',
                borderColor: 'var(--color-border)',
                color: 'inherit',
              }}
            >
              {PERSONALITIES.map(p => (
                <option key={p} value={p}>{t(`agents.personality.${p}`, p.charAt(0).toUpperCase() + p.slice(1))}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Modules */}
        <div className="mb-4">
          <label className="text-xs opacity-60 block mb-2">{t('agents.modules.label', 'Modules')}</label>
          <div className="flex flex-wrap gap-2">
            {MODULES.map(m => (
              <button
                key={m.id}
                onClick={() => !isRunning && toggleModule(m.id)}
                disabled={isRunning}
                className="px-3 py-1.5 rounded-lg text-xs font-mono transition-all border"
                style={{
                  background: modules.includes(m.id) ? 'var(--color-primary-alpha, rgba(var(--color-primary-rgb, 99, 102, 241), 0.2))' : 'transparent',
                  borderColor: modules.includes(m.id) ? 'var(--color-primary)' : 'var(--color-border)',
                  color: modules.includes(m.id) ? 'var(--color-primary)' : 'inherit',
                  opacity: modules.includes(m.id) ? 1 : 0.5,
                }}
              >
                {t(`agents.modules.${m.id}`, m.label)}
              </button>
            ))}
          </div>
        </div>

        {/* Control buttons */}
        <div className="flex gap-3">
          {!isRunning ? (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleStart}
              disabled={loading || modules.length === 0}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm transition-all"
              style={{
                background: 'linear-gradient(135deg, var(--color-primary), var(--color-accent, var(--color-primary)))',
                color: 'white',
                opacity: loading || modules.length === 0 ? 0.5 : 1,
              }}
            >
              {loading ? <RefreshCw size={16} className="animate-spin" /> : <Play size={16} />}
              {t('agents.start', 'Start Agents')}
            </motion.button>
          ) : (
            <>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handlePause}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm border transition-all"
                style={{
                  borderColor: 'rgba(245, 158, 11, 0.4)',
                  background: 'rgba(245, 158, 11, 0.1)',
                  color: '#fbbf24',
                }}
              >
                <Pause size={16} />
                {isPaused ? t('agents.resume', 'Resume') : t('agents.pause', 'Pause')}
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleStop}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm border transition-all"
                style={{
                  borderColor: 'rgba(239, 68, 68, 0.4)',
                  background: 'rgba(239, 68, 68, 0.1)',
                  color: '#f87171',
                }}
              >
                {loading ? <RefreshCw size={16} className="animate-spin" /> : <Square size={16} />}
                {t('agents.stop', 'Stop')}
              </motion.button>
            </>
          )}
        </div>
      </GlassCard>

      {/* ── Stats Overview ─────────────────────────────────────────────── */}
      {status && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-3"
        >
          <GlassCard className="text-center">
            <div className="text-2xl font-bold font-mono" style={{ color: 'var(--color-primary)' }}>
              {status.stats?.actions || 0}
            </div>
            <div className="text-xs opacity-50 mt-1">{t('agents.status.totalActions', 'Total Actions')}</div>
          </GlassCard>
          <GlassCard className="text-center">
            <div className="text-2xl font-bold font-mono" style={{ color: '#f87171' }}>
              {status.stats?.errors || 0}
            </div>
            <div className="text-xs opacity-50 mt-1">{t('agents.status.errors', 'Errors')}</div>
          </GlassCard>
          <GlassCard className="text-center">
            <div className="text-2xl font-bold font-mono" style={{ color: '#4ade80' }}>
              {status.readyCount || 0}/{status.agentCount || 0}
            </div>
            <div className="text-xs opacity-50 mt-1">{t('agents.status.activeAgents', 'Active Agents')}</div>
          </GlassCard>
          <GlassCard className="text-center">
            <div className="text-2xl font-bold font-mono" style={{ color: '#fbbf24' }}>
              {status.stats?.feedbackCount || 0}
            </div>
            <div className="text-xs opacity-50 mt-1">{t('agents.status.feedbackItems', 'Feedback')}</div>
          </GlassCard>
        </motion.div>
      )}

      {/* ── Activity Chart ─────────────────────────────────────────────── */}
      {status && (
        <GlassCard>
          <div className="flex items-center gap-2 mb-3">
            <Activity size={16} style={{ color: 'var(--color-primary)' }} />
            <span className="text-sm font-medium">{t('agents.status.actionsPerInterval', 'Actions / 10s')}</span>
            {status.remaining > 0 && (
              <span className="ml-auto text-xs opacity-40 flex items-center gap-1">
                <Clock size={12} />
                {Math.floor(status.remaining / 60)}m {status.remaining % 60}s {t('agents.status.remaining', 'remaining')}
              </span>
            )}
          </div>
          <MiniBarChart data={chartData} />
        </GlassCard>
      )}

      {/* ── Tabs: Agents / Activity Feed / Feedback ───────────────────── */}
      {status && (
        <>
          <div className="flex gap-1 border-b" style={{ borderColor: 'var(--color-border)' }}>
            {[
              { id: 'dashboard', label: t('agents.tabs.agents', 'Agents'), icon: Users },
              { id: 'activity', label: t('agents.tabs.activity', 'Activity Feed'), icon: MessageSquare },
              { id: 'feedback', label: t('agents.tabs.feedback', 'Feedback'), icon: Bug, count: status.stats?.feedbackCount },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm transition-all border-b-2 -mb-px"
                style={{
                  borderColor: activeTab === tab.id ? 'var(--color-primary)' : 'transparent',
                  color: activeTab === tab.id ? 'var(--color-primary)' : 'inherit',
                  opacity: activeTab === tab.id ? 1 : 0.6,
                }}
              >
                <tab.icon size={14} />
                {tab.label}
                {tab.count > 0 && (
                  <span
                    className="px-1.5 py-0.5 rounded-full text-xs"
                    style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#f87171' }}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {/* ── Agents List ─────────────────────────────────────────── */}
            {activeTab === 'dashboard' && (
              <motion.div
                key="dashboard"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3"
              >
                {(status.agents || []).map((agent, i) => {
                  const pColor = PERSONALITY_COLORS[agent.personality] || PERSONALITY_COLORS.normal;
                  const sInfo = STATUS_ICONS[agent.status] || STATUS_ICONS.stopped;
                  const StatusIcon = sInfo.icon;

                  return (
                    <motion.div
                      key={agent.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                    >
                      <GlassCard className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Bot size={16} style={{ color: pColor.text }} />
                            <span className="font-medium text-sm">{agent.name}</span>
                          </div>
                          <StatusIcon size={14} style={{ color: sInfo.color }} />
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className="px-2 py-0.5 rounded-full text-xs"
                            style={{ background: pColor.bg, color: pColor.text, border: `1px solid ${pColor.border}` }}
                          >
                            {agent.personality}
                          </span>
                          <span className="text-xs opacity-40 font-mono">
                            {agent.address?.slice(0, 6)}...{agent.address?.slice(-4)}
                          </span>
                        </div>
                        <div className="flex justify-between text-xs opacity-50">
                          <span>{agent.actionsCount} {t('agents.status.actions', 'actions')}</span>
                          <span>{agent.errorsCount} {t('agents.status.errorsShort', 'errors')}</span>
                          {agent.lastAction && (
                            <span className="opacity-70">{agent.lastAction}</span>
                          )}
                        </div>
                      </GlassCard>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}

            {/* ── Activity Feed ───────────────────────────────────────── */}
            {activeTab === 'activity' && (
              <motion.div
                key="activity"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <GlassCard className="max-h-[500px] overflow-y-auto">
                  {activityLog.length === 0 ? (
                    <p className="text-sm opacity-40 text-center py-8">{t('agents.noActivity', 'No activity yet')}</p>
                  ) : (
                    <div className="space-y-1">
                      {activityLog.map((entry, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.02 }}
                          className="flex items-center gap-3 py-1.5 px-2 rounded-lg text-xs"
                          style={{
                            background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                          }}
                        >
                          <span className="opacity-30 font-mono w-16 shrink-0">
                            {new Date(entry.timestamp).toLocaleTimeString()}
                          </span>
                          <span className="font-medium w-20 shrink-0" style={{ color: PERSONALITY_COLORS[entry.personality]?.text || '#9ca3af' }}>
                            {entry.agentName}
                          </span>
                          <span className="opacity-70 flex-1 truncate">{entry.action}</span>
                          {entry.status === 'success' ? (
                            <CheckCircle2 size={12} style={{ color: '#4ade80' }} className="shrink-0" />
                          ) : (
                            <XCircle size={12} style={{ color: '#f87171' }} className="shrink-0" />
                          )}
                          <span className="opacity-30 font-mono w-12 text-right shrink-0">{entry.durationMs}ms</span>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </GlassCard>
              </motion.div>
            )}

            {/* ── Feedback Tab ────────────────────────────────────────── */}
            {activeTab === 'feedback' && (
              <motion.div
                key="feedback"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <GlassCard>
                  {feedback.length === 0 ? (
                    <p className="text-sm opacity-40 text-center py-8">{t('agents.noFeedback', 'No feedback yet')}</p>
                  ) : (
                    <div className="space-y-2">
                      {feedback.map((fb, i) => {
                        const sColor = SEVERITY_COLORS[fb.severity] || SEVERITY_COLORS.low;
                        const TypeIcon = fb.type === 'bug' ? Bug : fb.type === 'suggestion' ? Lightbulb : AlertTriangle;

                        return (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.03 }}
                            className="p-3 rounded-lg border"
                            style={{
                              background: 'rgba(255,255,255,0.02)',
                              borderColor: 'var(--color-border)',
                            }}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <TypeIcon size={14} style={{ color: sColor.text }} />
                              <span className="text-sm font-medium">{fb.agentName}</span>
                              <span className="opacity-40 text-xs">{fb.action}</span>
                              <span
                                className="ml-auto px-2 py-0.5 rounded-full text-xs"
                                style={{ background: sColor.bg, color: sColor.text }}
                              >
                                {fb.severity}
                              </span>
                            </div>
                            <p className="text-xs opacity-70 leading-relaxed">{fb.details}</p>
                            <div className="flex items-center gap-3 mt-1">
                              <span className="text-xs opacity-30">
                                {new Date(fb.timestamp).toLocaleString()}
                              </span>
                              {fb.txDigest && (
                                <span className="text-xs opacity-30 font-mono">
                                  TX: {fb.txDigest.slice(0, 10)}...
                                </span>
                              )}
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  )}
                </GlassCard>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
}
