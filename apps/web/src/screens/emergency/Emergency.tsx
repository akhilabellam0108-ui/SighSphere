/**
 * Emergency Assistance.
 *
 * Highest impact-per-engineering-hour in the whole app. Design rules, from PLAN.md §2, §10:
 *   - Works fully offline. No network call in this file (the service worker precaches it;
 *     the optional hospital search opens an external map only when the user taps it).
 *   - Always free. Never behind a paywall, an account, or onboarding (see guards.tsx).
 *   - Big targets, high contrast, minimum reading. Someone using this is under stress.
 *   - Honest about scope: phrase cards are the primary path. Sign input is offered ONLY for
 *     emergency signs this device's recogniser has actually been taught, and every result
 *     must be confirmed by the user before it is shown or spoken.
 *
 * !! VERIFY BEFORE ANY PILOT !!
 * The numbers below are the commonly cited all-India emergency numbers, but they vary by
 * state and change over time. Confirm every one with local police/hospital and with your
 * Deaf advisor before a single pilot user sees this screen. Ask specifically whether an
 * SMS/text route to emergency services exists locally — a voice-only number is useless to
 * a Deaf caller, which is the entire reason this screen exists.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { translate } from '@signsphere/gloss';
import CameraView from '../../components/CameraView.js';
import { Badge, Button, Card, Icon, Modal, Notice, PageHeader, TextField } from '../../components/ui/index.js';
import { useHaptics } from '../../hooks/useDevice.js';
import { useSignRecognition } from '../../hooks/useSignRecognition.js';
import { createClassifier } from '../../lib/classifier.js';
import { loadContacts, saveContacts, type EmergencyContact } from '../../lib/storage.js';
import { speak } from '../../lib/speech.js';
import { useSettings } from '../../state/settings.js';

interface ServiceNumber {
  label: string;
  number: string;
  note: string;
  icon: 'sos' | 'shield' | 'fire' | 'ambulance';
}

const SERVICES: ServiceNumber[] = [
  { label: 'All emergencies', number: '112', note: 'Unified national emergency number', icon: 'sos' },
  { label: 'Ambulance', number: '108', note: '102 in some states — verify locally', icon: 'ambulance' },
  { label: 'Police', number: '100', note: 'Verify locally', icon: 'shield' },
  { label: 'Fire', number: '101', note: 'Verify locally', icon: 'fire' },
];

const PHRASES: Array<{ english: string; category: string }> = [
  { english: 'I am deaf. I cannot hear you.', category: 'Identity' },
  { english: 'Please write it down for me.', category: 'Identity' },
  { english: 'I need a sign language interpreter.', category: 'Identity' },
  { english: 'I need help now.', category: 'Urgent' },
  { english: 'Call an ambulance.', category: 'Urgent' },
  { english: 'Call the police.', category: 'Urgent' },
  { english: 'There is a fire.', category: 'Urgent' },
  { english: 'I have pain here.', category: 'Medical' },
  { english: 'I need medicine.', category: 'Medical' },
  { english: 'Take me to the hospital.', category: 'Medical' },
  { english: 'Please call my family.', category: 'Contact' },
  { english: 'I do not understand. Please show me.', category: 'Contact' },
];

/** Emergency signs → the phrase card they stand for. Only these can ever be signed here. */
const SIGN_PHRASES: Readonly<Record<string, string>> = {
  HELP: 'I need help now.',
  EMERGENCY: 'This is an emergency.',
  AMBULANCE: 'Call an ambulance.',
  POLICE: 'Call the police.',
  FIRE: 'There is a fire.',
  HOSPITAL: 'Take me to the hospital.',
  DOCTOR: 'I need a doctor.',
  PAIN: 'I have pain here.',
  SICK: 'I feel sick.',
  MEDICINE: 'I need medicine.',
};

// ------------------------------------------------------------------ sign-a-phrase panel

