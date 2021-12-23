/* eslint-env jest */

import { shallow } from 'enzyme'
import * as React from 'react'

import { GetNextCoreStates, getNextCoreStates } from '../components/Game/Game'
import { lovetrisAi } from './lovetris-ai'
import hatetrisRotationSystem from '../rotation-systems/hatetris-rotation-system'

// Note: well bits are flipped compared to what you would see on the screen.
// Least significant bit is rendered on the *left* on web, but appears to the
// *right* of each binary numeric literal

const x: GetNextCoreStates = (core, pieceId) => getNextCoreStates(
  hatetrisRotationSystem,
  10,
  8,
  4,
  core,
  pieceId
)

describe('LovetrisAi', () => {
  it('generates I every time right now', () => {
    expect(lovetrisAi({
      score: 0,
      well: [
        0b0000000000,
        0b0000000000,
        0b0000000000,
        0b0000000000,
        0b0000000000,
        0b0000000000,
        0b0000000000,
        0b0000000000
      ]
    }, undefined, x)).toBe('I')
  })
})
