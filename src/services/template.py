"""Interview template management service."""

import json
from pathlib import Path
from typing import Any

# Default templates
DEFAULT_TEMPLATES = {
    "quality_survey": {
        "id": "quality_survey",
        "version": "1.0.0",
        "name": "质量满意度调查",
        "description": "针对产品和服务质量的满意度访谈",
        "domain_context": """
质量满意度评估维度：
1. 产品功能：产品功能是否满足需求
2. 产品性能：响应速度、稳定性等
3. 服务态度：客服响应速度、态度
4. 解决问题能力：能否有效解决问题
5. 整体满意度：综合评价
""",
        "topics": [
            {
                "id": "product_quality",
                "name": "产品质量",
                "description": "对产品质量的评价",
                "initial_question": "请您对产品的整体质量做一个评价？",
            },
            {
                "id": "service_quality",
                "name": "服务质量",
                "description": "对服务体验的评价",
                "initial_question": "您对我们服务的整体体验如何？",
            },
            {
                "id": "improvement",
                "name": "改进建议",
                "description": "需要改进的地方",
                "initial_question": "您认为我们在哪些方面还有提升空间？",
            },
        ],
    },
    "customer_feedback": {
        "id": "customer_feedback",
        "version": "1.0.0",
        "name": "客户反馈访谈",
        "description": "收集客户对产品和服务的反馈",
        "domain_context": """
客户反馈评估维度：
1. 产品体验：使用感受、易用性
2. 服务体验：响应速度、解决问题
3. 竞品对比：与其他供应商的比较
4. 建议与期望：期望改进的方向
""",
        "topics": [
            {
                "id": "product_experience",
                "name": "产品体验",
                "description": "产品使用感受",
                "initial_question": "您对我们产品的使用体验如何？",
            },
            {
                "id": "service_experience",
                "name": "服务体验",
                "description": "服务感受",
                "initial_question": "您对我们服务的体验如何？",
            },
            {
                "id": "suggestions",
                "name": "建议",
                "description": "改进建议",
                "initial_question": "您有哪些具体的改进建议？",
            },
        ],
    },
}


