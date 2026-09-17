// Centralized references to the externally-hosted (R2) project assets.
// Mirrors the AWESMOS_INTERNAL_ASSET_MAP placeholders {{ASSET_01}}..{{ASSET_24}}
// by semantic name rather than by original local filename.

const BASE = "https://pub-59a4354e0fed40cd808b1a033087eafd.r2.dev/free/Florma";

export const assets = {
  // Hero/background media
  heroVideo: `${BASE}/hero-bg.mp4`, // {{ASSET_16}}
  heroVideoSource: `${BASE}/Background%20Video.mp4`, // {{ASSET_01}}

  // Logo/brand assets
  logoBlack: `${BASE}/Black%20Logo.svg`, // {{ASSET_02}}
  logoMark1: `${BASE}/Logo%201.svg`, // {{ASSET_03}}
  logoMark2: `${BASE}/Logo%202.svg`, // {{ASSET_04}}
  logoMark3: `${BASE}/Logo%203.svg`, // {{ASSET_05}}
  logoMark4: `${BASE}/Logo%204.svg`, // {{ASSET_06}}
  logoMark5: `${BASE}/Logo%205.svg`, // {{ASSET_07}}
  logoMark6: `${BASE}/Logo%206.svg`, // {{ASSET_08}}
  logoWhiteBig: `${BASE}/White%20Big%20Logo.svg`, // {{ASSET_12}}
  logoFlormaWhite: `${BASE}/logo-florma-white.svg`, // {{ASSET_17}}
  logoFlorma: `${BASE}/logo-florma.svg`, // {{ASSET_18}}

  // People/avatar images
  teamMember1: `${BASE}/Team%20Member%201.png`, // {{ASSET_09}}
  teamMember2: `${BASE}/Team%20Member%202.png`, // {{ASSET_10}}
  avatar1: `${BASE}/avatar-1.jpg`, // {{ASSET_13}}
  avatar2: `${BASE}/avatar-2.jpg`, // {{ASSET_14}}

  // Runtime visual assets
  thumbnail: `${BASE}/Thumbnail.png`, // {{ASSET_11}}
  caseThumb: `${BASE}/case-thumb.jpg`, // {{ASSET_15}}

  // Client / "trusted by" logos (LogoTicker)
  clientBoltshift: `${BASE}/boltshift.svg`, // {{ASSET_19}}
  clientEpicurious: `${BASE}/epicurious.svg`, // {{ASSET_20}}
  clientFeatherdev: `${BASE}/featherdev.svg`, // {{ASSET_21}}
  clientGlobalbank: `${BASE}/globalbank.svg`, // {{ASSET_22}}
  clientIkigai: `${BASE}/ikigai.svg`, // {{ASSET_23}}
  clientSpherule: `${BASE}/spherule.svg`, // {{ASSET_24}}
} as const;
