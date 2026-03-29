"""
Tests for template API endpoints, including version management, clone, and import/export.
"""

import json
import tempfile

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.services.template import DEFAULT_TEMPLATES, TemplateManager


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def template_manager():
    """TemplateManager with isolated temp directory."""
    with tempfile.TemporaryDirectory() as tmpdir:
        manager = TemplateManager(templates_dir=tmpdir)
        yield manager


@pytest.fixture()
def test_client(template_manager):
    """TestClient with a minimal FastAPI app for template testing."""
    from src.api.template import router

    # Create a minimal test app
    app = FastAPI()
    app.include_router(router, prefix="/api")

    # Override the template manager
    from src.services.template import get_template_manager

    def override_get_template_manager():
        return template_manager

    app.dependency_overrides[get_template_manager] = override_get_template_manager

    with TestClient(app) as c:
        yield c

    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Test: Template Version Field
# ---------------------------------------------------------------------------


class TestTemplateVersionField:
    """Tests that templates have a version field."""

    def test_default_templates_have_version(self):
        """Default templates should include version field."""
        for template_id, template in DEFAULT_TEMPLATES.items():
            assert "version" in template, f"Template '{template_id}' missing version"
            assert template["version"] is not None

    def test_get_template_includes_version(self, template_manager):
        """Retrieved template should have version."""
        template = template_manager.get_template("quality_survey")
        assert "version" in template

    def test_create_template_has_default_version(self, template_manager):
        """Created templates should get default version 1.0.0."""
        template = template_manager.create_template(
            name="测试模板",
            description="测试描述",
            topics=[
                {
                    "id": "topic1",
                    "name": "主题1",
                    "description": "描述1",
                    "initial_question": "问题1?",
                }
            ],
        )
        assert template["version"] == "1.0.0"

    def test_list_templates_includes_version(self, template_manager):
        """list_templates should include version in summary."""
        summaries = template_manager.list_templates()
        # Default templates should have version
        for summary in summaries:
            if summary.get("is_default"):
                assert "version" in summary


# ---------------------------------------------------------------------------
# Test: Template Clone
# ---------------------------------------------------------------------------


class TestTemplateClone:
    """Tests for template cloning functionality."""

    def test_clone_default_template(self, template_manager):
        """Clone a default template should work."""
        cloned = template_manager.clone_template(
            template_id="quality_survey",
            new_name="克隆的质量调查",
        )
        assert cloned is not None
        assert cloned["name"] == "克隆的质量调查"
        assert cloned["id"] != "quality_survey"  # New ID
        assert cloned["id"].startswith("clone_")  # Has clone prefix

    def test_clone_preserves_content(self, template_manager):
        """Cloned template should preserve topics and domain_context."""
        original = template_manager.get_template("quality_survey")
        cloned = template_manager.clone_template("quality_survey")

        assert cloned["topics"] == original["topics"]
        assert cloned["domain_context"] == original["domain_context"]

    def test_clone_increments_version(self, template_manager):
        """Cloned template should get a new version."""
        cloned = template_manager.clone_template("quality_survey")
        # Version should be incremented (major.minor.patch format)
        assert cloned["version"] != template_manager.get_template("quality_survey")["version"]

    def test_clone_custom_template(self, template_manager):
        """Clone a custom template should work."""
        # Create a custom template first
        custom = template_manager.create_template(
            name="自定义模板",
            description="自定义描述",
            topics=[
                {
                    "id": "t1",
                    "name": "主题",
                    "description": "描述",
                    "initial_question": "问题?",
                }
            ],
        )

        cloned = template_manager.clone_template(custom["id"], new_name="克隆的自定义")
        assert cloned["name"] == "克隆的自定义"
        assert cloned["topics"] == custom["topics"]

    def test_clone_nonexistent_returns_none(self, template_manager):
        """Cloning nonexistent template should return None."""
        result = template_manager.clone_template("nonexistent_template")
        assert result is None

    def test_clone_with_no_new_name(self, template_manager):
        """Clone without new name should use original name with suffix."""
        cloned = template_manager.clone_template("quality_survey")
        assert "克隆" in cloned["name"] or "copy" in cloned["name"].lower()


