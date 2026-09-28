from scripts.seed_demo import load_templates


def test_demo_templates_are_safe_drafts_without_fabricated_chain_proofs() -> None:
    templates = load_templates()
    assert len(templates) >= 3
    assert len({item["external_id"] for item in templates}) == len(templates)
    for item in templates:
        assert item["price_minor"] > 0
        assert item["original_value_minor"] >= item["price_minor"]
        assert item["stock"] > 0
        assert "onchain_address" not in item
        assert "transaction_signature" not in item
        assert "status" not in item
