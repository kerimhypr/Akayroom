/**
 * SignalingClient — Agent A WebSocket + Supabase JWT entegrasyonu
 * Kontrat: realtime-signaling/AGENT_A_STATUS.md (event isimleri/payloadlar birebir)
 * Bu sınıf UI componentlerini doğrudan WS eventlerinden soyutlar.
 */
export type SignalingEvent = string
export type Listener = (payload: any, raw?: any) => void

type Pending = { resolve: (v:any)=>void; reject:(e:any)=>void; timeout: number }

export type SignalingOptions = {
  wsUrl: string
  token?: string | null
  displayName?: string | null
  autoReconnect?: boolean
  reconnectDelayMs?: number
  maxReconnectAttempts?: number
}

export class SignalingClient {
  wsUrl: string
  token: string | null
  displayName: string | null
  autoReconnect: boolean
  reconnectDelayMs: number
  maxReconnectAttempts: number

  ws: WebSocket | null = null
  sessionId: string | null = null
  userId: string | null = null
  peerId: string | null = null
  currentRoomId: string | null = null
  private _requestId = 0
  private _pending = new Map<string, Pending>()
  private _listeners = new Map<string, Set<Listener>>()
  private _reconnectAttempts = 0
  private _shouldClose = false
  private _isAuthenticated = false
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'failed' = 'disconnected'

  constructor(opts: SignalingOptions) {
    this.wsUrl = opts.wsUrl
    this.token = opts.token ?? null
    this.displayName = opts.displayName ?? null
    this.autoReconnect = opts.autoReconnect ?? true
    this.reconnectDelayMs = opts.reconnectDelayMs ?? 2000
    this.maxReconnectAttempts = opts.maxReconnectAttempts ?? 10
  }

