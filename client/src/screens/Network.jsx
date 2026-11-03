import { Icon } from '../components.jsx';
import { DEMO_PINS, inr } from '../util.js';

export default function Network({ me, mesh, accounts, logs, onGossip, onSync, onReset, onUnlock, busy }) {
  const label = (id) => {
    if (id === 'phone-bridge') return 'Phone with internet';
    if (id.startsWith('phone-stranger')) return `Stranger's phone ${id.replace('phone-stranger', '')}`;
    const vpa = id.replace('phone-', '') + '@demo';
    if (vpa === me) return 'Your phone';
    return `${accounts.find((a) => a.vpa === vpa)?.holderName ?? id}'s phone`;
  };

  return (
    <div className="screen-pad">
      <h1 className="page-title">Mesh network</h1>
      <p className="lead">
        When you pay offline, your phone hands an encrypted packet to nearby phones. Nobody
        in between can read it. The first phone that reaches the internet delivers it to the bank.
      </p>

      <div className="card pad">
        <h2 className="sec tight">Nearby phones</h2>
        {mesh?.devices.map((d) => (
          <div key={d.deviceId} className={`dev ${d.hasInternet ? 'net' : ''}`}>
            <span className={`dev-ic ${d.hasInternet ? 'net' : ''}`}><Icon name={d.hasInternet ? 'wifi' : 'wifiOff'} size={18} /></span>
            <span className="dev-main">
              <b>{label(d.deviceId)}</b>
              <small>{d.hasInternet ? 'Has internet' : 'No internet'}</small>
            </span>
            <span className="dev-count">
              {d.packetCount > 0 ? `${d.packetCount} packet${d.packetCount > 1 ? 's' : ''}` : 'empty'}
            </span>
          </div>
        ))}
        <div className="steps">
          <button className="btn" onClick={onGossip} disabled={busy}><b>1</b> Spread to nearby phones</button>
          <button className="btn primary" onClick={onSync} disabled={busy}><b>2</b> Internet phone syncs with bank</button>
        </div>
        <button className="link danger" onClick={onReset}>Clear mesh & cache</button>
        <p className="small">Cache entries (duplicate protection): {mesh?.idempotencyCacheSize ?? 0}</p>
      </div>

      <div className="card pad">
        <h2 className="sec tight">Bank view <small>(demo admin)</small></h2>
        <table className="tbl">
          <thead><tr><th>Account</th><th>Balance</th><th>PIN</th><th /></tr></thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.vpa}>
                <td>{a.vpa}</td>
                <td>{inr(a.balance)}</td>
                <td>{DEMO_PINS[a.vpa]}</td>
                <td>
                  {a.locked ? <span className="pill bad">locked</span>
                    : a.failedPinAttempts > 0 ? <span className="pill warn">{a.failedPinAttempts} wrong</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="link" onClick={onUnlock}>Unlock all accounts</button>
        <p className="small">3 wrong PINs lock an account for 15 minutes.</p>
      </div>

      <div className="card pad">
        <h2 className="sec tight">Activity log</h2>
        <div className="log">{logs.length ? logs.join('\n') : 'Nothing yet.'}</div>
      </div>
    </div>
  );
}
