// FreeCaption Canvas Renderer — Better Captions engine.ts'in vanilla JS port'u
// Per-word render + animation presets (fade/pop/typewriter/karaoke/bounce)

(function () {
  "use strict";

  function applyTextTransform(text, transform) {
    if (transform === "uppercase") return text.toUpperCase();
    if (transform === "lowercase") return text.toLowerCase();
    return text;
  }

  function hexToRgba(hex, opacity) {
    var clean = (hex || "").charAt(0) === "#" ? hex.slice(1) : (hex || "");
    var r = parseInt(clean.slice(0, 2), 16) || 0;
    var g = parseInt(clean.slice(2, 4), 16) || 0;
    var b = parseInt(clean.slice(4, 6), 16) || 0;
    return "rgba(" + r + "," + g + "," + b + "," + opacity + ")";
  }

  function easeOutBack(t) {
    var c1 = 1.70158;
    var c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function CaptionRenderer(ctx, width, height) {
    this.ctx = ctx;
    this.width = width;
    this.height = height;
  }

  CaptionRenderer.prototype.resize = function (w, h) {
    this.width = w;
    this.height = h;
  };

  CaptionRenderer.prototype.clear = function () {
    this.ctx.clearRect(0, 0, this.width, this.height);
  };

  CaptionRenderer.prototype.renderFrame = function (caption, currentTime, style, animation) {
    this.clear();
    if (!caption) return;

    var progress = this._getProgress(caption, currentTime, animation);
    if (progress.opacity <= 0) return;

    this.ctx.save();
    this.ctx.globalAlpha = progress.opacity;

    var font = style.fontWeight + ' ' + style.fontSize + 'px "' + style.fontFamily + '"';
    this.ctx.font = font;
    this.ctx.textBaseline = "middle";

    var maxWidthPx = this.width * style.maxWidth;
    var centerX = this.width * style.positionX;
    var centerY = this.height * style.positionY;

    var metrics = this._measureWords(caption.words, style, maxWidthPx, centerX);

    this._drawBackground(metrics, style, centerY);
    this._drawWords(metrics, currentTime, style, animation, centerY, progress);

    this.ctx.restore();
  };

  CaptionRenderer.prototype._measureWords = function (words, style, maxWidthPx, centerX) {
    var ctx = this.ctx;
    var spaceWidth = ctx.measureText(" ").width;
    var metrics = [];
    var widths = [];
    var totalWidth = 0;

    for (var i = 0; i < words.length; i++) {
      var t = applyTextTransform(words[i].text, style.textTransform);
      var w = ctx.measureText(t).width;
      widths.push(w);
      totalWidth += w;
    }
    totalWidth += spaceWidth * Math.max(0, words.length - 1);

    var startX;
    if (style.textAlign === "center") startX = centerX - totalWidth / 2;
    else if (style.textAlign === "right") startX = centerX + maxWidthPx / 2 - totalWidth;
    else startX = centerX - maxWidthPx / 2;

    var x = startX;
    for (var j = 0; j < words.length; j++) {
      var text = applyTextTransform(words[j].text, style.textTransform);
      metrics.push({ word: words[j], text: text, x: x, width: widths[j] });
      x += widths[j] + spaceWidth;
    }
    return metrics;
  };

  CaptionRenderer.prototype._drawBackground = function (metrics, style, centerY) {
    if (!style.backgroundEnabled) return;
    if (!style.backgroundColor || style.backgroundColor === "transparent") return;
    if (metrics.length === 0) return;

    var first = metrics[0];
    var last = metrics[metrics.length - 1];
    var totalWidth = last.x + last.width - first.x;
    var pad = style.backgroundPadding;
    var h = style.fontSize * style.lineHeight;

    var bgX = first.x - pad;
    var bgY = centerY - h / 2 - pad;
    var bgW = totalWidth + pad * 2;
    var bgH = h + pad * 2;

    this.ctx.fillStyle = hexToRgba(style.backgroundColor, style.backgroundOpacity);

    if (style.backgroundRadius > 0) {
      this._roundRect(bgX, bgY, bgW, bgH, style.backgroundRadius);
      this.ctx.fill();
    } else {
      this.ctx.fillRect(bgX, bgY, bgW, bgH);
    }
  };

  CaptionRenderer.prototype._drawWords = function (metrics, currentTime, style, animation, centerY, progress) {
    var ctx = this.ctx;
    for (var i = 0; i < metrics.length; i++) {
      var wm = metrics[i];
      var word = wm.word;
      var isActive = currentTime >= word.startTime;
      var wordDur = Math.max(word.endTime - word.startTime, 0.01);
      var wordProgress = clamp((currentTime - word.startTime) / wordDur, 0, 1);

      ctx.save();

      var drawX = wm.x;
      var drawY = centerY;
      var wordAlpha = 1;
      var scale = 1;

      switch (animation.preset) {
        case "fade":
          break;
        case "pop":
          if (!isActive) { wordAlpha = 0; }
          else {
            var pt = clamp(wordProgress / 0.3, 0, 1);
            scale = easeOutBack(pt);
            wordAlpha = Math.min(1, pt * 3);
          }
          break;
        case "typewriter":
          if (!isActive) wordAlpha = 0;
          else wordAlpha = clamp(wordProgress / 0.15, 0, 1);
          break;
        case "karaoke":
          // Renk drawWords sonunda set edilecek
          break;
        case "bounce":
          if (!isActive) { wordAlpha = 0; }
          else {
            var bt = clamp(wordProgress / 0.2, 0, 1);
            var bnc = easeOutBack(bt);
            drawY = centerY + (1 - bnc) * -15;
            wordAlpha = Math.min(1, bt * 3);
          }
          break;
      }

      ctx.globalAlpha = progress.opacity * wordAlpha;

      if (scale !== 1) {
        ctx.translate(drawX + wm.width / 2, drawY);
        ctx.scale(scale, scale);
        ctx.translate(-(drawX + wm.width / 2), -drawY);
      }

      // Shadow
      if (style.shadowEnabled && style.shadowBlur > 0) {
        ctx.shadowColor = hexToRgba(style.shadowColor, style.shadowOpacity);
        ctx.shadowBlur = style.shadowBlur;
        ctx.shadowOffsetX = style.shadowOffsetX;
        ctx.shadowOffsetY = style.shadowOffsetY;
      }

      // Stroke
      if (style.strokeEnabled && style.strokeWidth > 0) {
        ctx.strokeStyle = hexToRgba(style.strokeColor, style.strokeOpacity);
        ctx.lineWidth = style.strokeWidth * 2;
        ctx.lineJoin = "round";
        ctx.strokeText(wm.text, drawX, drawY);
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      }

      // Fill (karaoke aktifse renk degisir)
      if (animation.preset === "karaoke" && isActive) {
        ctx.fillStyle = animation.highlightColor;
      } else {
        ctx.fillStyle = style.textColor;
      }
      ctx.fillText(wm.text, drawX, drawY);

      ctx.restore();
    }
  };

  CaptionRenderer.prototype._getProgress = function (caption, currentTime, animation) {
    var fadeIn = animation.fadeInDuration;
    var fadeOut = animation.fadeOutDuration;
    var opacity = 1;
    var elapsed = currentTime - caption.startTime;
    var remaining = caption.endTime - currentTime;
    if (elapsed < fadeIn) opacity = easeOutCubic(elapsed / fadeIn);
    else if (remaining < fadeOut) opacity = easeOutCubic(remaining / fadeOut);
    return { opacity: clamp(opacity, 0, 1), scale: 1 };
  };

  CaptionRenderer.prototype._roundRect = function (x, y, w, h, r) {
    var ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  };

  window.FC_CaptionRenderer = CaptionRenderer;
})();
