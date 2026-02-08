import mammoth from 'mammoth';
import { DocxContent } from '../types.js';

export async function readDocx(filePath: string): Promise<DocxContent> {
  const [htmlResult, textResult] = await Promise.all([
    mammoth.convertToHtml({ path: filePath }),
    mammoth.extractRawText({ path: filePath }),
  ]);

  return {
    html: htmlResult.value,
    text: textResult.value,
    messages: htmlResult.messages.map(m => `${m.type}: ${m.message}`),
  };
}
