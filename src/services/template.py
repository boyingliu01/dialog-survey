"""
Interview template management service.
"""

import json
import os
from typing import List, Dict, Any, Optional
from pathlib import Path


# Default templates
DEFAULT_TEMPLATES = {
    "quality_survey": {
        "id": "quality_survey",
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

    def __init__(self, templates_dir: Optional[str] = None):
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

    def get_template(self, template_id: str) -> Dict[str, Any]:
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

    def list_templates(self) -> List[Dict[str, Any]]:
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
                                "name": template.get("name", template_id),
                                "description": template.get("description", ""),
                                "is_default": False,
                            }
                        )
                except Exception:
                    pass

        return templates

    def save_template(self, template_id: str, template: Dict[str, Any]) -> str:
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
        topics: List[Dict[str, Any]],
        domain_context: str = "",
    ) -> Dict[str, Any]:
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
            "name": name,
            "description": description,
            "domain_context": domain_context,
            "topics": topics,
        }

        self.save_template(template_id, template)

        return template


# Singleton instance
_template_manager: Optional[TemplateManager] = None


def get_template_manager() -> TemplateManager:
    """Get singleton template manager instance."""
    global _template_manager
    if _template_manager is None:
        _template_manager = TemplateManager()
    return _template_manager
