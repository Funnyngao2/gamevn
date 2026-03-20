import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import './taskMiniShared.css'
import './PicturePuzzle.css'

const GRID_SIZE = 3
const TOTAL_TILES = GRID_SIZE * GRID_SIZE
const IMAGE_URL = '/assets/Images/avatar/nam1.png'

export default function PicturePuzzle({ onDone }) {
  // pieces: { id, x, y, isLocked }
  // id is the correct index (0-8)
  const [pieces, setPieces] = useState([])
  const [isSolved, setIsSolved] = useState(false)
  const containerRef = useRef(null)

  useEffect(() => {
    // Khởi tạo các mảnh ghép ở vị trí ngẫu nhiên trong "khay" bên dưới
    const initialPieces = Array.from({ length: TOTAL_TILES }, (_, i) => ({
      id: i,
      // Vị trí ban đầu ngẫu nhiên trong vùng khay (bottom tray)
      initialX: Math.random() * 200 - 100,
      initialY: 150 + Math.random() * 100,
      isLocked: false
    }))
    setPieces(initialPieces)
  }, [])

  const handleDragEnd = (event, info, pieceId) => {
    if (isSolved) return

    // Tìm ô mục tiêu (slot) tương ứng với pieceId
    // Grid là 3x3, mỗi ô 100x100 (giả sử width grid là 300)
    // Ta tính toán dựa trên tọa độ tương đối của piece so với container
    
    // Ở đây dùng cách đơn giản hơn: kiểm tra xem piece có gần tọa độ "đúng" của nó không
    // Tọa độ đúng của mảnh i (r, c): 
    const r = Math.floor(pieceId / GRID_SIZE)
    const c = pieceId % GRID_SIZE
    
    // Tọa độ gốc của Grid trong container (giả sử căn giữa)
    // Nhưng vì ta dùng layout tự do, hãy tính toán offset
    const slotX = c * 104 // 100px width + 4px gap
    const slotY = r * 104 

    // point x, y từ info.point là tọa độ màn hình, ta cần tọa độ so với container
    const rect = containerRef.current.getBoundingClientRect()
    const currentX = info.point.x - rect.left - 50 // -50 để tính từ tâm mảnh ghép
    const currentY = info.point.y - rect.top - 50

    // Kiểm tra khoảng cách tới slot đúng
    const dist = Math.sqrt(Math.pow(currentX - slotX, 2) + Math.pow(currentY - slotY, 2))

    if (dist < 40) {
      // Snap vào vị trí và khóa lại
      const newPieces = pieces.map(p => 
        p.id === pieceId ? { ...p, isLocked: true, currentX: slotX, currentY: slotY } : p
      )
      setPieces(newPieces)

      // Kiểm tra thắng
      if (newPieces.every(p => p.isLocked)) {
        setIsSolved(true)
        setTimeout(onDone, 1200)
      }
    }
  }

  return (
    <div className="mini-root picture-puzzle-root">
      <div className="mini-head">
        <p className="mini-kicker">KHÔI PHỤC DỮ LIỆU</p>
        <h3 className="mini-title">GHÉP TRANH BẢN ĐỒ</h3>
        <p className="mini-desc">Kéo các mảnh vỡ vào đúng vị trí trên bản đồ</p>
      </div>

      <div className="mini-body picture-puzzle-body" ref={containerRef}>
        <div className="puzzle-board">
          {/* Các ô mờ gợi ý (Slots) */}
          <div className="puzzle-slots-grid">
            {Array.from({ length: TOTAL_TILES }).map((_, i) => (
              <div key={i} className="puzzle-slot" />
            ))}
          </div>

          {/* Các mảnh ghép */}
          {pieces.map((p) => {
            const r = Math.floor(p.id / GRID_SIZE)
            const c = p.id % GRID_SIZE

            return (
              <motion.div
                key={p.id}
                drag={!p.isLocked}
                dragMomentum={false}
                onDragEnd={(e, info) => handleDragEnd(e, info, p.id)}
                className={`puzzle-fragment ${p.isLocked ? 'puzzle-fragment--locked' : ''}`}
                initial={{ x: p.initialX, y: p.initialY }}
                animate={p.isLocked ? { x: p.currentX, y: p.currentY, scale: 1, zIndex: 1 } : { scale: 1.05, zIndex: 10 }}
                whileDrag={{ scale: 1.1, zIndex: 20 }}
                style={{
                  width: 100,
                  height: 100,
                  backgroundImage: `url(${IMAGE_URL})`,
                  backgroundSize: `${GRID_SIZE * 100}% ${GRID_SIZE * 100}%`,
                  backgroundPosition: `${(c / (GRID_SIZE - 1)) * 100}% ${(r / (GRID_SIZE - 1)) * 100}%`,
                  position: 'absolute',
                  left: 0,
                  top: 0,
                }}
              >
                {!p.isLocked && <div className="fragment-border" />}
              </motion.div>
            )
          })}
        </div>

        <div className="mini-bar-track">
          <motion.div 
            className={`mini-bar-fill ${isSolved ? 'mini-bar-fill--ok' : ''}`}
            animate={{ width: `${(pieces.filter(p => p.isLocked).length / TOTAL_TILES) * 100}%` }}
          />
        </div>
      </div>

      <div className="mini-hint">Kéo các mảnh từ bên dưới và thả vào ô trống tương ứng</div>
    </div>
  )
}
