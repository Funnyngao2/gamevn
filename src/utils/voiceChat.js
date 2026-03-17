// voiceChat.js - WebRTC Voice Chat Manager
export class VoiceChatManager {
  constructor(socket, roomId) {
    this.socket = socket
    this.roomId = roomId
    this.localStream = null
    this.peerConnections = new Map() // peerId -> RTCPeerConnection
    this.remoteStreams = new Map()   // peerId -> MediaStream
    this.isMuted = false
    this.isEnabled = false
    
    // ICE servers (STUN/TURN)
    this.iceServers = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    }
    
    this._setupSignaling()
  }

  // Setup signaling handlers
  _setupSignaling() {
    // Receive offer from peer
    this.socket.on('voiceOffer', async ({ from, offer }) => {
      console.log('Received offer from', from)
      await this._handleOffer(from, offer)
    })

    // Receive answer from peer
    this.socket.on('voiceAnswer', async ({ from, answer }) => {
      console.log('Received answer from', from)
      const pc = this.peerConnections.get(from)
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(answer))
      }
    })

    // Receive ICE candidate
    this.socket.on('voiceIceCandidate', async ({ from, candidate }) => {
      const pc = this.peerConnections.get(from)
      if (pc && candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate))
      }
    })

    // Peer joined - initiate connection
    this.socket.on('voicePeerJoined', async ({ peerId }) => {
      console.log('Peer joined voice:', peerId)
      if (this.isEnabled) {
        await this._createPeerConnection(peerId, true)
      }
    })

    // Peer left - cleanup
    this.socket.on('voicePeerLeft', ({ peerId }) => {
      console.log('Peer left voice:', peerId)
      this._closePeerConnection(peerId)
    })
  }

  // Start voice chat (get mic access)
  async start() {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }, 
        video: false 
      })
      
      this.isEnabled = true
      console.log('Voice chat started')
      
      // Notify server we joined voice
      this.socket.emit('voiceJoin', { roomId: this.roomId })
      
      return true
    } catch (err) {
      console.error('Failed to get microphone access:', err)
      return false
    }
  }

  // Stop voice chat
  stop() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop())
      this.localStream = null
    }
    
    // Close all peer connections
    this.peerConnections.forEach((pc, peerId) => {
      this._closePeerConnection(peerId)
    })
    
    this.isEnabled = false
    this.socket.emit('voiceLeave', { roomId: this.roomId })
    console.log('Voice chat stopped')
  }

  // Toggle mute
  toggleMute() {
    if (!this.localStream) return false
    
    const audioTrack = this.localStream.getAudioTracks()[0]
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled
      this.isMuted = !audioTrack.enabled
      return this.isMuted
    }
    return false
  }

  // Create peer connection
  async _createPeerConnection(peerId, isInitiator) {
    const pc = new RTCPeerConnection(this.iceServers)
    this.peerConnections.set(peerId, pc)

    // Add local stream
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream)
      })
    }

    // Handle remote stream
    pc.ontrack = (event) => {
      console.log('Received remote track from', peerId)
      const [remoteStream] = event.streams
      this.remoteStreams.set(peerId, remoteStream)
      this._playRemoteStream(peerId, remoteStream)
    }

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit('voiceIceCandidate', {
          roomId: this.roomId,
          to: peerId,
          candidate: event.candidate
        })
      }
    }

    // Connection state
    pc.onconnectionstatechange = () => {
      console.log(`Connection with ${peerId}:`, pc.connectionState)
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this._closePeerConnection(peerId)
      }
    }

    // If initiator, create offer
    if (isInitiator) {
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      this.socket.emit('voiceOffer', {
        roomId: this.roomId,
        to: peerId,
        offer: pc.localDescription
      })
    }

    return pc
  }

  // Handle incoming offer
  async _handleOffer(peerId, offer) {
    const pc = await this._createPeerConnection(peerId, false)
    await pc.setRemoteDescription(new RTCSessionDescription(offer))
    
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    
    this.socket.emit('voiceAnswer', {
      roomId: this.roomId,
      to: peerId,
      answer: pc.localDescription
    })
  }

  // Play remote stream
  _playRemoteStream(peerId, stream) {
    // Create audio element for this peer
    let audio = document.getElementById(`voice-${peerId}`)
    if (!audio) {
      audio = document.createElement('audio')
      audio.id = `voice-${peerId}`
      audio.autoplay = true
      document.body.appendChild(audio)
    }
    audio.srcObject = stream
  }

  // Close peer connection
  _closePeerConnection(peerId) {
    const pc = this.peerConnections.get(peerId)
    if (pc) {
      pc.close()
      this.peerConnections.delete(peerId)
    }
    
    this.remoteStreams.delete(peerId)
    
    // Remove audio element
    const audio = document.getElementById(`voice-${peerId}`)
    if (audio) {
      audio.srcObject = null
      audio.remove()
    }
  }

  // Get audio level (for visualization)
  getAudioLevel() {
    if (!this.localStream) return 0
    // You can implement audio level detection here using Web Audio API
    return 0
  }

  // Cleanup
  destroy() {
    this.stop()
    this.socket.off('voiceOffer')
    this.socket.off('voiceAnswer')
    this.socket.off('voiceIceCandidate')
    this.socket.off('voicePeerJoined')
    this.socket.off('voicePeerLeft')
  }
}
