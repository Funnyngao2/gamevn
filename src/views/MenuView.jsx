import { useState, useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Swiper, SwiperSlide } from 'swiper/react'
import { EffectCoverflow, Keyboard, Navigation } from 'swiper/modules'
import 'swiper/css'
import 'swiper/css/effect-coverflow'
import { useAppStore } from '../store.js'
import { SceneBg } from './lobbyShared.jsx'
import './MenuView.css'

// ── Character data ────────────────────────────────────────────────────────────
const CHARACTERS = [
  {
    id: 'female_06', label: 'Yuna',  gender: 'Nữ',  file: 'Female 06-1.png', avatar: 'nu1.png',  color: 'pink',   hex: '#ec4899',
    trait: 'Tự tin, độc lập',
    desc: 'Không ngại đưa ra quyết định và thích tự mình giải quyết vấn đề.',
    strength: 'Quyết đoán', weakness: 'Khó nhờ người khác giúp',
  },
  {
    id: 'female_07', label: 'Hikari', gender: 'Nữ', file: 'Female 07-1.png', avatar: 'nu2.png',  color: 'black',  hex: '#94a3b8',
    trait: 'Sáng tạo, linh hoạt',
    desc: 'Luôn đưa ra những ý tưởng khác biệt khi nhóm gặp khó khăn.',
    strength: 'Sáng tạo', weakness: 'Không thích khuôn mẫu',
  },
  {
    id: 'female_08', label: 'Mika',  gender: 'Nữ',  file: 'Female 08-1.png', avatar: 'nu3.png',  color: 'brown',  hex: '#b45309',
    trait: 'Trầm tĩnh, quan sát',
    desc: 'Ít nói nhưng thường nhận ra những chi tiết mà người khác bỏ qua.',
    strength: 'Quan sát tốt', weakness: 'Khó mở lòng',
  },
  {
    id: 'female_09', label: 'Aiko',  gender: 'Nữ',  file: 'Female 09-1.png', avatar: 'nu4.png',  color: 'purple', hex: '#a855f7',
    trait: 'Chu đáo, tinh tế',
    desc: 'Thường nhận ra cảm xúc của người khác trước khi họ nói ra.',
    strength: 'Đồng cảm tốt', weakness: 'Dễ suy nghĩ nhiều',
  },
  {
    id: 'male_01',   label: 'Akira', gender: 'Nam', file: 'Male 01-1.png',   avatar: 'nam1.png', color: 'red',    hex: '#e74c3c',
    trait: 'Bình tĩnh, logic',
    desc: 'Luôn suy nghĩ kỹ trước khi đưa ra quyết định và ít khi bị cuốn theo cảm xúc.',
    strength: 'Phân tích tốt', weakness: 'Khó bộc lộ cảm xúc',
  },
  {
    id: 'male_10',   label: 'Ren',   gender: 'Nam', file: 'Male 10-1.png',   avatar: 'nam2.png', color: 'blue',   hex: '#3b82f6',
    trait: 'Năng động, hòa đồng',
    desc: 'Dễ kết nối với mọi người và thường là người bắt đầu các cuộc trò chuyện.',
    strength: 'Giao tiếp tốt', weakness: 'Đôi khi thiếu kiên nhẫn',
  },
  {
    id: 'male_14',   label: 'Kai',   gender: 'Nam', file: 'Male 14-1.png',   avatar: 'nam3.png', color: 'green',  hex: '#22c55e',
    trait: 'Thực tế, đáng tin',
    desc: 'Là người luôn giữ mọi việc đi đúng hướng và hoàn thành nhiệm vụ.',
    strength: 'Trách nhiệm cao', weakness: 'Hơi cứng nhắc',
  },
  {
    id: 'male_16',   label: 'Sora',  gender: 'Nam', file: 'Male 16-1.png',   avatar: 'nam4.png', color: 'orange', hex: '#f97316',
    trait: 'Tò mò, thích khám phá',
    desc: 'Luôn muốn hiểu rõ cách mọi thứ hoạt động và không ngại thử điều mới.',
    strength: 'Học nhanh', weakness: 'Dễ phân tâm',
  },
]

