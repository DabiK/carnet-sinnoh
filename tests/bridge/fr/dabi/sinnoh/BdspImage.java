package fr.dabi.sinnoh;

import java.nio.charset.StandardCharsets;

/**
 * Synthetic memory image of Pokémon Brilliant Diamond 1.3.0: only the IL2CPP objects and fields
 * the bridge walks through. No data from the game itself is included.
 */
final class BdspImage {

  static final long TEXT_BASE = 0x1a27766000L;
  private static final int INVENTORY_SLOTS = 3000;
  private static final int BATTLE_SLOTS = 30;

  final FakeMemory memory = new FakeMemory();
  private final long work;
  private final long inventory;
  private final long party;
  private final long partyMembers;
  private final long battlers;
  private final long windows;

  BdspImage() {
    this("PlayerWork");
  }

  /** @param playerWorkClass class name written to memory; anything else imitates another game. */
  BdspImage(String playerWorkClass) {
    // PlayerWork: three dereferences away from the text segment.
    work = object(playerWorkClass, 0x810);
    long typeInfo = memory.allocate(0xC0);
    long staticFields = memory.allocate(0x18);
    memory.mapAt(TEXT_BASE + 0x4C64DC0, 8);
    memory.writePointer(TEXT_BASE + 0x4C64DC0, typeInfo);
    memory.writePointer(typeInfo + 0xB8, staticFields);
    memory.writePointer(staticFields + 0x10, work);
    memory.writeNumber(work + 0x7D0, -1, 4); // No zone transition running.

    inventory = array("SaveItem[]", INVENTORY_SLOTS, 12);
    memory.writePointer(work + 0x48, inventory);

    party = object("PokeParty", 0x20);
    partyMembers = array("PokemonParam[]", 6, 8);
    memory.writePointer(party + 0x10, partyMembers);
    memory.writePointer(work + 0x808, party);

    // BattleViewCore: singleton found through the metadata of its accessor method.
    long view = object("BattleViewCore", 0x38);
    long method = memory.allocate(0x20);
    long viewClass = memory.allocate(0xC0);
    long viewStatics = memory.allocate(0x10);
    memory.mapAt(TEXT_BASE + 0x4C676C0, 8);
    memory.writePointer(TEXT_BASE + 0x4C676C0, method);
    memory.writePointer(method + 0x18, viewClass);
    memory.writePointer(viewClass + 0xB8, viewStatics);
    memory.writePointer(viewStatics, view);

    long system = memory.allocate(0x18);
    long module = memory.allocate(0x110);
    long environment = memory.allocate(0x18);
    long container = memory.allocate(0x28);
    battlers = array("BTL_POKEPARAM[]", BATTLE_SLOTS, 8);
    memory.writePointer(view + 0x28, system);
    memory.writePointer(system + 0x10, module);
    memory.writePointer(module + 0x108, environment);
    memory.writePointer(environment + 0x10, container);
    memory.writePointer(container + 0x20, battlers);

    long ui = memory.allocate(0x28);
    windows = array("BattleStatusWindow[]", 4, 8);
    memory.writePointer(view + 0x30, ui);
    memory.writePointer(ui + 0x20, windows);

    zone(354);
    party(Pb8Fixture.of(387, "Rapidos"));
  }

  void zone(int zoneId) {
    memory.writeNumber(work + 0x40, zoneId, 4);
  }

  void zoneTransition(boolean running) {
    memory.writeNumber(work + 0x7D0, running ? 355 : -1, 4);
  }

  void badges(int mask) {
    memory.writeNumber(work + 0xF2, mask, 1);
  }

  void leagueCleared(boolean cleared) {
    memory.writeNumber(work + 0xF5, cleared ? 1 : 0, 1);
  }

  void nationalDex(boolean unlocked) {
    memory.writeNumber(work + 0x231, unlocked ? 1 : 0, 1);
  }

  void item(int itemId, int count) {
    memory.writeNumber(inventory + 0x20 + itemId * 12L, count, 4);
  }

  void party(Pb8Fixture... members) {
    memory.writeNumber(party + 0x18, members.length, 4);
    for (int i = 0; i < members.length; i++) {
      memory.writePointer(partyMembers + 0x20 + i * 8L, pokemonParam(members[i].encrypted()));
    }
  }

