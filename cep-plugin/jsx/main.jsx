// FreeCaption V10 - ULTRA MINIMAL
// Sadece ES3 basit syntax. $ yok, new Time() yok, fancy yok.

function fcPing() {
    return '{"ok":true,"msg":"pong"}';
}

function getProjectDir() {
    var res = '{"ok":false,"error":"init"}';
    try {
        if (!app) return '{"ok":false,"error":"app yok"}';
        if (!app.project) return '{"ok":false,"error":"project yok"}';
        var p = app.project.path;
        if (!p) return '{"ok":false,"error":"kaydedilmemis"}';
        var idx = p.length - 1;
        while (idx >= 0 && p.charAt(idx) !== '\\' && p.charAt(idx) !== '/') idx--;
        var dir = (idx >= 0) ? p.substring(0, idx) : "";
        res = '{"ok":true,"dir":"' + dir.replace(/\\/g, '\\\\') + '"}';
    } catch (e) {
        res = '{"ok":false,"error":"ex"}';
    }
    return res;
}

function getPlayheadSec() {
    try {
        if (!app || !app.project) return '{"ok":false,"error":"app/project yok"}';
        var seq = app.project.activeSequence;
        if (!seq) return '{"ok":false,"error":"sekans yok"}';
        var ph = seq.getPlayerPosition();
        var s = 0;
        if (ph && ph.seconds) s = ph.seconds;
        return '{"ok":true,"seconds":' + s + '}';
    } catch (e) {
        return '{"ok":false,"error":"ph_ex"}';
    }
}

