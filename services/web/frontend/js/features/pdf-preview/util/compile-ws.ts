import { CompileResponseData } from '@ol-types/compile'
import { debugConsole } from '@/utils/debugging'

const COMPILE_WS_PATH = '/compile-ws'
const COMPILE_WS_TIMEOUT_MS = 10 * 60 * 1000
const COMPILE_WS_RECONNECT_DELAY_MS = 1000
const COMPILE_WS_CONNECT_TIMEOUT_MS = 5000

type PendingEntry = {
  promise: Promise<CompileResponseData>
  resolve: (data: CompileResponseData) => void
  reject: (error: Error) => void
  timeoutId: number
}

class CompileWsClient {
  projectId: string
  socket: WebSocket | null
  pending: Map<string, PendingEntry>
  reconnectTimer: number | null

  constructor(projectId: string) {
    this.projectId = projectId
    this.socket = null
    this.pending = new Map()
    this.reconnectTimer = null
  }

  createWaiter(compileId: string, timeoutMs = COMPILE_WS_TIMEOUT_MS) {
    const existing = this.pending.get(compileId)
    if (existing) {
      return {
        promise: existing.promise,
        cancel: () => this.cancelWait(compileId),
      }
    }

    this.ensureConnected()

    let resolve: (data: CompileResponseData) => void = () => {}
    let reject: (error: Error) => void = () => {}

    const promise = new Promise<CompileResponseData>(
      (innerResolve, innerReject) => {
        resolve = innerResolve
        reject = innerReject
      }
    )

    const timeoutId = window.setTimeout(() => {
      this.pending.delete(compileId)
      reject(new Error('compile websocket timeout'))
    }, timeoutMs)

    this.pending.set(compileId, { promise, resolve, reject, timeoutId })

    return { promise, cancel: () => this.cancelWait(compileId) }
  }

  async sendCompile(payload: {
    type: 'compile'
    projectId: string
    compileId: string
    body: Record<string, unknown>
    query: Record<string, unknown>
    referer?: string
  }) {
    if (!this.ensureConnected()) {
      return false
    }

    await this.waitForOpen()

    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('compile websocket not connected')
    }

    this.socket.send(JSON.stringify(payload))
    return true
  }

  cancelWait(compileId: string) {
    const pending = this.pending.get(compileId)
    if (!pending) return
    window.clearTimeout(pending.timeoutId)
    this.pending.delete(compileId)
  }

  private ensureConnected() {
    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN ||
        this.socket.readyState === WebSocket.CONNECTING)
    ) {
      return true
    }

    if (typeof WebSocket === 'undefined') {
      debugConsole.warn('compile websocket unavailable: missing WebSocket')
      return false
    }

    if (typeof WebSocket.prototype.addEventListener !== 'function') {
      debugConsole.warn('compile websocket unavailable: missing addEventListener')
      return false
    }

    const wsUrl = this.getWebsocketUrl()
    const ws = new WebSocket(wsUrl)
    ws.addEventListener('message', this.handleMessage)
    ws.addEventListener('close', this.handleClose)
    ws.addEventListener('error', this.handleError)
    this.socket = ws
    return true
  }

  private waitForOpen(timeoutMs = COMPILE_WS_CONNECT_TIMEOUT_MS) {
    if (!this.socket) {
      return Promise.reject(new Error('compile websocket unavailable'))
    }

    if (this.socket.readyState === WebSocket.OPEN) {
      return Promise.resolve()
    }

    return new Promise<void>((resolve, reject) => {
      const socket = this.socket
      const handleOpen = () => {
        cleanup()
        resolve()
      }
      const handleClose = () => {
        cleanup()
        reject(new Error('compile websocket closed'))
      }
      const timeoutId = window.setTimeout(() => {
        cleanup()
        reject(new Error('compile websocket connect timeout'))
      }, timeoutMs)
      const cleanup = () => {
        window.clearTimeout(timeoutId)
        socket.removeEventListener('open', handleOpen)
        socket.removeEventListener('close', handleClose)
      }

      socket.addEventListener('open', handleOpen)
      socket.addEventListener('close', handleClose)
    })
  }

  private getWebsocketUrl() {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    return `${protocol}://${window.location.host}${COMPILE_WS_PATH}?projectId=${encodeURIComponent(
      this.projectId
    )}`
  }

  private handleMessage = (event: MessageEvent) => {
    if (typeof event.data !== 'string') return
    let payload
    try {
      payload = JSON.parse(event.data)
    } catch (err) {
      debugConsole.warn('compile websocket payload parse error', err)
      return
    }

    if (payload?.type === 'heartbeat') return
    if (payload.projectId !== this.projectId) return

    const compileId = payload.compileId
    if (!compileId) return

    if (payload.type === 'compile-error') {
      const pending = this.pending.get(compileId)
      if (!pending) return
      window.clearTimeout(pending.timeoutId)
      this.pending.delete(compileId)
      const err: any = new Error(payload.message || 'compile websocket error')
      if (payload.statusCode) {
        err.info = { statusCode: payload.statusCode }
      }
      pending.reject(err)
      return
    }

    if (payload.type !== 'compile-result') return

    const pending = this.pending.get(compileId)
    if (!pending) return
    window.clearTimeout(pending.timeoutId)
    this.pending.delete(compileId)

    if (!payload.result) {
      pending.reject(new Error('compile websocket result missing'))
      return
    }
    pending.resolve(payload.result)
  }

  private handleClose = () => {
    this.socket = null
    if (this.pending.size > 0) {
      this.scheduleReconnect()
    }
  }

  private handleError = () => {
    if (this.pending.size > 0) {
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer !== null) return
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null
      this.ensureConnected()
    }, COMPILE_WS_RECONNECT_DELAY_MS)
  }
}

const clients = new Map<string, CompileWsClient>()

export function getCompileWsClient(projectId: string) {
  let client = clients.get(projectId)
  if (!client) {
    client = new CompileWsClient(projectId)
    clients.set(projectId, client)
  }
  return client
}
