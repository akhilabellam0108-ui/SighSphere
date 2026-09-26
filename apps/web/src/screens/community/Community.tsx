/**
 * Community. There is no community backend yet (PLAN.md cut it from v1), so this screen
 * shows clearly labelled DEMO content: fictional people, posts and events. Every action
 * that would need a server explains that instead of pretending to work.
 */

import { useState } from 'react';
import {
  DEMO_EVENTS,
  DEMO_FORUMS,
  DEMO_MENTORS,
  DEMO_STORIES,
  DEMO_WORKSHOPS,
  type CommunityTab,
  type DemoEvent,
  type DemoPost,
} from '../../data/demo/community.js';
import { Avatar, Badge, Button, Card, DemoBanner, Icon, PageHeader, TabPanel, Tabs } from '../../components/ui/index.js';
import { useToast } from '../../state/toast.js';

const NOT_LIVE = 'Community features are not live yet — this is demo content.';

function PostCard({ post, onAction }: { post: DemoPost; onAction(): void }) {
  return (
    <Card as="article" className="post-card" aria-labelledby={`post-${post.id}`}>
      <header className="post-head">
        <Avatar name={post.author} tone={post.tone} />
        <div className="post-author">
          <p className="list-item-title">{post.author}</p>
          <p className="list-item-meta">
            {post.role} · {post.ago}
          </p>
        </div>
        <Badge tone="demo">Demo</Badge>
      </header>
      <h3 id={`post-${post.id}`}>{post.title}</h3>
      <p className="muted">{post.body}</p>
      <div className="row">
        {post.tags.map((tag) => (
          <span key={tag} className="badge-pill">
            {tag}
          </span>
        ))}
      </div>
      <div className="post-actions">
        <Button variant="ghost" size="sm" icon="message" onClick={onAction}>
          {post.replies} replies
        </Button>
        <Button variant="ghost" size="sm" icon="heart" onClick={onAction}>
          Appreciate
        </Button>
      </div>
    </Card>
  );
}

function EventCard({ event, onAction, cta }: { event: DemoEvent; onAction(): void; cta: string }) {
  const [day, ...rest] = event.when.split(' · ');
  return (
    <Card as="article" className="event-card" aria-labelledby={`event-${event.id}`}>
      <div className="event-date" aria-hidden="true">
        <Icon name="calendar" size="lg" />
      </div>
      <div className="stack-sm" style={{ minWidth: 0 }}>
        <div className="row">
          <Badge tone={event.format === 'Online' ? 'accent' : 'success'} icon={event.format === 'Online' ? 'video' : 'pin'}>
            {event.format}
          </Badge>
          <Badge tone="demo">Demo</Badge>
        </div>
        <h3 id={`event-${event.id}`} style={{ margin: 0 }}>
          {event.title}
        </h3>
        <p className="small mb-0">
          <strong>{day}</strong>
          {rest.length > 0 && ` · ${rest.join(' · ')}`} · {event.where}
        </p>
        <p className="small muted mb-0">{event.body}</p>
        <p className="list-item-meta mb-0">{event.host}</p>
        <div>
          <Button variant="soft" size="sm" icon="plus" onClick={onAction}>
            {cta}
          </Button>
        </div>
      </div>
    </Card>
  );
}

const TABS: ReadonlyArray<{ id: CommunityTab; label: string }> = [
  { id: 'forums', label: 'Discussions' },
  { id: 'events', label: 'Events' },
  { id: 'workshops', label: 'Workshops' },
  { id: 'stories', label: 'Success stories' },
  { id: 'mentorship', label: 'Mentorship' },
];

export default function Community() {
  const [tab, setTab] = useState<CommunityTab>('forums');
  const { toast } = useToast();
  const notLive = () => toast(NOT_LIVE);

  return (
    <>
      <PageHeader
        eyebrow={
          <>
            <Icon name="community" /> Community
          </>
        }
        title="Community"
        subtitle="Discussions, events, workshops, stories and mentorship — built with the Deaf community, not just for it."
      />

      <DemoBanner>
        The community has not launched. Everything below is sample content showing how it will
        work — the people, posts and events are fictional, and posting is switched off.
      </DemoBanner>

      <Card variant="soft" className="composer">
        <Avatar name="You" />
        <div className="composer-body">
          <label htmlFor="composer" className="sr-only">
            Start a discussion
          </label>
          <input id="composer" type="text" placeholder="Posting opens when the community launches" disabled />
        </div>
        <Button variant="primary" icon="send" disabled>
          Post
        </Button>
      </Card>

      <Tabs<CommunityTab> label="Community sections" idPrefix="community" items={TABS} value={tab} onChange={setTab} />

      <TabPanel idPrefix="community" activeId={tab}>
        {tab === 'forums' && (
          <div className="feed">
            {DEMO_FORUMS.map((post) => (
              <PostCard key={post.id} post={post} onAction={notLive} />
            ))}
          </div>
        )}
        {tab === 'events' && (
          <div className="grid-cards">
            {DEMO_EVENTS.map((event) => (
              <EventCard key={event.id} event={event} onAction={notLive} cta="Interested" />
            ))}
          </div>
        )}
        {tab === 'workshops' && (
          <div className="grid-cards">
            {DEMO_WORKSHOPS.map((event) => (
              <EventCard key={event.id} event={event} onAction={notLive} cta="Register interest" />
            ))}
          </div>
        )}
        {tab === 'stories' && (
          <div className="feed">
            {DEMO_STORIES.map((post) => (
              <PostCard key={post.id} post={post} onAction={notLive} />
            ))}
          </div>
        )}
        {tab === 'mentorship' && (
          <div className="grid-cards">
            {DEMO_MENTORS.map((mentor) => (
              <Card as="article" key={mentor.id} className="mentor-card" aria-labelledby={`mentor-${mentor.id}`}>
                <div className="post-head">
                  <Avatar name={mentor.name} tone={mentor.tone} size="lg" />
                  <Badge tone="demo">Demo</Badge>
                </div>
                <h3 id={`mentor-${mentor.id}`} style={{ margin: 0 }}>
                  {mentor.name}
                </h3>
                <p className="small mb-0">
                  <strong>{mentor.focus}</strong>
                </p>
                <p className="list-item-meta mb-0">{mentor.languages}</p>
                <p className="small muted">{mentor.about}</p>
                <Button variant="soft" size="sm" icon="message" onClick={notLive}>
                  Request mentorship
                </Button>
              </Card>
            ))}
          </div>
        )}
      </TabPanel>
    </>
  );
}
