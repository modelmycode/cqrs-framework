import { existsSync, readFileSync } from 'fs'

type BuildMeta = { version: string; build: string; time: string }

export const buildMeta = {} as BuildMeta

export function readBuildMeta(file = 'build-meta.json'): BuildMeta {
  if (!existsSync(file)) return buildMeta

  try {
    return Object.assign(buildMeta, JSON.parse(readFileSync(file, 'utf8')))
  } catch {
    return buildMeta
  }
}
