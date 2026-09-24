#!/usr/bin/env node
/**
 * Manifest guard for a DeepSeek Harness bundle package.
 *
 * Every path the runtime resolves from `package.json` must survive packaging.
 * `files` is a whitelist: a path the manifest references but the whitelist omits
 * is silently dropped from a packed copy — `npm pack`, a git install, or pnpm's
 * `file:` protocol, which copies instead of linking. The profile then dies at
 * composition with `ENOENT` on the missing patch file, before any plugin loads.
 *
 * Run it before publishing, and after editing `files`:
 *
 *     node scripts/check-manifest.mjs [path/to/package.json]
 *
 * @module check-manifest
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const manifestPath = resolve(process.argv[2] ?? join(process.cwd(), 'package.json'))
const root = dirname(manifestPath)
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

/**
 * Every package-relative path this manifest points the runtime at.
 * @param pkg - the decoded package.json.
 * @returns relative paths, normalized to a leading `./`.
 */
function referencedPaths(pkg) {
  const paths = new Set()
  if (typeof pkg.main === 'string') paths.add(pkg.main)

  const collect = (value) => {
    if (typeof value === 'string') paths.add(value)
    else if (value && typeof value === 'object') for (const inner of Object.values(value)) collect(inner)
  }
  collect(pkg.exports)

  const patch = pkg.dsh?.bundle?.patch
  if (typeof patch === 'string') paths.add(patch)

  return [...paths]
    .filter((path) => path.startsWith('./') || !path.startsWith('/'))
    .map((path) => path.replace(/^\.\//, ''))
    // npm always ships package.json itself, so `files` can never filter it out.
    .filter((path) => path !== 'package.json')
    // Glob entries (`./locale/*.json`) name a family, not one file.
    .filter((path) => !path.includes('*'))
}

/**
 * Whether the `files` whitelist ships one path.
 * @param files - the manifest's `files` field.
 * @param path - package-relative path.
 * @returns true when the path ships (no whitelist ships everything).
 */
function coveredByFiles(files, path) {
  if (!Array.isArray(files) || files.length === 0) return true
  return files.some((entry) => {
    const clean = entry.replace(/^\.\//, '').replace(/\/+$/, '')
    return path === clean || path.startsWith(`${clean}/`)
  })
}

const problems = []
const paths = referencedPaths(manifest)
for (const path of paths) {
  if (!existsSync(join(root, path))) problems.push(`referenced but missing on disk: ${path}`)
  else if (!coveredByFiles(manifest.files, path)) problems.push(`referenced by the manifest but not covered by "files": ${path}`)
}

if (problems.length > 0) {
  console.error(`check-manifest: ${manifestPath}`)
  for (const problem of problems) console.error(`  - ${problem}`)
  console.error('')
  console.error('A packed copy would drop these, and the profile fails at composition (ENOENT).')
  process.exit(1)
}

console.log(`check-manifest: OK — ${paths.length} referenced path(s) exist and ship`)
