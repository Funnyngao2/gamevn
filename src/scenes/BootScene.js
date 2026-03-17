export class BootScene extends Phaser.Scene {
  constructor() { super('Boot') }

  preload() {
    this.load.image('title', 'assets/Images/menu/title.png')
    this.load.image('logo', 'assets/Images/logo/logo.png')
  }

  create() {
    this.scene.start('Preload')
  }
}
