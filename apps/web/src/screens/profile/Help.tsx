import { buildIndex } from '@signsphere/gloss';
import { Card, Icon, PageHeader, Section } from '../../components/ui/index.js';

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: 'Why does Sign → Text not recognise anything?',
    a: 'Recognition learns from examples recorded on this device. Open Record signs, record 5 takes each of a few signs, then try again. It only recognises signs it has been taught, one at a time.',
  },
  {
    q: 'Is my camera video uploaded?',
    a: 'No. Every camera frame is processed in your browser and discarded. Recordings from Record signs are stored on this device as hand-position numbers, not video, and only leave it if you export them yourself.',
  },
  {
    q: 'Is my voice uploaded?',
    a: 'Speech recognition is done by your browser, and most browsers send the audio to their own servers to transcribe it. If that matters, type instead — every voice feature has a typing option.',
  },
  {
    q: 'Why do I see text instead of a signer video?',
    a: 'Signer videos have not been recorded yet. Until they are, the app shows the sign name (gloss) and fingerspells words it has no sign for.',
  },
  {
    q: 'Do I need an account?',
    a: 'No. Accounts are not connected yet — sign-in currently creates a local demo profile only. Guest mode has every feature.',
  },
  {
    q: 'Does it work offline, somewhere remote?',
    a: 'Yes, if you prepare while you have a connection. The app, lessons, translation and emergency phrase cards work offline after the first visit. Sign recognition runs entirely on your device, but its models (~15 MB) must be downloaded once: open Record signs → “Download for offline use”. Speech recognition and the hospital map search always need the internet.',
  },
  {
    q: 'Can it recognise signs without me recording them?',
    a: 'Yes, for the built-in ISL signs: open Record signs → Built-in ISL signs → Install. These come from the INCLUDE dataset (CC BY 4.0) and work offline once installed. Adding a few recordings of your own for the same sign makes recognition more reliable for you.',
  },
  {
    q: 'Why did my recording have so few frames?',
    a: 'Each frame is tracked on your device, so a slower laptop tracks fewer frames per second. Recording now continues until it has 32 frames (up to 4.5 seconds). Turning on “Hands only” in Settings roughly doubles tracking speed.',
  },
  {
    q: 'How do I delete my data?',
    a: 'Profile → Settings → Delete everything on this device. It erases recordings, progress, history, contacts and settings.',
  },
];

export default function Help() {
  const lexicon = buildIndex();
  return (
    <>
      <PageHeader back={{ to: '/profile', label: 'Back to profile' }} title="Help & Support" subtitle="Answers, privacy, and what SignSphere can and cannot do." />

      <Card variant="soft" className="stack">
        <h2 className="small" style={{ margin: 0 }}>
          <Icon name="info" /> What SignSphere is
        </h2>
        <p className="mb-0">
          A learning and communication aid for Indian Sign Language. It is not a replacement for a
          qualified ISL interpreter, and must not be relied on for medical, legal or emergency
          interpretation.
        </p>
        <ul className="small mb-0" style={{ paddingLeft: '1.2rem' }}>
          <li>
            {lexicon.stats.entries} signs in the lexicon; {lexicon.stats.reviewed} reviewed by a fluent
            signer so far.
          </li>
          <li>Recognition works on isolated signs you have taught this device — not full sentences.</li>
          <li>Gloss text cannot show facial expression or mouthing, which carry meaning in ISL.</li>
        </ul>
      </Card>

      <Section title="Frequently asked questions">
        <div className="stack-sm">
          {FAQ.map((item) => (
            <details key={item.q} className="disclosure">
              <summary>
                {item.q}
                <Icon name="chevron" className="chev" />
              </summary>
              <div className="disclosure-body">
                <p className="mb-0">{item.a}</p>
              </div>
            </details>
          ))}
        </div>
      </Section>

      <Section title="Get in touch">
        <Card className="stack-sm">
          <p className="mb-0">
            Found a problem, a wrong sign, or an accessibility barrier? Please report it — sign
            corrections from fluent signers are especially valuable.
          </p>
          <p className="mb-0">
            <a href="https://github.com/akhilabellam0108-ui/SighSphere/issues" target="_blank" rel="noopener noreferrer">
              Report an issue on GitHub <Icon name="external" />
            </a>
          </p>
        </Card>
      </Section>
    </>
  );
}
