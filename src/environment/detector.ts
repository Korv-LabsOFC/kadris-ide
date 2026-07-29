import { existsSync } from 'node:fs'
import { arch, platform, release } from 'node:os'
import type { EnvironmentEvidence, EnvironmentReport, EnvironmentSnapshot, KadrisEnvironmentRuntime, KadrisPlatform } from './types'

const ELECTRON_ARCHITECTURES = new Set(['x64', 'arm64'])

function present(env: Readonly<Record<string, string | undefined>>, ...names: string[]): boolean {
  return names.some((name) => Boolean(env[name]))
}

function evidence(source: string, result: string, weight: number): EnvironmentEvidence {
  return { source, result, weight, sensitive: false }
}

function classifyPlatform(nodePlatform: string, androidKernel: boolean): KadrisPlatform {
  if (androidKernel || nodePlatform === 'android') return 'android'
  if (nodePlatform === 'win32') return 'windows'
  if (nodePlatform === 'darwin') return 'macos'
  if (nodePlatform === 'linux') return 'linux'
  return 'unknown'
}

export function detectEnvironment(snapshot: EnvironmentSnapshot): EnvironmentReport {
  const env = snapshot.env
  const normalizedRelease = snapshot.release.toLowerCase()
  const termuxPath = (env.PREFIX ?? '').includes('com.termux') || (env.HOME ?? '').includes('com.termux')
  const termuxSignal = snapshot.platform === 'android' || present(env, 'TERMUX_VERSION') || termuxPath
  const androidKernel = snapshot.platform === 'android' || /android/.test(normalizedRelease) || termuxSignal
  const prootSignal = present(env, 'PROOT_DISTRO', 'PROOT_TMP_DIR') || /proot/i.test(env.LD_PRELOAD ?? '')
  const isProot = prootSignal && androidKernel
  const isTermux = termuxSignal && !isProot
  const isWsl = present(env, 'WSL_DISTRO_NAME', 'WSL_INTEROP') || /microsoft|wsl/.test(normalizedRelease)
  const isContainer = snapshot.hasDockerEnv || snapshot.hasContainerEnv || present(env, 'container', 'KUBERNETES_SERVICE_HOST')
  const isSsh = present(env, 'SSH_CONNECTION', 'SSH_CLIENT', 'SSH_TTY')
  const isCi = present(env, 'CI', 'GITHUB_ACTIONS', 'GITLAB_CI', 'BUILDKITE', 'TF_BUILD')
  const hasGraphicalSession = snapshot.platform === 'win32'
    ? !isCi
    : snapshot.platform === 'darwin'
      ? !isSsh && !isCi
      : present(env, 'DISPLAY', 'WAYLAND_DISPLAY')
  const supportedArchitecture = ELECTRON_ARCHITECTURES.has(snapshot.architecture)

  const collected: EnvironmentEvidence[] = [
    evidence('node-platform', snapshot.platform === 'android' ? 'android' : snapshot.platform, 3),
    evidence('architecture', supportedArchitecture ? 'desktop-supported' : 'desktop-unsupported', 2),
    evidence('graphical-session', hasGraphicalSession ? 'present' : 'absent', 3)
  ]
  if (androidKernel) collected.push(evidence('android-kernel', 'detected', 5))
  if (isTermux) collected.push(evidence('termux', 'native-signals', 5))
  if (isProot) collected.push(evidence('proot', 'android-overlay-signals', 5))
  if (isWsl) collected.push(evidence('wsl', 'detected', 5))
  if (isContainer) collected.push(evidence('container', 'detected', 4))
  if (isSsh) collected.push(evidence('ssh', 'detected', 4))
  if (isCi) collected.push(evidence('ci', 'detected', 5))
  collected.push(evidence('electron', snapshot.electronAvailable ? 'available' : 'unavailable', 3))

  let runtime: KadrisEnvironmentRuntime
  if (isCi) runtime = 'ci'
  else if (isProot) runtime = 'android-proot'
  else if (isTermux) runtime = 'native-termux'
  else if (isWsl) runtime = 'wsl'
  else if (isContainer) runtime = 'container'
  else if (isSsh) runtime = 'ssh'
  else if ((snapshot.platform === 'win32' || snapshot.platform === 'darwin' || snapshot.platform === 'linux') && hasGraphicalSession) runtime = 'native-desktop'
  else if (snapshot.platform === 'linux' || snapshot.platform === 'darwin') runtime = 'headless'
  else runtime = 'unknown'

  const recommendedRuntime = runtime === 'android-proot' || runtime === 'ci'
    ? 'blocked'
    : runtime === 'native-desktop' && supportedArchitecture && snapshot.electronAvailable && !androidKernel
      ? 'electron'
      : 'web'
  const decisiveSignals = collected.filter((item) => item.weight >= 4).length
  const confidence = decisiveSignals >= 1 || runtime === 'native-desktop' ? 'high' : runtime === 'unknown' ? 'low' : 'medium'

  return {
    platform: classifyPlatform(snapshot.platform, androidKernel),
    runtime,
    architecture: snapshot.architecture,
    hasGraphicalSession,
    isAndroidKernel: androidKernel,
    isTermux,
    isProot,
    isContainer,
    isWsl,
    isSsh,
    confidence,
    evidence: collected,
    recommendedRuntime
  }
}

export function collectEnvironmentReport(options: { electronAvailable?: boolean } = {}): EnvironmentReport {
  return detectEnvironment({
    platform: platform(),
    architecture: arch(),
    release: release(),
    env: process.env,
    hasDockerEnv: existsSync('/.dockerenv'),
    hasContainerEnv: existsSync('/run/.containerenv'),
    electronAvailable: options.electronAvailable ?? false
  })
}
