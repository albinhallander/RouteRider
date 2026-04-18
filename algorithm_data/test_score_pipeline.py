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

def test_bell_inside_range():
    from score_pipeline import bell
    assert bell(200, 50, 500) == 1.0

def test_bell_below_range():
    from score_pipeline import bell
    score = bell(10, 50, 500)
    assert 0.0 < score < 1.0

def test_bell_above_range():
    from score_pipeline import bell
    score = bell(1000, 50, 500)
    assert 0.0 < score < 1.0

def test_freight_score_high_intensity():
    from score_pipeline import freight_score
    # SNI 24 = stål = 1.0 intensity, 300 MSEK = above sigmoid center
    c = {"sni": "24", "omsattning_msek": 300, "anstallda": 100}
    assert freight_score(c) > 0.7

def test_freight_score_low_intensity():
    from score_pipeline import freight_score
    # SNI 62 = IT = 0.0 intensity
    c = {"sni": "62", "omsattning_msek": 300, "anstallda": 100}
    assert freight_score(c) == 0.0

def test_commercial_score_sweet_spot():
    from score_pipeline import commercial_score
    c = {"omsattning_msek": 200, "anstallda": 100}
    assert commercial_score(c) == 1.0

def test_commercial_score_too_small():
    from score_pipeline import commercial_score
    c = {"omsattning_msek": 5, "anstallda": 5}
    assert commercial_score(c) < 0.5

def test_sustainability_score_range():
    from score_pipeline import sustainability_score
    c = {"sni": "24"}
    score = sustainability_score(c)
    assert 0.0 <= score <= 1.0
