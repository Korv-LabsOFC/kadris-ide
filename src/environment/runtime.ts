import type { EnvironmentReport, RuntimeDecision } from './types'

export function selectKadrisRuntime(report: EnvironmentReport): RuntimeDecision {
  if (report.runtime === 'android-proot') {
    return {
      runtime: 'blocked',
      openBrowser: false,
      reason: 'Android PRoot must use the official Kadris runtime from native Termux.'
    }
  }
  if (report.runtime === 'ci') {
    return {
      runtime: 'blocked',
      openBrowser: false,
      reason: 'CI environments do not start an interface without an explicit runtime flag.'
    }
  }
  if (report.recommendedRuntime === 'electron') {
    return { runtime: 'electron', openBrowser: false, reason: 'Compatible native desktop detected.' }
  }
  if (report.recommendedRuntime === 'web') {
    return {
      runtime: 'web',
      openBrowser: report.runtime !== 'ssh' && report.runtime !== 'headless' && report.runtime !== 'container' && report.runtime !== 'wsl',
      reason: `Local web runtime selected for ${report.runtime}.`
    }
  }
  return { runtime: 'blocked', openBrowser: false, reason: 'No safe runtime is available.' }
}
