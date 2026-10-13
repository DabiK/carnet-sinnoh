package fr.dabi.sinnoh;

/** Little-endian integers, as laid out in the emulated Switch process. */
final class Bytes {

  static long unsigned(byte[] bytes, int offset, int size) {
    long result = 0;
    for (int i = 0; i < size; i++) result |= (bytes[offset + i] & 255L) << (8 * i);
    return result;
  }

  static int u8(byte[] bytes, int offset) {
    return bytes[offset] & 255;
  }

  static int u16(byte[] bytes, int offset) {
    return (int) unsigned(bytes, offset, 2);
  }

  static int int32(byte[] bytes, int offset) {
    return (int) unsigned(bytes, offset, 4);
  }

  static long u64(byte[] bytes, int offset) {
    return unsigned(bytes, offset, 8);
  }

  private Bytes() {}
}
