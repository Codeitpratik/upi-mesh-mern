import { useState } from 'react';
import { ActivityRow } from '../components.jsx';

const FILTERS = [['all', 'All'], ['out', 'Sent'], ['in', 'Received']];

export default function Activity({ items, openItem }) {
  const [f, setF] = useState('all');
  const shown = items.filter((i) => f === 'all' || i.dir === f);
  return (
    <div className="screen-pad">
      <h1 className="page-title">Payment history</h1>
      <div className="seg">
        {FILTERS.map(([k, label]) => (
          <button key={k} className={f === k ? 'active' : ''} onClick={() => setF(k)}>{label}</button>
        ))}
      </div>
      <div className="card list">
        {shown.length === 0 && <p className="empty">Nothing here yet.</p>}
        {shown.map((it) => <ActivityRow key={it.key} item={it} onClick={openItem} />)}
      </div>
    </div>
  );
}
