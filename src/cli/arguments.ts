export interface CliOptions {
  workspace: string
  forceWeb: boolean
  forceDesktop: boolean
  host: string
  port: number
  portExplicit: boolean
  openBrowser: boolean
  diagnoseEnvironment: boolean
  json: boolean
  safeMode: boolean
  resetSession: boolean
  verbose: boolean
  help: boolean
  version: boolean
}

function requireValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
  return value
}

export function parseCliArguments(args: string[], cwd = process.cwd()): CliOptions {
  const options: CliOptions = {
    workspace: cwd,
    forceWeb: false,
    forceDesktop: false,
    host: '127.0.0.1',
    port: 4173,
    portExplicit: false,
    openBrowser: true,
    diagnoseEnvironment: false,
    json: false,
    safeMode: false,
    resetSession: false,
    verbose: false,
    help: false,
    version: false
  }
  let positionalSeen = false
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!
    if (!argument.startsWith('-') || argument === '-') {
      if (positionalSeen) throw new Error('Only one workspace path may be provided')
      options.workspace = argument
      positionalSeen = true
    } else if (argument === '--web') options.forceWeb = true
    else if (argument === '--desktop') options.forceDesktop = true
    else if (argument === '--no-open') options.openBrowser = false
    else if (argument === '--diagnose-env') options.diagnoseEnvironment = true
    else if (argument === '--json') options.json = true
    else if (argument === '--safe-mode') options.safeMode = true
    else if (argument === '--reset-session') options.resetSession = true
    else if (argument === '--verbose') options.verbose = true
    else if (argument === '--help' || argument === '-h') options.help = true
    else if (argument === '--version' || argument === '-v') options.version = true
    else if (argument === '--port') {
      const value = requireValue(args, index, argument)
      index += 1
      const port = Number(value)
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('--port must be an integer between 1 and 65535')
      options.port = port
      options.portExplicit = true
    } else if (argument === '--host') {
      const value = requireValue(args, index, argument)
      index += 1
      if (value !== '127.0.0.1' && value !== 'localhost') throw new Error('Only loopback hosts are currently supported')
      options.host = value
    } else throw new Error(`Unknown option: ${argument}`)
  }
  if (options.forceWeb && options.forceDesktop) throw new Error('--web and --desktop cannot be used together')
  if (options.json && !options.diagnoseEnvironment) throw new Error('--json requires --diagnose-env')
  return options
}

export const CLI_HELP = `Kadris - hybrid local development environment

Usage:
  kadris [workspace] [options]

Options:
  --web             Force the local web runtime
  --desktop         Require the Electron desktop runtime
  --port <number>   Preferred local web port (default: 4173)
  --host <host>     Local host (127.0.0.1 or localhost)
  --no-open         Do not open a browser
  --diagnose-env    Print the environment classification
  --json             Print environment diagnostics as JSON
  --safe-mode       Disable terminal and agent tools
  --reset-session   Remove the saved local session marker
  --verbose         Print non-sensitive environment evidence
  --help             Show this help
  --version          Show the Kadris version`
