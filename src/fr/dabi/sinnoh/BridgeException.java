package fr.dabi.sinnoh;

/**
 * A read that cannot be trusted: wrong game profile, or memory caught mid-update. The message is
 * shown to the player, so it is written in French.
 */
final class BridgeException extends Exception {

  BridgeException(String message) {
    super(message);
  }
}
