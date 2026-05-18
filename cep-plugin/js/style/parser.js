// FreeCaption SRT Parser — Better Captions parser.ts port
// SRT dosyasini CaptionItem dizisine donusturur
// Word-level timestamp varsa kullanir, yoksa caption sureli kelimelere paylastirir

(function () {
  "use strict";

  function parseTimestamp(ts) {
    // "00:01:23,456" -> 83.456
    var m = ts.match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/);
    if (!m) return 0;
    return +m[1] * 3600 + +m[2] * 60 + +m[3] + (+m[4]) / 1000;
  }

  function parseSRT(srtText) {
    var blocks = srtText.replace(/\r\n/g, "\n").trim().split(/\n\n+/);
    var captions = [];
    var idCounter = 0;

    for (var i = 0; i < blocks.length; i++) {
      var lines = blocks[i].split("\n");
      if (lines.length < 2) continue;

      // Index satirini atla (eger varsa)
      var lineIdx = 0;
      if (/^\d+$/.test(lines[0].trim())) lineIdx = 1;

      // Timecode satiri
      var tcLine = lines[lineIdx];
      var tcMatch = tcLine.match(/(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/);
      if (!tcMatch) continue;
      var startTime = parseTimestamp(tcMatch[1]);
      var endTime = parseTimestamp(tcMatch[2]);

      // Text satirlari
      var textLines = lines.slice(lineIdx + 1).join(" ").trim();
      if (!textLines) continue;

      // Kelimelere bol ve her birine zaman ata
      var wordTexts = textLines.split(/\s+/);
      var totalDur = endTime - startTime;
      var perWord = totalDur / Math.max(wordTexts.length, 1);
      var words = [];
      for (var w = 0; w < wordTexts.length; w++) {
        words.push({
          text: wordTexts[w],
          startTime: startTime + w * perWord,
          endTime: startTime + (w + 1) * perWord,
        });
      }

      captions.push({
        id: "c_" + (idCounter++),
        text: textLines,
        words: words,
        startTime: startTime,
        endTime: endTime,
      });
    }
    return captions;
  }

  // Belli bir t aninda gosterilecek caption'i bul
  function getCaptionAtTime(captions, currentTime) {
    for (var i = 0; i < captions.length; i++) {
      var c = captions[i];
      if (currentTime >= c.startTime && currentTime <= c.endTime) return c;
    }
    return null;
  }

  // Caption'in toplam suresini hesapla
  function getTotalDuration(captions) {
    if (!captions.length) return 0;
    return captions[captions.length - 1].endTime;
  }

  // Word-level JSON parser (backend write_word_json çıktısı)
  // Format: { captions: [{ text, start, end, words: [{text, start, end}] }] }
  function parseWordJSON(jsonText) {
    try {
      var obj = JSON.parse(jsonText);
      if (!obj || !obj.captions) return [];
      var captions = [];
      for (var i = 0; i < obj.captions.length; i++) {
        var c = obj.captions[i];
        var words = (c.words || []).map(function (w) {
          return {
            text: w.text,
            startTime: w.start,
            endTime: w.end,
          };
        });
        if (!words.length) continue;
        captions.push({
          id: "c_" + i,
          text: c.text,
          words: words,
          startTime: c.start,
          endTime: c.end,
        });
      }
      return captions;
    } catch (e) {
      console.error("parseWordJSON fail:", e);
      return [];
    }
  }

  window.FC_parseSRT = parseSRT;
  window.FC_parseWordJSON = parseWordJSON;
  window.FC_getCaptionAtTime = getCaptionAtTime;
  window.FC_getTotalDuration = getTotalDuration;
})();
