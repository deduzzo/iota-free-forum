import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, X, Play, Square, AlertTriangle } from 'lucide-react';
import { useIdentity } from '../hooks/useIdentity';

const LOREM = [
  '## Discussione sulla DeFi\n\nLa finanza decentralizzata sta cambiando il mondo. Ecco i punti chiave:\n\n1. **Smart contract** automatizzano le transazioni\n2. **Liquidità** distribuita su pool\n3. **Governance** tramite token\n\n> La decentralizzazione non è una scelta, è il futuro.\n\nRiferimenti: [IOTA Foundation](https://www.iota.org) | [Move Language](https://move-language.github.io/move/)',
  '### Come funziona il consenso su IOTA 2.0\n\nIl protocollo utilizza un approccio innovativo:\n\n- **DAG (Directed Acyclic Graph)** per le transazioni\n- **Move VM** per l\'esecuzione degli smart contract\n- **Rebased consensus** per la finalità\n\n```rust\npublic fun transfer(from: &signer, to: address, amount: u64) {\n    let coin = coin::withdraw<IOTA>(from, amount);\n    coin::deposit(to, coin);\n}\n```\n\nPer approfondire: [Documentazione](https://docs.iota.org)',
  '**Annuncio importante** — Nuova release del forum!\n\n---\n\nCambiamenti principali:\n- [x] Editor WYSIWYG con Tiptap\n- [x] Temi multipli (Invision, Material, Cyber)\n- [x] Sincronizzazione real-time via blockchain\n- [ ] Messaggi privati (in sviluppo)\n\n| Feature | Status | Priorità |\n|---------|--------|----------|\n| Editor | Completato | Alta |\n| Temi | Completato | Media |\n| Chat | In corso | Bassa |',
  '### Tutorial: Deploy di uno Smart Contract Move\n\n```bash\n# Compila il contratto\nnpm run move:build\n\n# Deploya sulla testnet\nnpm run move:deploy\n\n# Verifica\ncurl http://localhost:1337/api/v1/forum-info\n```\n\n**Nota:** assicurati di avere fondi nella wallet. Usa il [faucet testnet](https://faucet.testnet.iota.org) per richiedere token gratuiti.\n\n> Ogni transazione costa circa 0.05 IOTA in gas fees.',
  '*Opinione personale* — Perché i forum decentralizzati sono importanti:\n\n1. **Nessuna censura** — i dati sono on-chain, immutabili\n2. **Proprietà dei dati** — le chiavi RSA sono dell\'utente\n3. **Trasparenza** — ogni azione ha un TX digest verificabile\n4. **Resilienza** — nessun single point of failure\n\nCome diceva Satoshi:\n> *"The root problem with conventional currency is all the trust that\'s required to make it work."*\n\nLink utili: [Bitcoin Whitepaper](https://bitcoin.org/bitcoin.pdf) | [IOTA Wiki](https://wiki.iota.org)',
  '## Benchmark risultati\n\nHo testato la latenza delle transazioni:\n\n| Operazione | Media | P95 | Max |\n|-----------|-------|-----|-----|\n| Post | 2.1s | 3.5s | 8.2s |\n| Reply | 1.9s | 3.2s | 7.1s |\n| Vote | 1.5s | 2.8s | 5.4s |\n\n**Conclusione:** il throughput è limitato dalla blockchain (~1 TX/s per wallet). Per scalare serve sharding o batch transactions.\n\n```\nThroughput: 0.8 TX/s\nLatenza media: 2.0s\nFee media: 0.05 IOTA\n```',
  '### FAQ del Forum\n\n**Q: Come funziona la firma dei messaggi?**\nA: Ogni browser genera una coppia di chiavi *RSA-2048*. Il messaggio viene firmato con `RSASSA-PKCS1-v1_5` + SHA-256.\n\n**Q: I dati sono davvero immutabili?**\nA: Sì! Ogni post è un evento Move emesso dal contratto `forum.move`. È verificabile su [Explorer](https://explorer.rebased.iota.org).\n\n**Q: Posso cancellare un post?**\nA: No. Puoi solo nasconderlo (moderazione), ma la versione originale resta on-chain per sempre.\n\n---\n\n*Ultimo aggiornamento: marzo 2026*',
];

function randomText(minLen = 100, maxLen = 800) {
  let text = '';
  while (text.length < minLen) {
    text += LOREM[Math.floor(Math.random() * LOREM.length)] + '\n\n';
  }
  if (text.length > maxLen) text = text.slice(0, maxLen);
  return text.trim();
}

