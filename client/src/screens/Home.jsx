import { useEffect, useState } from 'react';
import { Avatar, Icon, ActivityRow } from '../components.jsx';
import { inr } from '../util.js';

export default function Home({ me, accounts, items, pendingCount, online, onToggleOnline, onPay, goTab, openItem, openProfile }) {
  const mine = accounts.find((a) => a.vpa === me);
  const people = accounts.filter((a) => a.vpa !== me);
  const [reveal, setReveal] = useState(false);

  useEffect(() => {
    if (!reveal) return;
    const t = setTimeout(() => setReveal(false), 6000); // auto-hide like a real banking app
    return () => clearTimeout(t);
  }, [reveal]);

  return (
    <div className="screen-pad">
      <header className="top">
        <button className="who" onClick={openProfile}>
          <Avatar name={mine?.holderName} vpa={me} size={40} />
          <span>
            <small>Welcome back</small>
            <strong>{mine?.holderName ?? '…'}</strong>
          </span>
        </button>
        <button className={`conn ${online ? 'on' : 'off'}`} onClick={onToggleOnline}
                aria-label={online ? 'Go offline' : 'Go online'}>
          <Icon name={online ? 'wifi' : 'wifiOff'} size={16} />
          {online ? 'Online' : 'Offline'}
        </button>
      </header>

      <section className="hero">
        <div className="hero-label">Account balance</div>
        <div className="hero-amt">
          {reveal && mine ? inr(mine.balance) : '₹ ••••••'}
        </div>
        <div className="hero-foot">
          <span className="vpa">{me}</span>
          <button className="ghost" onClick={() => setReveal((v) => !v)}>
            <Icon name="eye" size={16} /> {reveal ? 'Hide' : 'Check balance'}
          </button>
        </div>
      </section>

      {mine?.locked && (
        <div className="banner bad">
          <Icon name="lock" size={18} />
          <span>Your account is locked after too many wrong PIN attempts. Payments will be declined for a while.</span>
        </div>
      )}
      {!online && (
        <div className="banner warn">
          <Icon name="wifiOff" size={18} />
          <span><b>You're offline.</b> Payments are encrypted and passed through nearby phones until one reaches the internet.</span>
        </div>
      )}
      {pendingCount > 0 && (
        <button className="banner info" onClick={() => goTab('network')}>
          <Icon name="clock" size={18} />
          <span><b>{pendingCount} payment{pendingCount > 1 ? 's' : ''} waiting</b> for a connection. Tap to see the network.</span>
          <Icon name="chevron" size={16} />
        </button>
      )}

      <section className="tiles">
        <button className="tile" onClick={() => onPay(null)}>
          <span className="tile-ic grad"><Icon name="send" /></span>Send money
        </button>
        <button className="tile" onClick={() => goTab('activity')}>
          <span className="tile-ic"><Icon name="activity" /></span>History
        </button>
        <button className="tile" onClick={() => goTab('network')}>
          <span className="tile-ic"><Icon name="network" /></span>Mesh network
        </button>
      </section>

      <section>
        <h2 className="sec">People</h2>
        <div className="people">
          {people.map((p) => (
            <button key={p.vpa} className="person" onClick={() => onPay(p)}>
              <Avatar name={p.holderName} vpa={p.vpa} size={54} />
              <span>{p.holderName}</span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <div className="sec-row">
          <h2 className="sec">Recent activity</h2>
          {items.length > 0 && <button className="link" onClick={() => goTab('activity')}>See all</button>}
        </div>
        <div className="card list">
          {items.length === 0 && <p className="empty">No payments yet. Send some money to get started.</p>}
          {items.slice(0, 4).map((it) => <ActivityRow key={it.key} item={it} onClick={openItem} />)}
        </div>
      </section>
    </div>
  );
}
