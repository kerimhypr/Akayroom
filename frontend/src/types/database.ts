export type Profile = {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  status: 'online' | 'idle' | 'dnd' | 'offline'
  bio: string | null
  created_at: string
  updated_at: string
}

export type Server = {
  id: string
  name: string
  description: string | null
  owner_id: string
  icon_url: string | null
  invite_code: string
  created_at: string
  updated_at: string
}

export type ServerMember = {
  id: string
  server_id: string
  user_id: string
  role: 'owner' | 'admin' | 'moderator' | 'member'
  joined_at: string
  profile?: Profile
}

export type Channel = {
  id: string
  server_id: string
  name: string
  type: 'text' | 'voice' | 'announcement'
  topic: string | null
  position: number
  created_at: string
  created_by: string | null
}

export type Message = {
  id: string
  channel_id: string
  server_id: string
  user_id: string
  content: string
  reply_to: string | null
  edited: boolean
  deleted: boolean
  created_at: string
  updated_at: string
  profile?: Profile
  reply_profile?: Profile
}

export type FriendRequest = {
  id: string
  sender_id: string
  receiver_id: string
  status: 'pending' | 'accepted' | 'rejected' | 'blocked' | 'cancelled'
  created_at: string
  updated_at: string
  sender?: Profile
  receiver?: Profile
}

export type Friendship = {
  id: string
  user_id: string
  friend_id: string
  created_at: string
  friend?: Profile
}

export type Notification = {
  id: string
  user_id: string
  type: 'friend_request' | 'friend_accepted' | 'server_invite' | 'mention' | 'system'
  title: string
  body: string | null
  data: Record<string, unknown> | null
  read: boolean
  created_at: string
}

// Voice / WebRTC types (client-side)
export type ParticipantMediaState = {
  micMuted: boolean
  camEnabled: boolean
  screenEnabled: boolean
  audioEnabled: boolean
  videoEnabled: boolean
  speaking?: boolean
  deafen?: boolean
}

export type Participant = {
  peerId: string
  userId: string
  displayName: string
  avatarUrl?: string
  mediaState: ParticipantMediaState
  tracks: { trackId: string; kind: 'audio' | 'video' | 'screenshare'; muted: boolean }[]
  joinedAt: number
  connectionState?: RTCPeerConnectionState
  isLocal?: boolean
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'failed'
