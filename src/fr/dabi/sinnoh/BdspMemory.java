package fr.dabi.sinnoh;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Reads Pokémon Brilliant Diamond 1.3.0 (main build ID 94CEAE325C205C4B9D6F7235552F28FD) through
 * a debugger. Every offset below belongs to that build; other versions must fail the IL2CPP class
 * checks rather than produce wrong data.
 *
 * <p>The game keeps running while it is read, so each structure is validated and a read that
 * lands in the middle of an update is reported as a {@link BridgeException}.
 */
final class BdspMemory {

  // Pointer chains from the executable's load address to the two singletons.
  private static final long[] PLAYER_WORK_CHAIN = { 0x4C64DC0, 0xB8, 0x10, 0 };
  private static final long BATTLE_VIEW_METHOD = 0x4C676C0;
  private static final int METHOD_CLASS = 0x18;
  private static final int CLASS_STATIC_FIELDS = 0xB8;

  // IL2CPP object model.
  private static final int CLASS_NAME = 0x10;
  private static final int CLASS_NAME_MAX_LENGTH = 64;
  private static final int ARRAY_LENGTH = 0x18;
  private static final int ARRAY_ITEMS = 0x20;
  private static final int POINTER_SIZE = 8;

  // PlayerWork. SaveData is an inline value type: runtime field offsets include the boxed
  // 0x10-byte header, hence PlayerWork + fieldOffset + 8.
  private static final int WORK_SAVE_DATA = 0x18;
  private static final int WORK_ZONE_ID = 0x40;
  private static final int WORK_PENDING_ZONE = 0x7D0;
  private static final int WORK_IS_BATTLING = 0x7F0;
  private static final int WORK_PARTY = 0x808;
  private static final int NO_PENDING_ZONE = -1;

  // SaveData, relative to WORK_SAVE_DATA.
  private static final int SAVE_SIZE = 0x240;
  private static final int SAVE_ZONE_ID = 0x28;
  private static final int SAVE_ITEMS = 0x30;
  private static final int SAVE_BADGE_MASK = 0xDA;
  private static final int SAVE_LEAGUE_CLEARED = 0xDD;
  private static final int SAVE_NATIONAL_DEX = 0x219;
  private static final int HIGHEST_ZONE_ID = 1000;

  // Bag: one SaveItem per item ID, the count comes first.
  private static final int ITEM_COUNT = 3000;
  private static final int ITEM_SIZE = 12;
  private static final int HIGHEST_ITEM_QUANTITY = 9999;

  // PokeParty and PokemonParam.
  private static final int PARTY_MEMBERS = 0x10;
  private static final int PARTY_COUNT = 0x18;
  private static final int PARTY_CAPACITY = 6;
  private static final int POKEMON_ACCESSOR = 0x20;
  private static final int ACCESSOR_DATA = 0x18;
  private static final int HIGHEST_SPECIES = 493;

  // BattleViewCore down to the active Pokémon.
  private static final int VIEW_SYSTEM = 0x28;
  private static final int VIEW_UI = 0x30;
  private static final int SYSTEM_MODULE = 0x10;
  private static final int MODULE_BATTLE_ENV = 0x108;
  private static final int BATTLE_ENV_POKECON = 0x10;
  private static final int POKECON_ACTIVE_PARAMS = 0x20;
  private static final int BATTLE_SLOT_COUNT = 30;
  private static final int UI_STATUS_WINDOWS = 0x20;
  private static final int STATUS_WINDOW_COUNT = 4;
  private static final int WINDOW_HUD = 0xD8;
  private static final int HUD_SIZE = 16;
  private static final int HUD_VISIBLE = 0;
  private static final int HUD_BATTLE_ID = 13;
  private static final int HUD_IS_PLAYER = 14;

