import { useVoiceStore } from '@/stores/voiceStore'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Mic, MicOff, Video, Monitor, PhoneOff, Headphones, ScreenShare } from 'lucide-react'
import { useVoice } from '@/hooks/useVoice'
import { useEffect, useRef } from 'react'

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

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
      {participantsArray.map(p => {
        const stream = remoteStreams.get(p.peerId)
        const isSpeaking = (p.mediaState as any).speaking
        const hasVideo = p.mediaState.camEnabled || p.mediaState.videoEnabled
        const hasScreen = p.mediaState.screenEnabled
        return (
          <div key={p.peerId} className={`relative aspect-video rounded-xl overflow-hidden border-2 ${isSpeaking ? 'border-emerald-500 shadow-lg shadow-emerald-500/20' : 'border-surface-800'} bg-surface-900 flex flex-col`}>
            {hasVideo && stream ? (
              <video
                ref={(el) => {
                  if (el && stream) {
                    el.srcObject = stream
                    el.play().catch(()=>{})
                    remoteVideoRefs.current.set(p.peerId, el)
                  }
                }}
                autoPlay
                playsInline
                muted={p.isLocal}
                className="w-full h-full object-cover"
              />
            ) : hasScreen && stream ? (
              <video ref={(el)=> { if(el && stream){ el.srcObject=stream; el.play().catch(()=>{}) }}} autoPlay playsInline className="w-full h-full object-contain bg-black" />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-3">
                <Avatar src={p.avatarUrl} fallback={p.displayName} size={80} className={isSpeaking ? 'ring-4 ring-emerald-500 ring-offset-2 ring-offset-surface-900' : ''} />
                <span className="font-medium text-white">{p.displayName} {p.isLocal && '(You)'}</span>
              </div>
            )}
            <div className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-black/60 backdrop-blur px-2 py-1 rounded-full">
              <span className="text-xs text-white font-medium truncate max-w-[100px]">{p.displayName}</span>
              {p.mediaState.micMuted ? <MicOff size={12} className="text-red-400" /> : <Mic size={12} className={isSpeaking ? 'text-emerald-400' : 'text-surface-300'} />}
              {p.mediaState.camEnabled && <Video size={12} className="text-emerald-400" />}
              {p.mediaState.screenEnabled && <Monitor size={12} className="text-akay-400" />}
            </div>
            {isSpeaking && <div className="absolute inset-0 pointer-events-none border-2 border-emerald-500 rounded-xl animate-pulse" />}
          </div>
        )
      })}
    </div>
  )
}

export function VoiceControlsBar() {
  const { isMuted, isDeafened, isCameraOn, isScreenSharing, status } = useVoiceStore()
  const { toggleMute, toggleDeafen, toggleCamera, startScreenShare, stopScreenShare, leaveVoice } = useVoice()

  if (status==='disconnected') return null
  return (
    <div className="h-16 bg-surface-900 border-t border-surface-800 flex items-center justify-center gap-2 px-4">
      <Button variant={isMuted ? 'destructive' : 'secondary'} size="icon" onClick={toggleMute} title={isMuted ? 'Unmute' : 'Mute'}>
        {isMuted ? <MicOff size={20}/> : <Mic size={20}/>}
      </Button>
      <Button variant={isDeafened ? 'destructive' : 'secondary'} size="icon" onClick={toggleDeafen} title={isDeafened ? 'Undeafen' : 'Deafen'}>
        <Headphones size={20}/>
      </Button>
      <Button variant={isCameraOn ? 'primary' : 'secondary'} size="icon" onClick={toggleCamera} title={isCameraOn ? 'Turn off camera' : 'Turn on camera'}>
        <Video size={20}/>
      </Button>
      <Button variant={isScreenSharing ? 'primary' : 'secondary'} size="icon" onClick={()=> isScreenSharing ? stopScreenShare() : startScreenShare()} title={isScreenSharing ? 'Stop sharing' : 'Share screen'}>
        <ScreenShare size={20}/>
      </Button>
      <div className="w-px h-8 bg-surface-700 mx-2" />
      <Button variant="destructive" onClick={leaveVoice} className="gap-2">
        <PhoneOff size={18}/> Leave
      </Button>
    </div>
  )
}
