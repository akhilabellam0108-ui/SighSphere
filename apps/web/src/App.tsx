import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './app/AppLayout.js';
import EntryLayout from './app/EntryLayout.js';
import { RequireSession, RootRedirect } from './app/guards.js';
import { LEGACY_REDIRECTS } from './app/nav.js';

// Screens are split into chunks so the shell paints fast on 3G. The service worker
// precaches every chunk, so lazy loading never breaks offline use.
const Splash = lazy(() => import('./screens/entry/Splash.js'));
const Onboarding = lazy(() => import('./screens/entry/Onboarding.js'));
const Auth = lazy(() => import('./screens/entry/Auth.js'));
const Home = lazy(() => import('./screens/home/Home.js'));
const TextToSign = lazy(() => import('./screens/translate/TextToSign.js'));
const SignToText = lazy(() => import('./screens/translate/SignToText.js'));
const Conversation = lazy(() => import('./screens/translate/Conversation.js'));
const LearningHub = lazy(() => import('./screens/learn/LearningHub.js'));
const Lesson = lazy(() => import('./screens/learn/Lesson.js'));
const Community = lazy(() => import('./screens/community/Community.js'));
const Emergency = lazy(() => import('./screens/emergency/Emergency.js'));
const AccessibilityTools = lazy(() => import('./screens/accessibility/AccessibilityTools.js'));
const Profile = lazy(() => import('./screens/profile/Profile.js'));
const History = lazy(() => import('./screens/profile/History.js'));
const Teach = lazy(() => import('./screens/profile/Teach.js'));
const SettingsPage = lazy(() => import('./screens/profile/Settings.js'));
const Help = lazy(() => import('./screens/profile/Help.js'));
const NotFound = lazy(() => import('./screens/NotFound.js'));

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />

      <Route element={<EntryLayout />}>
        <Route path="/welcome" element={<Splash />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/auth" element={<Auth />} />
      </Route>

      <Route element={<AppLayout />}>
        {/* Reachable with no session and no onboarding — see guards.tsx. */}
        <Route path="/emergency" element={<Emergency />} />

        <Route element={<RequireSession />}>
          <Route path="/home" element={<Home />} />
          <Route path="/translate">
            <Route index element={<Navigate to="/home" replace />} />
            <Route path="text-to-sign" element={<TextToSign mode="text" />} />
            <Route path="voice-to-sign" element={<TextToSign mode="voice" />} />
            <Route path="sign-to-text" element={<SignToText speakOutput={false} />} />
            <Route path="sign-to-voice" element={<SignToText speakOutput />} />
            <Route path="conversation" element={<Conversation />} />
          </Route>
          <Route path="/learn" element={<LearningHub />} />
          <Route path="/learn/:lessonId" element={<Lesson />} />
          <Route path="/community" element={<Community />} />
          <Route path="/accessibility" element={<AccessibilityTools />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/profile/history" element={<History />} />
          <Route path="/record" element={<Teach />} />
          <Route path="/profile/settings" element={<SettingsPage />} />
          <Route path="/profile/help" element={<Help />} />
        </Route>

        {Object.entries(LEGACY_REDIRECTS).map(([from, to]) => (
          <Route key={from} path={from} element={<Navigate to={to} replace />} />
        ))}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
