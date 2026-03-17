/**
 * domInput.js
 * Creates a hidden DOM <input> that captures IME/Vietnamese input correctly.
 * Phaser's keyboard events don't support IME composition (Unikey, etc.).
 *
 * Usage:
 *   const inp = createDomInput(scene, { maxLength: 20, initialValue: 'abc' })
 *   inp.focus()
 *   inp.onValue(v => console.log(v))   // called on every change
 *   inp.onEnter(() => submit())
 *   inp.getValue()
 *   inp.setValue('new text')
 *   inp.destroy()
 */
export function createDomInput(scene, { maxLength = 30, initialValue = '' } = {}) {
  const el = document.createElement('input')
  el.type = 'text'
  el.autocomplete = 'off'
  el.autocorrect = 'off'
  el.autocapitalize = 'off'
  el.spellcheck = false
  el.maxLength = maxLength
  el.value = initialValue
  Object.assign(el.style, {
    position: 'fixed',
    opacity: '0',
    pointerEvents: 'none',
    width: '1px',
    height: '1px',
    top: '0',
    left: '0',
    border: 'none',
    outline: 'none',
    background: 'transparent',
    color: 'transparent',
    fontSize: '16px',   // prevent iOS zoom
    zIndex: '-1',
  })
  document.body.appendChild(el)

  let _onValue = null
  let _onEnter = null

  el.addEventListener('input', () => {
    if (el.value.length > maxLength) el.value = el.value.slice(0, maxLength)
    _onValue?.(el.value)
  })
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); _onEnter?.() }
  })

  // Prevent Phaser from stealing keyboard events while this input is focused
  el.addEventListener('keydown', e => e.stopPropagation())
  el.addEventListener('keyup',   e => e.stopPropagation())

  // Clean up when scene shuts down
  scene.events.once('shutdown', () => el.remove())
  scene.events.once('destroy',  () => el.remove())

  return {
    focus()         { el.focus() },
    blur()          { el.blur() },
    getValue()      { return el.value },
    setValue(v)     { el.value = v; _onValue?.(v) },
    onValue(cb)     { _onValue = cb },
    onEnter(cb)     { _onEnter = cb },
    destroy()       { el.remove() },
    get element()   { return el },
  }
}
