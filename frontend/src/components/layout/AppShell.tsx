import { useState, useEffect } from 'react'
import { ServerSidebar } from './ServerSidebar'
import { ChannelSidebar } from './ChannelSidebar'
import { MobileBottomNav, MobileHeader } from './MobileNav'
import { MobileServerDrawer, MobileChannelDrawer } from './MobileDrawers'
import { CreateServerModal, JoinServerModal, CreateChannelModal } from '@/components/server/ServerModals'
import { useServerStore } from '@/stores/serverStore'
import { useMessageStore } from '@/stores/messageStore'
import { MessageList } from '@/components/chat/MessageList'
import { MessageInput } from '@/components/chat/MessageInput'
import { FriendsPanel } from '@/components/friends/FriendsPanel'
import { VoiceParticipantGrid, VoiceControlsBar } from '@/components/voice/VoiceChannel'
import { useVoice } from '@/hooks/useVoice'
import { useVoiceStore } from '@/stores/voiceStore'
import { Hash, Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ProfileSettings } from '@/components/settings/ProfileSettings'
import type { Message } from '@/types/database'

export function AppShell() {
  const { currentServerId, currentChannelId, channels, servers, setCurrentServer, setCurrentChannel } = useServerStore()
  const { fetchServers } = useServerStore()
  const { fetchMessages, sendMessage, subscribeChannel } = useMessageStore()
  const [showCreateServer, setShowCreateServer] = useState(false)
  const [showJoinServer, setShowJoinServer] = useState(false)
  const [showCreateChannel, setShowCreateChannel] = useState(false)
  const [activeView, setActiveView] = useState<'chat' | 'friends' | 'settings'>('chat')
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const server = servers.find((s) => s.id === currentServerId)
  const channel = channels.find((c) => c.id === currentChannelId)
  const { joinVoice, leaveVoice, remoteStreams } = useVoice()
  const voice = useVoiceStore()

  const [showServerDrawer, setShowServerDrawer] = useState(false)
  const [showChannelDrawer, setShowChannelDrawer] = useState(false)
  const [mobileTab, setMobileTab] = useState<'chat' | 'friends' | 'voice' | 'settings'>('chat')

  useEffect(() => { fetchServers() }, [])
  useEffect(() => {
    if (currentServerId) setActiveView('chat')
    else setActiveView('friends')
  }, [currentServerId])
  useEffect(() => {
    if (!currentChannelId || !channel) return
    fetchMessages(currentChannelId)
    const unsub = subscribeChannel(currentChannelId)
    return () => unsub()
  }, [currentChannelId, channel?.id])

  // Sync mobile tab with activeView/server
  useEffect(() => {
    if (!currentServerId) {
      if (mobileTab === 'chat') setMobileTab('friends')
    }
  }, [currentServerId])

  const handleSend = (content: string) => {
    if (!currentChannelId || !server) return
    sendMessage(currentChannelId, server.id, content, replyTo?.id ?? null)
    setReplyTo(null)
  }
  const handleVoiceJoin = async () => {
    if (!server || !channel || channel.type !== 'voice') return
    const roomId = `server:${server.id}:${channel.id}`
    await joinVoice(roomId, channel.name)
    setMobileTab('voice')
  }
  const isVoiceChannel = channel?.type === 'voice'
  const isTextChannel = channel?.type === 'text'
  const voiceActive = voice.status !== 'disconnected' && voice.roomId === (server && channel ? `server:${server.id}:${channel.id}` : null)

  const handleMobileTab = (t: 'chat' | 'friends' | 'voice' | 'settings') => {
    setMobileTab(t)
    if (t === 'friends' || t === 'settings') setActiveView(t)
    else setActiveView('chat')
    if (t === 'voice') {
      const vc = channels.find((c) => c.type === 'voice')
      if (vc && currentChannelId !== vc.id) setCurrentChannel(vc.id)
    }
    if (t === 'chat' && currentServerId && !channel) {
      const tc = channels.find((c) => c.type === 'text')
      if (tc) setCurrentChannel(tc.id)
    }
  }

  const renderMain = () => {
    // Mobile tab overrides when on mobile — must be checked BEFORE server/channel
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
    const effectiveView = isMobile ? (mobileTab === 'friends' ? 'friends' : mobileTab === 'settings' ? 'settings' : mobileTab === 'voice' ? 'voice' : 'chat') : null

    if (isMobile) {
      if (effectiveView === 'friends') return <FriendsPanel />
      if (effectiveView === 'settings') return <div className="flex-1 overflow-y-auto p-4 md:p-6"><ProfileSettings /></div>
    }

    if (!currentServerId) {
      return activeView === 'settings' ? (
        <div className="flex-1 overflow-y-auto p-6"><ProfileSettings /></div>
      ) : (
        <FriendsPanel />
      )
    }
    if (!channel) {
      return (
        <div className="flex-1 flex items-center justify-center flex-col p-8 text-center">
          <div className="w-20 h-20 rounded-full bg-surface-800 flex items-center justify-center mb-4 text-3xl">👋</div>
          <h2 className="text-xl font-semibold text-white">Welcome to {server?.name}</h2>
          <p className="text-sm text-surface-400 mt-2 max-w-md">This is the beginning of your server. Create channels to organize conversations.</p>
          <Button className="mt-4 min-h-[44px]" onClick={() => setShowCreateChannel(true)}>Create Channel</Button>
          {server && <div className="mt-4 text-xs text-surface-500">Invite Code: <span className="font-mono bg-surface-800 px-2 py-1 rounded">{server.invite_code}</span></div>}
        </div>
      )
    }
    if (isTextChannel) {
      return (
        <>
          <MessageList channelId={channel.id} onReply={setReplyTo} />
          <MessageInput onSend={handleSend} replyTo={replyTo ? { username: (replyTo as any).profile?.username ?? 'Unknown', content: replyTo.content } : null} onCancelReply={() => setReplyTo(null)} />
        </>
      )
    }
    if (isVoiceChannel) {
      // On mobile, if tab is not voice, show chat-like prompt
      if (isMobile && effectiveView !== 'voice' && !voiceActive) {
        return (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-20 h-20 rounded-full bg-emerald-600/20 flex items-center justify-center mb-4">
              <Volume2 size={32} className="text-emerald-400" />
            </div>
            <h3 className="text-lg font-semibold text-white">Voice Channel: {channel.name}</h3>
            <p className="text-sm text-surface-400 mt-1">Tap Voice to join</p>
            <Button className="mt-4 min-h-[44px]" onClick={handleVoiceJoin}>Join Voice Channel</Button>
          </div>
        )
      }
      return (
        <div className="flex-1 flex flex-col min-h-0">
          {voiceActive ? (
            <>
              <VoiceParticipantGrid remoteStreams={remoteStreams} />
              <VoiceControlsBar />
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-8 text-center">
              <div className="w-20 h-20 rounded-full bg-emerald-600/20 flex items-center justify-center mb-4">
                <Volume2 size={32} className="text-emerald-400" />
              </div>
              <h3 className="text-lg font-semibold text-white">Voice Channel: {channel.name}</h3>
              <p className="text-sm text-surface-400 mt-1">Join to talk with others. Microphone and camera supported.</p>
              {voice.error && <div className="mt-3 bg-red-950/50 border border-red-800 text-red-300 text-sm rounded p-2 max-w-md">{voice.error}</div>}
              <Button className="mt-4 min-h-[44px]" onClick={handleVoiceJoin}>Join Voice Channel</Button>
              <div className="mt-4 text-xs text-surface-500">You will be asked for microphone permission</div>
            </div>
          )}
        </div>
      )
    }
    return null
  }

  return (
    <div className="h-[100dvh] flex bg-surface-950 text-white overflow-hidden">
      {/* Desktop sidebars */}
      <div className="hidden md:flex">
        <ServerSidebar onCreate={() => setShowCreateServer(true)} onJoin={() => setShowJoinServer(true)} />
      </div>
      <div className="hidden md:flex">
        <ChannelSidebar onCreateChannel={() => setShowCreateChannel(true)} />
      </div>

      {/* Mobile + Desktop main */}
      <div className="flex-1 flex flex-col min-w-0 bg-surface-900 h-[100dvh]">
        {/* Mobile header */}
        <MobileHeader
          serverName={server?.name ?? null}
          channelName={channel?.name ?? null}
          channelType={(channel?.type as 'text' | 'voice' | null) ?? null}
          onOpenServers={() => setShowServerDrawer(true)}
          onOpenChannels={() => setShowChannelDrawer(true)}
        />

        {/* Desktop top bar */}
        <div className="hidden md:flex h-12 items-center justify-between px-4 border-b border-surface-800 bg-surface-900 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {!currentServerId ? (
              <span className="font-semibold">Friends</span>
            ) : channel ? (
              <>
                {channel.type === 'text' ? <Hash size={18} className="text-surface-400" /> : <Volume2 size={18} className="text-emerald-400" />}
                <span className="font-semibold truncate">{channel.name}</span>
                {channel.topic && <span className="hidden lg:block text-sm text-surface-400 truncate border-l border-surface-700 pl-3 ml-3">{channel.topic}</span>}
              </>
            ) : (
              <span className="font-semibold text-surface-400">Select a channel</span>
            )}
            {voice.status !== 'disconnected' && (
              <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${voice.status === 'connected' ? 'bg-emerald-600 text-white' : voice.status === 'reconnecting' ? 'bg-yellow-600 text-white' : 'bg-surface-700 text-surface-300'}`}>
                Voice: {voice.status}
              </span>
            )}
            {voice.error && <span className="text-xs text-red-400 truncate max-w-[200px]">{voice.error}</span>}
          </div>
          <div className="flex items-center gap-2">
            {channel && isVoiceChannel && !voiceActive && <Button size="sm" onClick={handleVoiceJoin}>Join Voice</Button>}
            {channel && isVoiceChannel && voiceActive && <Button size="sm" variant="destructive" onClick={leaveVoice}>Leave Voice</Button>}
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col min-h-0 pb-[64px] md:pb-0">{renderMain()}</div>

        {/* Mobile bottom nav */}
        <MobileBottomNav active={mobileTab} onChange={handleMobileTab} voiceActive={voice.status !== 'disconnected'} />
      </div>

      <MobileServerDrawer
        open={showServerDrawer}
        onClose={() => setShowServerDrawer(false)}
        onSelect={(t) => setMobileTab(t)}
        onCreate={() => setShowCreateServer(true)}
        onJoin={() => setShowJoinServer(true)}
      />
      <MobileChannelDrawer
        open={showChannelDrawer}
        onClose={() => setShowChannelDrawer(false)}
        onSelect={(t) => setMobileTab(t)}
        onCreateChannel={() => setShowCreateChannel(true)}
      />

      <CreateServerModal open={showCreateServer} onClose={() => setShowCreateServer(false)} />
      <JoinServerModal open={showJoinServer} onClose={() => setShowJoinServer(false)} />
      <CreateChannelModal open={showCreateChannel} onClose={() => setShowCreateChannel(false)} serverId={currentServerId} />
    </div>
  )
}
