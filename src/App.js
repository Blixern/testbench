import React, { useState, useRef, useEffect } from 'react';
import Markdown from 'react-markdown';
import PasswordGate from './PasswordGate';

// ============================================================================
// AI CHAT DEMO — Client-facing chatbot with RAG document context
// ============================================================================

const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// LocalStorage helpers (chat history only)
const storage = {
  saveChats: (chats) => {
    try {
      localStorage.setItem('ai-demo-chats', JSON.stringify(chats));
    } catch (e) {
      console.error('Kunne ikke lagre til localStorage:', e);
    }
  },
  loadChats: () => {
    try {
      const data = localStorage.getItem('ai-demo-chats');
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }
};

// API call to server (no API key needed — server handles it)
const callClaude = async (messages, role) => {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      role
    })
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(data.error?.message || data.error || 'API-feil');
  }

  const text = data.content
    ?.map(block => (block.type === 'text' ? block.text : ''))
    .filter(Boolean)
    .join('\n');

  return { content: text || 'Ingen respons' };
};

// ============================================================================
// DOCUMENT PANEL (sidebar section)
// ============================================================================

function DocumentPanel() {
  const fileInputRef = useRef(null);
  const [documents, setDocuments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  // Load document list on mount
  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    try {
      const res = await fetch('/api/documents', { credentials: 'include' });
      if (res.ok) {
        const docs = await res.json();
        setDocuments(docs);
      }
    } catch (e) {
      console.error('Kunne ikke hente dokumenter:', e);
    }
  };

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setUploading(true);
    setUploadError('');

    for (const file of files) {
      try {
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch('/api/upload', {
          method: 'POST',
          credentials: 'include',
          body: formData
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Opplastingsfeil');
        }
      } catch (error) {
        setUploadError(`Feil med ${file.name}: ${error.message}`);
      }
    }

    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    fetchDocuments();
  };

  const handleDelete = async (id) => {
    try {
      await fetch(`/api/documents/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      fetchDocuments();
    } catch (e) {
      console.error('Kunne ikke slette:', e);
    }
  };

  return (
    <div style={styles.docPanel}>
      <div style={styles.docHeader}>
        <span style={styles.docTitle}>Dokumenter</span>
        <span style={styles.docCount}>{documents.length}</span>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".txt,.md,.json,.csv,.xml,.html,.pdf"
        onChange={handleUpload}
        style={{ display: 'none' }}
      />

      <button
        onClick={() => fileInputRef.current?.click()}
        style={styles.uploadButton}
        disabled={uploading}
      >
        {uploading ? '◌ Laster opp...' : '+ Last opp dokument'}
      </button>

      <div style={styles.uploadHint}>
        PDF, TXT, MD, JSON, CSV, XML, HTML
      </div>

      {uploadError && (
        <div style={styles.uploadError}>{uploadError}</div>
      )}

      <div style={styles.docList}>
        {documents.map(doc => (
          <div key={doc.id} style={styles.docItem}>
            <div style={styles.docInfo}>
              <span style={styles.docName}>{doc.name}</span>
              <span style={styles.docMeta}>{doc.chunkCount} deler</span>
            </div>
            <button
              onClick={() => handleDelete(doc.id)}
              style={styles.docDeleteButton}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// CHAT SIDEBAR
// ============================================================================

function ChatSidebar({ chats, currentChatId, onSelectChat, onNewChat, onDeleteChat, roles }) {
  return (
    <div style={styles.sidebar}>
      <div style={styles.sidebarHeader}>
        <span style={styles.sidebarTitle}>Samtaler</span>
        <button onClick={onNewChat} style={styles.newChatButton}>+ Ny</button>
      </div>

      <div style={styles.chatList}>
        {chats.length === 0 ? (
          <div style={styles.noChats}>Ingen samtaler ennå</div>
        ) : (
          chats.map(chat => {
            const chatRole = roles.find(r => r.key === chat.activeRole);
            return (
            <div
              key={chat.id}
              onClick={() => onSelectChat(chat.id)}
              style={{
                ...styles.chatItem,
                ...(chat.id === currentChatId ? styles.chatItemActive : {})
              }}
            >
              {chatRole && (
                <div style={{ marginBottom: '4px' }}>
                  <span style={{
                    ...styles.chatRoleBadge,
                    backgroundColor: chatRole.color
                  }}>
                    {chatRole.name}
                  </span>
                </div>
              )}
              <div style={styles.chatItemTitle}>
                {chat.title || 'Ny samtale'}
              </div>
              <div style={styles.chatItemMeta}>
                {chat.messages?.length || 0} meldinger
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onDeleteChat(chat.id); }}
                style={styles.deleteChatButton}
              >
                ×
              </button>
            </div>
            );
          })
        )}
      </div>

      <DocumentPanel />
    </div>
  );
}

// ============================================================================
// CHAT INTERFACE
// ============================================================================

function ChatInterface({ chat, onUpdateChat, activeRole, roles, onRoleChange }) {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const messages = chat?.messages || [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = { role: 'user', content: input.trim() };
    const newMessages = [...messages, userMessage];

    onUpdateChat({
      ...chat,
      messages: newMessages,
      activeRole,
      title: chat.title || input.trim().slice(0, 40) + (input.length > 40 ? '...' : '')
    });

    setInput('');
    setIsLoading(true);

    try {
      const response = await callClaude(newMessages, activeRole);
      const assistantMessage = { role: 'assistant', content: response.content };

      onUpdateChat({
        ...chat,
        messages: [...newMessages, assistantMessage],
        activeRole,
        title: chat.title || input.trim().slice(0, 40) + (input.length > 40 ? '...' : '')
      });
    } catch (err) {
      onUpdateChat({
        ...chat,
        messages: [...newMessages, {
          role: 'assistant',
          content: `Feil: ${err.message}`,
          isError: true
        }]
      });
    } finally {
      setIsLoading(false);
    }
  };

  const currentRoleData = roles.find(r => r.key === activeRole);

  return (
    <div style={styles.chatContainer}>
      <div style={styles.chatHeader}>
        <div style={styles.headerLeft}>
          <span style={styles.logoIcon}>◈</span>
          <span style={styles.chatTitle}>AI Chat</span>
        </div>
        <div style={styles.headerRight}>
          <div style={styles.roleSelector}>
            {roles.map(r => (
              <button
                key={r.key}
                onClick={() => onRoleChange(r.key)}
                style={{
                  ...styles.roleButton,
                  ...(activeRole === r.key ? {
                    borderColor: r.color,
                    color: r.color,
                    backgroundColor: `${r.color}15`
                  } : {})
                }}
              >
                <span style={{ color: r.color, marginRight: '4px' }}>●</span>
                {r.name}
              </button>
            ))}
          </div>
          <span style={styles.modelBadge}>Claude Opus</span>
        </div>
      </div>

      <div style={styles.messagesContainer}>
        {messages.length === 0 && (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>◇</div>
            <p style={styles.emptyTitle}>Start en samtale</p>
            <p style={styles.emptyHint}>
              Last opp dokumenter i sidepanelet for å gi AI-en kontekst
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              ...styles.message,
              ...(msg.role === 'user' ? styles.userMessage : styles.assistantMessage),
              ...(msg.isError ? styles.errorMessage : {})
            }}
          >
            <div style={styles.messageRole}>
              {msg.role === 'user' ? 'Du' : 'Claude'}
            </div>
            <div style={styles.messageContent}>
              {msg.role === 'assistant' ? (
                <Markdown components={{
                  p: ({children}) => <p style={{margin: '0 0 8px'}}>{children}</p>,
                  ul: ({children}) => <ul style={{margin: '0 0 8px', paddingLeft: '20px'}}>{children}</ul>,
                  ol: ({children}) => <ol style={{margin: '0 0 8px', paddingLeft: '20px'}}>{children}</ol>,
                  li: ({children}) => <li style={{marginBottom: '4px'}}>{children}</li>,
                  h1: ({children}) => <h1 style={{fontSize: '18px', fontWeight: '700', margin: '16px 0 8px', color: '#fff'}}>{children}</h1>,
                  h2: ({children}) => <h2 style={{fontSize: '16px', fontWeight: '600', margin: '14px 0 6px', color: '#fff'}}>{children}</h2>,
                  h3: ({children}) => <h3 style={{fontSize: '14px', fontWeight: '600', margin: '12px 0 4px', color: '#eee'}}>{children}</h3>,
                  strong: ({children}) => <strong style={{color: '#fff', fontWeight: '600'}}>{children}</strong>,
                  code: ({children, className}) => className ? (
                    <pre style={{backgroundColor: '#0a0a0a', padding: '12px', borderRadius: '6px', overflow: 'auto', margin: '8px 0', border: '1px solid #1a1a1a'}}><code>{children}</code></pre>
                  ) : (
                    <code style={{backgroundColor: '#1a1a1a', padding: '2px 6px', borderRadius: '3px', fontSize: '13px'}}>{children}</code>
                  ),
                  blockquote: ({children}) => <blockquote style={{borderLeft: '3px solid #333', paddingLeft: '12px', margin: '8px 0', color: '#aaa'}}>{children}</blockquote>,
                }}>{msg.content}</Markdown>
              ) : msg.content}
            </div>
          </div>
        ))}

        {isLoading && (
          <div style={{ ...styles.message, ...styles.assistantMessage }}>
            <div style={styles.messageRole}>Claude</div>
            <div style={styles.thinkingIndicator}>
              <span style={styles.dot}>●</span>
              <span style={{ ...styles.dot, animationDelay: '0.2s' }}>●</span>
              <span style={{ ...styles.dot, animationDelay: '0.4s' }}>●</span>
              <span style={styles.thinkingText}>tenker...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div style={styles.inputForm}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder="Skriv en melding..."
          style={styles.input}
          disabled={isLoading}
        />
        <button
          type="button"
          onClick={handleSubmit}
          style={{
            ...styles.sendButton,
            opacity: (isLoading || !input.trim()) ? 0.5 : 1
          }}
          disabled={isLoading || !input.trim()}
        >
          Send
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN APP
// ============================================================================

export default function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [chats, setChats] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const [roles, setRoles] = useState([]);
  const [activeRole, setActiveRole] = useState('interessent');

  // Check auth status on mount
  useEffect(() => {
    fetch('/api/auth/status', { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        setAuthenticated(data.authenticated);
        setCheckingAuth(false);
      })
      .catch(() => setCheckingAuth(false));
  }, []);

  // Load roles from server after auth
  useEffect(() => {
    if (authenticated) {
      fetch('/api/roles', { credentials: 'include' })
        .then(res => res.json())
        .then(data => {
          setRoles(data);
          if (data.length > 0 && !data.find(r => r.key === activeRole)) {
            setActiveRole(data[0].key);
          }
        })
        .catch(e => console.error('Kunne ikke hente roller:', e));
    }
  }, [authenticated]);

  // Load chats from localStorage
  useEffect(() => {
    if (authenticated) {
      const savedChats = storage.loadChats();
      if (savedChats.length > 0) {
        setChats(savedChats);
      }
    }
  }, [authenticated]);

  // Save chats when they change
  useEffect(() => {
    if (authenticated && chats.length > 0) {
      storage.saveChats(chats);
    }
  }, [chats, authenticated]);

  const currentChat = chats.find(c => c.id === currentChatId);

  const createNewChat = () => {
    const newChat = {
      id: generateId(),
      title: '',
      messages: [],
      createdAt: new Date().toISOString()
    };
    setChats(prev => [newChat, ...prev]);
    setCurrentChatId(newChat.id);
  };

  const updateChat = (updatedChat) => {
    setChats(prev => prev.map(c => c.id === updatedChat.id ? updatedChat : c));
  };

  const deleteChat = (id) => {
    setChats(prev => prev.filter(c => c.id !== id));
    if (currentChatId === id) setCurrentChatId(null);
  };

  // Auto-create first chat
  useEffect(() => {
    if (authenticated && !currentChatId && chats.length === 0) {
      createNewChat();
    }
  }, [authenticated]);

  // Show loading while checking auth
  if (checkingAuth) {
    return (
      <div style={{ ...styles.app, alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#555', fontSize: '14px' }}>Laster...</div>
      </div>
    );
  }

  // Show password gate if not authenticated
  if (!authenticated) {
    return <PasswordGate onAuthenticated={() => setAuthenticated(true)} />;
  }

  return (
    <div style={styles.app}>
      <style>{keyframes}</style>

      {showSidebar && (
        <ChatSidebar
          chats={chats}
          currentChatId={currentChatId}
          onSelectChat={setCurrentChatId}
          onNewChat={createNewChat}
          onDeleteChat={deleteChat}
          roles={roles}
        />
      )}

      <div style={styles.mainArea}>
        <div style={styles.toggleBar}>
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            style={styles.sidebarToggle}
          >
            {showSidebar ? '◀' : '▶'} Historikk
          </button>
          <div style={styles.toggleSpacer} />
        </div>

        <main style={styles.main}>
          <ChatInterface
            chat={currentChat}
            onUpdateChat={updateChat}
            activeRole={activeRole}
            roles={roles}
            onRoleChange={setActiveRole}
          />
        </main>

        <footer style={styles.footer}>
          <span>Claude Opus 4.6</span>
          <span style={styles.footerDivider}>•</span>
          <span>Rolle: {roles.find(r => r.key === activeRole)?.name || activeRole}</span>
          <span style={styles.footerDivider}>•</span>
          <span>RAG-aktivert</span>
        </footer>
      </div>
    </div>
  );
}

// ============================================================================
// KEYFRAMES
// ============================================================================

const keyframes = `
  @keyframes pulse {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 1; }
  }
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;

// ============================================================================
// STYLES
// ============================================================================

const styles = {
  app: {
    fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
    backgroundColor: '#0a0a0a',
    color: '#e0e0e0',
    height: '100vh',
    display: 'flex',
    overflow: 'hidden',
  },

  // Sidebar
  sidebar: {
    width: '300px',
    backgroundColor: '#0d0d0d',
    borderRight: '1px solid #1a1a1a',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
  },
  sidebarHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px',
    borderBottom: '1px solid #1a1a1a',
  },
  sidebarTitle: {
    fontSize: '12px',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    color: '#888',
  },
  newChatButton: {
    padding: '6px 12px',
    fontSize: '11px',
    fontFamily: 'inherit',
    border: '1px solid #00ff88',
    borderRadius: '4px',
    backgroundColor: 'transparent',
    color: '#00ff88',
    cursor: 'pointer',
  },
  chatList: {
    flex: 1,
    overflowY: 'auto',
    padding: '8px',
  },
  noChats: {
    padding: '20px',
    textAlign: 'center',
    fontSize: '12px',
    color: '#555',
  },
  chatItem: {
    position: 'relative',
    padding: '12px',
    marginBottom: '8px',
    backgroundColor: '#111',
    borderRadius: '8px',
    border: '1px solid #1a1a1a',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  chatItemActive: {
    borderColor: '#333',
    backgroundColor: '#1a1a1a',
  },
  chatItemTitle: {
    fontSize: '13px',
    color: '#ccc',
    marginBottom: '4px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    paddingRight: '24px',
  },
  chatItemMeta: {
    fontSize: '10px',
    color: '#555',
  },
  deleteChatButton: {
    position: 'absolute',
    top: '8px',
    right: '8px',
    width: '20px',
    height: '20px',
    fontSize: '14px',
    border: 'none',
    borderRadius: '4px',
    backgroundColor: 'transparent',
    color: '#555',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Document Panel
  docPanel: {
    borderTop: '1px solid #1a1a1a',
    padding: '16px',
  },
  docHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  docTitle: {
    fontSize: '12px',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    color: '#888',
  },
  docCount: {
    fontSize: '11px',
    padding: '2px 8px',
    backgroundColor: '#1a1a1a',
    borderRadius: '10px',
    color: '#00ff88',
  },
  uploadButton: {
    width: '100%',
    padding: '10px',
    fontSize: '12px',
    fontFamily: 'inherit',
    border: '1px dashed #333',
    borderRadius: '6px',
    backgroundColor: 'transparent',
    color: '#888',
    cursor: 'pointer',
    marginBottom: '6px',
  },
  uploadHint: {
    fontSize: '10px',
    color: '#444',
    textAlign: 'center',
    marginBottom: '8px',
  },
  uploadError: {
    fontSize: '11px',
    color: '#ff4444',
    padding: '8px',
    backgroundColor: 'rgba(255, 68, 68, 0.1)',
    borderRadius: '4px',
    marginBottom: '8px',
  },
  docList: {
    maxHeight: '200px',
    overflowY: 'auto',
  },
  docItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px',
    marginBottom: '4px',
    backgroundColor: '#111',
    borderRadius: '6px',
    border: '1px solid #1a1a1a',
  },
  docInfo: {
    flex: 1,
    minWidth: 0,
  },
  docName: {
    fontSize: '12px',
    color: '#ccc',
    display: 'block',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  docMeta: {
    fontSize: '10px',
    color: '#555',
  },
  docDeleteButton: {
    width: '20px',
    height: '20px',
    fontSize: '14px',
    border: 'none',
    backgroundColor: 'transparent',
    color: '#555',
    cursor: 'pointer',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Main area
  mainArea: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  toggleBar: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 16px',
    borderBottom: '1px solid #1a1a1a',
    backgroundColor: '#0d0d0d',
  },
  sidebarToggle: {
    padding: '4px 8px',
    fontSize: '11px',
    fontFamily: 'inherit',
    border: '1px solid #333',
    borderRadius: '4px',
    backgroundColor: 'transparent',
    color: '#888',
    cursor: 'pointer',
  },
  toggleSpacer: {
    flex: 1,
  },
  main: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '8px',
    fontSize: '10px',
    color: '#444',
    borderTop: '1px solid #1a1a1a',
    backgroundColor: '#0d0d0d',
  },
  footerDivider: {
    color: '#333',
  },

  // Chat
  chatContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  chatHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 20px',
    borderBottom: '1px solid #1a1a1a',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  logoIcon: {
    fontSize: '18px',
    color: '#00ff88',
  },
  chatTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#fff',
  },
  roleSelector: {
    display: 'flex',
    gap: '4px',
  },
  roleButton: {
    padding: '4px 10px',
    fontSize: '11px',
    fontFamily: 'inherit',
    border: '1px solid #333',
    borderRadius: '4px',
    backgroundColor: 'transparent',
    color: '#888',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
  },
  chatRoleBadge: {
    padding: '2px 6px',
    fontSize: '9px',
    fontWeight: '600',
    borderRadius: '3px',
    color: '#000',
    textTransform: 'uppercase',
  },
  modelBadge: {
    fontSize: '10px',
    padding: '3px 8px',
    backgroundColor: '#1a1a1a',
    borderRadius: '4px',
    color: '#00ff88',
    border: '1px solid #00ff8830',
  },
  messagesContainer: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px',
  },
  emptyState: {
    textAlign: 'center',
    padding: '80px 20px',
  },
  emptyIcon: {
    fontSize: '48px',
    color: '#333',
    marginBottom: '16px',
  },
  emptyTitle: {
    fontSize: '16px',
    color: '#888',
    margin: '0 0 8px',
  },
  emptyHint: {
    fontSize: '12px',
    color: '#555',
    margin: 0,
  },
  message: {
    marginBottom: '16px',
    padding: '12px 16px',
    borderRadius: '8px',
    animation: 'fadeIn 0.2s ease',
  },
  userMessage: {
    backgroundColor: '#1a1a2e',
    borderLeft: '3px solid #4a9eff',
  },
  assistantMessage: {
    backgroundColor: '#111',
    borderLeft: '3px solid #00ff88',
  },
  errorMessage: {
    borderLeftColor: '#ff4444',
    backgroundColor: '#1a0a0a',
  },
  messageRole: {
    fontSize: '10px',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    color: '#888',
    marginBottom: '6px',
  },
  messageContent: {
    fontSize: '14px',
    lineHeight: '1.6',
    wordBreak: 'break-word',
  },
  thinkingIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  dot: {
    color: '#00ff88',
    animation: 'pulse 1s infinite',
    fontSize: '8px',
  },
  thinkingText: {
    marginLeft: '8px',
    fontSize: '12px',
    color: '#555',
  },
  inputForm: {
    display: 'flex',
    gap: '8px',
    padding: '16px 20px',
    borderTop: '1px solid #1a1a1a',
    backgroundColor: '#0d0d0d',
  },
  input: {
    flex: 1,
    padding: '12px 16px',
    fontSize: '14px',
    fontFamily: 'inherit',
    backgroundColor: '#111',
    border: '1px solid #333',
    borderRadius: '8px',
    color: '#e0e0e0',
    outline: 'none',
  },
  sendButton: {
    padding: '12px 24px',
    fontSize: '13px',
    fontWeight: '600',
    fontFamily: 'inherit',
    backgroundColor: '#00ff88',
    color: '#000',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
};
