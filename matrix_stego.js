        // Tab functionality
        function openTab(evt, tabName) {
            const tabContents = document.getElementsByClassName("tab-content");
            for (let i = 0; i < tabContents.length; i++) {
                tabContents[i].classList.remove("active");
            }

            const tabs = document.getElementsByClassName("tab");
            for (let i = 0; i < tabs.length; i++) {
                tabs[i].classList.remove("active");
            }

            document.getElementById(tabName).classList.add("active");
            evt.currentTarget.classList.add("active");
        }

        // Image preview functionality
        function setupImagePreview(fileInput, previewImg) {
            fileInput.addEventListener('change', function() {
                const file = this.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = function(e) {
                        previewImg.src = e.target.result;
                        previewImg.classList.remove('hidden');
                    }
                    reader.readAsDataURL(file);
                }
            });
        }

        setupImagePreview(document.getElementById('coverImage'), document.getElementById('coverPreview'));
        setupImagePreview(document.getElementById('stegoImage'), document.getElementById('stegoExtractPreview'));
        setupImagePreview(document.getElementById('image1'), document.getElementById('image1Preview'));
        setupImagePreview(document.getElementById('image2'), document.getElementById('image2Preview'));

        // Main steganography functions
        function prepareMatrix(numBits) {
            const matrix = [];
            const size = Math.pow(2, numBits) - 1;

            for (let i = 1; i <= size; i++) {
                const binaryString = i.toString(2).padStart(numBits, '0');
                const vector = [];
                for (let j = 0; j < binaryString.length; j++) {
                    vector.push(parseInt(binaryString[j]));
                }
                matrix.push(vector);
            }

            // Transpose matrix
            const transposed = [];
            for (let i = 0; i < numBits; i++) {
                transposed[i] = [];
                for (let j = 0; j < size; j++) {
                    transposed[i][j] = matrix[j][i];
                }
            }

            return transposed;
        }

        function matrixDotProduct(matrix, vector) {
            const result = [];
            for (let i = 0; i < matrix.length; i++) {
                let sum = 0;
                for (let j = 0; j < matrix[i].length; j++) {
                    sum += matrix[i][j] * vector[j];
                }
                result.push(sum);
            }
            return result;
        }

        function hideBlock(matrix, currentCode, message) {
            // Calculate matrix.dot(currentCode)
            const dotProduct = matrixDotProduct(matrix, currentCode);

            // Calculate target column: (message - matrix.dot(currentCode)) % 2
            const targetColumn = [];
            for (let i = 0; i < message.length; i++) {
                targetColumn.push((message[i] - dotProduct[i] % 2 + 2) % 2);
            }

            // Check if we need to modify a column
            let idx = 0;
            let found = false;

            // Get columns of matrix
            const columns = [];
            for (let j = 0; j < matrix[0].length; j++) {
                const col = [];
                for (let i = 0; i < matrix.length; i++) {
                    col.push(matrix[i][j]);
                }
                columns.push(col);
            }

            // Find matching column
            for (let i = 0; i < columns.length; i++) {
                if (columnsMatch(columns[i], targetColumn)) {
                    found = true;
                    idx = i;
                    break;
                }
            }

            if (!found) {
                return [...currentCode]; // No modification needed
            }

            // Modify the LSB at the found index
            const stego = [...currentCode];
            stego[idx] = (stego[idx] + 1) % 2; // Flip the bit
            return stego;
        }

        function columnsMatch(col1, col2) {
            if (col1.length !== col2.length) return false;
            for (let i = 0; i < col1.length; i++) {
                if (col1[i] !== col2[i]) return false;
            }
            return true;
        }

        function unhideBlock(matrix, stego) {
            // Calculate message bits: matrix.dot(stego) % 2
            const message = [];
            for (let i = 0; i < matrix.length; i++) {
                let sum = 0;
                for (let j = 0; j < matrix[i].length; j++) {
                    sum += matrix[i][j] * stego[j];
                }
                message.push(sum % 2);
            }
            return message;
        }

        function asciiToBinaryString(text, bitsPerLetter = 7) {
            let result = '';
            for (let i = 0; i < text.length; i++) {
                const charCode = text.charCodeAt(i);
                result += charCode.toString(2).padStart(bitsPerLetter, '0');
            }
            // Add null terminator
            result += '0'.repeat(bitsPerLetter);
            return result;
        }

        function binaryStringToAscii(bits, bitsPerLetter = 7) {
            let result = '';
            for (let i = 0; i < bits.length; i += bitsPerLetter) {
                const chunk = bits.slice(i, i + bitsPerLetter);
                if (chunk.length === bitsPerLetter) {
                    const charCode = parseInt(chunk.join(''), 2);
                    if (charCode === 0) {
                        break; // Null terminator
                    }
                    if (charCode > 31 && charCode < 128) {
                        result += String.fromCharCode(charCode);
                    }
                }
            }
            return result;
        }

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

        function checkSize(totalBitsToHide, bitsPerBlock, width, height, colorChannels = 3) {
            const lsbBitsAvailable = width * height * colorChannels;
            const blockSize = Math.pow(2, bitsPerBlock) - 1;

            if (blockSize !== 0 && bitsPerBlock !== 0) {
                const maxBlocksThisImage = Math.floor(lsbBitsAvailable / blockSize);
                const blocksRequired = Math.ceil(totalBitsToHide / bitsPerBlock);

                return maxBlocksThisImage >= blocksRequired;
            }
            return false;
        }

        function findLargestBlockSize(totalBitsToHide, width, height, colorChannels = 3) {
            const lsbBitsAvailable = width * height * colorChannels;
            const lsbNextPowerOfTwo = nextHigherPowerOfTwo(lsbBitsAvailable) - 1;
            let maxBitsPerBlock = countBits(lsbNextPowerOfTwo);

            while (!checkSize(totalBitsToHide, maxBitsPerBlock, width, height, colorChannels)) {
                maxBitsPerBlock--;
                if (maxBitsPerBlock <= 0) {
                    return 0;
                }
            }

            return maxBitsPerBlock;
        }

        function countBits(n) {
            let count = 0;
            while (n) {
                count += n & 1;
                n >>= 1;
            }
            return count;
        }

        // Image processing functions
        function getImageData(imgElement) {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            canvas.width = imgElement.naturalWidth;
            canvas.height = imgElement.naturalHeight;

            ctx.drawImage(imgElement, 0, 0);

            return {
                width: canvas.width,
                height: canvas.height,
                imageData: ctx.getImageData(0, 0, canvas.width, canvas.height),
                data: ctx.getImageData(0, 0, canvas.width, canvas.height).data,
                colorChannels: 4 // RGBA
            };
        }

        function comparePixels(img1Data, img2Data) {
            let count = 0;

            if (img1Data.data.length !== img2Data.data.length) {
                return "The images sizes do not match.";
            }

            for (let i = 0; i < img1Data.data.length; i++) {
                const bit1 = img1Data.data[i];
                const bit2 = img2Data.data[i];

                if (bit1 !== bit2) {
                    // Count the number of bits that differ
                    let xor = bit1 ^ bit2;
                    while (xor) {
                        count += xor & 1;
                        xor >>= 1;
                    }
                }
            }

            return `Summary: ${count} bits are different in these image pixels.`;
        }

        // Main embedding function
        async function embedMessage() {
            const coverImg = document.getElementById('coverPreview');
            const text = document.getElementById('embedText').value;
            const bitsPerBlock = parseInt(document.getElementById('bitsPerBlock').value);

            if (!coverImg.src || !text) {
                alert('Please provide both a cover image and text to hide.');
                return;
            }

            // Show progress
            document.getElementById('embedProgressContainer').classList.remove('hidden');
            const progressBar = document.getElementById('embedProgress');
            progressBar.style.width = '10%';
            progressBar.textContent = '10%';

            try {
                // Get image data
                const imgData = getImageData(coverImg);
                const width = imgData.width;
                const height = imgData.height;
                const imageData = imgData.imageData;
                const pixelData = imageData.data;
                const colorChannels = 3; // We'll only use RGB, not Alpha

                // Convert text to binary
                const binaryString = asciiToBinaryString(text, 7);
                const binaryArray = binaryString.split('').map(bit => parseInt(bit));

                // Check if image is large enough
                if (!checkSize(binaryArray.length, bitsPerBlock, width, height, colorChannels)) {
                    alert('Not enough room in this image for that message with that block size. Reduce one or the other.');
                    document.getElementById('embedProgressContainer').classList.add('hidden');
                    return;
                }

                // Prepare matrix
                const matrix = prepareMatrix(bitsPerBlock);
                const blockSize = Math.pow(2, bitsPerBlock) - 1;

                // Process image
                progressBar.style.width = '20%';
                progressBar.textContent = '20%';

                // Extract LSBs from cover image
                const coverLsb = new Array(width * height * colorChannels);
                let lsbIndex = 0;

                for (let i = 0; i < pixelData.length; i += 4) {
                    if (lsbIndex < coverLsb.length) {
                        coverLsb[lsbIndex++] = pixelData[i] & 1;     // R
                    }
                    if (lsbIndex < coverLsb.length) {
                        coverLsb[lsbIndex++] = pixelData[i + 1] & 1; // G
                    }
                    if (lsbIndex < coverLsb.length) {
                        coverLsb[lsbIndex++] = pixelData[i + 2] & 1; // B
                    }
                    // Skip Alpha channel
                }

                progressBar.style.width = '40%';
                progressBar.textContent = '40%';

                // Number of complete blocks we need to process
                const numBlocks = Math.ceil(binaryArray.length / bitsPerBlock);

                // Encode each block
                for (let blockIdx = 0; blockIdx < numBlocks; blockIdx++) {
                    // Get the current cover block
                    const coverBlockStart = blockIdx * blockSize;
                    const coverBlock = coverLsb.slice(coverBlockStart, coverBlockStart + blockSize);

                    // If we don't have a complete block, skip it
                    if (coverBlock.length !== blockSize) {
                        continue;
                    }

                    // Get the current message bits
                    const messageStart = blockIdx * bitsPerBlock;
                    let messageBits = binaryArray.slice(messageStart, messageStart + bitsPerBlock);

                    // Pad message bits if needed
                    if (messageBits.length < bitsPerBlock) {
                        messageBits = [...messageBits, ...Array(bitsPerBlock - messageBits.length).fill(0)];
                    }

                    // Hide the message bits in this block
                    const stegoBlock = hideBlock(matrix, coverBlock, messageBits);

                    // Apply the changes back to the coverLsb array
                    for (let i = 0; i < blockSize; i++) {
                        if (coverBlockStart + i < coverLsb.length) {
                            coverLsb[coverBlockStart + i] = stegoBlock[i];
                        }
                    }

                    // Update progress
                    const progress = 40 + Math.floor((blockIdx / numBlocks) * 50);
                    progressBar.style.width = `${progress}%`;
                    progressBar.textContent = `${progress}%`;
                }

                progressBar.style.width = '90%';
                progressBar.textContent = '90%';

                // Apply the modified LSBs back to the image data
                lsbIndex = 0;
                const modifiedData = new Uint8ClampedArray(pixelData);

                for (let i = 0; i < modifiedData.length; i += 4) {
                    if (lsbIndex < coverLsb.length) {
                        // Clear LSB and set the new value
                        modifiedData[i] = (modifiedData[i] & 0xFE) | coverLsb[lsbIndex++];
                    }
                    if (lsbIndex < coverLsb.length) {
                        modifiedData[i + 1] = (modifiedData[i + 1] & 0xFE) | coverLsb[lsbIndex++];
                    }
                    if (lsbIndex < coverLsb.length) {
                        modifiedData[i + 2] = (modifiedData[i + 2] & 0xFE) | coverLsb[lsbIndex++];
                    }
                    // Don't modify alpha channel
                }

                // Create a new ImageData object with the modified data
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = width;
                canvas.height = height;

                const newImageData = new ImageData(modifiedData, width, height);
                ctx.putImageData(newImageData, 0, 0);

                // Display the result
                const stegoPreview = document.getElementById('stegoPreview');
                stegoPreview.src = canvas.toDataURL('image/png');

                document.getElementById('embedMessage').textContent = 'Message has been successfully embedded!';
                document.getElementById('embedResult').classList.remove('hidden');

                // Setup download button
                const downloadBtn = document.getElementById('downloadStegoBtn');
                downloadBtn.onclick = function() {
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

        // Main extraction function
        async function extractMessage() {
            const stegoImg = document.getElementById('stegoExtractPreview');
            const bitsPerBlock = parseInt(document.getElementById('extractBitsPerBlock').value);

            if (!stegoImg.src) {
                alert('Please provide a stego image.');
                return;
            }

            // Show progress
            document.getElementById('extractProgressContainer').classList.remove('hidden');
            const progressBar = document.getElementById('extractProgress');
            progressBar.style.width = '10%';
            progressBar.textContent = '10%';

            try {
                // Get image data
                const imgData = getImageData(stegoImg);
                const pixelData = imgData.data;
                const blockSize = Math.pow(2, bitsPerBlock) - 1;

                progressBar.style.width = '30%';
                progressBar.textContent = '30%';

                // Prepare matrix
                const matrix = prepareMatrix(bitsPerBlock);

                // Extract LSBs from stego image
                const stegoLsb = [];
                for (let i = 0; i < pixelData.length; i += 4) {
                    stegoLsb.push(pixelData[i] & 1);     // R
                    stegoLsb.push(pixelData[i + 1] & 1); // G
                    stegoLsb.push(pixelData[i + 2] & 1); // B
                    // Skip Alpha channel
                }

                progressBar.style.width = '60%';
                progressBar.textContent = '60%';

                // Decode blocks
                const unstegoBits = [];
                const numBlocks = Math.floor(stegoLsb.length / blockSize);

                for (let blockIdx = 0; blockIdx < numBlocks; blockIdx++) {
                    const stegoBlockStart = blockIdx * blockSize;
                    const stegoBlock = stegoLsb.slice(stegoBlockStart, stegoBlockStart + blockSize);

                    if (stegoBlock.length === blockSize) {
                        const decodedBits = unhideBlock(matrix, stegoBlock);
                        unstegoBits.push(...decodedBits);
                    }

                    // Update progress
                    const progress = 60 + Math.floor((blockIdx / numBlocks) * 30);
                    progressBar.style.width = `${progress}%`;
                    progressBar.textContent = `${progress}%`;

                    // Check if we've found a null terminator (7 zeros in a row)
                    if (unstegoBits.length >= 7) {
                        const lastSeven = unstegoBits.slice(unstegoBits.length - 7);
                        if (lastSeven.every(bit => bit === 0)) {
                            break;
                        }
                    }
                }

                // Convert binary to ASCII
                const decodedText = binaryStringToAscii(unstegoBits);

                // Display result
                document.getElementById('extractedText').value = decodedText;
                document.getElementById('extractResult').classList.remove('hidden');

                progressBar.style.width = '100%';
                progressBar.textContent = '100%';

            } catch (error) {
                console.error('Error:', error);
                alert('An error occurred: ' + error.message);
            }
        }

        // Compare images function
        async function compareImages() {
            const img1 = document.getElementById('image1Preview');
            const img2 = document.getElementById('image2Preview');

            if (!img1.src || !img2.src) {
                alert('Please provide both images for comparison.');
                return;
            }

            try {
                const img1Data = getImageData(img1);
                const img2Data = getImageData(img2);

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
                const imgData = getImageData(coverImg);
                const width = imgData.width;
                const height = imgData.height;
                const colorChannels = 3; // We'll use RGB only

                const binaryString = asciiToBinaryString(text, 7);
                const maxBits = findLargestBlockSize(binaryString.length, width, height, colorChannels);

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