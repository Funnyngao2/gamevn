// PreloadScene.js - asset loader, visual handled by React overlay (PhaserGame.jsx)
import Phaser from 'phaser'

export class PreloadScene extends Phaser.Scene {
  constructor() { super('Preload') }

  preload() {
    // Cache-bust để tránh lỗi 304 ERR_FAILED khi chơi ván 2+
    const v = Date.now()
    const img  = (key, path) => this.load.image(key, `${path}?v=${v}`)
    const ss   = (key, path, cfg) => this.load.spritesheet(key, `${path}?v=${v}`, cfg)
    const json = (key, path) => this.load.tilemapTiledJSON(key, `${path}?v=${v}`)
    const audio = (key, path) => this.load.audio(key, path) // audio không bị lỗi này

    // Bridge load progress to React overlay
    this.load.on('progress', v => {
      this.game.registry.get('onLoadProgress')?.(v)
    })
    this.load.on('loaderror', f => console.warn('Failed to load:', f.src))

    // ── Assets ──────────────────────────────────────────────────────────────
    const menuImgs = ['title','back','back2','blue','green','orange','red','yellow',
      'choosecolour','entername','enteraddress','freeplay','online','help',
      'credits','options','quit','input','sel','select','return','imposteramongus',
      'imposteramongusback','shhhhhhh','pink']
    menuImgs.forEach(k => img(k, `assets/Images/menu/${k}.png`))

    const alertImgs = ['defeat','victory','victoryback','victoryback2','eject',
      'emergency_meeting_blue','emergency_meeting_green','emergency_meeting_orange',
      'emergency_meeting_red','emergency_meeting_yellow',
      'report_dead_body_blue','report_dead_body_green','report_dead_body_orange',
      'report_dead_body_red','report_dead_body_yellow']
    alertImgs.forEach(k => img(k, `assets/Images/Alerts/${k}.png`))
    for (let i = 1; i <= 18; i++) img(`kill${i}`, `assets/Images/Alerts/kill${i}.png`)

    const meetImgs = ['chat','chat_dead','checkbox','close','e_vote_base','e_vote_base_dead',
      'proceed','select_vote','skip_vote','voted_players']
    meetImgs.forEach(k => img(k, `assets/Images/Meeting/${k}.png`))

    const itemImgs = ['emergency_button','emergency_button_highlight','emergency_icon',
      'emergency_icon_bright','emergency_icon_inv','generator','generator_highlight',
      'health_pack','gas_can','gas_can_highlighted','fuel_engine','fuel_engine_highlighted',
      'electricity_wires','electricity_wires_connected','electricity_wires_highlight']
    itemImgs.forEach(k => img(k, `assets/Images/Items/${k}.png`))

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
      yellow: 'Female 06-1.png',
      white:  'Female 06-1.png',
    }
    Object.entries(charSprites).forEach(([color, file]) => {
      ss(`char_${color}`, `assets/Images/charater/${file}`, { frameWidth: 32, frameHeight: 32 })
      img(`${color}_dead`, `assets/Images/Player/Dead/Dead${color}.png`)
    })

    json('map', 'assets/Maps/map.json')
    img('map2', 'assets/Maps/map2.png')
    img('minimap', 'assets/Maps/mini_map3.png')

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
    // Notify React overlay that loading is done
    this.game.registry.get('onLoadComplete')?.()
    this.scene.start('Game')
  }
}
