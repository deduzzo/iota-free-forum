import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Globe, Key, Server, Wifi, ArrowRight,
  Loader2, CheckCircle, AlertCircle, Copy, ExternalLink,
  Shield, Eye,
} from 'lucide-react';

/**
 * Setup page — shown on first launch or when user navigates to /setup.
 *
 * Two modes:
 * A) CREATE NEW FORUM — this instance is the "master" server.
 *    The wallet is already initialized (mnemonic generated on first boot).
 *    Show the connection string so others can connect.
 *
 * B) CONNECT TO EXISTING FORUM — this instance is a "reader" or "mirror".
 *    User enters the connection string (network:address) of an existing forum.
 *    The app configures itself to read from that address.
 *    Write operations go through the original server's API (or are disabled).
 */

function ModeCard({ icon: Icon, title, description, selected, onClick, badge }) {
  return (
    <motion.button
      onClick={onClick}
      className="relative text-left p-6 rounded-xl transition-all w-full"
      style={{
        backgroundColor: selected ? 'var(--color-surface)' : 'transparent',
        border: selected ? '2px solid var(--color-primary)' : '2px solid var(--color-border)',
        borderRadius: 'var(--border-radius)',
        boxShadow: selected ? '0 0 20px rgba(0,240,255,0.15)' : 'none',
      }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      {badge && (
        <span
          className="absolute top-3 right-3 text-xs px-2 py-0.5 rounded-full font-medium"
          style={{ backgroundColor: 'rgba(0,240,255,0.15)', color: 'var(--color-primary)' }}
        >
          {badge}
        </span>
      )}
      <div className="flex items-start gap-4">
        <div
          className="p-3 rounded-lg shrink-0"
          style={{
            backgroundColor: selected ? 'rgba(0,240,255,0.15)' : 'var(--color-surface)',
          }}
        >
          <Icon size={28} style={{ color: selected ? 'var(--color-primary)' : 'var(--color-text-muted)' }} />
        </div>
        <div>
          <h3 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>{title}</h3>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-text-muted)' }}>{description}</p>
        </div>
      </div>
    </motion.button>
  );
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="p-1.5 rounded-lg transition-all"
      style={{ backgroundColor: 'var(--color-surface-hover)' }}
      title="Copia"
    >
      {copied ? <CheckCircle size={16} style={{ color: 'var(--color-success)' }} /> : <Copy size={16} style={{ color: 'var(--color-text-muted)' }} />}
    </button>
  );
}

