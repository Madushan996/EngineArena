const PNG_HEADER = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
function validateResultPng(dataUrl) {
  if (typeof dataUrl !== 'string' || dataUrl.length > 12_000_000 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(dataUrl)) throw new Error('Invalid result image.');
  const bytes = Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64');
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(PNG_HEADER) || bytes.toString('ascii', 12, 16) !== 'IHDR') throw new Error('Invalid PNG image.');
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (width !== 1080 || ![1080, 1350, 1920].includes(height)) throw new Error('Unsupported result image size.');
  return { bytes, width, height };
}
function safeResultFilename(filename) {
  const clean = typeof filename === 'string' ? filename.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').replace(/^[. ]+|[. ]+$/g, '').slice(0, 150) : '';
  const stem = clean.replace(/\.(png|jpe?g)$/i, '');
  return `Engine-Arena-${stem.replace(/^Engine-Arena-/, '') || 'Result'}.png`;
}
module.exports = { validateResultPng, safeResultFilename };
