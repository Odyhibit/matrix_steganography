#!/usr/bin/env python
import base64
import math
import sys
from pathlib import Path
from typing import List, Optional

import click
from PIL import Image

MAGIC_VALUE = 0x4E48  # 'NH'
MAGIC_BIT_LENGTH = 16
MODE_TEXT = ord("T")
MODE_BINARY = ord("B")
HEADER_BASE_BITS = MAGIC_BIT_LENGTH + 16  # magic + mode + bits per symbol
BINARY_LENGTH_BITS = 32
TEXT_BITS_PER_SYMBOL = 7


@click.command()
@click.version_option(version="0.1", prog_name="neo_hide")
@click.option('-t', '--text', help='Text enclosed in single quotes.')
@click.option('-f', "--file", type=click.Path(exists=True), help='filename of text file.')
@click.option('-c', '--cover', type=click.Path(exists=True), help='filename of Cover image.')
@click.option('-s', '--stego', help='filename of Stego image.')
@click.option('-b', '--bits', type=int, default=7, show_default=True, help='The number of bits to hide per block.')
@click.option('-m', '--maximum', is_flag=True, help="use the Maximum block size possible.")
@click.option('--embed', '-e', is_flag=True, help="Embed a message requires a cover file.")
@click.option('--extract', '-x', is_flag=True, help="eXtract a message requires a stego file.")
# @click.option('-i', '--info', is_flag=True, help="show max block size for cover image, and message.")
@click.option('-d', '--diff', is_flag=True, help="Count the number of bits that are different between two images.")
@click.option('-o', '--output', type=click.Path(dir_okay=False, writable=True, path_type=Path),
              help="Optional file to write extracted binary payloads.")
@click.option('--high-capacity', '-H', is_flag=True,
              help="Use RGBA and the lower 7 bits of each channel (28 bits/pixel) for maximum payload.")
def main(text, file, cover, stego, bits, maximum, embed, extract, diff, output, high_capacity):
    payload_bits: Optional[List[int]] = None
    payload_kind: Optional[str] = None
    payload_display: Optional[str] = None

    if text and file:
        print("Please provide only one of --text or --file.")
        sys.exit(1)

    if file:
        payload_bytes = Path(file).read_bytes()
        payload_bits = build_binary_payload_bits(payload_bytes)
        payload_kind = "binary"
        payload_display = f"{len(payload_bytes)} bytes"
    elif text:
        payload_bits = build_text_payload_bits(text)
        payload_kind = "text"
        payload_display = f"{len(text)} characters"

    if maximum and embed:
        if not cover or not payload_bits:
            print("Calculating maximum block size requires a cover image and payload.")
            sys.exit(1)
        bits = get_max_block(cover, len(payload_bits), high_capacity=high_capacity)
        print(f"Using {bits} bits per block. Block size is {2 ** bits - 1}")

    if embed:
        if not cover or not stego:
            print("Embedding requires --cover and --stego paths.")
            sys.exit(1)
        if not payload_bits:
            print("Embedding requires either --text or --file input.")
            sys.exit(1)
        mode_label = "high-capacity (RGBA, 28 bits/pixel)" if high_capacity else "standard (RGB, 3 bits/pixel)"
        print(f"Embedding {payload_kind} payload ({payload_display}) into {stego} [{mode_label}].")
        stego_image(cover, payload_bits, stego, bits, high_capacity=high_capacity)

    if extract:
        if not stego or bits <= 0:
            print("Extraction requires --stego path and a positive --bits value.")
            sys.exit(1)
        print("Decoding the stego image.\n")
        extracted = unstego_image(stego, bits, high_capacity=high_capacity)
        if extracted["mode"] == "text":
            print(extracted["text"])
        else:
            if output:
                output.write_bytes(extracted["bytes"])
                print(f"Binary payload written to {output} ({len(extracted['bytes'])} bytes).")
            else:
                b64 = base64.b64encode(extracted["bytes"]).decode("ascii")
                print("Binary payload detected (base64 encoded):")
                print(b64)
        print()

    if diff and cover and stego:
        print(compare_pixels(cover, stego))

    if not any([embed, extract, diff, maximum]):
        print("nothing to do")


