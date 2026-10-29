import { log } from "./log";

// The tick Steam itself plays when its trackpad cursor moves onto a new element:
// TriggerSimpleHapticEvent(controller, 2 = both pads, 1 = Tick, intensity 1, gain 0),
// on the Deck's built-in controller (type 4) only. Played as focus moves within
// DeckyHub (Motion in index.tsx), unless Display Settings turns it off.
export let hapticsOn = true;

export let deckController: number | undefined;

export let controllerList: { unregister: () => void } | null = null;

export let lastTick = 0;

export const setHaptics = (on: boolean) => {
  hapticsOn = on;
};

export function hapticTick() {
  const input = (window as any).SteamClient?.Input;
  // One tick per move: a focus change can fire several focus events at once.
  if (!hapticsOn || !input || Date.now() - lastTick < 40) return;
  try {
    controllerList ??= input.RegisterForControllerListChanges((controllers: { eControllerType: number; nControllerIndex: number }[]) => {
      deckController = controllers.find((controller) => controller.eControllerType === 4)?.nControllerIndex;
    });
    if (deckController === undefined) return;
    lastTick = Date.now();
    input.TriggerSimpleHapticEvent(deckController, 2, 1, 1, 0);
  } catch (error) {
    log(`Haptic tick failed: ${error}`);
    hapticsOn = false;
  }
}

// Stops listening for controllers; DeckyHub's onDismount (via markUnloaded).
export function stopHaptics() {
  controllerList?.unregister();
  controllerList = null;
}
