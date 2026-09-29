import './openapiEnv';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildOpenApiDocument } from '../http/openapi';
import '../modules'; // registers every route with the OpenAPI registry

const out = path.resolve(process.argv[2] ?? 'openapi.json');
writeFileSync(out, `${JSON.stringify(buildOpenApiDocument(), null, 2)}\n`);
console.log(`OpenAPI schema written to ${out}`);
process.exit(0);
