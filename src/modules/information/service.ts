import sanitizeHtml from 'sanitize-html';
import { z } from 'zod';
import { AppError } from '../../lib/errors.js';
import type { createInformationRepository } from './repository.js';

export function createInformationService(repository: ReturnType<typeof createInformationRepository>) {
  return { async support() {
    const record = await repository.support();
    if (!record) throw new AppError(404, 'INFORMATION_NOT_FOUND', 'Support information not found');
    const html = sanitizeHtml(z.string().max(100000).parse(record.html), {
      allowedTags: ['section', 'h1', 'h2', 'h3', 'p', 'ul', 'ol', 'li', 'strong', 'em', 'br', 'code'],
      allowedAttributes: {}, allowedSchemes: [], allowProtocolRelative: false,
      nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript', 'template', 'iframe', 'svg', 'math'],
    });
    return { html, locale: record.locale };
  } };
}
