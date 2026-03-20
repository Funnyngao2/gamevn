import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { COLOR_HEX } from './../views/lobbyShared.jsx'
import './MeetingOverlay.css'

function getName(players, id) {
  return players.find(p => String(p.id) === String(id))?.name || 'Unknown'
}

function getColor(players, id) {
  return players.find(p => String(p.id) === String(id))?.color || 'white'
}

const EMERGENCY_SPLASH_COLORS = new Set(['blue', 'green', 'orange', 'red', 'yellow'])

function emergencyMeetingSplashSrc(players, reporterId) {
  const c = getColor(players, reporterId)
  const key = EMERGENCY_SPLASH_COLORS.has(c) ? c : 'blue'
  return `assets/Images/Alerts/emergency_meeting_${key}.png`
}

function buildInitialMeetingMessages(phase) {
  const p = phase || 'discussion'
  const msgs = [{ system: true, text: '── Giai đoạn thảo luận ──' }]
  if (p === 'vote' || p === 'resolving' || p === 'result') {
    msgs.push({ system: true, text: '── Giai đoạn bỏ phiếu ──' })
  }
  return msgs
}

export default function MeetingOverlay({ gameRef, socket }) {
  const [meeting, setMeeting] = useState(null)
  const [showMeetingSplash, setShowMeetingSplash] = useState(false)
  const [splashImageSrc, setSplashImageSrc] = useState(null)
  const [chatInput, setChatInput] = useState('')
  const timerRef = useRef(null)
  const splashTimerRef = useRef(null)
  const pendingMeetingStartRef = useRef(null)
  const pendingMeetingStateRef = useRef(null)

  const clearTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
  }

  const clearSplashTimer = () => {
    if (splashTimerRef.current) {
      clearTimeout(splashTimerRef.current)
      splashTimerRef.current = null
    }
  }

  const MEETING_SPLASH_MS = 2000

  useEffect(() => {
    let cancelled = false
    let boundGame = null
    let rafId = null

    const bind = () => {
      if (cancelled) return
      const game = gameRef.current
      if (!game) {
        rafId = requestAnimationFrame(bind)
        return
      }
      boundGame = game

      const flushPendingMeeting = () => {
        const p = pendingMeetingStartRef.current
        pendingMeetingStartRef.current = null
        splashTimerRef.current = null
        setShowMeetingSplash(false)
        setSplashImageSrc(null)
        if (!p) return

        const st = pendingMeetingStateRef.current
        const phase = st?.phase || 'discussion'
        const phaseEndsAt = st?.phaseEndsAt || null
        const title = p.victimId
          ? `${getName(p.players, p.reporterId)} báo cáo xác chết!`
          : `${getName(p.players, p.reporterId)} triệu tập họp khẩn!`

        setMeeting({
          players: p.players,
          localPlayerId: p.localPlayerId,
          reporterId: p.reporterId,
          victimId: p.victimId,
          title,
          phase,
          timer: phaseEndsAt ? Math.max(0, Math.ceil((phaseEndsAt - Date.now()) / 1000)) : 0,
          currentSpeakerId: st?.currentSpeakerId || null,
          phaseEndsAt,
          votes: {},
          myVote: null,
          waitingResult: phase === 'resolving',
          result: null,
          messages: buildInitialMeetingMessages(phase),
        })
      }

      game.registry.set('onMeetingStart', ({ players, localPlayerId, reporterId, victimId, gameMode }) => {
        clearTimer()
        clearSplashTimer()
        pendingMeetingStateRef.current = null
        pendingMeetingStartRef.current = { players, localPlayerId, reporterId, victimId, gameMode }
        setMeeting(null)
        setSplashImageSrc(emergencyMeetingSplashSrc(players, reporterId))
        setShowMeetingSplash(true)
        splashTimerRef.current = setTimeout(flushPendingMeeting, MEETING_SPLASH_MS)
      })

      game.registry.set('onMeetingState', ({ phase, currentSpeakerId, phaseEndsAt }) => {
        pendingMeetingStateRef.current = { phase, currentSpeakerId, phaseEndsAt }
        setMeeting(prev => {
          if (!prev) return prev

          let extraMessages = prev.messages
          if (phase === 'vote' && prev.phase !== 'vote') {
            extraMessages = [...prev.messages, { system: true, text: '── Giai đoạn bỏ phiếu ──' }].slice(-60)
          }

          return {
            ...prev,
            phase,
            currentSpeakerId: currentSpeakerId || null,
            phaseEndsAt: phaseEndsAt || null,
            timer: phaseEndsAt ? Math.max(0, Math.ceil((phaseEndsAt - Date.now()) / 1000)) : 0,
            waitingResult: phase === 'resolving',
            messages: extraMessages,
          }
        })
      })

      game.registry.set('onMeetingVote', ({ voterId, targetId }) => {
        setMeeting(prev => {
          if (!prev || prev.votes[voterId] !== undefined) return prev
          return { ...prev, votes: { ...prev.votes, [voterId]: targetId } }
        })
      })

      game.registry.set('onMeetingChat', ({ senderId, text }) => {
        setMeeting(prev => {
          if (!prev) return prev
          return {
            ...prev,
            messages: [...prev.messages, {
              system: false,
              senderId,
              name: getName(prev.players, senderId),
              text,
            }].slice(-60),
          }
        })
      })

      game.registry.set('onMeetingResult', ({ ejectedId, tied, skipVotes, totalVotes }) => {
        clearTimer()
        setMeeting(prev => {
          if (!prev) return prev
          const ejected = ejectedId ? prev.players.find(p => String(p.id) === String(ejectedId)) : null
          let resultText
          if (ejected) {
            resultText = ejected.isImposter
              ? `${ejected.name} bị loại! (Là Sát Nhân)`
              : `${ejected.name} bị loại! (Không phải Sát Nhân)`
          } else if (tied) {
            resultText = 'Hòa phiếu — không ai bị loại!'
          } else if (skipVotes > totalVotes / 2) {
            resultText = 'Đa số bỏ qua — không ai bị loại!'
          } else {
            resultText = 'Không đủ phiếu — không ai bị loại!'
          }
          return {
            ...prev,
            phase: 'result',
            timer: 0,
            waitingResult: false,
            result: { text: resultText, ejectedId: ejectedId ? Number(ejectedId) : null, ejected },
          }
        })

        setTimeout(() => {
          game.registry.get('handleMeetingClosed')?.(ejectedId ? Number(ejectedId) : null)
          setMeeting(null)
        }, 3500)
      })

      game.registry.set('onMeetingAbort', () => {
        clearTimer()
        clearSplashTimer()
        pendingMeetingStartRef.current = null
        pendingMeetingStateRef.current = null
        setShowMeetingSplash(false)
        setSplashImageSrc(null)
        setMeeting(null)
        game.registry.get('handleMeetingAbort')?.()
      })
    }

    bind()

    return () => {
      cancelled = true
      clearTimer()
      clearSplashTimer()
      if (rafId) cancelAnimationFrame(rafId)
      if (boundGame) {
        boundGame.registry.remove?.('onMeetingStart')
        boundGame.registry.remove?.('onMeetingState')
        boundGame.registry.remove?.('onMeetingVote')
        boundGame.registry.remove?.('onMeetingChat')
        boundGame.registry.remove?.('onMeetingResult')
        boundGame.registry.remove?.('onMeetingAbort')
      }
    }
  }, [gameRef, socket])

  useEffect(() => {
    clearTimer()
    if (!meeting?.phaseEndsAt || meeting.phase === 'result') return
    const updateTimer = () => {
      setMeeting(prev => {
        if (!prev?.phaseEndsAt) return prev
        return {
          ...prev,
          timer: Math.max(0, Math.ceil((prev.phaseEndsAt - Date.now()) / 1000)),
        }
      })
    }
    updateTimer()
    timerRef.current = setInterval(updateTimer, 250)
    return clearTimer
  }, [meeting?.phaseEndsAt, meeting?.phase])

  const castVote = (targetId) => {
    setMeeting(prev => {
      if (!prev || prev.phase !== 'vote' || prev.myVote !== null) return prev
      const me = prev.players.find(p => String(p.id) === String(prev.localPlayerId))
      if (!me?.alive) return prev
      socket?.emit('vote', { targetId })
      return {
        ...prev,
        myVote: targetId,
        votes: { ...prev.votes, [prev.localPlayerId]: targetId },
      }
    })
  }

  const sendChat = () => {
    const text = chatInput.trim()
    if (!text || !meeting) return
    socket?.emit('meetingChat', { text })
    setChatInput('')
  }

  const voteCounts = meeting ? Object.values(meeting.votes).reduce((acc, vote) => {
    acc[vote] = (acc[vote] || 0) + 1
    return acc
  }, {}) : {}

  const isLocalAlive = meeting?.players?.find(p => String(p.id) === String(meeting.localPlayerId))?.alive !== false

  return (
    <>
    <AnimatePresence>
      {showMeetingSplash && splashImageSrc && (
        <motion.div
          key="meeting-emergency-splash"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="meeting-splash-backdrop"
          aria-hidden>
          <img src={splashImageSrc} alt="" className="meeting-splash-image" draggable={false} />
        </motion.div>
      )}
    </AnimatePresence>
    <AnimatePresence>
      {meeting && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="meeting-overlay-backdrop">
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="meeting-overlay-panel">
            <div className="meeting-overlay-header">
              <div>
                <h2 className="meeting-overlay-title">{meeting.title}</h2>
                <p className="meeting-overlay-phase-text">
                  {meeting.phase === 'discussion' ? 'Thảo luận (45s)' : meeting.phase === 'vote' ? 'Bỏ phiếu (20s)' : meeting.phase === 'resolving' ? 'Đang tổng phiếu...' : 'Kết quả'}
                </p>
              </div>
              <div className="meeting-overlay-timer-box">
                <p className="meeting-overlay-timer-label">Timer</p>
                <p className="meeting-overlay-timer-value">{meeting.timer}s</p>
              </div>
            </div>

            <div className="meeting-overlay-body">
              <div className="meeting-overlay-left">
                <div className="meeting-overlay-status-row">
                  <div className="meeting-overlay-status-pill meeting-overlay-status-pill-info">
                    {meeting.phase === 'discussion' ? 'Tất cả thảo luận' : meeting.phase === 'vote' ? 'Chọn người muốn vote hoặc Bỏ qua' : meeting.waitingResult ? 'Đang tổng kết phiếu...' : 'Kết quả'}
                  </div>
                  {meeting.myVote && (
                    <div className="meeting-overlay-status-pill meeting-overlay-status-pill-success">
                      Đã vote
                    </div>
                  )}
                </div>

                <div className="meeting-overlay-player-grid">
                  {meeting.players.map((p) => {
                    const isMe = String(p.id) === String(meeting.localPlayerId)
                    const isDead = !p.alive
                    const count = voteCounts[p.id] || 0
                    return (
                      <div key={p.id} className="meeting-overlay-player-card">
                        <div className="meeting-overlay-player-top">
                          <div className="meeting-overlay-player-icon"
                            style={{ background: `${COLOR_HEX[p.color] || '#888'}22`, color: COLOR_HEX[p.color] || '#fff' }}>
                            {isDead ? '☠' : '●'}
                          </div>
                          <div className="meeting-overlay-player-meta">
                            <div className="meeting-overlay-player-name-row">
                              <p className={`meeting-overlay-player-name ${isDead ? 'meeting-overlay-player-name-dead' : ''}`}>{p.name}</p>
                              {isMe && <span className="meeting-overlay-you-badge">Bạn</span>}
                            </div>
                            {/* Không hiển thị role trong cuộc họp — chỉ tiết lộ khi có kết quả (người bị loại) */}
                            {meeting.phase === 'result' && meeting.result?.ejectedId != null && String(p.id) === String(meeting.result.ejectedId) && (
                              <p className="meeting-overlay-player-role" style={{ color: meeting.result.ejected?.isImposter ? '#f87171' : '#22d3ee' }}>
                                {meeting.result.ejected?.isImposter ? 'Impostor' : 'Crewmate'}
                              </p>
                            )}
                          </div>
                          {count > 0 && <span className="meeting-overlay-vote-count">{count} phiếu</span>}
                        </div>

                        {meeting.phase === 'vote' && p.alive && !isMe && (
                          <button
                            onClick={() => castVote(p.id)}
                            disabled={meeting.myVote !== null}
                            className="meeting-overlay-vote-button"
                            style={{
                              background: meeting.myVote === p.id ? 'rgba(34,197,94,0.25)' : 'rgba(255,255,255,0.07)',
                              color: meeting.myVote === p.id ? '#86efac' : '#e2e8f0',
                              border: '1px solid rgba(255,255,255,0.08)',
                            }}>
                            Vote
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>

                {meeting.phase === 'vote' && (
                  <button
                    onClick={() => castVote('skip')}
                    disabled={meeting.myVote !== null}
                    className="meeting-overlay-skip-button">
                    Bỏ qua ({voteCounts.skip || 0})
                  </button>
                )}
              </div>

              <div className="meeting-overlay-right">
                <div className="meeting-overlay-chat-box">
                  {meeting.messages.map((msg, idx) => (
                    <div key={idx} className={msg.system ? 'meeting-overlay-msg-system' : ''}>
                      {msg.system ? (
                        <span>{msg.text}</span>
                      ) : (
                        <>
                          <span className="meeting-overlay-msg-name" style={{ color: COLOR_HEX[getColor(meeting.players, msg.senderId)] || '#fff' }}>
                            {msg.name}:
                          </span>{' '}
                          <span className="meeting-overlay-msg-text">{msg.text}</span>
                        </>
                      )}
                    </div>
                  ))}
                </div>

                {isLocalAlive ? (
                  <div className="meeting-overlay-chat-input-row">
                    <input
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => {
                        e.stopPropagation()
                        if (e.key === 'Enter') sendChat()
                      }}
                      maxLength={80}
                      placeholder="Nhập tin nhắn thảo luận..."
                      className="meeting-overlay-chat-input"
                    />
                    <button
                      onClick={sendChat}
                      className="meeting-overlay-chat-send">
                      Gửi
                    </button>
                  </div>
                ) : (
                  <p className="meeting-overlay-ghost-notice">Hồn ma không được bình luận</p>
                )}
              </div>
            </div>

            <AnimatePresence>
              {meeting.result && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="meeting-overlay-result">
                  <p className="meeting-overlay-result-text" style={{ color: meeting.result.ejected?.isImposter ? '#f87171' : '#facc15' }}>
                    {meeting.result.text}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    </>
  )
}
