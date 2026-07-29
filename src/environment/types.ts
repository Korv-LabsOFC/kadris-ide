export type KadrisPlatform = 'windows' | 'macos' | 'linux' | 'android' | 'unknown'

export type KadrisEnvironmentRuntime =
  | 'native-desktop'
  | 'native-termux'
  | 'android-proot'
  | 'wsl'
  | 'container'
  | 'ssh'
  | 'headless'
  | 'ci'
  | 'unknown'

export interface EnvironmentEvidence {
  source: string
  result: string
  weight: number
  sensitive: boolean
}

export interface EnvironmentReport {
  platform: KadrisPlatform
  runtime: KadrisEnvironmentRuntime
  architecture: string
  hasGraphicalSession: boolean
  isAndroidKernel: boolean
  isTermux: boolean
  isProot: boolean
  isContainer: boolean
  isWsl: boolean
  isSsh: boolean
  confidence: 'high' | 'medium' | 'low'
  evidence: EnvironmentEvidence[]
  recommendedRuntime: 'electron' | 'web' | 'blocked'
}

export interface RuntimeDecision {
  runtime: 'electron' | 'web' | 'blocked'
  openBrowser: boolean
  reason: string
}

export interface EnvironmentSnapshot {
  platform: string
  architecture: string
  release: string
  env: Readonly<Record<string, string | undefined>>
  hasDockerEnv: boolean
  hasContainerEnv: boolean
  electronAvailable: boolean
}
