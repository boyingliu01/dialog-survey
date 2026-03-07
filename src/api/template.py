"""
Template API endpoints.
"""

from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any
from pydantic import BaseModel

from src.services.template import TemplateManager, get_template_manager

router = APIRouter()


class TopicModel(BaseModel):
    """Topic model."""

    id: str
    name: str
    description: str
    initial_question: str


class CreateTemplateRequest(BaseModel):
    """Request model for creating template."""

    name: str
    description: str
    topics: List[TopicModel]
    domain_context: str = ""


@router.get("/templates", response_model=List[Dict[str, Any]])
def list_templates():
    """List all available templates.

    Returns:
        List of template summaries
    """
    manager = get_template_manager()
    return manager.list_templates()


@router.get("/templates/{template_id}")
def get_template(template_id: str):
    """Get template by ID.

    Args:
        template_id: Template ID

    Returns:
        Template data
    """
    manager = get_template_manager()
    return manager.get_template(template_id)


@router.post("/templates")
def create_template(request: CreateTemplateRequest):
    """Create a new template.

    Args:
        request: Template creation request

    Returns:
        Created template
    """
    manager = get_template_manager()

    template = manager.create_template(
        name=request.name,
        description=request.description,
        topics=[t.dict() for t in request.topics],
        domain_context=request.domain_context,
    )

    return template


@router.delete("/templates/{template_id}")
def delete_template(template_id: str):
    """Delete custom template.

    Args:
        template_id: Template ID

    Returns:
        Success message
    """
    manager = get_template_manager()

    success = manager.delete_template(template_id)

    if not success:
        raise HTTPException(status_code=400, detail="Cannot delete default templates")

    return {"message": "Template deleted successfully"}