function getSelectedClipInfo() {
    var stage = "0_start";
    var seqName = "";
    var selLen = -99;
    var TICKS_PER_SECOND = 254016000000;
    try {
        stage = "1_app";
        if (typeof app === "undefined") return '{"ok":false,"stage":"1_app","error":"app undef"}';

        stage = "2_project";
        var proj = app.project;
        if (!proj) return '{"ok":false,"stage":"2_project","error":"proje yok"}';

        stage = "3_seq";
        var seq = proj.activeSequence;
        if (!seq) return '{"ok":false,"stage":"3_seq","error":"sekans yok"}';

        stage = "4_seqName";
        try { seqName = seq.name; } catch (eN) { seqName = "?"; }

        // Sequence frame rate + dimension (PNG export icin KRITIK)
        stage = "4b_seqInfo";
        var seqFps = 30;
        var seqWidth = 1920;
        var seqHeight = 1080;
        try {
            var settings = seq.getSettings();
            var fr = settings.videoFrameRate;
            if (fr && fr.ticks) {
                // ticks per frame -> fps
                var ticksPerFrame = parseInt(String(fr.ticks));
                if (ticksPerFrame > 0) {
                    seqFps = Math.round((TICKS_PER_SECOND / ticksPerFrame) * 100) / 100;
                }
            } else if (fr && fr.seconds) {
                // Fallback: seconds per frame
                if (fr.seconds > 0) seqFps = Math.round((1 / fr.seconds) * 100) / 100;
            }
            if (settings.videoFrameWidth) seqWidth = settings.videoFrameWidth;
            if (settings.videoFrameHeight) seqHeight = settings.videoFrameHeight;
        } catch (eFR) {
            // Alternatif: timebase'den
            try {
                var tb = seq.getTimebase();
                var ticks = parseInt(String(tb));
                if (ticks > 0) seqFps = Math.round((TICKS_PER_SECOND / ticks) * 100) / 100;
            } catch (eTB) {}
        }

        stage = "5_getSelection";
        var sel = seq.getSelection();

        stage = "6_selLen";
        if (sel && sel.length) selLen = sel.length;
        else selLen = 0;

        if (selLen === 0) {
            return '{"ok":false,"stage":"6_empty","error":"secim yok",' +
                '"seqName":"' + seqName.replace(/"/g, "") + '","selLen":0,' +
                '"count":0,"clips":[],' +
                '"seqFps":' + seqFps + ',"seqWidth":' + seqWidth + ',"seqHeight":' + seqHeight + '}';
        }

        stage = "7_clipsLoop";
        var clips = [];
        for (var s = 0; s < selLen; s++) {
            var curTi = sel[s];
            if (!curTi) continue;
            var curPi = curTi.projectItem;
            if (!curPi) continue;

            var cName = "";
            try { cName = curPi.name; } catch (eCn) { cName = "?"; }
            var cPath = "";
            try { cPath = curPi.getMediaPath(); } catch (eCp) { cPath = ""; }

            // Medya yolu bos olan ogeyi (Adjustment layer, Color matte, Title vb.) kesinlikle ekleme
            if (!cPath || cPath === "" || cPath === "null") continue;

            var cIn = 0, cOut = 0, cSt = 0, cEn = 0;
            try { cIn = curTi.inPoint.seconds; } catch (eCi) {}
            try { cOut = curTi.outPoint.seconds; } catch (eCo) {}
            try { cSt = curTi.start.seconds; } catch (eCs) {}
            try { cEn = curTi.end.seconds; } catch (eCe) {}

            var cDur = cEn - cSt;
            if (cDur < 0) cDur = 0;

            clips.push({
                itemName: cName,
                mediaPath: cPath,
                inPoint: cIn,
                outPoint: cOut,
                startTime: cSt,
                duration: cDur
            });
        }

        if (clips.length === 0) {
            return '{"ok":false,"stage":"7_emptyClips","error":"gecerli klip bulunamadi",' +
                '"seqName":"' + seqName.replace(/"/g, "") + '","selLen":' + selLen + ',' +
                '"count":0,"clips":[],' +
                '"seqFps":' + seqFps + ',"seqWidth":' + seqWidth + ',"seqHeight":' + seqHeight + '}';
        }

        var firstClip = clips[0];
        var safeName = encodeURIComponent(firstClip.itemName);
        var safePath = encodeURIComponent(firstClip.mediaPath);
        var safeSeq = encodeURIComponent(seqName);

        var clipsJsonArr = [];
        for (var cIdx = 0; cIdx < clips.length; cIdx++) {
            var cObj = clips[cIdx];
            clipsJsonArr.push('{"itemName":"' + encodeURIComponent(cObj.itemName) + '",' +
                '"mediaPath":"' + encodeURIComponent(cObj.mediaPath) + '",' +
                '"inPoint":' + cObj.inPoint + ',"outPoint":' + cObj.outPoint + ',' +
                '"startTime":' + cObj.startTime + ',"duration":' + cObj.duration + '}');
        }
        var clipsJsonStr = '[' + clipsJsonArr.join(',') + ']';

        stage = "12_done";
        return '{"ok":true,"stage":"12_done","probe":"v11",' +
            '"seqName":"' + safeSeq + '",' +
            '"selLen":' + selLen + ',' +
            '"count":' + clips.length + ',' +
            '"clips":' + clipsJsonStr + ',' +
            '"itemName":"' + safeName + '",' +
            '"mediaPath":"' + safePath + '",' +
            '"inPoint":' + firstClip.inPoint + ',"outPoint":' + firstClip.outPoint + ',' +
            '"startTime":' + firstClip.startTime + ',"duration":' + firstClip.duration + ',' +
            '"seqFps":' + seqFps + ',"seqWidth":' + seqWidth + ',"seqHeight":' + seqHeight + '}';
    } catch (e) {
        return '{"ok":false,"stage":"' + stage + '","error":"OUTER","msg":"' +
            String(e).replace(/"/g, "").replace(/\\/g, "") + '"}';
    }
}

function importAndPlaceSubtitle(srtPathEncoded, placementMode, explicitSeconds) {
    try {
        var srtPath = decodeURIComponent(srtPathEncoded);
        if (!srtPath) return '{"ok":false,"error":"srtPath bos"}';
        if (!placementMode) placementMode = "sequence_start";
        if (!app || !app.project) return '{"ok":false,"error":"app yok"}';

        var proj = app.project;
        var seq = proj.activeSequence;
        if (!seq) return '{"ok":false,"error":"sekans yok"}';

        var baseSec = (seq.zeroPoint && typeof seq.zeroPoint.seconds === "number") ? seq.zeroPoint.seconds : 0;
        var timeSeconds = baseSec;

        if (placementMode === "playhead") {
            try {
                var ph = seq.getPlayerPosition();
                if (ph && typeof ph.seconds === "number") timeSeconds = ph.seconds;
            } catch (eP) {}
        } else if (placementMode === "explicit") {
            var expSec = 0;
            if (typeof explicitSeconds === "number") {
                expSec = explicitSeconds;
            } else if (typeof explicitSeconds === "string") {
                expSec = parseFloat(explicitSeconds) || 0;
            }
            timeSeconds = baseSec + expSec;
        } else {
            timeSeconds = baseSec;
        }

        var rootBin = proj.rootItem;
        var importOk = proj.importFiles([srtPath], true, rootBin, false);
        if (!importOk) return '{"ok":false,"error":"importFiles false"}';

        var srtName = "";
        var slashIdx = srtPath.length - 1;
        while (slashIdx >= 0 && srtPath.charAt(slashIdx) !== '\\' && srtPath.charAt(slashIdx) !== '/') slashIdx--;
        srtName = srtPath.substring(slashIdx + 1);
        var stem = srtName.replace(/\.[^.]+$/, "");

        var imported = null;
        try {
            for (var i = rootBin.children.numItems - 1; i >= 0; i--) {
                var ch = rootBin.children[i];
                try {
                    if (ch.name && ch.name.indexOf(stem) !== -1) { imported = ch; break; }
                } catch (eC) {}
            }
        } catch (eF) {}
        if (!imported) return '{"ok":false,"error":"import edilen bulunamadi"}';

        var winningMethod = "";
        var errMsg = "";

        // 1. Sayısal saniye ile createCaptionTrack dene
        try {
            if (typeof seq.createCaptionTrack === "function") {
                seq.createCaptionTrack(imported, timeSeconds);
                winningMethod = "createCaptionTrack_sec";
            }
        } catch (e1) {
            errMsg = errMsg + "ct_sec: " + String(e1) + "; ";
        }

        // 2. Time nesnesi ile createCaptionTrack dene
        if (winningMethod === "") {
            try {
                if (typeof seq.createCaptionTrack === "function") {
                    var t = new Time();
                    t.seconds = timeSeconds;
                    seq.createCaptionTrack(imported, t);
                    winningMethod = "createCaptionTrack_time";
                }
            } catch (e2) {
                errMsg = errMsg + "ct_time: " + String(e2) + "; ";
            }
        }

        // 3. createCaptionTrack başarısız olursa ve mevcut caption track varsa overwriteClip dene
        if (winningMethod === "") {
            try {
                if (seq.captionTracks && seq.captionTracks.numTracks > 0) {
                    var capTrack = seq.captionTracks[0];
                    if (capTrack && typeof capTrack.overwriteClip === "function") {
                        try {
                            var t2 = new Time();
                            t2.seconds = timeSeconds;
                            capTrack.overwriteClip(imported, t2);
                            winningMethod = "overwriteClip_time";
                        } catch (eOwTime) {
                            capTrack.overwriteClip(imported, timeSeconds);
                            winningMethod = "overwriteClip_sec";
                        }
                    }
                }
            } catch (e3) {
                errMsg = errMsg + "ow: " + String(e3) + "; ";
            }
        }

        if (winningMethod === "") {
            return '{"ok":false,"binOnly":true,"itemName":"' + (imported.name ? imported.name.replace(/"/g, "") : "") +
                '","error":"' + errMsg.replace(/"/g, "") + '"}';
        }

        return '{"ok":true,"itemName":"' + (imported.name ? imported.name.replace(/"/g, "") : "") +
            '","method":"' + winningMethod + '","insertedAt":' + timeSeconds + '}';
    } catch (e) {
        return '{"ok":false,"error":"' + String(e).replace(/"/g, "").replace(/\\/g, "") + '"}';
    }
}

// PNG sequence'i Premiere'e import et + video track'in en ustune yerlestir
function importPngSequence(firstPngPathEncoded, startSeconds, frameRate) {
    try {
        var firstPngPath = decodeURIComponent(firstPngPathEncoded);
        if (!firstPngPath) return '{"ok":false,"error":"path bos"}';
        if (!app || !app.project) return '{"ok":false,"error":"app yok"}';
        var proj = app.project;
        var seq = proj.activeSequence;
        if (!seq) return '{"ok":false,"error":"sekans yok"}';

        var rootBin = proj.rootItem;
        // importFiles 4. arg = importAsNumberedStills (PNG sequence olarak alir)
        var importOk = proj.importFiles([firstPngPath], true, rootBin, true);
        if (!importOk) return '{"ok":false,"error":"importFiles false"}';

        // Yeni eklenen item'i bul (en son)
        var imported = null;
        try {
            var n = rootBin.children.numItems;
            for (var i = n - 1; i >= 0; i--) {
                var ch = rootBin.children[i];
                try {
                    if (ch.name && (ch.name.indexOf("frame_") !== -1 || ch.name.indexOf("fc_frames") !== -1)) {
                        imported = ch;
                        break;
                    }
                } catch (e) {}
            }
            // Fallback: en son eklenen
            if (!imported && n > 0) imported = rootBin.children[n - 1];
        } catch (eF) {}

        if (!imported) return '{"ok":false,"error":"import edilen sequence bulunamadi"}';

        // KAYMA FIX: PNG sequence'i sekansin fps'iyle yorumla
        // Adobe API'leri arasi gecis - hangisinin calistigi versiyona gore degisir
        var interpretedFps = 0;
        var interpretMsg = "";
        var targetFps = parseFloat(frameRate || 30);

        // METOD A: setOverrideFrameRate (CC 2018+ daha basit, daha guvenilir)
        try {
            if (typeof imported.setOverrideFrameRate === "function") {
                imported.setOverrideFrameRate(targetFps);
                interpretedFps = targetFps;
                interpretMsg = "A: setOverrideFrameRate OK -> " + targetFps;
            } else {
                interpretMsg = "A: setOverrideFrameRate yok; ";
            }
        } catch (eA) {
            interpretMsg += "A_ex: " + String(eA).replace(/"/g, "") + "; ";
        }

        // METOD B: getFootageInterpretation().frameRate (eski yol)
        if (interpretedFps === 0) {
            try {
                if (typeof imported.getFootageInterpretation === "function") {
                    var fi = imported.getFootageInterpretation();
                    if (fi) {
                        fi.frameRate = targetFps;
                        var setOk = imported.setFootageInterpretation(fi);
                        interpretedFps = targetFps;
                        interpretMsg += "B: setFI ret=" + setOk + " -> " + targetFps + "; ";
                    } else {
                        interpretMsg += "B: getFI null; ";
                    }
                } else {
                    interpretMsg += "B: getFI yok; ";
                }
            } catch (eB) {
                interpretMsg += "B_ex: " + String(eB).replace(/"/g, "") + "; ";
            }
        }

        // METOD C: QE DOM (son care, ProjectItem'da olmayan API'ler QE'de olabilir)
        if (interpretedFps === 0) {
            try {
                if (typeof app.enableQE === "function") app.enableQE();
                if (typeof qe !== "undefined" && qe.project) {
                    var qeItem = qe.project.getItemAt(rootBin.children.numItems - 1);
                    if (qeItem && typeof qeItem.setFootageInterpretFramerate === "function") {
                        qeItem.setFootageInterpretFramerate(String(targetFps));
                        interpretedFps = targetFps;
                        interpretMsg += "C: QE setFootageInterpretFramerate OK; ";
                    } else {
                        interpretMsg += "C: QE method yok; ";
                    }
                }
            } catch (eC) {
                interpretMsg += "C_ex: " + String(eC).replace(/"/g, "") + "; ";
            }
        }

        // En ustteki video track'i bul (yoksa yeni acmamiz lazim, ama Premiere otomatik aciyor)
        var topTrackIdx = 0;
        try {
            topTrackIdx = seq.videoTracks.numTracks - 1;
            if (topTrackIdx < 0) topTrackIdx = 0;
        } catch (eT) {}

        // Time objesi
        var t = new Time();
        t.seconds = startSeconds || 0;

        // En uste yerlestir (overwriteClip = mevcut clip varsa uzerine yaz)
        var inserted = false;
        var errMsg = "";
        try {
            seq.videoTracks[topTrackIdx].overwriteClip(imported, t);
            inserted = true;
        } catch (e1) {
            errMsg = e1.toString();
            try {
                seq.videoTracks[topTrackIdx].insertClip(imported, t);
                inserted = true;
            } catch (e2) {
                errMsg += " | " + e2.toString();
            }
        }

        if (!inserted) {
            return '{"ok":false,"binOnly":true,"itemName":"' +
                imported.name.replace(/"/g, "") +
                '","error":"' + errMsg.replace(/"/g, "") + '"}';
        }

        return '{"ok":true,"itemName":"' + imported.name.replace(/"/g, "") +
            '","trackIdx":' + topTrackIdx +
            ',"insertedAt":' + (startSeconds || 0) +
            ',"interpretedFps":' + interpretedFps +
            ',"interpretMsg":"' + interpretMsg.replace(/"/g, "") + '"}';
    } catch (e) {
        return '{"ok":false,"error":"' + String(e).replace(/"/g, "") + '"}';
    }
}

function clearCaptionTracks() {
    var cleared = 0;
    try {
        if (!app || !app.project) return '{"ok":false,"error":"app yok"}';
        var seq = app.project.activeSequence;
        if (!seq) return '{"ok":false,"error":"sekans yok"}';

        if (seq.captionTracks && seq.captionTracks.numTracks) {
            for (var i = 0; i < seq.captionTracks.numTracks; i++) {
                var tr = seq.captionTracks[i];
                if (tr && tr.clips && tr.clips.numItems) {
                    for (var j = tr.clips.numItems - 1; j >= 0; j--) {
                        try { tr.clips[j].remove(false, false); cleared++; } catch (eR) {}
                    }
                }
            }
        }
        return '{"ok":true,"cleared":' + cleared + '}';
    } catch (e) {
        return '{"ok":false,"error":"' + String(e).replace(/"/g, "") + '"}';
    }
}

function importXml(xmlPathEncoded) {
    try {
        var xmlPath = decodeURIComponent(xmlPathEncoded);
        if (!xmlPath) return '{"ok":false,"error":"xmlPath bos"}';
        if (!app || !app.project) return '{"ok":false,"error":"app veya proje yok"}';

        var oldSeqIDs = {};
        var seqs = app.project.sequences;
        var numSeqs = seqs ? seqs.numSequences : 0;
        for (var i = 0; i < numSeqs; i++) {
            var s = seqs[i];
            if (s) {
                var sId = s.sequenceID ? String(s.sequenceID) : ("idx_" + i);
                oldSeqIDs[sId] = true;
            }
        }

        var importOk = app.project.importFiles([xmlPath], true, app.project.rootItem, false);
        if (!importOk) return '{"ok":false,"error":"importFiles false"}';

        var newSeq = null;
        var seqsAfter = app.project.sequences;
        var numSeqsAfter = seqsAfter ? seqsAfter.numSequences : 0;
        for (var j = 0; j < numSeqsAfter; j++) {
            var sa = seqsAfter[j];
            if (sa) {
                var saId = sa.sequenceID ? String(sa.sequenceID) : ("idx_" + j);
                if (!oldSeqIDs[saId]) {
                    newSeq = sa;
                    break;
                }
            }
        }

        if (!newSeq && numSeqsAfter > numSeqs) {
            newSeq = seqsAfter[numSeqsAfter - 1];
        }

        if (newSeq) {
            try {
                app.project.activeSequence = newSeq;
            } catch (eAct) {}
            try {
                if (typeof app.project.openSequence === "function" && newSeq.sequenceID) {
                    app.project.openSequence(newSeq.sequenceID);
                }
            } catch (eOpen) {}
        }

        return '{"ok":true,"sequenceOpened":' + (newSeq ? "true" : "false") + '}';
    } catch (e) {
        return '{"ok":false,"error":"' + String(e).replace(/"/g, "") + '"}';
    }
}
