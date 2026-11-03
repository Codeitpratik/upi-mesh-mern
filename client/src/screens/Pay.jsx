import { useState } from 'react';
import { api } from '../api.js';
import { Avatar, Icon, Keypad } from '../components.jsx';
import { inr, reasonText } from '../util.js';

const PIN_LEN = 4;
const QUICK = [100, 500, 1000, 2000];

export default function Pay({ me, accounts, online, initialTo, onClose, onSubmitted, addOutbox, goNetwork }) {
  const mine = accounts.find((a) => a.vpa === me);
  const people = accounts.filter((a) => a.vpa !== me);

  const [to, setTo] = useState(initialTo);
  const [step, setStep] = useState(initialTo ? 'amount' : 'to');
  const [q, setQ] = useState('');
  const [amount, setAmount] = useState('');
  const [pin, setPin] = useState('');
  const [result, setResult] = useState(null);

  const amt = parseFloat(amount);
  const tooMuch = mine && amt > mine.balance;
  const canContinue = amt > 0 && !tooMuch;

  const submit = async (finalPin) => {
    setStep('busy');
    const body = { senderVpa: me, receiverVpa: to.vpa, amount: amt, pin: finalPin };
    try {
      if (online) {
        const r = await api.pay(body);
        if (r.outcome === 'SETTLED') {
          setResult({ kind: 'success' });
        } else {
          let reason = r.reason, retry = r.reason === 'INVALID_PIN', left = null;
          if (retry) {
            // 3rd wrong PIN locks the account; otherwise tell the user how many tries remain
            try {
              const a = (await api.accounts()).find((x) => x.vpa === me);
              if (a?.locked) { reason = 'ACCOUNT_LOCKED'; retry = false; }
              else left = a?.pinAttemptsLeft ?? null;
            } catch { /* keep generic message */ }
          }
          setResult({ kind: 'failed', reason, retry, left });
        }
      } else {
        const r = await api.send({ ...body, ttl: 5, startDevice: `phone-${me.split('@')[0]}` });
        addOutbox({ packetId: r.packetId.slice(0, 8), sender: me, to: to.vpa, amount: amt, createdAt: Date.now(), status: 'PENDING' });
        setResult({ kind: 'pending' });
      }
    } catch (e) {
      setResult({ kind: 'failed', reason: `internal_error: ${e.message}` });
    }
    setStep('result');
    onSubmitted();
  };

  const pressKey = (d) => {
    if (pin.length >= PIN_LEN) return;
    const next = pin + d;
    setPin(next);
    if (next.length === PIN_LEN) submit(next);
  };

  const onAmount = (e) => {
    const v = e.target.value;
    if (/^\d{0,7}(\.\d{0,2})?$/.test(v)) setAmount(v);
  };

  const filtered = people.filter((p) =>
    (p.holderName + p.vpa).toLowerCase().includes(q.trim().toLowerCase()));

  const back = () => {
    if (step === 'pin') { setPin(''); setStep('amount'); }
    else if (step === 'amount' && !initialTo) setStep('to');
    else onClose();
  };

  return (
    <div className="flow">
      {step !== 'result' && step !== 'busy' && (
        <div className="flow-head">
          <button className="icon-btn" onClick={back} aria-label="Back"><Icon name="back" /></button>
          <h2>{step === 'to' ? 'Send money' : step === 'amount' ? 'Enter amount' : 'Confirm payment'}</h2>
          <span className={`conn mini ${online ? 'on' : 'off'}`}>
            <Icon name={online ? 'wifi' : 'wifiOff'} size={14} />{online ? 'Online' : 'Offline'}
          </span>
        </div>
      )}

      {step === 'to' && (
        <div className="flow-body">
          <label className="search">
            <Icon name="search" size={18} />
            <input autoFocus placeholder="Search name or UPI ID" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <h3 className="sec">People</h3>
          <div className="card list">
            {filtered.length === 0 && <p className="empty">No match.</p>}
            {filtered.map((p) => (
              <button key={p.vpa} className="row" onClick={() => { setTo(p); setStep('amount'); }}>
                <Avatar name={p.holderName} vpa={p.vpa} />
                <span className="row-main">
                  <span className="row-title">{p.holderName}</span>
                  <span className="row-sub">{p.vpa}</span>
                </span>
                <Icon name="chevron" size={16} />
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 'amount' && to && (
        <div className="flow-body center">
          <div className="payee">
            <Avatar name={to.holderName} vpa={to.vpa} size={64} />
            <b>{to.holderName}</b>
            <small>{to.vpa}</small>
          </div>
          <div className="amount-box">
            <span>₹</span>
            <input autoFocus inputMode="decimal" placeholder="0" value={amount} onChange={onAmount} aria-label="Amount" />
          </div>
          {tooMuch && <p className="err">You don't have enough balance for this payment.</p>}
          <div className="quick">
            {QUICK.map((v) => <button key={v} onClick={() => setAmount(String(v))}>{inr(v, 0)}</button>)}
          </div>
          <div className={`banner ${online ? 'info' : 'warn'} flat`}>
            <Icon name={online ? 'shield' : 'wifiOff'} size={18} />
            <span>{online
              ? 'Pays instantly and is end-to-end encrypted.'
              : 'You are offline. This payment travels through nearby phones and completes once one gets internet.'}</span>
          </div>
          <button className="btn primary wide" disabled={!canContinue} onClick={() => setStep('pin')}>
            Pay {amt > 0 ? inr(amt) : ''}
          </button>
        </div>
      )}

      {step === 'pin' && (
        <div className="flow-body center">
          <div className="pin-sub">Paying <b>{inr(amt)}</b> to <b>{to.holderName}</b></div>
          <div className="pin-title"><Icon name="lock" size={18} /> Enter UPI PIN</div>
          <div className="dots" aria-label={`${pin.length} of ${PIN_LEN} digits entered`}>
            {Array.from({ length: PIN_LEN }, (_, i) => <span key={i} className={i < pin.length ? 'dot on' : 'dot'} />)}
          </div>
          <Keypad onKey={pressKey} onBack={() => setPin((p) => p.slice(0, -1))} />
        </div>
      )}

      {step === 'busy' && (
        <div className="flow-body center mid">
          <div className="spinner" />
          <p className="busy-t">{online ? 'Processing payment…' : 'Encrypting & queuing payment…'}</p>
        </div>
      )}

      {step === 'result' && result && (
        <div className="flow-body center mid">
          <div className={`res-ic ${result.kind}`}>
            <Icon name={result.kind === 'success' ? 'check' : result.kind === 'pending' ? 'clock' : 'x'} size={46} stroke={2.4} />
          </div>
          <h2 className="res-t">
            {result.kind === 'success' && 'Payment successful'}
            {result.kind === 'pending' && 'Payment queued'}
            {result.kind === 'failed' && 'Payment failed'}
          </h2>
          <div className="res-amt">{inr(amt)}</div>
          <p className="res-sub">
            {result.kind === 'success' && <>Sent to <b>{to.holderName}</b></>}
            {result.kind === 'pending' && <>to <b>{to.holderName}</b>. No internet right now. Your encrypted payment will complete automatically when a nearby phone gets connected.</>}
            {result.kind === 'failed' && reasonText(result.reason)}
            {result.kind === 'failed' && result.left > 0 && `. ${result.left} attempt${result.left > 1 ? 's' : ''} left before your account locks.`}
          </p>
          <div className="res-actions">
            {result.kind === 'failed' && result.retry && (
              <button className="btn primary wide" onClick={() => { setPin(''); setResult(null); setStep('pin'); }}>Try again</button>
            )}
            {result.kind === 'pending' && (
              <button className="btn wide" onClick={() => { onClose(); goNetwork(); }}>Track in mesh network</button>
            )}
            <button className={`btn wide ${result.kind === 'success' || (result.kind === 'failed' && !result.retry) ? 'primary' : ''}`} onClick={onClose}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}