export const SPRITE_MAP = Object.fromEntries(CHARACTERS.map(c => [c.color, c.file]))
export const AVATAR_MAP  = Object.fromEntries(CHARACTERS.map(c => [c.color, c.avatar]))

const TIPS = [
  'Đừng tin tưởng ai cả...',
  'Hoàn thành nhiệm vụ để giành chiến thắng!',
  'Kẻ phản bội luôn ở gần bạn hơn bạn nghĩ.',
  'Họp khẩn khi phát hiện điều bất thường.',
  'Báo cáo xác chết ngay khi tìm thấy!',
]

export default function MenuView() {
  const [phase, setPhase] = useState('loading')
  const [loadPct, setLoadPct] = useState(0)
  const [tipIdx, setTipIdx] = useState(0)
  const videoRef = useRef(null)

  useEffect(() => {
    // Preload video
    const video = document.createElement('video')
    video.src = 'assets/videos/videobackgroud.mp4'
    video.preload = 'auto'
    videoRef.current = video

    let videoLoaded = false
    let pct = 0

    const checkComplete = () => {
      if (videoLoaded && pct >= 100) {
        setLoadPct(100)
        setTimeout(() => setPhase('menu'), 500)
      }
    }

    video.addEventListener('canplaythrough', () => {
      videoLoaded = true
      checkComplete()
    })

    video.load()

    const iv = setInterval(() => {
      pct += Math.random() * 9 + 3
      if (pct >= 100) {
        pct = 100
        clearInterval(iv)
        checkComplete()
      } else {
        setLoadPct(Math.floor(pct))
      }
    }, 80)

    const tipIv = setInterval(() => setTipIdx(i => (i + 1) % TIPS.length), 2500)
    
    return () => {
      clearInterval(iv)
      clearInterval(tipIv)
      video.remove()
    }
  }, [])

  return (
    <AnimatePresence mode="wait">
      {phase === 'loading'
        ? <LoadingScreen key="load" pct={loadPct} tip={TIPS[tipIdx]} />
        : <CharacterSelect key="menu" />}
    </AnimatePresence>
  )
}

function LoadingScreen({ pct, tip }) {
  return (
    <motion.div className="w-screen h-screen flex flex-col items-center justify-center relative overflow-hidden"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <SceneBg />
      <div className="relative z-10 flex flex-col items-center gap-8">
        <motion.div className="flex flex-col items-center gap-3"
          initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }}>
          <img src="assets/Images/logo/logo.png" alt="logo" className="loading-logo" />
          <p className="text-white text-3xl font-black tracking-[10px]">MOONIVERSE</p>
          <p className="text-cyan-400 text-[11px] tracking-[5px]">KEEP YOUR DREAM</p>
        </motion.div>
        <motion.div className="loading-bar-container"
          initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.4 }}>
          <div className="flex justify-between text-xs">
            <span className="text-white/50 tracking-widest uppercase">loading{'.'.repeat(Math.floor(pct/14)%8+1)}</span>
            <span className="text-white font-bold">{pct}%</span>
          </div>
          <div className="loading-bar-bg">
            <motion.div className="loading-bar-fill"
              style={{ width:`${pct}%` }}
              transition={{ duration: 0.1 }} />
          </div>
          <AnimatePresence mode="wait">
            <motion.p key={tip} initial={{ opacity:0, y:4 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-4 }}
              className="text-center text-[11px] text-white/30 italic tracking-wide mt-1">
              💡 {tip}
            </motion.p>
          </AnimatePresence>
        </motion.div>
      </div>
    </motion.div>
  )
}

