import React, { useState } from 'react';

export default function PasswordGate({ onAuthenticated }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password.trim() || loading) return;

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password.trim() })
      });

      const data = await response.json();

      if (data.success) {
        onAuthenticated();
      } else {
        setError(data.error || 'Feil passord');
        setPassword('');
      }
    } catch (err) {
      setError('Kunne ikke koble til serveren');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div style={styles.card}>
        <div style={styles.logo}>◈</div>
        <h1 style={styles.title}>AI Chat Demo</h1>
        <p style={styles.subtitle}>Skriv inn passord for å fortsette</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Passord"
            style={styles.input}
            autoFocus
            disabled={loading}
          />
          <button
            type="submit"
            style={{
              ...styles.button,
              opacity: loading || !password.trim() ? 0.5 : 1
            }}
            disabled={loading || !password.trim()}
          >
            {loading ? 'Logger inn...' : 'Logg inn'}
          </button>
        </form>

        {error && (
          <div style={styles.error}>{error}</div>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
    backgroundColor: '#0a0a0a',
    color: '#e0e0e0',
    height: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    textAlign: 'center',
    padding: '48px',
    backgroundColor: '#111',
    borderRadius: '12px',
    border: '1px solid #1a1a1a',
    minWidth: '360px',
    animation: 'fadeIn 0.3s ease',
  },
  logo: {
    fontSize: '48px',
    color: '#00ff88',
    marginBottom: '16px',
  },
  title: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#fff',
    margin: '0 0 8px 0',
    fontFamily: 'inherit',
  },
  subtitle: {
    fontSize: '13px',
    color: '#666',
    margin: '0 0 32px 0',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  input: {
    padding: '12px 16px',
    fontSize: '14px',
    fontFamily: 'inherit',
    backgroundColor: '#0a0a0a',
    border: '1px solid #333',
    borderRadius: '8px',
    color: '#e0e0e0',
    outline: 'none',
    textAlign: 'center',
  },
  button: {
    padding: '12px 24px',
    fontSize: '14px',
    fontFamily: 'inherit',
    fontWeight: '600',
    backgroundColor: '#00ff88',
    color: '#000',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  error: {
    marginTop: '16px',
    padding: '10px',
    fontSize: '12px',
    color: '#ff4444',
    backgroundColor: 'rgba(255, 68, 68, 0.1)',
    borderRadius: '6px',
    border: '1px solid rgba(255, 68, 68, 0.2)',
  },
};
