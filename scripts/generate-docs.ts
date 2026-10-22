import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { buildOpenApi } from '../src/documentation/openapi.js';
import { buildPostman, postmanReadme } from '../src/documentation/postman.js';
import { assertArtifactSafe, inspectSensitiveOriginal, privateEnvironmentValues } from './docs-safety.js';

export const artifactPaths = ['docs/openapi.json', 'postman/CLU_Store_API.sanitized.postman_collection.json', 'postman/README.md'] as const;
export function generatedArtifacts() {
  const spec = buildOpenApi();
  return [JSON.stringify(spec, null, 2) + '\n', JSON.stringify(buildPostman(spec), null, 2) + '\n', postmanReadme] as const;
}
export async function generate(check: boolean, originalPath?: string) {
  const evidence = originalPath ? inspectSensitiveOriginal(originalPath) : undefined;
  const denied = [...privateEnvironmentValues(), ...(evidence?.blocked ?? [])];
  const contents = generatedArtifacts();
  for (let i = 0; i < artifactPaths.length; i += 1) {
    assertArtifactSafe(artifactPaths[i]!.endsWith('.json') ? JSON.parse(contents[i]!) : contents[i]!, denied);
  }
  for (let i = 0; i < artifactPaths.length; i += 1) {
    const path = artifactPaths[i]!;
    const content = contents[i]!;
    if (check) {
      if (await readFile(path, 'utf8') !== content) throw new Error(`Generated documentation is stale: ${path}`);
    } else {
      await mkdir(path.slice(0, path.lastIndexOf('/')), { recursive: true });
      await writeFile(path, content);
    }
  }
  return { artifacts: artifactPaths.length, sensitiveScan: 'passed', originalCompared: !!evidence };
}
if (process.argv[1]?.endsWith('generate-docs.ts')) {
  const original = process.argv.indexOf('--original');
  console.log(JSON.stringify(await generate(false, original >= 0 ? process.argv[original + 1] : undefined)));
}
