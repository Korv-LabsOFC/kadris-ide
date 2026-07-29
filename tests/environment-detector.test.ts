import { describe, expect, it } from 'vitest'
import { detectEnvironment } from '../src/environment/detector'
import { selectKadrisRuntime } from '../src/environment/runtime'
import type { EnvironmentSnapshot } from '../src/environment/types'

function snapshot(overrides: Partial<EnvironmentSnapshot> = {}): EnvironmentSnapshot {
  return {
    platform: 'linux',
    architecture: 'x64',
    release: '6.8.0',
    env: {},
    hasDockerEnv: false,
    hasContainerEnv: false,
    electronAvailable: true,
    ...overrides
  }
}

describe('environment detection and runtime selection', () => {
  it.each([
    ['Windows real', snapshot({ platform: 'win32' }), 'native-desktop', 'electron'],
    ['Linux X11', snapshot({ env: { DISPLAY: ':0' } }), 'native-desktop', 'electron'],
    ['Linux Wayland', snapshot({ env: { WAYLAND_DISPLAY: 'wayland-0' } }), 'native-desktop', 'electron'],
    ['Linux headless', snapshot({ electronAvailable: false }), 'headless', 'web'],
    ['Termux', snapshot({ platform: 'android', architecture: 'arm64', release: '5.10-android', env: { TERMUX_VERSION: '0.118', PREFIX: '/data/data/com.termux/files/usr' }, electronAvailable: false }), 'native-termux', 'web'],
    ['Ubuntu PRoot', snapshot({ release: '5.10-android', env: { PROOT_DISTRO: 'ubuntu', PREFIX: '/data/data/com.termux/files/usr' }, electronAvailable: false }), 'android-proot', 'blocked'],
    ['WSL', snapshot({ release: '5.15.0-microsoft-standard-WSL2', env: { WSL_DISTRO_NAME: 'Ubuntu' } }), 'wsl', 'web'],
    ['Docker', snapshot({ hasDockerEnv: true }), 'container', 'web'],
    ['SSH', snapshot({ env: { SSH_CONNECTION: 'redacted' } }), 'ssh', 'web'],
    ['CI', snapshot({ env: { CI: 'true' } }), 'ci', 'blocked']
  ])('%s', (_name, input, expectedEnvironment, expectedRuntime) => {
    const report = detectEnvironment(input)
    expect(report.runtime).toBe(expectedEnvironment)
    expect(selectKadrisRuntime(report).runtime).toBe(expectedRuntime)
    expect(report.evidence.every((item) => item.sensitive === false)).toBe(true)
  })

  it('does not start Electron when it is unavailable or the architecture is incompatible', () => {
    expect(detectEnvironment(snapshot({ env: { DISPLAY: ':0' }, electronAvailable: false })).recommendedRuntime).toBe('web')
    expect(detectEnvironment(snapshot({ env: { DISPLAY: ':0' }, architecture: 'riscv64' })).recommendedRuntime).toBe('web')
  })

  it('gives Android PRoot precedence over inherited Termux variables', () => {
    const report = detectEnvironment(snapshot({
      release: '5.10-android',
      env: { TERMUX_VERSION: '0.118', PREFIX: '/data/data/com.termux/files/usr', PROOT_DISTRO: 'debian' }
    }))
    expect(report.runtime).toBe('android-proot')
    expect(report.isTermux).toBe(false)
    expect(report.isProot).toBe(true)
  })
})