  // BTL_POKEPARAM and its three blocks.
  private static final int PARAM_SIZE = 0x28;
  private static final int PARAM_CORE = 0x10;
  private static final int PARAM_BASE = 0x18;
  private static final int PARAM_VARIABLE = 0x20;
  private static final int CORE_SIZE = 0x40;
  private static final int CORE_SOURCE_POKEMON = 0x10;
  private static final int CORE_SPECIES = 0x20;
  private static final int CORE_MAX_HP = 0x24;
  private static final int CORE_HP = 0x26;
  private static final int CORE_LEVEL = 0x2E;
  private static final int CORE_BATTLE_ID = 0x2F;
  /** Published as HP, Attack, Defense, Speed, Sp. Atk, Sp. Def. */
  private static final int[] CORE_IVS = { 0x33, 0x34, 0x35, 0x38, 0x36, 0x37 };
  private static final int BASE_SIZE = 0x20;
  /** Published as Attack, Defense, Speed, Sp. Atk, Sp. Def. */
  private static final int[] BASE_STATS = { 0x14, 0x16, 0x1C, 0x18, 0x1A };
  private static final int BASE_TYPE_1 = 0x1E;
  private static final int BASE_TYPE_2 = 0x1F;
  private static final int VARIABLE_RANKS = 0x10;
  private static final int RANK_COUNT = 7;
  /** Stat stages are stored from 0 to 12; 6 means no change. */
  private static final int NEUTRAL_RANK = 6;
  private static final int HIGHEST_HP = 999;
  private static final int HIGHEST_LEVEL = 100;

  private final GdbClient gdb;
  private final long textBase;
  /**
   * Nickname, gender and moves by source Pokémon address. They do not change during a battle and
   * decoding them is the slowest part of a sample, unlike HP and stats which are always re-read.
   */
  private final Map<Long, Pb8> battleDetails = new HashMap<>();

  BdspMemory(GdbClient gdb) throws IOException {
    this.gdb = gdb;
    this.textBase = gdb.textBase();
  }

  /** Address of the PlayerWork singleton, after checking this really is the expected game. */
  long playerWork() throws IOException, BridgeException {
    long address = textBase;
    for (int i = 0; i < PLAYER_WORK_CHAIN.length - 1; i++) address = gdb.readPointer(address + PLAYER_WORK_CHAIN[i]);
    long work = address + PLAYER_WORK_CHAIN[PLAYER_WORK_CHAIN.length - 1];
    checkClass(work, "PlayerWork");
    return work;
  }

  boolean isBattling(long work) throws IOException {
    return Bytes.u8(gdb.read(work + WORK_IS_BATTLING, 1), 0) != 0;
  }

  void forgetBattle() {
    battleDetails.clear();
  }

  /** Current zone, badges, bag and party, as saved data sees them. */
  JSONObject readWorld(long work) throws IOException, BridgeException, JSONException {
    byte[] save = gdb.read(work + WORK_SAVE_DATA, SAVE_SIZE);
    int zone = Bytes.int32(save, SAVE_ZONE_ID);
    int badgeMask = Bytes.u8(save, SAVE_BADGE_MASK);
    if (zone < 0 || zone > HIGHEST_ZONE_ID || !isFlag(save[SAVE_LEAGUE_CLEARED]) || !isFlag(save[SAVE_NATIONAL_DEX])) {
      throw new BridgeException("Profil du monde incompatible");
    }
    if (pendingZone(work) != NO_PENDING_ZONE) throw new BridgeException("Changement de zone en cours");

    JSONObject items = readItems(Bytes.u64(save, SAVE_ITEMS));
    JSONArray party = readParty(gdb.readPointer(work + WORK_PARTY));

    // The player may have walked into another zone while the bag and party were being read.
    if (Bytes.unsigned(gdb.read(work + WORK_ZONE_ID, 4), 0, 4) != zone || pendingZone(work) != NO_PENDING_ZONE) {
      throw new BridgeException("Changement de zone en cours");
    }
    return new JSONObject()
      .put("status", "live")
      .put("zoneId", zone)
      .put("badgeMask", badgeMask)
      .put("badges", Integer.bitCount(badgeMask))
      .put("leagueCleared", save[SAVE_LEAGUE_CLEARED] != 0)
      .put("nationalDex", save[SAVE_NATIONAL_DEX] != 0)
      .put("items", items)
      .put("party", party)
      .put("timestamp", System.currentTimeMillis());
  }

  private int pendingZone(long work) throws IOException {
    return Bytes.int32(gdb.read(work + WORK_PENDING_ZONE, 4), 0);
  }

