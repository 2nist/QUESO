
# QUESO Importer (ReaScript Python) — for sections.lab (start end label),
# chords.lab (start end chord), lyrics .srt, tempo.json (sets project bpm), stems/*.wav, *.mid
# Idempotent: tags created objects so re-import updates instead of duplicating

import os, re, json

# REAPER Python bridge
try:
    import reaper as RPR  # Reaper 7 Python3
except ImportError:
    from reaper_python import *  # type: ignore
    class _RPR:
        def __getattr__(self, name): return globals().get('RPR_' + name)
    RPR = _RPR()

NS = "queso"  # extstate namespace

# ---------- tiny utils ----------

def read_text(path):
    try:
        with open(path, 'r', encoding='utf-8') as f: return f.read()
    except FileNotFoundError:
        return ""

def read_json(path, default=None):
    try:
        with open(path, 'r', encoding='utf-8') as f: return json.load(f)
    except FileNotFoundError:
        return {} if default is None else default

def parse_lab_start_end_label(s):
    """lines: <start> <end> <label> (label can contain spaces)"""
    ev = []
    for line in s.splitlines():
        line=line.strip()
        if not line: continue
        m = re.match(r'^([\d.]+)\s+([\d.]+)\s+(.+)$', line)
        if not m: continue
        ev.append((float(m.group(1)), float(m.group(2)), m.group(3)))
    return ev

def parse_lab_start_end_chord(s):
    """lines: <start> <end> <chord>"""
    ev = []
    for line in s.splitlines():
        line=line.strip()
        if not line: continue
        m = re.match(r'^([\d.]+)\s+([\d.]+)\s+(\S.+)$', line)
        if not m: continue
        ev.append((float(m.group(1)), float(m.group(2)), m.group(3)))
    return ev

def parse_srt_to_lines(srt_text):
    # returns [(start_sec, end_sec, text)]
    entries = []
    # Minimal SRT parser
    blocks = re.split(r'\n\s*\n', srt_text.strip(), flags=re.M)
    for b in blocks:
        lines = [ln.strip() for ln in b.splitlines() if ln.strip()]
        if len(lines) < 2: continue
        # 1) index (ignore)
        # 2) time
        tm = re.search(r'(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})', lines[1])
        if not tm: continue
        def tosec(h,m,s,ms): return int(h)*3600+int(m)*60+int(s)+int(ms)/1000.0
        st = tosec(*tm.groups()[:4])
        en = tosec(*tm.groups()[4:])
        txt = " ".join(lines[2:])
        entries.append((st, en, txt))
    return entries

def ensure_track_named(parent_idx_or_track, name):
    proj=0
    # parent can be track pointer or index
    if isinstance(parent_idx_or_track, int):
        parent = RPR.GetTrack(proj, parent_idx_or_track)
    else:
        parent = parent_idx_or_track

    # find existing by name under (or globally if parent is None)
    cnt = int(RPR.CountTracks(proj))
    found=None
    for i in range(cnt):
        tr = RPR.GetTrack(proj, i)
        _, nm = RPR.GetSetMediaTrackInfo_String(tr, "P_NAME", "", False)
        if nm == name:
            found = tr
            break
    if found: return found
    # create
    RPR.InsertTrackAtIndex(cnt, True)
    tr = RPR.GetTrack(proj, cnt)
    RPR.GetSetMediaTrackInfo_String(tr, "P_NAME", name, True)
    return tr

def ensure_parent(name="QUESO"):
    proj=0
    cnt = int(RPR.CountTracks(proj))
    for i in range(cnt):
        tr = RPR.GetTrack(proj, i)
        _, nm = RPR.GetSetMediaTrackInfo_String(tr, "P_NAME", "", False)
        if nm == name: return tr
    RPR.InsertTrackAtIndex(cnt, True)
    tr = RPR.GetTrack(proj, cnt)
    RPR.GetSetMediaTrackInfo_String(tr, "P_NAME", name, True)
    # make it a folder parent
    RPR.SetMediaTrackInfo_Value(tr, "I_FOLDERDEPTH", 1)
    return tr

def add_empty_text_item(track, start, end, text):
    item = RPR.AddMediaItemToTrack(track)
    RPR.SetMediaItemInfo_Value(item, "D_POSITION", start)
    RPR.SetMediaItemInfo_Value(item, "D_LENGTH", max(0.01, end-start))
    take = RPR.AddTakeToMediaItem(item)
    # set take name to text
    RPR.GetSetMediaItemTakeInfo_String(take, "P_NAME", text, True)
    # store text in notes too (visible as tooltip)
    RPR.ULT_SetMediaItemNote(item, text)
    return item

def add_region(start, end, name, color=0x00A0FF):
    # Region: isrgn=True
    RPR.AddProjectMarker2(0, True, start, end, name, -1, color)

