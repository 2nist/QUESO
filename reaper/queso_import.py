
# QUESO Importer (ReaScript Python)

import os

try:
    import reaper as RPR  # Python 3 API
except ImportError:
    from reaper_python import *  # type: ignore
    class _RPR:
        def __getattr__(self, name):
            return globals().get('RPR_' + name)
    RPR = _RPR()

def read_lab(path):
    ev = []
    try:
        with open(path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line: continue
                parts = line.split(None, 1)
                if len(parts) == 2:
                    t, label = parts
                    ev.append((float(t), label))
    except FileNotFoundError:
        pass
    return ev

def ensure_parent(name="QUESO"):
    proj = 0
    n = int(RPR.CountTracks(proj))
    for i in range(n):
        tr = RPR.GetTrack(proj, i)
        _, nm = RPR.GetSetMediaTrackInfo_String(tr, "P_NAME", "", False)
        if nm == name:
            return tr
    RPR.InsertTrackAtIndex(n, True)
    tr = RPR.GetTrack(proj, n)
    RPR.GetSetMediaTrackInfo_String(tr, "P_NAME", name, True)
    return tr

def import_sections(artdir):
    proj = 0
    count = 0
    for (t, label) in read_lab(os.path.join(artdir, "sections.lab")):
        RPR.AddProjectMarker2(proj, True, t, -1, label, -1, 0x00A0FF)
        count += 1
    return count

def main():
    ok, artdir = RPR.GetUserInputs("QUESO import", 1, "Artifacts folder:", "")
    if not ok or not artdir: return
    RPR.Undo_BeginBlock2(0); RPR.PreventUIRefresh(1)
    ensure_parent("QUESO")
    nsec = import_sections(artdir)
    RPR.PreventUIRefresh(-1); RPR.Undo_EndBlock2(0, f"QUESO import ({nsec} sections)", -1)

if __name__ == "__main__":
    main()
