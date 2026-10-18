/**
 * Emergency Assistance.
 *
 * Highest impact-per-engineering-hour in the whole app, and the only screen with no ML at
 * all. Design rules, from PLAN.md §2 and §10:
 *   - Works fully offline. No network call anywhere in this file.
 *   - Always free. Never behind a paywall or an account.
 *   - Big targets, high contrast, minimum reading. Someone using this is under stress.
 *   - Honest about scope: this is a communication aid, not an interpreting service.
 *
 * !! VERIFY BEFORE ANY PILOT !!
 * The numbers below are the commonly cited all-India emergency numbers, but they vary by
 * state and change over time. Confirm every one with local police/hospital and with your
 * Deaf advisor before a single pilot user sees this screen. Ask specifically whether an
 * SMS/text route to emergency services exists locally — a voice-only number is useless to
 * a Deaf caller, which is the entire reason this screen exists.
 */

import { useMemo, useState } from 'react';
import { translate } from '@signsphere/gloss';
import { useLexicon } from '../lib/vocabulary.js';
import { loadContacts, saveContacts, type EmergencyContact } from '../lib/storage.js';
import { speak } from '../lib/speech.js';
import { useSettings } from '../state/settings.js';
import SosSigner from '../components/SosSigner.js';
import { EMERGENCY_PHRASES, speechLangFor, useT, type MessageKey } from '../lib/i18n.js';

interface ServiceNumber {
  label: MessageKey;
  number: string;
  note: string;
}

const SERVICES: ServiceNumber[] = [
  { label: 'em.svc.all', number: '112', note: 'Unified national emergency number' },
  { label: 'em.svc.police', number: '100', note: 'Verify locally' },
  { label: 'em.svc.fire', number: '101', note: 'Verify locally' },
  { label: 'em.svc.ambulance', number: '108', note: '102 in some states — verify locally' },
];

const PHRASES = EMERGENCY_PHRASES;

