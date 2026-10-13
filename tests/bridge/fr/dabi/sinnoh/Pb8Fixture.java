package fr.dabi.sinnoh;

import java.nio.charset.StandardCharsets;

/**
 * Builds PB8 structures (one stored Pokémon, 0x148 bytes) and encrypts them the way the game
 * does. The encryption is deliberately written here from scratch, as the inverse of the decoder
 * under test.
 */
final class Pb8Fixture {

  static final int SIZE = 0x148;
  private static final int HEADER = 8;
  private static final int BLOCK = 80;
  /** Where blocks A, B, C and D are stored, indexed by the shuffle value. */
  private static final int[][] BLOCK_ORDER = {
    { 0, 1, 2, 3 },
    { 0, 1, 3, 2 },
    { 0, 2, 1, 3 },
    { 0, 3, 1, 2 },
    { 0, 2, 3, 1 },
    { 0, 3, 2, 1 },
    { 1, 0, 2, 3 },
    { 1, 0, 3, 2 },
    { 2, 0, 1, 3 },
    { 3, 0, 1, 2 },
    { 2, 0, 3, 1 },
    { 3, 0, 2, 1 },
    { 1, 2, 0, 3 },
    { 1, 3, 0, 2 },
    { 2, 1, 0, 3 },
    { 3, 1, 0, 2 },
    { 2, 3, 0, 1 },
    { 3, 2, 0, 1 },
    { 1, 2, 3, 0 },
    { 1, 3, 2, 0 },
    { 2, 1, 3, 0 },
    { 3, 1, 2, 0 },
    { 2, 3, 1, 0 },
    { 3, 2, 1, 0 },
  };

  int dex;
  int heldItem;
  String nickname = "";
  /** 0 male, 1 female, 2 genderless. */
  int gender;
  int[] moves = new int[4];
  long encryptionConstant = 0x1234ABCDL;

  static Pb8Fixture of(int dex, String nickname) {
    Pb8Fixture fixture = new Pb8Fixture();
    fixture.dex = dex;
    fixture.nickname = nickname;
    return fixture;
  }

  Pb8Fixture gender(int value) {
    gender = value;
    return this;
  }

  Pb8Fixture heldItem(int value) {
    heldItem = value;
    return this;
  }

  Pb8Fixture moves(int... values) {
    System.arraycopy(values, 0, moves, 0, values.length);
    return this;
  }

  Pb8Fixture encryptionConstant(long value) {
    encryptionConstant = value;
    return this;
  }

  /** Decrypted bytes, checksum included. */
  byte[] plain() {
    byte[] data = new byte[SIZE];
    put(data, 0, encryptionConstant, 4);
    put(data, 8, dex, 2);
    put(data, 10, heldItem, 2);
    data[0x22] = (byte) (gender << 2);
    byte[] name = nickname.getBytes(StandardCharsets.UTF_16LE);
    System.arraycopy(name, 0, data, 0x58, name.length);
    for (int i = 0; i < 4; i++) put(data, 0x72 + i * 2, moves[i], 2);
    int sum = 0;
    for (int i = HEADER; i < SIZE; i += 2) sum += (data[i] & 255) | ((data[i + 1] & 255) << 8);
    put(data, 6, sum & 0xFFFF, 2);
    return data;
  }

  /** Bytes as found in memory: blocks shuffled, then encrypted. */
  byte[] encrypted() {
    byte[] plain = plain();
    byte[] stored = plain.clone();
    int[] order = BLOCK_ORDER[(int) ((encryptionConstant >>> 13) & 31) % 24];
    for (int i = 0; i < 4; i++) {
      System.arraycopy(plain, HEADER + i * BLOCK, stored, HEADER + order[i] * BLOCK, BLOCK);
    }
    long random = encryptionConstant;
    for (int i = HEADER; i < SIZE; i += 2) {
      random = (random * 0x41C64E6DL + 0x6073) & 0xFFFFFFFFL;
      int word = ((stored[i] & 255) | ((stored[i + 1] & 255) << 8)) ^ (int) (random >>> 16);
      stored[i] = (byte) word;
      stored[i + 1] = (byte) (word >>> 8);
    }
    return stored;
  }

  private static void put(byte[] data, int offset, long value, int size) {
    for (int i = 0; i < size; i++) data[offset + i] = (byte) (value >>> (8 * i));
  }
}
