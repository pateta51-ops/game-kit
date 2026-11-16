import { describe, expect, it } from 'vitest'
import { untranscribed } from './index.ts'

const icons = { gold: { label: 'gold', body: '<circle r="5"/>' } }
const data = { id: 'c-104', title: 'Scout', flavor: 'Quiet feet.', rules: ['Pay [[gold]].'], cost: 2 }

describe('untranscribed (K235)', () => {
  it('lists card fields the transcription lacks; ignored fields are skipped', () => {
    const src = { title: data.title, printed: [{ text: 'Pay [[gold]].' }], tokens: [{ label: 'Cost', count: 2 }] }
    expect(untranscribed(data, src, { icons }, ['id'])).toEqual([{ path: 'flavor', text: 'Quiet feet.' }])
    expect(untranscribed(data, { ...src, notes: [{ text: 'Quiet feet.' }] }, { icons }, ['id'])).toEqual([])
  })
})
