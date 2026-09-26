import { useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Brand } from '../../components/domain/index.js';
import { Illustration, type IllustrationKind } from '../../components/domain/Illustration.js';
import { Button } from '../../components/ui/index.js';
import { useAuth } from '../../state/auth.js';

interface Slide {
  kind: IllustrationKind;
  title: string;
  body: string;
  note: string;
}

const SLIDES: Slide[] = [
  {
    kind: 'communicate',
    title: 'Real-Time Communication',
    body: 'Translate between voice, text, and sign language instantly.',
    note: 'Sign recognition covers a growing set of individual ISL signs — not full sentences yet.',
  },
  {
    kind: 'learn',
    title: 'Learn Sign Language',
    body: 'Practice and improve using AI-powered lessons.',
    note: 'Sign on camera and get instant, specific feedback. Streaks and spaced review keep it sticking.',
  },
  {
    kind: 'connect',
    title: 'Build Inclusive Connections',
    body: 'Communicate confidently with everyone.',
    note: 'A communication aid alongside interpreters — never a replacement for one.',
  },
];

/**
 * Three onboarding slides. A carousel only in looks: it is a single live region with
 * explicit Back/Next buttons (and arrow keys), no swipe-only or auto-advancing behaviour.
 */
export default function Onboarding() {
  const navigate = useNavigate();
  const { completeOnboarding } = useAuth();
  const [index, setIndex] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const slide = SLIDES[index] as Slide;
  const last = index === SLIDES.length - 1;

  function go(next: number) {
    const clamped = Math.max(0, Math.min(SLIDES.length - 1, next));
    setIndex(clamped);
    window.setTimeout(() => headingRef.current?.focus(), 0);
  }

  function finish() {
    completeOnboarding();
    navigate('/auth');
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowRight') go(index + 1);
    if (event.key === 'ArrowLeft') go(index - 1);
  }

  return (
    <div className="entry">
      <main id="main" tabIndex={-1} className="onboarding">
        <div className="onboarding-top">
          <Brand to="/welcome" />
          <Button variant="ghost" size="sm" onClick={finish}>
            Skip
          </Button>
        </div>

        <div
          className="card onboarding-card"
          role="group"
          aria-roledescription="slide"
          aria-label={`${index + 1} of ${SLIDES.length}`}
          onKeyDown={onKeyDown}
        >
          <div className="onboarding-art" key={slide.kind}>
            <Illustration kind={slide.kind} />
          </div>
          <p className="eyebrow">
            Step {index + 1} of {SLIDES.length}
          </p>
          <h1 ref={headingRef} tabIndex={-1}>
            {slide.title}
          </h1>
          <p className="onboarding-body">{slide.body}</p>
          <p className="small muted">{slide.note}</p>

          <div className="dots" aria-hidden="true">
            {SLIDES.map((item, i) => (
              <span key={item.kind} className={i === index ? 'active' : undefined} />
            ))}
          </div>

          <div className="onboarding-actions">
            <Button variant="ghost" icon="back" onClick={() => go(index - 1)} disabled={index === 0}>
              Back
            </Button>
            {last ? (
              <Button variant="gradient" size="lg" iconRight="arrow-right" onClick={finish}>
                Start Journey
              </Button>
            ) : (
              <Button variant="primary" iconRight="arrow-right" onClick={() => go(index + 1)}>
                Next
              </Button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
