import { log } from "./log";

// Feedback as focus moves within DeckyHub (Motion in index.tsx, and every window in
// WideModal.tsx). Display Settings turns either one off.
//
// Haptics: one long pulse, TriggerHapticPulse(controller, side 0 and 1, 48000 (pulse length,
// microseconds), 0), on the built-in controller (Steam's Deck types, 4 and 10). Picked by feel
// on a Deck, where TriggerSimpleHapticEvent was too weak at any strength. Steam no longer has
// RegisterForControllerListChanges, so the controller comes from its ControllerStore.
//
// Sound: Steam's own navigation sound (ESteamUISound.BasicNav), so no audio ships with
// DeckyHub and Steam's volume applies. Steam's audio store keeps one pending sound, so
// this should merge with a sound Steam plays for the same move (unverified on hardware).
const BASIC_NAV_SOUND = 24;

let hapticsOn = true;

let soundOn = true;

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
    const controllers: { eControllerType: number; nControllerIndex: number }[] =
      (window as any).ControllerStore?.GetControllers() ?? [];
    const builtIn = controllers.find(({ eControllerType }) => eControllerType === 4 || eControllerType === 10);
    if (!builtIn) return;
    for (const side of [0, 1]) input.TriggerHapticPulse(builtIn.nControllerIndex, side, 48000, 0);
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