  /** Replaces any previous battle, then raises the battle flag. */
  void startBattle(Battler... active) {
    for (int slot = 0; slot < 4; slot++) memory.writePointer(windows + 0x20 + slot * 8L, 0);
    for (int slot = 0; slot < active.length; slot++) {
      Battler battler = active[slot];
      memory.writePointer(battlers + 0x20 + battler.battleId * 8L, battler.address);
      long window = memory.allocate(0xE8);
      memory.writeNumber(window + 0xD8, 1, 1); // Window shown on screen.
      memory.writeNumber(window + 0xD8 + 13, battler.battleId, 1);
      memory.writeNumber(window + 0xD8 + 14, battler.player ? 1 : 0, 1);
      memory.writePointer(windows + 0x20 + slot * 8L, window);
    }
    battling(true);
  }

  void battling(boolean running) {
    memory.writeNumber(work + 0x7F0, running ? 1 : 0, 1);
  }

  Battler battler(int battleId, boolean player, Pb8Fixture pokemon) {
    return new Battler(battleId, player, pokemon);
  }

  /** One BTL_POKEPARAM and its three blocks: core, battle base stats, variable state. */
  final class Battler {

    final int battleId;
    final boolean player;
    final long address = memory.allocate(0x28);
    private final long core = memory.allocate(0x40);
    private final long base = memory.allocate(0x20);
    private final long variable = memory.allocate(0x18);

    private Battler(int battleId, boolean player, Pb8Fixture pokemon) {
      this.battleId = battleId;
      this.player = player;
      memory.writePointer(address + 0x10, core);
      memory.writePointer(address + 0x18, base);
      memory.writePointer(address + 0x20, variable);
      memory.writePointer(core + 0x10, pokemonParam(pokemon.encrypted()));
      memory.writeNumber(core + 0x20, pokemon.dex, 2);
      memory.writeNumber(core + 0x2F, battleId, 1);
      ranks(0, 0, 0, 0, 0, 0, 0);
    }

    Battler level(int level) {
      memory.writeNumber(core + 0x2E, level, 1);
      return this;
    }

    Battler hp(int current, int maximum) {
      memory.writeNumber(core + 0x24, maximum, 2);
      memory.writeNumber(core + 0x26, current, 2);
      return this;
    }

    /** In-game order: HP, Attack, Defense, Sp. Atk, Sp. Def, Speed. */
    Battler ivs(int hp, int attack, int defense, int specialAttack, int specialDefense, int speed) {
      int[] values = { hp, attack, defense, specialAttack, specialDefense, speed };
      for (int i = 0; i < values.length; i++) memory.writeNumber(core + 0x33 + i, values[i], 1);
      return this;
    }

    /** In-game order: Attack, Defense, Sp. Atk, Sp. Def, Speed. */
    Battler stats(int attack, int defense, int specialAttack, int specialDefense, int speed) {
      int[] values = { attack, defense, specialAttack, specialDefense, speed };
      for (int i = 0; i < values.length; i++) memory.writeNumber(base + 0x14 + i * 2, values[i], 2);
      return this;
    }

    Battler types(int first, int second) {
      memory.writeNumber(base + 0x1E, first, 1);
      memory.writeNumber(base + 0x1F, second, 1);
      return this;
    }

    /** Stat stages from -6 to +6, stored offset by 6. */
    Battler ranks(int... stages) {
      for (int i = 0; i < stages.length; i++) memory.writeNumber(variable + 0x10 + i, stages[i] + 6, 1);
      return this;
    }

    Battler species(int dex) {
      memory.writeNumber(core + 0x20, dex, 2);
      return this;
    }
  }

  /** PokemonParam -> accessor -> byte array holding the PB8. */
  private long pokemonParam(byte[] pb8) {
    long param = memory.allocate(0x28);
    long accessor = memory.allocate(0x20);
    long bytes = memory.allocate(0x20 + pb8.length);
    memory.writePointer(param + 0x20, accessor);
    memory.writePointer(accessor + 0x18, bytes);
    memory.write(bytes + 0x20, pb8);
    return param;
  }

  /** IL2CPP object: its first field points to its class, which points to its name. */
  private long object(String className, int size) {
    long object = memory.allocate(size);
    long klass = memory.allocate(0x20);
    long name = memory.allocate(64);
    memory.write(name, className.getBytes(StandardCharsets.UTF_8));
    memory.writePointer(klass + 0x10, name);
    memory.writePointer(object, klass);
    return object;
  }

  /** IL2CPP array: length at +0x18, items from +0x20. */
  private long array(String className, int length, int elementSize) {
    long array = object(className, 0x20 + length * elementSize);
    memory.writeNumber(array + 0x18, length, 8);
    return array;
  }
}
