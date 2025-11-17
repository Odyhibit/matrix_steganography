const MAGIC_VALUE = 0x4E48; // 'NH'
const MAGIC_BIT_LENGTH = 16;
const MODE = {
  TEXT: 'T'.charCodeAt(0),
  BINARY: 'B'.charCodeAt(0)
};
const HEADER_BASE_BITS = MAGIC_BIT_LENGTH + 16; // magic + mode + bitsPerSymbol
const BINARY_LENGTH_BITS = 32;
const TEXT_BITS_PER_SYMBOL = 7;
const MAX_BITS_PER_BLOCK = 24;
const WARN_BITS_PER_BLOCK = 20;
const BITS_PER_CHANNEL_STANDARD = 1;
const BITS_PER_CHANNEL_HIGH = 7;

// Tab functionality
function openTab(evt, tabName) {
  const tabContents = document.getElementsByClassName('tab-content');
  for (let i = 0; i < tabContents.length; i++) {
    tabContents[i].classList.remove('active');
  }

  const tabs = document.getElementsByClassName('tab');
  for (let i = 0; i < tabs.length; i++) {
    tabs[i].classList.remove('active');
  }

  document.getElementById(tabName).classList.add('active');
  evt.currentTarget.classList.add('active');
}

// Image preview functionality
function setupImagePreview(fileInput, previewImg) {
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) {
      previewImg.classList.add('hidden');
      previewImg.removeAttribute('src');
      return;
    }

    const reader = new FileReader();
    reader.onload = e => {
      previewImg.onload = null;
      previewImg.onerror = null;
      previewImg.src = e.target.result;
      previewImg.classList.remove('hidden');
    };
    reader.onerror = () => alert('Unable to read the selected file.');
    reader.readAsDataURL(file);
  });
}

setupImagePreview(document.getElementById('coverImage'), document.getElementById('coverPreview'));
setupImagePreview(document.getElementById('stegoImage'), document.getElementById('stegoExtractPreview'));
setupImagePreview(document.getElementById('image1'), document.getElementById('image1Preview'));
setupImagePreview(document.getElementById('image2'), document.getElementById('image2Preview'));

// Matrix helpers
function prepareMatrix(numBits) {
  const rows = Array.from({ length: numBits }, () => []);
  const columns = [];
  const size = Math.pow(2, numBits) - 1;

  for (let value = 1; value <= size; value++) {
    const bits = value.toString(2).padStart(numBits, '0').split('').map(Number);
    columns.push(bits);
    for (let row = 0; row < numBits; row++) {
      rows[row].push(bits[row]);
    }
  }

  return { rows, columns };
}

function matrixDotProduct(matrixRows, vector) {
  const result = [];
  for (let i = 0; i < matrixRows.length; i++) {
    let sum = 0;
    for (let j = 0; j < matrixRows[i].length; j++) {
      sum += matrixRows[i][j] * vector[j];
    }
    result.push(sum);
  }
  return result;
}

function hideBlock(matrix, currentCode, message) {
  const dotProduct = matrixDotProduct(matrix.rows, currentCode);
  const target = [];
  for (let i = 0; i < message.length; i++) {
    target.push((message[i] - (dotProduct[i] % 2) + 2) % 2);
  }

  for (let idx = 0; idx < matrix.columns.length; idx++) {
    if (columnsMatch(matrix.columns[idx], target)) {
      const stego = currentCode.slice();
      stego[idx] = (stego[idx] + 1) % 2;
      return stego;
    }
  }

  return currentCode.slice();
}

function columnsMatch(col1, col2) {
  if (col1.length !== col2.length) {
    return false;
  }
  for (let i = 0; i < col1.length; i++) {
    if (col1[i] !== col2[i]) {
      return false;
    }
  }
  return true;
}