def compare_pixels(cover, stego):
    image_1 = Image.open(cover)
    image_2 = Image.open(stego)
    pixels_1 = list(image_1.getdata())
    pixels_2 = list(image_2.getdata())

    if len(pixels_1) != len(pixels_2) or len(pixels_1[0]) != len(pixels_2[0]):
        return "The images sizes do not match. "

    count = 0
    color_channels = len(pixels_1[0])
    for idx in range(len(pixels_1)):
        for channel in range(color_channels):
            bit_1 = pixels_1[idx][channel]
            bit_2 = pixels_2[idx][channel]
            if bit_1 != bit_2:
                count += (bit_1 ^ bit_2).bit_count()

    return f"Summary: {count} bits are different in these image pixels."


def append_number_as_bits(target: List[int], value: int, bit_count: int) -> None:
    for shift in range(bit_count - 1, -1, -1):
        target.append((value >> shift) & 1)


def string_to_bits(text: str, bits_per_symbol: int) -> List[int]:
    bits: List[int] = []
    for char in text:
        append_number_as_bits(bits, ord(char), bits_per_symbol)
    return bits


def bits_to_string(bits: List[int], bits_per_symbol: int) -> str:
    chars: List[str] = []
    for i in range(0, len(bits) - bits_per_symbol + 1, bits_per_symbol):
        value = 0
        for bit in bits[i:i + bits_per_symbol]:
            value = (value << 1) | bit
        if value == 0:
            break
        chars.append(chr(value))
    return "".join(chars)


def bytes_to_bits(data: bytes) -> List[int]:
    bits: List[int] = []
    for byte in data:
        append_number_as_bits(bits, byte, 8)
    return bits


def bits_to_bytes(bits: List[int]) -> bytes:
    if len(bits) < 8:
        return b""
    byte_chunks = len(bits) // 8
    output = bytearray()
    for i in range(byte_chunks):
        value = 0
        for bit in bits[i * 8:(i + 1) * 8]:
            value = (value << 1) | bit
        output.append(value)
    return bytes(output)


def build_header_bits(mode: int, bits_per_symbol: int, byte_length: int = 0) -> List[int]:
    header: List[int] = []
    append_number_as_bits(header, MAGIC_VALUE, MAGIC_BIT_LENGTH)
    append_number_as_bits(header, mode, 8)
    append_number_as_bits(header, bits_per_symbol, 8)
    if mode == MODE_BINARY:
        append_number_as_bits(header, byte_length, BINARY_LENGTH_BITS)
    return header


def build_text_payload_bits(text: str) -> List[int]:
    bits = build_header_bits(MODE_TEXT, TEXT_BITS_PER_SYMBOL)
    bits.extend(string_to_bits(text, TEXT_BITS_PER_SYMBOL))
    bits.extend([0] * TEXT_BITS_PER_SYMBOL)
    return bits


def build_binary_payload_bits(data: bytes) -> List[int]:
    bits = build_header_bits(MODE_BINARY, 8, len(data))
    bits.extend(bytes_to_bits(data))
    return bits


def try_parse_header(bits: List[int]):
    if len(bits) < HEADER_BASE_BITS:
        return {"is_new": False}

    magic = 0
    for bit in bits[:MAGIC_BIT_LENGTH]:
        magic = (magic << 1) | bit
    if magic != MAGIC_VALUE:
        return {"is_new": False}

    mode = 0
    for bit in bits[MAGIC_BIT_LENGTH:MAGIC_BIT_LENGTH + 8]:
        mode = (mode << 1) | bit

    bits_per_symbol = 0
    start = MAGIC_BIT_LENGTH + 8
    for bit in bits[start:start + 8]:
        bits_per_symbol = (bits_per_symbol << 1) | bit
    cursor = HEADER_BASE_BITS
    byte_length = 0

    if mode == MODE_BINARY:
        if len(bits) < cursor + BINARY_LENGTH_BITS:
            return {"is_new": False}
        for bit in bits[cursor:cursor + BINARY_LENGTH_BITS]:
            byte_length = (byte_length << 1) | bit
        cursor += BINARY_LENGTH_BITS

    return {
        "is_new": True,
        "mode": mode,
        "bits_per_symbol": bits_per_symbol,
        "byte_length": byte_length,
        "header_bits": cursor
    }


def parse_message_bits(bits: List[int]):
    header = try_parse_header(bits)
    if header.get("is_new"):
        if header["mode"] == MODE_TEXT:
            payload = bits[header["header_bits"]:]
            return {"mode": "text", "text": bits_to_string(payload, header["bits_per_symbol"] or TEXT_BITS_PER_SYMBOL)}
        payload_bits = bits[header["header_bits"]:header["header_bits"] + header["byte_length"] * 8]
        return {"mode": "binary", "bytes": bits_to_bytes(payload_bits)}
    return {"mode": "text", "text": bits_to_string(bits, TEXT_BITS_PER_SYMBOL)}