  on(event: string, fn: Listener) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set())
    this._listeners.get(event)!.add(fn)
    return () => this.off(event, fn)
  }
  off(event: string, fn: Listener) {
    this._listeners.get(event)?.delete(fn)
  }
  once(event: string, fn: Listener) {
    const wrapper = (p:any, raw?:any) => { this.off(event, wrapper); fn(p, raw) }
    this.on(event, wrapper)
  }
  private _emit(event: string, payload: any, raw?: any) {
    const set = this._listeners.get(event)
    if (set) for (const fn of [...set]) try { fn(payload, raw) } catch {}
    const wild = this._listeners.get('*')
    if (wild) for (const fn of [...wild]) try { (fn as any)(event, payload, raw) } catch {}
  }

  setToken(token: string | null) { this.token = token }

  connect(): Promise<any> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return Promise.resolve({})
    this._shouldClose = false
    this.connectionStatus = 'connecting'
    this._emit('connection:status', { status: this.connectionStatus })

    return new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket(this.wsUrl)
        this.ws = ws
        let resolvedInit = false

        const onMessageInit = (ev: MessageEvent) => {
          try {
            const data = JSON.parse(ev.data)
            if (data.event === 'connection:init') {
              this.sessionId = data.payload?.sessionId ?? null
              this._emit('connection:init', data.payload, data)
              if (!resolvedInit) {
                resolvedInit = true
                ws.removeEventListener('message', onMessageInit)
                resolve(data.payload)
              }
            }
          } catch {}
        }
        ws.addEventListener('message', onMessageInit)

        ws.addEventListener('open', () => {
          this._reconnectAttempts = 0
          this.connectionStatus = 'connected'
          this._emit('open', {})
          this._emit('connection:status', { status: this.connectionStatus })
        })

        ws.addEventListener('message', (ev: MessageEvent) => {
          let data: any
          try { data = JSON.parse(ev.data) } catch { return }
          const { event, payload, requestId } = data
          if (requestId && this._pending.has(requestId)) {
            const { resolve: res, reject: rej, timeout } = this._pending.get(requestId)!
            clearTimeout(timeout)
            this._pending.delete(requestId)
            if (payload && payload.success === false) rej(payload)
            else res(payload)
          }
          if (event === 'auth:success') {
            this._isAuthenticated = true
            this.userId = payload?.data?.userId ?? payload?.userId ?? this.userId
            this.peerId = payload?.data?.peerId ?? this.peerId
            this.displayName = payload?.data?.displayName ?? this.displayName
          }
          if (event === 'room:joined') {
            this.currentRoomId = payload?.data?.roomId ?? payload?.roomId ?? this.currentRoomId
            this.peerId = payload?.data?.peerId ?? this.peerId
          }
          if (event === 'room:left') {
            if (payload?.data?.roomId === this.currentRoomId) this.currentRoomId = null
          }
          this._emit(event, payload, data)
        })

        ws.addEventListener('close', (ev: CloseEvent) => {
          this._emit('close', { code: ev.code, reason: ev.reason })
          this.connectionStatus = this._shouldClose ? 'disconnected' : 'reconnecting'
          this._emit('connection:status', { status: this.connectionStatus })
          for (const [, { reject: rej, timeout }] of this._pending.entries()) {
            clearTimeout(timeout)
            rej({ success: false, error: { code: 'CONNECTION_CLOSE', message: 'WebSocket closed' } })
          }
          this._pending.clear()
          if (!this._shouldClose && this.autoReconnect && this._reconnectAttempts < this.maxReconnectAttempts) {
            this._reconnectAttempts++
            const delay = this.reconnectDelayMs * Math.pow(1.5, this._reconnectAttempts - 1)
            this._emit('reconnecting', { attempt: this._reconnectAttempts, delayMs: delay })
            this.connectionStatus = 'reconnecting'
            this._emit('connection:status', { status: this.connectionStatus })
            setTimeout(() => {
              this.connect().then(() => {
                if (this.token) this.authenticate(this.token!).catch(()=>{})
              }).catch(()=>{})
            }, delay)
          } else if (this._shouldClose) {
            this.connectionStatus = 'disconnected'
            this._emit('connection:status', { status: this.connectionStatus })
          }
        })

        ws.addEventListener('error', (err) => {
          this._emit('error', err)
          if (ws.readyState !== WebSocket.OPEN && !resolvedInit) {
            // don't immediately reject if we already resolved init via message
            setTimeout(() => {
              if (!resolvedInit) {
                ws.removeEventListener('message', onMessageInit)
                reject(err)
              }
            }, 100)
          }
        })

        setTimeout(() => {
          if (!resolvedInit && ws.readyState === WebSocket.OPEN) {
            ws.removeEventListener('message', onMessageInit)
            resolve({})
          }
        }, 5000)
      } catch (e) { reject(e) }
    })
  }

  disconnect() {
    this._shouldClose = true
    this.connectionStatus = 'disconnected'
    this._emit('connection:status', { status: this.connectionStatus })
    if (this.ws) try { this.ws.close(1000, 'client disconnect') } catch {}
    this.ws = null
    this._isAuthenticated = false
  }

  private _send(event: string, payload: any, timeoutMs = 8000): Promise<any> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject({ success: false, error: { code: 'NOT_CONNECTED', message: 'WebSocket not connected' } })
    }
    const requestId = `req_${++this._requestId}_${Date.now()}`
    const msg = JSON.stringify({ event, payload: payload || {}, requestId })
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this._pending.delete(requestId)
        reject({ success: false, error: { code: 'TIMEOUT', message: `Timeout for ${event}` } })
      }, timeoutMs)
      this._pending.set(requestId, { resolve, reject, timeout })
      try { this.ws!.send(msg) } catch (e:any) {
        clearTimeout(timeout)
        this._pending.delete(requestId)
        reject({ success: false, error: { code: 'SEND_FAILED', message: e.message } })
      }
    })
  }

  authenticate(token?: string, displayName?: string): Promise<any> {
    if (token) this.token = token
    if (displayName) this.displayName = displayName
    return this._send('auth:authenticate', { token: this.token, displayName: this.displayName }).then((payload) => {
      if (payload && payload.success === false) throw payload
      const d = payload?.data ?? payload
      this.userId = d?.userId ?? this.userId
      this.sessionId = d?.sessionId ?? this.sessionId
      this._isAuthenticated = true
      return payload
    })
  }

  joinRoom(roomId: string, opts: { displayName?: string } = {}): Promise<any> {
    return this._send('room:join', { roomId, displayName: opts.displayName ?? this.displayName }).then((payload) => {
      if (payload && payload.success === false) throw payload
      const d = payload?.data ?? payload
      this.currentRoomId = d?.roomId ?? roomId
      this.peerId = d?.peerId ?? this.peerId
      return payload
    })
  }
  leaveRoom(roomId?: string): Promise<any> {
    const rid = roomId ?? this.currentRoomId
    if (!rid) return Promise.reject({ success: false, error: { code: 'NO_ROOM', message: 'No room to leave' } })
    return this._send('room:leave', { roomId: rid })
  }
  listRooms() { return this._send('room:list', {}) }

  // WebRTC routing (routed via server SFU/mesh)
  sendOffer(roomId: string | null, sdp: string, targetPeerId?: string) {
    return this._send('webrtc:offer', { roomId: roomId ?? this.currentRoomId, sdp, targetPeerId })
  }
  sendAnswer(roomId: string | null, sdp: string, targetPeerId?: string) {
    return this._send('webrtc:answer', { roomId: roomId ?? this.currentRoomId, sdp, targetPeerId })
  }
  sendIceCandidate(roomId: string | null, candidate: string, sdpMid?: string | null, sdpMLineIndex?: number | null, targetPeerId?: string) {
    return this._send('webrtc:ice-candidate', { roomId: roomId ?? this.currentRoomId, candidate, sdpMid, sdpMLineIndex, targetPeerId })
  }
  renegotiate(roomId: string | null, reason?: string) {
    return this._send('webrtc:renegotiate', { roomId: roomId ?? this.currentRoomId, reason })
  }

  // Media lifecycle (SFU)
  publish(roomId: string | null, kind: 'audio'|'video'|'screenshare', opts: { trackId?: string; simulcast?: boolean; codec?: string } = {}) {
    return this._send('media:publish', { roomId: roomId ?? this.currentRoomId, kind, trackId: opts.trackId, simulcast: opts.simulcast, codec: opts.codec })
  }
  unpublish(roomId: string | null, trackId: string) {
    return this._send('media:unpublish', { roomId: roomId ?? this.currentRoomId, trackId })
  }
  mute(roomId: string | null, kind?: 'audio'|'video'|'screenshare', muted = true, trackId?: string) {
    return this._send('media:mute', { roomId: roomId ?? this.currentRoomId, kind, muted, trackId })
  }
  unmute(roomId: string | null, kind?: string, trackId?: string) {
    return this._send('media:unmute', { roomId: roomId ?? this.currentRoomId, kind, trackId })
  }
  setMediaState(roomId: string | null, patch: Record<string, any>) {
    return this._send('media:state', { roomId: roomId ?? this.currentRoomId, ...patch })
  }
  subscribe(roomId: string | null, trackId?: string) {
    return this._send('media:subscribe', { roomId: roomId ?? this.currentRoomId, trackId })
  }

  startScreen(roomId: string | null, trackId?: string) {
    return this._send('screen:start', { roomId: roomId ?? this.currentRoomId, trackId })
  }
  stopScreen(roomId: string | null, trackId?: string) {
    return this._send('screen:stop', { roomId: roomId ?? this.currentRoomId, trackId })
  }

  ping() { return this._send('ping', {}) }

  get isAuthenticated() { return this._isAuthenticated }
}
