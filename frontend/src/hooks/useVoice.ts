import { useEffect, useRef, useState, useCallback } from 'react'
import { SignalingClient } from '@/lib/signaling/SignalingClient'
import { WebRTCManager } from '@/lib/webrtc/WebRTCManager'
import { useVoiceStore } from '@/stores/voiceStore'
import { useAuthStore } from '@/stores/authStore'
import { getAccessToken } from '@/lib/supabase/client'
import type { Participant } from '@/types/database'

const SIGNALING_URL = import.meta.env.VITE_SIGNALING_URL as string ?? 'ws://localhost:3001/ws'

export function useVoice() {
  const signalingRef = useRef<SignalingClient | null>(null)
  const webrtcRef = useRef<WebRTCManager | null>(null)
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map())
  const videoTrackIdRef = useRef<string | null>(null)
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map())
  const voice = useVoiceStore()
  const { profile } = useAuthStore()

  const ensureClient = useCallback(async () => {
    if (signalingRef.current) return signalingRef.current
    const token = await getAccessToken()
    // Fallback to dev token if no supabase token? We'll try supabase first, then dev via HTTP
    let effectiveToken = token
    // If no token, use dev:username fallback (allowed when AUTH_MODE=dev-bypass)
    if (!effectiveToken && profile) effectiveToken = `dev:${profile.id}`

    const client = new SignalingClient({
      wsUrl: SIGNALING_URL,
      token: effectiveToken,
      displayName: profile?.display_name || profile?.username || 'User',
      autoReconnect: true,
    })
    // wire events
    client.on('connection:status', ({ status }: any) => voice.setStatus(status))
    client.on('auth:failed', (p:any) => voice.setError(p.error?.message ?? 'Auth failed'))
    client.on('peer:joined', ({ peer }: any) => {
      const participant: Participant = {
        peerId: peer.peerId,
        userId: peer.userId,
        displayName: peer.displayName,
        avatarUrl: undefined,
        mediaState: peer.mediaState ?? { micMuted:false, camEnabled:false, screenEnabled:false, audioEnabled:true, videoEnabled:false },
        tracks: peer.tracks ?? [],
        joinedAt: peer.joinedAt ?? Date.now(),
      }
      voice.addParticipant(participant)
      // create offer to new peer
      webrtcRef.current?.createOffer(peer.peerId).catch(()=>{})
    })
    client.on('peer:left', ({ peerId }: any) => {
      voice.removeParticipant(peerId)
      setRemoteStreams(prev=> {
        const m = new Map(prev)
        m.delete(peerId)
        return m
      })
      webrtcRef.current?.removePeer(peerId)
    })
    client.on('peer:state', ({ peerId, mediaState }: any) => {
      voice.updateParticipant(peerId, { mediaState })
    })
    client.on('media:track-added', ({ track, peerId }: any) => {
      if (peerId) voice.updateParticipant(peerId, { mediaState: { ...voice.participants.get(peerId)?.mediaState, [track.kind==='audio' ? 'micMuted' : track.kind==='video' ? 'camEnabled' : 'screenEnabled']: false } as any })
    })
    client.on('screen:track-added', ({ peerId }: any) => {
      voice.updateParticipant(peerId, { mediaState: { screenEnabled: true } as any })
    })
    client.on('screen:track-removed', ({ peerId }: any) => {
      voice.updateParticipant(peerId, { mediaState: { screenEnabled: false } as any })
    })
    client.on('media:track-updated', ({ peerId, kind, muted }: any) => {
      const patch: any = {}
      if (kind==='audio') patch.micMuted = muted
      if (kind==='video') patch.camEnabled = !muted
      voice.updateParticipant(peerId, { mediaState: patch })
    })

    signalingRef.current = client
    const webrtc = new WebRTCManager({ signaling: client })
    webrtc.onRemoteStream = (peerId, stream) => {
      setRemoteStreams(prev=> new Map(prev).set(peerId, stream))
      // create audio element to play
      let el = audioElementsRef.current.get(peerId)
      if (!el) {
        el = document.createElement('audio')
        el.autoplay = true
        // el.playsInline not needed for audio
        document.body.appendChild(el)
        audioElementsRef.current.set(peerId, el)
      }
      el.srcObject = stream
      el.muted = voice.isDeafened
      el.play().catch(()=>{})
    }
    webrtc.onRemoteTrackRemoved = (peerId) => {
      const el = audioElementsRef.current.get(peerId)
      if (el) { el.srcObject = null; el.remove(); audioElementsRef.current.delete(peerId) }
      setRemoteStreams(prev=> { const m=new Map(prev); m.delete(peerId); return m })
    }
    webrtc.onConnectionState = (peerId, state) => {
      voice.updateParticipant(peerId, { connectionState: state } as any)
    }
    webrtc.onSpeakingChange = (peerId, speaking) => {
      voice.updateParticipant(peerId, { mediaState: { speaking } as any })
    }
    webrtcRef.current = webrtc

    // listen for leave event from UI
    const leaveHandler = () => leaveVoice()
    window.addEventListener('akay:leave-voice', leaveHandler)

    return client
  }, [profile, voice])

  const joinVoice = useCallback(async (roomId: string, channelName: string) => {
    try {
      voice.setStatus('connecting')
      voice.setRoom(roomId, channelName)
      voice.setError(null)

      const client = await ensureClient()
      if (client.ws?.readyState !== WebSocket.OPEN) {
        await client.connect()
      }
      // authenticate (try supabase token, fallback to dev token endpoint if fails)
      const token = await getAccessToken()
      try {
        if (token) await client.authenticate(token)
        else if (profile) await client.authenticate(`dev:${profile.id}`)
      } catch (e:any) {
        // if auth failed due to invalid token, try dev token via HTTP
        if (e?.error?.code === 'AUTH_TOKEN_INVALID' && profile) {
          try {
            const res = await fetch(`${SIGNALING_URL.replace('ws://','http://').replace('wss://','https://').replace('/ws','')}/auth/dev-token`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: profile.id, displayName: profile.display_name || profile.username })
            })
            const j = await res.json()
            if (j.success) await client.authenticate(j.data.token)
            else await client.authenticate(`dev:${profile.id}`)
          } catch {
            await client.authenticate(`dev:${profile.id}`)
          }
        } else throw e
      }

      // request mic permission
      let stream: MediaStream | null = null
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      } catch (e:any) {
        voice.setError(e?.message?.includes('Permission') ? 'Mikrofon izni reddedildi' : 'Mikrofon erişilemedi: ' + (e.message ?? ''))
        throw e
      }

      const res = await client.joinRoom(roomId)
      const data = res.data
      voice.setLocalPeerId(data.peerId)
      voice.setStatus('connected')

      // add self as participant
      voice.addParticipant({
        peerId: data.peerId,
        userId: client.userId!,
        displayName: client.displayName ?? profile?.display_name ?? 'You',
        avatarUrl: profile?.avatar_url ?? undefined,
        mediaState: { micMuted: false, camEnabled: false, screenEnabled: false, audioEnabled: true, videoEnabled: false },
        tracks: [],
        joinedAt: Date.now(),
        isLocal: true,
      })

      // setup webrtc
      webrtcRef.current?.setRoom(roomId, data.peerId)
      await webrtcRef.current?.setLocalStream(stream)
      // publish audio via signaling
      await client.publish(roomId, 'audio').catch(()=>{})
      // add existing participants and connect
      const existing: any[] = data.participants ?? []
      for (const p of existing) {
        voice.addParticipant({
          peerId: p.peerId,
          userId: p.userId,
          displayName: p.displayName,
          avatarUrl: undefined,
          mediaState: p.mediaState,
          tracks: p.tracks ?? [],
          joinedAt: p.joinedAt,
        })
      }
      // subscribe to existing tracks
      for (const t of data.sfu?.tracks ?? []) {
        await client.subscribe(roomId, t.trackId).catch(()=>{})
      }
      // create offers to existing peers
      await webrtcRef.current?.connectToPeers(existing.map(p=> p.peerId))

      // handle mute state sync
      await client.setMediaState(roomId, { audio: true, micMuted: false }).catch(()=>{})

    } catch (e:any) {
      console.error('joinVoice failed', e)
      const msg = e?.error?.message ?? e?.message ?? 'Voice join failed'
      voice.setError(msg)
      voice.setStatus('failed')
      // map to user friendly
      if (msg.includes('ROOM_FULL')) voice.setError('Oda dolu')
      else if (msg.includes('AUTH')) voice.setError('Kimlik doğrulama hatası')
      else if (!voice.error) voice.setError(msg)
    }
  }, [ensureClient, profile, voice])

  const leaveVoice = useCallback(async () => {
    const client = signalingRef.current
    const roomId = voice.roomId
    try {
      if (client && roomId) {
        await client.leaveRoom(roomId).catch(()=>{})
        // unpublish if needed
      }
    } finally {
      webrtcRef.current?.cleanup()
      // remove audio elements
      for (const el of audioElementsRef.current.values()) { try { el.srcObject=null; el.remove()} catch{} }
      audioElementsRef.current.clear()
      setRemoteStreams(new Map())
      voice.reset()
      signalingRef.current?.disconnect()
      signalingRef.current = null
      webrtcRef.current = null
    }
  }, [voice])

  const toggleMute = useCallback(async () => {
    const next = !voice.isMuted
    voice.setMuted(next)
    webrtcRef.current?.toggleMute(next)
    const client = signalingRef.current
    if (client && voice.roomId) {
      await client.mute(voice.roomId, 'audio', next).catch(()=>{})
    }
    // also update local participant
    if (voice.localPeerId) voice.updateParticipant(voice.localPeerId, { mediaState: { micMuted: next } as any })
  }, [voice])

  const toggleDeafen = useCallback(() => {
    const next = !voice.isDeafened
    voice.setDeafened(next)
    for (const el of audioElementsRef.current.values()) el.muted = next
    if (voice.localPeerId) voice.updateParticipant(voice.localPeerId, { mediaState: { deafen: next } as any })
  }, [voice])

  const toggleCamera = useCallback(async () => {
    const next = !voice.isCameraOn
    try {
      if (next) {
        const camStream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } })
        // add video track to existing local stream
        const local = webrtcRef.current?.getLocalStream()
        if (local) {
          for (const t of camStream.getVideoTracks()) local.addTrack(t)
        } else {
          await webrtcRef.current?.setLocalStream(camStream)
        }
        // publish video and store trackId for correct unpublish
        try {
          const res: any = await signalingRef.current?.publish(voice.roomId, 'video')
          videoTrackIdRef.current = res?.data?.track?.trackId ?? res?.track?.trackId ?? null
        } catch {}
        voice.setCamera(true)
        if (voice.localPeerId) voice.updateParticipant(voice.localPeerId, { mediaState: { camEnabled: true, videoEnabled: true } as any })
        // renegotiate
        for (const pid of webrtcRef.current?.getPeerIds() ?? []) await webrtcRef.current?.createOffer(pid).catch(()=>{})
      } else {
        // stop video tracks
        const local = webrtcRef.current?.getLocalStream()
        if (local) {
          for (const t of local.getVideoTracks()) { t.stop(); try { local.removeTrack(t) } catch {} }
        }
        const tid = videoTrackIdRef.current
        if (tid) {
          await signalingRef.current?.unpublish(voice.roomId, tid).catch(()=>{})
          videoTrackIdRef.current = null
        } else {
          await signalingRef.current?.mute(voice.roomId, 'video', true).catch(()=>{})
        }
        voice.setCamera(false)
        if (voice.localPeerId) voice.updateParticipant(voice.localPeerId, { mediaState: { camEnabled: false, videoEnabled: false } as any })
        for (const pid of webrtcRef.current?.getPeerIds() ?? []) await webrtcRef.current?.createOffer(pid).catch(()=>{})
      }
    } catch (e:any) {
      voice.setError(e.message?.includes('Permission') ? 'Kamera izni reddedildi' : 'Kamera hatası: ' + e.message)
    }
  }, [voice])

  const startScreenShare = useCallback(async () => {
    try {
      const stream = await webrtcRef.current?.getDisplayMedia()
      if (!stream) throw new Error('Ekran paylaşımı reddedildi')
      await signalingRef.current?.startScreen(voice.roomId).catch(()=>{})
      voice.setScreen(true)
      if (voice.localPeerId) voice.updateParticipant(voice.localPeerId, { mediaState: { screenEnabled: true } as any })
      // handle track ended
      stream?.getVideoTracks()[0]?.addEventListener('ended', async () => {
        await stopScreenShare()
      })
    } catch (e:any) {
      if (e.name === 'NotAllowedError') voice.setError('Ekran paylaşımı reddedildi')
      else voice.setError('Ekran paylaşımı hatası: ' + e.message)
    }
  }, [voice])

  const stopScreenShare = useCallback(async () => {
    await webrtcRef.current?.stopScreenShare()
    await signalingRef.current?.stopScreen(voice.roomId).catch(()=>{})
    voice.setScreen(false)
    if (voice.localPeerId) voice.updateParticipant(voice.localPeerId, { mediaState: { screenEnabled: false } as any })
  }, [voice])

  // cleanup on unmount
  useEffect(() => {
    return () => {
      // don't auto leave? Keep connection if navigating? We'll keep for now
    }
  }, [])

  return {
    joinVoice,
    leaveVoice,
    toggleMute,
    toggleDeafen,
    toggleCamera,
    startScreenShare,
    stopScreenShare,
    remoteStreams,
    signaling: signalingRef.current,
    webrtc: webrtcRef.current,
  }
}
