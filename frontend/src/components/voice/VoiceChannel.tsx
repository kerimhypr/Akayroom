import { useVoiceStore } from '@/stores/voiceStore'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Mic, MicOff, Video, Monitor, PhoneOff, Headphones, ScreenShare } from 'lucide-react'
import { useVoice } from '@/hooks/useVoice'
import { useRef } from 'react'
import { cn } from '@/utils/cn'

export function VoiceParticipantGrid({ remoteStreams }: { remoteStreams: Map<string, MediaStream> }) {
  const { participants, localPeerId } = useVoiceStore()
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRefs = useRef<Map<string, HTMLVideoElement>>(new Map())

  // find local stream? Use webrtc hook? For now handle local via participants
  const participantsArray = Array.from(participants.values())

  // Try to attach local video if camera on - handled via remoteStreams? We'll need local stream handling
  // For MVP, just show avatar grid with speaking indicators

  if (participantsArray.length===0) {
    return <div className="flex-1 flex items-center justify-center text-surface-400">No participants</div>
  }

  // Mobile: portrait single column, larger touch, desktop: grid
  const isSingle = participantsArray.length === 1
  return (
    <div
      className={cn(
        'grid gap-2 md:gap-3 p-2 md:p-4 content-start overflow-y-auto overscroll-contain',
        isSingle ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
      )}
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      {participantsArray.map((p) => {
        const stream = remoteStreams.get(p.peerId)
        const isSpeaking = (p.mediaState as any).speaking
        const hasVideo = p.mediaState.camEnabled || p.mediaState.videoEnabled
        const hasScreen = p.mediaState.screenEnabled
        return (
          <div
            key={p.peerId}
            className={cn(
              'relative rounded-2xl md:rounded-xl overflow-hidden border-2 bg-surface-900 flex flex-col',
              isSingle ? 'aspect-[9/12] md:aspect-video max-h-[62dvh] md:max-h-none' : 'aspect-video',
              isSpeaking ? 'border-emerald-500 shadow-lg shadow-emerald-500/20' : 'border-surface-800',
            )}
          >
            {hasVideo && stream ? (
              <video
                ref={(el) => {
                  if (el && stream) {
                    el.srcObject = stream
                    el.play().catch(() => {})
                    remoteVideoRefs.current.set(p.peerId, el)
                  }
                }}
                autoPlay
                playsInline
                muted={p.isLocal}
                className="w-full h-full object-cover"
              />
            ) : hasScreen && stream ? (
              <video
                ref={(el) => {
                  if (el && stream) {
                    el.srcObject = stream
                    el.play().catch(() => {})
                  }
                }}
                autoPlay
                playsInline
                className="w-full h-full object-contain bg-black"
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 p-4">
                <Avatar
                  src={p.avatarUrl}
                  fallback={p.displayName}
                  size={isSingle ? 96 : 80}
                  className={cn(isSpeaking && 'ring-4 ring-emerald-500 ring-offset-2 ring-offset-surface-900')}
                />
                <span className="font-medium text-white text-center">
                  {p.displayName} {p.isLocal && '(You)'}
                </span>
              </div>
            )}
            <div className="absolute bottom-2 left-2 right-2 md:right-auto flex items-center gap-1.5 bg-black/60 backdrop-blur px-2.5 py-1.5 rounded-full">
              <span className="text-xs text-white font-medium truncate flex-1 md:max-w-[100px]">{p.displayName}</span>
              {p.mediaState.micMuted ? <MicOff size={14} className="text-red-400 shrink-0" /> : <Mic size={14} className={cn('shrink-0', isSpeaking ? 'text-emerald-400' : 'text-surface-300')} />}
              {p.mediaState.camEnabled && <Video size={14} className="text-emerald-400 shrink-0" />}
              {p.mediaState.screenEnabled && <Monitor size={14} className="text-akay-400 shrink-0" />}
            </div>
            {isSpeaking && <div className="absolute inset-0 pointer-events-none border-2 border-emerald-500 rounded-2xl md:rounded-xl animate-pulse" />}
          </div>
        )
      })}
    </div>
  )
}

export function VoiceControlsBar() {
  const { isMuted, isDeafened, isCameraOn, isScreenSharing, status } = useVoiceStore()
  const { toggleMute, toggleDeafen, toggleCamera, startScreenShare, stopScreenShare, leaveVoice } = useVoice()

  if (status === 'disconnected') return null
  return (
    <div
      className="h-[76px] md:h-16 bg-surface-900 border-t border-surface-800 flex items-center justify-center gap-1.5 md:gap-2 px-2 md:px-4 shrink-0"
      style={{ paddingBottom: 'max(0.25rem, env(safe-area-inset-bottom))' }}
    >
      <Button
        variant={isMuted ? 'destructive' : 'secondary'}
        size="icon"
        onClick={toggleMute}
        title={isMuted ? 'Unmute' : 'Mute'}
        className="h-11 w-11 md:h-10 md:w-10 rounded-2xl md:rounded-lg"
      >
        {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
      </Button>
      <Button
        variant={isDeafened ? 'destructive' : 'secondary'}
        size="icon"
        onClick={toggleDeafen}
        title={isDeafened ? 'Undeafen' : 'Deafen'}
        className="h-11 w-11 md:h-10 md:w-10 rounded-2xl md:rounded-lg"
      >
        <Headphones size={20} />
      </Button>
      <Button
        variant={isCameraOn ? 'primary' : 'secondary'}
        size="icon"
        onClick={toggleCamera}
        title={isCameraOn ? 'Turn off camera' : 'Turn on camera'}
        className="h-11 w-11 md:h-10 md:w-10 rounded-2xl md:rounded-lg"
      >
        <Video size={20} />
      </Button>
      <Button
        variant={isScreenSharing ? 'primary' : 'secondary'}
        size="icon"
        onClick={() => (isScreenSharing ? stopScreenShare() : startScreenShare())}
        title={isScreenSharing ? 'Stop sharing' : 'Share screen'}
        className="h-11 w-11 md:h-10 md:w-10 rounded-2xl md:rounded-lg"
      >
        <ScreenShare size={20} />
      </Button>
      <div className="w-px h-8 bg-surface-700 mx-1 md:mx-2" />
      <Button variant="destructive" onClick={leaveVoice} className="h-11 md:h-10 rounded-2xl md:rounded-lg px-5 gap-2">
        <PhoneOff size={18} /> <span className="hidden md:inline">Leave</span>
      </Button>
    </div>
  )
}
