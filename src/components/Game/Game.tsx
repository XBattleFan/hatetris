/**
  HATETRIS instance builder
*/

import * as React from 'react'
import type { ReactElement } from 'react'

import { hatetrisAi } from '../../enemy-ais/hatetris-ai'
import { lovetrisAi } from '../../enemy-ais/lovetris-ai'
import { brzAi } from '../../enemy-ais/brzustowski'
import { burgAi } from '../../enemy-ais/burgiel'
import hatetrisReplayCodec from '../../replay-codecs/hatetris-replay-codec'
import { Well } from '../Well/Well'
import './Game.css'

const minWidth = 4

const moves = ['L', 'R', 'D', 'U']

type Piece = {
  x: number,
  y: number,
  o: number,
  id: string
}

type Orientation = {
  yMin: number,
  yDim: number,
  xMin: number,
  xDim: number,
  rows: number[]
}

type Rotations = {
  [pieceId: string]: Orientation[]
}

type RotationSystem = {
  placeNewPiece: (wellWidth: number, pieceId: string) => Piece;
  rotations: Rotations
}

type CoreState = {
  score: number,
  well: number[],
}

type WellState = {
  core: CoreState,
  ai: any,
  piece: Piece
}

type GetNextCoreStates = (core: CoreState, pieceId: string) => CoreState[]

type EnemyAi = (
  currentCoreState: CoreState,
  currentAiState: any,
  getNextCoreStates: GetNextCoreStates
) => (string | [string, any])

type Enemy = {
  shortDescription: string | ReactElement,
  buttonDescription: string,
  ai: EnemyAi
}

type GameProps = {
  bar: number,
  replayTimeout: number,
  rotationSystem: RotationSystem,
  wellDepth: number,
  wellWidth: number
}

type GameState = {
  error: {
    interpretation: string,
    real: string
  },
  displayEnemy: boolean,
  enemy: Enemy,
  customAiCode: string,
  mode: string,
  wellStateId: number,
  wellStates: WellState[],
  replay: any[],
  textForClipboard: string,
  replayCopiedTimeoutId: ReturnType<typeof setTimeout>,
  replayTimeoutId: ReturnType<typeof setTimeout>
}

export type { CoreState, WellState, GameProps, RotationSystem, EnemyAi, GetNextCoreStates }

export const hatetris: Enemy = {
  shortDescription: 'HATETRIS',
  buttonDescription: 'HATETRIS, the original and worst',
  ai: hatetrisAi
}

export const lovetris: Enemy = {
  shortDescription: '❤️',
  buttonDescription: 'all 4x1 pieces, all the time',
  ai: lovetrisAi
}

export const brz: Enemy = {
  shortDescription: (
    <a
      href='https://open.library.ubc.ca/media/download/pdf/831/1.0079748/1'
    >
      Brzustowski
    </a>
  ),
  buttonDescription: 'Brzustowski (1992)',
  ai: brzAi
}

const burg: Enemy = {
  shortDescription: (
    <a
      href='https://citeseerx.ist.psu.edu/viewdoc/download?doi=10.1.1.55.8562&rep=rep1&type=pdf'
    >
      Burgiel
    </a>
  ),
  buttonDescription: 'Burgiel (1997)',
  ai: burgAi
}

const enemies = [hatetris, lovetris, brz, burg]

const pieceIds = ['I', 'J', 'L', 'O', 'S', 'T', 'Z']