# ---------------------------------------------------------------------------
# Test: Template Export
# ---------------------------------------------------------------------------


class TestTemplateExport:
    """Tests for template export functionality."""

    def test_export_default_template(self, template_manager):
        """Export a default template as JSON string."""
        exported = template_manager.export_template("quality_survey")
        assert exported is not None

        # Should be valid JSON
        data = json.loads(exported)
        assert data["id"] == "quality_survey"
        assert "version" in data
        assert "topics" in data

    def test_export_custom_template(self, template_manager):
        """Export a custom template."""
        custom = template_manager.create_template(
            name="导出测试",
            description="测试导出",
            topics=[],
        )

        exported = template_manager.export_template(custom["id"])
        data = json.loads(exported)
        assert data["id"] == custom["id"]

    def test_export_nonexistent_returns_none(self, template_manager):
        """Exporting nonexistent template should return None."""
        result = template_manager.export_template("nonexistent")
        assert result is None

    def test_export_includes_all_fields(self, template_manager):
        """Export should include all template fields."""
        exported = template_manager.export_template("quality_survey")
        data = json.loads(exported)

        required_fields = ["id", "version", "name", "description", "topics", "domain_context"]
        for field in required_fields:
            assert field in data


# ---------------------------------------------------------------------------
# Test: Template Import
# ---------------------------------------------------------------------------


class TestTemplateImport:
    """Tests for template import functionality."""

    def test_import_valid_template(self, template_manager):
        """Import a valid template JSON."""
        template_json = {
            "id": "imported_test",
            "version": "1.0.0",
            "name": "导入的模板",
            "description": "导入测试",
            "topics": [
                {
                    "id": "topic1",
                    "name": "主题1",
                    "description": "描述",
                    "initial_question": "问题?",
                }
            ],
            "domain_context": "测试上下文",
        }

        imported = template_manager.import_template(template_json)
        assert imported["id"] == "imported_test"
        assert imported["name"] == "导入的模板"

        # Should be saved and retrievable
        retrieved = template_manager.get_template("imported_test")
        assert retrieved["name"] == "导入的模板"

    def test_import_validates_json_schema(self, template_manager):
        """Import should validate required fields."""
        # Missing required field 'topics'
        invalid_template = {
            "id": "invalid_template",
            "name": "无效模板",
            "description": "缺少topics字段",
        }

        with pytest.raises(ValueError, match="topics"):
            template_manager.import_template(invalid_template)

    def test_import_validates_version_format(self, template_manager):
        """Import should validate version format."""
        template_json = {
            "id": "bad_version",
            "version": "invalid-version-format",  # Not semver
            "name": "版本格式错误",
            "description": "测试",
            "topics": [],
        }

        with pytest.raises(ValueError, match="version"):
            template_manager.import_template(template_json)

    def test_import_validates_topic_fields(self, template_manager):
        """Import should validate topic required fields."""
        template_json = {
            "id": "bad_topic",
            "version": "1.0.0",
            "name": "主题字段缺失",
            "description": "测试",
            "topics": [
                {
                    "id": "topic1",
                    "name": "主题",
                    # Missing description and initial_question
                }
            ],
        }

        with pytest.raises(ValueError):
            template_manager.import_template(template_json)

    def test_import_overwrites_existing_with_warning(self, template_manager):
        """Import should allow overwrite with appropriate handling."""
        # Create first
        first = template_manager.create_template(
            name="第一版",
            description="测试",
            topics=[],
        )

        # Import with same ID (should generate new ID)
        imported = template_manager.import_template(
            {
                "id": first["id"],
                "version": "1.0.0",
                "name": "导入覆盖",
                "description": "新版本",
                "topics": [],
            }
        )

        # Should have different ID to avoid conflict
        assert imported["id"] != first["id"]


# ---------------------------------------------------------------------------
# Test: Clone API Endpoint
# ---------------------------------------------------------------------------


