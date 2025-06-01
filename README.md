This tool will use a matrix, and an idea from error correction to hide information in the LSB of an image. The storage will be low, but it will be very well hidden.

This tool will use 7 bit ascii to help reduce the required bit changes. If you choose a block size of 14 that means that just one bit change in the LSB of one color channel of one pixel can hide 2 characters. So if you want to hide a 128 encryption key (22 characters of base64 can store 132 bits) you can change just 11 bits in an image. You can use higher settings to change even fewer bits, but the number of bits required grows exponentially.

try it out online https://odyhibit.github.io/matrix_steganography/