function CharacterSelect() {
  const { playerName, playerColor, setProfile, setView } = useAppStore()
  const initIdx = Math.max(0, CHARACTERS.findIndex(c => c.color === playerColor))
  const [activeIdx, setActiveIdx] = useState(initIdx)
  const [name,  setName]  = useState(playerName || '')
  const [shake, setShake] = useState(false)
  const swiperRef = useRef(null)
  const inputRef  = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const char = CHARACTERS[activeIdx]

  const confirm = () => {
    if (!name.trim()) { setShake(true); setTimeout(() => setShake(false), 500); return }
    setProfile(name.trim(), char.color)
    setView('lobby')
  }

  const charStyles = {
    '--char-hex': char.hex,
    '--char-hex-fade': `${char.hex}35`,
    '--char-hex-border': `${char.hex}90`,
    '--char-hex-glow': `${char.hex}55`,
  }

  return (
    <motion.div className="menu-view-container"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      {/* Video background */}
      <video
        autoPlay loop muted playsInline
        className="absolute inset-0 w-full h-full object-cover z-0 pointer-events-none"
        style={{ opacity: 0.45 }}
      >
        <source src="assets/videos/videobackgroud.mp4" type="video/mp4" />
      </video>
      {/* Dark overlay để text dễ đọc */}
      <div className="absolute inset-0 z-0 pointer-events-none"
        style={{ background: 'linear-gradient(135deg,#02061799 0%,#080d1acc 40%,#050b18bb 100%)' }} />

      <div className="absolute inset-0 pointer-events-none transition-all duration-700"
        style={{ background: `radial-gradient(ellipse 70% 50% at 50% 60%, ${char.hex}18 0%, transparent 70%)` }} />

      <motion.div className="char-select-header"
        initial={{ y: -16, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
        <img src="assets/Images/logo/logo.png" alt="logo" className="header-logo"
          style={{ filter: `drop-shadow(0 0 20px ${char.hex}a0) drop-shadow(0 0 40px rgba(6,182,212,0.45))` }} />
        <div className="flex items-center gap-3 mt-2">
          <div style={{ height: 1, width: 36, background: `linear-gradient(90deg, transparent, ${char.hex}70)` }} />
          <span className="text-white/60 text-[11px] font-extrabold tracking-[0.5em] uppercase">Chọn nhân vật</span>
          <div style={{ height: 1, width: 36, background: `linear-gradient(90deg, ${char.hex}70, transparent)` }} />
        </div>
      </motion.div>

      <div className="char-select-body" style={charStyles}>
        {/* SWIPER COLUMN */}
        <motion.div className="swiper-container-wrapper"
          initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.1 }}>
          
          <button className="swiper-nav-btn prev" onClick={() => swiperRef.current?.slidePrev()}>‹</button>
          <button className="swiper-nav-btn next" onClick={() => swiperRef.current?.slideNext()}>›</button>

          <Swiper
            onSwiper={s => { swiperRef.current = s }}
            onSlideChange={s => setActiveIdx(s.realIndex)}
            effect="coverflow" grabCursor centeredSlides 
            slideToClickedSlide={true}
            slidesPerView={1.8}
            breakpoints={{
              640: { slidesPerView: 2.2 },
              1024: { slidesPerView: 2.5 }
            }}
            loop={true} initialSlide={activeIdx} keyboard={{ enabled: true }}
            coverflowEffect={{ rotate: 5, stretch: 0, depth: 150, modifier: 2, slideShadows: false }}
            modules={[EffectCoverflow, Keyboard, Navigation]}
            className="character-swiper"
            style={{ padding: '40px 0' }}
          >
            {CHARACTERS.map((c) => (
              <SwiperSlide key={c.id}>
                {({ isActive }) => {
                  const slideVars = {
                    '--char-hex': c.hex,
                    '--char-hex-fade': `${c.hex}35`,
                    '--char-hex-border': `${c.hex}90`,
                    '--char-hex-glow': `${c.hex}55`,
                  }
                  return (
                    <div className={`char-card-slide ${isActive ? 'char-card-active' : ''}`}
                      style={slideVars}>
                      <CharacterAvatar avatar={c.avatar} hex={c.hex} size={isActive ? 140 : 80} active={isActive} />
                      <p style={{
                        color: isActive ? c.hex : 'rgba(255,255,255,0.25)',
                        fontWeight: 800, fontSize: isActive ? 16 : 10,
                        letterSpacing: 2, textTransform: 'uppercase', marginTop: 15
                      }}>{c.label}</p>
                    </div>
                  )
                }}
              </SwiperSlide>
            ))}
          </Swiper>
        </motion.div>

        {/* INFO COLUMN */}
        <motion.div className="info-column"
          initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.15 }}>
          <AnimatePresence mode="wait">
            <motion.div key={char.id} className="char-info-card"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <div className="card-accent-bar" style={{ background: `linear-gradient(90deg, ${char.hex}, #8b5cf6)` }} />
              <div className="card-header">
                <CharacterAvatar avatar={char.avatar} hex={char.hex} size={56} active />
                <div>
                  <p style={{ color: char.hex, fontWeight: 900, fontSize: 20, letterSpacing: 0.5, margin: 0 }}>{char.label}</p>
                  <span style={{
                    fontSize: 8, fontWeight: 800, letterSpacing: 2, padding: '2px 8px', borderRadius: 99,
                    background: `${char.hex}20`, color: char.hex, border: `1px solid ${char.hex}40`,
                  }}>{char.gender.toUpperCase()}</span>
                </div>
              </div>
              <div className="card-body">
                <div className="info-item">
                  <span className="info-item-label">Tính cách</span>
                  <span className="info-item-value">{char.trait}</span>
                </div>
                <div className="info-item">
                  <span className="info-item-label">Giới thiệu</span>
                  <p className="intro-paragraph">{char.desc}</p>
                </div>
                <div className="stats-grid">
                  <div className="stat-box">
                    <span className="info-item-label">⚡ Điểm mạnh</span>
                    <span style={{ color:'#22c55e', fontSize:11, fontWeight:700 }}>{char.strength}</span>
                  </div>
                  <div className="stat-box">
                    <span className="info-item-label">💧 Điểm yếu</span>
                    <span style={{ color:'#f87171', fontSize:11, fontWeight:700 }}>{char.weakness}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          <div className="input-section-card">
            <span className="info-item-label">Tên người chơi</span>
            <div className={`name-input-container ${shake ? 'animate-shake' : ''}`}>
              <div className="input-avatar-small">
                <img src={`assets/Images/avatar/${char.avatar}`} alt="" className="w-full h-full object-cover" />
              </div>
              <input ref={inputRef} type="text" maxLength={12} value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && confirm()}
                placeholder="Nhập tên..." className="custom-input"
                style={{ borderColor: name.trim() ? `${char.hex}60` : 'rgba(255,255,255,0.1)' }} />
            </div>
            <motion.button onClick={confirm} disabled={!name.trim()}
              whileHover={name.trim() ? { scale: 1.02 } : {}}
              whileTap={name.trim() ? { scale: 0.98 } : {}}
              className="btn-confirm"
              style={{
                background: name.trim() ? `linear-gradient(135deg, #06b6d4, ${char.hex}, #8b5cf6)` : 'rgba(255,255,255,0.05)',
                color: name.trim() ? '#000' : 'rgba(255,255,255,0.2)',
                boxShadow: name.trim() ? `0 10px 25px ${char.hex}40` : 'none',
              }}>
              VÀO SẢNH →
            </motion.button>
          </div>
        </motion.div>
      </div>
    </motion.div>
  )
}

function CharacterAvatar({ avatar, hex, size = 64, active = false }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
      border: `2px solid ${active ? hex+'90' : hex+'35'}`,
      boxShadow: active ? `0 0 18px ${hex}60, 0 0 36px ${hex}22` : 'none',
      background: `${hex}15`, transition: 'all 0.3s',
    }}>
      <img src={`assets/Images/avatar/${avatar}`} alt=""
        className="w-full h-full object-cover block" />
    </div>
  )
}

export function CharacterSprite({ color, file, size = 64 }) {
  const resolvedFile = file || SPRITE_MAP[color] || 'Male 01-1.png'
  const bgW = size * 3
  const bgH = size * 4
  const posX = -size
  return (
    <div style={{
      width: size, height: size, flexShrink: 0,
      backgroundImage: `url(assets/Images/charater/${resolvedFile})`,
      backgroundPosition: `${posX}px 0px`,
      backgroundSize: `${bgW}px ${bgH}px`,
      backgroundRepeat: 'no-repeat',
      imageRendering: 'pixelated',
    }} />
  )
}
