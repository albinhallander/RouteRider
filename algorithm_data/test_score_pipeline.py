import sys, os
sys.path.insert(0, os.path.dirname(__file__))

def test_mock_enrich_fabrik():
    from score_pipeline import mock_enrich
    c = {"name": "TestFabrik", "typ": "fabrik", "lat": 59.0, "lng": 16.0, "city": "X"}
    result = mock_enrich(c)
    assert result["sni"] == "24"
    assert 100 <= result["omsattning_msek"] <= 800
    assert 50 <= result["anstallda"] <= 400

def test_mock_enrich_lager():
    from score_pipeline import mock_enrich
    c = {"name": "TestLager", "typ": "lager", "lat": 59.0, "lng": 16.0, "city": "X"}
    result = mock_enrich(c)
    assert result["sni"] == "46"
    assert 50 <= result["omsattning_msek"] <= 400

def test_mock_enrich_deterministic():
    from score_pipeline import mock_enrich
    c = {"name": "SameName", "typ": "industri", "lat": 59.0, "lng": 16.0, "city": "X"}
    r1 = mock_enrich(c)
    r2 = mock_enrich(c)
    assert r1["omsattning_msek"] == r2["omsattning_msek"]
    assert r1["anstallda"] == r2["anstallda"]
