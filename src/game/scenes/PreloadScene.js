// PreloadScene.js - space-themed loading screen with logo
import Phaser from 'phaser'

export class PreloadScene extends Phaser.Scene {
  constructor() { super('Preload') }

  preload() {
    const { width: W, height: H } = this.scale

    // ── Space background ────────────────────────────────────────────────────
    this.add.rectangle(W/2, H/2, W, H, 0x000008)

    // Stars
    for (let i = 0; i < 180; i++) {
      const x = Phaser.Math.Between(0, W)
      const y = Phaser.Math.Between(0, H)
      const r = Phaser.Math.FloatBetween(0.5, 2)
      const a = Phaser.Math.FloatBetween(0.3, 1)
      const star = this.add.circle(x, y, r, 0xffffff, a)
      this.tweens.add({
        targets: star, alpha: 0.1,
        duration: Phaser.Math.Between(800, 2500),
        yoyo: true, repeat: -1,
        delay: Phaser.Math.Between(0, 2000)
      })
    }

    // ── Logo image ──────────────────────────────────────────────────────────
    if (this.textures.exists('logo')) {
      const logo = this.add.image(W/2, H/2 - 60, 'logo')
      const scale = Math.min(220 / logo.width, 120 / logo.height)
      logo.setScale(scale)
    }

    // ── Progress bar ────────────────────────────────────────────────────────
    const barW = Math.min(W * 0.6, 600)
    const barX = W/2 - barW/2, barY = H/2 + 80, barH = 6

    // Track
    const track = this.add.graphics()
    track.fillStyle(0x1a1a2e, 1)
    track.fillRoundedRect(barX - 1, barY - 1, barW + 2, barH + 2, 4)

    // Fill
    const fill = this.add.graphics()

    // Glow effect on fill
    const glow = this.add.graphics()

    const loadingTxt = this.add.text(barX, barY - 22, 'Đang tải...', {
      fontSize: '13px', color: '#e2e8f0', fontFamily: 'Arial', letterSpacing: 1
    })
    const pctTxt = this.add.text(barX + barW, barY - 22, '0%', {
      fontSize: '13px', color: '#e2e8f0', fontFamily: 'Arial'
    }).setOrigin(1, 0)

    this.load.on('progress', v => {
      fill.clear()
      fill.fillStyle(0x4ecdc4, 1)
      fill.fillRoundedRect(barX, barY, barW * v, barH, 3)

      glow.clear()
      glow.fillStyle(0x4ecdc4, 0.25)
      glow.fillRoundedRect(barX, barY - 3, barW * v, barH + 6, 5)

      const pct = Math.round(v * 100)
      pctTxt.setText(`${pct}%`)
      loadingTxt.setText(pct < 100 ? `Đang tải... ${pct}%` : 'Hoàn tất!')
    })

    this.load.on('loaderror', f => console.warn('Failed to load:', f.src))

    // ── Assets ──────────────────────────────────────────────────────────────
    const menuImgs = ['title','back','back2','blue','green','orange','red','yellow',
      'choosecolour','entername','enteraddress','freeplay','online','help',
      'credits','options','quit','input','sel','select','return','imposteramongus',
      'imposteramongusback','shhhhhhh','pink']
    menuImgs.forEach(k => this.load.image(k, `assets/Images/menu/${k}.png`))

    const alertImgs = ['defeat','victory','victoryback','victoryback2','eject',
      'emergency_meeting_blue','emergency_meeting_green','emergency_meeting_orange',
      'emergency_meeting_red','emergency_meeting_yellow',
      'report_dead_body_blue','report_dead_body_green','report_dead_body_orange',
      'report_dead_body_red','report_dead_body_yellow']
    alertImgs.forEach(k => this.load.image(k, `assets/Images/Alerts/${k}.png`))
    for (let i = 1; i <= 18; i++) this.load.image(`kill${i}`, `assets/Images/Alerts/kill${i}.png`)

    const meetImgs = ['chat','chat_dead','checkbox','close','e_vote_base','e_vote_base_dead',
      'proceed','select_vote','skip_vote','voted_players']
    meetImgs.forEach(k => this.load.image(k, `assets/Images/Meeting/${k}.png`))

    const itemImgs = ['emergency_button','emergency_button_highlight','emergency_icon',
      'emergency_icon_bright','emergency_icon_inv','generator','generator_highlight',
      'health_pack','gas_can','gas_can_highlighted','fuel_engine','fuel_engine_highlighted',
      'electricity_wires','electricity_wires_connected','electricity_wires_highlight']
    itemImgs.forEach(k => this.load.image(k, `assets/Images/Items/${k}.png`))

    // ── Character sprite sheets (3 cols × 4 rows, 32×32 each) ──────────────
    const charSprites = {
      pink:   'Female 06-1.png',
      black:  'Female 07-1.png',
      brown:  'Female 08-1.png',
      purple: 'Female 09-1.png',
      red:    'Male 01-1.png',
      blue:   'Male 10-1.png',
      green:  'Male 14-1.png',
      orange: 'Male 16-1.png',
      // yellow and white reuse existing sheets
      yellow: 'Female 06-1.png',
      white:  'Female 06-1.png',
    }
    Object.entries(charSprites).forEach(([color, file]) => {
      this.load.spritesheet(`char_${color}`, `assets/Images/charater/${file}`, {
        frameWidth: 32, frameHeight: 32
      })
      this.load.image(`${color}_dead`, `assets/Images/Player/Dead/Dead${color}.png`)
    })

    this.load.tilemapTiledJSON('map', 'assets/Maps/map.json')
    this.load.image('map2', 'assets/Maps/map2.png')
    this.load.image('minimap', 'assets/Maps/mini_map3.png')

    const sfx = ['task_complete','roundstart','swap','vent','report_Bodyfound',
      'alarm_emergencymeeting','victory_crew','victory_impostor','victory_disconnect',
      'crises','crisesback','gas_can_fill','pick_up_gas_can']
    sfx.forEach(k => this.load.audio(k, `assets/Sounds/General/${k}.ogg`))
    const killSfx = ['imposter_kill','imposter_kill_cooldown','imposter_kill_victim']
    killSfx.forEach(k => this.load.audio(k, `assets/Sounds/Kill/${k}.ogg`))
    const uiSfx = ['back','back2','select','select2','selected','selected2',
      'keypress','backspace','pause','map_btn_click','UI_Select',
      'votescreen_avote','votescreen_locking']
    uiSfx.forEach(k => this.load.audio(k, `assets/Sounds/UI/${k}.ogg`))
    for (let i = 1; i <= 8; i++)
      this.load.audio(`footstep0${i}`, `assets/Sounds/Footsteps/Footstep0${i}.ogg`)
    this.load.audio('bg_music', 'assets/Sounds/Background/background.ogg')
    this.load.audio('main_menu_music', 'assets/Sounds/Background/main_menu_music.mp3')
  }

  create() {
    this.scene.start('Game')
  }
}