/**
  Input {wellState, piece} and a move, return
  the new {wellState, piece}.
*/
const getNextState = (
  rotationSystem: RotationSystem,
  wellWidth: number,
  wellDepth: number,
  bar: number,
  wellState: WellState,
  move: string
): WellState => {
  let nextWell = wellState.core.well
  let nextScore = wellState.core.score
  const nextAiState = wellState.ai
  let nextPiece = { ...wellState.piece }

  // apply transform
  if (move === 'L') {
    nextPiece.x--
  }
  if (move === 'R') {
    nextPiece.x++
  }
  if (move === 'D') {
    nextPiece.y++
  }
  if (move === 'U') {
    nextPiece.o = (nextPiece.o + 1) % 4
  }

  const orientation = rotationSystem.rotations[nextPiece.id][nextPiece.o]
  const xActual = nextPiece.x + orientation.xMin
  const yActual = nextPiece.y + orientation.yMin

  if (
    xActual < 0 || // off left side
    xActual + orientation.xDim > wellWidth || // off right side
    yActual < 0 || // off top (??)
    yActual + orientation.yDim > wellDepth || // off bottom
    orientation.rows.some((row, y) =>
      wellState.core.well[yActual + y] & (row << xActual)
    ) // obstruction
  ) {
    if (move === 'D') {
      // Lock piece
      nextWell = wellState.core.well.slice()

      const orientation = rotationSystem.rotations[wellState.piece.id][wellState.piece.o]

      // this is the top left point in the bounding box of this orientation of this piece
      const xActual = wellState.piece.x + orientation.xMin
      const yActual = wellState.piece.y + orientation.yMin

      // row by row bitwise line alteration
      for (let row = 0; row < orientation.yDim; row++) {
        // can't negative bit-shift, but alas X can be negative
        nextWell[yActual + row] |= (orientation.rows[row] << xActual)
      }

      // check for complete lines now
      // NOTE: completed lines don't count if you've lost
      for (let row = 0; row < orientation.yDim; row++) {
        if (
          yActual >= bar &&
          nextWell[yActual + row] === (1 << wellWidth) - 1
        ) {
          // move all lines above this point down
          for (let k = yActual + row; k > 1; k--) {
            nextWell[k] = nextWell[k - 1]
          }

          // insert a new blank line at the top
          // though of course the top line will always be blank anyway
          nextWell[0] = 0

          nextScore++
        }
      }
      nextPiece = null
    } else {
      // No move
      nextPiece = wellState.piece
    }
  }

  return {
    core: {
      well: nextWell,
      score: nextScore
    },
    ai: nextAiState,
    piece: nextPiece
  }
}

/**
  Generate a unique integer to describe the position and orientation of this piece.
  `x` varies between -3 and (`wellWidth` - 1) inclusive, so range = `wellWidth` + 3
  `y` varies between 0 and (`wellDepth` + 2) inclusive, so range = `wellDepth` + 3
  `o` varies between 0 and 3 inclusive, so range = 4
*/
const hashCode = (wellDepth: number, piece: Piece): number =>
  (piece.x * (wellDepth + 3) + piece.y) * 4 + piece.o

/**
  Given a well and a piece ID, find all possible places where it could land
  and return the array of "possible future" states. All of these states
  will have `null` `piece` because the piece is landed; some will have
  a positive `score`.
*/
export const getNextCoreStates = (
  rotationSystem: RotationSystem,
  wellWidth: number,
  wellDepth: number,
  bar: number,
  core: CoreState,
  pieceId: string
): CoreState[] => {
  let piece = rotationSystem.placeNewPiece(wellWidth, pieceId)

  // move the piece down to a lower position before we have to
  // start pathfinding for it
  // move through empty rows
  while (
    piece.y + 4 < wellDepth && // piece is above the bottom
    core.well[piece.y + 4] === 0 // nothing immediately below it
  ) {
    piece = getNextState(rotationSystem, wellWidth, wellDepth, bar, {
      core,
      ai: undefined,
      piece
    }, 'D').piece
  }

  const piecePositions = [piece]

  const seen = new Set()
  seen.add(hashCode(wellDepth, piece))

  const possibleFutures: CoreState[] = []

  // A simple `forEach` won't work here because we are appending to the list as we go
  let i = 0
  while (i < piecePositions.length) {
    piece = piecePositions[i]

    // apply all possible moves
    moves.forEach(move => {
      const nextState = getNextState(rotationSystem, wellWidth, wellDepth, bar, {
        core,
        ai: undefined,
        piece
      }, move)
      const newPiece = nextState.piece

      if (newPiece === null) {
        // piece locked? better add that to the list
        // do NOT check locations, they aren't significant here
        possibleFutures.push(nextState.core)
      } else {
        // transform succeeded?
        // new location? append to list
        // check locations, they are significant
        const newHashCode = hashCode(wellDepth, newPiece)

        if (!seen.has(newHashCode)) {
          piecePositions.push(newPiece)
          seen.add(newHashCode)
        }
      }
    })
    i++
  }

  return possibleFutures
}