function unhideBlock(matrixRows, stego) {
  const message = [];
  for (let i = 0; i < matrixRows.length; i++) {
    let sum = 0;
    for (let j = 0; j < matrixRows[i].length; j++) {
      sum += matrixRows[i][j] * stego[j];
    }
    message.push(sum % 2);
  }
  return message;
}

// Bit helpers
function appendNumberAsBits(target, value, bitCount) {
  for (let i = bitCount - 1; i >= 0; i--) {
    target.push((value >> i) & 1);
  }
}

function stringToBits(text, bitsPerLetter) {
  const bits = [];
  for (let i = 0; i < text.length; i++) {
    appendNumberAsBits(bits, text.charCodeAt(i), bitsPerLetter);
  }
  return bits;
}

function bitsToString(bits, bitsPerLetter) {
  let result = '';
  for (let i = 0; i + bitsPerLetter <= bits.length; i += bitsPerLetter) {
    let value = 0;
    for (let j = 0; j < bitsPerLetter; j++) {
      value = (value << 1) | bits[i + j];
    }
    if (value === 0) {
      break;
    }
    result += String.fromCharCode(value);
  }
  return result;
}

function bytesToBits(bytes) {
  const bits = [];
  for (let i = 0; i < bytes.length; i++) {
    appendNumberAsBits(bits, bytes[i], 8);
  }
  return bits;
}

function bitsToBytes(bits) {
  const byteCount = Math.floor(bits.length / 8);
  const result = new Uint8Array(byteCount);
  for (let i = 0; i < byteCount; i++) {
    result[i] = readBitsAsNumber(bits, i * 8, 8);
  }
  return result;
}

function readBitsAsNumber(bits, start, length) {
  let value = 0;
  for (let i = 0; i < length; i++) {
    value = (value << 1) | bits[start + i];
  }
  return value;
}

function buildHeaderBits(mode, bitsPerSymbol, byteLength = 0) {
  const bits = [];
  appendNumberAsBits(bits, MAGIC_VALUE, MAGIC_BIT_LENGTH);
  appendNumberAsBits(bits, mode, 8);
  appendNumberAsBits(bits, bitsPerSymbol, 8);
  if (mode === MODE.BINARY) {
    appendNumberAsBits(bits, byteLength, BINARY_LENGTH_BITS);
  }
  return bits;
}

function buildTextPayloadBits(text) {
  const bits = buildHeaderBits(MODE.TEXT, TEXT_BITS_PER_SYMBOL);
  bits.push(...stringToBits(text, TEXT_BITS_PER_SYMBOL));
  bits.push(...Array(TEXT_BITS_PER_SYMBOL).fill(0));
  return bits;
}

function tryParseHeader(bits) {
  if (bits.length < HEADER_BASE_BITS) {
    return { isNewFormat: false };
  }

  const magic = readBitsAsNumber(bits, 0, MAGIC_BIT_LENGTH);
  if (magic !== MAGIC_VALUE) {
    return { isNewFormat: false };
  }

  const mode = readBitsAsNumber(bits, MAGIC_BIT_LENGTH, 8);
  const bitsPerSymbol = readBitsAsNumber(bits, MAGIC_BIT_LENGTH + 8, 8);
  let cursor = HEADER_BASE_BITS;
  let byteLength = 0;

  if (mode === MODE.BINARY) {
    if (bits.length < cursor + BINARY_LENGTH_BITS) {
      return { isNewFormat: false };
    }
    byteLength = readBitsAsNumber(bits, cursor, BINARY_LENGTH_BITS);
    cursor += BINARY_LENGTH_BITS;
  }

  return {
    isNewFormat: true,
    mode,
    bitsPerSymbol,
    byteLength,
    headerBits: cursor
  };
}

function parseMessageBits(bits) {
  const header = tryParseHeader(bits);
  if (!header.isNewFormat) {
    const text = bitsToString(bits, TEXT_BITS_PER_SYMBOL);
    return { mode: 'text', text };
  }

  if (header.mode === MODE.TEXT) {
    const payload = bits.slice(header.headerBits);
    return {
      mode: 'text',
      text: bitsToString(payload, header.bitsPerSymbol)
    };
  }

  const payloadBits = bits.slice(header.headerBits, header.headerBits + header.byteLength * 8);
  return { mode: 'binary', bytes: bitsToBytes(payloadBits) };
}

