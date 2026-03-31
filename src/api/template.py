"""Template API endpoints."""

import json
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src.services.template import get_template_manager

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
    topics: list[TopicModel]
    domain_context: str = ""


class CloneTemplateRequest(BaseModel):
    """Request model for cloning template."""

    new_name: str | None = None


class ImportTemplateRequest(BaseModel):
    """Request model for importing template."""

    template: dict[str, Any]


@router.get("/templates", response_model=list[dict[str, Any]])
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
        topics=[t.model_dump() for t in request.topics],
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


@router.post("/templates/{template_id}/clone")
def clone_template(template_id: str, request: CloneTemplateRequest | None = None):
    """Clone a template.

    Args:
        template_id: Template ID to clone
        request: Clone request with optional new name

    Returns:
        Cloned template

    Raises:
        HTTPException: 404 if template not found

    """
    manager = get_template_manager()

    new_name = request.new_name if request else None
    cloned = manager.clone_template(template_id, new_name)

    if cloned is None:
        raise HTTPException(status_code=404, detail="Template not found")

    return cloned


@router.get("/templates/{template_id}/export")
def export_template(template_id: str):
    """Export template as JSON.

    Args:
        template_id: Template ID to export

    Returns:
        Exported template as JSON object

    Raises:
        HTTPException: 404 if template not found

    """
    manager = get_template_manager()

    exported = manager.export_template(template_id)

    if exported is None:
        raise HTTPException(status_code=404, detail="Template not found")

    # Parse JSON to return as object
    template_data = json.loads(exported)

    return {"template": template_data}


@router.post("/templates/import")
def import_template(request: ImportTemplateRequest):
    """Import template from JSON.

    Args:
        request: Import request with template data

    Returns:
        Imported template

    Raises:
        HTTPException: 400 if template validation fails

    """
    manager = get_template_manager()

    try:
        imported = manager.import_template(request.template)
        return imported
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