class TemplateManager:
    """Manager for interview templates."""

    def __init__(self, templates_dir: str | None = None) -> None:
        """Initialize template manager.

        Args:
            templates_dir: Directory to store custom templates

        """
        if templates_dir:
            self.templates_dir = Path(templates_dir)
        else:
            # Default to project templates directory
            self.templates_dir = Path(__file__).parent.parent.parent / "templates"

        self.templates_dir.mkdir(exist_ok=True)

    def get_template(self, template_id: str) -> dict[str, Any]:
        """Get interview template by ID.

        Args:
            template_id: Template ID

        Returns:
            Template dictionary

        """
        # Try custom templates first
        template_file = self.templates_dir / f"{template_id}.json"
        if template_file.exists():
            with open(template_file, encoding="utf-8") as f:
                return json.load(f)

        # Fall back to default templates
        return DEFAULT_TEMPLATES.get(template_id, DEFAULT_TEMPLATES["quality_survey"])

    def list_templates(self) -> list[dict[str, Any]]:
        """List all available templates.

        Returns:
            List of template summaries

        """
        templates = []

        # Add default templates
        for template_id, template in DEFAULT_TEMPLATES.items():
            templates.append(
                {
                    "id": template_id,
                    "version": template.get("version", "1.0.0"),
                    "name": template["name"],
                    "description": template["description"],
                    "is_default": True,
                }
            )

        # Add custom templates
        for file in self.templates_dir.glob("*.json"):
            template_id = file.stem
            if template_id not in DEFAULT_TEMPLATES:
                try:
                    with open(file, encoding="utf-8") as f:
                        template = json.load(f)
                        templates.append(
                            {
                                "id": template_id,
                                "version": template.get("version", "1.0.0"),
                                "name": template.get("name", template_id),
                                "description": template.get("description", ""),
                                "is_default": False,
                            }
                        )
                except Exception:
                    pass

        return templates

    def save_template(self, template_id: str, template: dict[str, Any]) -> str:
        """Save custom template.

        Args:
            template_id: Template ID
            template: Template data

        Returns:
            Path to saved template

        """
        template_file = self.templates_dir / f"{template_id}.json"

        with open(template_file, "w", encoding="utf-8") as f:
            json.dump(template, f, ensure_ascii=False, indent=2)

        return str(template_file)

    def delete_template(self, template_id: str) -> bool:
        """Delete custom template.

        Args:
            template_id: Template ID

        Returns:
            True if deleted, False if not found or is default

        """
        if template_id in DEFAULT_TEMPLATES:
            return False

        template_file = self.templates_dir / f"{template_id}.json"
        if template_file.exists():
            template_file.unlink()
            return True

        return False

    def create_template(
        self,
        name: str,
        description: str,
        topics: list[dict[str, Any]],
        domain_context: str = "",
    ) -> dict[str, Any]:
        """Create a new template.

        Args:
            name: Template name
            description: Template description
            topics: List of topics with questions
            domain_context: Domain knowledge context

        Returns:
            Created template

        """
        import uuid

        template_id = f"custom_{uuid.uuid4().hex[:8]}"

        template = {
            "id": template_id,
            "version": "1.0.0",
            "name": name,
            "description": description,
            "domain_context": domain_context,
            "topics": topics,
        }

        self.save_template(template_id, template)

        return template

    def _increment_version(self, version: str) -> str:
        """Increment version number (patch level).

        Args:
            version: Current version string (e.g., "1.0.0")

        Returns:
            Incremented version string

        """
        parts = version.split(".")
        if len(parts) == 3:
            patch = int(parts[2]) + 1
            return f"{parts[0]}.{parts[1]}.{patch}"
        return "1.0.1"

    def _validate_version_format(self, version: str) -> bool:
        """Validate version format (semver: major.minor.patch).

        Args:
            version: Version string to validate

        Returns:
            True if valid, False otherwise

        """
        parts = version.split(".")
        if len(parts) != 3:
            return False
        try:
            int(parts[0])
            int(parts[1])
            int(parts[2])
            return True
        except ValueError:
            return False

    def _validate_template_schema(self, template: dict[str, Any]) -> None:
        """Validate template schema.

        Args:
            template: Template dictionary to validate

        Raises:
            ValueError: If validation fails

        """
        # Required fields
        required_fields = ["id", "name", "description", "topics"]
        for field in required_fields:
            if field not in template:
                raise ValueError(f"Missing required field: {field}")

        # Validate version format
        if "version" in template and not self._validate_version_format(template["version"]):
            raise ValueError(
                f"Invalid version format: {template['version']}. Expected format: major.minor.patch (e.g., 1.0.0)"
            )

        # Validate topics
        if not isinstance(template["topics"], list):
            raise ValueError("topics must be a list")

        required_topic_fields = ["id", "name", "description", "initial_question"]
        for i, topic in enumerate(template["topics"]):
            if not isinstance(topic, dict):
                raise ValueError(f"Topic {i} must be a dictionary")
            for field in required_topic_fields:
                if field not in topic:
                    raise ValueError(f"Topic {i} missing required field: {field}")

    def clone_template(
        self,
        template_id: str,
        new_name: str | None = None,
    ) -> dict[str, Any] | None:
        """Clone a template with new ID and incremented version.

        Args:
            template_id: Template ID to clone
            new_name: New name for cloned template (optional)

        Returns:
            Cloned template dictionary, or None if source not found

        """
        import uuid

        # Check if template exists (not just fallback)
        if not self._template_exists(template_id):
            return None

        # Get source template
        source = self.get_template(template_id)

        # Generate new ID with clone prefix
        clone_id = f"clone_{uuid.uuid4().hex[:8]}"

        # Determine new name
        cloned_name = new_name or f"{source['name']} (克隆)"

        # Increment version
        source_version = source.get("version", "1.0.0")
        new_version = self._increment_version(source_version)

        # Create cloned template
        cloned = {
            "id": clone_id,
            "version": new_version,
            "name": cloned_name,
            "description": source.get("description", ""),
            "domain_context": source.get("domain_context", ""),
            "topics": source.get("topics", []),
        }

        self.save_template(clone_id, cloned)
        return cloned

    def export_template(self, template_id: str) -> str | None:
        """Export template as JSON string.

        Args:
            template_id: Template ID to export

        Returns:
            JSON string of template, or None if not found

        """
        # Check if template exists (not just fallback)
        if not self._template_exists(template_id):
            return None

        template = self.get_template(template_id)

        # Ensure version is included
        if "version" not in template:
            template["version"] = "1.0.0"

        return json.dumps(template, ensure_ascii=False, indent=2)

    def import_template(self, template_json: dict[str, Any]) -> dict[str, Any]:
        """Import template from JSON, validating schema.

        Args:
            template_json: Template dictionary to import

        Returns:
            Imported template

        Raises:
            ValueError: If validation fails

        """
        import uuid

        # Validate schema
        self._validate_template_schema(template_json)

        # Handle ID conflicts - generate new ID if exists
        template_id = template_json.get("id", "")
        if template_id in DEFAULT_TEMPLATES or self._template_file_exists(template_id):
            template_id = f"imported_{uuid.uuid4().hex[:8]}"

        # Ensure version
        if "version" not in template_json:
            template_json["version"] = "1.0.0"

        # Save with potentially new ID
        template_json["id"] = template_id
        self.save_template(template_id, template_json)

        return template_json

    def _template_file_exists(self, template_id: str) -> bool:
        """Check if template file exists.

        Args:
            template_id: Template ID to check

        Returns:
            True if file exists, False otherwise

        """
        template_file = self.templates_dir / f"{template_id}.json"
        return template_file.exists()

    def _template_exists(self, template_id: str) -> bool:
        """Check if template actually exists (not just fallback).

        Args:
            template_id: Template ID to check

        Returns:
            True if template exists in defaults or custom files

        """
        # Check default templates
        if template_id in DEFAULT_TEMPLATES:
            return True

        # Check custom templates
        return self._template_file_exists(template_id)


# Singleton instance
_template_manager: TemplateManager | None = None


def get_template_manager() -> TemplateManager:
    """Get singleton template manager instance."""
    global _template_manager
    if _template_manager is None:
        _template_manager = TemplateManager()
    return _template_manager