def check_size(total_bits_to_hide: int,
               bits_per_block: int,
               width: int,
               height: int,
               color_channels: int = 3,
               bits_per_channel: int = 1) -> bool:
    lsb_bits_available = width * height * color_channels * bits_per_channel
    block_size = 2 ** bits_per_block - 1
    if block_size != 0 and bits_per_block != 0:
        max_blocks_this_image = math.floor(lsb_bits_available / block_size)
        blocks_required = math.ceil(total_bits_to_hide / bits_per_block)

        if max_blocks_this_image >= blocks_required:
            return True
    return False


def next_higher_power_of_two(target_num: int) -> int:
    target_num -= 1
    target_num |= target_num >> 1
    target_num |= target_num >> 2
    target_num |= target_num >> 4
    target_num += 1
    return target_num


def find_largest_block_size(total_bits_to_hide: int,
                            width: int,
                            height: int,
                            color_channels: int = 3,
                            bits_per_channel: int = 1) -> int:
    lsb_bits_available = width * height * color_channels * bits_per_channel
    lsb_next_power_of_two = next_higher_power_of_two(lsb_bits_available) - 1
    max_bits_per_block = lsb_next_power_of_two.bit_count()
    while not check_size(total_bits_to_hide, max_bits_per_block, width, height, color_channels, bits_per_channel):
        max_bits_per_block -= 1
        if max_bits_per_block <= 0:
            return 0
    return max_bits_per_block


def get_max_block(cover_image: str, total_bits: int, high_capacity: bool = False) -> int:
    cover = Image.open(cover_image)
    if high_capacity:
        cover = cover.convert("RGBA")
    width = cover.width
    height = cover.height
    channels = 4 if high_capacity else len(cover.getbands())
    bits_per_channel = 7 if high_capacity else 1
    return find_largest_block_size(total_bits, width, height, channels, bits_per_channel)


def prepare_matrix(num_bits: int):
    rows = [[] for _ in range(num_bits)]
    columns = []
    size = 2 ** num_bits - 1
    for value in range(1, size + 1):
        bits = [int(bit) for bit in f"{value:0{num_bits}b}"]
        columns.append(bits)
        for row_idx, bit in enumerate(bits):
            rows[row_idx].append(bit)
    return {"rows": rows, "columns": columns}


def matrix_dot_product(matrix_rows, vector):
    result = []
    for row in matrix_rows:
        total = 0
        for lhs, rhs in zip(row, vector):
            total += lhs * rhs
        result.append(total)
    return result


def hide_block(matrix, current_code, message):
    dot_product = matrix_dot_product(matrix["rows"], current_code)
    target = []
    for idx, bit in enumerate(message):
        target.append((bit - (dot_product[idx] % 2) + 2) % 2)

    for col_idx, column in enumerate(matrix["columns"]):
        if column == target:
            stego = list(current_code)
            stego[col_idx] = (stego[col_idx] + 1) % 2
            return stego
    return list(current_code)


def replace_block(bits: List[int], stego_block: List[int], index: int):
    for offset in range(len(stego_block)):
        bits[index + offset] = stego_block[offset]


def decode_blocks(img_lsb: List[int], block_size: int, matrix) -> List[int]:
    unstego_bits: List[int] = []
    total_blocks = len(img_lsb) // block_size
    expected_bits: Optional[int] = None
    header_info: Optional[dict] = None

    for block_idx in range(total_blocks):
        offset = block_idx * block_size
        stego_block = img_lsb[offset:offset + block_size]
        if len(stego_block) != block_size:
            break

        discovered_bits = unhide_block(matrix, stego_block)
        unstego_bits.extend(discovered_bits)

        if header_info is None:
            header_info = try_parse_header(unstego_bits)
            if header_info.get("is_new"):
                if header_info["mode"] == MODE_BINARY:
                    expected_bits = header_info["header_bits"] + header_info["byte_length"] * 8
            else:
                header_info = None

        if expected_bits and len(unstego_bits) >= expected_bits:
            break

        use_terminator = True
        bits_per_symbol = TEXT_BITS_PER_SYMBOL
        if header_info and header_info.get("is_new"):
            if header_info["mode"] == MODE_TEXT:
                bits_per_symbol = header_info["bits_per_symbol"] or TEXT_BITS_PER_SYMBOL
            else:
                use_terminator = False
        if use_terminator and len(unstego_bits) >= bits_per_symbol:
            if all(bit == 0 for bit in unstego_bits[-bits_per_symbol:]):
                break

    return unstego_bits


