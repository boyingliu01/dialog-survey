"""
Extended tests for template service, covering edge cases and DEFAULT_TEMPLATES content.
"""

import os
import tempfile

from src.services.template import DEFAULT_TEMPLATES, TemplateManager


class TestDefaultTemplates:
    """Tests that verify DEFAULT_TEMPLATES structure and content."""

    def test_default_templates_not_empty(self):
        """DEFAULT_TEMPLATES should have at least one template."""
        assert len(DEFAULT_TEMPLATES) > 0

    def test_quality_survey_exists(self):
        """quality_survey template should be present."""
        assert "quality_survey" in DEFAULT_TEMPLATES

    def test_customer_feedback_exists(self):
        """customer_feedback template should be present."""
        assert "customer_feedback" in DEFAULT_TEMPLATES

    def test_each_template_has_required_fields(self):
        """Each default template must have id, name, description, and topics."""
        required_fields = {"id", "name", "description", "topics"}
        for template_id, template in DEFAULT_TEMPLATES.items():
            for field in required_fields:
                assert field in template, (
                    f"Template '{template_id}' missing field '{field}'"
                )

    def test_each_template_id_matches_key(self):
        """Template 'id' value should match its dict key."""
        for key, template in DEFAULT_TEMPLATES.items():
            assert template["id"] == key

    def test_topics_are_non_empty_lists(self):
        """Each default template must have at least one topic."""
        for template_id, template in DEFAULT_TEMPLATES.items():
            assert isinstance(template["topics"], list)
            assert len(template["topics"]) > 0, (
                f"Template '{template_id}' has no topics"
            )

    def test_each_topic_has_required_fields(self):
        """Each topic must have id, name, description, and initial_question."""
        required = {"id", "name", "description", "initial_question"}
        for template_id, template in DEFAULT_TEMPLATES.items():
            for i, topic in enumerate(template["topics"]):
                for field in required:
                    assert field in topic, (
                        f"Template '{template_id}' topic[{i}] missing '{field}'"
                    )

    def test_initial_questions_are_non_empty(self):
        """initial_question must not be blank."""
        for template_id, template in DEFAULT_TEMPLATES.items():
            for topic in template["topics"]:
                assert topic["initial_question"].strip(), (
                    f"Template '{template_id}' topic '{topic['id']}' "
                    "has empty initial_question"
                )


class TestTemplateManagerEdgeCases:
    """Edge case tests for TemplateManager."""

    def test_save_and_overwrite_custom_template(self):
        """Saving a template with an existing ID should overwrite it."""
        with tempfile.TemporaryDirectory() as tmpdir:
            manager = TemplateManager(templates_dir=tmpdir)

            first = manager.create_template(
                name="初版模板",
                description="第一版",
                topics=[{"id": "t1", "name": "T1", "description": "D1", "initial_question": "Q1?"}],
            )
            template_id = first["id"]

            manager.save_template(template_id, {**first, "name": "修改版模板"})

            retrieved = manager.get_template(template_id)
            assert retrieved["name"] == "修改版模板"

    def test_list_templates_includes_custom(self):
        """Custom templates should appear in list_templates output."""
        with tempfile.TemporaryDirectory() as tmpdir:
            manager = TemplateManager(templates_dir=tmpdir)

            custom = manager.create_template(
                name="自定义模板",
                description="测试",
                topics=[],
            )

            templates = manager.list_templates()
            ids = [t["id"] for t in templates]
            assert custom["id"] in ids

    def test_delete_nonexistent_template_returns_false(self):
        """Deleting a non-existent custom template should return False."""
        with tempfile.TemporaryDirectory() as tmpdir:
            manager = TemplateManager(templates_dir=tmpdir)
            result = manager.delete_template("does_not_exist")
            assert result is False

    def test_get_template_prefers_file_over_default(self):
        """A JSON file named after a default template ID should override it."""
        with tempfile.TemporaryDirectory() as tmpdir:
            manager = TemplateManager(templates_dir=tmpdir)

            custom_data = {
                "id": "quality_survey",
                "name": "自定义覆盖",
                "description": "覆盖默认",
                "topics": [],
            }
            manager.save_template("quality_survey", custom_data)

            retrieved = manager.get_template("quality_survey")
            assert retrieved["name"] == "自定义覆盖"

    def test_templates_dir_is_created_if_missing(self):
        """TemplateManager should create templates_dir if it does not exist."""
        with tempfile.TemporaryDirectory() as tmpdir:
            new_dir = os.path.join(tmpdir, "templates")
            assert not os.path.exists(new_dir)
            TemplateManager(templates_dir=new_dir)
            assert os.path.exists(new_dir)

    def test_create_template_generates_unique_ids(self):
        """Two create_template calls should produce different IDs."""
        with tempfile.TemporaryDirectory() as tmpdir:
            manager = TemplateManager(templates_dir=tmpdir)
            t1 = manager.create_template(name="A", description="", topics=[])
            t2 = manager.create_template(name="B", description="", topics=[])
            assert t1["id"] != t2["id"]

    def test_domain_context_is_stored(self):
        """domain_context passed to create_template should be persisted."""
        with tempfile.TemporaryDirectory() as tmpdir:
            manager = TemplateManager(templates_dir=tmpdir)
            t = manager.create_template(
                name="含上下文",
                description="测试",
                topics=[],
                domain_context="专业领域知识",
            )
            retrieved = manager.get_template(t["id"])
            assert retrieved["domain_context"] == "专业领域知识"
