import { colorFor, initials, inr, fmtTime, reasonText } from './util.js';

const P = {
  home: <path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  activity: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  network: <><circle cx="12" cy="5.5" r="2.5" /><circle cx="5.5" cy="18" r="2.5" /><circle cx="18.5" cy="18" r="2.5" /><path d="M10.8 7.8L6.7 15.6M13.2 7.8l4.1 7.8M8 18h8" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" /></>,
  send: <path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" />,
  check: <path d="M5 13l4 4L19 7" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  wifi: <path d="M2 9a16 16 0 0 1 20 0M5 12.5a11 11 0 0 1 14 0M8.5 16a6 6 0 0 1 7 0M12 19.5h.01" />,
  wifiOff: <path d="M2 9a16 16 0 0 1 5-3M22 9a16 16 0 0 0-8-4M5 12.5a11 11 0 0 1 3-2M19 12.5a11 11 0 0 0-4-2.3M8.5 16a6 6 0 0 1 7 0M12 19.5h.01M3 3l18 18" />,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  back: <path d="M15 5l-7 7 7 7" />,
  backspace: <><path d="M21 5H9l-6 7 6 7h12z" /><path d="M12 9l5 5M17 9l-5 5" /></>,
  eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-5-5" /></>,
  chevron: <path d="M9 5l7 7-7 7" />,
  shield: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />,
};

export function Icon({ name, size = 22, stroke = 1.9 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {P[name]}
    </svg>
  );
}

export function Avatar({ name, vpa, size = 44 }) {
  const [bg, fg] = colorFor(vpa);
  return (
    <span className="avatar" style={{ width: size, height: size, background: bg, color: fg, fontSize: size * 0.38 }}>
      {initials(name)}
    </span>
  );
}

export function Sheet({ title, onClose, children }) {
  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label={title}>
        <div className="grabber" />
        <div className="sheet-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" size={20} /></button>
        </div>
        {children}
      </div>
    </>
  );
}

export function Keypad({ onKey, onBack }) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'];
  return (
    <div className="keypad">
      {keys.map((k, i) =>
        k === '' ? <span key={i} /> : (
          <button key={i} className="key" onClick={() => (k === 'back' ? onBack() : onKey(k))}
                  aria-label={k === 'back' ? 'Delete' : k}>
            {k === 'back' ? <Icon name="backspace" /> : k}
          </button>
        )
      )}
    </div>
  );
}

const STATUS = {
  SUCCESS: { label: 'Successful', cls: 'ok' },
  PENDING: { label: 'Pending · offline', cls: 'warn' },
  FAILED: { label: 'Failed', cls: 'bad' },
};

export function StatusChip({ status }) {
  const s = STATUS[status];
  return <span className={`pill ${s.cls}`}>{s.label}</span>;
}

export function ActivityRow({ item, onClick }) {
  const failed = item.status === 'FAILED';
  const title = item.dir === 'out' ? `Paid to ${item.name}` : `Received from ${item.name}`;
  return (
    <button className="row" onClick={() => onClick(item)}>
      <Avatar name={item.name} vpa={item.other} />
      <span className="row-main">
        <span className="row-title">{title}</span>
        <span className="row-sub">{fmtTime(item.time)} · <StatusChip status={item.status} /></span>
      </span>
      <span className={`row-amt ${failed ? 'muted' : item.dir === 'in' ? 'in' : ''}`}>
        {item.dir === 'in' ? '+' : '−'}{inr(item.amount)}
      </span>
    </button>
  );
}

export function TxDetail({ item }) {
  const via = !item.tx
    ? 'Waiting for a nearby phone with internet'
    : item.tx.bridgeNodeId === 'direct-online'
      ? 'Direct (online)'
      : `Offline mesh · ${item.tx.hopCount} hop${item.tx.hopCount === 1 ? '' : 's'} · ${item.tx.bridgeNodeId}`;
  const rows = [
    [item.dir === 'out' ? 'Paid to' : 'Received from', `${item.name} (${item.other})`],
    ['Date & time', fmtTime(item.time)],
    ['Route', via],
    ['Reference', item.tx ? item.tx.id.slice(-10).toUpperCase() : item.packetId?.toUpperCase()],
  ];
  return (
    <div className="detail">
      <div className="detail-top">
        <div className={`big-amt ${item.status === 'FAILED' ? 'muted' : ''}`}>{inr(item.amount)}</div>
        <StatusChip status={item.status} />
        {item.status === 'FAILED' && <p className="fail-reason">{reasonText(item.reason)}</p>}
        {item.status === 'PENDING' && (
          <p className="hint">Your payment is encrypted and hopping between phones. It completes when one of them reaches the internet.</p>
        )}
      </div>
      <dl>
        {rows.map(([k, v]) => (
          <div key={k} className="dl-row"><dt>{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>
    </div>
  );
}