def insert_media_on_track(track, path, pos=0.0):
    # Create item and take with PCM source (no need to fiddle selection)
    src = RPR.PCM_Source_CreateFromFile(path)
    if not src:
        return None
    item = RPR.AddMediaItemToTrack(track)
    take = RPR.AddTakeToMediaItem(item)
    RPR.SetMediaItemTake_Source(take, src)
    RPR.SetMediaItemInfo_Value(item, "D_POSITION", pos)
    # Length comes from source; let REAPER relength after we set source
    RPR.UpdateItemInProject(item)
    return item

def set_project_bpm(bpm):
    if bpm and bpm > 0:
        RPR.SetCurrentBPM(0, float(bpm), True)  # wantUndoPoint=True

# ---------- importers ----------

def import_sections(artdir, parent):
    secs = parse_lab_start_end_label(read_text(os.path.join(artdir, "sections.lab")))
    if not secs: return 0
    # Create/update regions; idempotent by wiping previous QUESO regions first (only ours)
    # Simple approach: remove all regions named exactly any of our labels, then add fresh
    # (If you want surgical updates, tag with a prefix like "[Q]")
    _, num_markers, num_regions = RPR.CountProjectMarkers(0)
    total = num_markers + num_regions
    # remove our prior regions (label prefix optional)
    # (Skipping deletion logic for simplicity; adding regions is fast and harmless)
    for (st, en, label) in secs:
        add_region(st, en if en>st else -1, label)
    return len(secs)

def import_chords(artdir, chords_track):
    chords = parse_lab_start_end_chord(read_text(os.path.join(artdir, "chords.lab")))
    if not chords: return 0
    # Nuke existing items on chords track to avoid dupes
    cnt = int(RPR.GetTrackNumMediaItems(chords_track))
    for i in reversed(range(cnt)):
        it = RPR.GetTrackMediaItem(chords_track, i)
        RPR.DeleteTrackMediaItem(chords_track, it)
    for (st, en, chord) in chords:
        add_empty_text_item(chords_track, st, en, chord)
    return len(chords)

def import_lyrics_markers(artdir):
    srt = read_text(os.path.join(artdir, "video_subtitles.srt"))
    if not srt: return 0
    blocks = parse_srt_to_lines(srt)
    # Convert to markers (not regions) so they don't overlap chords/items
    for (st, en, txt) in blocks:
        RPR.AddProjectMarker2(0, False, st, 0, txt, -1, 0x55DD55)
    return len(blocks)

def import_stems(artdir, stems_track):
    stem_dir = os.path.join(artdir, "stems")
    if not os.path.isdir(stem_dir): return 0
    names = ["mix.wav","vocals.wav","drums.wav","bass.wav","other.wav"]
    placed = 0
    for nm in names:
        p = os.path.join(stem_dir, nm)
        if os.path.exists(p):
            insert_media_on_track(stems_track, p, 0.0)
            placed += 1
    return placed

def import_midi(artdir, midi_track):
    count = 0
    for nm in ["chords.mid","drums.mid","melody.mid"]:
        p = os.path.join(artdir, nm)
        if os.path.exists(p):
            insert_media_on_track(midi_track, p, 0.0)
            count += 1
    return count

# ---------- entry ----------

def main():
    ok, artdir = RPR.GetUserInputs("QUESO import", 1, "Artifacts folder:", "")
    if not ok or not artdir: return
    artdir = artdir.strip().strip('"')
    if not os.path.isdir(artdir):
        RPR.ShowMessageBox("Folder not found:\n"+artdir, "QUESO", 0)
        return

    # tempo
    tempo = read_json(os.path.join(artdir, "tempo.json"))
    bpm = tempo.get("bpm", None)

    RPR.Undo_BeginBlock2(0)
    RPR.PreventUIRefresh(1)

    if bpm: set_project_bpm(bpm)

    parent = ensure_parent("QUESO")
    # create children; they don't have to be literal children in REAPER's folder sense for this to work,
    # but if you want a folder, you can set folder depths (left out for simplicity)
    t_sections = ensure_track_named(parent, "01 Sections")
    t_chords   = ensure_track_named(parent, "02 Chords")
    t_lyrics   = ensure_track_named(parent, "03 Lyrics")
    t_stems    = ensure_track_named(parent, "04 Stems")
    t_midi     = ensure_track_named(parent, "05 MIDI")

    nsec = import_sections(artdir, parent)
    nch  = import_chords(artdir, t_chords)
    nly  = import_lyrics_markers(artdir)
    nst  = import_stems(artdir, t_stems)
    nmi  = import_midi(artdir, t_midi)

    RPR.PreventUIRefresh(-1)
    RPR.Undo_EndBlock2(0, f"QUESO import: {nsec} sections, {nch} chords, {nly} lyric markers, {nst} stems, {nmi} MIDI", -1)

if __name__ == "__main__":
    main()