// Capacity helpers
function nextHigherPowerOfTwo(num) {
  num--;
  num |= num >> 1;
  num |= num >> 2;
  num |= num >> 4;
  num |= num >> 8;
  num |= num >> 16;
  num++;
  return num;
}

function countBits(value) {
  let count = 0;
  while (value) {
    count += value & 1;
    value >>= 1;
  }
  return count;
}

function checkSize(totalBitsToHide, bitsPerBlock, width, height, colorChannels = 3, bitsPerChannel = 1) {
  const lsbBitsAvailable = width * height * colorChannels * bitsPerChannel;
  const blockSize = Math.pow(2, bitsPerBlock) - 1;
  if (blockSize === 0 || bitsPerBlock === 0) {
    return false;
  }

  const maxBlocks = Math.floor(lsbBitsAvailable / blockSize);
  const blocksRequired = Math.ceil(totalBitsToHide / bitsPerBlock);
  return maxBlocks >= blocksRequired;
}

function findLargestBlockSize(totalBitsToHide, width, height, colorChannels = 3, bitsPerChannel = 1) {
  const lsbBitsAvailable = width * height * colorChannels * bitsPerChannel;
  const lsbNextPowerOfTwo = nextHigherPowerOfTwo(lsbBitsAvailable) - 1;
  let maxBitsPerBlock = countBits(lsbNextPowerOfTwo);

  while (maxBitsPerBlock > 0 && !checkSize(totalBitsToHide, maxBitsPerBlock, width, height, colorChannels, bitsPerChannel)) {
    maxBitsPerBlock--;
  }

  return Math.max(maxBitsPerBlock, 0);
}

// Image helpers
function ensureImageIsReady(imgElement) {
  if (imgElement.naturalWidth > 0 && imgElement.naturalHeight > 0) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    imgElement.onload = () => resolve();
    imgElement.onerror = () => reject(new Error('Unable to load image data.'));
  });
}

