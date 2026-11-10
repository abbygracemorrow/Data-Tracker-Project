import gzip
import pathlib
import sys

import pytest

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
FIXTURES = pathlib.Path(__file__).parent / "fixtures"


def load(name: str) -> bytes:
    """A real page saved on 2026-11-10 (gasprices.aaa.com or eia.gov)."""
    return gzip.decompress((FIXTURES / f"{name}.html.gz").read_bytes())


@pytest.fixture
def pages():
    return {name: load(name) for name in ("aaa_states", "aaa_dc", "aaa_ri", "eia_gasdiesel")}