export default function Setup() {
  const [mode, setMode] = useState(null); // 'create' | 'connect'
  const [step, setStep] = useState(0);
  const [forumInfo, setForumInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connectAddress, setConnectAddress] = useState('');
  const [connectNetwork, setConnectNetwork] = useState('testnet');
  const [connectStatus, setConnectStatus] = useState(null);
  const [forumName, setForumName] = useState('');
  const [deploying, setDeploying] = useState(false);
  const [deployError, setDeployError] = useState(null);
  const needsDeploy = forumInfo && !forumInfo.packageId;

  // Fetch current forum info on mount
  useEffect(() => {
    fetch('/api/v1/forum-info')
      .then(r => r.json())
      .then(data => {
        setForumInfo(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Parse connection string:
  // New format (7 segments): network:packageId:forumId:registryId:treasuryId:subscriptionStoreId:marketplaceStoreId
  // Legacy format (3 segments): network:packageId:forumObjectId
  // Legacy format (2 segments): network:address
  const parseConnectionString = (str) => {
    const trimmed = str.trim();
    const parts = trimmed.split(':');
    if (parts.length === 7) {
      return {
        network: parts[0],
        packageId: parts[1],
        forumObjectId: parts[2],
        registryId: parts[3],
        treasuryId: parts[4],
        subscriptionStoreId: parts[5],
        marketplaceStoreId: parts[6],
      };
    }
    if (parts.length === 3) {
      return { network: parts[0], packageId: parts[1], forumObjectId: parts[2] };
    }
    if (parts.length === 2 && parts[1].startsWith('0x')) {
      // Could be network:address (legacy) — try as-is
      return { network: parts[0], packageId: parts[1], forumObjectId: null };
    }
    return { network: connectNetwork, packageId: trimmed, forumObjectId: null };
  };

  // Test connection to a remote forum contract
  const testConnection = async () => {
    setConnectStatus({ type: 'loading', msg: 'Verificando contratto sulla blockchain...' });
    try {
      const res = await fetch('/api/v1/sync-connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionString: connectAddress.includes(':')
            ? connectAddress
            : `${connectNetwork}:${connectAddress}`,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setConnectStatus({
          type: 'success',
          msg: `Connesso! Trovati ${data.totalEvents || 0} eventi del forum.`,
        });
      } else {
        setConnectStatus({ type: 'error', msg: data.error || 'Impossibile connettersi.' });
      }
    } catch (err) {
      setConnectStatus({ type: 'error', msg: 'Errore di rete: ' + err.message });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 size={32} className="animate-spin" style={{ color: 'var(--color-primary)' }} />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <motion.div
        className="text-center mb-10"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1
          className="text-4xl font-bold neon-text mb-3"
          style={{ fontFamily: 'var(--font-heading)' }}
        >
          IotaPolis
        </h1>
        <p className="text-lg" style={{ color: 'var(--color-text-muted)' }}>
          Forum decentralizzato su IOTA 2.0 — zero fee, post firmati, immutabili
        </p>
      </motion.div>

      {/* Mode selection */}
      <AnimatePresence mode="wait">
        {mode === null && (
          <motion.div
            key="select"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-4"
          >
            <p className="text-center mb-6" style={{ color: 'var(--color-text-muted)' }}>
              Come vuoi iniziare?
            </p>

            <ModeCard
              icon={Plus}
              title="Crea un nuovo forum"
              description="Questo server diventa il nodo principale. Genera un nuovo wallet IOTA e inizia a pubblicare. Gli altri potranno collegarsi inserendo il tuo indirizzo."
              selected={false}
              onClick={() => setMode('create')}
              badge="Server master"
            />

            <ModeCard
              icon={Globe}
              title="Collegati a un forum esistente"
              description="Inserisci l'indirizzo IOTA di un forum esistente per scaricare tutte le transazioni dalla blockchain e partecipare. Puoi leggere tutto — per scrivere ti serve un'identità."
              selected={false}
              onClick={() => setMode('connect')}
              badge="Lettore / Mirror"
            />

            {/* Explanation */}
            <div className="glass-card p-5 rounded-xl mt-8" style={{ borderRadius: 'var(--border-radius)' }}>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Shield size={18} style={{ color: 'var(--color-primary)' }} />
                Come funziona
              </h3>
              <div className="space-y-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                <p>
                  <strong style={{ color: 'var(--color-text)' }}>Ogni forum ha un wallet server.</strong> Il wallet del server serve solo per inviare gas (faucet) ai nuovi utenti su testnet.
                </p>
                <p>
                  <strong style={{ color: 'var(--color-text)' }}>Ogni utente ha il proprio wallet IOTA</strong> (Ed25519) e firma le transazioni direttamente sulla blockchain.
                </p>
                <p>
                  <strong style={{ color: 'var(--color-text)' }}>Per leggere</strong> basta la connection string. Chiunque puo scaricare e verificare tutti i dati.
                </p>
                <p>
                  <strong style={{ color: 'var(--color-text)' }}>Nessuno puo falsificare</strong> i post di un altro utente — ogni transazione e firmata dal wallet dell'autore e verificata dai validatori IOTA.
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* CREATE NEW FORUM */}
        {mode === 'create' && (
          <motion.div
            key="create"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            <button
              onClick={() => setMode(null)}
              className="text-sm flex items-center gap-1 mb-4"
              style={{ color: 'var(--color-text-muted)' }}
            >
              ← Torna indietro
            </button>

            {/* Step indicators */}
            <div className="flex items-center justify-center gap-0 mb-6">
              <div className="flex flex-col items-center">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
                  style={{
                    backgroundColor: needsDeploy ? 'var(--color-primary)' : 'var(--color-success)',
                    color: 'var(--color-background)',
                    boxShadow: needsDeploy ? '0 0 15px rgba(0,240,255,0.4)' : '0 0 15px rgba(0,255,136,0.4)',
                  }}
                >
                  {needsDeploy ? '1' : <CheckCircle size={18} />}
                </div>
                <span className="text-xs mt-1" style={{ color: needsDeploy ? 'var(--color-primary)' : 'var(--color-success)' }}>
                  Deploy
                </span>
              </div>
              <div
                className="w-16 h-0.5 mb-5"
                style={{
                  backgroundColor: needsDeploy ? 'var(--color-border)' : 'var(--color-success)',
                  transition: 'background-color 0.5s ease',
                }}
              />
              <div className="flex flex-col items-center">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
                  style={{
                    backgroundColor: needsDeploy ? 'var(--color-surface)' : 'var(--color-primary)',
                    color: needsDeploy ? 'var(--color-text-muted)' : 'var(--color-background)',
                    border: needsDeploy ? '2px solid var(--color-border)' : 'none',
                    boxShadow: !needsDeploy ? '0 0 15px rgba(0,240,255,0.4)' : 'none',
                  }}
                >
                  2
                </div>
                <span className="text-xs mt-1" style={{ color: needsDeploy ? 'var(--color-text-muted)' : 'var(--color-primary)' }}>
                  Pronto
                </span>
              </div>
            </div>

            {/* STEP 1: Deploy contract (if needed) */}
            {needsDeploy && (
              <div className="glass-card p-6 rounded-xl" style={{ borderRadius: 'var(--border-radius)' }}>
                <div className="flex items-center gap-3 mb-4">
                  <Server size={24} style={{ color: 'var(--color-warning)' }} />
                  <h2 className="text-xl font-bold">Step 1: Deploya lo Smart Contract</h2>
                </div>

                <p className="mb-4" style={{ color: 'var(--color-text-muted)' }}>
                  Il wallet server e stato creato. Ora devi deployare lo smart contract Move sulla blockchain IOTA.
                  Questo crea i 6 oggetti condivisi che gestiscono il forum.
                </p>

                <div className="mb-4 p-3 rounded-lg text-sm" style={{ backgroundColor: 'var(--color-background)' }}>
                  <div className="flex items-center gap-2 mb-1">
                    <Key size={14} style={{ color: 'var(--color-primary)' }} />
                    <span style={{ color: 'var(--color-text-muted)' }}>Wallet server:</span>
                  </div>
                  <code className="font-mono text-xs break-all" style={{ color: 'var(--color-primary)' }}>
                    {forumInfo?.address || '...'}
                  </code>
                </div>

                {deployError && (
                  <div className="mb-4 p-3 rounded-lg text-sm flex items-center gap-2"
                    style={{ backgroundColor: 'rgba(255,68,68,0.1)', color: 'var(--color-danger)' }}>
                    <AlertCircle size={16} />
                    {deployError}
                  </div>
                )}

                <button
                  onClick={async () => {
                    setDeploying(true);
                    setDeployError(null);
                    try {
                      const res = await fetch('/api/v1/deploy-contract', { method: 'POST' });
                      const data = await res.json();
                      if (data.success) {
                        // Refresh forum info
                        const infoRes = await fetch('/api/v1/forum-info');
                        const info = await infoRes.json();
                        setForumInfo(info);
                      } else {
                        setDeployError(data.error || 'Deploy fallito. Verifica che il wallet abbia fondi.');
                      }
                    } catch (err) {
                      setDeployError('Errore: ' + err.message);
                    }
                    setDeploying(false);
                  }}
                  disabled={deploying}
                  className="w-full py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-all"
                  style={{
                    backgroundColor: deploying ? 'var(--color-surface)' : 'var(--color-warning)',
                    color: deploying ? 'var(--color-text-muted)' : 'var(--color-background)',
                    borderRadius: 'var(--border-radius)',
                  }}
                >
                  {deploying ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Deploy in corso... (30-60 secondi)
                    </>
                  ) : (
                    <>
                      <Server size={18} />
                      Deploya Smart Contract
                    </>
                  )}
                </button>
              </div>
            )}

            {/* STEP 2: Forum ready (shown after deploy) */}
            {!needsDeploy && (
              <>
                <div className="glass-card p-6 rounded-xl" style={{ borderRadius: 'var(--border-radius)' }}>
                  <div className="flex items-center gap-3 mb-4">
                    <CheckCircle size={24} style={{ color: 'var(--color-success)' }} />
                    <h2 className="text-xl font-bold">Il tuo forum e pronto!</h2>
                  </div>

                  <p className="mb-6" style={{ color: 'var(--color-text-muted)' }}>
                    Smart contract deployato e wallet configurato. Condividi la stringa di connessione con chi vuole collegarsi.
                  </p>

                  {/* Connection info */}
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-medium block mb-1" style={{ color: 'var(--color-text-muted)' }}>
                        Indirizzo wallet (pubblico)
                      </label>
                      <div className="flex items-center gap-2">
                        <code
                          className="flex-1 p-3 rounded-lg text-sm font-mono break-all"
                          style={{ backgroundColor: 'var(--color-background)', color: 'var(--color-primary)' }}
                        >
                          {forumInfo?.address}
                        </code>
                        <CopyButton text={forumInfo?.address} />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-medium block mb-1" style={{ color: 'var(--color-text-muted)' }}>
                        Network
                      </label>
                      <div
                        className="p-3 rounded-lg text-sm font-mono"
                        style={{ backgroundColor: 'var(--color-background)' }}
                      >
                        {forumInfo?.network || 'testnet'}
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-medium block mb-1" style={{ color: 'var(--color-text-muted)' }}>
                        Stringa di connessione (da condividere)
                      </label>
                      <div className="flex items-center gap-2">
                        <code
                          className="flex-1 p-3 rounded-lg text-sm font-mono break-all"
                          style={{ backgroundColor: 'var(--color-background)', color: 'var(--color-success)' }}
                        >
                          {forumInfo?.connectionString}
                        </code>
                        <CopyButton text={forumInfo?.connectionString} />
                      </div>
                    </div>

                    {forumInfo?.explorerUrl && forumInfo?.address && (
                      <a
                        href={`${forumInfo.explorerUrl}/address/${forumInfo.address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-sm"
                        style={{ color: 'var(--color-primary)' }}
                      >
                        <ExternalLink size={14} />
                        Vedi su Explorer
                      </a>
                    )}
                  </div>
                </div>

                {/* Warning */}
                <div
                  className="p-4 rounded-xl border text-sm"
                  style={{
                    borderColor: 'var(--color-primary)',
                    backgroundColor: 'rgba(0,240,255,0.05)',
                    color: 'var(--color-text-muted)',
                    borderRadius: 'var(--border-radius)',
                  }}
                >
                  <strong style={{ color: 'var(--color-primary)' }}>Nota:</strong> Il wallet server serve solo per il faucet (invio gas ai nuovi utenti). Ogni utente firma con il proprio wallet.
                </div>

                <button
                  onClick={() => { localStorage.setItem('forum_setup_done', 'create'); window.location.href = '/identity'; }}
                  className="w-full py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-all"
                  style={{
                    backgroundColor: 'var(--color-primary)',
                    color: 'var(--color-background)',
                    borderRadius: 'var(--border-radius)',
                  }}
                >
                  Vai al forum
                  <ArrowRight size={18} />
                </button>
              </>
            )}
          </motion.div>
        )}

        {/* CONNECT TO EXISTING FORUM */}
        {mode === 'connect' && (
          <motion.div
            key="connect"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            <button
              onClick={() => { setMode(null); setConnectStatus(null); }}
              className="text-sm flex items-center gap-1 mb-4"
              style={{ color: 'var(--color-text-muted)' }}
            >
              ← Torna indietro
            </button>

            <div className="glass-card p-6 rounded-xl" style={{ borderRadius: 'var(--border-radius)' }}>
              <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
                <Globe size={22} style={{ color: 'var(--color-primary)' }} />
                Collegati a un forum
              </h2>
              <p className="mb-6 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                Inserisci la stringa di connessione del forum. Formato completo: network:packageId:forumId:registryId:treasuryId:subscriptionStoreId:marketplaceStoreId
              </p>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium block mb-1" style={{ color: 'var(--color-text-muted)' }}>
                    Stringa di connessione
                  </label>
                  <input
                    type="text"
                    value={connectAddress}
                    onChange={e => setConnectAddress(e.target.value)}
                    placeholder="testnet:0xPKG:0xFORUM:0xREGISTRY:0xTREASURY:0xSUBSTORE:0xMKTSTORE"
                    className="w-full p-3 rounded-lg text-sm font-mono"
                    style={{
                      backgroundColor: 'var(--color-background)',
                      color: 'var(--color-text)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--border-radius)',
                    }}
                  />
                </div>

                <div>
                  <label className="text-xs font-medium block mb-1" style={{ color: 'var(--color-text-muted)' }}>
                    Network
                  </label>
                  <select
                    value={connectNetwork}
                    onChange={e => setConnectNetwork(e.target.value)}
                    className="w-full p-3 rounded-lg text-sm"
                    style={{
                      backgroundColor: 'var(--color-background)',
                      color: 'var(--color-text)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--border-radius)',
                    }}
                  >
                    <option value="testnet">Testnet</option>
                    <option value="devnet">Devnet</option>
                    <option value="mainnet">Mainnet</option>
                  </select>
                </div>

                {/* Status */}
                <AnimatePresence>
                  {connectStatus && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="flex items-center gap-2 p-3 rounded-lg text-sm"
                      style={{
                        backgroundColor: connectStatus.type === 'success'
                          ? 'rgba(0,255,136,0.1)' : connectStatus.type === 'error'
                          ? 'rgba(255,68,68,0.1)' : 'rgba(255,170,0,0.1)',
                        color: connectStatus.type === 'success'
                          ? 'var(--color-success)' : connectStatus.type === 'error'
                          ? 'var(--color-danger)' : 'var(--color-warning)',
                      }}
                    >
                      {connectStatus.type === 'loading' && <Loader2 size={16} className="animate-spin" />}
                      {connectStatus.type === 'success' && <CheckCircle size={16} />}
                      {connectStatus.type === 'error' && <AlertCircle size={16} />}
                      {connectStatus.msg}
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex gap-3">
                  {connectStatus?.type !== 'success' ? (
                    <button
                      onClick={testConnection}
                      disabled={!connectAddress.trim() || connectStatus?.type === 'loading'}
                      className="flex-1 py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-all"
                      style={{
                        backgroundColor: 'var(--color-primary)',
                        color: 'var(--color-background)',
                        borderRadius: 'var(--border-radius)',
                        opacity: !connectAddress.trim() ? 0.5 : 1,
                      }}
                    >
                      <Wifi size={18} />
                      Verifica e connetti
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        localStorage.setItem('forum_setup_done', 'connect');
                        localStorage.setItem('forum_remote_address', connectAddress);
                        localStorage.setItem('forum_remote_network', connectNetwork);
                        window.location.href = '/identity';
                      }}
                      className="flex-1 py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-all"
                      style={{
                        backgroundColor: 'var(--color-success)',
                        color: 'var(--color-background)',
                        borderRadius: 'var(--border-radius)',
                      }}
                    >
                      <ArrowRight size={18} />
                      Continua — Crea la tua identita
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* How it works */}
            <div className="glass-card p-5 rounded-xl" style={{ borderRadius: 'var(--border-radius)' }}>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Eye size={18} style={{ color: 'var(--color-primary)' }} />
                Cosa succede quando ti colleghi
              </h3>
              <ol className="space-y-2 text-sm list-decimal list-inside" style={{ color: 'var(--color-text-muted)' }}>
                <li>Il tuo server si collega allo smart contract Move del forum</li>
                <li>Scarica tutti gli eventi (post, thread, utenti, voti...) dalla blockchain</li>
                <li>Ricostruisce il database locale — puoi navigare tutto il forum</li>
                <li>Per scrivere, registri la tua identita e interagisci direttamente con il contratto</li>
                <li>Ogni utente paga il proprio gas — su testnet e gratis (faucet)</li>
              </ol>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
