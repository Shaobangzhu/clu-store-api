import { Router } from 'express';
import { join } from 'node:path';
import swaggerUi from 'swagger-ui-dist';
import { contractRoute } from '../contracts/api.js';
import { buildOpenApi, type ApiSpec } from './openapi.js';

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CLU Store API</title>
<link rel="stylesheet" href="/docs/assets/swagger-ui.css"></head><body><div id="swagger-ui"></div>
<script src="/docs/assets/swagger-ui-bundle.js"></script><script src="/docs/assets/init.js"></script></body></html>`;
const init = `SwaggerUIBundle({url:'/docs/openapi.json',dom_id:'#swagger-ui',validatorUrl:null,persistAuthorization:false,queryConfigEnabled:false,displayRequestDuration:true,tryItOutEnabled:false});`;
let cachedSpec: ApiSpec | undefined;

export function documentationRouter() {
  const router = Router({ caseSensitive: true });
  const spec = cachedSpec ??= buildOpenApi();
  router.use('/docs', (_req, res, next) => {
    // Swagger layout needs inline styles; scripts stay local and external validators stay off.
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  contractRoute(router, 'docs', (_req, res) => { res.type('html').send(html); });
  contractRoute(router, 'spec', (_req, res) => { res.json(spec); });
  router.get('/docs/assets/init.js', (_req, res) => { res.type('js').send(init); });
  for (const name of ['swagger-ui.css', 'swagger-ui-bundle.js']) {
    router.get(`/docs/assets/${name}`, (_req, res, next) => {
      res.sendFile(join(swaggerUi.getAbsoluteFSPath(), name), (error) => { if (error) next(error); });
    });
  }
  return router;
}
