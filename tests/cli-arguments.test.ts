import { describe, expect, it } from 'vitest'
import { parseCliArguments } from '../src/cli/arguments'

describe('Kadris CLI arguments', () => {
  it('uses the current directory and safe loopback defaults', () => {
    expect(parseCliArguments([], '/workspace')).toMatchObject({
      workspace: '/workspace',
      host: '127.0.0.1',
      port: 4173,
      openBrowser: true,
      forceWeb: false,
      forceDesktop: false
    })
  })

  it('parses a workspace and implemented runtime options', () => {
    expect(parseCliArguments([
      './project', '--web', '--port', '4300', '--host', 'localhost', '--no-open',
      '--safe-mode', '--reset-session', '--verbose'
    ])).toMatchObject({
      workspace: './project', forceWeb: true, port: 4300, portExplicit: true,
      host: 'localhost', openBrowser: false, safeMode: true, resetSession: true, verbose: true
    })
  })

  it.each([
    [['--web', '--desktop'], '--web and --desktop'],
    [['--port', '0'], '--port'],
    [['--host', '0.0.0.0'], 'loopback'],
    [['--json'], '--diagnose-env'],
    [['--unknown'], 'Unknown option'],
    [['one', 'two'], 'Only one workspace']
  ])('rejects invalid arguments: %j', (args, message) => {
    expect(() => parseCliArguments(args)).toThrow(message)
  })
})