  private static boolean isFlag(byte value) {
    return value == 0 || value == 1;
  }

  /** Item ID to owned quantity, for the items the player has. */
  private JSONObject readItems(long array) throws IOException, BridgeException, JSONException {
    checkClass(array, "SaveItem[]");
    int length = (int) Bytes.u64(gdb.read(array + ARRAY_LENGTH, 8), 0);
    if (length != ITEM_COUNT) throw new BridgeException("Inventaire incompatible");
    byte[] inventory = new byte[length * ITEM_SIZE];
    for (int start = 0; start < inventory.length; start += GdbClient.MAX_READ_SIZE) {
      byte[] part = gdb.read(array + ARRAY_ITEMS + start, Math.min(GdbClient.MAX_READ_SIZE, inventory.length - start));
      System.arraycopy(part, 0, inventory, start, part.length);
    }
    JSONObject items = new JSONObject();
    for (int id = 0; id < length; id++) {
      long quantity = Bytes.unsigned(inventory, id * ITEM_SIZE, 4);
      if (quantity > HIGHEST_ITEM_QUANTITY) throw new BridgeException("Inventaire en transition");
      if (quantity > 0) items.put(String.valueOf(id), quantity);
    }
    return items;
  }

  private JSONArray readParty(long party) throws IOException, BridgeException, JSONException {
    checkClass(party, "PokeParty");
    int count = Bytes.int32(gdb.read(party + PARTY_COUNT, 4), 0);
    if (count < 1 || count > PARTY_CAPACITY) throw new BridgeException("Équipe en transition");
    byte[] members = gdb.read(gdb.readPointer(party + PARTY_MEMBERS), ARRAY_ITEMS + PARTY_CAPACITY * POINTER_SIZE);
    if (Bytes.u64(members, ARRAY_LENGTH) != PARTY_CAPACITY) throw new BridgeException("Équipe incompatible");
    JSONArray team = new JSONArray();
    for (int i = 0; i < count; i++) {
      Pb8 pokemon = readPb8(Bytes.u64(members, ARRAY_ITEMS + i * POINTER_SIZE));
      if (pokemon.dex < 1 || pokemon.dex > HIGHEST_SPECIES) throw new BridgeException("Équipe en transition");
      team.put(
        new JSONObject().put("dex", pokemon.dex).put("nickname", pokemon.nickname).put("heldItem", pokemon.heldItem)
      );
    }
    return team;
  }

  /**
   * Adds every Pokémon currently on the field to {@code player} or {@code opponents}.
   *
   * <p>The active Pokémon are found through the status windows on screen: the first entry of a
   * side's party is not necessarily the one fighting.
   */
  void readActiveBattlers(JSONArray player, JSONArray opponents) throws IOException, BridgeException, JSONException {
    long method = gdb.readPointer(textBase + BATTLE_VIEW_METHOD);
    long klass = gdb.readPointer(method + METHOD_CLASS);
    long view = gdb.readPointer(gdb.readPointer(klass + CLASS_STATIC_FIELDS));
    checkClass(view, "BattleViewCore");

    long system = gdb.readPointer(view + VIEW_SYSTEM);
    long module = gdb.readPointer(system + SYSTEM_MODULE);
    long battleEnv = gdb.readPointer(module + MODULE_BATTLE_ENV);
    long pokecon = gdb.readPointer(battleEnv + BATTLE_ENV_POKECON);
    byte[] params = gdb.read(
      gdb.readPointer(pokecon + POKECON_ACTIVE_PARAMS),
      ARRAY_ITEMS + BATTLE_SLOT_COUNT * POINTER_SIZE
    );
    if (Bytes.u64(params, ARRAY_LENGTH) != BATTLE_SLOT_COUNT) throw new BridgeException("Profil mémoire incompatible");

    long ui = gdb.readPointer(view + VIEW_UI);
    byte[] windows = gdb.read(
      gdb.readPointer(ui + UI_STATUS_WINDOWS),
      ARRAY_ITEMS + STATUS_WINDOW_COUNT * POINTER_SIZE
    );
    if (Bytes.u64(windows, ARRAY_LENGTH) != STATUS_WINDOW_COUNT) throw new BridgeException("Combat en transition");

    for (int slot = 0; slot < STATUS_WINDOW_COUNT; slot++) {
      long window = Bytes.u64(windows, ARRAY_ITEMS + slot * POINTER_SIZE);
      if (window == 0) continue;
      byte[] hud = gdb.read(window + WINDOW_HUD, HUD_SIZE);
      if (hud[HUD_VISIBLE] == 0) continue;
      int battleId = Bytes.u8(hud, HUD_BATTLE_ID);
      if (battleId >= BATTLE_SLOT_COUNT) continue;
      long param = Bytes.u64(params, ARRAY_ITEMS + battleId * POINTER_SIZE);
      if (param == 0) continue;
      JSONObject battler = readBattler(param);
      if (battler.getInt("battleId") != battleId) throw new BridgeException("Changement de Pokémon");
      (hud[HUD_IS_PLAYER] != 0 ? player : opponents).put(battler);
    }
  }

