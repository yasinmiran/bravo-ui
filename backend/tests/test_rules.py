from app.rules.validate import check, has_errors
from app.rules.yaml_io import from_yaml, to_yaml
from app.rules.extract import extraction_schema
from tests.helpers import bravo_equipments, bravo_rules


def test_fake_rules_pass_coverage():
    issues = check(bravo_rules(), bravo_equipments())
    assert not has_errors(issues)
    assert {i.code for i in issues} == {"partner_not_in_registry"}


def test_missing_type_section_is_an_error():
    rules = bravo_rules()
    del rules.by_equipment_type["Lifeboat"]
    codes = {i.code for i in check(rules, bravo_equipments()) if i.level == "error"}
    assert "type_without_section" in codes


def test_bands_must_tile_one_to_ten():
    rules = bravo_rules()
    rules.urgency_bands.today = [10, 10]
    codes = {i.code for i in check(rules, bravo_equipments())}
    assert "band_gap" in codes


def test_weights_must_sum_to_one():
    rules = bravo_rules()
    rules.urgency.weights.impact = 0.9
    assert "weights_sum" in {i.code for i in check(rules, bravo_equipments())}


def test_yaml_roundtrip_and_errors():
    rules = bravo_rules()
    assert from_yaml(to_yaml(rules)) == rules
    try:
        from_yaml("version: 1\n")
    except ValueError as error:
        assert "do not match the schema" in str(error)
    else:
        raise AssertionError("expected a schema error")


def test_extraction_schema_closes_over_registry_vocabulary():
    eqs = bravo_equipments()
    types = sorted({e.equipment_type for e in eqs})
    values = sorted({e.redundancy for e in eqs})
    schema = extraction_schema(types, values)
    assert schema["$defs"]["TypeSection"]["properties"]["equipment_type"]["enum"] == types
    assert schema["$defs"]["RedundancyItem"]["properties"]["value"]["enum"] == values
    assert schema["properties"]["by_equipment_type"]["type"] == "array"
    assert schema["properties"]["protection_layer_types"]["items"]["enum"] == types
    flat = str(schema)
    for banned in ("minimum", "maximum", "'title'"):
        assert banned not in flat
