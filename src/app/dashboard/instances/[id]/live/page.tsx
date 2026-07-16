'use client';

import {
  FormEvent,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Activity,
  Bot,
  FileText,
  Image as ImageIcon,
  Mic,
  RefreshCw,
  Send,
  UserRound,
} from 'lucide-react';

type LiveMessage = {
  id: string;
  direction: 'inbound' | 'outbound';
  from_me: boolean;
  remote_jid: string;
  message_type: string | null;
  text_content: string | null;
  caption: string | null;
  created_at: string;
  media?: {
    media_type?: string | null;
    mime_type?: string | null;
    file_name?: string | null;
    public_url?: string | null;
    transcription?: string | null;
    analysis?: string | null;
    extracted_text?: string | null;
  } | null;
};

function mergeMessages(current: LiveMessage[], incoming: LiveMessage[]) {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()]
    .sort((left, right) => left.created_at.localeCompare(right.created_at))
    .slice(-250);
}

function Intelligence({ message }: { message: LiveMessage }) {
  const media = message.media;
  if (!media) return null;
  const items = [
    media.transcription && { icon: Mic, label: 'Transcript', value: media.transcription },
    media.analysis && { icon: ImageIcon, label: 'Vision', value: media.analysis },
    media.extracted_text && { icon: FileText, label: 'Document text', value: media.extracted_text },
  ].filter(Boolean) as Array<{
    icon: typeof Mic;
    label: string;
    value: string;
  }>;

  return (
    <>
      <div className="message-media-row">
        <span>{media.media_type || 'media'}</span>
        <span>{media.mime_type || 'unknown MIME type'}</span>
        {media.public_url && (
          <a href={media.public_url} target="_blank" rel="noreferrer">Open</a>
        )}
      </div>
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div className="intelligence-result" key={item.label}>
            <Icon size={15} />
            <div>
              <strong>{item.label}</strong>
              <p>{item.value}</p>
            </div>
          </div>
        );
      })}
    </>
  );
}

export default function LiveMessagesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [filter, setFilter] = useState<'all' | 'inbound' | 'outbound'>('all');
  const [streamState, setStreamState] = useState<'connecting' | 'live' | 'offline'>('connecting');
  const [loading, setLoading] = useState(true);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(async () => {
    setLoading(true);
    const response = await fetch(`/api/dashboard/instances/${id}/messages?limit=150`, {
      cache: 'no-store',
    });
    const result = await response.json();
    if (response.ok && result.success) {
      setMessages((current) => mergeMessages(current, result.data));
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadMessages(), 0);
    const stream = new EventSource(`/api/dashboard/instances/${id}/stream`);
    stream.onopen = () => setStreamState('live');
    stream.onerror = () => setStreamState('offline');
    stream.addEventListener('messages', (event) => {
      const incoming = JSON.parse((event as MessageEvent).data) as LiveMessage[];
      setMessages((current) => mergeMessages(current, incoming));
      setStreamState('live');
    });
    stream.addEventListener('heartbeat', () => setStreamState('live'));
    return () => {
      window.clearTimeout(initialLoad);
      stream.close();
    };
  }, [id, loadMessages]);

  useEffect(() => {
    const node = listRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages]);

  const visibleMessages = useMemo(
    () => filter === 'all'
      ? messages
      : messages.filter((message) => message.direction === filter),
    [filter, messages],
  );

  async function sendTestMessage(event: FormEvent) {
    event.preventDefault();
    setSending(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/dashboard/instances/${id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber, text }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Message could not be queued');
      setText('');
      setFeedback({ ok: true, text: 'Message queued' });
    } catch (error) {
      setFeedback({
        ok: false,
        text: error instanceof Error ? error.message : 'Message could not be queued',
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="page-shell">
      <div className="page-header compact-header">
        <div>
          <p className="page-kicker">Realtime</p>
          <h1 className="page-title">Live Messages</h1>
          <p className="page-subtitle">Inbound, outbound, media intelligence, and test sends.</p>
        </div>
        <div className={`live-indicator ${streamState}`}>
          <span />
          {streamState}
        </div>
      </div>

      <div className="live-layout">
        <section className="surface-panel live-stream-panel" aria-label="Live message stream">
          <div className="panel-toolbar">
            <div className="segmented-control" aria-label="Message direction filter">
              {(['all', 'inbound', 'outbound'] as const).map((value) => (
                <button
                  type="button"
                  key={value}
                  className={filter === value ? 'active' : ''}
                  onClick={() => setFilter(value)}
                >
                  {value}
                </button>
              ))}
            </div>
            <button
              className="icon-btn"
              type="button"
              onClick={() => void loadMessages()}
              aria-label="Refresh messages"
              title="Refresh messages"
            >
              <RefreshCw size={17} className={loading ? 'spin' : ''} />
            </button>
          </div>

          <div className="message-stream" ref={listRef}>
            {!loading && visibleMessages.length === 0 && (
              <div className="empty-state">
                <Activity size={24} />
                <strong>No messages in this view</strong>
              </div>
            )}
            {visibleMessages.map((message) => {
              const outbound = message.direction === 'outbound';
              return (
                <article className={`message-event ${outbound ? 'outbound' : 'inbound'}`} key={message.id}>
                  <div className="message-event-icon">
                    {outbound ? <Bot size={16} /> : <UserRound size={16} />}
                  </div>
                  <div className="message-event-content">
                    <div className="message-event-meta">
                      <strong>{outbound ? 'Gateway' : message.remote_jid.split('@')[0]}</strong>
                      <span>{message.message_type || 'message'}</span>
                      <time>{new Date(message.created_at).toLocaleTimeString()}</time>
                    </div>
                    <p className="message-body">
                      {message.text_content || message.caption || `[${message.message_type || 'message'}]`}
                    </p>
                    <Intelligence message={message} />
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <aside className="surface-panel test-send-panel">
          <div className="panel-heading">
            <Send size={18} />
            <div>
              <h2>Send Test</h2>
              <p>Uses the durable outbound queue.</p>
            </div>
          </div>
          <form onSubmit={sendTestMessage}>
            <div className="form-row">
              <label htmlFor="test-phone">Phone number</label>
              <input
                id="test-phone"
                type="tel"
                inputMode="numeric"
                value={phoneNumber}
                onChange={(event) => setPhoneNumber(event.target.value)}
                placeholder="919876543210"
                required
              />
            </div>
            <div className="form-row">
              <label htmlFor="test-text">Message</label>
              <textarea
                id="test-text"
                rows={6}
                value={text}
                onChange={(event) => setText(event.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn btn-block" disabled={sending}>
              <Send size={16} />
              {sending ? 'Queueing...' : 'Queue Message'}
            </button>
            {feedback && (
              <div className={`inline-feedback ${feedback.ok ? 'success' : 'error'}`} role="status">
                {feedback.text}
              </div>
            )}
          </form>
        </aside>
      </div>
    </div>
  );
}
