import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { Avatar, Icon, Sheet, TxDetail } from './components.jsx';
import { applyResults, buildItems, DEMO_PINS, store } from './util.js';
import Home from './screens/Home.jsx';
import Activity from './screens/Activity.jsx';
import Network from './screens/Network.jsx';
import Pay from './screens/Pay.jsx';

const NAV = [
  ['home', 'Home', 'home'],
  ['activity', 'History', 'activity'],
  null, // centre "Send" button
  ['network', 'Mesh', 'network'],
  ['profile', 'Profile', 'user'],
];

export default function App() {
  const [me, setMe] = useState(() => store.get('meshpay.me', 'alice@demo'));
  const [online, setOnline] = useState(() => store.get('meshpay.online', true));
  const [outbox, setOutbox] = useState(() => store.get('meshpay.outbox', []));
  const [tab, setTab] = useState('home');
  const [accounts, setAccounts] = useState([]);
  const [txs, setTxs] = useState([]);
  const [mesh, setMesh] = useState(null);
  const [logs, setLogs] = useState([]);
  const [pay, setPay] = useState(null);       // { to } while the pay flow is open
  const [sheet, setSheet] = useState(null);   // 'profile' | { item }
  const [offlineApi, setOfflineApi] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => store.set('meshpay.me', me), [me]);
  useEffect(() => store.set('meshpay.online', online), [online]);
  useEffect(() => store.set('meshpay.outbox', outbox), [outbox]);

  const log = useCallback((msg) => {
    setLogs((l) => [`${new Date().toLocaleTimeString()}  ${msg}`, ...l].slice(0, 40));
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [a, t, m] = await Promise.all([api.accounts(), api.transactions(me), api.meshState()]);
      setAccounts(a); setTxs(t); setMesh(m); setOfflineApi(false);
    } catch {
      setOfflineApi(true);
    }
  }, [me]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, [refresh]);

  const items = useMemo(() => buildItems(me, txs, outbox, accounts), [me, txs, outbox, accounts]);
  const pendingCount = items.filter((i) => i.status === 'PENDING').length;

  // ---- mesh controls (Network tab)
  const guarded = (fn) => async () => {
    setBusy(true);
    try { await fn(); } catch (e) { log(`Error: ${e.message}`); }
    await refresh();
    setBusy(false);
  };
  const gossip = guarded(async () => {
    const r = await api.gossip();
    log(`Spread to nearby phones: ${r.transfers} transfer(s)`);
  });
  const sync = guarded(async () => {
    const r = await api.flush();
    if (r.uploadsAttempted === 0) log('The internet phone has nothing to upload yet. Spread first.');
    r.results.forEach((x) =>
      log(`Packet ${x.packetId} via ${x.bridgeNode}: ${x.outcome}${x.reason ? ` (${x.reason})` : ''}`));
    setOutbox((o) => applyResults(o, r.results));
  });
  const reset = guarded(async () => {
    await api.reset();
    setOutbox([]);
    log('Mesh and duplicate cache cleared');
  });
  const unlock = guarded(async () => {
    await api.unlock();
    log('PIN lockouts cleared');
  });

  const startPay = (to) => setPay({ to });
  const closePay = () => setPay(null);
  const openItem = (item) => setSheet({ item });

  const onNav = (key) => {
    if (key === 'profile') setSheet('profile');
    else setTab(key);
  };

  const loading = accounts.length === 0;

  return (
    <div className="app">
      {offlineApi && <div className="net-err">Can't reach the server. Retrying…</div>}

      <main className="screen">
        {loading ? (
          <div className="splash"><div className="spinner" /><p>Loading MeshPay…</p></div>
        ) : tab === 'home' ? (
          <Home me={me} accounts={accounts} items={items} pendingCount={pendingCount} online={online}
                onToggleOnline={() => setOnline((v) => !v)} onPay={startPay} goTab={setTab}
                openItem={openItem} openProfile={() => setSheet('profile')} />
        ) : tab === 'activity' ? (
          <Activity items={items} openItem={openItem} />
        ) : (
          <Network me={me} mesh={mesh} accounts={accounts} logs={logs} busy={busy}
                   onGossip={gossip} onSync={sync} onReset={reset} onUnlock={unlock} />
        )}
      </main>

      <nav className="nav">
        {NAV.map((n, i) =>
          n === null ? (
            <button key="fab" className="fab" onClick={() => startPay(null)} aria-label="Send money">
              <Icon name="send" size={24} />
            </button>
          ) : (
            <button key={n[0]} className={tab === n[0] ? 'active' : ''} onClick={() => onNav(n[0])}>
              <Icon name={n[2]} size={22} /><span>{n[1]}</span>
            </button>
          )
        )}
      </nav>

      {pay && (
        <Pay me={me} accounts={accounts} online={online} initialTo={pay.to}
             onClose={closePay} onSubmitted={refresh}
             addOutbox={(o) => setOutbox((x) => [o, ...x])} goNetwork={() => setTab('network')} />
      )}

      {sheet === 'profile' && (
        <Sheet title="Switch account" onClose={() => setSheet(null)}>
          <p className="small pad-x">Demo: pick who you're signed in as.</p>
          <div className="list">
            {accounts.map((a) => (
              <button key={a.vpa} className="row" onClick={() => { setMe(a.vpa); setSheet(null); setTab('home'); }}>
                <Avatar name={a.holderName} vpa={a.vpa} />
                <span className="row-main">
                  <span className="row-title">{a.holderName}</span>
                  <span className="row-sub">{a.vpa} · PIN {DEMO_PINS[a.vpa]}</span>
                </span>
                {a.vpa === me && <span className="pill ok">Active</span>}
              </button>
            ))}
          </div>
        </Sheet>
      )}

      {sheet?.item && (
        <Sheet title="Payment details" onClose={() => setSheet(null)}>
          <TxDetail item={sheet.item} />
        </Sheet>
      )}
    </div>
  );
}
