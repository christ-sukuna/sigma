const archiver = require('archiver');
const { PassThrough } = require('stream');

/**
 * Takes a fileMap { relativePath: { content, encoding } } and returns a ZIP buffer.
 */
function zipFileMap(fileMap) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const passThrough = new PassThrough();

    passThrough.on('data', chunk => chunks.push(chunk));
    passThrough.on('end', () => resolve(Buffer.concat(chunks)));
    passThrough.on('error', reject);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', reject);
    archive.pipe(passThrough);

    for (const [filePath, file] of Object.entries(fileMap)) {
      const buf = file.encoding === 'base64'
        ? Buffer.from(file.content, 'base64')
        : Buffer.from(file.content, 'utf8');
      archive.append(buf, { name: filePath });
    }

    archive.finalize();
  });
}

module.exports = { zipFileMap };
