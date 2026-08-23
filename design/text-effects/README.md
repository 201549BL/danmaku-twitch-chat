# Original username effect assets

The shipped raster textures in `assets/text-effects/` are neutral grayscale light maps. At runtime,
CSS blends them with each chatter's Twitch username color; the source artwork contains no baked-in
brand palette.

## Cosmic drift

- Source: `cosmic-drift-source.png`
- Shipped asset: `assets/text-effects/cosmic-drift.webp`
- Creation: generated from an original project-specific prompt with OpenAI's built-in image
  generation tool, then mirrored into a guaranteed seamless tile, resized to 128×128, and encoded
  as WebP.
- Prompt intent: soft nebula luminance, sparse starlight, no planets, logos, text, brand artwork, or
  colored pixels.

## Ember

- Source: `ember-source.png`
- Shipped asset: `assets/text-effects/ember.webp`
- Creation: generated from an original project-specific prompt with OpenAI's built-in image
  generation tool, then mirrored into a guaranteed seamless tile, resized to 128×128, and encoded
  as WebP.
- Prompt intent: rising grayscale wisps and particle flecks, no literal fire scene, logos, text,
  brand artwork, or colored pixels.

## Pixel rain

- Source: `pixel-rain-source.png`
- Shipped asset: `assets/text-effects/pixel-rain.webp`
- Creation: generated from an original project-specific prompt with OpenAI's built-in image
  generation tool, then mirrored into a guaranteed seamless tile, resized to 128×128, and encoded
  as WebP.
- Prompt intent: vertical grayscale light dashes and scanline fragments with no letters, numbers,
  code, franchise references, logos, brand artwork, or colored pixels.

The generated sources are retained for provenance and future re-exports. They are outside the
extension release archive; only the optimized WebP tiles ship to users.

## Retired experiments

Liquid Light and Voltage were removed because they overlapped too closely with the four retained
effects. Their sources and optimized tiles remain under `retired/` for design history, but are not
referenced by the extension manifest or runtime CSS.