export const Game = React.memo((props: GameProps) => {
  const {
    rotationSystem,
    replayTimeout,
    bar,
    wellDepth,
    wellWidth
  } = props

  if (Object.keys(rotationSystem.rotations).length < 1) {
    throw Error('Have to have at least one piece!')
  }

  if (wellDepth < bar) {
    throw Error("Can't have well with depth " + String(wellDepth) + ' less than bar at ' + String(bar))
  }

  if (wellWidth < minWidth) {
    throw Error("Can't have well with width " + String(wellWidth) + ' less than ' + String(minWidth))
  }

  const [error, setError] = React.useState(null)
  const [displayEnemy, setDisplayEnemy] = React.useState(false) // don't show it unless the user selects one manually
  const [enemy, setEnemy] = React.useState(hatetris)
  const [customAiCode, setCustomAiCode] = React.useState('')
  const [mode, setMode] = React.useState('INITIAL')
  const [wellStateId, setWellStateId] = React.useState(-1)
  const [wellStates, setWellStates] = React.useState([])
  const [replay, setReplay] = React.useState([])
  const [textForClipboard, setTextForClipboard] = React.useState(undefined)
  const [replayCopiedTimeoutId, setReplayCopiedTimeoutId] = React.useState(undefined)
  const [replayTimeoutId, setReplayTimeoutId] = React.useState(undefined)

  const validateAiResult = React.useCallback((coreState: CoreState, aiState: any) => {
    const x: GetNextCoreStates = (core, pieceId) => getNextCoreStates(
      rotationSystem,
      wellWidth,
      wellDepth,
      bar,
      core,
      pieceId
    )

    const aiResult: any = enemy.ai(
      coreState,
      aiState,
      x
    )

    const [unsafePieceId, nextAiState] = Array.isArray(aiResult)
      ? aiResult
      : [aiResult, aiState]

    if (pieceIds.includes(unsafePieceId)) {
      return [unsafePieceId, nextAiState]
    }

    throw Error(`Bad piece ID: ${unsafePieceId}`)
  }, [rotationSystem, wellWidth, wellDepth, bar, enemy])

  const getFirstWellState = (): WellState => {
    const firstCoreState = {
      well: Array(wellDepth).fill(0),
      score: 0
    }

    const [firstPieceId, firstAiState] = validateAiResult(firstCoreState, undefined)

    return {
      core: firstCoreState,
      ai: firstAiState,
      piece: rotationSystem.placeNewPiece(wellWidth, firstPieceId)
    }
  }

  const handleClickStart = () => {
    // there may be a replay in progress, this
    // must be killed
    clearTimeout(replayTimeoutId)
    clearTimeout(replayCopiedTimeoutId)

    let firstWellState: WellState
    try {
      firstWellState = getFirstWellState()
    } catch (error) {
      console.error(error)
      setError({
        interpretation: 'Caught this exception while trying to generate the first piece using your custom enemy AI. Game abandoned.',
        real: error.message
      })
      return
    }

    // clear the field and get ready for a new game
    setMode('PLAYING')
    setWellStates([firstWellState])
    setWellStateId(0)
    setReplay([])
    setReplayCopiedTimeoutId(undefined)
    setReplayTimeoutId(undefined)
  }

  const handleClickSelectAi = () => {
    setMode('SELECT_AI')
  }

  const handleClickReplay = () => {
    // there may be a replay in progress, this
    // must be killed
    clearTimeout(replayTimeoutId)

    // user inputs replay string
    const string = window.prompt('Paste replay string...')

    if (string === null) {
      return
    }

    const replay = hatetrisReplayCodec.decode(string)
    // TODO: what if the replay is bad?

    let firstWellState: WellState
    try {
      firstWellState = getFirstWellState()
    } catch (error) {
      console.error(error)
      setError({
        interpretation: 'Caught this exception while trying to generate the first piece using your custom enemy AI. Game abandoned.',
        real: error.message
      })
      return
    }

    const wellStateId = 0
    const newReplayTimeoutId = wellStateId in replay
      ? setTimeout(handleReplayTimeout, replayTimeout)
      : undefined
    const mode = wellStateId in replay ? 'REPLAYING' : 'PLAYING'

    // GO.
    setMode(mode)
    setWellStates([firstWellState])
    setWellStateId(wellStateId)
    setReplay(replay)
    setReplayTimeoutId(newReplayTimeoutId)
  }

  // We have a nightmare here because `setTimeout` captures the OLD `handleReplayTimeout`,
  // which in turn captures the old `mode`!!
  const handleReplayTimeout = React.useCallback(() => {
    let nextReplayTimeoutId

    if (mode === 'REPLAYING') {
      handleRedo()

      if (wellStateId + 1 in replay) {
        nextReplayTimeoutId = setTimeout(handleReplayTimeout, replayTimeout)
      }
    } else {
      console.warn('Ignoring input replay step because mode is', mode)
    }

    setReplayTimeoutId(nextReplayTimeoutId)
  }, [mode, handleRedo, wellStateId, replay])

  // Accepts the input of a move and attempts to apply that
  // transform to the live piece in the live well.
  // Returns the new state.
  const handleMove = React.useCallback((move: string) => {
    const nextWellStateId = wellStateId + 1

    let nextReplay
    let nextWellStates

    if (wellStateId in replay && move === replay[wellStateId]) {
      nextReplay = replay
      nextWellStates = wellStates
    } else {
      // Push the new move
      nextReplay = replay.slice(0, wellStateId).concat([move])

      // And truncate the future
      nextWellStates = wellStates.slice(0, wellStateId + 1)
    }

    if (!(nextWellStateId in nextWellStates)) {
      const nextWellState = getNextState(rotationSystem, wellWidth, wellDepth, bar, nextWellStates[wellStateId], move)
      nextWellStates = [...nextWellStates, nextWellState]
    }

    const nextWellState = nextWellStates[nextWellStateId]

    // Is the game over?
    // It is impossible to get bits at row (bar - 2) or higher without getting a bit at
    // row (bar - 1), so there is only one line which we need to check.
    const gameIsOver = nextWellState.core.well[bar - 1] !== 0

    const nextMode = gameIsOver ? 'GAME_OVER' : mode

    // no live piece? make a new one
    // suited to the new world, of course
    if (nextWellState.piece === null && nextMode !== 'GAME_OVER') {
      let pieceId: string
      let aiState: any
      try {
        // TODO: `nextWellState.core.well` should be more complex and contain colour
        // information, whereas the well passed to the AI should be a simple
        // array of integers
        [pieceId, aiState] = validateAiResult(nextWellState.core, nextWellState.ai)
      } catch (error) {
        console.error(error)
        setError({
          interpretation: 'Caught this exception while trying to generate a new piece using your custom AI. Game halted.',
          real: error.message
        })
        return
      }

      nextWellState.ai = aiState
      nextWellState.piece = rotationSystem.placeNewPiece(wellWidth, pieceId)
    }

    setMode(nextMode)
    setWellStates(nextWellStates)
    setWellStateId(nextWellStateId)
    setReplay(nextReplay)
  }, [wellStateId, replay, rotationSystem, wellWidth, wellDepth, bar, validateAiResult])

  const handleLeft = React.useCallback(() => {
    if (mode === 'PLAYING') {
      handleMove('L')
    } else {
      console.warn('Ignoring event L because mode is', mode)
    }
  }, [mode, handleMove])

  const handleRight = () => {
    if (mode === 'PLAYING') {
      handleMove('R')
    } else {
      console.warn('Ignoring event R because mode is', mode)
    }
  }

  const handleDown = () => {
    if (mode === 'PLAYING') {
      handleMove('D')
    } else {
      console.warn('Ignoring event D because mode is', mode)
    }
  }

  const handleUp = () => {
    if (mode === 'PLAYING') {
      handleMove('U')
    } else {
      console.warn('Ignoring event U because mode is', mode)
    }
  }

  const handleUndo = () => {
    // There may be a replay in progress, this
    // must be killed
    clearTimeout(replayTimeoutId)
    setReplayTimeoutId(undefined)

    const nextWellStateId = wellStateId - 1
    if (nextWellStateId in wellStates) {
      setMode('PLAYING')
      setWellStateId(nextWellStateId)
    } else {
      console.warn('Ignoring undo event because start of history has been reached')
    }
  }

  const handleRedo = () => {
    if (mode === 'PLAYING' || mode === 'REPLAYING') {
      if (wellStateId in replay) {
        handleMove(replay[wellStateId])
      } else {
        console.warn('Ignoring redo event because end of history has been reached')
      }
    } else {
      console.warn('Ignoring redo event because mode is', mode)
    }
  }

  const handleDocumentKeyDown = React.useCallback((event: KeyboardEvent) => {
    if (event.key === 'Left' || event.key === 'ArrowLeft') {
      handleLeft()
    }

    if (event.key === 'Right' || event.key === 'ArrowRight') {
      handleRight()
    }

    if (event.key === 'Down' || event.key === 'ArrowDown') {
      handleDown()
    }

    if (event.key === 'Up' || event.key === 'ArrowUp') {
      handleUp()
    }

    if (event.key === 'z' && event.ctrlKey === true) {
      handleUndo()
    }

    if (event.key === 'y' && event.ctrlKey === true) {
      handleRedo()
    }
  }, [handleLeft, handleRight, handleDown, handleUp, handleUndo, handleRedo])

  React.useEffect(() => {
    document.addEventListener('keydown', handleDocumentKeyDown)

    return () => {
      document.removeEventListener('keydown', handleDocumentKeyDown)
    }
  }, [handleDocumentKeyDown])

  const handleClickCopyReplay = () => {
    setTextForClipboard(hatetrisReplayCodec.encode(replay))
  }

  const handleClickDone = () => {
    setMode('INITIAL')
  }

  const handleClickEnemy = (enemy: Enemy) => {
    setEnemy(enemy)
    setDisplayEnemy(true)
    setMode('INITIAL')
  }

  const handleClickCustomEnemy = () => {
    setMode('PASTE')
  }

  const handleCancelCustomEnemy = () => {
    setMode('SELECT_AI')
  }

  const handleCustomAiChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setCustomAiCode(event.target.value)
  }

  const handleSubmitCustomEnemy = () => {
    let ai: EnemyAi
    try {
      // eslint-disable-next-line no-new-func
      ai = Function(`
        "use strict"
        return (${customAiCode})
      `)()
    } catch (error) {
      console.error(error)
      setError({
        interpretation: 'Caught this exception while trying to evaluate your custom AI JavaScript.',
        real: error.message
      })
      return
    }

    handleClickEnemy({
      shortDescription: 'custom',
      buttonDescription: 'this is never actually used',
      ai
    })
  }

  const handleClickDismissError = () => {
    setError(null)
  }

  // Any time either of these timeouts changes, set up a callback to clear them
  // on unmount
  React.useEffect(() => {
    if (replayCopiedTimeoutId !== undefined) {
      return () => {
        clearTimeout(replayCopiedTimeoutId)
      }
    }
  }, [replayCopiedTimeoutId])

  React.useEffect(() => {
    if (replayTimeoutId !== undefined) {
      return () => {
        clearTimeout(replayTimeoutId)
      }
    }
  }, [replayTimeoutId])

  const wellState = wellStateId === -1 ? null : wellStates[wellStateId]

  const score = wellState && wellState.core.score

  if (error !== null) {
    return (
      <div className='game'>
        <h2 style={{ fontWeight: 'bold', fontSize: '150%' }}>Error</h2>
        <p>
          <code style={{ fontFamily: 'monospace' }}>{error.real}</code>
        </p>
        <p>
          {error.interpretation}
        </p>

        <h3 style={{ fontWeight: 'bold' }}>To fix this</h3>
        <p>
          Check your browser console for more information.
          Use this information to fix your AI code and submit it again.
          Or, use one of the preset AIs instead.
        </p>

        <p>
          <button
            className='game__button e2e__dismiss-error'
            type='button'
            onClick={handleClickDismissError}
          >
            OK
          </button>
        </p>
      </div>
    )
  }

  React.useEffect(() => {
    if (textForClipboard !== undefined) {
      navigator.clipboard.writeText(textForClipboard) // asynchronous, but don't wait
      clearTimeout(replayCopiedTimeoutId)
      setTextForClipboard(undefined)
      setReplayCopiedTimeoutId(setTimeout(() => {
        setReplayCopiedTimeoutId(undefined)
      }, 3000))
    }
  }, [textForClipboard])

  return (
    <div className='game'>
      <div className='game__top'>
        <div className='game__topleft'>
          <Well
            bar={bar}
            rotationSystem={rotationSystem}
            wellDepth={wellDepth}
            wellWidth={wellWidth}
            wellState={wellState}
          />
        </div>
        <div className='game__topright'>
          <p className='game__paragraph'>
            you&apos;re playing <b>HATETRIS</b> by qntm
          </p>

          {displayEnemy && (
            <p className='game__paragraph e2e__enemy-short'>
              AI: {enemy.shortDescription}
            </p>
          )}

          {score !== null && (
            <p className='game__paragraph e2e__score'>
              score: {score}
            </p>
          )}

          <div className='game__spacer' />

          <p className='game__paragraph'>
            <a href='http://qntm.org/hatetris'>
              about
            </a>
          </p>

          <p className='game__paragraph'>
            <a href='https://github.com/qntm/hatetris'>
              source code
            </a>
          </p>

          <p className='game__paragraph'>
            replays encoded using <a href='https://github.com/qntm/base2048'>Base2048</a>
          </p>
        </div>
      </div>

      {mode === 'INITIAL' && (
        <div className='game__bottom'>
          <button
            className='game__button e2e__start-button'
            type='button'
            onClick={handleClickStart}
          >
            start new game
          </button>

          <div className='game__paragraph' style={{ display: 'flex', gap: '10px' }}>
            <button
              className='game__button e2e__replay-button'
              type='button'
              onClick={handleClickReplay}
            >
              show a replay
            </button>

            <button
              className='game__button e2e__select-ai'
              type='button'
              onClick={handleClickSelectAi}
            >
              select AI
            </button>
          </div>
        </div>
      )}

      {mode === 'SELECT_AI' && (
        <div className='game__bottom game__bottom--select-ai'>
          <p>
            Select AI:
          </p>
          {
            enemies.map(enemy => (
              <button
                className='game__button e2e__enemy'
                key={enemy.buttonDescription}
                type='button'
                onClick={() => handleClickEnemy(enemy)}
              >
                {enemy.buttonDescription}
              </button>
            ))
          }

          <button
            className='game__button e2e__custom-enemy'
            type='button'
            onClick={handleClickCustomEnemy}
          >
            use custom AI
          </button>
        </div>
      )}

      {mode === 'PASTE' && (
        <div className='game__bottom'>
          <p>Enter custom code:</p>
          <div>
            <textarea
              autoFocus
              style={{ width: '100%' }}
              onChange={handleCustomAiChange}
              className='e2e__ai-textarea'
            >
              {customAiCode}
            </textarea>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <p style={{ flex: '1 1 100%' }}>
              <a href="https://github.com/qntm/hatetris#writing-a-custom-ai">
                how to write a custom AI
              </a>
            </p>
            <button
              className='game__button e2e__cancel-custom-enemy'
              type='button'
              onClick={handleCancelCustomEnemy}
            >
              cancel
            </button>
            <button
              className='game__button e2e__submit-custom-enemy'
              type='button'
              onClick={handleSubmitCustomEnemy}
            >
              go
            </button>
          </div>
        </div>
      )}

      {mode === 'PLAYING' && (
        <div className='game__bottom'>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              className='game__button'
              disabled={!(wellStateId - 1 in wellStates)}
              type='button'
              onClick={handleUndo}
              title='Press Ctrl+Z to undo'
            >
              ↶
            </button>
            <button
              className='game__button e2e__up'
              type='button'
              onClick={handleUp}
              title='Press Up to rotate'
            >
              ⟳
            </button>
            <button
              className='game__button'
              disabled={!(wellStateId + 1 in wellStates)}
              type='button'
              onClick={handleRedo}
              title='Press Ctrl+Y to redo'
            >
              ↷
            </button>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              className='game__button e2e__left'
              type='button'
              onClick={handleLeft}
              title='Press Left to move left'
            >
              ←
            </button>
            <button
              className='game__button e2e__down'
              type='button'
              onClick={handleDown}
              title='Press Down to move down'
            >
              ↓
            </button>
            <button
              className='game__button e2e__right'
              type='button'
              onClick={handleRight}
              title='Press Right to move right'
            >
              →
            </button>
          </div>
        </div>
      )}

      {mode === 'REPLAYING' && (
        <div className='game__bottom'>
          replaying...
        </div>
      )}

      {mode === 'GAME_OVER' && (
        <div className='game__bottom'>
          <div>
            replay of last game:
          </div>
          <div className='game__replay-out e2e__replay-out'>
            {hatetrisReplayCodec.encode(replay)}
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              className='game__button e2e__replay-button'
              type='button'
              onClick={handleUndo}
            >
              undo last move
            </button>

            <button
              className='game__button e2e__copy-replay'
              type='button'
              onClick={handleClickCopyReplay}
            >
              {replayCopiedTimeoutId ? 'copied!' : 'copy replay'}
            </button>

            <button
              className='game__button e2e__done'
              type='button'
              onClick={handleClickDone}
            >
              done
            </button>
          </div>
        </div>
      )}
    </div>
  )
})
