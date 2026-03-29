"""
Tests for template service.
"""

import tempfile

from src.services.template import TemplateManager


class TestTemplateManager:
    """Tests for TemplateManager."""

    def test_get_default_template(self):
        """Test getting default template."""
        manager = TemplateManager()

        template = manager.get_template("quality_survey")

        assert template["id"] == "quality_survey"
        assert "topics" in template
        assert len(template["topics"]) > 0

    def test_list_templates_returns_defaults(self):
        """Test listing templates includes defaults."""
        manager = TemplateManager()

        templates = manager.list_templates()

        assert len(templates) > 0
        default_ids = [t["id"] for t in templates if t.get("is_default")]
        assert "quality_survey" in default_ids

    def test_create_and_get_custom_template(self):
        """Test creating and retrieving custom template."""
        with tempfile.TemporaryDirectory() as tmpdir:
            manager = TemplateManager(templates_dir=tmpdir)

            template = manager.create_template(
                name="测试模板",
                description="这是一个测试模板",
                topics=[
                    {
                        "id": "topic1",
                        "name": "主题1",
                        "description": "描述1",
                        "initial_question": "问题1？",
                    }
                ],
                domain_context="测试领域",
            )

            # Retrieve it
            retrieved = manager.get_template(template["id"])

            assert retrieved["name"] == "测试模板"
            assert len(retrieved["topics"]) == 1

    def test_delete_custom_template(self):
        """Test deleting custom template."""
        with tempfile.TemporaryDirectory() as tmpdir:
            manager = TemplateManager(templates_dir=tmpdir)

            template = manager.create_template(
                name="待删除模板", description="测试删除", topics=[]
            )

            # Delete it
            result = manager.delete_template(template["id"])

            assert result is True

    def test_cannot_delete_default_template(self):
        """Test cannot delete default templates."""
        manager = TemplateManager()

        result = manager.delete_template("quality_survey")

        assert result is False

    def test_get_nonexistent_returns_default(self):
        """Test getting nonexistent template returns default."""
        manager = TemplateManager()

        template = manager.get_template("nonexistent")

        # Should return quality_survey as fallback
        assert template["id"] == "quality_survey"
