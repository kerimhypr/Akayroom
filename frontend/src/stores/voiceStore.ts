import { create } from 'zustand'
import type { Participant, ConnectionStatus } from '@/types/database'

type VoiceState = {
  status: ConnectionStatus
  roomId: string | null
  channelName: string | null
  participants: Map<string, Participant>
  localPeerId: string | null
  isMuted: boolean
  isDeafened: boolean
  isCameraOn: boolean
  isScreenSharing: boolean
  error: string | null
  setStatus: (s: ConnectionStatus) => void
  setRoom: (roomId: string | null, channelName?: string | null) => void
  setLocalPeerId: (id: string | null) => void
  addParticipant: (p: Participant) => void
  removeParticipant: (peerId: string) => void
  updateParticipant: (peerId: string, patch: Partial<Participant>) => void
  setMuted: (v: boolean) => void
  setDeafened: (v: boolean) => void
  setCamera: (v: boolean) => void
  setScreen: (v: boolean) => void
  setError: (e: string | null) => void
  reset: () => void
}

export const useVoiceStore = create<VoiceState>((set) => ({
  status: 'disconnected',
  roomId: null,
  channelName: null,
  participants: new Map(),
  localPeerId: null,
  isMuted: false,
  isDeafened: false,
  isCameraOn: false,
  isScreenSharing: false,
  error: null,
  setStatus: (status) => set({ status }),
  setRoom: (roomId, channelName=null) => set({ roomId, channelName }),
  setLocalPeerId: (id) => set({ localPeerId: id }),
  addParticipant: (p) => set(s => {
    const m = new Map(s.participants)
    m.set(p.peerId, p)
    return { participants: m }
  }),
  removeParticipant: (peerId) => set(s => {
    const m = new Map(s.participants)
    m.delete(peerId)
    return { participants: m }
  }),
  updateParticipant: (peerId, patch) => set(s => {
    const m = new Map(s.participants)
    const existing = m.get(peerId)
    if (existing) m.set(peerId, { ...existing, ...patch, mediaState: { ...existing.mediaState, ...(patch.mediaState||{}) } })
    return { participants: m }
  }),
  setMuted: (v) => set({ isMuted: v }),
  setDeafened: (v) => set({ isDeafened: v }),
  setCamera: (v) => set({ isCameraOn: v }),
  setScreen: (v) => set({ isScreenSharing: v }),
  setError: (e) => set({ error: e }),
  reset: () => set({ status: 'disconnected', roomId: null, channelName: null, participants: new Map(), localPeerId: null, isMuted:false, isDeafened:false, isCameraOn:false, isScreenSharing:false, error:null }),
}))
