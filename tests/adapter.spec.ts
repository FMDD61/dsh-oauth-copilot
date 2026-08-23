import { describe, expect, it } from 'vitest'
import { normalizeStringContent } from '../src/adapter.js'

describe('normalizeStringContent', () => {
  it('converts string content to a text block array', () => {
    const out = normalizeStringContent([
      { role: 'user', content: 'hello' },
    ])
    expect(out[0].content).toEqual([{ type: 'text', text: 'hello' }])
  })

  it('leaves block-array content untouched', () => {
    const message = { role: 'user', content: [{ type: 'text', text: 'hi' }] }
    expect(normalizeStringContent([message])[0]).toBe(message)
  })
})
