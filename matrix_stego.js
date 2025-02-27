function loadImage(file, callback) {
    const reader = new FileReader();
    reader.onload = function(event) {
        const img = new Image();
        img.onload = function() {
            callback(img);
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

function textToBinary(text) {
    return text.split('').map(char => char.charCodeAt(0).toString(2).padStart(7, '0')).join('');
}

function binaryToText(binary) {
    return binary.match(/.{1,7}/g).map(byte => String.fromCharCode(parseInt(byte, 2))).join('');
}

function prepareMatrix(numBits) {
    let matrix = [];
    let size = Math.pow(2, numBits) - 1;
    for (let i = 1; i <= size; i++) {
        let binary = i.toString(2).padStart(numBits, '0');
        matrix.push([...binary].map(Number));
    }
    matrix = matrix[0].map((_, colIndex) => matrix.map(row => row[colIndex]));
    console.log(matrix);
    return matrix;
}

function hideBlock(matrix, currentCode, message) {
    let targetColumn = matrix.map(row => (message - row.reduce((acc, val, i) => acc + val * currentCode[i], 0)) % 2);
    let idx = matrix.findIndex(col => JSON.stringify(col) === JSON.stringify(targetColumn));
    if (idx !== -1) {
        currentCode[idx] = (currentCode[idx] - 1) % 2;
    }
    console.log(currentCode);
    return currentCode;
}

function embedMessage() {
    const file = document.getElementById('imageInput').files[0];
    const message = document.getElementById('textInput').value;
    if (!file || !message) return alert("Upload an image and enter a message.");

    loadImage(file, img => {
        const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        const imgData = ctx.getImageData(0, 0, img.width, img.height);
        let binaryMessage = textToBinary(message) + '0000000'; // End marker
        const matrix = prepareMatrix(7);

        for (let i = 0, j = 0; i < imgData.data.length; i += 4) {
            if (j < binaryMessage.length) {
                let block = [imgData.data[i] & 1, imgData.data[i+1] & 1, imgData.data[i+2] & 1];
                let stegoBlock = hideBlock(matrix, block, parseInt(binaryMessage[j], 2));
                imgData.data[i] = (imgData.data[i] & ~1) | stegoBlock[0];
                imgData.data[i+1] = (imgData.data[i+1] & ~1) | stegoBlock[1];
                imgData.data[i+2] = (imgData.data[i+2] & ~1) | stegoBlock[2];
                j++;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        document.getElementById('download').href = canvas.toDataURL();
    });
}

function displayMessage(message) {
    const outputDiv = document.getElementById('output');
    outputDiv.textContent = message;
}



function extractMessage() {
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const matrix = prepareMatrix(7);
    let binaryMessage = "";

    for (let i = 0; i < imgData.data.length; i += 4) {
        let block = [imgData.data[i] & 1, imgData.data[i+1] & 1, imgData.data[i+2] & 1];
        let decoded = matrix.reduce((acc, row) => acc + (row.reduce((sum, val, idx) => sum + val * block[idx], 0) % 2), '');
        binaryMessage += decoded;
        if (binaryMessage.endsWith('0000000')) break;
    }

    displayMessage("Extracted Message: " + binaryToText(binaryMessage.slice(0, -7)));
}