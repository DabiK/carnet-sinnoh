package fr.dabi.sinnoh;

import java.nio.charset.StandardCharsets;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * The stored form of one Pokémon in generation 8 (0x148 bytes): an 8-byte header followed by four
 * 80-byte blocks that the game shuffles and encrypts from the encryption constant.
 */
final class Pb8 {

  static final int SIZE = 0x148;

  private static final int HEADER_SIZE = 8;
  private static final int BLOCK_SIZE = 80;
  private static final int SANITY_OFFSET = 4;
  private static final int CHECKSUM_OFFSET = 6;
  private static final int SPECIES_OFFSET = 8;
  private static final int HELD_ITEM_OFFSET = 10;
  private static final int GENDER_OFFSET = 0x22;
  private static final int NICKNAME_OFFSET = 0x58;
  private static final int NICKNAME_SIZE = 26;
  private static final int MOVES_OFFSET = 0x72;
  /** Both are zero in a decrypted PB8, so a non-zero value means the data is still encrypted. */
  private static final int[] ALWAYS_ZERO_OFFSETS = { 0x70, 0x110 };

  /** Which stored block holds blocks A, B, C and D, indexed by the shuffle value. */
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

  final int dex;
  final int heldItem;
  final String nickname;
  /** 0 male, 1 female, 2 genderless. */
  final int gender;
  final int[] moves = new int[4];

  private Pb8(byte[] data) {
    dex = Bytes.u16(data, SPECIES_OFFSET);
    heldItem = Bytes.u16(data, HELD_ITEM_OFFSET);
    nickname = new String(data, NICKNAME_OFFSET, NICKNAME_SIZE, StandardCharsets.UTF_16LE).split("\u0000", 2)[0];
    gender = (data[GENDER_OFFSET] >>> 2) & 3;
    for (int i = 0; i < moves.length; i++) moves[i] = Bytes.u16(data, MOVES_OFFSET + i * 2);
  }

  /**
   * Decodes a PB8 read from memory, decrypting it first when needed.
   *
   * @throws BridgeException if the checksum fails, which happens while the game rewrites the data
   */
  static Pb8 decode(byte[] stored) throws BridgeException {
    byte[] data = stored.clone();
    if (isEncrypted(data)) decrypt(data);
    int sum = 0;
    for (int i = HEADER_SIZE; i < data.length; i += 2) sum += Bytes.u16(data, i);
    if ((sum & 0xFFFF) != Bytes.u16(data, CHECKSUM_OFFSET) || Bytes.u16(data, SANITY_OFFSET) != 0) {
      throw new BridgeException("Fiche en transition");
    }
    return new Pb8(data);
  }

  private static boolean isEncrypted(byte[] data) {
    for (int offset : ALWAYS_ZERO_OFFSETS) if (Bytes.u16(data, offset) != 0) return true;
    return false;
  }

  private static void decrypt(byte[] data) {
    long seed = Bytes.unsigned(data, 0, 4);
    long random = seed;
    for (int i = HEADER_SIZE; i < data.length; i += 2) {
      random = (random * 0x41C64E6DL + 0x6073) & 0xFFFFFFFFL;
      int word = Bytes.u16(data, i) ^ (int) (random >>> 16);
      data[i] = (byte) word;
      data[i + 1] = (byte) (word >>> 8);
    }
    byte[] shuffled = data.clone();
    int[] order = BLOCK_ORDER[(int) ((seed >>> 13) & 31) % 24];
    for (int block = 0; block < 4; block++) {
      System.arraycopy(
        shuffled,
        HEADER_SIZE + order[block] * BLOCK_SIZE,
        data,
        HEADER_SIZE + block * BLOCK_SIZE,
        BLOCK_SIZE
      );
    }
  }

  JSONObject toJson() throws JSONException {
    JSONArray moveIds = new JSONArray();
    for (int move : moves) moveIds.put(move);
    return new JSONObject()
      .put("dex", dex)
      .put("heldItem", heldItem)
      .put("nickname", nickname)
      .put("gender", gender)
      .put("moves", moveIds);
  }
}
