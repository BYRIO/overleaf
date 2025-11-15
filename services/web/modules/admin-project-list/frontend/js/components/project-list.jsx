import React, { useState, useEffect, useMemo } from 'react'

// ... (keep all the icon components the same)

const ChevronDown = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="6 9 12 15 18 9"></polyline>
  </svg>
)

const ChevronUp = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="18 15 12 9 6 15"></polyline>
  </svg>
)

const Download = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
    <polyline points="7 10 12 15 17 10"></polyline>
    <line x1="12" y1="15" x2="12" y2="3"></line>
  </svg>
)

const Trash = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="3 6 5 6 21 6"></polyline>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
  </svg>
)

const ExternalLink = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
    <polyline points="15 3 21 3 21 9"></polyline>
    <line x1="10" y1="14" x2="21" y2="3"></line>
  </svg>
)

const Users = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
    <circle cx="9" cy="7" r="4"></circle>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
  </svg>
)

const Link2 = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
  </svg>
)

const ProjectList = () => {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expandedRows, setExpandedRows] = useState(new Set())
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' })
  const [searchTerm, setSearchTerm] = useState('')
  const [exportingProjects, setExportingProjects] = useState(new Set())
  const [deletingProjects, setDeletingProjects] = useState(new Set())

  const getCsrfToken = () => {
    if (window.csrfToken) {
      return window.csrfToken
    }
    const meta = document.querySelector('meta[name="csrf-token"]')
    if (meta) {
      return meta.getAttribute('content')
    }
    const metaData = document.querySelector('meta[name="ol-csrfToken"]')
    if (metaData) {
      return metaData.getAttribute('content')
    }
    console.error('CSRF token not found!')
    return null
  }

  useEffect(() => {
    fetchProjects()
  }, [])

  const fetchProjects = async () => {
    try {
      setLoading(true)
      const response = await fetch('/admin/project/list')
      if (!response.ok) {
        throw new Error('Failed to fetch projects')
      }
      const data = await response.json()
      setProjects(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const toggleRow = (projectId) => {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(projectId)) {
        next.delete(projectId)
      } else {
        next.add(projectId)
      }
      return next
    })
  }

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }))
  }

  const handleExport = async (projectId, projectName) => {
    setExportingProjects(prev => new Set(prev).add(projectId))
    
    try {
      const response = await fetch(`/admin/project/${projectId}/export`, {
        method: 'POST',
        headers: {
          'X-CSRF-Token': getCsrfToken(),
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
      })
      
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Export failed: ${errorText}`)
      }
      
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${projectName}_${projectId}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
      
    } catch (err) {
      console.error('Export error:', err)
      alert(`Export failed: ${err.message}`)
    } finally {
      setExportingProjects(prev => {
        const next = new Set(prev)
        next.delete(projectId)
        return next
      })
    }
  }

  const handleDelete = async (projectId, projectName) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete project "${projectName}"?\n\nThis action cannot be undone.`
    )

    if (!confirmed) return

    setDeletingProjects(prev => new Set(prev).add(projectId))
    
    try {
      const response = await fetch(`/admin/project/${projectId}/delete`, {
        method: 'POST',
        headers: {
          'X-CSRF-Token': getCsrfToken(),
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || errorData.error || 'Delete failed')
      }
      
      const data = await response.json()
      setProjects(prev => prev.filter(p => p.id !== projectId))
      alert(data.message || 'Project deleted successfully')
      
    } catch (err) {
      console.error('Delete error:', err)
      alert(`Delete failed: ${err.message}`)
    } finally {
      setDeletingProjects(prev => {
        const next = new Set(prev)
        next.delete(projectId)
        return next
      })
    }
  }

  const filteredAndSortedProjects = useMemo(() => {
    let filtered = projects.filter(project => {
      const search = searchTerm.toLowerCase()
      return (
        project.name.toLowerCase().includes(search) ||
        project.owner.email.toLowerCase().includes(search) ||
        `${project.owner.firstName} ${project.owner.lastName}`.toLowerCase().includes(search)
      )
    })

    return filtered.sort((a, b) => {
      let aVal, bVal
      
      if (sortConfig.key === 'name') {
        aVal = a.name.toLowerCase()
        bVal = b.name.toLowerCase()
      } else if (sortConfig.key === 'owner') {
        aVal = `${a.owner.firstName} ${a.owner.lastName}`.toLowerCase()
        bVal = `${b.owner.firstName} ${b.owner.lastName}`.toLowerCase()
      } else if (sortConfig.key === 'email') {
        aVal = a.owner.email.toLowerCase()
        bVal = b.owner.email.toLowerCase()
      }
      
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1
      return 0
    })
  }, [projects, sortConfig, searchTerm])

  const getCollaboratorTypeBadge = (type) => {
    const badges = {
      'editor': { bg: '#dbeafe', color: '#1e40af', label: 'Editor' },
      'read-only': { bg: '#f3f4f6', color: '#374151', label: 'Read Only' },
      'reviewer': { bg: '#e0e7ff', color: '#3730a3', label: 'Reviewer' },
      'link-editor': { bg: '#fef3c7', color: '#92400e', label: 'Link Editor' },
      'link-viewer': { bg: '#fef3c7', color: '#92400e', label: 'Link Viewer' },
      'pending-editor': { bg: '#fee2e2', color: '#991b1b', label: 'Pending Editor' },
      'pending-reviewer': { bg: '#fee2e2', color: '#991b1b', label: 'Pending Reviewer' }
    }
    
    const badge = badges[type] || badges.editor
    
    return (
      <span style={{
        fontSize: '0.75rem',
        padding: '0.125rem 0.5rem',
        background: badge.bg,
        color: badge.color,
        borderRadius: '0.25rem',
        marginLeft: '0.5rem'
      }}>
        {badge.label}
      </span>
    )
  }

  const SortIcon = ({ columnKey }) => {
    if (sortConfig.key !== columnKey) return <span style={{ color: '#d1d5db' }}>↕</span>
    return <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#f9fafb', padding: '1.5rem' }}>
        <div style={{ maxWidth: '80rem', margin: '0 auto' }}>
          <div style={{ background: 'white', borderRadius: '0.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '1.5rem', textAlign: 'center' }}>
            Loading projects...
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: '#f9fafb', padding: '1.5rem' }}>
        <div style={{ maxWidth: '80rem', margin: '0 auto' }}>
          <div style={{ background: 'white', borderRadius: '0.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '1.5rem' }}>
            <div style={{ color: '#dc2626', marginBottom: '1rem' }}>Error: {error}</div>
            <button 
              onClick={fetchProjects}
              style={{ 
                padding: '0.5rem 1rem',
                background: '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: 'pointer'
              }}
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', padding: '1.5rem' }}>
      <div style={{ maxWidth: '80rem', margin: '0 auto' }}>
        <div style={{ background: 'white', borderRadius: '0.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <div style={{ padding: '1.5rem', borderBottom: '1px solid #e5e7eb' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: '600', color: '#111827', marginBottom: '1rem' }}>
              Project URL Lookup
            </h1>
            <input
              type="text"
              placeholder="Search by project name, owner name, or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem 1rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.5rem',
                outline: 'none',
                fontSize: '0.875rem'
              }}
            />
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <tr>
                  <th style={{ width: '3rem', padding: '0.75rem 1.5rem', textAlign: 'left' }}></th>
                  <th 
                    onClick={() => handleSort('name')}
                    style={{
                      padding: '0.75rem 1.5rem',
                      textAlign: 'left',
                      fontSize: '0.75rem',
                      fontWeight: '500',
                      color: '#6b7280',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      cursor: 'pointer',
                      userSelect: 'none'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      Project Name <SortIcon columnKey="name" />
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('owner')}
                    style={{
                      padding: '0.75rem 1.5rem',
                      textAlign: 'left',
                      fontSize: '0.75rem',
                      fontWeight: '500',
                      color: '#6b7280',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      cursor: 'pointer',
                      userSelect: 'none'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      Owner <SortIcon columnKey="owner" />
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('email')}
                    style={{
                      padding: '0.75rem 1.5rem',
                      textAlign: 'left',
                      fontSize: '0.75rem',
                      fontWeight: '500',
                      color: '#6b7280',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      cursor: 'pointer',
                      userSelect: 'none'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      Email <SortIcon columnKey="email" />
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody style={{ background: 'white' }}>
                {filteredAndSortedProjects.map((project) => (
                  <React.Fragment key={project.id}>
                    <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '1rem 1.5rem' }}>
                        <button
                          onClick={() => toggleRow(project.id)}
                          style={{
                            color: '#9ca3af',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            padding: 0
                          }}
                          aria-label="Expand row"
                        >
                          {expandedRows.has(project.id) ? <ChevronUp /> : <ChevronDown />}
                        </button>
                      </td>
                      <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', fontWeight: '500', color: '#111827' }}>
                        {project.name}
                      </td>
                      <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', color: '#111827' }}>
                        {project.owner.firstName} {project.owner.lastName}
                      </td>
                      <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', color: '#6b7280' }}>
                        {project.owner.email}
                      </td>
                    </tr>
                    
                    {expandedRows.has(project.id) && (
                      <tr>
                        <td colSpan="4" style={{ padding: '1rem 1.5rem', background: '#f9fafb' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {/* Project ID */}
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                              <div style={{ color: '#9ca3af', marginTop: '0.125rem' }}>
                                <ExternalLink size={18} />
                              </div>
                              <div>
                                <div style={{ fontSize: '0.75rem', fontWeight: '500', color: '#6b7280', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                                  Project ID
                                </div>
                                <a 
                                  href={`/project/${project.id}`}
                                  style={{ 
                                    fontSize: '0.875rem',
                                    color: '#2563eb',
                                    textDecoration: 'none',
                                    fontFamily: 'monospace'
                                  }}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  {project.id}
                                </a>
                              </div>
                            </div>

                            {/* Share Links */}
                            {(project.shareLink || project.editShareLink) && (
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                                <div style={{ color: '#9ca3af', marginTop: '0.125rem' }}>
                                  <Link2 size={18} />
                                </div>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: '0.75rem', fontWeight: '500', color: '#6b7280', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                                    Share Links
                                  </div>
                                  {project.editShareLink && (
                                    <div style={{ marginBottom: '0.5rem' }}>
                                      <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                                        Edit Access:
                                      </div>
                                      <a 
                                        href={project.editShareLink}
                                        style={{ 
                                          fontSize: '0.875rem',
                                          color: '#2563eb',
                                          textDecoration: 'none',
                                          wordBreak: 'break-all'
                                        }}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                      >
                                        {project.editShareLink}
                                      </a>
                                    </div>
                                  )}
                                  {project.shareLink && (
                                    <div>
                                      <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                                        View Access:
                                      </div>
                                      <a 
                                        href={project.shareLink}
                                        style={{ 
                                          fontSize: '0.875rem',
                                          color: '#2563eb',
                                          textDecoration: 'none',
                                          wordBreak: 'break-all'
                                        }}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                      >
                                        {project.shareLink}
                                      </a>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Collaborators */}
                            {project.collaborators.length > 0 && (
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                                <div style={{ color: '#9ca3af', marginTop: '0.125rem' }}>
                                  <Users size={18} />
                                </div>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: '0.75rem', fontWeight: '500', color: '#6b7280', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                                    Collaborators ({project.collaborators.length})
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {project.collaborators.map((collab, idx) => (
                                      <div 
                                        key={idx}
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'space-between',
                                          background: 'white',
                                          borderRadius: '0.25rem',
                                          padding: '0.5rem 0.75rem',
                                          border: '1px solid #e5e7eb'
                                        }}
                                      >
                                        <div style={{ flex: 1 }}>
                                          <div style={{ fontSize: '0.875rem', fontWeight: '500', color: '#111827', display: 'flex', alignItems: 'center' }}>
                                            {collab.firstName || collab.lastName ? (
                                              <>
                                                {collab.firstName} {collab.lastName}
                                                {getCollaboratorTypeBadge(collab.type)}
                                              </>
                                            ) : (
                                              <>
                                                {collab.email}
                                                {getCollaboratorTypeBadge(collab.type)}
                                              </>
                                            )}
                                          </div>
                                          {(collab.firstName || collab.lastName) && (
                                            <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                                              {collab.email}
                                            </div>
                                          )}
                                        </div>
                                        <span style={{
                                          fontSize: '0.75rem',
                                          padding: '0.25rem 0.5rem',
                                          background: '#f3f4f6',
                                          color: '#374151',
                                          borderRadius: '0.25rem',
                                          whiteSpace: 'nowrap',
                                          marginLeft: '0.5rem'
                                        }}>
                                          {collab.permission}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Actions */}
                            <div style={{ display: 'flex', gap: '1rem', paddingTop: '0.5rem', borderTop: '1px solid #e5e7eb' }}>
                              {/* Export Button */}
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                                <div style={{ color: '#9ca3af', marginTop: '0.125rem' }}>
                                  <Download size={18} />
                                </div>
                                <div>
                                  <div style={{ fontSize: '0.75rem', fontWeight: '500', color: '#6b7280', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                                    Export
                                  </div>
                                  <button
                                    onClick={() => handleExport(project.id, project.name)}
                                    disabled={exportingProjects.has(project.id)}
                                    style={{
                                      padding: '0.5rem 1rem',
                                      background: exportingProjects.has(project.id) ? '#9ca3af' : '#2563eb',
                                      color: 'white',
                                      fontSize: '0.875rem',
                                      borderRadius: '0.5rem',
                                      border: 'none',
                                      cursor: exportingProjects.has(project.id) ? 'not-allowed' : 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '0.5rem'
                                    }}
                                  >
                                    <Download size={16} />
                                    {exportingProjects.has(project.id) ? 'Exporting...' : 'Export as ZIP'}
                                  </button>
                                </div>
                              </div>

                              {/* Delete Button */}
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                                <div style={{ color: '#9ca3af', marginTop: '0.125rem' }}>
                                  <Trash size={18} />
                                </div>
                                <div>
                                  <div style={{ fontSize: '0.75rem', fontWeight: '500', color: '#6b7280', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                                    Delete
                                  </div>
                                  <button
                                    onClick={() => handleDelete(project.id, project.name)}
                                    disabled={deletingProjects.has(project.id)}
                                    style={{
                                      padding: '0.5rem 1rem',
                                      background: deletingProjects.has(project.id) ? '#9ca3af' : '#dc2626',
                                      color: 'white',
                                      fontSize: '0.875rem',
                                      borderRadius: '0.5rem',
                                      border: 'none',
                                      cursor: deletingProjects.has(project.id) ? 'not-allowed' : 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '0.5rem'
                                    }}
                                  >
                                    <Trash size={16} />
                                    {deletingProjects.has(project.id) ? 'Deleting...' : 'Delete Project'}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {filteredAndSortedProjects.length === 0 && (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
              No projects found matching your search.
            </div>
          )}

          <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid #e5e7eb', fontSize: '0.875rem', color: '#6b7280' }}>
            Showing {filteredAndSortedProjects.length} of {projects.length} projects
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProjectList
