import pytest
import numpy as np
import json
from pathlib import Path
from analysis.queso_foundry.pipeline import run_pipeline
from analysis.queso_foundry.progress import MetaProgress

class MockSegment:
    def __init__(self, text, start, end):
        self.text = text
        self.start = start
        self.end = end
        self.words = [{"word": "dummy", "start": 1.0, "end": 2.0}]

def test_run_pipeline_with_mocked_audio(mocker, tmp_path):
    """
    Tests that the pipeline runs without exceptions and creates the expected output files.
    """
    # Mock librosa.load to return a dummy audio signal
    mocker.patch('librosa.load', return_value=(np.zeros(22050 * 10), 22050)) # 10 seconds of silence

    # Mock faster_whisper's transcribe method to return some dummy data
    dummy_segment = MockSegment("dummy", 1.0, 2.0)
    mocker.patch('faster_whisper.WhisperModel.transcribe', return_value=([dummy_segment], None))

    input_path = r"c:\Users\CraftAuto-Sales\webrail\artifacts\golden\i-want-to-hold-your-hand\stems\mix.wav.placeholder"
    out_dir = tmp_path
    opts = {}
    meta = MetaProgress(out_dir, input_path=input_path, opts=opts)

    run_pipeline(input_path, out_dir, opts, meta)
    meta.done()

    # Check for output files
    tempo_file = out_dir / "tempo.json"
    chords_file = out_dir / "chords.lab"
    sections_file = out_dir / "sections.lab"
    lyrics_file = out_dir / "lyrics.lrc"

    assert tempo_file.exists(), "tempo.json was not created"
    assert chords_file.exists(), "chords.lab was not created"
    assert sections_file.exists(), "sections.lab was not created"
    assert lyrics_file.exists(), "lyrics.lrc was not created"

    # Check file content
    with open(tempo_file) as f:
        tempo_data = json.load(f)
        assert "bpm" in tempo_data
        assert "beat_times" in tempo_data

    assert chords_file.read_text(), "chords.lab is empty"
    assert sections_file.read_text(), "sections.lab is empty"
    assert lyrics_file.read_text(), "lyrics.lrc is empty"