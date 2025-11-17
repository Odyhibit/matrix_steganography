This tool will use a matrix, and an idea from error correction to hide information in the LSB of an image. The storage will be low, but it will be very well hidden.

The tool stores payloads with a lightweight header so both the browser and CLI agree on encoding. Text messages continue to use 7-bit ASCII plus a terminator to keep the number of flipped LSBs low. The Python CLI can also embed arbitrary binary payloads by reading files and writing a header that records the byte length; the web UI will surface those payloads as downloadable blobs/base64 for convenience.

If you choose a block size of 14 that means that just one bit change in the LSB of one color channel of one pixel can hide 2 characters. So if you want to hide a 128-bit encryption key (22 characters of base64 can store 132 bits) you can change just 11 bits in an image. You can use higher settings to change even fewer bits, but the number of bits required grows exponentially.

The python script can hide and recover binary data: So for the example or a 128-bit key you can store it as raw binary (16 bytes) rather than base64 (22 bytes) and reduce the number of bits changed even further. If you want 8bit data hidden it will require a small header overhead to record the byte length. 

try it out online https://odyhibit.github.io/matrix_steganography/
