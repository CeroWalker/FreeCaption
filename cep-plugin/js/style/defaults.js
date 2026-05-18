// FreeCaption Stil — Better Captions port (vanilla JS)
// StyleConfig + AnimationConfig defaults

window.FC_DEFAULT_STYLE = {
  fontFamily: "Inter",
  fontSize: 64,
  fontWeight: 800,
  textColor: "#ffffff",
  strokeEnabled: true,
  strokeColor: "#000000",
  strokeOpacity: 1,
  strokeWidth: 4,
  shadowEnabled: true,
  shadowColor: "#000000",
  shadowOpacity: 0.6,
  shadowBlur: 8,
  shadowOffsetX: 0,
  shadowOffsetY: 2,
  backgroundEnabled: false,
  backgroundColor: "#000000",
  backgroundOpacity: 0.55,
  backgroundPadding: 18,
  backgroundRadius: 12,
  positionX: 0.5,
  positionY: 0.85,
  textAlign: "center",
  maxWidth: 0.85,
  lineHeight: 1.2,
  textTransform: "none",
  maxWords: 3,
};

window.FC_DEFAULT_ANIMATION = {
  preset: "karaoke",
  fadeInDuration: 0.15,
  fadeOutDuration: 0.15,
  highlightColor: "#06b6d4",
};

window.FC_ANIMATION_PRESETS = [
  { value: "fade", label: "Fade", desc: "Yumuşak opacity geçişi" },
  { value: "pop", label: "Pop", desc: "Her kelimede scale bounce" },
  { value: "typewriter", label: "Typewriter", desc: "Kelimeler sırayla belirir" },
  { value: "karaoke", label: "Karaoke", desc: "Aktif kelime vurgulu" },
  { value: "bounce", label: "Bounce", desc: "Kelimeler zıplayarak gelir" },
];

window.FC_PRESETS = {
  tiktok: {
    name: "TikTok/Reels",
    style: {
      fontSize: 72, fontWeight: 900, textColor: "#ffffff",
      strokeEnabled: true, strokeColor: "#000000", strokeWidth: 6,
      shadowEnabled: true, shadowBlur: 4, shadowOffsetY: 2,
      backgroundEnabled: false,
      positionY: 0.55, textTransform: "uppercase", maxWords: 3,
    },
    animation: { preset: "karaoke", highlightColor: "#fde047" }
  },
  classic: {
    name: "Klasik",
    style: {
      fontSize: 48, fontWeight: 600, textColor: "#ffffff",
      strokeEnabled: false,
      shadowEnabled: true, shadowBlur: 6, shadowOffsetY: 3, shadowOpacity: 0.7,
      backgroundEnabled: true, backgroundColor: "#000000", backgroundOpacity: 0.7,
      positionY: 0.88, textTransform: "none", maxWords: 5,
    },
    animation: { preset: "fade", fadeInDuration: 0.2 }
  },
  minimal: {
    name: "Minimal",
    style: {
      fontSize: 42, fontWeight: 500, textColor: "#ffffff",
      strokeEnabled: false,
      shadowEnabled: true, shadowBlur: 12, shadowOpacity: 0.4,
      backgroundEnabled: false,
      positionY: 0.9, textTransform: "none", maxWords: 6,
    },
    animation: { preset: "fade", fadeInDuration: 0.25 }
  },
  bold: {
    name: "Kalın",
    style: {
      fontSize: 80, fontWeight: 900, textColor: "#ffffff",
      strokeEnabled: true, strokeColor: "#000000", strokeWidth: 8,
      shadowEnabled: true, shadowBlur: 0, shadowOffsetX: 4, shadowOffsetY: 4, shadowOpacity: 1,
      backgroundEnabled: false,
      positionY: 0.7, textTransform: "uppercase", maxWords: 2,
    },
    animation: { preset: "pop" }
  },
};