async function getImageData(imgElement) {
  await ensureImageIsReady(imgElement);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  canvas.width = imgElement.naturalWidth;
  canvas.height = imgElement.naturalHeight;

  ctx.drawImage(imgElement, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  return {
    width: canvas.width,
    height: canvas.height,
    data: imageData.data,
    imageData
  };
}

function comparePixels(img1Data, img2Data) {
  if (img1Data.data.length !== img2Data.data.length) {
    return 'The images sizes do not match.';
  }

  let count = 0;
  for (let i = 0; i < img1Data.data.length; i++) {
    const bit1 = img1Data.data[i];
    const bit2 = img2Data.data[i];
    if (bit1 !== bit2) {
      let xor = bit1 ^ bit2;
      while (xor) {
        count += xor & 1;
        xor >>= 1;
      }
    }
  }
  return `Summary: ${count} bits are different in these image pixels.`;
}

// Embedding
async function embedMessage() {
  const coverImg = document.getElementById('coverPreview');
  const text = document.getElementById('embedText').value;
  let bitsPerBlock = parseInt(document.getElementById('bitsPerBlock').value, 10);
  const highCapacity = document.getElementById('highCapacityEmbed').checked;

  if (!coverImg.src || !text) {
    alert('Please provide both a cover image and text to hide.');
    return;
  }

  if (Number.isNaN(bitsPerBlock)) {
    alert('Bits per block must be a number.');
    return;
  }
  const requestedBits = bitsPerBlock;
  bitsPerBlock = Math.min(Math.max(bitsPerBlock, 1), MAX_BITS_PER_BLOCK);
  if (requestedBits > WARN_BITS_PER_BLOCK) {
    alert(`Block sizes above ${WARN_BITS_PER_BLOCK} can be slow. Using ${bitsPerBlock}.`);
  }

  document.getElementById('bitsPerBlock').value = bitsPerBlock;
  document.getElementById('embedProgressContainer').classList.remove('hidden');
  const progressBar = document.getElementById('embedProgress');
  progressBar.style.width = '10%';
  progressBar.textContent = '10%';

  try {
    const imgData = await getImageData(coverImg);
    const { width, height, data } = imgData;
    const colorChannels = highCapacity ? 4 : 3;
    const bitsPerChannel = highCapacity ? BITS_PER_CHANNEL_HIGH : BITS_PER_CHANNEL_STANDARD;
    const payloadBits = buildTextPayloadBits(text);

    if (!checkSize(payloadBits.length, bitsPerBlock, width, height, colorChannels, bitsPerChannel)) {
      alert('Not enough room in this image for that message with that block size. Reduce one or the other.');
      document.getElementById('embedProgressContainer').classList.add('hidden');
      return;
    }

    const matrix = prepareMatrix(bitsPerBlock);
    const blockSize = Math.pow(2, bitsPerBlock) - 1;
    const coverBits = new Uint8Array(width * height * colorChannels * bitsPerChannel);
    let bitCursor = 0;
    for (let i = 0; i < data.length; i += 4) {
      const channels = [data[i], data[i + 1], data[i + 2]];
      if (highCapacity) {
        channels.push(data[i + 3]);
      }
      for (const value of channels) {
        for (let bit = 0; bit < bitsPerChannel; bit++) {
          coverBits[bitCursor++] = (value >> bit) & 1;
        }
      }
    }

    progressBar.style.width = '35%';
    progressBar.textContent = '35%';

    const numBlocks = Math.ceil(payloadBits.length / bitsPerBlock);
    for (let blockIdx = 0; blockIdx < numBlocks; blockIdx++) {
      const coverBlockStart = blockIdx * blockSize;
      const coverBlock = coverBits.slice(coverBlockStart, coverBlockStart + blockSize);
      if (coverBlock.length !== blockSize) {
        break;
      }

      const messageStart = blockIdx * bitsPerBlock;
      const messageBits = payloadBits.slice(messageStart, messageStart + bitsPerBlock);
      const paddedMessage = messageBits.length === bitsPerBlock
        ? messageBits
        : [...messageBits, ...Array(bitsPerBlock - messageBits.length).fill(0)];

      const stegoBlock = hideBlock(matrix, coverBlock, paddedMessage);
      for (let i = 0; i < blockSize; i++) {
        coverBits[coverBlockStart + i] = stegoBlock[i];
      }

      const progress = 35 + Math.floor(((blockIdx + 1) / numBlocks) * 40);
      progressBar.style.width = `${progress}%`;
      progressBar.textContent = `${progress}%`;
    }

    progressBar.style.width = '80%';
    progressBar.textContent = '80%';

    let lsbIndex = 0;
    const modifiedData = new Uint8ClampedArray(data);
    for (let i = 0; i < modifiedData.length; i += 4) {
      const channels = [
        { idx: i, value: modifiedData[i] },
        { idx: i + 1, value: modifiedData[i + 1] },
        { idx: i + 2, value: modifiedData[i + 2] }
      ];
      if (highCapacity) {
        channels.push({ idx: i + 3, value: modifiedData[i + 3] });
      }
      for (const ch of channels) {
        let newVal = ch.value & 0x80;
        for (let bit = 0; bit < bitsPerChannel; bit++) {
          const bitVal = lsbIndex < coverBits.length ? coverBits[lsbIndex++] : 0;
          newVal |= (bitVal & 1) << bit;
        }
        modifiedData[ch.idx] = newVal;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const newImageData = new ImageData(modifiedData, width, height);
    ctx.putImageData(newImageData, 0, 0);

    const stegoPreview = document.getElementById('stegoPreview');
    stegoPreview.src = canvas.toDataURL('image/png');
    document.getElementById('embedMessage').textContent = 'Message has been successfully embedded!';
    document.getElementById('embedResult').classList.remove('hidden');

    const downloadBtn = document.getElementById('downloadStegoBtn');
    downloadBtn.onclick = () => {
      const link = document.createElement('a');
      link.download = 'stego_image.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    };

    progressBar.style.width = '100%';
    progressBar.textContent = '100%';
  } catch (error) {
    console.error('Error:', error);
    alert('An error occurred: ' + error.message);
  }
}

// Extraction
async function extractMessage() {
  const stegoImg = document.getElementById('stegoExtractPreview');
  let bitsPerBlock = parseInt(document.getElementById('extractBitsPerBlock').value, 10);
  const highCapacity = document.getElementById('highCapacityExtract').checked;

  if (!stegoImg.src) {
    alert('Please provide a stego image.');
    return;
  }

  if (Number.isNaN(bitsPerBlock)) {
    alert('Bits per block must be a number.');
    return;
  }
  const requestedBits = bitsPerBlock;
  bitsPerBlock = Math.min(Math.max(bitsPerBlock, 1), MAX_BITS_PER_BLOCK);
  if (requestedBits > WARN_BITS_PER_BLOCK) {
    alert(`Block sizes above ${WARN_BITS_PER_BLOCK} can be slow. Using ${bitsPerBlock}.`);
  }
  document.getElementById('extractBitsPerBlock').value = bitsPerBlock;

  document.getElementById('extractProgressContainer').classList.remove('hidden');
  const progressBar = document.getElementById('extractProgress');
  progressBar.style.width = '10%';
  progressBar.textContent = '10%';

  const textOutput = document.getElementById('extractedText');
  const binaryResult = document.getElementById('binaryResult');
  const binaryDetails = document.getElementById('binaryDetails');
  const binaryBase64 = document.getElementById('binaryBase64');
  const downloadBinaryBtn = document.getElementById('downloadBinaryBtn');

  try {
    const imgData = await getImageData(stegoImg);
    const { data } = imgData;
    const blockSize = Math.pow(2, bitsPerBlock) - 1;
    const matrix = prepareMatrix(bitsPerBlock);

    const stegoBits = [];
    const bitsPerChannel = highCapacity ? BITS_PER_CHANNEL_HIGH : BITS_PER_CHANNEL_STANDARD;
    for (let i = 0; i < data.length; i += 4) {
      const channels = [data[i], data[i + 1], data[i + 2]];
      if (highCapacity) {
        channels.push(data[i + 3]);
      }
      for (const value of channels) {
        for (let bit = 0; bit < bitsPerChannel; bit++) {
          stegoBits.push((value >> bit) & 1);
        }
      }
    }

    progressBar.style.width = '45%';
    progressBar.textContent = '45%';

    const unstegoBits = [];
    const numBlocks = Math.floor(stegoBits.length / blockSize);
    let expectedTotalBits = null;
    let parsedHeader = null;
    let bitsPerSymbolForText = TEXT_BITS_PER_SYMBOL;

    for (let blockIdx = 0; blockIdx < numBlocks; blockIdx++) {
      const start = blockIdx * blockSize;
      const stegoBlock = stegoBits.slice(start, start + blockSize);
      if (stegoBlock.length !== blockSize) {
        break;
      }

      unstegoBits.push(...unhideBlock(matrix.rows, stegoBlock));

      if (!parsedHeader) {
        parsedHeader = tryParseHeader(unstegoBits);
        if (parsedHeader.isNewFormat) {
          if (parsedHeader.mode === MODE.BINARY) {
            expectedTotalBits = parsedHeader.headerBits + parsedHeader.byteLength * 8;
          } else {
            bitsPerSymbolForText = parsedHeader.bitsPerSymbol || TEXT_BITS_PER_SYMBOL;
          }
        } else {
          parsedHeader = null;
        }
      }

      if (expectedTotalBits && unstegoBits.length >= expectedTotalBits) {
        break;
      }

      const terminatorLength = parsedHeader && parsedHeader.isNewFormat
        ? parsedHeader.bitsPerSymbol
        : TEXT_BITS_PER_SYMBOL;
      if (unstegoBits.length >= terminatorLength) {
        const lastBits = unstegoBits.slice(unstegoBits.length - terminatorLength);
        if (lastBits.every(bit => bit === 0)) {
          break;
        }
      }

      const progress = 45 + Math.floor(((blockIdx + 1) / numBlocks) * 45);
      progressBar.style.width = `${progress}%`;
      progressBar.textContent = `${progress}%`;
    }

    const parsed = parseMessageBits(unstegoBits);
    document.getElementById('extractResult').classList.remove('hidden');

    if (parsed.mode === 'text') {
      textOutput.value = parsed.text;
      textOutput.classList.remove('hidden');
      binaryResult.classList.add('hidden');
    } else {
      const bytes = parsed.bytes || new Uint8Array();
      textOutput.value = '';
      textOutput.classList.add('hidden');
      binaryResult.classList.remove('hidden');
      binaryDetails.textContent = `Extracted binary payload (${bytes.length} bytes).`;
      const base64 = bytesToBase64(bytes);
      binaryBase64.value = base64;
      downloadBinaryBtn.onclick = () => {
        const blob = new Blob([bytes], { type: 'application/octet-stream' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'payload.bin';
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      };
    }

    progressBar.style.width = '100%';
    progressBar.textContent = '100%';
  } catch (error) {
    console.error('Error:', error);
    alert('An error occurred: ' + error.message);
  }
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

// Compare images
async function compareImages() {
  const img1 = document.getElementById('image1Preview');
  const img2 = document.getElementById('image2Preview');

  if (!img1.src || !img2.src) {
    alert('Please provide both images for comparison.');
    return;
  }

  try {
    const [img1Data, img2Data] = await Promise.all([getImageData(img1), getImageData(img2)]);
    const result = comparePixels(img1Data, img2Data);
    const compareResult = document.getElementById('compareResult');
    compareResult.textContent = result;
    compareResult.classList.remove('hidden');
  } catch (error) {
    console.error('Error:', error);
    alert('An error occurred: ' + error.message);
  }
}

// Maximum block size calculation
async function calculateMaxBlockSize() {
  const coverImg = document.getElementById('coverPreview');
  const text = document.getElementById('embedText').value;

  if (!coverImg.src || !text) {
    alert('Please provide both a cover image and text to hide.');
    return;
  }

  try {
    const imgData = await getImageData(coverImg);
    const { width, height } = imgData;
    const payloadBits = buildTextPayloadBits(text);
    const highCapacity = document.getElementById('highCapacityEmbed').checked;
    const colorChannels = highCapacity ? 4 : 3;
    const bitsPerChannel = highCapacity ? BITS_PER_CHANNEL_HIGH : BITS_PER_CHANNEL_STANDARD;
    const maxBits = findLargestBlockSize(payloadBits.length, width, height, colorChannels, bitsPerChannel);

    if (maxBits > 0) {
      document.getElementById('bitsPerBlock').value = maxBits;
      alert(`Using ${maxBits} bits per block. Block size is ${Math.pow(2, maxBits) - 1}`);
    } else {
      alert('The image is too small to hide this message.');
    }
  } catch (error) {
    console.error('Error:', error);
    alert('An error occurred: ' + error.message);
  }
}

// Event listeners
document.getElementById('embedBtn').addEventListener('click', embedMessage);
document.getElementById('extractBtn').addEventListener('click', extractMessage);
document.getElementById('compareBtn').addEventListener('click', compareImages);
document.getElementById('maxBlockSizeBtn').addEventListener('click', calculateMaxBlockSize);