function SignPhrasePanel({ labels, onPhrase }: { labels: string[]; onPhrase(phrase: string): void }) {
  const [candidate, setCandidate] = useState<string | null>(null);
  const onAccept = useCallback((label: string) => setCandidate(label), []);
  const recognition = useSignRecognition({ mode: 'capture', onAccept, allowedLabels: labels });

  return (
    <div className="stack">
      <CameraView
        onFrame={recognition.handleFrame}
        recording={recognition.capturing}
        badge={recognition.armed ? (recognition.capturing ? '● Capturing…' : 'Sign now') : 'Press “Sign one phrase”'}
      />
      <div className="btn-group">
        <Button variant="sos" size="lg" icon="hand" onClick={recognition.arm} disabled={recognition.armed}>
          {recognition.armed ? 'Watching for a sign…' : 'Sign one phrase'}
        </Button>
      </div>
      {recognition.rejected && !candidate && (
        <Notice tone="warn" title="Not recognised">
          That did not match a taught emergency sign clearly enough. Use a phrase card instead, or
          try again.
        </Notice>
      )}
      {candidate && (
        <div className="notice" role="alert">
          <strong>Recognised: {candidate}</strong>
          Is this what you meant — “{SIGN_PHRASES[candidate] ?? candidate}”?
          <div className="btn-group" style={{ marginTop: '0.6rem' }}>
            <Button
              variant="primary"
              icon="check"
              onClick={() => {
                onPhrase(SIGN_PHRASES[candidate] ?? candidate);
                setCandidate(null);
              }}
            >
              Yes, show it
            </Button>
            <Button
              variant="ghost"
              icon="close"
              onClick={() => {
                setCandidate(null);
                recognition.clear();
              }}
            >
              No
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------ screen

export default function Emergency() {
  const { settings } = useSettings();
  const haptic = useHaptics();
  const [contacts, setContacts] = useState<EmergencyContact[]>(() => loadContacts());
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [signLabels, setSignLabels] = useState<string[] | null>(null);
  const [signOpen, setSignOpen] = useState(false);

  const categories = useMemo(() => [...new Set(PHRASES.map((p) => p.category))], []);
  const location = coords ? `https://maps.google.com/?q=${coords.lat.toFixed(5)},${coords.lng.toFixed(5)}` : null;

  // Which emergency signs can this device actually recognise? Only those are offered.
  useEffect(() => {
    let cancelled = false;
    createClassifier()
      .then((classifier) => {
        if (!cancelled) setSignLabels(classifier.labels.filter((label) => label in SIGN_PHRASES));
      })
      .catch(() => !cancelled && setSignLabels([]));
    return () => {
      cancelled = true;
    };
  }, []);

  function persist(next: EmergencyContact[]) {
    setContacts(next);
    saveContacts(next);
  }

  function addContact(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || !phone.trim()) return;
    persist([...contacts, { id: `${Date.now()}`, name: name.trim(), phone: phone.trim().replace(/\s+/g, '') }]);
    setName('');
    setPhone('');
  }

  function fetchLocation() {
    if (!navigator.geolocation) {
      setLocationError('This device cannot share a location. You can still send the message.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
        setLocationError(null);
        setLocating(false);
      },
      () => {
        setLocationError('Could not get your location. You can still send the message.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  function smsLink(contact: EmergencyContact): string {
    const body = [
      'I need help. I am deaf and cannot use a voice call.',
      location ? `My location: ${location}` : null,
      '(Sent from SignSphere)',
    ]
      .filter(Boolean)
      .join(' ');
    return `sms:${contact.phone}?&body=${encodeURIComponent(body)}`;
  }

  const hospitalLink = coords
    ? `https://www.google.com/maps/search/hospital/@${coords.lat.toFixed(5)},${coords.lng.toFixed(5)},14z`
    : 'https://www.google.com/maps/search/hospital+near+me';

  const selectedGloss = selected ? translate(selected).glosses.join(' ') : null;

  function show(phrase: string) {
    setSelected(phrase);
    haptic(40);
  }

  return (
    <div className="emergency">
      <PageHeader
        eyebrow={
          <>
            <Icon name="sos" /> Emergency
          </>
        }
        title="Emergency Assistance"
        subtitle="Show a card to anyone who can help. Works offline, always free, no account needed."
      />

      <Notice tone="warn" title="Not an interpreting service">
        These are fixed phrase cards, not live translation. For anything medical or legal, ask for a
        qualified ISL interpreter.
      </Notice>

      {/* ------------------------------------------------------------- call cards */}
      <section className="section" aria-labelledby="call-heading">
        <h2 id="call-heading">Call for help</h2>
        <div className="sos-grid">
          {SERVICES.map((service) => (
            <a key={service.number} className="sos-card" href={`tel:${service.number}`} onClick={() => haptic(40)}>
              <Icon name={service.icon} size="xl" />
              <span className="sos-number">{service.number}</span>
              <span className="sos-label">{service.label}</span>
              <span className="sos-note">{service.note}</span>
            </a>
          ))}
          <a className="sos-card alt" href={hospitalLink} target="_blank" rel="noopener noreferrer">
            <Icon name="hospital" size="xl" />
            <span className="sos-number sm">Hospital</span>
            <span className="sos-label">Find the nearest</span>
            <span className="sos-note">{coords ? 'Near your location' : 'Opens maps (needs internet)'}</span>
          </a>
          <a className="sos-card alt" href="#contacts-heading">
            <Icon name="contact" size="xl" />
            <span className="sos-number sm">Contact</span>
            <span className="sos-label">Text someone you trust</span>
            <span className="sos-note">{contacts.length > 0 ? `${contacts.length} saved` : 'Add one below'}</span>
          </a>
        </div>
        <p className="hint">
          These are voice numbers. If you cannot speak on a call, show a phrase card below to someone
          nearby, or text an emergency contact.
        </p>
      </section>

      {/* ------------------------------------------------------------- phrase cards */}
      <section className="section" aria-labelledby="cards-heading">
        <h2 id="cards-heading">Show a card</h2>
        {categories.map((category) => (
          <div key={category} style={{ marginBottom: '1.25rem' }}>
            <h3 className="small eyebrow" style={{ color: 'var(--text-muted)' }}>
              {category}
            </h3>
            <div className="phrase-grid">
              {PHRASES.filter((phrase) => phrase.category === category).map((phrase) => (
                <button
                  key={phrase.english}
                  type="button"
                  className={`phrase-card${category === 'Urgent' ? ' urgent' : ''}`}
                  onClick={() => show(phrase.english)}
                >
                  {phrase.english}
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* ---------------------------------------------------------- sign a phrase */}
      <section className="section" aria-labelledby="sign-heading">
        <h2 id="sign-heading">Sign a phrase</h2>
        {signLabels === null ? null : signLabels.length === 0 ? (
          <Card variant="outline">
            <p className="small mb-0">
              <strong>Not available on this device yet.</strong> Signing a phrase only works for
              emergency signs this device has been taught (such as HELP, DOCTOR or AMBULANCE), so a
              stressful moment never depends on a guess. Use the phrase cards above — they are
              faster and always work. To enable it, teach those signs in Profile → Teach a sign.
            </p>
          </Card>
        ) : (
          <Card className="stack">
            <p className="small mb-0">
              Recognises only these taught emergency signs:{' '}
              {signLabels.map((label) => (
                <Badge key={label} tone="danger">
                  {label}
                </Badge>
              ))}
              . You confirm every result before it is shown.
            </p>
            {signOpen ? (
              <SignPhrasePanel labels={signLabels} onPhrase={show} />
            ) : (
              <div>
                <Button variant="sos" icon="camera" onClick={() => setSignOpen(true)}>
                  Open camera
                </Button>
              </div>
            )}
          </Card>
        )}
      </section>

      {/* ------------------------------------------------------------- contacts */}
      <section className="section" aria-labelledby="contacts-heading">
        <h2 id="contacts-heading" tabIndex={-1}>
          Emergency contacts
        </h2>
        <Card className="stack">
          <div className="row">
            <Button icon="pin" onClick={fetchLocation} loading={locating} variant={location ? 'soft' : 'secondary'}>
              {location ? 'Location attached' : 'Attach my location'}
            </Button>
            {location && <span className="small muted">Included in any message you send from here.</span>}
          </div>
          {locationError && <Notice tone="warn">{locationError}</Notice>}

          {contacts.length === 0 ? (
            <p className="muted small mb-0">
              No contacts yet. Add someone who can help — texting is often the only route that works
              when a voice call is not an option.
            </p>
          ) : (
            <ul className="list">
              {contacts.map((contact) => (
                <li key={contact.id} className="list-item contact-item">
                  <div className="list-item-main">
                    <p className="list-item-title">{contact.name}</p>
                    <p className="list-item-meta">{contact.phone}</p>
                  </div>
                  <div className="btn-group">
                    <a className="btn btn-sos" href={smsLink(contact)}>
                      <Icon name="message" /> Text for help
                    </a>
                    <a className="btn btn-secondary" href={`tel:${contact.phone}`}>
                      <Icon name="phone" /> Call
                    </a>
                    <Button
                      variant="ghost"
                      icon="trash"
                      aria-label={`Remove ${contact.name}`}
                      onClick={() => persist(contacts.filter((c) => c.id !== contact.id))}
                    >
                      Remove
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={addContact} className="contact-form">
            <TextField label="Name" id="contact-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Amma" autoComplete="off" />
            <TextField
              label="Phone number"
              id="contact-phone"
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+91…"
              autoComplete="off"
            />
            <Button type="submit" variant="primary" icon="user-plus" disabled={!name.trim() || !phone.trim()}>
              Add contact
            </Button>
          </form>
          <p className="hint mb-0">Contacts are stored only on this device.</p>
        </Card>
      </section>

      {/* ---------------------------------------------------- full-screen phrase card */}
      <Modal open={selected !== null} onClose={() => setSelected(null)} title="Show this to someone" fullScreen hideTitle>
        {selected && (
          <div className="show-card">
            <p className="show-card-eyebrow">Please read</p>
            <p className="show-card-text">{selected}</p>
            {selectedGloss && <p className="show-card-gloss">ISL gloss: {selectedGloss}</p>}
            <div className="btn-group" style={{ justifyContent: 'center' }}>
              <Button variant="sos" size="lg" icon="volume" onClick={() => speak(selected, settings.ttsLang)}>
                Speak this aloud
              </Button>
              <Button size="lg" onClick={() => setSelected(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