export default function LoadTestPanel() {
  const { identity, postEvent, getAuthHeaders, unlocked } = useIdentity();
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState({ posts: 0, replies: 0, votes: 0, threads: 0, errors: 0 });
  const stopRef = useRef(false);
  const logsEndRef = useRef(null);

  const addLog = useCallback((msg, type = 'info') => {
    const ts = new Date().toLocaleTimeString();
    setLogs(prev => [...prev.slice(-500), { ts, msg, type }]);
  }, []);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  async function runLoadTest() {
    if (!identity) {
      addLog('Nessuna identità — registrati prima', 'error');
      return;
    }

    setRunning(true);
    stopRef.current = false;
    setStats({ posts: 0, replies: 0, votes: 0, threads: 0, errors: 0 });
    setLogs([]);

    addLog('=== LOAD TEST STARTED (on-chain) ===', 'success');
    addLog(`User: ${identity.userId}`);

    // Find categories and threads
    let categories = [];
    let threadIds = [];
    try {
      const catRes = await fetch('/api/v1/categories');
      const catData = await catRes.json();
      categories = Array.isArray(catData) ? catData : catData?.categories || [];
      addLog(`Trovate ${categories.length} categorie`);

      const thrRes = await fetch('/api/v1/threads?page=1');
      const thrData = await thrRes.json();
      const threads = thrData.threads || thrData.data || (Array.isArray(thrData) ? thrData : []);
      threadIds = threads.map(t => t.id);
      addLog(`Trovati ${threadIds.length} thread esistenti`);
    } catch (err) {
      addLog(`Errore caricamento dati: ${err.message}`, 'error');
    }

    const categoryId = categories[0]?.id;
    if (!categoryId) {
      addLog('Nessuna categoria trovata — crea una categoria prima', 'error');
      setRunning(false);
      return;
    }

    const allPostIds = []; // Track all created post IDs for edits/votes
    const postVersions = {}; // Track versions for edits
    let cycle = 0;
    const startTime = Date.now();

    while (!stopRef.current) {
      cycle++;
      addLog(`── Ciclo #${cycle} ──`, 'info');

      // 1. Create a thread every 3 cycles
      if (cycle % 3 === 1) {
        try {
          const t0 = Date.now();
          const tid = `THR_${Date.now().toString(36).toUpperCase()}`;
          const result = await postEvent('FORUM_THREAD', tid, {
            id: tid,
            categoryId,
            title: `Load Test Thread #${cycle} — ${Date.now().toString(36)}`,
            content: randomText(200, 1200),
            createdAt: Date.now(),
          }, 1);
          const elapsed = Date.now() - t0;
          if (result.effects?.status?.status === 'success') {
            threadIds.push(tid);
            setStats(s => ({ ...s, threads: s.threads + 1 }));
            addLog(`THREAD creato: ${tid} (${elapsed}ms)`, 'success');
          } else {
            setStats(s => ({ ...s, errors: s.errors + 1 }));
            addLog(`THREAD fallito (${elapsed}ms)`, 'error');
          }
        } catch (err) {
          setStats(s => ({ ...s, errors: s.errors + 1 }));
          addLog(`THREAD errore: ${err.message}`, 'error');
        }
        if (stopRef.current) break;
        await sleep(300);
      }

      // 2. Create 3 posts
      const targetThread = threadIds[Math.floor(Math.random() * threadIds.length)];
      if (targetThread) {
        const postIds = [];
        for (let i = 0; i < 3; i++) {
          if (stopRef.current) break;
          try {
            const t0 = Date.now();
            const pid = `POST_${Date.now().toString(36).toUpperCase()}`;
            const result = await postEvent('FORUM_POST', pid, {
              id: pid,
              threadId: targetThread,
              parentId: null,
              content: randomText(50, 600),
              createdAt: Date.now(),
            }, 1);
            const elapsed = Date.now() - t0;
            if (result.effects?.status?.status === 'success') {
              postIds.push(pid);
              allPostIds.push(pid);
              postVersions[pid] = 1;
              setStats(s => ({ ...s, posts: s.posts + 1 }));
              addLog(`POST ${pid} in ${targetThread} (${elapsed}ms)`, 'success');
            } else {
              setStats(s => ({ ...s, errors: s.errors + 1 }));
              addLog(`POST fallito (${elapsed}ms)`, 'error');
            }
          } catch (err) {
            setStats(s => ({ ...s, errors: s.errors + 1 }));
            addLog(`POST errore: ${err.message}`, 'error');
          }
          await sleep(200);
        }

        // 3. Reply to created posts
        for (const parentId of postIds) {
          if (stopRef.current) break;
          try {
            const t0 = Date.now();
            const rid = `POST_${Date.now().toString(36).toUpperCase()}`;
            const result = await postEvent('FORUM_POST', rid, {
              id: rid,
              threadId: targetThread,
              parentId,
              content: `Reply a ${parentId}: ${randomText(30, 200)}`,
              createdAt: Date.now(),
            }, 1);
            const elapsed = Date.now() - t0;
            if (result.effects?.status?.status === 'success') {
              setStats(s => ({ ...s, replies: s.replies + 1 }));
              addLog(`REPLY a ${parentId} (${elapsed}ms)`, 'success');
            } else {
              setStats(s => ({ ...s, errors: s.errors + 1 }));
              addLog(`REPLY fallito`, 'error');
            }
          } catch (err) {
            setStats(s => ({ ...s, errors: s.errors + 1 }));
          }
          await sleep(200);
        }

        // 4. Vote on posts
        for (const postId of postIds.slice(0, 2)) {
          if (stopRef.current) break;
          try {
            const t0 = Date.now();
            const vid = `VOTE_${Date.now().toString(36).toUpperCase()}`;
            const result = await postEvent('FORUM_VOTE', vid, {
              id: vid,
              postId,
              vote: Math.random() > 0.3 ? 1 : -1,
              createdAt: Date.now(),
            }, 1);
            const elapsed = Date.now() - t0;
            if (result.effects?.status?.status === 'success') {
              setStats(s => ({ ...s, votes: s.votes + 1 }));
              addLog(`VOTE su ${postId} (${elapsed}ms)`, 'success');
            } else {
              setStats(s => ({ ...s, errors: s.errors + 1 }));
            }
          } catch (err) {
            setStats(s => ({ ...s, errors: s.errors + 1 }));
          }
          await sleep(100);
        }
      }

      // 5. Edit a random existing post (every 2 cycles)
      if (cycle % 2 === 0 && allPostIds.length > 0) {
        const editTarget = allPostIds[Math.floor(Math.random() * allPostIds.length)];
        if (editTarget && !stopRef.current) {
          try {
            const t0 = Date.now();
            const newVersion = (postVersions[editTarget] || 1) + 1;
            const result = await postEvent('FORUM_POST', editTarget, {
              id: editTarget,
              content: `**[EDITED v${cycle}]** — ${randomText(50, 300)}`,
              createdAt: Date.now(),
            }, newVersion);
            const elapsed = Date.now() - t0;
            if (result.effects?.status?.status === 'success') {
              postVersions[editTarget] = newVersion;
              setStats(s => ({ ...s, edits: (s.edits || 0) + 1 }));
              addLog(`EDIT ${editTarget} → v${newVersion} (${elapsed}ms)`, 'success');
            } else {
              setStats(s => ({ ...s, errors: s.errors + 1 }));
              addLog(`EDIT fallito`, 'error');
            }
          } catch (err) {
            setStats(s => ({ ...s, errors: s.errors + 1 }));
          }
          await sleep(200);
        }
      }

      // 6. Post to a random OTHER thread (cross-thread activity)
      if (threadIds.length > 1 && !stopRef.current) {
        const otherThread = threadIds[Math.floor(Math.random() * threadIds.length)];
        if (otherThread && otherThread !== targetThread) {
          try {
            const t0 = Date.now();
            const pid = `POST_${Date.now().toString(36).toUpperCase()}`;
            const result = await postEvent('FORUM_POST', pid, {
              id: pid,
              threadId: otherThread,
              parentId: null,
              content: `Cross-thread post da ciclo #${cycle}: ${randomText(40, 250)}`,
              createdAt: Date.now(),
            }, 1);
            const elapsed = Date.now() - t0;
            if (result.effects?.status?.status === 'success') {
              allPostIds.push(pid);
              postVersions[pid] = 1;
              setStats(s => ({ ...s, posts: s.posts + 1 }));
              addLog(`CROSS-POST in ${otherThread} (${elapsed}ms)`, 'success');
            }
          } catch (err) {
            setStats(s => ({ ...s, errors: s.errors + 1 }));
          }
          await sleep(200);
        }
      }

      // Inter-cycle delay
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      const total = stats.threads + stats.posts + stats.replies + stats.votes + (stats.edits || 0);
      addLog(`Ciclo #${cycle} completato — ${total} TX totali in ${elapsed}s`);
      await sleep(500);
    }

    addLog('=== LOAD TEST STOPPED ===', 'warn');

    // Integrity check
    try {
      addLog('Eseguendo integrity check...');
      const authHdrs = unlocked ? await getAuthHeaders() : {};
      const res = await fetch('/api/v1/integrity-check', { headers: authHdrs });
      const data = await res.json();
      addLog(`Integrity: ${data.synced ? 'SYNCED' : 'MISMATCH'}`, data.synced ? 'success' : 'error');
      addLog(`Local: users=${data.local?.users} threads=${data.local?.threads} posts=${data.local?.posts} votes=${data.local?.votes}`);
      addLog(`Chain: users=${data.chain?.users} threads=${data.chain?.threads} posts=${data.chain?.posts} votes=${data.chain?.votes}`);
      if (data.mismatches) {
        for (const m of data.mismatches) {
          addLog(`MISMATCH: ${m.entity} local=${m.local} chain=${m.chain} diff=${m.diff}`, 'error');
        }
      }
    } catch (err) {
      addLog(`Integrity check failed: ${err.message}`, 'error');
    }

    setRunning(false);
  }

  function stopTest() {
    stopRef.current = true;
    addLog('Stopping...', 'warn');
  }

  return (
    <>
      {/* Trigger button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold"
        style={{ backgroundColor: 'var(--color-danger)', color: '#fff' }}
      >
        <Zap size={14} />
        Load Test
      </motion.button>

      {/* Modal overlay */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[100] flex items-center justify-center"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/80" onClick={() => !running && setOpen(false)} />
            <motion.div
              className="relative w-full max-w-3xl mx-4 rounded-xl border overflow-hidden flex flex-col"
              style={{
                background: 'var(--color-surface)',
                borderColor: 'var(--color-border)',
                maxHeight: '90vh',
                boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
              }}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3 border-b"
                style={{ borderColor: 'var(--color-border)', background: 'var(--color-danger)' }}>
                <div className="flex items-center gap-2 text-white">
                  <AlertTriangle size={18} />
                  <span className="font-bold">Load Test — Stress Test Forum</span>
                </div>
                <button onClick={() => { if (running) stopTest(); setOpen(false); }}
                  className="p-1 rounded text-white/80 hover:text-white">
                  <X size={18} />
                </button>
              </div>

              {/* Stats bar */}
              <div className="flex items-center gap-4 px-5 py-2 text-xs border-b flex-wrap"
                style={{ borderColor: 'var(--color-border)', background: 'var(--color-background)' }}>
                <span style={{ color: 'var(--color-success)' }}>Threads: {stats.threads}</span>
                <span style={{ color: 'var(--color-primary)' }}>Posts: {stats.posts}</span>
                <span style={{ color: 'var(--color-secondary)' }}>Replies: {stats.replies}</span>
                <span style={{ color: 'var(--color-warning)' }}>Votes: {stats.votes}</span>
                <span style={{ color: '#c084fc' }}>Edits: {stats.edits || 0}</span>
                <span style={{ color: 'var(--color-danger)' }}>Errors: {stats.errors}</span>
                <span style={{ color: 'var(--color-text-muted)' }}>
                  Total: {stats.threads + stats.posts + stats.replies + stats.votes}
                </span>
              </div>

              {/* Log area */}
              <div className="flex-1 overflow-y-auto p-4 font-mono text-xs" style={{ background: '#0a0a0a', minHeight: 300, maxHeight: '60vh' }}>
                {logs.length === 0 && (
                  <p style={{ color: '#666' }}>Premi Start per iniziare il flood di post, reply, voti...</p>
                )}
                {logs.map((log, i) => (
                  <div key={i} className="py-0.5" style={{
                    color: log.type === 'error' ? '#ff4444' :
                      log.type === 'success' ? '#00ff88' :
                      log.type === 'warn' ? '#ffaa00' : '#888',
                  }}>
                    <span style={{ color: '#555' }}>[{log.ts}]</span> {log.msg}
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 px-5 py-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
                {!running ? (
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={runLoadTest}
                    disabled={!identity}
                    className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-40"
                    style={{ backgroundColor: 'var(--color-success)' }}
                  >
                    <Play size={16} />
                    Start
                  </motion.button>
                ) : (
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={stopTest}
                    className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold text-white"
                    style={{ backgroundColor: 'var(--color-danger)' }}
                  >
                    <Square size={16} />
                    Stop
                  </motion.button>
                )}
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {!identity ? 'Registrati prima di avviare il test' :
                    running ? 'Il test invia thread, post, reply e voti in continuazione...' :
                    'Avvia il flood test — i dati saranno pubblicati on-chain'}
                </span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
