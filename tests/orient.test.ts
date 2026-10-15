import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { uprightBytes } from '../src/server/recognition/orient'

/*
  A page photographed sideways or upside down is turned upright before it is read: on a real record the reader got the
  name, the birthday and the contact number wrong, and wrote visits that were not there, while the page was on its side.
*/

const FORM = readFileSync('public/forms/sample-villanueva.png')
const turnedBy = (deg: number) => sharp(FORM).rotate(deg).png().toBuffer()

describe('putting a page the right way up', () => {
  it('leaves a page that is already upright exactly as it came', async () => {
    const r = await uprightBytes(FORM)
    expect(r.turned).toBe(0)
    expect(r.bytes).toBe(FORM)
  })

  it.each([
    [90, 270],
    [180, 180],
    [270, 90],
  ])('turns a form that has been turned %i degrees back, by %i', async (by, back) => {
    const r = await uprightBytes(await turnedBy(by))
    expect(r.turned).toBe(back)
    // upright again means portrait, like the form itself
    const meta = await sharp(r.bytes).metadata()
    expect(meta.height! > meta.width!).toBe(true)
  })

  it('does not stop a scan when the picture is not something it can read', async () => {
    const junk = Buffer.from('not an image')
    const r = await uprightBytes(junk)
    expect(r).toEqual({ bytes: junk, turned: 0 })
  })
})
