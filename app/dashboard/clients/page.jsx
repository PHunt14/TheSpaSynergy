'use client'

import { useState, useEffect } from 'react'
import { fetchAuthSession } from 'aws-amplify/auth'

export default function ClientsPage() {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedClient, setSelectedClient] = useState(null)
  const [appointments, setAppointments] = useState([])
  const [notes, setNotes] = useState([])
  const [newNote, setNewNote] = useState('')
  const [editingNote, setEditingNote] = useState(null)
  const [editContent, setEditContent] = useState('')
  const [currentUserEmail, setCurrentUserEmail] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  useEffect(() => {
    fetchAuthSession().then(session => {
      setCurrentUserEmail(session.tokens?.idToken?.payload['email'] || '')
    })
    loadClients()
  }, [])

  const loadClients = () => {
    setLoading(true)
    const url = search ? `/api/clients?search=${encodeURIComponent(search)}` : '/api/clients'
    fetch(url)
      .then(r => r.json())
      .then(data => { setClients(data.clients || []); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => {
    const timer = setTimeout(loadClients, 300)
    return () => clearTimeout(timer)
  }, [search])

  const selectClient = async (client) => {
    setSelectedClient(client)
    setNewNote('')
    setEditingNote(null)

    const [aptsRes, notesRes] = await Promise.all([
      fetch(`/api/dashboard?clientId=${client.clientId}`).then(r => r.json()).catch(() => ({ appointments: [] })),
      fetch(`/api/client-notes?clientId=${client.clientId}`).then(r => r.json()).catch(() => ({ notes: [] })),
    ])
    setAppointments(aptsRes.appointments || [])
    setNotes(notesRes.notes || [])
  }

  const handleAddNote = async () => {
    if (!newNote.trim()) return
    setSavingNote(true)
    try {
      const res = await fetch('/api/client-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: selectedClient.clientId, content: newNote.trim() })
      })
      if (res.ok) {
        setNewNote('')
        const data = await fetch(`/api/client-notes?clientId=${selectedClient.clientId}`).then(r => r.json())
        setNotes(data.notes || [])
      }
    } catch (error) {
      alert('Error adding note: ' + (error.message || ''))
    } finally { setSavingNote(false) }
  }

  const handleEditNote = async (noteId) => {
    if (!editContent.trim()) return
    setSavingNote(true)
    try {
      const res = await fetch('/api/client-notes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteId, content: editContent.trim() })
      })
      if (res.ok) {
        setEditingNote(null)
        setEditContent('')
        const data = await fetch(`/api/client-notes?clientId=${selectedClient.clientId}`).then(r => r.json())
        setNotes(data.notes || [])
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to update note')
      }
    } catch (error) {
      alert('Error updating note: ' + (error.message || ''))
    } finally { setSavingNote(false) }
  }

  const formatDate = (dt) => {
    if (!dt) return ''
    return new Date(dt).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true
    })
  }

  const inputStyle = { width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '1rem' }

  if (selectedClient) {
    return (
      <div>
        <button onClick={() => setSelectedClient(null)} style={{
          background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary)',
          fontSize: '1rem', marginBottom: '1rem', padding: 0
        }}>
          ← Back to Clients
        </button>

        <div style={{ background: 'var(--color-accent)', borderRadius: '12px', padding: '1.5rem', marginBottom: '2rem' }}>
          <h2 style={{ marginTop: 0 }}>{selectedClient.name}</h2>
          {selectedClient.phone && <p style={{ margin: '0.25rem 0' }}>📞 <a href={`tel:${selectedClient.phone}`}>{selectedClient.phone}</a></p>}
          {selectedClient.email && <p style={{ margin: '0.25rem 0' }}>✉️ <a href={`mailto:${selectedClient.email}`}>{selectedClient.email}</a></p>}
          <p style={{ margin: '0.25rem 0', color: 'var(--color-text-light)', fontSize: '0.9rem' }}>
            Client since {selectedClient.createdAt ? new Date(selectedClient.createdAt).toLocaleDateString() : 'N/A'}
          </p>
        </div>

        <h3>Appointment History ({appointments.length})</h3>
        {appointments.length === 0 ? (
          <p style={{ color: 'var(--color-text-light)' }}>No appointments found.</p>
        ) : (
          <div style={{ overflowX: 'auto', marginBottom: '2rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--color-accent)', borderRadius: '8px', overflow: 'hidden' }}>
              <thead>
                <tr style={{ background: 'var(--color-primary)', color: 'white' }}>
                  <th style={{ padding: '0.75rem', textAlign: 'left' }}>Date</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left' }}>Service</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {appointments.map(apt => (
                  <tr key={apt.appointmentId} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '0.75rem' }}>{formatDate(apt.dateTime)}</td>
                    <td style={{ padding: '0.75rem' }}>{apt.service?.name || apt.serviceId}</td>
                    <td style={{ padding: '0.75rem' }}>{apt.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <h3>Notes</h3>
        <div style={{ marginBottom: '1rem' }}>
          <textarea
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Add a note about this client..."
            rows="3"
            style={{ ...inputStyle, resize: 'vertical', marginBottom: '0.5rem' }}
          />
          <button onClick={handleAddNote} disabled={savingNote || !newNote.trim()} className="cta" style={{ margin: 0 }}>
            {savingNote ? 'Saving...' : 'Add Note'}
          </button>
        </div>

        {notes.length === 0 && <p style={{ color: 'var(--color-text-light)' }}>No notes yet.</p>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {notes.map(note => (
            <div key={note.noteId} style={{ background: 'var(--color-accent)', borderRadius: '8px', padding: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <strong style={{ fontSize: '0.9rem' }}>{note.authorName}</strong>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-light)' }}>
                  {formatDate(note.createdAt)}
                  {note.updatedAt && note.updatedAt !== note.createdAt && ' (edited)'}
                </span>
              </div>
              {editingNote === note.noteId ? (
                <div>
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows="3"
                    style={{ ...inputStyle, resize: 'vertical', marginBottom: '0.5rem' }}
                  />
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button onClick={() => handleEditNote(note.noteId)} disabled={savingNote} className="cta" style={{ margin: 0, padding: '0.5rem 1rem', fontSize: '0.9rem' }}>
                      Save
                    </button>
                    <button onClick={() => { setEditingNote(null); setEditContent('') }} style={{
                      padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid var(--color-border)',
                      background: 'white', cursor: 'pointer', fontSize: '0.9rem'
                    }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{note.content}</p>
                  {note.authorId === currentUserEmail && (
                    <button onClick={() => { setEditingNote(note.noteId); setEditContent(note.content) }} style={{
                      marginTop: '0.5rem', padding: '0.25rem 0.75rem', borderRadius: '4px', border: 'none',
                      background: '#2196F3', color: 'white', cursor: 'pointer', fontSize: '0.8rem'
                    }}>
                      Edit
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <h1>Clients</h1>
      <p style={{ color: 'var(--color-text-light)', marginBottom: '2rem' }}>
        View client profiles, appointment history, and notes.
      </p>

      <div style={{ marginBottom: '2rem' }}>
        <label htmlFor="client-search" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>Search</label>
        <input
          id="client-search"
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, phone, or email..."
          style={inputStyle}
        />
      </div>

      {loading && <p>Loading clients...</p>}

      {!loading && clients.length === 0 && (
        <p style={{ color: 'var(--color-text-light)' }}>
          {search ? 'No clients match your search.' : 'No clients yet. Clients are automatically added when customers book appointments.'}
        </p>
      )}

      {!loading && clients.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--color-accent)', borderRadius: '8px', overflow: 'hidden' }}>
            <thead>
              <tr style={{ background: 'var(--color-primary)', color: 'white' }}>
                <th style={{ padding: '1rem', textAlign: 'left' }}>Name</th>
                <th style={{ padding: '1rem', textAlign: 'left' }}>Phone</th>
                <th style={{ padding: '1rem', textAlign: 'left' }}>Email</th>
                <th style={{ padding: '1rem', textAlign: 'left' }}>Since</th>
              </tr>
            </thead>
            <tbody>
              {clients.map(c => (
                <tr
                  key={c.clientId}
                  onClick={() => selectClient(c)}
                  style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer', transition: '0.2s ease' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'white'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '1rem', fontWeight: 500 }}>{c.name}</td>
                  <td style={{ padding: '1rem' }}>{c.phone || '—'}</td>
                  <td style={{ padding: '1rem' }}>{c.email || '—'}</td>
                  <td style={{ padding: '1rem', fontSize: '0.9rem', color: 'var(--color-text-light)' }}>
                    {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
