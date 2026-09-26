/**
 * DEMO DATA. Every name, post, event and number in this file is fictional and exists only
 * to show how the Community screen will look. The screen shows a "Demo content" banner for
 * as long as this file is its data source. Replace with a real backend — do not "make it
 * look real" by editing this file.
 */

export type CommunityTab = 'forums' | 'events' | 'workshops' | 'stories' | 'mentorship';

export interface DemoPost {
  id: string;
  author: string;
  role: string;
  tone: 1 | 2 | 3;
  ago: string;
  title: string;
  body: string;
  tags: string[];
  replies: number;
}

export interface DemoEvent {
  id: string;
  title: string;
  /** Display-only; relative so demo content never goes stale. */
  when: string;
  where: string;
  format: 'Online' | 'In person';
  body: string;
  host: string;
}

export interface DemoMentor {
  id: string;
  name: string;
  tone: 1 | 2 | 3;
  focus: string;
  languages: string;
  about: string;
}

export const DEMO_FORUMS: DemoPost[] = [
  {
    id: 'f1',
    author: 'Riya Menon',
    role: 'Parent · learning ISL',
    tone: 2,
    ago: '2 h ago',
    title: 'How did you practise family signs at home?',
    body: 'My daughter is 6 and we are learning together. We label things around the house — what else worked for you?',
    tags: ['Family', 'Beginner'],
    replies: 14,
  },
  {
    id: 'f2',
    author: 'Arjun Das',
    role: 'Deaf · ISL teacher',
    tone: 1,
    ago: '5 h ago',
    title: 'Common mistake: signing English word order',
    body: 'Many learners sign every English word in order. ISL puts time first and question words last. Happy to answer questions here.',
    tags: ['Grammar', 'Tips'],
    replies: 32,
  },
  {
    id: 'f3',
    author: 'Sana Qureshi',
    role: 'College student',
    tone: 3,
    ago: '1 d ago',
    title: 'Study group for the numbers lesson?',
    body: 'Looking for 2–3 people to practise numbers over video on weekends.',
    tags: ['Study group'],
    replies: 6,
  },
];

export const DEMO_EVENTS: DemoEvent[] = [
  {
    id: 'e1',
    title: 'ISL Conversation Circle',
    when: 'This Saturday · 5:00 PM',
    where: 'Video call',
    format: 'Online',
    body: 'Relaxed practice with fluent signers. All levels welcome; cameras on.',
    host: 'Hosted by a Deaf-led group (demo)',
  },
  {
    id: 'e2',
    title: 'Sign Language Day meetup',
    when: 'Next month',
    where: 'Community hall, Hyderabad',
    format: 'In person',
    body: 'Games, storytelling and a beginner corner. Interpreters present.',
    host: 'Hosted by a local association (demo)',
  },
];

export const DEMO_WORKSHOPS: DemoEvent[] = [
  {
    id: 'w1',
    title: 'Making your classroom Deaf-friendly',
    when: 'Wednesday · 4:00 PM',
    where: 'Video call',
    format: 'Online',
    body: 'For teachers: seating, visual cues, captioned media and working with interpreters.',
    host: 'Accessibility workshop (demo)',
  },
  {
    id: 'w2',
    title: 'Accessible events 101',
    when: 'In two weeks',
    where: 'Video call',
    format: 'Online',
    body: 'Planning events with captions, ISL interpretation and accessible registration.',
    host: 'Accessibility workshop (demo)',
  },
];

export const DEMO_STORIES: DemoPost[] = [
  {
    id: 's1',
    author: 'Meera Iyer',
    role: 'Grandmother',
    tone: 2,
    ago: '3 d ago',
    title: 'The first time my grandson and I had a real conversation',
    body: 'After two months of ten-minute lessons, I asked him about school — in his language. He answered with a whole story.',
    tags: ['Family', 'Milestone'],
    replies: 48,
  },
  {
    id: 's2',
    author: 'Kabir Singh',
    role: 'Café owner',
    tone: 1,
    ago: '1 w ago',
    title: 'Our staff learned 30 signs for the counter',
    body: 'Ordering is now easier for Deaf customers — and our staff enjoy it more than any training we have done.',
    tags: ['Workplace'],
    replies: 21,
  },
];

export const DEMO_MENTORS: DemoMentor[] = [
  {
    id: 'm1',
    name: 'Arjun Das',
    tone: 1,
    focus: 'ISL grammar and conversation',
    languages: 'ISL · English · Hindi',
    about: 'Deaf ISL teacher. Helps learners move from single signs to sentences.',
  },
  {
    id: 'm2',
    name: 'Lakshmi Rao',
    tone: 3,
    focus: 'Parents of Deaf children',
    languages: 'ISL · Telugu · English',
    about: 'CODA and mentor for families starting their ISL journey.',
  },
  {
    id: 'm3',
    name: 'Farhan Ali',
    tone: 2,
    focus: 'Workplace accessibility',
    languages: 'ISL · English · Urdu',
    about: 'Helps teams set up accessible meetings and hiring.',
  },
];
