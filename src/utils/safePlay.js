// safePlay - play sound only if it's loaded, silently skip if not
export function safePlay(scene, key, config = {}) {
  if (scene.cache.audio.has(key)) {
    scene.sound.play(key, config)
  }
}
