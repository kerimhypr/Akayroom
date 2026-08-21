import { useState, useEffect } from 'react'
import { ServerSidebar } from './ServerSidebar'
import { ChannelSidebar } from './ChannelSidebar'
import { CreateServerModal, JoinServerModal, CreateChannelModal } from '@/components/server/ServerModals'
import { useServerStore } from '@/stores/serverStore'
import { useMessageStore } from '@/stores/messageStore'
import { MessageList } from '@/components/chat/MessageList'
import { MessageInput } from '@/components/chat/MessageInput'
import { FriendsPanel } from '@/components/friends/FriendsPanel'
import { VoiceParticipantGrid, VoiceControlsBar } from '@/components/voice/VoiceChannel'
import { useVoice } from '@/hooks/useVoice'
import { useVoiceStore } from '@/stores/voiceStore'
import { Hash, Volume2, Settings as SettingsIcon, User, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ProfileSettings } from '@/components/settings/ProfileSettings'
import type { Message } from '@/types/database'

export function AppShell() {
  const { currentServerId, currentChannelId, channels, servers } = useServerStore()
  const { fetchServers } = useServerStore()
  const { fetchMessages, sendMessage, subscribeChannel, messagesByChannel } = useMessageStore()
  const [showCreateServer, setShowCreateServer] = useState(false)
  const [showJoinServer, setShowJoinServer] = useState(false)
  const [showCreateChannel, setShowCreateChannel] = useState(false)
  const [activeView, setActiveView] = useState<'chat'|'friends'|'settings'>('chat')
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const server = servers.find(s=> s.id===currentServerId)
  const channel = channels.find(c=> c.id===currentChannelId)
  const { joinVoice, leaveVoice, remoteStreams } = useVoice()
  const voice = useVoiceStore()

  // initial fetch
  useEffect(()=> { fetchServers() }, [])

  // handle server switch -> set view to chat
  useEffect(()=> {
    if (currentServerId) setActiveView('chat')
    else setActiveView('friends')
  }, [currentServerId])

  // subscribe to messages when channel changes
  useEffect(()=> {
    if (!currentChannelId || !channel) return
    fetchMessages(currentChannelId)
    const unsub = subscribeChannel(currentChannelId)
    return () => unsub()
  }, [currentChannelId, channel?.id])

  const handleSend = (content: string) => {
    if (!currentChannelId || !server) return
    sendMessage(currentChannelId, server.id, content, replyTo?.id ?? null)
    setReplyTo(null)
  }

  const handleVoiceJoin = async () => {
    if (!server || !channel || channel.type!=='voice') return
    const roomId = `server:${server.id}:${channel.id}`
    await joinVoice(roomId, channel.name)
  }

  const isVoiceChannel = channel?.type === 'voice'
  const isTextChannel = channel?.type === 'text'
  const voiceActive = voice.status !== 'disconnected' && voice.roomId === (server && channel ? `server:${server.id}:${channel.id}` : null)

  return (
    <div className="h-screen flex bg-surface-950 text-white overflow-hidden">
      <ServerSidebar onCreate={()=> setShowCreateServer(true)} onJoin={()=> setShowJoinServer(true)} />
      <ChannelSidebar onCreateChannel={()=> setShowCreateChannel(true)} />

      <div className="flex-1 flex flex-col min-w-0 bg-surface-900">
        {/* Top bar */}
        <div className="h-12 flex items-center justify-between px-4 border-b border-surface-800 bg-surface-900 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {!currentServerId ? (
              <>
                <User size={18} className="text-surface-400" />
                <span className="font-semibold">Friends</span>
              </>
            ) : channel ? (
              <>
                {channel.type==='text' ? <Hash size={18} className="text-surface-400" /> : <Volume2 size={18} className="text-emerald-400" />}
                <span className="font-semibold truncate">{channel.name}</span>
                {channel.topic && <span className="hidden md:block text-sm text-surface-400 truncate border-l border-surface-700 pl-3 ml-3">{channel.topic}</span>}
              </>
            ) : (
              <span className="font-semibold text-surface-400">Select a channel</span>
            )}
            {voice.status!=='disconnected' && (
              <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${voice.status==='connected' ? 'bg-emerald-600 text-white' : voice.status==='reconnecting' ? 'bg-yellow-600 text-white' : 'bg-surface-700 text-surface-300'}`}>
                Voice: {voice.status}
              </span>
            )}
            {voice.error && <span className="text-xs text-red-400 truncate max-w-[200px]">{voice.error}</span>}
          </div>
          <div className="flex items-center gap-2">
            {!currentServerId && (
              <>
                <button onClick={()=> setActiveView('friends')} className={`text-sm px-3 py-1 rounded ${activeView==='friends' ? 'bg-surface-800 text-white' : 'text-surface-400 hover:text-white'}`}>Friends</button>
                <button onClick={()=> setActiveView('settings')} className={`text-sm px-3 py-1 rounded ${activeView==='settings' ? 'bg-surface-800 text-white' : 'text-surface-400 hover:text-white'}`}><SettingsIcon size={16}/></button>
              </>
            )}
            {channel && (
              <div className="flex items-center gap-2">
                {isVoiceChannel && !voiceActive && <Button size="sm" onClick={handleVoiceJoin}>Join Voice</Button>}
                {isVoiceChannel && voiceActive && <Button size="sm" variant="destructive" onClick={leaveVoice}>Leave Voice</Button>}
              </div>
            )}
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col min-h-0">
          {!currentServerId ? (
            activeView==='settings' ? (
              <div className="flex-1 overflow-y-auto p-6">
                <ProfileSettings />
              </div>
            ) : (
              <FriendsPanel />
            )
          ) : !channel ? (
            <div className="flex-1 flex items-center justify-center flex-col p-8 text-center">
              <div className="w-20 h-20 rounded-full bg-surface-800 flex items-center justify-center mb-4 text-3xl">👋</div>
              <h2 className="text-xl font-semibold text-white">Welcome to {server?.name}</h2>
              <p className="text-sm text-surface-400 mt-2 max-w-md">This is the beginning of your server. Create channels to organize conversations.</p>
              <Button className="mt-4" onClick={()=> setShowCreateChannel(true)}>Create Channel</Button>
              {server && <div className="mt-4 text-xs text-surface-500">Invite Code: <span className="font-mono bg-surface-800 px-2 py-1 rounded">{server.invite_code}</span></div>}
            </div>
          ) : isTextChannel ? (
            <>
              <MessageList channelId={channel.id} onReply={setReplyTo} />
              <MessageInput onSend={handleSend} replyTo={replyTo ? { username: replyTo.profile?.username ?? 'Unknown', content: replyTo.content } : null} onCancelReply={()=> setReplyTo(null)} />
            </>
          ) : isVoiceChannel ? (
            <div className="flex-1 flex flex-col">
              {voiceActive ? (
                <>
                  <VoiceParticipantGrid remoteStreams={remoteStreams} />
                  <VoiceControlsBar />
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                  <div className="w-20 h-20 rounded-full bg-emerald-600/20 flex items-center justify-center mb-4">
                    <Volume2 size={32} className="text-emerald-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white">Voice Channel: {channel.name}</h3>
                  <p className="text-sm text-surface-400 mt-1">Join to talk with others. Microphone and camera supported.</p>
                  {voice.error && <div className="mt-3 bg-red-950/50 border border-red-800 text-red-300 text-sm rounded p-2 max-w-md">{voice.error}</div>}
                  <Button className="mt-4" onClick={handleVoiceJoin}>Join Voice Channel</Button>
                  <div className="mt-4 text-xs text-surface-500">You will be asked for microphone permission</div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <CreateServerModal open={showCreateServer} onClose={()=> setShowCreateServer(false)} />
      <JoinServerModal open={showJoinServer} onClose={()=> setShowJoinServer(false)} />
      <CreateChannelModal open={showCreateChannel} onClose={()=> setShowCreateChannel(false)} serverId={currentServerId} />
    </div>
  )
}
