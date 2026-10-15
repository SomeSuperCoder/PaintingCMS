/**
 * packages/shared — public surface.
 * Re-exports the complete PaintingCMS API contract (v1). Both apps consume
 * everything through this entry point; never import from './api-contract' or
 * './endpoints' directly (keeps the public API narrow, design D1/D8).
 */
// Explicit .js extensions are REQUIRED: the package is ESM ("type": "module")
// and Node ESM forbids extensionless relative imports. tsc (moduleResolution:
// Bundler) resolves './api-contract.js' to './api-contract.ts'; the emitted
// dist/index.js then loads natively (import AND require(esm) on Node 22).
export * from './api-contract.js';
export * from './endpoints.js';
export * from './dev-user.js';