class TestCloneApiEndpoint:
    """Tests for POST /api/templates/{template_id}/clone endpoint."""

    def test_clone_api_returns_cloned_template(self, test_client):
        """Clone endpoint should return cloned template."""
        resp = test_client.post(
            "/api/templates/quality_survey/clone",
            json={"new_name": "API克隆"},
        )

        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "API克隆"
        assert data["id"] != "quality_survey"

    def test_clone_api_nonexistent_returns_404(self, test_client):
        """Cloning nonexistent template via API returns 404."""
        resp = test_client.post(
            "/api/templates/nonexistent_clone/clone",
            json={"new_name": "测试"},
        )

        assert resp.status_code == 404

    def test_clone_api_default_name(self, test_client):
        """Clone without new_name should use default."""
        resp = test_client.post(
            "/api/templates/quality_survey/clone",
            json={},
        )

        assert resp.status_code == 200
        data = resp.json()
        # Should have a name
        assert data["name"] is not None


# ---------------------------------------------------------------------------
# Test: Export API Endpoint
# ---------------------------------------------------------------------------


class TestExportApiEndpoint:
    """Tests for GET /api/templates/{template_id}/export endpoint."""

    def test_export_api_returns_json(self, test_client):
        """Export endpoint should return JSON."""
        resp = test_client.get("/api/templates/quality_survey/export")

        assert resp.status_code == 200
        data = resp.json()
        assert "template" in data
        assert data["template"]["id"] == "quality_survey"

    def test_export_api_nonexistent_returns_404(self, test_client):
        """Exporting nonexistent template returns 404."""
        resp = test_client.get("/api/templates/nonexistent_export/export")

        assert resp.status_code == 404

    def test_export_api_includes_version(self, test_client):
        """Exported template should include version."""
        resp = test_client.get("/api/templates/quality_survey/export")
        data = resp.json()

        assert "version" in data["template"]


# ---------------------------------------------------------------------------
# Test: Import API Endpoint
# ---------------------------------------------------------------------------


class TestImportApiEndpoint:
    """Tests for POST /api/templates/import endpoint."""

    def test_import_api_valid_template(self, test_client):
        """Import endpoint should accept valid template."""
        template_json = {
            "id": "api_imported",
            "version": "1.0.0",
            "name": "API导入",
            "description": "测试",
            "topics": [
                {
                    "id": "t1",
                    "name": "主题",
                    "description": "描述",
                    "initial_question": "问题?",
                }
            ],
        }

        resp = test_client.post(
            "/api/templates/import",
            json={"template": template_json},
        )

        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "API导入"

    def test_import_api_invalid_returns_400(self, test_client):
        """Import with invalid template returns 400."""
        resp = test_client.post(
            "/api/templates/import",
            json={
                "template": {
                    "id": "invalid",
                    "name": "缺少字段",
                }
            },
        )

        assert resp.status_code == 400

    def test_import_api_validates_topic_schema(self, test_client):
        """Import should validate topic schema."""
        template_json = {
            "id": "bad_topics",
            "version": "1.0.0",
            "name": "错误的主题",
            "description": "测试",
            "topics": [
                {"id": "t1"},  # Missing required fields
            ],
        }

        resp = test_client.post(
            "/api/templates/import",
            json={"template": template_json},
        )

        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Test: List Templates Includes Version
# ---------------------------------------------------------------------------


class TestListTemplatesApi:
    """Tests for GET /api/templates endpoint with version support."""

    def test_list_api_includes_version(self, test_client):
        """List templates should show version."""
        resp = test_client.get("/api/templates")

        assert resp.status_code == 200
        data = resp.json()
        assert len(data) > 0

        # Each template summary should have version
        for summary in data:
            assert "version" in summary

    def test_get_template_api_includes_version(self, test_client):
        """Get single template should include version."""
        resp = test_client.get("/api/templates/quality_survey")

        assert resp.status_code == 200
        data = resp.json()
        assert "version" in data
