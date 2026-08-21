// Parser simples de multipart/form-data (sem dependencias externas).
// Suficiente para os formularios de upload de video deste app (poucos campos + 1 arquivo).

export async function readMultipart(req) {
  const contentType = req.headers['content-type'] || '';
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  if (!match) return { fields: {}, files: {} };
  const boundary = '--' + (match[1] || match[2]).trim();

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const buffer = Buffer.concat(chunks);

  const boundaryBuf = Buffer.from(boundary);
  const parts = [];
  let start = buffer.indexOf(boundaryBuf);
  while (start !== -1) {
    const next = buffer.indexOf(boundaryBuf, start + boundaryBuf.length);
    if (next === -1) break;
    let partBuf = buffer.slice(start + boundaryBuf.length, next);
    // remove leading CRLF and trailing CRLF before next boundary
    if (partBuf.slice(0, 2).toString() === '\r\n') partBuf = partBuf.slice(2);
    if (partBuf.slice(-2).toString() === '\r\n') partBuf = partBuf.slice(0, -2);
    if (partBuf.length > 0) parts.push(partBuf);
    start = next;
  }

  const fields = {};
  const files = {};

  for (const part of parts) {
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;
    const headerStr = part.slice(0, headerEnd).toString('utf-8');
    const body = part.slice(headerEnd + 4);

    const nameMatch = /name="([^"]+)"/i.exec(headerStr);
    if (!nameMatch) continue;
    const fieldName = nameMatch[1];

    const filenameMatch = /filename="([^"]*)"/i.exec(headerStr);
    if (filenameMatch) {
      if (!filenameMatch[1]) continue; // input de arquivo vazio
      const typeMatch = /Content-Type:\s*([^\r\n]+)/i.exec(headerStr);
      files[fieldName] = {
        filename: filenameMatch[1],
        contentType: typeMatch ? typeMatch[1].trim() : 'application/octet-stream',
        data: body,
      };
    } else {
      fields[fieldName] = body.toString('utf-8');
    }
  }

  return { fields, files };
}
