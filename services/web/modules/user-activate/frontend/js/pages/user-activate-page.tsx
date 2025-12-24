import '@/marketing'
import { createRoot } from 'react-dom/client'
import { useState, useEffect, type ChangeEvent } from 'react'
import { getJSON, postJSON } from '@/infrastructure/fetch-json'
import UserActivateRegister from '../components/user-activate-register'

interface User {
  id: string
  lastName: string
  firstName: string
  email: string
  isAdmin: boolean
  signUpDate?: string | null
  lastLoggedIn?: string | null
  lastActive?: string | null
  loginCount?: number
  lastLoginIp?: string | null
  suspended?: boolean
}

interface Notification {
  type: 'success' | 'error'
  message: string
}

function UserList() {
  const [users, setUsers] = useState<User[]>([])
  const [sort, setSort] = useState<{
    column: keyof User
    ascending: boolean
  }>({
    column: 'lastName',
    ascending: true,
  })
  const [notification, setNotification] = useState<Notification | null>(null)
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null)
  const [updatingAdminId, setUpdatingAdminId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    fetchUsers()
  }, [page, perPage, sort, searchTerm])

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [notification])

  async function fetchUsers(
    targetPage = page,
    targetPerPage = perPage,
    targetSearch = searchTerm,
    targetSort = sort
  ) {
    try {
      setLoading(true)
      setError(null)
      const query = new URLSearchParams({
        page: String(targetPage),
        perPage: String(targetPerPage),
        sort: targetSort.column,
        direction: targetSort.ascending ? 'asc' : 'desc',
      })
      if (targetSearch) {
        query.set('search', targetSearch)
      }

      const data = await getJSON(`/admin/user/list?${query.toString()}`)
      setUsers(data.users || [])
      setPage(data.page || targetPage)
      setPerPage(data.perPage || targetPerPage)
      setTotal(data.total || 0)
      setTotalPages(data.totalPages || 1)
    } catch (err: any) {
      console.error('Failed to fetch users:', err)
      setError(err.message || 'Failed to fetch users')
    } finally {
      setLoading(false)
    }
  }

  function formatDate(value?: string | null) {
    if (!value) return '-'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '-'
    return date.toLocaleString()
  }

  function handleSort(column: keyof User) {
    setSort(prev => ({
      column,
      ascending: prev.column === column ? !prev.ascending : true,
    }))
  }

  function handleSearchChange(event: ChangeEvent<HTMLInputElement>) {
    setSearchTerm(event.target.value)
    setPage(1)
  }

  function handlePerPageChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextPerPage = parseInt(event.target.value, 10) || 20
    setPerPage(nextPerPage)
    setPage(1)
  }

  function goToPage(nextPage: number) {
    const safePage = Math.max(1, Math.min(nextPage, totalPages))
    setPage(safePage)
  }

  async function handleAdminToggle(user: User) {
    const newAdminStatus = !user.isAdmin
    setUpdatingAdminId(user.id)

    try {
      const data = await postJSON(`/admin/user/${user.id}/admin`, {
        body: { isAdmin: newAdminStatus },
      })

      setNotification({
        type: 'success',
        message: data.message || 'Admin status updated successfully',
      })
      await fetchUsers()
    } catch (error: any) {
      console.error('Error updating admin status:', error)
      setNotification({
        type: 'error',
        message: error.message || error.info?.message || 'Failed to update admin status',
      })
    } finally {
      setUpdatingAdminId(null)
    }
  }

  async function handleDelete(user: User) {
    const confirmed = window.confirm(
      `Are you sure you want to delete user "${user.firstName} ${user.lastName}" (${user.email})?\n\nThis will delete the user and all their projects. This action cannot be undone.`
    )

    if (!confirmed) return

    setDeletingUserId(user.id)

    try {
      const data = await postJSON(`/admin/user/${user.id}/delete`, {
        body: {},
      })

      setNotification({
        type: 'success',
        message: data.message || 'User deleted successfully',
      })
      await fetchUsers()
    } catch (error: any) {
      console.error('Error deleting user:', error)
      setNotification({
        type: 'error',
        message: error.message || error.info?.message || 'Failed to delete user',
      })
    } finally {
      setDeletingUserId(null)
    }
  }

  return (
    <div className="card" style={{ marginTop: '2rem' }}>
      <div className="card-body">
        <h3 className="card-title">Registered Users ({total})</h3>

        <div
          className="row-spaced"
          style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}
        >
          <input
            type="text"
            className="form-control"
            placeholder="Search by name or email..."
            value={searchTerm}
            onChange={handleSearchChange}
            style={{ maxWidth: '320px' }}
          />
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
            <label htmlFor="user-per-page" className="sr-only">
              Per page
            </label>
            <select
              id="user-per-page"
              className="form-control"
              value={perPage}
              onChange={handlePerPageChange}
              style={{ maxWidth: '120px' }}
            >
              {[10, 20, 50, 100].map(size => (
                <option key={size} value={size}>
                  {size} / page
                </option>
              ))}
            </select>
          </div>
        </div>
        
        {notification && (
          <div
            className={`alert ${
              notification.type === 'success' ? 'alert-success' : 'alert-danger'
            } alert-dismissible fade show`}
            role="alert"
          >
            {notification.message}
            <button
              type="button"
              className="close"
              onClick={() => setNotification(null)}
              aria-label="Close"
            >
              <span aria-hidden="true">&times;</span>
            </button>
          </div>
        )}

        {error && (
          <div className="alert alert-danger" role="alert">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-muted">Loading users...</div>
        ) : (
          <>
            <div className="table-responsive">
              <table className="table table-striped table-hover">
                <thead>
                  <tr>
                    {(['lastName', 'firstName', 'email'] as const).map(col => (
                      <th
                        key={col}
                        style={{ cursor: 'pointer', userSelect: 'none' }}
                        onClick={() => handleSort(col)}
                      >
                        {col === 'lastName'
                          ? 'Family Name'
                          : col === 'firstName'
                          ? 'Given Name'
                          : 'Email'}{' '}
                        <span className="text-muted">
                          {sort.column === col
                            ? sort.ascending
                              ? '▼'
                              : '▲'
                            : ''}
                        </span>
                      </th>
                    ))}
                    <th style={{ width: '120px', textAlign: 'center' }}>
                      Admin
                    </th>
                    <th
                      style={{ cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleSort('suspended')}
                    >
                      Suspended{' '}
                      <span className="text-muted">
                        {sort.column === 'suspended'
                          ? sort.ascending
                            ? '▼'
                            : '▲'
                          : ''}
                      </span>
                    </th>
                    <th
                      style={{ cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleSort('signUpDate')}
                    >
                      Sign Up{' '}
                      <span className="text-muted">
                        {sort.column === 'signUpDate'
                          ? sort.ascending
                            ? '▼'
                            : '▲'
                          : ''}
                      </span>
                    </th>
                    <th
                      style={{ cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleSort('lastLoggedIn')}
                    >
                      Last Login{' '}
                      <span className="text-muted">
                        {sort.column === 'lastLoggedIn'
                          ? sort.ascending
                            ? '▼'
                            : '▲'
                          : ''}
                      </span>
                    </th>
                    <th
                      style={{ cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleSort('lastActive')}
                    >
                      Last Active{' '}
                      <span className="text-muted">
                        {sort.column === 'lastActive'
                          ? sort.ascending
                            ? '▼'
                            : '▲'
                          : ''}
                      </span>
                    </th>
                    <th
                      style={{ cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleSort('loginCount')}
                    >
                      Logins{' '}
                      <span className="text-muted">
                        {sort.column === 'loginCount'
                          ? sort.ascending
                            ? '▼'
                            : '▲'
                          : ''}
                      </span>
                    </th>
                    <th
                      style={{ cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleSort('lastLoginIp')}
                    >
                      Last IP{' '}
                      <span className="text-muted">
                        {sort.column === 'lastLoginIp'
                          ? sort.ascending
                            ? '▼'
                            : '▲'
                          : ''}
                      </span>
                    </th>
                    <th style={{ width: '100px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id}>
                      <td>{u.lastName}</td>
                      <td>{u.firstName}</td>
                      <td>{u.email}</td>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={u.isAdmin}
                          onChange={() => handleAdminToggle(u)}
                          disabled={updatingAdminId === u.id}
                          style={{ cursor: 'pointer', transform: 'scale(1.2)' }}
                        />
                      </td>
                      <td>
                        <span
                          className={u.suspended ? 'text-danger' : 'text-muted'}
                        >
                          {u.suspended ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td>{formatDate(u.signUpDate)}</td>
                      <td>{formatDate(u.lastLoggedIn)}</td>
                      <td>{formatDate(u.lastActive)}</td>
                      <td>{u.loginCount ?? 0}</td>
                      <td>{u.lastLoginIp || '-'}</td>
                      <td>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDelete(u)}
                          disabled={deletingUserId === u.id}
                        >
                          {deletingUserId === u.id ? (
                            <>
                              <span
                                className="spinner-border spinner-border-sm"
                                role="status"
                                aria-hidden="true"
                                style={{ marginRight: '5px' }}
                              />
                              Deleting...
                            </>
                          ) : (
                            'Delete'
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {users.length === 0 && (
              <div className="text-muted">No users found.</div>
            )}

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button
                  className="btn btn-default btn-sm"
                  onClick={() => goToPage(page - 1)}
                  disabled={page <= 1}
                >
                  Previous
                </button>
                <span className="text-muted">
                  Page {page} / {totalPages} (Total {total})
                </span>
                <button
                  className="btn btn-default btn-sm"
                  onClick={() => goToPage(page + 1)}
                  disabled={page >= totalPages}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const container = document.getElementById('user-activate-register-container')
if (container) {
  const root = createRoot(container)
  root.render(
    <>
      <UserActivateRegister />
      <UserList />
    </>
  )
}
