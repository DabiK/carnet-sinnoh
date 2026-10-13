package fr.dabi.sinnoh;

import java.util.Map;
import java.util.TreeMap;

/** Sparse process memory, written by the tests and served by {@link FakeGdbServer}. */
final class FakeMemory {

  private static final long HEAP_START = 0x2b00000000L;

  private final TreeMap<Long, byte[]> regions = new TreeMap<>();
  private long nextFree = HEAP_START;

  /** Reserves a zero-filled region and returns its address. */
  synchronized long allocate(int size) {
    long address = nextFree;
    regions.put(address, new byte[size]);
    nextFree += (size + 0x1F) & ~0xFL;
    return address;
  }

  /** Maps a region at a fixed address, such as an offset from the text segment. */
  synchronized void mapAt(long address, int size) {
    regions.put(address, new byte[size]);
  }

  synchronized void write(long address, byte[] bytes) {
    Map.Entry<Long, byte[]> region = regionFor(address, bytes.length);
    if (region == null) throw new IllegalArgumentException("Unmapped address: " + Long.toHexString(address));
    System.arraycopy(bytes, 0, region.getValue(), (int) (address - region.getKey()), bytes.length);
  }

  void writeNumber(long address, long value, int size) {
    byte[] bytes = new byte[size];
    for (int i = 0; i < size; i++) bytes[i] = (byte) (value >>> (8 * i));
    write(address, bytes);
  }

  void writePointer(long address, long target) {
    writeNumber(address, target, 8);
  }

  /** Returns {@code null} unless the whole range is mapped. */
  synchronized byte[] read(long address, int size) {
    Map.Entry<Long, byte[]> region = regionFor(address, size);
    if (region == null) return null;
    byte[] bytes = new byte[size];
    System.arraycopy(region.getValue(), (int) (address - region.getKey()), bytes, 0, size);
    return bytes;
  }

  private Map.Entry<Long, byte[]> regionFor(long address, int size) {
    Map.Entry<Long, byte[]> region = regions.floorEntry(address);
    if (region == null || address + size > region.getKey() + region.getValue().length) return null;
    return region;
  }
}