def unhide_block(matrix, stego):
    message = matrix_dot_product(matrix["rows"], stego)
    return [value % 2 for value in message]


def load_image_to_one_d(filename: str, high_capacity: bool = False):
    img = Image.open(filename)
    if high_capacity:
        img = img.convert("RGBA")
    width, height = img.width, img.height
    pixels = list(img.getdata())
    channels = 4 if high_capacity else min(3, len(img.getbands()))
    flat = []
    for pixel in pixels:
        flat.extend(list(pixel)[:channels])
    return width, height, flat, channels


def save_file(filename: str, width: int, height: int, stego_file: []):
    mode = "RGBA" if len(stego_file[0]) == 4 else "RGB"
    output_img = Image.new(mode, (width, height))
    output_img.putdata(stego_file)
    with open(filename, "wb") as file_out:
        output_img.save(file_out)


def unstego_image(stego_img, bits_per_block, high_capacity: bool = False):
    width, height, one_d_image, bands = load_image_to_one_d(stego_img, high_capacity=high_capacity)
    if high_capacity:
        stego_bits = []
        for value in one_d_image:
            for bit in range(7):
                stego_bits.append((value >> bit) & 1)
    else:
        stego_bits = [value & 1 for value in one_d_image]
    block_size = 2 ** bits_per_block - 1
    matrix = prepare_matrix(bits_per_block)
    unstego_bits = decode_blocks(stego_bits, block_size, matrix)
    return parse_message_bits(unstego_bits)


def stego_image(cover_filename: str, payload_bits: List[int], stego_filename: str, bits_per_block: int, high_capacity: bool = False):
    matrix = prepare_matrix(bits_per_block)
    block_size = 2 ** bits_per_block - 1
    width, height, one_d_image, color_channels = load_image_to_one_d(cover_filename, high_capacity=high_capacity)

    if high_capacity:
        cover_bits: List[int] = []
        for value in one_d_image:
            for bit in range(7):
                cover_bits.append((value >> bit) & 1)
        bits_per_channel = 7
    else:
        cover_bits = [value & 1 for value in one_d_image]
        bits_per_channel = 1

    if not check_size(len(payload_bits), bits_per_block, width, height, color_channels, bits_per_channel):
        print("Not enough room in this image for that message with that block size. Reduce one or the other.")
        sys.exit(1)

    encode_blocks(payload_bits, block_size, matrix, bits_per_block, cover_bits)

    stego_flat: List[int] = []
    bit_cursor = 0
    for original in one_d_image:
        if high_capacity:
            bits_for_channel = cover_bits[bit_cursor:bit_cursor + 7]
            if len(bits_for_channel) < 7:
                bits_for_channel = bits_for_channel + [0] * (7 - len(bits_for_channel))
            bit_cursor += 7
            top_bit = original & 0x80
            new_val = top_bit
            for idx, bit in enumerate(bits_for_channel):
                new_val |= (bit & 1) << idx
            stego_flat.append(new_val)
        else:
            bit_for_channel = cover_bits[bit_cursor] if bit_cursor < len(cover_bits) else 0
            bit_cursor += 1
            stego_flat.append((original & 0xFE) | bit_for_channel)

    tuple_stride = color_channels
    pixel_tuples = [tuple(stego_flat[i:i + tuple_stride]) for i in range(0, len(stego_flat), tuple_stride)]
    save_file(stego_filename, width, height, pixel_tuples)


def encode_blocks(bitstream: List[int], block_size: int, matrix, bits_per_block: int, cover_lsb: List[int]):
    total_blocks = math.ceil(len(bitstream) / bits_per_block)
    for block_idx in range(total_blocks):
        cover_offset = block_idx * block_size
        cover_block = cover_lsb[cover_offset:cover_offset + block_size]
        if len(cover_block) != block_size:
            break

        message_offset = block_idx * bits_per_block
        message_bits = bitstream[message_offset:message_offset + bits_per_block]
        if len(message_bits) < bits_per_block:
            message_bits = message_bits + [0] * (bits_per_block - len(message_bits))

        stego_block = hide_block(matrix, cover_block, message_bits)
        replace_block(cover_lsb, stego_block, cover_offset)


if __name__ == "__main__":
    main()