export default function Emergency() {
  const { settings } = useSettings();
  const vocabulary = useLexicon();
  const { t, lang } = useT();
  const [contacts, setContacts] = useState<EmergencyContact[]>(() => loadContacts());
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [location, setLocation] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

  const categories = useMemo(() => [...new Set(PHRASES.map((p) => p.category))], []);

  function persist(next: EmergencyContact[]) {
    setContacts(next);
    saveContacts(next);
  }

  function addContact(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || !phone.trim()) return;
    persist([
      ...contacts,
      { id: `${Date.now()}`, name: name.trim(), phone: phone.trim().replace(/\s+/g, '') },
    ]);
    setName('');
    setPhone('');
  }

  function fetchLocation() {
    if (!navigator.geolocation) {
      setLocationError('This device cannot share a location. You can still send the message.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setLocation(`https://maps.google.com/?q=${latitude.toFixed(5)},${longitude.toFixed(5)}`);
        setLocationError(null);
      },
      () => setLocationError('Could not get your location. You can still send the message.'),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  function smsLink(contact: EmergencyContact, message = 'I need help. I am deaf and cannot use a voice call.'): string {
    const body = [
      message,
      location ? `My location: ${location}` : null,
      '(Sent from SignSphere)',
    ]
      .filter(Boolean)
      .join(' ');
    return `sms:${contact.phone}?&body=${encodeURIComponent(body)}`;
  }

  const selectedGloss = selected ? translate(selected, { lexicon: vocabulary }).glosses.join(' ') : null;
  const selectedPhrase = PHRASES.find((p) => p.en === selected);
  /** Read aloud in the interface language, so a Hindi or Telugu speaker nearby understands. */
  const sayAloud = () => {
    if (!selected) return;
    const text = selectedPhrase && lang !== 'en' ? selectedPhrase[lang] : selected;
    speak(text, speechLangFor(lang, settings.ttsLang));
  };

  return (
    <>
      <h1>{t('em.title')}</h1>
      <p className="lede">{t('em.lede')}</p>

      <SosSigner textLink={(message) => (contacts[0] ? smsLink(contacts[0], `${message} I am deaf and cannot use a voice call.`) : null)} />

      <p className="notice warn">
        <strong>Not an interpreting service</strong>
        These are fixed phrase cards, not live translation. For anything medical or legal, ask for a
        qualified ISL interpreter.
      </p>

      <h2>{t('em.call')}</h2>
      <div className="grid">
        {SERVICES.map((service) => (
          <a key={service.number} className="card btn" href={`tel:${service.number}`} style={{ display: 'block' }}>
            <div className="stat">
              <div className="value">{service.number}</div>
              <div className="label">{t(service.label)}</div>
            </div>
            <p className="small muted" style={{ margin: '0.35rem 0 0', textAlign: 'center' }}>
              {service.note}
            </p>
          </a>
        ))}
      </div>
      <p className="hint">
        These are voice numbers. If you cannot speak on a call, use a phrase card below and show it
        to someone nearby, or text an emergency contact.
      </p>

      <h2 style={{ marginTop: '1.75rem' }}>{t('em.showCard')}</h2>
      {selected && (
        <div className="card stack" style={{ marginBottom: '1rem' }}>
          <p style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0, lineHeight: 1.25 }}>{selected}</p>
          {selectedPhrase && (
            <>
              <p lang="hi" style={{ fontSize: '1.45rem', fontWeight: 700, margin: 0, lineHeight: 1.35 }}>{selectedPhrase.hi}</p>
              <p lang="te" style={{ fontSize: '1.45rem', fontWeight: 700, margin: 0, lineHeight: 1.35 }}>{selectedPhrase.te}</p>
            </>
          )}
          {selectedGloss && (
            <p className="small muted" style={{ margin: 0 }}>
              ISL gloss: {selectedGloss}
            </p>
          )}
          <div className="row">
            <button type="button" className="primary" onClick={sayAloud}>
              {t('em.speak')}
            </button>
            <button type="button" onClick={() => setSelected(null)}>
              {t('em.close')}
            </button>
          </div>
        </div>
      )}

      {categories.map((category) => (
        <section key={category} style={{ marginBottom: '1rem' }}>
          <h3>{t(`em.cat.${category}` as MessageKey)}</h3>
          <div className="grid">
            {PHRASES.filter((phrase) => phrase.category === category).map((phrase) => (
              <button
                key={phrase.en}
                type="button"
                className="card"
                style={{ textAlign: 'left', fontSize: '1rem', lineHeight: 1.4 }}
                onClick={() => setSelected(phrase.en)}
                aria-pressed={selected === phrase.en}
              >
                {lang === 'en' ? phrase.en : phrase[lang]}
                {lang !== 'en' && <span className="small muted" style={{ display: 'block' }}>{phrase.en}</span>}
              </button>
            ))}
          </div>
        </section>
      ))}

      <h2 style={{ marginTop: '1.75rem' }}>{t('em.contacts')}</h2>
      <div className="card stack">
        <div className="row">
          <button type="button" onClick={fetchLocation}>
            📍 {location ? 'Location attached' : 'Attach my location'}
          </button>
          {location && (
            <span className="small muted">
              Included in any message you send from here.
            </span>
          )}
        </div>
        {locationError && <p className="notice warn">{locationError}</p>}

        {contacts.length === 0 ? (
          <p className="muted small">
            No contacts yet. Add someone who can help — texting is often the only route that works
            when a voice call is not an option.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.6rem' }}>
            {contacts.map((contact) => (
              <li key={contact.id} className="row" style={{ justifyContent: 'space-between' }}>
                <span>
                  <strong>{contact.name}</strong>
                  <br />
                  <span className="small muted">{contact.phone}</span>
                </span>
                <span className="row">
                  <a className="btn primary" href={smsLink(contact)}>
                    {t('em.text')}
                  </a>
                  <a className="btn" href={`tel:${contact.phone}`}>
                    {t('em.callBtn')}
                  </a>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => persist(contacts.filter((c) => c.id !== contact.id))}
                    aria-label={`Remove ${contact.name}`}
                  >
                    Remove
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={addContact} className="stack">
          <div className="field">
            <label htmlFor="contact-name">{t('em.name')}</label>
            <input
              id="contact-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Amma"
            />
          </div>
          <div className="field">
            <label htmlFor="contact-phone">{t('em.phone')}</label>
            <input
              id="contact-phone"
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+91…"
            />
          </div>
          <button type="submit" className="primary" disabled={!name.trim() || !phone.trim()}>
            {t('em.add')}
          </button>
          <p className="hint">Contacts are stored only on this device.</p>
        </form>
      </div>
    </>
  );
}