  private JSONObject readBattler(long address) throws IOException, BridgeException, JSONException {
    byte[] param = gdb.read(address, PARAM_SIZE);
    byte[] core = gdb.read(Bytes.u64(param, PARAM_CORE), CORE_SIZE);
    byte[] base = gdb.read(Bytes.u64(param, PARAM_BASE), BASE_SIZE);
    byte[] ranks = gdb.read(Bytes.u64(param, PARAM_VARIABLE) + VARIABLE_RANKS, RANK_COUNT);

    int species = Bytes.u16(core, CORE_SPECIES);
    int maxHp = Bytes.u16(core, CORE_MAX_HP);
    int hp = Bytes.u16(core, CORE_HP);
    int level = Bytes.u8(core, CORE_LEVEL);
    boolean plausible =
      species >= 1 &&
      species <= HIGHEST_SPECIES &&
      maxHp >= 1 &&
      maxHp <= HIGHEST_HP &&
      hp <= maxHp &&
      level >= 1 &&
      level <= HIGHEST_LEVEL;
    if (!plausible) throw new BridgeException("Combat en transition");

    long source = Bytes.u64(core, CORE_SOURCE_POKEMON);
    Pb8 details = battleDetails.get(source);
    if (details == null) {
      details = readPb8(source);
      battleDetails.put(source, details);
    }
    if (details.dex != species) throw new BridgeException("Forme en transition");

    JSONArray stats = new JSONArray();
    JSONArray ivs = new JSONArray();
    JSONArray rankChanges = new JSONArray();
    for (int offset : BASE_STATS) stats.put(Bytes.u16(base, offset));
    for (int offset : CORE_IVS) ivs.put(Bytes.u8(core, offset));
    for (byte rank : ranks) rankChanges.put((rank & 255) - NEUTRAL_RANK);
    return details
      .toJson()
      .put("hp", hp)
      .put("maxHp", maxHp)
      .put("level", level)
      .put("battleId", Bytes.u8(core, CORE_BATTLE_ID))
      .put("stats", stats)
      .put("ivs", ivs)
      .put("ranks", rankChanges)
      .put("typeIds", new JSONArray().put(Bytes.u8(base, BASE_TYPE_1)).put(Bytes.u8(base, BASE_TYPE_2)));
  }

  /** Follows a PokemonParam to the byte array holding its PB8. */
  private Pb8 readPb8(long pokemon) throws IOException, BridgeException {
    long accessor = gdb.readPointer(pokemon + POKEMON_ACCESSOR);
    long data = gdb.readPointer(accessor + ACCESSOR_DATA);
    return Pb8.decode(gdb.read(data + ARRAY_ITEMS, Pb8.SIZE));
  }

  /** Compares an object's IL2CPP class name: the cheapest proof that an offset still holds. */
  private void checkClass(long object, String expected) throws IOException, BridgeException {
    long klass = gdb.readPointer(object);
    byte[] name = gdb.read(gdb.readPointer(klass + CLASS_NAME), CLASS_NAME_MAX_LENGTH);
    int end = 0;
    while (end < name.length && name[end] != 0) end++;
    if (!expected.equals(new String(name, 0, end, StandardCharsets.UTF_8))) {
      throw new BridgeException("Jeu/version non compatible · BDSP 1.3.0 requis");
    }
  }
}
