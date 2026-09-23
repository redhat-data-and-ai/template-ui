import { defaultSchema } from 'rehype-sanitize';
import type { Schema } from 'hast-util-sanitize';

export const markdownSanitizeSchema: Schema = {
  ...defaultSchema,
  tagNames: (defaultSchema.tagNames ?? []).filter(tag => tag !== 'img'),
};
