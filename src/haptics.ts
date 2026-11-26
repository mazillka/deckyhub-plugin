import { log } from "./log";

// Feedback as focus moves within DeckyHub (Motion in index.tsx, and every window in
// WideModal.tsx). Display Settings turns either one off.
//
// Haptics: TriggerSimpleHapticEvent(controller, 2 = both pads, 2 = Click, intensity 2,
// gain +6 dB) on the Deck's built-in controller (type 4) only: meant to be stronger than
// the Tick Steam plays for its trackpad cursor.
//
// Sound: Steam's own navigation sound (ESteamUISound.BasicNav), so no audio ships with
// DeckyHub and Steam's volume applies. Steam's audio store keeps one pending sound, so
// this should merge with a sound Steam plays for the same move (unverified on hardware).
const BASIC_NAV_SOUND = 24;

let hapticsOn = true;

let soundOn = true;

let deckController: number | undefined;

let controllerList: { unregister: () => void } | null = null;

let lastMove = 0;

export const setHaptics = (on: boolean) => {
  hapticsOn = on;
};

export const setNavSound = (on: boolean) => {
  soundOn = on;
};

function playSound() {
  if (!soundOn) return;
  try {
    (window as any).SteamUIStore?.GamepadUIAudio?.PlayNavSound(BASIC_NAV_SOUND);
  } catch (error) {
    log(`Navigation sound failed: ${error}`);
    soundOn = false;
  }
}

function hapticClick() {
  const input = (window as any).SteamClient?.Input;
  if (!hapticsOn || !input) return;
  try {
    controllerList ??= input.RegisterForControllerListChanges(
      (controllers: { eControllerType: number; nControllerIndex: number }[]) => {
        deckController = controllers.find((controller) => controller.eControllerType === 4)?.nControllerIndex;
      },
    );
    if (deckController !== undefined) input.TriggerSimpleHapticEvent(deckController, 2, 2, 2, 6);
  } catch (error) {
    log(`Haptic feedback failed: ${error}`);
    hapticsOn = false;
  }
}

export function navFeedback() {
  // Once per move: a focus change can fire several focus events at once.
  if (Date.now() - lastMove < 40) return;
  lastMove = Date.now();
  playSound();
  hapticClick();
}

// Stops listening for controllers; DeckyHub's onDismount (via markUnloaded).
export function stopHaptics() {
  controllerList?.unregister();
  controllerList = null;
}
