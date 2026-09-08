/**
 * Which avatars have a photoreal presenter.
 *
 * Shared between the rig builder and the tests so the two cannot drift: a
 * portrait added to the catalogue without a rig would fail to animate, and a
 * rig built for an avatar that no longer exists would sit in the JSON forever.
 *
 * Pip is absent on purpose. Pip is the avatar offered to children, and a
 * photoreal synthetic child talking to a child about their body is not a
 * thing this should ship, however well it would render.
 */
export const PHOTO_RIG_IDS = ["asha", "vikram", "tara", "kiran", "nova"];
